import type { ChunkMetadata } from "@workspace/db";

export type RawChunk = {
  text: string;
  metadata: ChunkMetadata;
};

const MAX_CHUNK_WORDS = 320;
const SOFT_MIN_WORDS = 30;
const PARAGRAPH_BREAK = /\n\s*\n+/;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function splitLongParagraph(text: string, max = MAX_CHUNK_WORDS, overlap = 40): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return [text.trim()];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += max - overlap) {
    out.push(words.slice(i, i + max).join(" "));
    if (i + max >= words.length) break;
  }
  return out;
}

function detectHeading(line: string): { level: number; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  // Markdown-style or numbered or all-caps short lines
  const md = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (md) return { level: md[1].length, text: md[2].trim() };
  const numbered = trimmed.match(/^(\d+(?:\.\d+)*)\s+([A-Z].{2,80})$/);
  if (numbered) {
    const level = Math.min(6, numbered[1].split(".").length);
    return { level, text: numbered[2].trim() };
  }
  // ALL CAPS heading (≤8 words)
  if (
    /^[A-Z0-9][A-Z0-9 \-:&,.'()/]+$/.test(trimmed) &&
    trimmed.length <= 80 &&
    trimmed.split(/\s+/).length <= 8
  ) {
    return { level: 2, text: trimmed };
  }
  return null;
}

export function chunkPdfText(text: string): RawChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  const lines = cleaned.split("\n");

  const headingPath: string[] = [];
  const buffers: { paragraph: string; headingPath: string[] }[] = [];
  let buf: string[] = [];

  const flush = () => {
    const para = buf.join(" ").replace(/\s+/g, " ").trim();
    if (para) buffers.push({ paragraph: para, headingPath: [...headingPath] });
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = detectHeading(line);
    if (heading) {
      flush();
      while (headingPath.length >= heading.level) headingPath.pop();
      headingPath[heading.level - 1] = heading.text;
      // Trim path
      headingPath.length = heading.level;
      continue;
    }
    buf.push(trimmed);
  }
  flush();

  const chunks: RawChunk[] = [];
  let merge: { text: string; path: string[] } | null = null;
  const flushMerge = () => {
    if (merge && merge.text.trim()) {
      const pieces = splitLongParagraph(merge.text);
      for (const piece of pieces) {
        chunks.push({
          text: piece,
          metadata: {
            sectionType: "paragraph",
            headingPath: merge.path.length > 0 ? merge.path : undefined,
          },
        });
      }
    }
    merge = null;
  };

  for (const { paragraph, headingPath: path } of buffers) {
    const words = wordCount(paragraph);
    if (!merge) {
      merge = { text: paragraph, path };
    } else if (
      JSON.stringify(merge.path) === JSON.stringify(path) &&
      wordCount(merge.text) + words < MAX_CHUNK_WORDS
    ) {
      merge.text += "\n\n" + paragraph;
    } else {
      flushMerge();
      merge = { text: paragraph, path };
    }
    if (merge && wordCount(merge.text) >= MAX_CHUNK_WORDS) flushMerge();
  }
  flushMerge();

  // Drop tiny dangling fragments
  return chunks.filter((c) => wordCount(c.text) >= SOFT_MIN_WORDS || (c.metadata.headingPath ?? []).length > 0);
}

export type PptxSlide = {
  index: number;
  title: string | null;
  body: string;
  notes: string;
};

export async function extractPptxStructured(buffer: Buffer): Promise<PptxSlide[]> {
  const AdmZip = (await import("adm-zip")).default;
  const { XMLParser } = await import("fast-xml-parser");

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const aNum = parseInt(a.entryName.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      const bNum = parseInt(b.entryName.match(/slide(\d+)\.xml$/)?.[1] ?? "0");
      return aNum - bNum;
    });

  const noteEntries = new Map<number, Buffer>();
  for (const e of entries) {
    const m = e.entryName.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
    if (m) noteEntries.set(parseInt(m[1]), e.getData());
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  function extractParagraphs(node: unknown): string[] {
    // a:p paragraphs containing a:r runs with a:t text
    const out: string[] = [];
    function walk(n: unknown): string[] {
      if (typeof n === "string") return [n];
      if (Array.isArray(n)) return n.flatMap(walk);
      if (typeof n === "object" && n !== null) {
        return Object.values(n as Record<string, unknown>).flatMap(walk);
      }
      return [];
    }
    function findParagraphs(n: unknown): unknown[] {
      const found: unknown[] = [];
      function rec(x: unknown) {
        if (Array.isArray(x)) {
          x.forEach(rec);
          return;
        }
        if (x && typeof x === "object") {
          for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
            if (k === "a:p" || k === "p") {
              if (Array.isArray(v)) found.push(...v);
              else found.push(v);
            } else rec(v);
          }
        }
      }
      rec(n);
      return found;
    }
    const paragraphs = findParagraphs(node);
    for (const p of paragraphs) {
      const text = walk(p)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) out.push(text);
    }
    return out;
  }

  const slides: PptxSlide[] = [];
  for (let i = 0; i < slideEntries.length; i++) {
    try {
      const xmlContent = slideEntries[i].getData().toString("utf8");
      const parsed = parser.parse(xmlContent);
      const paragraphs = extractParagraphs(parsed);
      const title = paragraphs[0] && paragraphs[0].length <= 140 ? paragraphs[0] : null;
      const bodyParts = title ? paragraphs.slice(1) : paragraphs;
      const body = bodyParts.join("\n").trim();

      let notes = "";
      const noteBuf = noteEntries.get(i + 1);
      if (noteBuf) {
        try {
          const noteParsed = parser.parse(noteBuf.toString("utf8"));
          notes = extractParagraphs(noteParsed).join("\n").trim();
        } catch {
          // ignore
        }
      }

      if (title || body || notes) {
        slides.push({ index: i + 1, title, body, notes });
      }
    } catch {
      // skip unparseable
    }
  }
  return slides;
}

export function chunksFromPptxSlides(slides: PptxSlide[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  for (const slide of slides) {
    if (slide.title) {
      chunks.push({
        text: slide.title,
        metadata: {
          sectionType: "title",
          sourceSlideIndex: slide.index,
          sourceSlideTitle: slide.title,
        },
      });
    }
    if (slide.body) {
      const pieces = splitLongParagraph(slide.body);
      for (const piece of pieces) {
        chunks.push({
          text: piece,
          metadata: {
            sectionType: "slide",
            sourceSlideIndex: slide.index,
            sourceSlideTitle: slide.title,
          },
        });
      }
    }
    if (slide.notes) {
      const pieces = splitLongParagraph(slide.notes);
      for (const piece of pieces) {
        chunks.push({
          text: piece,
          metadata: {
            sectionType: "speaker_notes",
            sourceSlideIndex: slide.index,
            sourceSlideTitle: slide.title,
          },
        });
      }
    }
  }
  return chunks;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = await import("pdf-parse");
  const data = await pdfParse.default(buffer);
  return data.text;
}
