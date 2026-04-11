import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, corpusDocumentsTable, decksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { generateId } from "../lib/rag.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();

router.get("/projects", async (req, res) => {
  try {
    const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));
    return res.json(projects);
  } catch (err) {
    req.log.error({ err }, "Failed to list projects");
    return res.status(500).json({ error: "Failed to list projects" });
  }
});

router.post("/projects", async (req, res) => {
  try {
    const body = req.body as {
      name: string;
      description?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      headingFont?: string;
      bodyFont?: string;
      density?: string;
    };

    if (!body.name?.trim()) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const created = await db.insert(projectsTable).values({
      id: generateId(),
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      primaryColor: body.primaryColor ?? "#1E293B",
      secondaryColor: body.secondaryColor ?? "#334155",
      accentColor: body.accentColor ?? "#3B82F6",
      headingFont: body.headingFont ?? "Inter",
      bodyFont: body.bodyFont ?? "Inter",
      density: body.density ?? "balanced",
    }).returning();

    return res.status(201).json(created[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create project");
    return res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/projects/:id", async (req, res) => {
  try {
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Project not found" });
    return res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get project");
    return res.status(500).json({ error: "Failed to get project" });
  }
});

router.put("/projects/:id", async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      description?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      headingFont?: string;
      bodyFont?: string;
      logoObjectPath?: string | null;
      density?: string;
    };

    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const updated = await db.update(projectsTable)
      .set({
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.accentColor !== undefined && { accentColor: body.accentColor }),
        ...(body.headingFont !== undefined && { headingFont: body.headingFont }),
        ...(body.bodyFont !== undefined && { bodyFont: body.bodyFont }),
        ...(body.logoObjectPath !== undefined && { logoObjectPath: body.logoObjectPath }),
        ...(body.density !== undefined && { density: body.density }),
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, req.params.id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update project");
    return res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", async (req, res) => {
  try {
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Project not found" });

    await db.update(decksTable).set({ projectId: null }).where(eq(decksTable.projectId, req.params.id));
    await db.delete(corpusDocumentsTable).where(eq(corpusDocumentsTable.projectId, req.params.id));
    await db.delete(projectsTable).where(eq(projectsTable.id, req.params.id));

    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete project");
    return res.status(500).json({ error: "Failed to delete project" });
  }
});

router.post("/projects/:id/logo", async (req, res) => {
  try {
    const { objectPath } = req.body as { objectPath: string };
    if (!objectPath) return res.status(400).json({ error: "objectPath is required" });

    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const updated = await db.update(projectsTable)
      .set({ logoObjectPath: objectPath, updatedAt: new Date() })
      .where(eq(projectsTable.id, req.params.id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update project logo");
    return res.status(500).json({ error: "Failed to update project logo" });
  }
});

export default router;
