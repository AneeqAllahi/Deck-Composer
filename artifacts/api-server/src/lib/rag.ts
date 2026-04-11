import { db } from "@workspace/db";
import { corpusChunksTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function retrieveRelevantChunks(query: string, topK = 10): Promise<string[]> {
  if (!query.trim()) return [];

  try {
    const searchTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 20)
      .join(" | ");

    if (!searchTerms) return [];

    const results = await db.execute(sql`
      SELECT chunk_text, ts_rank(to_tsvector('english', chunk_text), to_tsquery('english', ${searchTerms})) as rank
      FROM corpus_chunks
      WHERE to_tsvector('english', chunk_text) @@ to_tsquery('english', ${searchTerms})
      ORDER BY rank DESC
      LIMIT ${topK}
    `);

    return (results.rows as { chunk_text: string }[]).map((r) => r.chunk_text);
  } catch (err) {
    console.error("RAG retrieval error:", err);
    return [];
  }
}

export function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  if (words.length === 0) return [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
    if (i + chunkSize >= words.length) break;
  }

  return chunks;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
