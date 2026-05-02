import { pgTable, text, timestamp, integer, jsonb, customType, real } from "drizzle-orm/pg-core";
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

export type ChunkMetadata = {
  sectionType?: "slide" | "heading" | "paragraph" | "quote" | "metric" | "title" | "speaker_notes";
  headingPath?: string[];
  sourceSlideIndex?: number | null;
  sourceSlideTitle?: string | null;
  pageNumber?: number | null;
};

export const corpusDocumentsTable = pgTable("corpus_documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  kind: text("kind").notNull().default("exemplar-deck"),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text("status").notNull().default("processing"),
  rawText: text("raw_text"),
  projectId: text("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const corpusChunksTable = pgTable("corpus_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => corpusDocumentsTable.id, { onDelete: "cascade" }),
  chunkText: text("chunk_text").notNull(),
  contextualSummary: text("contextual_summary"),
  metadata: jsonb("metadata").$type<ChunkMetadata>(),
  embedding: vector("embedding", { dimensions: 1536 }),
  embeddingModel: text("embedding_model"),
  slideIndex: integer("slide_index"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCorpusDocumentSchema = createInsertSchema(corpusDocumentsTable).omit({ createdAt: true });
export type InsertCorpusDocument = z.infer<typeof insertCorpusDocumentSchema>;
export type CorpusDocument = typeof corpusDocumentsTable.$inferSelect;
export type CorpusChunk = typeof corpusChunksTable.$inferSelect;

export type StyleDnaPalette = {
  name: string;
  hex: string;
  role?: string;
  usage?: string;
}[];

export type StyleDnaTypography = {
  heading?: { family?: string; weight?: string; sizes?: string; case?: string };
  body?: { family?: string; weight?: string; sizes?: string };
  caption?: { family?: string; weight?: string; sizes?: string };
};

export type StyleDnaVoice = {
  adjectives?: string[];
  readingGrade?: string;
  pointOfView?: string;
  toneNotes?: string;
};

export type StyleDnaLexicon = {
  preferred?: string[];
  banned?: string[];
  signaturePhrases?: string[];
};

export type StyleDnaLayout = {
  name: string;
  description: string;
};

export type StyleDnaRules = {
  dos?: string[];
  donts?: string[];
};

export type StyleDnaData = {
  palette?: StyleDnaPalette;
  typography?: StyleDnaTypography;
  voice?: StyleDnaVoice;
  lexicon?: StyleDnaLexicon;
  signatureLayouts?: StyleDnaLayout[];
  logoRules?: string[];
  rules?: StyleDnaRules;
};

export const styleDnaTable = pgTable("style_dna", {
  projectId: text("project_id").primaryKey().references(() => projectsTable.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().$type<StyleDnaData>(),
  sourceDocumentId: text("source_document_id"),
  extractedAt: timestamp("extracted_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StyleDna = typeof styleDnaTable.$inferSelect;

export type RetrievalEntryChunk = {
  chunkId: string;
  documentId: string;
  documentName: string;
  score: number;
  bm25Rank?: number;
  vectorRank?: number;
  text: string;
  contextualSummary?: string | null;
  metadata?: ChunkMetadata | null;
};

export type RetrievalEntry = {
  slideIndex: number;
  query: string;
  chunks: RetrievalEntryChunk[];
};

export type DeckGenerationLogData = {
  pipelineVersion: string;
  embeddingModel: string;
  rerankerProvider: string | null;
  outline?: { slideIndex: number; synopsis: string }[];
  retrievals: RetrievalEntry[];
  totalChunksConsidered: number;
  exemplarDocumentCount: number;
  styleDnaApplied: boolean;
  latencyMs: number;
  errors?: string[];
};

export const deckGenerationLogTable = pgTable("deck_generation_log", {
  id: text("id").primaryKey(),
  deckId: text("deck_id").notNull().references(() => decksTable.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  data: jsonb("data").notNull().$type<DeckGenerationLogData>(),
  latencyMs: integer("latency_ms").notNull().default(0),
  qualityScore: real("quality_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DeckGenerationLog = typeof deckGenerationLogTable.$inferSelect;
