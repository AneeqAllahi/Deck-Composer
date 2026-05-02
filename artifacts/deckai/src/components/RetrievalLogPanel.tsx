import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileSearch, X } from "lucide-react";
import { getDeckGenerationLog, type GenerationLogResponse } from "@/lib/ragClient";

export function RetrievalLogPanel({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<GenerationLogResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDeckGenerationLog(deckId)
      .then(setLog)
      .catch(() => setLog(null))
      .finally(() => setLoading(false));
  }, [deckId, open]);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setOpen(true)}
        data-testid="button-open-retrieval-log"
      >
        <FileSearch className="h-3 w-3 mr-2" />
        Retrieval Log
      </Button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[460px] bg-background border-l shadow-2xl z-50 flex flex-col">
      <div className="h-12 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-medium text-sm">
          <FileSearch className="h-4 w-4 text-primary" /> Retrieval Telemetry
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 text-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !log?.log ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              No generation log recorded for this deck.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Pipeline</div>
                  <div className="font-mono">{log.log.pipelineVersion}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Latency</div>
                  <div className="font-mono">{log.log.latencyMs}ms</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Embedding</div>
                  <div className="font-mono truncate">{log.log.embeddingModel}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Reranker</div>
                  <div className="font-mono truncate">{log.log.rerankerProvider ?? "none"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Style DNA</div>
                  <div>{log.log.styleDnaApplied ? "extracted" : "fallback"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Exemplar docs</div>
                  <div>{log.log.exemplarDocumentCount}</div>
                </div>
              </div>

              {log.log.errors?.length ? (
                <div className="rounded border border-destructive/30 bg-destructive/5 text-xs p-2">
                  <div className="font-medium text-destructive mb-1">Errors</div>
                  <ul className="list-disc pl-4">
                    {log.log.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {log.log.outline?.length ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Outline</div>
                  <ul className="space-y-1 text-xs">
                    {log.log.outline.map((o) => (
                      <li key={o.slideIndex} className="flex gap-2">
                        <span className="font-mono text-muted-foreground w-6 flex-shrink-0">
                          {o.slideIndex + 1}
                        </span>
                        <span>{o.synopsis}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Per-slide retrievals ({log.log.totalChunksConsidered} chunks)
                </div>
                <div className="space-y-2">
                  {log.log.retrievals.map((r) => (
                    <div key={r.slideIndex} className="border rounded p-2">
                      <div className="text-xs font-medium mb-1">
                        Slide {r.slideIndex + 1}{" "}
                        <Badge variant="outline" className="text-[10px]">
                          {r.chunks.length} chunks
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground italic mb-1.5 line-clamp-2">
                        query: {r.query}
                      </div>
                      <div className="space-y-1.5">
                        {r.chunks.map((c) => (
                          <div key={c.chunkId} className="text-[11px] bg-muted/40 rounded p-1.5">
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-medium truncate flex-1">{c.documentName}</span>
                              <span className="font-mono text-muted-foreground">
                                {c.score.toFixed(3)}
                              </span>
                              {c.bm25Rank !== undefined && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  BM25 #{c.bm25Rank}
                                </Badge>
                              )}
                              {c.vectorRank !== undefined && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1">
                                  vec #{c.vectorRank}
                                </Badge>
                              )}
                            </div>
                            {c.contextualSummary && (
                              <div className="text-muted-foreground italic line-clamp-2 mb-0.5">
                                {c.contextualSummary}
                              </div>
                            )}
                            <div className="line-clamp-3">{c.text}</div>
                          </div>
                        ))}
                        {r.chunks.length === 0 && (
                          <div className="text-[11px] text-muted-foreground italic">
                            No exemplars retrieved.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
