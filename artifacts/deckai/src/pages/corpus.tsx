import { useState } from "react";
import { useListCorpusDocuments, useUploadCorpusDocument, useDeleteCorpusDocument, getListCorpusDocumentsQueryKey, getGetDeckStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Upload, FileText, Trash2, Loader2, Search, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function CorpusPage() {
  const { data: documents, isLoading } = useListCorpusDocuments();
  const uploadDoc = useUploadCorpusDocument();
  const deleteDoc = useDeleteCorpusDocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.pptx')) {
      toast({ title: "Invalid file type", description: "Only PDF and PPTX files are supported", variant: "destructive" });
      return;
    }

    try {
      await uploadDoc.mutateAsync({ data: { file } });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDeckStatsQueryKey() });
      toast({ title: "Document uploaded successfully", description: "Processing started" });
      if (e.target) e.target.value = ''; // reset input
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this document from the corpus? This will not affect existing decks.")) return;
    try {
      await deleteDoc.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDeckStatsQueryKey() });
      toast({ title: "Document removed" });
    } catch (error) {
      toast({ title: "Failed to remove document", variant: "destructive" });
    }
  };

  const filteredDocs = documents?.filter(doc => 
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Knowledge Corpus</h1>
          <p className="text-muted-foreground mt-1">Upload past consulting decks and reports to ground future generations.</p>
        </div>

        <Card className="border-dashed border-2 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
              <Upload className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-medium mb-1">Upload knowledge document</h3>
            <p className="text-sm text-muted-foreground mb-6">Drag and drop or click to browse (PDF, PPTX up to 50MB)</p>
            <div className="relative">
              <Button disabled={uploadDoc.isPending}>
                {uploadDoc.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : "Select File"}
              </Button>
              <Input 
                type="file" 
                accept=".pdf,.pptx" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleUpload}
                disabled={uploadDoc.isPending}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Indexed Documents</CardTitle>
              <CardDescription>These documents provide context for deck generation.</CardDescription>
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
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Chunks</TableHead>
                      <TableHead className="text-right">Added</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium flex items-center">
                          {doc.fileType === 'pdf' ? (
                            <FileText className="h-4 w-4 text-red-500 mr-2" />
                          ) : (
                            <FileDown className="h-4 w-4 text-orange-500 mr-2" />
                          )}
                          <span className="truncate max-w-[300px]">{doc.filename}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-[10px]">{doc.fileType}</Badge>
                        </TableCell>
                        <TableCell>
                          {doc.status === 'processing' && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
                            </Badge>
                          )}
                          {doc.status === 'ready' && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                              Ready
                            </Badge>
                          )}
                          {doc.status === 'error' && (
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
                    ))}
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
