import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetDeck, useUpdateSlide, useRegenerateSlide, getGetDeckQueryKey } from "@workspace/api-client-react";
import type { Deck, Slide } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Download, ChevronLeft, Wand2, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DeckEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deck, isLoading } = useGetDeck(id, { query: { enabled: !!id, queryKey: getGetDeckQueryKey(id) } });
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);

  if (isLoading || !deck) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const selectedSlide = deck.slides.find(s => s.slideIndex === selectedSlideIndex) ?? deck.slides[0];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-14 border-b flex items-center justify-between px-4 bg-background z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-to-library">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="font-medium line-clamp-1 max-w-md" data-testid="text-deck-title">{deck.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/decks/${deck.id}/export`} download data-testid="link-export-pptx">
            <Button size="sm" variant="outline" className="h-8">
              <Download className="mr-2 h-4 w-4" /> Export PPTX
            </Button>
          </a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r bg-muted/20 flex flex-col shrink-0">
          <div className="p-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
            Slides ({deck.slides.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {deck.slides.map((slide, i) => (
                <button
                  key={slide.slideIndex}
                  data-testid={`button-slide-${slide.slideIndex}`}
                  onClick={() => setSelectedSlideIndex(slide.slideIndex)}
                  className={cn(
                    "w-full text-left p-3 rounded-md text-sm transition-colors border group relative",
                    selectedSlideIndex === slide.slideIndex
                      ? "bg-background border-primary/30 shadow-sm"
                      : "bg-transparent border-transparent hover:bg-muted"
                  )}
                >
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-4 shrink-0 font-mono text-xs mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{slide.title || "Untitled Slide"}</div>
                      <div className="text-xs text-muted-foreground mt-1 capitalize opacity-80">{slide.layoutType}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          <div className="flex-1 p-8 overflow-auto flex items-center justify-center">
            {selectedSlide && <SlideCanvas deckId={deck.id} slide={selectedSlide} />}
          </div>

          {selectedSlide && (
            <div className="h-48 border-t bg-background shrink-0 flex flex-col">
              <div className="px-4 py-2 border-b flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/30">
                <MessageSquare className="h-3 w-3" /> Speaker Notes
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <p className="text-sm leading-relaxed" data-testid="text-speaker-notes">
                  {selectedSlide.speakerNotes || "No speaker notes generated."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlideCanvas({ deckId, slide }: { deckId: string; slide: Slide }) {
  const updateSlide = useUpdateSlide();
  const regenerateSlide = useRegenerateSlide();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [isEditingColumnLeft, setIsEditingColumnLeft] = useState(false);
  const [isEditingColumnRight, setIsEditingColumnRight] = useState(false);
  const [titleVal, setTitleVal] = useState(slide.title);
  const [bodyVal, setBodyVal] = useState(slide.body);
  const [columnLeftVal, setColumnLeftVal] = useState(slide.columnLeft ?? "");
  const [columnRightVal, setColumnRightVal] = useState(slide.columnRight ?? "");
  const [regenInstruction, setRegenInstruction] = useState("");

  useEffect(() => {
    setTitleVal(slide.title);
    setBodyVal(slide.body);
    setColumnLeftVal(slide.columnLeft ?? "");
    setColumnRightVal(slide.columnRight ?? "");
    setIsEditingTitle(false);
    setIsEditingBody(false);
    setIsEditingColumnLeft(false);
    setIsEditingColumnRight(false);
  }, [slide.slideIndex]);

  const updateLocalSlide = (patch: Partial<Slide>) => {
    queryClient.setQueryData<Deck>(getGetDeckQueryKey(deckId), (old) => {
      if (!old) return old;
      return {
        ...old,
        slides: old.slides.map((s) =>
          s.slideIndex === slide.slideIndex ? { ...s, ...patch } : s
        ),
      };
    });
  };

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    if (titleVal === slide.title) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { title: titleVal } });
      updateLocalSlide({ title: titleVal });
    } catch {
      setTitleVal(slide.title);
      toast({ title: "Failed to save title", variant: "destructive" });
    }
  };

  const handleSaveBody = async () => {
    setIsEditingBody(false);
    if (bodyVal === slide.body) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { body: bodyVal } });
      updateLocalSlide({ body: bodyVal });
    } catch {
      setBodyVal(slide.body);
      toast({ title: "Failed to save body", variant: "destructive" });
    }
  };

  const handleSaveColumnLeft = async () => {
    setIsEditingColumnLeft(false);
    if (columnLeftVal === (slide.columnLeft ?? "")) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { columnLeft: columnLeftVal } });
      updateLocalSlide({ columnLeft: columnLeftVal });
    } catch {
      setColumnLeftVal(slide.columnLeft ?? "");
      toast({ title: "Failed to save column", variant: "destructive" });
    }
  };

  const handleSaveColumnRight = async () => {
    setIsEditingColumnRight(false);
    if (columnRightVal === (slide.columnRight ?? "")) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { columnRight: columnRightVal } });
      updateLocalSlide({ columnRight: columnRightVal });
    } catch {
      setColumnRightVal(slide.columnRight ?? "");
      toast({ title: "Failed to save column", variant: "destructive" });
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerateSlide.mutateAsync({
        id: deckId,
        slideIndex: slide.slideIndex,
        data: { instruction: regenInstruction || undefined },
      });
      queryClient.invalidateQueries({ queryKey: getGetDeckQueryKey(deckId) });
      setRegenInstruction("");
      toast({ title: "Slide regenerated" });
    } catch {
      toast({ title: "Regeneration failed", variant: "destructive" });
    }
  };

  const EditableTitle = ({ className }: { className?: string }) => (
    isEditingTitle ? (
      <Input
        autoFocus
        data-testid="input-slide-title"
        value={titleVal}
        onChange={e => setTitleVal(e.target.value)}
        onBlur={handleSaveTitle}
        onKeyDown={e => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") { setTitleVal(slide.title); setIsEditingTitle(false); } }}
        className={cn("border-dashed h-auto py-2", className)}
      />
    ) : (
      <h1
        data-testid="text-slide-title"
        className={cn("hover:bg-black/5 p-2 rounded cursor-pointer transition-colors -ml-2", className)}
        onClick={() => setIsEditingTitle(true)}
      >
        {slide.title}
      </h1>
    )
  );

  const EditableBody = ({ className, rows = 3 }: { className?: string; rows?: number }) => (
    isEditingBody ? (
      <Textarea
        autoFocus
        data-testid="input-slide-body"
        value={bodyVal}
        onChange={e => setBodyVal(e.target.value)}
        onBlur={handleSaveBody}
        className={cn("border-dashed resize-none", className)}
        rows={rows}
      />
    ) : (
      <p
        data-testid="text-slide-body"
        className={cn("hover:bg-black/5 p-2 rounded cursor-pointer transition-colors -ml-2 whitespace-pre-wrap", className)}
        onClick={() => setIsEditingBody(true)}
      >
        {slide.body}
      </p>
    )
  );

  const renderContent = () => {
    switch (slide.layoutType) {
      case "title":
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-12">
            <EditableTitle className="text-4xl font-serif font-bold mb-6" />
            <div className="w-16 h-1 bg-primary mb-6 mx-auto" />
            <EditableBody className="text-xl text-muted-foreground max-w-2xl" rows={3} />
          </div>
        );

      case "section":
        return (
          <div className="flex flex-col justify-center h-full p-16 bg-primary text-primary-foreground">
            <h2 className="text-sm uppercase tracking-widest opacity-80 mb-4">Section {slide.slideIndex}</h2>
            <EditableTitle className="text-4xl font-serif font-bold mb-4 text-white" />
            <EditableBody className="text-lg opacity-90 max-w-2xl text-white" rows={3} />
          </div>
        );

      case "columns":
        return (
          <div className="flex flex-col h-full p-12">
            <EditableTitle className="text-2xl font-serif font-bold mb-8 pb-4 border-b" />
            <div className="grid grid-cols-2 gap-8 flex-1">
              <div className="flex flex-col">
                {isEditingColumnLeft ? (
                  <Textarea
                    autoFocus
                    data-testid="input-column-left"
                    value={columnLeftVal}
                    onChange={e => setColumnLeftVal(e.target.value)}
                    onBlur={handleSaveColumnLeft}
                    className="border-dashed resize-none flex-1 text-sm"
                  />
                ) : (
                  <div
                    data-testid="text-column-left"
                    className="text-sm hover:bg-black/5 p-3 rounded cursor-pointer transition-colors flex-1 whitespace-pre-wrap"
                    onClick={() => setIsEditingColumnLeft(true)}
                  >
                    {slide.columnLeft || <span className="text-muted-foreground italic">Click to edit left column</span>}
                  </div>
                )}
              </div>
              <div className="flex flex-col border-l pl-8">
                {isEditingColumnRight ? (
                  <Textarea
                    autoFocus
                    data-testid="input-column-right"
                    value={columnRightVal}
                    onChange={e => setColumnRightVal(e.target.value)}
                    onBlur={handleSaveColumnRight}
                    className="border-dashed resize-none flex-1 text-sm"
                  />
                ) : (
                  <div
                    data-testid="text-column-right"
                    className="text-sm hover:bg-black/5 p-3 rounded cursor-pointer transition-colors flex-1 whitespace-pre-wrap"
                    onClick={() => setIsEditingColumnRight(true)}
                  >
                    {slide.columnRight || <span className="text-muted-foreground italic">Click to edit right column</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "quote":
        return (
          <div className="flex flex-col items-center justify-center h-full p-16 text-center">
            <div className="text-8xl font-serif text-primary/20 leading-none mb-4">&ldquo;</div>
            <EditableTitle className="text-2xl font-serif italic mb-8 max-w-2xl" />
            <EditableBody className="text-sm text-muted-foreground" rows={2} />
          </div>
        );

      case "metrics":
        return (
          <div className="flex flex-col h-full p-12">
            <EditableTitle className="text-2xl font-serif font-bold mb-8 pb-4 border-b" />
            <div className="grid grid-cols-2 gap-6 flex-1 content-center">
              {slide.metrics && slide.metrics.length > 0 ? (
                slide.metrics.map((m, i) => (
                  <div key={i} className="bg-muted/30 p-6 rounded-xl border flex flex-col items-center justify-center text-center">
                    <div className="text-4xl font-bold text-primary mb-2" data-testid={`text-metric-value-${i}`}>{m.value}</div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider" data-testid={`text-metric-label-${i}`}>{m.label}</div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center text-muted-foreground text-sm">No metrics defined</div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col h-full p-12">
            <EditableTitle className="text-2xl font-serif font-bold mb-6 pb-4 border-b" />
            <div className="flex-1 flex flex-col gap-4">
              <EditableBody className="text-base" rows={4} />
              {!isEditingBody && slide.bulletPoints && slide.bulletPoints.length > 0 && (
                <ul className="space-y-2 list-disc pl-5 text-sm">
                  {slide.bulletPoints.map((bp, i) => (
                    <li key={i} data-testid={`text-bullet-${i}`}>{bp}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="relative group w-full max-w-[960px] aspect-[16/9] bg-white rounded-xl shadow-lg shadow-black/5 border overflow-hidden flex flex-col">
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary" className="shadow-md h-8 text-xs font-medium" data-testid="button-regenerate-slide">
              <Wand2 className="mr-2 h-3 w-3" /> Regenerate
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm">Regenerate Slide</h4>
                <p className="text-xs text-muted-foreground mt-1">Provide optional instructions to guide the AI.</p>
              </div>
              <Textarea
                data-testid="input-regen-instruction"
                placeholder="e.g. Make the tone more aggressive, add a metric about growth..."
                className="text-sm min-h-[80px]"
                value={regenInstruction}
                onChange={e => setRegenInstruction(e.target.value)}
              />
              <Button
                size="sm"
                className="w-full"
                data-testid="button-generate-new-version"
                onClick={handleRegenerate}
                disabled={regenerateSlide.isPending}
              >
                {regenerateSlide.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Wand2 className="h-3 w-3 mr-2" />}
                Generate New Version
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 relative">
        {regenerateSlide.isPending ? (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <div className="text-sm font-medium">Synthesizing new slide...</div>
          </div>
        ) : null}
        {renderContent()}
      </div>
    </div>
  );
}
