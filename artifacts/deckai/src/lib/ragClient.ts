const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export type DocumentKind = "exemplar-deck" | "brand-guideline";

export async function uploadCorpusDocumentWithKind(opts: {
  file: File;
  projectId?: string | null;
  kind: DocumentKind;
}): Promise<{ id: string; filename: string; status: string; kind: string }> {
  const formData = new FormData();
  formData.append("file", opts.file);
  if (opts.projectId) formData.append("projectId", opts.projectId);
  formData.append("kind", opts.kind);
  const res = await fetch(`${API_BASE}/corpus/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export type StyleDnaPaletteEntry = { name: string; hex: string; role?: string; usage?: string };
export type StyleDnaTypoSlot = { family?: string; weight?: string; sizes?: string; case?: string };
export type StyleDnaData = {
  palette?: StyleDnaPaletteEntry[];
  typography?: { heading?: StyleDnaTypoSlot; body?: StyleDnaTypoSlot; caption?: StyleDnaTypoSlot };
  voice?: { adjectives?: string[]; readingGrade?: string; pointOfView?: string; toneNotes?: string };
  lexicon?: { preferred?: string[]; banned?: string[]; signaturePhrases?: string[] };
  signatureLayouts?: { name: string; description: string }[];
  logoRules?: string[];
  rules?: { dos?: string[]; donts?: string[] };
};

export type StyleDnaResponse = {
  projectId: string;
  data: StyleDnaData;
  source: "extracted" | "fallback-project" | "fallback-global" | "default";
  sourceDocumentId?: string | null;
  extractedAt?: string | null;
  updatedAt?: string | null;
};

export async function getStyleDna(projectId: string): Promise<StyleDnaResponse> {
  const res = await fetch(`${API_BASE}/style-dna/${projectId}`);
  if (!res.ok) throw new Error(`Get style DNA failed: ${res.status}`);
  return res.json();
}

export async function saveStyleDna(projectId: string, data: StyleDnaData): Promise<StyleDnaResponse> {
  const res = await fetch(`${API_BASE}/style-dna/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Save style DNA failed: ${res.status}`);
  return res.json();
}

export type StyleDnaPage = {
  id: string;
  documentId: string;
  documentName: string;
  pageIndex: number;
  objectPath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type StyleDnaPagesResponse = {
  projectId: string;
  pages: StyleDnaPage[];
};

export async function getStyleDnaPages(projectId: string): Promise<StyleDnaPagesResponse> {
  const res = await fetch(`${API_BASE}/style-dna/${projectId}/pages`);
  if (!res.ok) throw new Error(`Get style DNA pages failed: ${res.status}`);
  return res.json();
}

/**
 * Convert an /objects/<rest> path returned by the server into a fetchable URL via the
 * api-server's storage proxy. The storage router lives under the same /api mount as
 * the rest of the API, so the actual path is /api/storage/objects/<rest>.
 */
export function styleDnaPageImageUrl(objectPath: string): string {
  const stripped = objectPath.replace(/^\/objects\//, "");
  return `${API_BASE}/storage/objects/${stripped}`;
}

export async function extractStyleDna(projectId: string, sourceDocumentId?: string): Promise<StyleDnaResponse> {
  const res = await fetch(`${API_BASE}/style-dna/${projectId}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sourceDocumentId ? { sourceDocumentId } : {}),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Extract style DNA failed: ${res.status}`);
  }
  return res.json();
}

export type GenerationLogResponse = {
  deckId: string;
  log: null | {
    pipelineVersion: string;
    embeddingModel: string;
    rerankerProvider: string | null;
    outline?: { slideIndex: number; synopsis: string }[];
    retrievals: {
      slideIndex: number;
      query: string;
      chunks: {
        chunkId: string;
        documentId: string;
        documentName: string;
        score: number;
        bm25Rank?: number;
        vectorRank?: number;
        text: string;
        contextualSummary?: string | null;
        metadata?: { sourceSlideTitle?: string | null; headingPath?: string[] } | null;
      }[];
    }[];
    totalChunksConsidered: number;
    exemplarDocumentCount: number;
    styleDnaApplied: boolean;
    latencyMs: number;
    errors?: string[];
  };
  latencyMs?: number;
  qualityScore?: number | null;
  createdAt?: string;
};

export async function getDeckGenerationLog(deckId: string): Promise<GenerationLogResponse> {
  const res = await fetch(`${API_BASE}/decks/${deckId}/generation-log`);
  if (!res.ok) throw new Error(`Get generation log failed: ${res.status}`);
  return res.json();
}
