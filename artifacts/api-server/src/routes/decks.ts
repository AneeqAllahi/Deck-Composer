import { Router } from "express";
import { db } from "@workspace/db";
import {
  decksTable,
  corpusDocumentsTable,
  corpusChunksTable,
  brandProfileTable,
  projectsTable,
  deckGenerationLogTable,
} from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import { generateId } from "../lib/rag.js";
import { generateDeckSlides, regenerateSingleSlide, type SlideOutline } from "../lib/generation.js";
import { exportDeckToPptx } from "../lib/export.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import type { SlideData, BrandProfile } from "@workspace/db";

const router = Router();

async function getOrCreateBrandProfile(): Promise<BrandProfile> {
  const profiles = await db.select().from(brandProfileTable).where(eq(brandProfileTable.id, "default"));
  if (profiles.length > 0) return profiles[0];
  const created = await db
    .insert(brandProfileTable)
    .values({
      id: "default",
      primaryColor: "#1E293B",
      secondaryColor: "#334155",
      accentColor: "#3B82F6",
      headingFont: "Inter",
      bodyFont: "Inter",
      density: "balanced",
    })
    .returning();
  return created[0];
}

async function getBrandProfileForDeck(projectId?: string | null): Promise<BrandProfile> {
  if (projectId) {
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (projects.length > 0) {
      const project = projects[0];
      return {
        id: project.id,
        primaryColor: project.primaryColor,
        secondaryColor: project.secondaryColor,
        accentColor: project.accentColor,
        headingFont: project.headingFont,
        bodyFont: project.bodyFont,
        logoObjectPath: project.logoObjectPath,
        density: project.density,
        updatedAt: project.updatedAt,
      };
    }
  }
  return getOrCreateBrandProfile();
}

router.get("/decks/stats", async (req, res) => {
  try {
    const [totalDecks] = await db.select({ count: count() }).from(decksTable);
    const [totalDocs] = await db.select({ count: count() }).from(corpusDocumentsTable);
    const [totalChunks] = await db.select({ count: count() }).from(corpusChunksTable);

    const decksWithSlides = await db.select({ slides: decksTable.slides }).from(decksTable);
    const totalSlides = decksWithSlides.reduce((acc, d) => {
      const slides = d.slides as SlideData[];
      return acc + (slides?.length ?? 0);
    }, 0);

    return res.json({
      totalDecks: totalDecks?.count ?? 0,
      totalCorpusDocuments: totalDocs?.count ?? 0,
      totalSlidesGenerated: totalSlides,
      totalChunks: totalChunks?.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    return res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/decks", async (req, res) => {
  try {
    const decks = await db.select().from(decksTable).orderBy(desc(decksTable.createdAt));
    return res.json(
      decks.map((d) => ({
        id: d.id,
        title: d.title,
        brief: d.brief,
        slideCount: (d.slides as SlideData[])?.length ?? 0,
        projectId: d.projectId,
        createdAt: d.createdAt,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list decks");
    return res.status(500).json({ error: "Failed to list decks" });
  }
});

router.post("/decks/generate", async (req, res) => {
  try {
    const body = req.body as {
      title: string;
      brief: string;
      audience: string;
      slideCount: number;
      narrativeStructure: string;
      projectId?: string | null;
      slideOutlines?: SlideOutline[];
    };

    if (body.slideOutlines !== undefined) {
      if (!Array.isArray(body.slideOutlines)) {
        return res.status(400).json({ error: "slideOutlines must be an array" });
      }
      const seen = new Set<number>();
      for (const outline of body.slideOutlines) {
        if (
          typeof outline.slideIndex !== "number" ||
          !Number.isInteger(outline.slideIndex) ||
          outline.slideIndex < 0 ||
          outline.slideIndex >= body.slideCount
        ) {
          return res.status(400).json({
            error: `slideOutlines: slideIndex must be an integer in [0, ${body.slideCount})`,
          });
        }
        if (seen.has(outline.slideIndex)) {
          return res.status(400).json({ error: `slideOutlines: duplicate slideIndex ${outline.slideIndex}` });
        }
        seen.add(outline.slideIndex);
        if (typeof outline.guidance !== "string" || outline.guidance.length > 1000) {
          return res.status(400).json({ error: "slideOutlines: guidance must be a string up to 1000 chars" });
        }
        if (
          outline.title !== undefined &&
          outline.title !== null &&
          (typeof outline.title !== "string" || outline.title.length > 200)
        ) {
          return res.status(400).json({ error: "slideOutlines: title must be a string up to 200 chars" });
        }
      }
    }

    const { slides, log } = await generateDeckSlides({
      title: body.title,
      brief: body.brief,
      audience: body.audience,
      slideCount: body.slideCount,
      narrativeStructure: body.narrativeStructure,
      projectId: body.projectId ?? null,
      slideOutlines: body.slideOutlines,
    });

    const deckId = generateId();
    const deck = await db
      .insert(decksTable)
      .values({
        id: deckId,
        title: body.title,
        brief: body.brief,
        audience: body.audience,
        narrativeStructure: body.narrativeStructure,
        slides,
        projectId: body.projectId ?? null,
      })
      .returning();

    try {
      await db.insert(deckGenerationLogTable).values({
        id: generateId(),
        deckId,
        projectId: body.projectId ?? null,
        data: log,
        latencyMs: log.latencyMs,
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to persist deck generation log");
    }

    return res.status(201).json(deck[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to generate deck");
    return res
      .status(500)
      .json({ error: `Failed to generate deck: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.get("/decks/:id", async (req, res) => {
  try {
    const decks = await db.select().from(decksTable).where(eq(decksTable.id, req.params.id));
    if (decks.length === 0) return res.status(404).json({ error: "Deck not found" });
    return res.json(decks[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get deck");
    return res.status(500).json({ error: "Failed to get deck" });
  }
});

router.delete("/decks/:id", async (req, res) => {
  try {
    await db.delete(decksTable).where(eq(decksTable.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete deck");
    return res.status(500).json({ error: "Failed to delete deck" });
  }
});

router.put("/decks/:id/slides/:slideIndex", async (req, res) => {
  try {
    const { id, slideIndex: slideIndexStr } = req.params;
    const slideIndex = parseInt(slideIndexStr);
    const body = req.body as Partial<SlideData>;

    const decks = await db.select().from(decksTable).where(eq(decksTable.id, id));
    if (decks.length === 0) return res.status(404).json({ error: "Deck not found" });

    const deck = decks[0];
    const slides = [...(deck.slides as SlideData[])];

    if (slideIndex < 0 || slideIndex >= slides.length) {
      return res.status(400).json({ error: "Invalid slide index" });
    }

    slides[slideIndex] = {
      ...slides[slideIndex],
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.bulletPoints !== undefined && { bulletPoints: body.bulletPoints }),
      ...(body.speakerNotes !== undefined && { speakerNotes: body.speakerNotes }),
      ...(body.layoutType !== undefined && { layoutType: body.layoutType }),
      ...(body.metrics !== undefined && { metrics: body.metrics }),
      ...(body.columnLeft !== undefined && { columnLeft: body.columnLeft }),
      ...(body.columnRight !== undefined && { columnRight: body.columnRight }),
    };

    const updated = await db
      .update(decksTable)
      .set({ slides, updatedAt: new Date() })
      .where(eq(decksTable.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update slide");
    return res.status(500).json({ error: "Failed to update slide" });
  }
});

router.post("/decks/:id/slides/:slideIndex/regenerate", async (req, res) => {
  try {
    const { id, slideIndex: slideIndexStr } = req.params;
    const slideIndex = parseInt(slideIndexStr);
    const body = req.body as { instruction?: string };

    const decks = await db.select().from(decksTable).where(eq(decksTable.id, id));
    if (decks.length === 0) return res.status(404).json({ error: "Deck not found" });

    const deck = decks[0];
    const slides = [...(deck.slides as SlideData[])];

    if (slideIndex < 0 || slideIndex >= slides.length) {
      return res.status(400).json({ error: "Invalid slide index" });
    }

    const regenerated = await regenerateSingleSlide({
      currentSlide: slides[slideIndex],
      deck: {
        title: deck.title,
        brief: deck.brief,
        audience: deck.audience,
        narrativeStructure: deck.narrativeStructure,
        projectId: deck.projectId,
      },
      instruction: body.instruction,
    });

    slides[slideIndex] = regenerated;

    const updated = await db
      .update(decksTable)
      .set({ slides, updatedAt: new Date() })
      .where(eq(decksTable.id, id))
      .returning();

    return res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to regenerate slide");
    return res
      .status(500)
      .json({ error: `Failed to regenerate slide: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.get("/decks/:id/export", async (req, res) => {
  try {
    const decks = await db.select().from(decksTable).where(eq(decksTable.id, req.params.id));
    if (decks.length === 0) return res.status(404).json({ error: "Deck not found" });

    const deck = decks[0];
    const brandProfile = await getBrandProfileForDeck(deck.projectId);

    let logoBuffer: Buffer | undefined;
    if (brandProfile.logoObjectPath) {
      try {
        const storageService = new ObjectStorageService();
        const file = await storageService.getObjectEntityFile(brandProfile.logoObjectPath);
        const [fileContents] = await file.download();
        logoBuffer = fileContents as Buffer;
      } catch {
        // Skip logo if unavailable
      }
    }

    const pptxBuffer = await exportDeckToPptx(deck.title, deck.slides as SlideData[], brandProfile, logoBuffer);

    const filename = deck.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pptx"`);
    return res.send(pptxBuffer);
  } catch (err) {
    req.log.error({ err }, "Failed to export deck");
    return res
      .status(500)
      .json({ error: `Failed to export deck: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.get("/decks/:id/generation-log", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(deckGenerationLogTable)
      .where(eq(deckGenerationLogTable.deckId, req.params.id))
      .orderBy(desc(deckGenerationLogTable.createdAt))
      .limit(1);
    if (rows.length === 0) return res.json({ deckId: req.params.id, log: null });
    return res.json({
      deckId: req.params.id,
      log: rows[0].data,
      latencyMs: rows[0].latencyMs,
      qualityScore: rows[0].qualityScore,
      createdAt: rows[0].createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get deck generation log");
    return res.status(500).json({ error: "Failed to get deck generation log" });
  }
});

export default router;
