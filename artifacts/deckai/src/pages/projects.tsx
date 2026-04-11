import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListProjects,
  useCreateProject,
  useGetProject,
  useUpdateProject,
  useDeleteProject,
  useUpdateProjectLogo,
  useListCorpusDocuments,
  useUploadCorpusDocument,
  useDeleteCorpusDocument,
  getListProjectsQueryKey,
  getGetProjectQueryKey,
  getListCorpusDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, Save, FolderOpen, FileText, Loader2, Upload, Image as ImageIcon, FileDown } from "lucide-react";
import { format } from "date-fns";
import { useUpload } from "@workspace/object-storage-web";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(300).optional(),
});

const brandSchema = z.object({
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  headingFont: z.string().min(1, "Heading font is required"),
  bodyFont: z.string().min(1, "Body font is required"),
  density: z.enum(["spacious", "balanced", "dense"]),
  description: z.string().max(300).optional(),
});

type CreateProjectValues = z.infer<typeof createProjectSchema>;
type BrandValues = z.infer<typeof brandSchema>;

function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: projects, isLoading } = useListProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = async (data: CreateProjectValues) => {
    try {
      const project = await createProject.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      toast({ title: `Project "${project.name}" created` });
      setOpen(false);
      form.reset();
      onSelect(project.id);
    } catch {
      toast({ title: "Failed to create project", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${name}"? This will also remove all its corpus documents.`)) return;
    try {
      await deleteProject.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Failed to delete project", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">Each project has its own corpus documents and brand identity.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Acme Corp — Q4 Strategy" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description <span className="text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Textarea placeholder="Brief note about this client or engagement..." rows={3} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createProject.isPending}>
                      {createProject.isPending ? "Creating..." : "Create Project"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : !projects?.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-medium text-lg mb-1">No projects yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Create a project to organize your corpus and brand settings by client.</p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onSelect(project.id)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex-shrink-0"
                      style={{ background: project.primaryColor }}
                    />
                    <div>
                      <div className="font-medium">{project.name}</div>
                      {project.description && (
                        <div className="text-sm text-muted-foreground truncate max-w-md">{project.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{format(new Date(project.createdAt), "MMM d, yyyy")}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(project.id, project.name, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDetail({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { data: project, isLoading: projectLoading } = useGetProject(projectId);
  const updateProject = useUpdateProject();
  const updateLogo = useUpdateProjectLogo();
  const { data: documents, isLoading: docsLoading } = useListCorpusDocuments({ projectId });
  const uploadDoc = useUploadCorpusDocument();
  const deleteDoc = useDeleteCorpusDocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    values: project ? {
      primaryColor: project.primaryColor,
      secondaryColor: project.secondaryColor,
      accentColor: project.accentColor,
      headingFont: project.headingFont,
      bodyFont: project.bodyFont,
      density: project.density as "spacious" | "balanced" | "dense",
      description: project.description,
    } : undefined,
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      updateLogo.mutate(
        { id: projectId, data: { objectPath: response.objectPath } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
            toast({ title: "Logo updated" });
          },
          onError: () => toast({ title: "Failed to update logo", variant: "destructive" }),
        }
      );
    },
    onError: () => toast({ title: "Logo upload failed", variant: "destructive" }),
  });

  const onSubmit = async (data: BrandValues) => {
    try {
      await updateProject.mutateAsync({ id: projectId, data });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      toast({ title: "Project settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".pptx")) {
      toast({ title: "Only PDF and PPTX files are supported", variant: "destructive" });
      return;
    }
    try {
      await uploadDoc.mutateAsync({ data: { file, projectId } });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      toast({ title: "Document uploaded" });
      if (e.target) e.target.value = "";
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Remove this document from the corpus?")) return;
    try {
      await deleteDoc.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListCorpusDocumentsQueryKey() });
      toast({ title: "Document removed" });
    } catch {
      toast({ title: "Failed to remove document", variant: "destructive" });
    }
  };

  if (projectLoading) {
    return (
      <div className="flex-1 p-8 overflow-auto space-y-6 max-w-4xl mx-auto w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!project) return null;

  const projectDocs = documents?.filter((d) => d.projectId === projectId) ?? [];

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            All Projects
          </Button>
          <div>
            <h1 className="text-2xl font-serif font-semibold text-foreground tracking-tight">{project.name}</h1>
            {project.description && <p className="text-muted-foreground text-sm">{project.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Brand Settings</CardTitle>
                <CardDescription>Colors, fonts, and content density for decks in this project.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Brief note about this client or engagement..." rows={2} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="headingFont"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Heading Font</FormLabel>
                            <FormControl><Input {...field} placeholder="e.g. Playfair Display" /></FormControl>
                            <FormDescription>Google Font name</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bodyFont"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Body Font</FormLabel>
                            <FormControl><Input {...field} placeholder="e.g. Inter" /></FormControl>
                            <FormDescription>Google Font name</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      {(["primaryColor", "secondaryColor", "accentColor"] as const).map((name) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{name === "primaryColor" ? "Primary" : name === "secondaryColor" ? "Secondary" : "Accent"}</FormLabel>
                              <div className="flex gap-2">
                                <FormControl>
                                  <Input type="color" {...field} className="w-12 h-10 p-1 cursor-pointer" />
                                </FormControl>
                                <Input {...field} className="flex-1 font-mono uppercase" />
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    <FormField
                      control={form.control}
                      name="density"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Content Density</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spacious">Spacious (Marketing)</SelectItem>
                              <SelectItem value="balanced">Balanced (Standard)</SelectItem>
                              <SelectItem value="dense">Dense (Data-heavy)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={updateProject.isPending || !form.formState.isDirty}>
                      {updateProject.isPending ? "Saving..." : "Save Settings"}
                      {!updateProject.isPending && <Save className="ml-2 h-4 w-4" />}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Corpus Documents</CardTitle>
                  <CardDescription>PDFs and PPTXs that provide context for decks in this project.</CardDescription>
                </div>
                <div className="relative">
                  <Button size="sm" disabled={uploadDoc.isPending}>
                    {uploadDoc.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</> : <><Upload className="mr-2 h-4 w-4" />Upload</>}
                  </Button>
                  <Input
                    type="file"
                    accept=".pdf,.pptx"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileUpload}
                    disabled={uploadDoc.isPending}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {docsLoading ? (
                  <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : projectDocs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No documents uploaded to this project yet.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Chunks</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectDocs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium flex items-center">
                            {doc.fileType === "pdf"
                              ? <FileText className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                              : <FileDown className="h-4 w-4 text-orange-500 mr-2 flex-shrink-0" />}
                            <span className="truncate max-w-[250px]">{doc.filename}</span>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="uppercase text-[10px]">{doc.fileType}</Badge></TableCell>
                          <TableCell>
                            {doc.status === "processing" && <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>}
                            {doc.status === "ready" && <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>}
                            {doc.status === "error" && <Badge variant="destructive">Error</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{doc.chunkCount}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteDoc(doc.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Project Logo</CardTitle>
                <CardDescription>Appears on title slides for this project.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="w-full aspect-square border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 relative overflow-hidden mb-4">
                  {project.logoObjectPath ? (
                    <img src={`/api/storage${project.logoObjectPath}`} alt="Project Logo" className="w-full h-full object-contain p-4" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <span className="text-sm">No logo uploaded</span>
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} disabled={isUploading} className="cursor-pointer" />
                  {isUploading && <p className="text-sm text-center mt-2 text-muted-foreground">Uploading...</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId) {
    return <ProjectDetail projectId={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return <ProjectList onSelect={(id) => setSelectedId(id)} />;
}
