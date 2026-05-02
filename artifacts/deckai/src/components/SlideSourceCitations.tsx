import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationLogResponse } from "@/lib/ragClient";

type RetrievalEntry = NonNullable<GenerationLogResponse["log"]>["retrievals"][number];
type RetrievalChunk = RetrievalEntry["chunks"][number];

const MAX_VISIBLE_SOURCES = 3;

function formatLocation(chunk: RetrievalChunk): string {
  // The API returns source slide titles and heading paths but not 1-based slide
  // numbers (chunks come from many file types — pdf, pptx, md). Show the most
  // specific human-readable locator we have.
  if (chunk.metadata?.sourceSlideTitle) {
    return `“${chunk.metadata.sourceSlideTitle}”`;
  }
  if (chunk.metadata?.headingPath?.length) {
    return chunk.metadata.headingPath[chunk.metadata.headingPath.length - 1];
  }
  return "";
}

export function SlideSourceCitations({
  retrieval,
  className,
}: {
  retrieval: RetrievalEntry | undefined;
  className?: string;
}) {
  if (!retrieval || retrieval.chunks.length === 0) return null;

  // De-duplicate by document so we don't show "Foo.pdf, Foo.pdf, Foo.pdf" — keep
  // the highest-scoring chunk per document for the snippet shown on hover.
  const byDoc = new Map<string, RetrievalChunk>();
  for (const c of retrieval.chunks) {
    const existing = byDoc.get(c.documentId);
    if (!existing || c.score > existing.score) byDoc.set(c.documentId, c);
  }
  const sources = Array.from(byDoc.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISIBLE_SOURCES);
  const hiddenCount = byDoc.size - sources.length;

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
