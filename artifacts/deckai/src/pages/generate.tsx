import { useForm, useFieldArray, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useGenerateDeck, useListProjects, GenerateDeckBodyNarrativeStructure } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Target, AlignLeft, FolderOpen, ListOrdered, ImagePlus, X, Type } from "lucide-react";

type GenerationMode = "brief" | "slide-by-slide";

const generateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title is too long"),
  brief: z.string().max(2000, "Brief is too long"),
  audience: z.string().min(2, "Please specify the audience"),
  slideCount: z.number().min(3).max(30),
  narrativeStructure: z.nativeEnum(GenerateDeckBodyNarrativeStructure),
  projectId: z.string().optional(),
  mode: z.enum(["brief", "slide-by-slide"]),
  slideOutlines: z.array(z.object({
    slideIndex: z.number(),
    title: z.string().optional(),
    guidance: z.string(),
    imageObjectPath: z.string().nullable().optional(),
  })).optional(),
}).superRefine((data, ctx) => {
  if (data.mode === "brief" && data.brief.trim().length < 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["brief"],
      message: "Brief needs at least 20 characters to generate a quality deck",
    });
  }
});

type GenerateFormValues = z.infer<typeof generateSchema>;

const NO_PROJECT = "__none__";

function SlideOutlineCard({
  index,
  totalSlides,
  control,
  onImageUploaded,
  onImageRemoved,
  imageObjectPath,
}: {
  index: number;
  totalSlides: number;
  control: Control<GenerateFormValues>;
  onImageUploaded: (path: string) => void;
  onImageRemoved: () => void;
  imageObjectPath?: string | null;
}) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response: { objectPath: string }) => {
      onImageUploaded(response.objectPath);
    },
    onError: () => toast({ title: "Image upload failed", variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-mono font-semibold text-primary">
          {index + 1}
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Slide {index + 1} of {totalSlides}</span>
      </div>

      <FormField
        control={control}
        name={`slideOutlines.${index}.title`}
        render={({ field }) => (
          <FormItem className="mb-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Type className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Title</span>
            </div>
            <FormControl>
              <Input
                placeholder="Leave blank for AI to decide…"
                className="h-8 text-sm"
                {...field}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`slideOutlines.${index}.guidance`}
        render={({ field }) => (
          <FormItem className="mb-0">
            <div className="flex items-center gap-1.5 mb-1">
              <AlignLeft className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Instructions</span>
            </div>
            <FormControl>
              <Textarea
                placeholder={`e.g. "Focus on market sizing data" or "Include CEO quote"`}
                className="min-h-[60px] text-sm resize-none"
                {...field}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <ImagePlus className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Image / Logo</span>
        </div>
        {imageObjectPath ? (
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
            <img
              src={`/api/storage${imageObjectPath}`}
              alt="Slide image"
              className="h-10 w-14 object-cover rounded"
            />
            <span className="text-xs text-muted-foreground flex-1 truncate">Image attached</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={onImageRemoved}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md border border-dashed hover:bg-muted/30 transition-colors">
            <ImagePlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              {isUploading ? "Uploading…" : "Click to attach an image or logo"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

export function GeneratePage() {
  const [, setLocation] = useLocation();
  const generateDeck = useGenerateDeck();
  const { toast } = useToast();
  const { data: projects } = useListProjects();

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      title: "",
      brief: "",
      audience: "Executive Board",
      slideCount: 10,
      narrativeStructure: "problem-solution",
      projectId: undefined,
      mode: "brief",
      slideOutlines: Array.from({ length: 10 }, (_, i) => ({ slideIndex: i, title: "", guidance: "", imageObjectPath: null })),
    },
  });

  const mode: GenerationMode = form.watch("mode");
  const slideCount = form.watch("slideCount");
  const slideOutlines = form.watch("slideOutlines");
  const slideBySlideEnabled = mode === "slide-by-slide";
  const { fields, replace } = useFieldArray({ control: form.control, name: "slideOutlines" });

  const handleSlideCountChange = (val: number) => {
    form.setValue("slideCount", val);
    const current = form.getValues("slideOutlines") ?? [];
    replace(Array.from({ length: val }, (_, i) => ({
      slideIndex: i,
      title: current[i]?.title ?? "",
      guidance: current[i]?.guidance ?? "",
      imageObjectPath: current[i]?.imageObjectPath ?? null,
    })));
  };

  const onSubmit = async (data: GenerateFormValues) => {
    try {
      const isSlideBySlide = data.mode === "slide-by-slide";
      const payload = {
        title: data.title,
        brief: data.brief,
        audience: data.audience,
        slideCount: data.slideCount,
        narrativeStructure: data.narrativeStructure,
        projectId: data.projectId === NO_PROJECT ? null : (data.projectId ?? null),
        slideOutlines: isSlideBySlide && Array.isArray(data.slideOutlines)
          ? data.slideOutlines.filter((o) => o.guidance.trim().length > 0 || o.title?.trim() || o.imageObjectPath).map((o) => ({
              slideIndex: o.slideIndex,
              guidance: o.guidance,
              title: o.title || undefined,
              imageObjectPath: o.imageObjectPath ?? undefined,
            }))
          : undefined,
      };
      const result = await generateDeck.mutateAsync({ data: payload });
      toast({ title: "Deck generated successfully!" });
      setLocation(`/decks/${result.id}`);
    } catch {
      toast({ title: "Failed to generate deck", variant: "destructive" });
    }
  };

  const selectedProject = projects?.find((p) => p.id === form.watch("projectId"));

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Generate New Deck</h1>
          <p className="text-muted-foreground mt-1">Provide a brief and configure parameters. Our AI will synthesize a structured presentation.</p>
        </div>

        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="space-y-8 pt-6">

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-medium border-b pb-2">
                    <AlignLeft className="h-5 w-5 text-primary" />
                    <h3>Content</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Working Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Q3 Market Expansion Strategy" className="text-lg" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mode</FormLabel>
                        <FormControl>
                          <Tabs value={field.value} onValueChange={(v) => field.onChange(v as GenerationMode)}>
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="brief">Full Brief</TabsTrigger>
                              <TabsTrigger value="slide-by-slide">Slide by Slide</TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </FormControl>
                        <FormDescription>
                          {field.value === "brief"
                            ? "Provide one strategic brief — the AI structures the deck."
                            : "Direct the AI per slide — set titles, instructions, and images individually."}
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  {mode === "brief" && (
                    <FormField
                      control={form.control}
                      name="brief"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Strategic Brief</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the context, key findings, and main argument. The more detail provided, the better the synthesis."
                              className="min-h-[150px] resize-y"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-medium border-b pb-2">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <h3>Project</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === NO_PROJECT ? undefined : val)}
                          value={field.value ?? NO_PROJECT}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <div className="flex items-center gap-2">
                                {selectedProject && (
                                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: selectedProject.primaryColor }} />
                                )}
                                <SelectValue placeholder="No project — use global settings" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_PROJECT}>No project — global settings & corpus</SelectItem>
                            {projects?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ background: p.primaryColor }} />
                                  {p.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Selecting a project uses its brand settings and scopes the knowledge corpus to project-specific documents.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-lg font-medium border-b pb-2">
                    <Target className="h-5 w-5 text-primary" />
                    <h3>Parameters</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="audience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Audience</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select audience" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Executive Board">Executive Board</SelectItem>
                              <SelectItem value="Investors / VC">Investors / VC</SelectItem>
                              <SelectItem value="Internal Team">Internal Team</SelectItem>
                              <SelectItem value="General Public">General Public</SelectItem>
                              <SelectItem value="Technical Stakeholders">Technical Stakeholders</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>Adapts tone and detail level.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="narrativeStructure"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Narrative Structure</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select structure" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="problem-solution">Problem → Solution</SelectItem>
                              <SelectItem value="consulting">Situation → Complication → Question → Answer</SelectItem>
                              <SelectItem value="mece-pyramid">MECE Pyramid (Top-down)</SelectItem>
                              <SelectItem value="executive-summary">Executive Summary Heavy</SelectItem>
                              <SelectItem value="chronological">Chronological</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>Determines the slide flow logic.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="slideCount"
                    render={({ field: { value } }) => (
                      <FormItem className="pt-2">
                        <div className="flex justify-between">
                          <FormLabel>Target Length</FormLabel>
                          <span className="font-mono text-sm">{value} slides</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={3}
                            max={30}
                            step={1}
                            value={[value]}
                            onValueChange={(vals) => handleSlideCountChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {slideBySlideEnabled && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-lg font-medium border-b pb-2">
                      <ListOrdered className="h-5 w-5 text-primary" />
                      <h3>Per-Slide Guidance</h3>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Customise individual slides — set a fixed title, add content instructions, or attach an image. Leave any field blank to let the AI decide.
                      </p>
                      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                        {fields.map((field, index) => (
                          <SlideOutlineCard
                            key={field.id}
                            index={index}
                            totalSlides={slideCount}
                            control={form.control}
                            imageObjectPath={slideOutlines?.[index]?.imageObjectPath}
                            onImageUploaded={(path) => {
                              form.setValue(`slideOutlines.${index}.imageObjectPath`, path, { shouldDirty: true });
                            }}
                            onImageRemoved={() => {
                              form.setValue(`slideOutlines.${index}.imageObjectPath`, null, { shouldDirty: true });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </CardContent>
              <CardFooter className="bg-muted/30 border-t p-6 flex justify-between">
                <Button variant="outline" type="button" onClick={() => history.back()}>Cancel</Button>
                <Button type="submit" size="lg" disabled={generateDeck.isPending} className="font-medium px-8">
                  {generateDeck.isPending ? (
                    <><Wand2 className="mr-2 h-4 w-4 animate-spin" />Synthesizing...</>
                  ) : (
                    <><Wand2 className="mr-2 h-4 w-4" />Generate Deck</>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </div>
  );
}
