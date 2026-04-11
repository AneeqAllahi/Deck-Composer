import { pgTable, text, timestamp, integer, jsonb, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
  },
});

export const SlideSchema = z.object({
  slideIndex: z.number(),
  title: z.string(),
  body: z.string(),
  layoutType: z.enum(["title", "section", "text", "columns", "quote", "metrics"]),
  speakerNotes: z.string(),
  bulletPoints: z.array(z.string()).optional(),
  metrics: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  columnLeft: z.string().nullable().optional(),
  columnRight: z.string().nullable().optional(),
  imageObjectPath: z.string().nullable().optional(),
});

export type SlideData = z.infer<typeof SlideSchema>;

export const decksTable = pgTable("decks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  audience: text("audience").notNull(),
  narrativeStructure: text("narrative_structure").notNull(),
  slides: jsonb("slides").notNull().$type<SlideData[]>(),
  projectId: text("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDeckSchema = createInsertSchema(decksTable).omit({ createdAt: true, updatedAt: true });
export type InsertDeck = z.infer<typeof insertDeckSchema>;
export type Deck = typeof decksTable.$inferSelect;

export const corpusDocumentsTable = pgTable("corpus_documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text("status").notNull().default("processing"),
  projectId: text("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const corpusChunksTable = pgTable("corpus_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => corpusDocumentsTable.id, { onDelete: "cascade" }),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  slideIndex: integer("slide_index"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCorpusDocumentSchema = createInsertSchema(corpusDocumentsTable).omit({ createdAt: true });
export type InsertCorpusDocument = z.infer<typeof insertCorpusDocumentSchema>;
export type CorpusDocument = typeof corpusDocumentsTable.$inferSelect;
export type CorpusChunk = typeof corpusChunksTable.$inferSelect;
