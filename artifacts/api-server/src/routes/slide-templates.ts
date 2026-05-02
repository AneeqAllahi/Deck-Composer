import { Router } from "express";
import { db } from "@workspace/db";
import { slideTemplatesTable, projectsTable, type SlideTemplateOutline } from "@workspace/db";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import { generateId } from "../lib/rag.js";

const router = Router();

const NARRATIVE_STRUCTURES = new Set([
  "problem-solution",
  "consulting",
  "chronological",
  "mece-pyramid",
  "executive-summary",
  "custom",
]);

function validateOutlines(outlines: unknown, slideCount: number): SlideTemplateOutline[] | { error: string } {
  if (!Array.isArray(outlines)) return { error: "outlines must be an array" };
  const seen = new Set<number>();
  const result: SlideTemplateOutline[] = [];
  for (const o of outlines) {
    if (!o || typeof o !== "object") return { error: "outlines: each item must be an object" };
    const oo = o as Record<string, unknown>;
    if (
      typeof oo.slideIndex !== "number" ||
      !Number.isInteger(oo.slideIndex) ||
      oo.slideIndex < 0 ||
      oo.slideIndex >= slideCount
    ) {
      return { error: `outlines: slideIndex must be an integer in [0, ${slideCount})` };
    }
    if (seen.has(oo.slideIndex)) return { error: `outlines: duplicate slideIndex ${oo.slideIndex}` };
    seen.add(oo.slideIndex);
    if (typeof oo.guidance !== "string" || oo.guidance.length > 1000) {
      return { error: "outlines: guidance must be a string up to 1000 chars" };
    }
    if (oo.title !== undefined && oo.title !== null && (typeof oo.title !== "string" || oo.title.length > 200)) {
      return { error: "outlines: title must be a string up to 200 chars" };
    }
    result.push({
      slideIndex: oo.slideIndex,
      guidance: oo.guidance,
      title: typeof oo.title === "string" ? oo.title : undefined,
    });
  }
  return result;
}

router.get("/slide-templates", async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const rows = projectId
      ? await db.select().from(slideTemplatesTable)
          .where(or(isNull(slideTemplatesTable.projectId), eq(slideTemplatesTable.projectId, projectId)))
          .orderBy(desc(slideTemplatesTable.createdAt))
      : await db.select().from(slideTemplatesTable).orderBy(desc(slideTemplatesTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list slide templates");
    return res.status(500).json({ error: "Failed to list slide templates" });
  }
});

router.post("/slide-templates", async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      description?: string;
      slideCount?: number;
      narrativeStructure?: string;
      outlines?: unknown;
      projectId?: string | null;
    };

    if (!body.name?.trim()) return res.status(400).json({ error: "Template name is required" });
    if (typeof body.slideCount !== "number" || !Number.isInteger(body.slideCount) || body.slideCount < 3 || body.slideCount > 30) {
      return res.status(400).json({ error: "slideCount must be an integer between 3 and 30" });
    }
    if (typeof body.narrativeStructure !== "string" || !NARRATIVE_STRUCTURES.has(body.narrativeStructure)) {
      return res.status(400).json({ error: "narrativeStructure is invalid" });
    }
    const validated = validateOutlines(body.outlines, body.slideCount);
    if ("error" in validated) return res.status(400).json({ error: validated.error });

    if (body.projectId) {
      const proj = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.id, body.projectId));
      if (proj.length === 0) return res.status(400).json({ error: "projectId does not exist" });
    }

    const created = await db.insert(slideTemplatesTable).values({
      id: generateId(),
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      slideCount: body.slideCount,
      narrativeStructure: body.narrativeStructure,
      outlines: validated,
      projectId: body.projectId ?? null,
    }).returning();

    return res.status(201).json(created[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create slide template");
    return res.status(500).json({ error: "Failed to create slide template" });
  }
});

router.delete("/slide-templates/:id", async (req, res) => {
  try {
    const rows = await db.select().from(slideTemplatesTable).where(eq(slideTemplatesTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Template not found" });
    await db.delete(slideTemplatesTable).where(eq(slideTemplatesTable.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete slide template");
    return res.status(500).json({ error: "Failed to delete slide template" });
  }
});

export default router;
