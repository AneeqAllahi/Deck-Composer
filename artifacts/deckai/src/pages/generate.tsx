import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useGenerateDeck } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wand2, LayoutTemplate, Target, AlignLeft } from "lucide-react";
import { GenerateDeckBodyNarrativeStructure } from "@workspace/api-client-react";

const generateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title is too long"),
  brief: z.string().min(20, "Brief needs more detail to generate a quality deck").max(2000, "Brief is too long"),
  audience: z.string().min(2, "Please specify the audience"),
  slideCount: z.number().min(3).max(30),
  narrativeStructure: z.nativeEnum(GenerateDeckBodyNarrativeStructure),
});

type GenerateFormValues = z.infer<typeof generateSchema>;

export function GeneratePage() {
  const [, setLocation] = useLocation();
  const generateDeck = useGenerateDeck();
  const { toast } = useToast();

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      title: "",
      brief: "",
      audience: "Executive Board",
      slideCount: 10,
      narrativeStructure: "problem-solution",
    },
  });

  const onSubmit = async (data: GenerateFormValues) => {
    try {
      const result = await generateDeck.mutateAsync({ data });
      toast({ title: "Deck generated successfully!" });
      setLocation(`/decks/${result.id}`);
    } catch (error) {
      toast({ title: "Failed to generate deck", variant: "destructive" });
    }
  };

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
                            placeholder="Describe the context, key findings, and main argument. The more detail provided, the better the synthesis. The system will also search the corpus for relevant data." 
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
                    render={({ field: { value, onChange } }) => (
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
                            onValueChange={(vals) => onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </CardContent>
              <CardFooter className="bg-muted/30 border-t p-6 flex justify-between">
                <Button variant="outline" type="button" onClick={() => history.back()}>Cancel</Button>
                <Button type="submit" size="lg" disabled={generateDeck.isPending} className="font-medium px-8">
                  {generateDeck.isPending ? (
                    <>
                      <Wand2 className="mr-2 h-4 w-4 animate-spin" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generate Deck
                    </>
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
