import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useGenerateDeck, useListProjects, GenerateDeckBodyNarrativeStructure } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Target, AlignLeft, FolderOpen, ListOrdered } from "lucide-react";

const generateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title is too long"),
  brief: z.string().min(20, "Brief needs more detail to generate a quality deck").max(2000, "Brief is too long"),
  audience: z.string().min(2, "Please specify the audience"),
  slideCount: z.number().min(3).max(30),
  narrativeStructure: z.nativeEnum(GenerateDeckBodyNarrativeStructure),
  projectId: z.string().optional(),
  slideOutlines: z.array(z.object({ slideIndex: z.number(), guidance: z.string() })).optional(),
});

type GenerateFormValues = z.infer<typeof generateSchema>;

const NO_PROJECT = "__none__";

export function GeneratePage() {
  const [, setLocation] = useLocation();
  const generateDeck = useGenerateDeck();
  const { toast } = useToast();
  const [slideBySlideEnabled, setSlideBySlideEnabled] = useState(false);
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
      slideOutlines: Array.from({ length: 10 }, (_, i) => ({ slideIndex: i, guidance: "" })),
    },
  });

  const slideCount = form.watch("slideCount");
  const { fields, replace } = useFieldArray({ control: form.control, name: "slideOutlines" });

  const handleSlideCountChange = (val: number) => {
    form.setValue("slideCount", val);
    replace(Array.from({ length: val }, (_, i) => ({
      slideIndex: i,
      guidance: fields[i]?.guidance ?? "",
    })));
  };

  const onSubmit = async (data: GenerateFormValues) => {
    try {
      const payload = {
        title: data.title,
        brief: data.brief,
        audience: data.audience,
        slideCount: data.slideCount,
        narrativeStructure: data.narrativeStructure,
        projectId: data.projectId === NO_PROJECT ? null : (data.projectId ?? null),
        slideOutlines: slideBySlideEnabled && Array.isArray(data.slideOutlines)
          ? (data.slideOutlines as { slideIndex: number; guidance: string }[]).filter((o) => o.guidance.trim().length > 0)
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

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2 text-lg font-medium">
                      <ListOrdered className="h-5 w-5 text-primary" />
                      <h3>Slide-by-Slide Guidance</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {slideBySlideEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={slideBySlideEnabled}
                        onCheckedChange={setSlideBySlideEnabled}
                      />
                    </div>
                  </div>

                  {slideBySlideEnabled ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Add optional directives for specific slides. Leave blank to let AI decide.
                      </p>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {fields.map((field, index) => (
                          <div key={field.id} className="flex items-start gap-3 group">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-mono font-medium text-muted-foreground mt-1">
                              {index + 1}
                            </div>
                            <FormField
                              control={form.control}
                              name={`slideOutlines.${index}.guidance`}
                              render={({ field: f }) => (
                                <FormItem className="flex-1 mb-0">
                                  <FormControl>
                                    <Input
                                      placeholder={`Slide ${index + 1} — optional directive...`}
                                      className="h-8 text-sm"
                                      {...f}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Enable this to provide specific instructions for individual slides — e.g. "Slide 3: focus on market sizing" or "Slide 7: include a quote from the CEO."
                    </p>
                  )}
                </div>

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
