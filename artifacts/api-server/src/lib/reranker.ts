import { logger } from "./logger.js";

const RERANK_PROVIDER = (process.env.RERANKER_PROVIDER ?? "cohere").toLowerCase();
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_MODEL = process.env.COHERE_RERANK_MODEL ?? "rerank-v3.5";

export type RerankCandidate = { id: string; text: string };
export type RerankResult = { id: string; score: number; index: number };

export function isRerankerAvailable(): boolean {
  return RERANK_PROVIDER === "cohere" && !!COHERE_API_KEY;
}

export function rerankerName(): string {
  if (isRerankerAvailable()) return `cohere:${COHERE_MODEL}`;
  return "none";
}

export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  topN = 8,
): Promise<RerankResult[] | null> {
  if (!isRerankerAvailable() || candidates.length === 0) return null;
  try {
    const res = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        query: query.slice(0, 4000),
        documents: candidates.map((c) => c.text.slice(0, 8000)),
        top_n: Math.min(topN, candidates.length),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Cohere rerank failed; falling back to RRF order");
      return null;
    }
    const body = (await res.json()) as { results: { index: number; relevance_score: number }[] };
    return body.results.map((r) => ({
      id: candidates[r.index].id,
      score: r.relevance_score,
      index: r.index,
    }));
  } catch (err) {
    logger.warn({ err }, "Cohere rerank threw; falling back to RRF order");
    return null;
  }
}
