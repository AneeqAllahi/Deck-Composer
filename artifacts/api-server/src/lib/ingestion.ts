import { db } from "@workspace/db";
import {
  corpusChunksTable,
  corpusDocumentsTable,
  corpusDocumentPagesTable,
  styleDnaTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  chunkPdfText,
  chunksFromPptxSlides,
  extractPdfText,
  extractPptxStructured,
  extractPptxThumbnail,
  renderPdfPagesToPng,
  type RawChunk,
} from "./chunker.js";
import { generateEmbeddingsBatch, EMBED_MODEL } from "./embeddings.js";
import { contextualizeChunks, summarizeDocument } from "./contextualizer.js";
import { extractStyleDnaFromTextAndImages, type VisionImageInput } from "./styleDna.js";
import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";

const MAX_PDF_RENDER_PAGES = Number(process.env.RAG_STYLE_DNA_MAX_PDF_PAGES ?? "6");
// Hard cap on combined base64-encoded image bytes sent to the vision model.
// Prevents huge brand-guideline PDFs from blowing up the request payload / token cost.
const MAX_VISION_TOTAL_BYTES = Number(
  process.env.RAG_STYLE_DNA_MAX_VISION_BYTES ?? `${8 * 1024 * 1024}`,
);
const objectStorage = new ObjectStorageService();

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

async function renderAndStorePages(
  documentId: string,
  fileType: "pdf" | "pptx",
  buffer: Buffer,
): Promise<VisionImageInput[]> {
  const pages: { pageIndex: number; data: Buffer; mimeType: string; width?: number; height?: number }[] = [];

  if (fileType === "pdf") {
    const rendered = await renderPdfPagesToPng(buffer, MAX_PDF_RENDER_PAGES);
    for (const p of rendered) {
      pages.push({ pageIndex: p.pageIndex, data: p.png, mimeType: "image/png", width: p.width, height: p.height });
    }
  } else {
    const thumb = await extractPptxThumbnail(buffer);
    if (thumb) {
      pages.push({ pageIndex: 1, data: thumb.data, mimeType: thumb.contentType });
    }
  }

  if (pages.length === 0) return [];

  // Upload to object storage and persist a row per page.
  const visionImages: VisionImageInput[] = [];
  const rowsToInsert: typeof corpusDocumentPagesTable.$inferInsert[] = [];
  let visionBytesUsed = 0;

  for (const p of pages) {
    let objectPath: string;
    try {
      objectPath = await objectStorage.uploadBuffer(p.data, p.mimeType);
    } catch (err) {
      logger.warn({ err, documentId, pageIndex: p.pageIndex }, "Failed to upload page image to object storage");
      continue;
    }
    rowsToInsert.push({
      id: randomUUID(),
      documentId,
      pageIndex: p.pageIndex,
      objectPath,
      mimeType: p.mimeType,
      width: p.width ?? null,
      height: p.height ?? null,
    });
    // Pass to vision via base64 data URL — but cap the total payload so an unusually
    // large brand guideline can't trigger a huge model request. We still persist
    // every uploaded page so the frontend can show the full thumbnail strip.
    const base64 = p.data.toString("base64");
    const dataUrlBytes = base64.length + 32;
    if (visionBytesUsed + dataUrlBytes <= MAX_VISION_TOTAL_BYTES) {
      visionImages.push({ dataUrl: `data:${p.mimeType};base64,${base64}` });
      visionBytesUsed += dataUrlBytes;
    }
  }

  if (rowsToInsert.length > 0) {
    // Replace any prior page set for this document (e.g. on reprocess). Capture the
    // old object paths first so we can clean up the orphaned GCS blobs after the swap.
    const prior = await db
      .select({ objectPath: corpusDocumentPagesTable.objectPath })
      .from(corpusDocumentPagesTable)
      .where(eq(corpusDocumentPagesTable.documentId, documentId));
    await db.delete(corpusDocumentPagesTable).where(eq(corpusDocumentPagesTable.documentId, documentId));
    await db.insert(corpusDocumentPagesTable).values(rowsToInsert);
    if (prior.length > 0) {
      // Best-effort cleanup, never blocks ingestion.
      void Promise.allSettled(prior.map((r) => objectStorage.deleteObject(r.objectPath))).then(
        (results) => {
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            logger.warn({ documentId, failed }, "Failed to delete some prior page blobs");
          }
        },
      );
    }
  }

  return visionImages;
}

async function setStatus(documentId: string, status: string): Promise<void> {
  await db
    .update(corpusDocumentsTable)
    .set({ status })
    .where(eq(corpusDocumentsTable.id, documentId));
}

/**
 * Render brand-guideline page images, store them, and run the vision-augmented
 * Style DNA extraction. Runs even when the document has no extractable text
 * (scanned PDFs, image-heavy PPTX) — vision can still produce a useful palette/
 * typography/layout profile from the rendered pages alone.
 */
async function processBrandGuidelineVisuals(
  documentId: string,
  filename: string,
  fileType: "pdf" | "pptx",
  projectId: string,
  buffer: Buffer,
  rawText: string,
): Promise<void> {
  let visionImages: VisionImageInput[] = [];
  try {
    visionImages = await renderAndStorePages(documentId, fileType, buffer);
    logger.info(
      { documentId, pages: visionImages.length },
      "Brand-guideline page images rendered and stored",
    );
  } catch (err) {
    logger.warn({ err, documentId }, "Page rendering failed (Style DNA will fall back to text-only)");
  }

  // Skip extraction only when there is genuinely nothing to send (no text AND no
  // images). Otherwise run with whatever we have — vision-only or text-only.
  if (visionImages.length === 0 && rawText.trim().length < 50) {
    logger.info(
      { documentId },
      "Brand-guideline document yielded neither text nor images; skipping Style DNA",
    );
    return;
  }

  try {
    const styleDna = await extractStyleDnaFromTextAndImages(filename, rawText, visionImages);
    if (styleDna) {
      await db
        .insert(styleDnaTable)
        .values({ projectId, data: styleDna, sourceDocumentId: documentId })
        .onConflictDoUpdate({
          target: styleDnaTable.projectId,
          set: {
            data: styleDna,
            sourceDocumentId: documentId,
            extractedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      logger.info(
        { projectId, documentId, visionImages: visionImages.length },
        "Style DNA extracted and stored",
      );
    }
  } catch (err) {
    logger.warn({ err, documentId }, "Style DNA extraction failed (document still indexed)");
  }
}

export async function ingestDocument(params: IngestionParams): Promise<void> {
  const { documentId, filename, fileType, kind, projectId, buffer } = params;
  const isBrandGuideline = kind === "brand-guideline" && !!projectId;
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
      // No extractable text chunks — skip embeddings, but for brand guidelines we
      // still run page rendering + vision extraction so visual-only sources work.
      if (isBrandGuideline && projectId) {
        await processBrandGuidelineVisuals(documentId, filename, fileType, projectId, buffer, rawText);
      }
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

    // Visual brand inputs: render page images for brand-guideline uploads, then run
    // the vision-augmented Style DNA extraction.
    if (isBrandGuideline && projectId) {
      await processBrandGuidelineVisuals(documentId, filename, fileType, projectId, buffer, rawText);
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
