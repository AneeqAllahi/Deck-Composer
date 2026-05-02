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

    // Base tables (idempotent; safe even when drizzle-kit push has already created them)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS corpus_documents (
        id text PRIMARY KEY,
        filename text NOT NULL,
        file_type text NOT NULL,
        kind text NOT NULL DEFAULT 'exemplar-deck',
        chunk_count integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'processing',
        raw_text text,
        project_id text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS corpus_chunks (
        id text PRIMARY KEY,
        document_id text NOT NULL REFERENCES corpus_documents(id) ON DELETE CASCADE,
        chunk_text text NOT NULL,
        contextual_summary text,
        metadata jsonb,
        embedding vector(1536),
        embedding_model text,
        slide_index integer,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Add columns to corpus_documents and corpus_chunks if they pre-existed without the new fields
    await db.execute(sql`ALTER TABLE corpus_documents ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'exemplar-deck'`);
    await db.execute(sql`ALTER TABLE corpus_documents ADD COLUMN IF NOT EXISTS raw_text text`);
    await db.execute(sql`ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS contextual_summary text`);
    await db.execute(sql`ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS metadata jsonb`);
    await db.execute(sql`ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)`);
    await db.execute(sql`ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS embedding_model text`);
    await db.execute(sql`ALTER TABLE corpus_chunks ADD COLUMN IF NOT EXISTS slide_index integer`);

    // Per-project UI toggle for the new in-deck source-citation footer (Task #9).
    // Default true so existing projects show citations immediately without an extra opt-in.
    await db.execute(
      sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS show_slide_citations boolean NOT NULL DEFAULT true`,
    );

    // New RAG v2 tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS style_dna (
        project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        data jsonb NOT NULL,
        source_document_id text,
        extracted_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deck_generation_log (
        id text PRIMARY KEY,
        deck_id text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        project_id text,
        data jsonb NOT NULL,
        latency_ms integer NOT NULL DEFAULT 0,
        quality_score real,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

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

    // Slide templates (Task #7): user-saved per-slide outlines reusable from
    // the Generate page. Idempotent backfill so deployed/fresh-DB instances
    // get the table even if drizzle-kit push wasn't run.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS slide_templates (
        id text PRIMARY KEY,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        slide_count integer NOT NULL,
        narrative_structure text NOT NULL,
        outlines jsonb NOT NULL,
        project_id text REFERENCES projects(id) ON DELETE CASCADE,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS slide_templates_project_id_idx
      ON slide_templates (project_id)
    `);

    // Visual brand inputs: rendered page images for brand-guideline / exemplar uploads
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS corpus_document_pages (
        id text PRIMARY KEY,
        document_id text NOT NULL REFERENCES corpus_documents(id) ON DELETE CASCADE,
        page_index integer NOT NULL,
        object_path text NOT NULL,
        mime_type text NOT NULL,
        width integer,
        height integer,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS corpus_document_pages_document_id_idx
      ON corpus_document_pages (document_id)
    `);

    logger.info("Postgres RAG extensions and indexes ensured");
  } catch (err) {
    logger.warn({ err }, "Failed to ensure RAG indexes (non-fatal)");
  }
}
