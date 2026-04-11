import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetDeck, useUpdateSlide, useRegenerateSlide, getGetDeckQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Download, ChevronLeft, LayoutTemplate, Wand2, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Slide, SlideLayoutType } from "@workspace/api-client-react";

export function DeckEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deck, isLoading } = useGetDeck(id, { query: { enabled: !!id, queryKey: getGetDeckQueryKey(id) } });
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);

  if (isLoading || !deck) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const selectedSlide = deck.slides.find(s => s.slideIndex === selectedSlideIndex) || deck.slides[0];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-background z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="font-medium line-clamp-1 max-w-md">{deck.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/decks/${deck.id}/export`} download>
            <Button size="sm" variant="outline" className="h-8">
              <Download className="mr-2 h-4 w-4" /> Export PPTX
            </Button>
          </a>
        </div>
      </header>

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide List Sidebar */}
        <div className="w-64 border-r bg-muted/20 flex flex-col shrink-0">
          <div className="p-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
            Slides ({deck.slides.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {deck.slides.map((slide, i) => (
                <button
                  key={slide.slideIndex}
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

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          <div className="flex-1 p-8 overflow-auto flex items-center justify-center">
            {selectedSlide && <SlideCanvas deckId={deck.id} slide={selectedSlide} />}
          </div>
          
          {/* Speaker Notes Panel */}
          {selectedSlide && (
            <div className="h-48 border-t bg-background shrink-0 flex flex-col">
              <div className="px-4 py-2 border-b flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/30">
                <MessageSquare className="h-3 w-3" /> Speaker Notes
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <p className="text-sm leading-relaxed">{selectedSlide.speakerNotes || "No speaker notes generated."}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlideCanvas({ deckId, slide }: { deckId: string, slide: Slide }) {
  const updateSlide = useUpdateSlide();
  const regenerateSlide = useRegenerateSlide();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingBody, setIsEditingEditingBody] = useState(false);
  const [titleVal, setTitleVal] = useState(slide.title);
  const [bodyVal, setBodyVal] = useState(slide.body);
  const [regenInstruction, setRegenInstruction] = useState("");

  // Sync state when slide changes
  useEffect(() => {
    setTitleVal(slide.title);
    setBodyVal(slide.body);
    setIsEditingTitle(false);
    setIsEditingEditingBody(false);
  }, [slide.slideIndex, slide.title, slide.body]);

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    if (titleVal === slide.title) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { title: titleVal } });
      queryClient.setQueryData(getGetDeckQueryKey(deckId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          slides: old.slides.map((s: Slide) => s.slideIndex === slide.slideIndex ? { ...s, title: titleVal } : s)
        };
      });
    } catch (e) {
      setTitleVal(slide.title);
      toast({ title: "Failed to save title", variant: "destructive" });
    }
  };

  const handleSaveBody = async () => {
    setIsEditingEditingBody(false);
    if (bodyVal === slide.body) return;
    try {
      await updateSlide.mutateAsync({ id: deckId, slideIndex: slide.slideIndex, data: { body: bodyVal } });
      queryClient.setQueryData(getGetDeckQueryKey(deckId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          slides: old.slides.map((s: Slide) => s.slideIndex === slide.slideIndex ? { ...s, body: bodyVal } : s)
        };
      });
    } catch (e) {
      setBodyVal(slide.body);
      toast({ title: "Failed to save body", variant: "destructive" });
    }
  };

  const handleRegenerate = async () => {
    try {
      await regenerateSlide.mutateAsync({ 
        id: deckId, 
        slideIndex: slide.slideIndex, 
        data: { instruction: regenInstruction || undefined } 
      });
      queryClient.invalidateQueries({ queryKey: getGetDeckQueryKey(deckId) });
      toast({ title: "Slide regenerating" });
    } catch (e) {
      toast({ title: "Regeneration failed", variant: "destructive" });
    }
  };

  const renderContent = () => {
    switch (slide.layoutType) {
      case "title":
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-12">
            {isEditingTitle ? (
              <Input 
                autoFocus
                value={titleVal} 
                onChange={e => setTitleVal(e.target.value)} 
                onBlur={handleSaveTitle}
                className="text-4xl font-serif font-bold text-center border-dashed mb-6 h-auto py-2"
              />
            ) : (
              <h1 
                className="text-4xl font-serif font-bold mb-6 hover:bg-black/5 p-2 rounded cursor-pointer transition-colors"
                onClick={() => setIsEditingTitle(true)}
              >
                {slide.title}
              </h1>
            )}
            <div className="w-16 h-1 bg-primary mb-6 mx-auto"></div>
            {isEditingBody ? (
              <Textarea 
                autoFocus
                value={bodyVal} 
                onChange={e => setBodyVal(e.target.value)} 
                onBlur={handleSaveBody}
                className="text-xl text-muted-foreground text-center border-dashed resize-none"
                rows={3}
              />
            ) : (
              <p 
                className="text-xl text-muted-foreground max-w-2xl hover:bg-black/5 p-2 rounded cursor-pointer transition-colors"
                onClick={() => setIsEditingEditingBody(true)}
              >
                {slide.body}
              </p>
            )}
          </div>
        );
      
      case "section":
        return (
          <div className="flex flex-col justify-center h-full p-16 bg-primary text-primary-foreground">
            <h2 className="text-sm uppercase tracking-widest opacity-80 mb-4">Section {slide.slideIndex}</h2>
            {isEditingTitle ? (
              <Input 
                autoFocus
                value={titleVal} 
                onChange={e => setTitleVal(e.target.value)} 
                onBlur={handleSaveTitle}
                className="text-4xl font-serif font-bold border-dashed mb-4 h-auto py-2 bg-transparent text-white placeholder:text-white/50"
              />
            ) : (
              <h1 
                className="text-4xl font-serif font-bold mb-4 hover:bg-white/10 p-2 rounded cursor-pointer transition-colors -ml-2"
                onClick={() => setIsEditingTitle(true)}
              >
                {slide.title}
              </h1>
            )}
             {isEditingBody ? (
              <Textarea 
                autoFocus
                value={bodyVal} 
                onChange={e => setBodyVal(e.target.value)} 
                onBlur={handleSaveBody}
                className="text-lg opacity-90 border-dashed resize-none bg-transparent text-white"
                rows={3}
              />
            ) : (
              <p 
                className="text-lg opacity-90 max-w-2xl hover:bg-white/10 p-2 rounded cursor-pointer transition-colors -ml-2"
                onClick={() => setIsEditingEditingBody(true)}
              >
                {slide.body}
              </p>
            )}
          </div>
        );

      case "columns":
        return (
          <div className="flex flex-col h-full p-12">
            {isEditingTitle ? (
              <Input 
                autoFocus
                value={titleVal} 
                onChange={e => setTitleVal(e.target.value)} 
                onBlur={handleSaveTitle}
                className="text-2xl font-serif font-bold border-dashed mb-8 h-auto py-2"
              />
            ) : (
              <h1 
                className="text-2xl font-serif font-bold mb-8 pb-4 border-b hover:bg-black/5 p-2 rounded cursor-pointer transition-colors -ml-2"
                onClick={() => setIsEditingTitle(true)}
              >
                {slide.title}
              </h1>
            )}
            <div className="grid grid-cols-2 gap-12 flex-1">
              <div className="prose max-w-none text-sm">
                <div dangerouslySetContent={{__html: slide.columnLeft || ''}} />
              </div>
              <div className="prose max-w-none text-sm">
                 <div dangerouslySetContent={{__html: slide.columnRight || ''}} />
              </div>
            </div>
          </div>
        );

      default: // text, metrics, quote fallback
        return (
          <div className="flex flex-col h-full p-12">
            {isEditingTitle ? (
              <Input 
                autoFocus
                value={titleVal} 
                onChange={e => setTitleVal(e.target.value)} 
                onBlur={handleSaveTitle}
                className="text-2xl font-serif font-bold border-dashed mb-8 h-auto py-2"
              />
            ) : (
              <h1 
                className="text-2xl font-serif font-bold mb-8 pb-4 border-b hover:bg-black/5 p-2 rounded cursor-pointer transition-colors -ml-2"
                onClick={() => setIsEditingTitle(true)}
              >
                {slide.title}
              </h1>
            )}
            <div className="flex-1 flex flex-col gap-6">
               {isEditingBody ? (
                <Textarea 
                  autoFocus
                  value={bodyVal} 
                  onChange={e => setBodyVal(e.target.value)} 
                  onBlur={handleSaveBody}
                  className="text-base flex-1 border-dashed resize-none"
                />
              ) : (
                <div 
                  className="text-base prose max-w-none hover:bg-black/5 p-4 rounded cursor-pointer transition-colors -ml-4 flex-1 whitespace-pre-wrap"
                  onClick={() => setIsEditingEditingBody(true)}
                >
                  {slide.body}
                  
                  {slide.bulletPoints && slide.bulletPoints.length > 0 && (
                    <ul className="mt-4 space-y-2 list-disc pl-5">
                      {slide.bulletPoints.map((bp, i) => (
                        <li key={i}>{bp}</li>
                      ))}
                    </ul>
                  )}
                  
                  {slide.metrics && slide.metrics.length > 0 && (
                    <div className="grid grid-cols-3 gap-4 mt-8 not-prose">
                      {slide.metrics.map((m, i) => (
                        <div key={i} className="bg-muted/30 p-4 rounded-lg border">
                          <div className="text-3xl font-bold text-primary mb-1">{m.value}</div>
                          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="relative group w-full max-w-[960px] aspect-[16/9] bg-white rounded-xl shadow-lg shadow-black/5 border overflow-hidden flex flex-col">
      {/* Slide Toolbar (Absolute positioned, appears on hover) */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary" className="shadow-md h-8 text-xs font-medium">
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
                placeholder="e.g. Make the tone more aggressive, add a metric about growth..." 
                className="text-sm min-h-[80px]"
                value={regenInstruction}
                onChange={e => setRegenInstruction(e.target.value)}
              />
              <Button size="sm" className="w-full" onClick={handleRegenerate} disabled={regenerateSlide.isPending}>
                {regenerateSlide.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Wand2 className="h-3 w-3 mr-2" />}
                Generate New Version
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Slide Canvas Content */}
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
