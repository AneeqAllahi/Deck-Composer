import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { corpusDocumentsTable, corpusChunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { chunkText, generateId } from "../lib/rag.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function extractTextFromPdf(buffer: Buffer): Promise<string[]> {
  try {
    const pdfParse = await import("pdf-parse");
    const data = await pdfParse.default(buffer);
    return chunkText(data.text, 400, 50);
  } catch (err) {
    throw new Error(`Failed to parse PDF: ${err}`);
  }
}

async function extractTextFromPptx(buffer: Buffer): Promise<{ chunks: string[]; slideTexts: { index: number; text: string }[] }> {
  const AdmZip = (await import("adm-zip")).default;
  const { XMLParser } = await import("fast-xml-parser");

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const aNum = parseInt(a.entryName.match(/(\d+)/)?.[1] ?? "0");
      const bNum = parseInt(b.entryName.match(/(\d+)/)?.[1] ?? "0");
      return aNum - bNum;
    });

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const slideTexts: { index: number; text: string }[] = [];

  function extractAllText(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(extractAllText).join(" ");
    if (typeof obj === "object" && obj !== null) {
      return Object.values(obj as Record<string, unknown>).map(extractAllText).join(" ");
    }
    return "";
  }

  for (let i = 0; i < slideEntries.length; i++) {
    try {
      const xmlContent = slideEntries[i].getData().toString("utf8");
      const parsed = parser.parse(xmlContent);
      const text = extractAllText(parsed)
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        slideTexts.push({ index: i + 1, text });
      }
    } catch {
      // Skip unparseable slides
    }
  }

  const allChunks: string[] = [];
  for (const slide of slideTexts) {
    const slideChunks = chunkText(slide.text, 300, 30);
    allChunks.push(...slideChunks.map((c) => `[Slide ${slide.index}] ${c}`));
  }

  return { chunks: allChunks, slideTexts };
}

router.get("/corpus", async (req, res) => {
  try {
    const docs = await db.select().from(corpusDocumentsTable).orderBy(corpusDocumentsTable.createdAt);
    return res.json(docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      fileType: d.fileType,
      chunkCount: d.chunkCount,
      status: d.status,
      createdAt: d.createdAt,
    })));
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
  const isPptx = mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    originalname.toLowerCase().endsWith(".pptx");

  if (!isPdf && !isPptx) {
    res.status(400).json({ error: "Only PDF and PPTX files are supported" });
    return;
  }

  const docId = generateId();
  const fileType = isPdf ? "pdf" : "pptx";

  const doc = await db.insert(corpusDocumentsTable).values({
    id: docId,
    filename: originalname,
    fileType,
    chunkCount: 0,
    status: "processing",
  }).returning();

  res.status(201).json({
    id: doc[0].id,
    filename: doc[0].filename,
    fileType: doc[0].fileType,
    chunkCount: 0,
    status: "processing",
    createdAt: doc[0].createdAt,
  });

  void setImmediate(async () => {
    try {
      let chunks: string[];

      if (isPdf) {
        chunks = await extractTextFromPdf(buffer);
      } else {
        const result = await extractTextFromPptx(buffer);
        chunks = result.chunks;
      }

      if (chunks.length > 0) {
        const { generateEmbeddingsBatch } = await import("../lib/embeddings.js");
        const INGEST_BATCH = 20;
        for (let i = 0; i < chunks.length; i += INGEST_BATCH) {
          const batch = chunks.slice(i, i + INGEST_BATCH);
          const embeddings = await generateEmbeddingsBatch(batch);
          const rows = batch.map((text, j) => ({
            id: generateId(),
            documentId: docId,
            chunkText: text,
            embedding: embeddings[j],
          }));
          await db.insert(corpusChunksTable).values(rows);
        }
      }

      await db.update(corpusDocumentsTable)
        .set({ chunkCount: chunks.length, status: "ready" })
        .where(eq(corpusDocumentsTable.id, docId));
    } catch (err) {
      console.error("Corpus processing error:", err);
      await db.update(corpusDocumentsTable)
        .set({ status: "error" })
        .where(eq(corpusDocumentsTable.id, docId));
    }
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

export default router;
