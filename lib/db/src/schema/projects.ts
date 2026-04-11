import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  primaryColor: text("primary_color").notNull().default("#1E293B"),
  secondaryColor: text("secondary_color").notNull().default("#334155"),
  accentColor: text("accent_color").notNull().default("#3B82F6"),
  headingFont: text("heading_font").notNull().default("Inter"),
  bodyFont: text("body_font").notNull().default("Inter"),
  logoObjectPath: text("logo_object_path"),
  density: text("density").notNull().default("balanced"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
