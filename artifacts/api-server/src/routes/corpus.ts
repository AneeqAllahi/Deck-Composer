import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { corpusDocumentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ingestDocument } from "../lib/ingestion.js";
import { generateId } from "../lib/rag.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ALLOWED_KINDS = new Set(["exemplar-deck", "brand-guideline"]);

router.get("/corpus", async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;

    const docs = projectId
      ? await db
          .select()
          .from(corpusDocumentsTable)
          .where(eq(corpusDocumentsTable.projectId, projectId))
          .orderBy(desc(corpusDocumentsTable.createdAt))
      : await db.select().from(corpusDocumentsTable).orderBy(desc(corpusDocumentsTable.createdAt));

    return res.json(
      docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        fileType: d.fileType,
        kind: d.kind,
        chunkCount: d.chunkCount,
        status: d.status,
        projectId: d.projectId,
        createdAt: d.createdAt,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list corpus documents");
    return res.status(500).json({ error: "Failed to list corpus documents" });
  }
});

router.post("/corpus/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { originalname, buffer, mimetype } = req.file;
  const isPdf = mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
  const isPptx =
    mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    originalname.toLowerCase().endsWith(".pptx");

  if (!isPdf && !isPptx) {
    res.status(400).json({ error: "Only PDF and PPTX files are supported" });
    return;
  }

  const projectId = (req.body?.projectId as string | undefined) || null;
  const kindRaw = (req.body?.kind as string | undefined) || "exemplar-deck";
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "exemplar-deck";
  const docId = generateId();
  const fileType = isPdf ? "pdf" : "pptx";

  const doc = await db
    .insert(corpusDocumentsTable)
    .values({
      id: docId,
      filename: originalname,
      fileType,
      kind,
      chunkCount: 0,
      status: "processing",
      projectId,
    })
    .returning();

  res.status(201).json({
    id: doc[0].id,
    filename: doc[0].filename,
    fileType: doc[0].fileType,
    kind: doc[0].kind,
    chunkCount: 0,
    status: "processing",
    projectId: doc[0].projectId,
    createdAt: doc[0].createdAt,
  });

  void setImmediate(() => {
    void ingestDocument({
      documentId: docId,
      filename: originalname,
      fileType,
      kind,
      projectId,
      buffer,
    });
  });
});

router.delete("/corpus/:id", async (req, res) => {
  try {
    await db.delete(corpusDocumentsTable).where(eq(corpusDocumentsTable.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete corpus document");
    return res.status(500).json({ error: "Failed to delete corpus document" });
  }
});

router.post("/corpus/:id/reprocess", async (req, res) => {
  try {
    const docs = await db.select().from(corpusDocumentsTable).where(eq(corpusDocumentsTable.id, req.params.id));
    if (docs.length === 0) return res.status(404).json({ error: "Document not found" });
    const doc = docs[0];
    void setImmediate(async () => {
      const { reprocessDocument } = await import("../lib/ingestion.js");
      await reprocessDocument(doc.id);
    });
    return res.status(202).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reprocess corpus document");
    return res.status(500).json({ error: "Failed to reprocess corpus document" });
  }
});

export default router;
