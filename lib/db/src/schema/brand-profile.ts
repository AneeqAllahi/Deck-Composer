import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brandProfileTable = pgTable("brand_profile", {
  id: text("id").primaryKey().default("default"),
  primaryColor: text("primary_color").notNull().default("#1E293B"),
  secondaryColor: text("secondary_color").notNull().default("#334155"),
  accentColor: text("accent_color").notNull().default("#3B82F6"),
  headingFont: text("heading_font").notNull().default("Inter"),
  bodyFont: text("body_font").notNull().default("Inter"),
  logoObjectPath: text("logo_object_path"),
  density: text("density").notNull().default("balanced"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandProfileSchema = createInsertSchema(brandProfileTable).omit({ id: true, updatedAt: true });
export type InsertBrandProfile = z.infer<typeof insertBrandProfileSchema>;
export type BrandProfile = typeof brandProfileTable.$inferSelect;
