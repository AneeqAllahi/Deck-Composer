import { useListDecks, useGetDeckStats, useDeleteDeck, getListDecksQueryKey, getGetDeckStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { PlusCircle, FileText, BarChart3, Database, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export function HomePage() {
  const { data: decks, isLoading: isDecksLoading } = useListDecks();
  const { data: stats, isLoading: isStatsLoading } = useGetDeckStats();
  const deleteDeck = useDeleteDeck();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this deck?")) return;
    try {
      await deleteDeck.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListDecksQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDeckStatsQueryKey() });
      toast({ title: "Deck deleted" });
    } catch (err) {
      toast({ title: "Error deleting deck", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50">
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Deck Library</h1>
            <p className="text-muted-foreground mt-1">Manage and edit your generated client presentations.</p>
          </div>
          <Link href="/generate">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Deck
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Decks" value={stats?.totalDecks} icon={FileText} loading={isStatsLoading} />
          <StatsCard title="Slides Generated" value={stats?.totalSlidesGenerated} icon={BarChart3} loading={isStatsLoading} />
          <StatsCard title="Corpus Documents" value={stats?.totalCorpusDocuments} icon={Database} loading={isStatsLoading} />
          <StatsCard title="Total Chunks" value={stats?.totalChunks} icon={Database} loading={isStatsLoading} />
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-medium tracking-tight">Recent Decks</h2>
          
          {isDecksLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : decks && decks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {decks.map(deck => (
                <Card key={deck.id} className="flex flex-col hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-lg leading-tight line-clamp-2">{deck.title}</CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(deck.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription className="text-xs">
                      {format(new Date(deck.createdAt), "MMM d, yyyy")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {deck.brief}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-0 flex items-center justify-between border-t p-4 bg-muted/20">
                    <div className="text-xs font-medium text-muted-foreground">
                      {deck.slideCount} slides
                    </div>
                    <Link href={`/decks/${deck.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-primary">
                        Open <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white border rounded-xl border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No decks yet</h3>
              <p className="text-muted-foreground mt-1 mb-4">Generate your first consulting deck to get started.</p>
              <Link href="/generate">
                <Button>Create a Deck</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, loading }: { title: string; value?: number; icon: LucideIcon; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value || 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
