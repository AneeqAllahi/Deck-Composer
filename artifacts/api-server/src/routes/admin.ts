import { Router, type Request, type Response, type NextFunction } from "express";
import {
  startReembedJob,
  getJob,
  listJobs,
} from "../lib/reembedJobs.js";
import { countPendingBackfillDocs } from "../lib/ingestion.js";

const router = Router();

/**
 * Admin endpoints are gated by an optional X-Admin-Token header that must match
 * the RAG_ADMIN_TOKEN env var. If RAG_ADMIN_TOKEN is unset, admin endpoints are
 * disabled entirely (returning 404) — this matches the rest of the app's no-auth
 * baseline while still preventing accidental triggers from any caller.
 */
function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.RAG_ADMIN_TOKEN;
  if (!expected) {
    res.status(404).json({ error: "Admin endpoints are disabled (set RAG_ADMIN_TOKEN to enable)" });
    return;
  }
  const provided = req.header("x-admin-token") ?? "";
  if (provided !== expected) {
    res.status(401).json({ error: "Invalid or missing X-Admin-Token header" });
    return;
  }
  next();
}

router.use("/admin/rag", adminGuard);

/**
 * POST /api/admin/rag/reembed
 *
 * Kicks off the full re-embed/backfill loop in the background and returns a
 * job id immediately. If a job is already running, returns the existing job
 * with status 200 (so admins polling the trigger always have something to
 * watch); the body's `alreadyRunning` flag tells them which case happened.
 *
 * Body:
 *   - maxDocs?: number — optional cap; defaults to draining the backlog.
 *   - force?:  boolean — when true, every chunk is re-embedded regardless of
 *     the embedding_model staleness check. Use this after a context-model
 *     upgrade (operators have changed RAG_CONTEXT_MODEL) since context-summary
 *     freshness isn't tracked at the row level.
 */
router.post("/admin/rag/reembed", async (req, res) => {
  try {
    const maxDocs = typeof req.body?.maxDocs === "number" && req.body.maxDocs > 0
      ? Math.floor(req.body.maxDocs)
      : undefined;
    const force = req.body?.force === true;
    const { job, alreadyRunning } = startReembedJob({ maxDocs, force });
    return res.status(alreadyRunning ? 200 : 202).json({ jobId: job.id, alreadyRunning, job });
  } catch (err) {
    req.log.error({ err }, "Failed to start re-embed job");
    return res.status(500).json({ error: "Failed to start re-embed job" });
  }
});

/**
 * GET /api/admin/rag/reembed
 *
 * Lists all re-embed jobs the server currently knows about (most recent first),
 * plus the current pending counts so admins can decide whether to trigger.
 */
router.get("/admin/rag/reembed", async (req, res) => {
  try {
    const pending = await countPendingBackfillDocs();
    return res.json({ pending, jobs: listJobs() });
  } catch (err) {
    req.log.error({ err }, "Failed to list re-embed jobs");
    return res.status(500).json({ error: "Failed to list re-embed jobs" });
  }
});

/**
 * GET /api/admin/rag/reembed/:jobId
 *
 * Returns progress for a specific job. Returns 404 if the job is unknown
 * (e.g. evicted from the bounded in-memory registry, or the server restarted).
 */
router.get("/admin/rag/reembed/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(job);
});

export default router;
