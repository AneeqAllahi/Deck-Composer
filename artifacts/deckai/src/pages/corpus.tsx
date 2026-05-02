import { useState } from "react";
import {
  useListCorpusDocuments,
  useDeleteCorpusDocument,
  useListProjects,
  getListCorpusDocumentsQueryKey,
  getGetDeckStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Upload, FileText, Trash2, Loader2, Search, FileDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { uploadCorpusDocumentWithKind, type DocumentKind } from "@/lib/ragClient";

const ALL_PROJECTS = "__all__";

export function CorpusPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(ALL_PROJECTS);
  const [uploadKind, setUploadKind] = useState<DocumentKind>("exemplar-deck");
  const [isUploading, setIsUploading] = useState(false);

  const { data: projects } = useListProjects();
  const params = selectedProjectId === ALL_PROJECTS ? undefined : { projectId: selectedProjectId };
  const { data: documents, isLoading } = useListCorpusDocuments(params);
  const deleteDoc = useDeleteCorpusDocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".pptx")) {
      toast({ title: "Invalid file type", description: "Only PDF and PPTX files are supported", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      await uploadCorpusDocumentWithKind({
        file,
        projectId: selectedProjectId === ALL_PROJECTS ? null : selectedProjectId,
        kind: uploadKind,
      });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDeckStatsQueryKey() });
      toast({
        title: "Document uploaded",
        description:
          uploadKind === "brand-guideline"
            ? "Style DNA will be extracted automatically"
            : "Indexing & contextualizing chunks…",
      });
      if (e.target) e.target.value = "";
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this document from the corpus? This will not affect existing decks.")) return;
    try {
      await deleteDoc.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDeckStatsQueryKey() });
      toast({ title: "Document removed" });
    } catch {
      toast({ title: "Failed to remove document", variant: "destructive" });
    }
  };

  const filteredDocs = (documents ?? []).filter((doc) =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Knowledge Corpus</h1>
          <p className="text-muted-foreground mt-1">Upload past consulting decks and reports to ground future generations.</p>
        </div>

        <div className="flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm">
          <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Viewing:</span>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="flex-1 h-8 border-0 shadow-none bg-transparent focus:ring-0 text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All documents (view only — generation uses project scope)</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProject && (
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: selectedProject.primaryColor }} />
          )}
        </div>

        <Card className="border-dashed border-2 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
              <Upload className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-medium mb-1">
              {selectedProjectId === ALL_PROJECTS
                ? "Upload to global corpus"
                : `Upload to "${selectedProject?.name ?? "project"}"`}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">PDF or PPTX up to 50 MB</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Document kind:</span>
              <Select value={uploadKind} onValueChange={(v) => setUploadKind(v as DocumentKind)}>
                <SelectTrigger className="h-8 w-56" data-testid="select-upload-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exemplar-deck">Exemplar Deck (retrieved per slide)</SelectItem>
                  <SelectItem value="brand-guideline">Brand Guideline (Style DNA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Button disabled={isUploading} data-testid="button-select-file">
                {isUploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                ) : "Select File"}
              </Button>
              <Input
                type="file"
                accept=".pdf,.pptx"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleUpload}
                disabled={isUploading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Indexed Documents</CardTitle>
              <CardDescription>
                {selectedProjectId === ALL_PROJECTS
                  ? "All documents across every project and the global corpus."
                  : `Documents scoped to "${selectedProject?.name}".`}
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search documents..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredDocs.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Chunks</TableHead>
                      <TableHead className="text-right">Added</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocs.map((doc) => {
                      const docProject = projects?.find((p) => p.id === doc.projectId);
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              {doc.fileType === "pdf"
                                ? <FileText className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                                : <FileDown className="h-4 w-4 text-orange-500 mr-2 flex-shrink-0" />}
                              <span className="truncate max-w-[250px]">{doc.filename}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-[10px]">{doc.fileType}</Badge>
                          </TableCell>
                          <TableCell>
                            {(doc as { kind?: string }).kind === "brand-guideline" ? (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-100 text-[10px]">
                                Brand Guideline
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-100 text-[10px]">
                                Exemplar
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {docProject ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: docProject.primaryColor }} />
                                <span className="text-sm text-muted-foreground truncate max-w-[100px]">{docProject.name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic">Global</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.status === "processing" && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
                              </Badge>
                            )}
                            {doc.status === "ready" && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>
                            )}
                            {doc.status === "error" && (
                              <Badge variant="destructive">Error</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{doc.chunkCount}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {format(new Date(doc.createdAt), "MMM d")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                {searchTerm ? "No documents found matching your search." : "No documents indexed yet."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
