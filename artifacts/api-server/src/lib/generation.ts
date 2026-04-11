import { openai } from "@workspace/integrations-openai-ai-server";
import type { BrandProfile } from "@workspace/db";
import type { SlideData } from "@workspace/db";

function getDensityGuidance(density: string): string {
  switch (density) {
    case "spacious": return "Keep slides minimal with 2-3 key points maximum. Use generous whitespace. Prefer large impactful statements over dense content.";
    case "dense": return "Pack slides with detailed information, up to 6-8 bullet points. Include supporting data and granular details.";
    default: return "Balance between brevity and detail. Aim for 3-5 bullet points per slide with clear supporting context.";
  }
}

function getNarrativeGuidance(structure: string): string {
  switch (structure) {
    case "problem-solution": return "Structure: Start with problem definition and stakes, transition through root causes, then present the solution and its benefits. End with call to action.";
    case "consulting": return "Structure: Start with the So What (executive summary/key recommendation), then provide supporting insights and evidence, then detailed analysis. Follow the Pyramid Principle.";
    case "chronological": return "Structure: Present information in sequential order — past context, current state, future roadmap. Use clear temporal markers.";
    case "mece-pyramid": return "Structure: Use MECE (Mutually Exclusive, Collectively Exhaustive) issue trees. Break the topic into distinct, non-overlapping pillars with supporting evidence under each.";
    case "executive-summary": return "Structure: Lead with conclusions and recommendations. Keep it concise and action-oriented. Support with only the most critical evidence.";
    default: return "Structure the deck logically with a clear narrative flow from context to insight to recommendation.";
  }
}

export async function generateDeckSlides(params: {
  title: string;
  brief: string;
  audience: string;
  slideCount: number;
  narrativeStructure: string;
  brandProfile: BrandProfile;
  corpusContext: string[];
}): Promise<SlideData[]> {
  const { title, brief, audience, slideCount, narrativeStructure, brandProfile, corpusContext } = params;

  const contextSection = corpusContext.length > 0
    ? `\n\nRelevant context from past decks (use for structural and stylistic guidance):\n${corpusContext.slice(0, 8).map((c, i) => `[Context ${i + 1}]: ${c}`).join("\n\n")}`
    : "";

  const densityGuidance = getDensityGuidance(brandProfile.density);
  const narrativeGuidance = getNarrativeGuidance(narrativeStructure);

  const systemPrompt = `You are an expert management consultant and presentation designer. You create high-quality, professional slide content for ${audience}.

Brand guidelines:
- Primary colour: ${brandProfile.primaryColor}
- Secondary colour: ${brandProfile.secondaryColor}
- Accent colour: ${brandProfile.accentColor}
- Heading font: ${brandProfile.headingFont}
- Body font: ${brandProfile.bodyFont}
- Content density: ${brandProfile.density}

${densityGuidance}

${narrativeGuidance}

You must output a JSON array of exactly ${slideCount} slides. Each slide must have this structure:
{
  "slideIndex": number (0-based),
  "title": string (concise, punchy slide title),
  "body": string (main narrative text, 1-3 sentences),
  "layoutType": one of ["title", "section", "text", "columns", "quote", "metrics"],
  "speakerNotes": string (detailed talking points for the presenter, 2-4 sentences),
  "bulletPoints": string[] (3-6 items for "text" layout, empty for others),
  "metrics": [{"value": string, "label": string}] (for "metrics" layout, 2-4 items, empty for others),
  "columnLeft": string | null (for "columns" layout only),
  "columnRight": string | null (for "columns" layout only)
}

Layout selection guidance:
- Use "title" for the first slide (cover slide)
- Use "section" for transition slides between major sections
- Use "text" for standard content slides with bullet points
- Use "columns" for comparison or side-by-side content
- Use "quote" for key insights, executive quotes, or pivotal statements
- Use "metrics" for slides showcasing key performance indicators or statistics

Output ONLY the JSON array. No explanation, no markdown, no preamble.`;

  const userPrompt = `Create a ${slideCount}-slide presentation deck.

Title: "${title}"
Brief: ${brief}
Target Audience: ${audience}${contextSection}

Generate exactly ${slideCount} professional slides following the ${narrativeStructure} narrative structure.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "[]";
  
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in response");
    
    const slides = JSON.parse(jsonMatch[0]) as SlideData[];
    return slides.map((slide, i) => ({
      slideIndex: i,
      title: slide.title ?? "Untitled",
      body: slide.body ?? "",
      layoutType: slide.layoutType ?? "text",
      speakerNotes: slide.speakerNotes ?? "",
      bulletPoints: slide.bulletPoints ?? [],
      metrics: slide.metrics ?? [],
      columnLeft: slide.columnLeft ?? null,
      columnRight: slide.columnRight ?? null,
    }));
  } catch (err) {
    throw new Error(`Failed to parse slide JSON: ${err}`);
  }
}

export async function regenerateSingleSlide(params: {
  currentSlide: SlideData;
  deck: { title: string; brief: string; audience: string; narrativeStructure: string };
  brandProfile: BrandProfile;
  instruction?: string;
}): Promise<SlideData> {
  const { currentSlide, deck, brandProfile, instruction } = params;

  const systemPrompt = `You are an expert management consultant and presentation designer. Regenerate a single slide for a presentation.

The deck: "${deck.title}" — ${deck.brief}
Audience: ${deck.audience}
Narrative structure: ${deck.narrativeStructure}

Brand guidelines:
- Primary colour: ${brandProfile.primaryColor}
- Content density: ${brandProfile.density}

Output a single JSON slide object with this structure:
{
  "slideIndex": number,
  "title": string,
  "body": string,
  "layoutType": one of ["title", "section", "text", "columns", "quote", "metrics"],
  "speakerNotes": string,
  "bulletPoints": string[],
  "metrics": [{"value": string, "label": string}],
  "columnLeft": string | null,
  "columnRight": string | null
}

Output ONLY the JSON object. No explanation.`;

  const userPrompt = `Regenerate slide ${currentSlide.slideIndex + 1}.

Current slide:
- Title: ${currentSlide.title}
- Layout: ${currentSlide.layoutType}
- Body: ${currentSlide.body}
${instruction ? `\nInstruction: ${instruction}` : "\nMake it more impactful and compelling while keeping the same purpose."}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in response");
    
    const slide = JSON.parse(jsonMatch[0]) as SlideData;
    return {
      slideIndex: currentSlide.slideIndex,
      title: slide.title ?? currentSlide.title,
      body: slide.body ?? currentSlide.body,
      layoutType: slide.layoutType ?? currentSlide.layoutType,
      speakerNotes: slide.speakerNotes ?? currentSlide.speakerNotes,
      bulletPoints: slide.bulletPoints ?? [],
      metrics: slide.metrics ?? [],
      columnLeft: slide.columnLeft ?? null,
      columnRight: slide.columnRight ?? null,
    };
  } catch (err) {
    throw new Error(`Failed to parse regenerated slide JSON: ${err}`);
  }
}
