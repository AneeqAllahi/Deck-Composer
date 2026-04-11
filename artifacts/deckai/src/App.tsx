import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import { HomePage } from "@/pages/home";
import { BrandPage } from "@/pages/brand";
import { CorpusPage } from "@/pages/corpus";
import { GeneratePage } from "@/pages/generate";
import { DeckEditorPage } from "@/pages/deck-editor";
import { ProjectsPage, ProjectDetailPage } from "@/pages/projects";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/brand" component={BrandPage} />
        <Route path="/corpus" component={CorpusPage} />
        <Route path="/generate" component={GeneratePage} />
        <Route path="/projects" component={ProjectsPage} />
        <Route path="/projects/:id" component={ProjectDetailPage} />
        <Route path="/decks/:id" component={DeckEditorPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
