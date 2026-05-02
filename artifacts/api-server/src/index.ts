import app from "./app";
import { logger } from "./lib/logger";
import { ensurePostgresExtensions } from "./lib/dbMigrate";
import {
  backfillContextualSummaries,
  countPendingBackfillDocs,
} from "./lib/ingestion";
import { startReembedJob } from "./lib/reembedJobs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Optional cron-style nightly backfill. Opt-in via RAG_BACKFILL_NIGHTLY=true so
 * dev/test environments aren't surprised by a daily long-running job. When
 * enabled, every 24h we check countPendingBackfillDocs() and, if there's work,
 * kick off an admin-style re-embed job (drains the full backlog). The job
 * registry tracks progress just like a manual POST would.
 */
function scheduleNightlyBackfill(): void {
  if (process.env.RAG_BACKFILL_NIGHTLY !== "true") return;
  logger.info({ intervalMs: NIGHTLY_INTERVAL_MS }, "Nightly RAG backfill scheduled");
  const tick = async (): Promise<void> => {
    try {
      const pending = await countPendingBackfillDocs();
      if (pending.docs === 0) {
        logger.info("Nightly RAG backfill: nothing to do");
        return;
      }
      const { job, alreadyRunning } = startReembedJob();
      logger.info(
        { jobId: job.id, alreadyRunning, pendingDocs: pending.docs, pendingChunks: pending.chunks },
        alreadyRunning
          ? "Nightly RAG backfill: job already running, skipping"
          : "Nightly RAG backfill: started",
      );
    } catch (err) {
      logger.warn({ err }, "Nightly RAG backfill tick failed");
    }
  };
  // Don't fire immediately — boot already runs the capped backfill below.
  const handle = setInterval(() => void tick(), NIGHTLY_INTERVAL_MS);
  // Allow the process to exit even if this timer is the only thing alive.
  if (typeof handle.unref === "function") handle.unref();
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run RAG schema migrations and idempotent backfill in background
  void (async () => {
    await ensurePostgresExtensions();
    if (process.env.RAG_BACKFILL_ON_STARTUP !== "false") {
      try {
        await backfillContextualSummaries();
      } catch (e) {
        logger.warn({ err: e }, "Backfill on startup failed (non-fatal)");
      }
    }
    scheduleNightlyBackfill();
  })();
});
