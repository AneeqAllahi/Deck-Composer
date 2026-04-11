import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "dummy",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const BATCH_SIZE = 20;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: text.slice(0, 8000),
      dimensions: EMBED_DIM,
    });
    return response.data[0].embedding;
  } catch (err) {
    return null;
  }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: batch.map((t) => t.slice(0, 8000)),
        dimensions: EMBED_DIM,
      });
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      results.push(...sorted.map((d) => d.embedding));
    } catch (err) {
      results.push(...batch.map(() => null));
    }
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return results;
}
