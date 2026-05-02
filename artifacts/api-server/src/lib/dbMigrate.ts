import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

let initialized = false;

export async function ensurePostgresExtensions(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await db.execute(sql`
      ALTER TABLE corpus_chunks
      ADD COLUMN IF NOT EXISTS tsv tsvector
        GENERATED ALWAYS AS (
          to_tsvector(
            'english',
            coalesce(contextual_summary, '') || ' ' || coalesce(chunk_text, '')
          )
        ) STORED
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS corpus_chunks_tsv_idx
      ON corpus_chunks USING GIN (tsv)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS corpus_chunks_embedding_hnsw_idx
      ON corpus_chunks USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS corpus_chunks_document_id_idx
      ON corpus_chunks (document_id)
    `);

    logger.info("Postgres RAG extensions and indexes ensured");
  } catch (err) {
    logger.warn({ err }, "Failed to ensure RAG indexes (non-fatal)");
  }
}
