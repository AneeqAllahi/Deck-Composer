import app from "./app";
import { logger } from "./lib/logger";
import { ensurePostgresExtensions } from "./lib/dbMigrate";
import { backfillContextualSummaries } from "./lib/ingestion";

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
  })();
});
