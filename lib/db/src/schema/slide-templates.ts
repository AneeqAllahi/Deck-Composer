import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const SlideTemplateOutlineSchema = z.object({
  slideIndex: z.number().int().nonnegative(),
  title: z.string().optional(),
  guidance: z.string(),
});

export type SlideTemplateOutline = z.infer<typeof SlideTemplateOutlineSchema>;

export const slideTemplatesTable = pgTable("slide_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  slideCount: integer("slide_count").notNull(),
  narrativeStructure: text("narrative_structure").notNull(),
  outlines: jsonb("outlines").notNull().$type<SlideTemplateOutline[]>(),
  projectId: text("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSlideTemplateSchema = createInsertSchema(slideTemplatesTable).omit({ createdAt: true, updatedAt: true });
export type InsertSlideTemplate = z.infer<typeof insertSlideTemplateSchema>;
export type SlideTemplate = typeof slideTemplatesTable.$inferSelect;
