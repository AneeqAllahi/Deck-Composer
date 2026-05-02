import { randomUUID } from "crypto";
import { backfillContextualSummaries, type BackfillProgress } from "./ingestion.js";
import { logger } from "./logger.js";

export type ReembedJobStatus = "running" | "done" | "failed";

export type ReembedJob = {
  id: string;
  status: ReembedJobStatus;
  startedAt: string;
  finishedAt: string | null;
  docsDone: number;
  totalDocs: number;
  chunksDone: number;
  totalChunks: number;
  error: string | null;
};

/**
 * In-memory registry of admin-triggered re-embed jobs. Survives only for the
 * lifetime of the api-server process — admin can re-invoke if the server
 * restarts; the underlying backfill is idempotent (it picks up wherever it
 * left off based on rows whose embedding_model doesn't match EMBED_MODEL).
 *
 * To keep memory bounded we cap the registry at MAX_JOBS entries; oldest
 * finished jobs are evicted first.
 */
const MAX_JOBS = 50;
const jobs = new Map<string, ReembedJob>();
let activeJobId: string | null = null;

function evictIfNeeded(): void {
  if (jobs.size <= MAX_JOBS) return;
  // Evict oldest finished job first. If everything is still running (very unusual)
  // we fall back to oldest-by-startedAt.
  const finished = Array.from(jobs.values())
    .filter((j) => j.status !== "running")
    .sort((a, b) => (a.finishedAt ?? a.startedAt).localeCompare(b.finishedAt ?? b.startedAt));
  const victim = finished[0] ?? Array.from(jobs.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
  if (victim) jobs.delete(victim.id);
}

export function getJob(jobId: string): ReembedJob | null {
  return jobs.get(jobId) ?? null;
}

export function listJobs(): ReembedJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function activeJob(): ReembedJob | null {
  return activeJobId ? jobs.get(activeJobId) ?? null : null;
}

/**
 * Start a re-embed job in the background and return immediately. Returns null
 * (without starting a new job) if one is already running — admins should poll
 * the existing job instead. If `force` is true, an existing running job is
 * NOT cancelled (we have no preemption) but a parallel job is still refused
 * since concurrent backfills would compete for the same chunk rows.
 */
export function startReembedJob(opts: { maxDocs?: number } = {}): {
  job: ReembedJob;
  alreadyRunning: boolean;
} {
  const existing = activeJob();
  if (existing && existing.status === "running") {
    return { job: existing, alreadyRunning: true };
  }

  const job: ReembedJob = {
    id: randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    docsDone: 0,
    totalDocs: 0,
    chunksDone: 0,
    totalChunks: 0,
    error: null,
  };
  jobs.set(job.id, job);
  activeJobId = job.id;
  evictIfNeeded();

  void (async () => {
    try {
      const onProgress = (p: BackfillProgress): void => {
        job.docsDone = p.docsDone;
        job.totalDocs = p.totalDocs;
        job.chunksDone = p.chunksDone;
        job.totalChunks = p.totalChunks;
      };
      // Default to draining the whole backlog (Number.MAX_SAFE_INTEGER instead of
      // the boot-time per-run cap) — that's the whole point of the admin endpoint.
      const finalProgress = await backfillContextualSummaries({
        maxDocs: opts.maxDocs ?? Number.MAX_SAFE_INTEGER,
        onProgress,
      });
      job.docsDone = finalProgress.docsDone;
      job.totalDocs = finalProgress.totalDocs;
      job.chunksDone = finalProgress.chunksDone;
      job.totalChunks = finalProgress.totalChunks;
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      logger.info({ jobId: job.id, docsDone: job.docsDone, chunksDone: job.chunksDone }, "Re-embed job complete");
    } catch (err) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id }, "Re-embed job failed");
    } finally {
      if (activeJobId === job.id) activeJobId = null;
    }
  })();

  return { job, alreadyRunning: false };
}
