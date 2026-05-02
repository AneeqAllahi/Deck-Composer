import { db } from "@workspace/db";
import { corpusChunksTable, corpusDocumentsTable, styleDnaTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  chunkPdfText,
  chunksFromPptxSlides,
  extractPdfText,
  extractPptxStructured,
  type RawChunk,
} from "./chunker.js";
import { generateEmbeddingsBatch, EMBED_MODEL } from "./embeddings.js";
import { contextualizeChunks, summarizeDocument } from "./contextualizer.js";
import { extractStyleDnaFromText } from "./styleDna.js";
import { logger } from "./logger.js";

const INGEST_BATCH = 20;

function generateChunkId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export type IngestionParams = {
  documentId: string;
  filename: string;
  fileType: "pdf" | "pptx";
  kind: string;
  projectId: string | null;
  buffer: Buffer;
};

async function setStatus(documentId: string, status: string): Promise<void> {
  await db
    .update(corpusDocumentsTable)
    .set({ status })
    .where(eq(corpusDocumentsTable.id, documentId));
}

export async function ingestDocument(params: IngestionParams): Promise<void> {
  const { documentId, filename, fileType, kind, projectId, buffer } = params;
  try {
    let rawText = "";
    let chunks: RawChunk[] = [];
    if (fileType === "pdf") {
      rawText = await extractPdfText(buffer);
      chunks = chunkPdfText(rawText);
    } else {
      const slides = await extractPptxStructured(buffer);
      rawText = slides
        .map((s) => `${s.title ?? ""}\n${s.body}\n${s.notes}`.trim())
        .filter(Boolean)
        .join("\n\n");
      chunks = chunksFromPptxSlides(slides);
    }

    await db
      .update(corpusDocumentsTable)
      .set({ rawText: rawText.slice(0, 500_000), status: "chunked" })
      .where(eq(corpusDocumentsTable.id, documentId));

    if (chunks.length === 0) {
      await db
        .update(corpusDocumentsTable)
        .set({ chunkCount: 0, status: "ready" })
        .where(eq(corpusDocumentsTable.id, documentId));
      logger.info({ documentId }, "Document had no extractable chunks");
      return;
    }

    const docSummary = await summarizeDocument(filename, rawText);
    logger.info(
      { documentId, chunks: chunks.length, summaryLen: docSummary.length },
      "Document summarized; starting contextualization",
    );

    const summaries = await contextualizeChunks(
      chunks.map((c) => c.text),
      filename,
      docSummary,
    );

    await setStatus(documentId, "embedded");

    let embedded = 0;
    for (let i = 0; i < chunks.length; i += INGEST_BATCH) {
      const batch = chunks.slice(i, i + INGEST_BATCH);
      const summariesBatch = summaries.slice(i, i + INGEST_BATCH);
      const embedTexts = batch.map((c, j) =>
        summariesBatch[j] ? `${summariesBatch[j]}\n\n${c.text}` : c.text,
      );
      const embeddings = await generateEmbeddingsBatch(embedTexts);
      const rows = batch.map((c, j) => ({
        id: generateChunkId(),
        documentId,
        chunkText: c.text,
        contextualSummary: summariesBatch[j] ?? null,
        metadata: c.metadata,
        embedding: embeddings[j] ?? undefined,
        embeddingModel: EMBED_MODEL,
        slideIndex: c.metadata.sourceSlideIndex ?? null,
      }));
      await db.insert(corpusChunksTable).values(rows);
      embedded += rows.length;
    }

    await db
      .update(corpusDocumentsTable)
      .set({ chunkCount: embedded, status: "ready" })
      .where(eq(corpusDocumentsTable.id, documentId));

    if (kind === "brand-guideline" && projectId) {
      try {
        const styleDna = await extractStyleDnaFromText(filename, rawText);
        if (styleDna) {
          await db
            .insert(styleDnaTable)
            .values({
              projectId,
              data: styleDna,
              sourceDocumentId: documentId,
            })
            .onConflictDoUpdate({
              target: styleDnaTable.projectId,
              set: {
                data: styleDna,
                sourceDocumentId: documentId,
                extractedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          logger.info({ projectId, documentId }, "Style DNA extracted and stored");
        }
      } catch (err) {
        logger.warn({ err, documentId }, "Style DNA extraction failed (document still indexed)");
      }
    }

    logger.info({ documentId, chunks: embedded }, "Document ingestion complete");
  } catch (err) {
    logger.error({ err, documentId }, "Document ingestion failed");
    try {
      await setStatus(documentId, "error");
    } catch {
      // ignore
    }
  }
}

const BACKFILL_BATCH_SIZE = 200;
const BACKFILL_MAX_DOCS_PER_RUN = Number(process.env.RAG_BACKFILL_MAX_DOCS_PER_RUN ?? "200");

async function reembedChunkRows(
  docId: string,
  filename: string,
  chunkRows: { id: string; chunk_text: string }[],
): Promise<void> {
  const docFullText = chunkRows.map((c) => c.chunk_text).join("\n\n");
  const summary = await summarizeDocument(filename, docFullText);
  const summaries = await contextualizeChunks(chunkRows.map((c) => c.chunk_text), filename, summary);
  const embedTexts = chunkRows.map((c, i) =>
    summaries[i] ? `${summaries[i]}\n\n${c.chunk_text}` : c.chunk_text,
  );
  const embeddings = await generateEmbeddingsBatch(embedTexts);
  for (let i = 0; i < chunkRows.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;
    const literal = `[${emb.join(",")}]`;
    await db.execute(sql`
      UPDATE corpus_chunks
      SET contextual_summary = ${summaries[i] ?? null},
          embedding = ${literal}::vector,
          embedding_model = ${EMBED_MODEL}
      WHERE id = ${chunkRows[i].id}
    `);
  }
  logger.info({ docId, chunks: chunkRows.length }, "Backfill: document re-embedded");
}

export async function backfillContextualSummaries(): Promise<void> {
  try {
    let totalDocsProcessed = 0;
    let totalChunksProcessed = 0;
    while (totalDocsProcessed < BACKFILL_MAX_DOCS_PER_RUN) {
      const r = await db.execute(sql`
        SELECT cc.id, cc.chunk_text, cc.metadata, cd.id AS doc_id, cd.filename
        FROM corpus_chunks cc
        JOIN corpus_documents cd ON cc.document_id = cd.id
        WHERE cc.contextual_summary IS NULL
           OR cc.embedding IS NULL
           OR cc.embedding_model IS NULL
           OR cc.embedding_model <> ${EMBED_MODEL}
        LIMIT ${BACKFILL_BATCH_SIZE}
      `);
      const rows = r.rows as { id: string; chunk_text: string; metadata: unknown; doc_id: string; filename: string }[];
      if (rows.length === 0) {
        if (totalChunksProcessed === 0) logger.info("Backfill: nothing to do");
        else logger.info({ docs: totalDocsProcessed, chunks: totalChunksProcessed }, "Backfill: complete");
        return;
      }
      logger.info({ batch: rows.length, soFarDocs: totalDocsProcessed }, "Backfill: re-processing batch");
      const byDoc = new Map<string, { id: string; chunk_text: string; filename: string }[]>();
      for (const row of rows) {
        const arr = byDoc.get(row.doc_id) ?? [];
        arr.push({ id: row.id, chunk_text: row.chunk_text, filename: row.filename });
        byDoc.set(row.doc_id, arr);
      }
      for (const [docId, chunkRows] of byDoc.entries()) {
        if (totalDocsProcessed >= BACKFILL_MAX_DOCS_PER_RUN) {
          logger.info({ cap: BACKFILL_MAX_DOCS_PER_RUN }, "Backfill: per-run cap reached, will resume next run");
          return;
        }
        await reembedChunkRows(docId, chunkRows[0].filename, chunkRows);
        totalDocsProcessed += 1;
        totalChunksProcessed += chunkRows.length;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Backfill failed");
  }
}

export async function reprocessDocument(documentId: string): Promise<void> {
  try {
    await setStatus(documentId, "processing");
    const r = await db.execute(sql`
      SELECT cc.id, cc.chunk_text, cd.filename
      FROM corpus_chunks cc
      JOIN corpus_documents cd ON cc.document_id = cd.id
      WHERE cc.document_id = ${documentId}
      ORDER BY cc.created_at ASC
    `);
    const chunkRows = r.rows as { id: string; chunk_text: string; filename: string }[];
    if (chunkRows.length === 0) {
      logger.warn({ documentId }, "Reprocess: no chunks for document");
      await setStatus(documentId, "ready");
      return;
    }
    await reembedChunkRows(documentId, chunkRows[0].filename, chunkRows);
    await setStatus(documentId, "ready");
    logger.info({ documentId, chunks: chunkRows.length }, "Reprocess: document complete");
  } catch (err) {
    logger.error({ err, documentId }, "Reprocess: failed");
    try {
      await setStatus(documentId, "error");
    } catch {
      // ignore
    }
  }
}
