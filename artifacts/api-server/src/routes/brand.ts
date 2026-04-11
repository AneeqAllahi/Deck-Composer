import { Router } from "express";
import { db } from "@workspace/db";
import { brandProfileTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/brand-profile", async (req, res) => {
  try {
    const profiles = await db.select().from(brandProfileTable).where(eq(brandProfileTable.id, "default"));
    
    if (profiles.length === 0) {
      const defaultProfile = await db.insert(brandProfileTable).values({
        id: "default",
        primaryColor: "#1E293B",
        secondaryColor: "#334155",
        accentColor: "#3B82F6",
        headingFont: "Inter",
        bodyFont: "Inter",
        density: "balanced",
      }).returning();
      return res.json(defaultProfile[0]);
    }
    
    return res.json(profiles[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get brand profile");
    return res.status(500).json({ error: "Failed to get brand profile" });
  }
});

router.put("/brand-profile", async (req, res) => {
  try {
    const body = req.body as {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      headingFont?: string;
      bodyFont?: string;
      logoObjectPath?: string | null;
      density?: string;
    };

    const existing = await db.select().from(brandProfileTable).where(eq(brandProfileTable.id, "default"));
    
    if (existing.length === 0) {
      const created = await db.insert(brandProfileTable).values({
        id: "default",
        primaryColor: body.primaryColor ?? "#1E293B",
        secondaryColor: body.secondaryColor ?? "#334155",
        accentColor: body.accentColor ?? "#3B82F6",
        headingFont: body.headingFont ?? "Inter",
        bodyFont: body.bodyFont ?? "Inter",
        logoObjectPath: body.logoObjectPath ?? null,
        density: body.density ?? "balanced",
        updatedAt: new Date(),
      }).returning();
      return res.json(created[0]);
    }

    const updated = await db.update(brandProfileTable)
      .set({
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.accentColor !== undefined && { accentColor: body.accentColor }),
        ...(body.headingFont !== undefined && { headingFont: body.headingFont }),
        ...(body.bodyFont !== undefined && { bodyFont: body.bodyFont }),
        ...(body.logoObjectPath !== undefined && { logoObjectPath: body.logoObjectPath }),
        ...(body.density !== undefined && { density: body.density }),
        updatedAt: new Date(),
      })
      .where(eq(brandProfileTable.id, "default"))
      .returning();
    
    return res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update brand profile");
    return res.status(500).json({ error: "Failed to update brand profile" });
  }
});

export default router;
