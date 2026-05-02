import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { ChunkMetadata, RetrievalEntryChunk } from "@workspace/db";
import { generateEmbedding } from "./embeddings.js";
import { rerank, isRerankerAvailable } from "./reranker.js";
import { logger } from "./logger.js";

const RRF_K = 60;
const HYBRID_CANDIDATES_PER_LANE = 50;

export type RetrieveOptions = {
  query: string;
  projectId?: string | null;
  topK?: number;
  documentKinds?: string[];
};

type DbRow = {
  id: string;
  document_id: string;
  chunk_text: string;
  contextual_summary: string | null;
  metadata: ChunkMetadata | null;
  filename: string;
  document_kind: string;
  rank: number;
  score: number;
};

export async function retrieveExemplars(opts: RetrieveOptions): Promise<RetrievalEntryChunk[]> {
  const { query, projectId, topK = 8, documentKinds } = opts;
  const trimmed = query.trim();
  if (!trimmed) return [];

  const projectFilter = projectId
    ? sql`AND cd.project_id = ${projectId}`
    : sql`AND cd.project_id IS NULL`;
  const kindFilter = documentKinds?.length
    ? sql`AND cd.kind = ANY(${documentKinds}::text[])`
    : sql``;

  // BM25 lane
  const bm25Promise = db
    .execute(
      sql`
        SELECT cc.id, cc.document_id, cc.chunk_text, cc.contextual_summary,
               cc.metadata, cd.filename, cd.kind AS document_kind,
               row_number() OVER (ORDER BY ts_rank_cd(cc.tsv, plainto_tsquery('english', ${trimmed})) DESC) AS rank,
               ts_rank_cd(cc.tsv, plainto_tsquery('english', ${trimmed})) AS score
        FROM corpus_chunks cc
        JOIN corpus_documents cd ON cc.document_id = cd.id
        WHERE cc.tsv @@ plainto_tsquery('english', ${trimmed})
          ${projectFilter}
          ${kindFilter}
        ORDER BY score DESC
        LIMIT ${HYBRID_CANDIDATES_PER_LANE}
      `,
    )
    .then((r) => r.rows as DbRow[])
    .catch((err) => {
      logger.warn({ err }, "BM25 lane failed");
      return [] as DbRow[];
    });

  // Vector lane
  const embedding = await generateEmbedding(trimmed);
  let vectorRows: DbRow[] = [];
  if (embedding) {
    const literal = `[${embedding.join(",")}]`;
    try {
      const r = await db.execute(
        sql`
          SELECT cc.id, cc.document_id, cc.chunk_text, cc.contextual_summary,
                 cc.metadata, cd.filename, cd.kind AS document_kind,
                 row_number() OVER (ORDER BY cc.embedding <=> ${literal}::vector ASC) AS rank,
                 1 - (cc.embedding <=> ${literal}::vector) AS score
          FROM corpus_chunks cc
          JOIN corpus_documents cd ON cc.document_id = cd.id
          WHERE cc.embedding IS NOT NULL
            ${projectFilter}
            ${kindFilter}
          ORDER BY cc.embedding <=> ${literal}::vector ASC
          LIMIT ${HYBRID_CANDIDATES_PER_LANE}
        `,
      );
      vectorRows = r.rows as DbRow[];
    } catch (err) {
      logger.warn({ err }, "Vector lane failed");
    }
  }

  const bm25Rows = await bm25Promise;

  // Reciprocal Rank Fusion
  const fused = new Map<
    string,
    { row: DbRow; rrf: number; bm25Rank?: number; vectorRank?: number }
  >();
  for (const r of bm25Rows) {
    const rank = Number(r.rank);
    const cur = fused.get(r.id);
    const score = 1 / (RRF_K + rank);
    if (cur) {
      cur.rrf += score;
      cur.bm25Rank = rank;
    } else {
      fused.set(r.id, { row: r, rrf: score, bm25Rank: rank });
    }
  }
  for (const r of vectorRows) {
    const rank = Number(r.rank);
    const cur = fused.get(r.id);
    const score = 1 / (RRF_K + rank);
    if (cur) {
      cur.rrf += score;
      cur.vectorRank = rank;
    } else {
      fused.set(r.id, { row: r, rrf: score, vectorRank: rank });
    }
  }

  let candidates = Array.from(fused.values()).sort((a, b) => b.rrf - a.rrf);

  // ILIKE fallback when both lanes empty
  if (candidates.length === 0) {
    try {
      const terms = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2)
        .slice(0, 12);
      if (terms.length > 0) {
        const likePattern = `%${terms.join("%")}%`;
        const r = await db.execute(
          sql`
            SELECT cc.id, cc.document_id, cc.chunk_text, cc.contextual_summary,
                   cc.metadata, cd.filename, cd.kind AS document_kind,
                   1 AS rank, 0::float AS score
            FROM corpus_chunks cc
            JOIN corpus_documents cd ON cc.document_id = cd.id
            WHERE cc.chunk_text ILIKE ${likePattern}
              ${projectFilter}
              ${kindFilter}
            LIMIT ${topK}
          `,
        );
        candidates = (r.rows as DbRow[]).map((row, i) => ({
          row,
          rrf: 1 / (RRF_K + i + 1),
          bm25Rank: i + 1,
        }));
      }
    } catch (err) {
      logger.warn({ err }, "ILIKE fallback failed");
    }
  }

  if (candidates.length === 0) return [];

  // Rerank top candidates if available
  let finalOrder: { id: string; score: number; bm25Rank?: number; vectorRank?: number }[];
  if (isRerankerAvailable() && candidates.length > 1) {
    const cap = Math.min(50, candidates.length);
    const top = candidates.slice(0, cap);
    const reranked = await rerank(
      trimmed,
      top.map((c) => ({
        id: c.row.id,
        text: c.row.contextual_summary
          ? `${c.row.contextual_summary}\n\n${c.row.chunk_text}`
          : c.row.chunk_text,
      })),
      topK,
    );
    if (reranked) {
      const rankByRrf = new Map(top.map((c) => [c.row.id, c]));
      finalOrder = reranked.map((r) => ({
        id: r.id,
        score: r.score,
        bm25Rank: rankByRrf.get(r.id)?.bm25Rank,
        vectorRank: rankByRrf.get(r.id)?.vectorRank,
      }));
    } else {
      finalOrder = candidates.slice(0, topK).map((c) => ({
        id: c.row.id,
        score: c.rrf,
        bm25Rank: c.bm25Rank,
        vectorRank: c.vectorRank,
      }));
    }
  } else {
    finalOrder = candidates.slice(0, topK).map((c) => ({
      id: c.row.id,
      score: c.rrf,
      bm25Rank: c.bm25Rank,
      vectorRank: c.vectorRank,
    }));
  }

  const rowById = new Map(candidates.map((c) => [c.row.id, c.row]));
  const out: RetrievalEntryChunk[] = [];
  for (const ord of finalOrder) {
    const row = rowById.get(ord.id);
    if (!row) continue;
    out.push({
      chunkId: row.id,
      documentId: row.document_id,
      documentName: row.filename,
      score: ord.score,
      bm25Rank: ord.bm25Rank,
      vectorRank: ord.vectorRank,
      text: row.chunk_text,
      contextualSummary: row.contextual_summary,
      metadata: row.metadata,
    });
  }
  return out;
}

export async function countExemplarsForProject(projectId: string | null | undefined): Promise<{
  chunkCount: number;
  documentCount: number;
}> {
  const projectFilter = projectId
    ? sql`AND cd.project_id = ${projectId}`
    : sql`AND cd.project_id IS NULL`;
  try {
    const r = await db.execute(
      sql`
        SELECT
          COUNT(DISTINCT cc.id)::int AS chunk_count,
          COUNT(DISTINCT cd.id)::int AS document_count
        FROM corpus_chunks cc
        JOIN corpus_documents cd ON cc.document_id = cd.id
        WHERE cd.kind = 'exemplar-deck'
          AND cc.embedding IS NOT NULL
          ${projectFilter}
      `,
    );
    const row = (r.rows[0] ?? {}) as { chunk_count?: number; document_count?: number };
    return {
      chunkCount: Number(row.chunk_count ?? 0),
      documentCount: Number(row.document_count ?? 0),
    };
  } catch {
    return { chunkCount: 0, documentCount: 0 };
  }
}
