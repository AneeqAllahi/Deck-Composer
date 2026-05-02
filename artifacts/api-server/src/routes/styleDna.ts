import { Router } from "express";
import { db } from "@workspace/db";
import { styleDnaTable, corpusDocumentsTable, projectsTable } from "@workspace/db";
import type { StyleDnaData } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { extractStyleDnaFromText, getStyleDnaForProject } from "../lib/styleDna.js";

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
    if (!doc.rawText || doc.rawText.length < 200) {
      return res.status(400).json({ error: "Source document has no extractable text" });
    }
    const data = await extractStyleDnaFromText(doc.filename, doc.rawText);
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

export default router;
