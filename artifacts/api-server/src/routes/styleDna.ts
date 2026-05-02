import { Router } from "express";
import { db } from "@workspace/db";
import {
  styleDnaTable,
  corpusDocumentsTable,
  corpusDocumentPagesTable,
  projectsTable,
} from "@workspace/db";
import type { StyleDnaData } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  extractStyleDnaFromTextAndImages,
  getStyleDnaForProject,
  type VisionImageInput,
} from "../lib/styleDna.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const objectStorage = new ObjectStorageService();

const router = Router();

router.get("/style-dna/:projectId", async (req, res) => {
  try {
    const result = await getStyleDnaForProject(req.params.projectId);
    const rows = await db.select().from(styleDnaTable).where(eq(styleDnaTable.projectId, req.params.projectId));
    return res.json({
      projectId: req.params.projectId,
      data: result.data,
      source: result.source,
      sourceDocumentId: rows[0]?.sourceDocumentId ?? null,
      extractedAt: rows[0]?.extractedAt ?? null,
      updatedAt: rows[0]?.updatedAt ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch style DNA");
    return res.status(500).json({ error: "Failed to fetch style DNA" });
  }
});

router.put("/style-dna/:projectId", async (req, res) => {
  try {
    const data = req.body?.data as StyleDnaData | undefined;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "data is required" });
    }
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, req.params.projectId));
    if (projects.length === 0) return res.status(404).json({ error: "Project not found" });

    await db
      .insert(styleDnaTable)
      .values({ projectId: req.params.projectId, data })
      .onConflictDoUpdate({
        target: styleDnaTable.projectId,
        set: { data, updatedAt: new Date() },
      });
    const result = await getStyleDnaForProject(req.params.projectId);
    return res.json({ projectId: req.params.projectId, data: result.data, source: result.source });
  } catch (err) {
    req.log.error({ err }, "Failed to save style DNA");
    return res.status(500).json({ error: "Failed to save style DNA" });
  }
});

router.delete("/style-dna/:projectId", async (req, res) => {
  try {
    await db.delete(styleDnaTable).where(eq(styleDnaTable.projectId, req.params.projectId));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete style DNA");
    return res.status(500).json({ error: "Failed to delete style DNA" });
  }
});

router.post("/style-dna/:projectId/extract", async (req, res) => {
  try {
    const sourceDocumentId = req.body?.sourceDocumentId as string | undefined;
    let docs;
    if (sourceDocumentId) {
      docs = await db
        .select()
        .from(corpusDocumentsTable)
        .where(
          and(
            eq(corpusDocumentsTable.id, sourceDocumentId),
            eq(corpusDocumentsTable.projectId, req.params.projectId),
          ),
        );
    } else {
      docs = await db
        .select()
        .from(corpusDocumentsTable)
        .where(
          and(
            eq(corpusDocumentsTable.projectId, req.params.projectId),
            eq(corpusDocumentsTable.kind, "brand-guideline"),
          ),
        );
    }
    if (docs.length === 0) {
      return res.status(400).json({
        error: "No brand-guideline document found for this project. Upload one tagged 'brand-guideline' first.",
      });
    }
    const doc = docs[0];
    // Reuse stored page renders (if any) so re-extracts also benefit from the vision pass.
    const pageRows = await db
      .select()
      .from(corpusDocumentPagesTable)
      .where(eq(corpusDocumentPagesTable.documentId, doc.id))
      .orderBy(asc(corpusDocumentPagesTable.pageIndex));

    // Allow extraction when EITHER usable text OR stored page images exist. Visual-only
    // brand guidelines (scanned PDFs, image-heavy decks) can still produce a useful
    // Style DNA from the rendered pages alone.
    const hasUsableText = !!doc.rawText && doc.rawText.length >= 200;
    if (!hasUsableText && pageRows.length === 0) {
      return res.status(400).json({
        error: "Source document has no extractable text and no stored page images",
      });
    }

    // Match the ingestion-time cap so re-extracts can't blow up the model request
    // payload (huge brand guidelines could otherwise produce dozens of base64 PNGs).
    const maxVisionBytes = Number(
      process.env.RAG_STYLE_DNA_MAX_VISION_BYTES ?? `${8 * 1024 * 1024}`,
    );
    const visionImages: VisionImageInput[] = [];
    let visionBytesUsed = 0;
    for (const p of pageRows) {
      try {
        const file = await objectStorage.getObjectEntityFile(p.objectPath);
        const [bytes] = await file.download();
        const base64 = bytes.toString("base64");
        const dataUrlBytes = base64.length + 32;
        if (visionBytesUsed + dataUrlBytes > maxVisionBytes) break;
        visionImages.push({ dataUrl: `data:${p.mimeType};base64,${base64}` });
        visionBytesUsed += dataUrlBytes;
      } catch (err) {
        req.log.warn({ err, pageId: p.id }, "Failed to load page image for re-extract; skipping");
      }
    }

    const data = await extractStyleDnaFromTextAndImages(doc.filename, doc.rawText ?? "", visionImages);
    if (!data) return res.status(500).json({ error: "Style DNA extraction returned no data" });

    await db
      .insert(styleDnaTable)
      .values({
        projectId: req.params.projectId,
        data,
        sourceDocumentId: doc.id,
      })
      .onConflictDoUpdate({
        target: styleDnaTable.projectId,
        set: {
          data,
          sourceDocumentId: doc.id,
          extractedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    return res.json({ projectId: req.params.projectId, data, source: "extracted", sourceDocumentId: doc.id });
  } catch (err) {
    req.log.error({ err }, "Failed to extract style DNA");
    return res.status(500).json({ error: "Failed to extract style DNA" });
  }
});

/**
 * GET /api/style-dna/:projectId/pages
 *
 * Returns the rendered page thumbnails associated with the brand-guideline document(s)
 * for the given project. Used by the StyleDnaEditor to show a "Visual sources" strip.
 */
router.get("/style-dna/:projectId/pages", async (req, res) => {
  try {
    const docs = await db
      .select({ id: corpusDocumentsTable.id, filename: corpusDocumentsTable.filename })
      .from(corpusDocumentsTable)
      .where(
        and(
          eq(corpusDocumentsTable.projectId, req.params.projectId),
          eq(corpusDocumentsTable.kind, "brand-guideline"),
        ),
      );

    if (docs.length === 0) {
      return res.json({ projectId: req.params.projectId, pages: [] });
    }

    const docIds = docs.map((d) => d.id);
    const docNames = new Map(docs.map((d) => [d.id, d.filename]));

    const pages = await db
      .select()
      .from(corpusDocumentPagesTable)
      .where(inArray(corpusDocumentPagesTable.documentId, docIds))
      .orderBy(
        asc(corpusDocumentPagesTable.documentId),
        asc(corpusDocumentPagesTable.pageIndex),
      );

    return res.json({
      projectId: req.params.projectId,
      pages: pages.map((p) => ({
        id: p.id,
        documentId: p.documentId,
        documentName: docNames.get(p.documentId) ?? "",
        pageIndex: p.pageIndex,
        objectPath: p.objectPath,
        mimeType: p.mimeType,
        width: p.width,
        height: p.height,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list style DNA pages");
    return res.status(500).json({ error: "Failed to list pages" });
  }
});

export default router;
