import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationLogResponse } from "@/lib/ragClient";

type RetrievalEntry = NonNullable<GenerationLogResponse["log"]>["retrievals"][number];
type RetrievalChunk = RetrievalEntry["chunks"][number];

const MAX_VISIBLE_SOURCES = 3;

function formatLocation(chunk: RetrievalChunk): string {
  // Prefer a concrete locator (slide N / page N) so users can find the exact
  // place in the source. Fall back to the slide title or last heading when
  // the chunk doesn't carry a numeric index (e.g. plain markdown).
  const m = chunk.metadata;
  if (m?.sourceSlideIndex != null) {
    const n = m.sourceSlideIndex + 1; // chunker stores 0-based; humans want 1-based
    return m.sourceSlideTitle ? `slide ${n} — ${m.sourceSlideTitle}` : `slide ${n}`;
  }
  if (m?.pageNumber != null) {
    return `page ${m.pageNumber}`;
  }
  if (m?.sourceSlideTitle) {
    return `“${m.sourceSlideTitle}”`;
  }
  if (m?.headingPath?.length) {
    return m.headingPath[m.headingPath.length - 1];
  }
  return "";
}

function locationKey(chunk: RetrievalChunk): string {
  // Group identifier so the same doc + same slide/page collapses, but two
  // different slides from the same exemplar deck both surface as distinct
  // citations (e.g. "Q3 Investor Deck.pdf, slide 4" + "…, slide 12").
  const m = chunk.metadata;
  if (m?.sourceSlideIndex != null) return `${chunk.documentId}#s${m.sourceSlideIndex}`;
  if (m?.pageNumber != null) return `${chunk.documentId}#p${m.pageNumber}`;
  if (m?.headingPath?.length) return `${chunk.documentId}#h${m.headingPath.join(">")}`;
  return `${chunk.documentId}`;
}

export function SlideSourceCitations({
  retrieval,
  className,
}: {
  retrieval: RetrievalEntry | undefined;
  className?: string;
}) {
  if (!retrieval || retrieval.chunks.length === 0) return null;

  // De-duplicate by (document + location) so the same chunk doesn't repeat,
  // but two different slides/pages from the same exemplar both show up as
  // distinct citations. Keep the highest-scoring chunk per location for the
  // snippet shown on hover.
  const byLocation = new Map<string, RetrievalChunk>();
  for (const c of retrieval.chunks) {
    const key = locationKey(c);
    const existing = byLocation.get(key);
    if (!existing || c.score > existing.score) byLocation.set(key, c);
  }
  const sources = Array.from(byLocation.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISIBLE_SOURCES);
  const hiddenCount = byLocation.size - sources.length;

  return (
    <div
      data-testid="slide-source-citations"
      className={cn(
        "flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className="uppercase tracking-wider font-medium text-[10px] opacity-70">
        Sources
      </span>
      {sources.map((c, i) => {
        const location = formatLocation(c);
        return (
          <HoverCard key={c.chunkId} openDelay={150} closeDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                data-testid={`citation-${i}`}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors max-w-[240px]"
              >
                <FileText className="h-3 w-3 shrink-0 opacity-70" />
                <span className="truncate">
                  {c.documentName}
                  {location ? <span className="opacity-70">, {location}</span> : null}
                </span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="start"
              className="w-96 text-xs p-3 space-y-2"
              data-testid={`citation-snippet-${i}`}
            >
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.documentName}</div>
                  {location ? (
                    <div className="text-muted-foreground text-[11px]">{location}</div>
                  ) : null}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {c.score.toFixed(2)}
                </span>
              </div>
              {c.contextualSummary ? (
                <div className="italic text-muted-foreground line-clamp-2">
                  {c.contextualSummary}
                </div>
              ) : null}
              <div className="line-clamp-6 whitespace-pre-wrap leading-relaxed">
                {c.text}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
      {hiddenCount > 0 ? (
        <span className="opacity-70">+{hiddenCount} more</span>
      ) : null}
    </div>
  );
}
