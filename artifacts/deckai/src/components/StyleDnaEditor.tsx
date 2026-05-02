import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Save, RefreshCw, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  extractStyleDna,
  getStyleDna,
  getStyleDnaPages,
  saveStyleDna,
  styleDnaPageImageUrl,
  type StyleDnaData,
  type StyleDnaPage,
  type StyleDnaResponse,
} from "@/lib/ragClient";

type Props = { projectId: string };

function joinList(arr: string[] | undefined): string {
  return (arr ?? []).join(", ");
}
function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function StyleDnaEditor({ projectId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{ source: string; updatedAt: string | null }>({ source: "default", updatedAt: null });
  const [data, setData] = useState<StyleDnaData>({});
  const [pages, setPages] = useState<StyleDnaPage[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getStyleDna(projectId);
      applyResponse(r);
      try {
        const p = await getStyleDnaPages(projectId);
        setPages(p.pages);
      } catch {
        setPages([]);
      }
    } catch {
      toast({ title: "Failed to load Style DNA", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const applyResponse = (r: StyleDnaResponse) => {
    setData(r.data ?? {});
    setMeta({ source: r.source, updatedAt: r.updatedAt ?? null });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const r = await extractStyleDna(projectId);
      applyResponse(r);
      toast({ title: "Style DNA extracted from brand guideline" });
    } catch (e) {
      toast({
        title: "Extraction failed",
        description: e instanceof Error ? e.message : "See console",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await saveStyleDna(projectId, data);
      applyResponse(r);
      toast({ title: "Style DNA saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const palette = data.palette ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Style DNA
          </CardTitle>
          <CardDescription>
            Always injected into the prompt. Extract from a brand-guideline PDF/PPTX, then refine.{" "}
            <Badge variant="outline" className="ml-1 text-[10px]">
              source: {meta.source}
            </Badge>
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
          <Button size="sm" onClick={() => void handleExtract()} disabled={extracting}>
            {extracting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Extract from guideline
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {pages.length > 0 && (
          <section>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Visual sources
            </Label>
            <div className="text-[11px] text-muted-foreground mt-1 mb-2">
              Page renders the vision model used to detect palette, typography, and layouts.
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pages.map((p) => (
                <a
                  key={p.id}
                  href={styleDnaPageImageUrl(p.objectPath)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 w-28 border rounded overflow-hidden bg-muted hover:ring-2 hover:ring-primary transition"
                  title={`${p.documentName} — page ${p.pageIndex}`}
                >
                  <img
                    src={styleDnaPageImageUrl(p.objectPath)}
                    alt={`${p.documentName} page ${p.pageIndex}`}
                    className="w-full h-36 object-cover object-top bg-white"
                    loading="lazy"
                  />
                  <div className="text-[10px] text-muted-foreground px-1 py-0.5 truncate">
                    p.{p.pageIndex}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Palette</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setData({ ...data, palette: [...palette, { name: "New", hex: "#000000", role: "" }] })
              }
            >
              <Plus className="h-3 w-3 mr-1" /> Add color
            </Button>
          </div>
          <div className="space-y-2">
            {palette.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={c.hex}
                  onChange={(e) => {
                    const next = [...palette];
                    next[i] = { ...c, hex: e.target.value };
                    setData({ ...data, palette: next });
                  }}
                  className="w-12 h-9 p-1 cursor-pointer flex-shrink-0"
                />
                <Input
                  className="w-32 font-mono text-xs"
                  value={c.hex}
                  onChange={(e) => {
                    const next = [...palette];
                    next[i] = { ...c, hex: e.target.value };
                    setData({ ...data, palette: next });
                  }}
                />
                <Input
                  className="flex-1"
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => {
                    const next = [...palette];
                    next[i] = { ...c, name: e.target.value };
                    setData({ ...data, palette: next });
                  }}
                />
                <Input
                  className="w-32"
                  placeholder="role"
                  value={c.role ?? ""}
                  onChange={(e) => {
                    const next = [...palette];
                    next[i] = { ...c, role: e.target.value };
                    setData({ ...data, palette: next });
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setData({ ...data, palette: palette.filter((_, j) => j !== i) })}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {palette.length === 0 && <div className="text-xs text-muted-foreground italic">No palette yet</div>}
          </div>
        </section>

        <section>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Typography</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(["heading", "body", "caption"] as const).map((slot) => {
              const v = data.typography?.[slot] ?? {};
              return (
                <div key={slot} className="space-y-1">
                  <div className="text-xs capitalize text-muted-foreground">{slot}</div>
                  <Input
                    placeholder="font family"
                    value={v.family ?? ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        typography: { ...data.typography, [slot]: { ...v, family: e.target.value } },
                      })
                    }
                  />
                  <Input
                    placeholder="weight / sizes"
                    value={`${v.weight ?? ""}${v.weight && v.sizes ? " · " : ""}${v.sizes ?? ""}`}
                    onChange={(e) => {
                      const parts = e.target.value.split("·").map((s) => s.trim());
                      setData({
                        ...data,
                        typography: {
                          ...data.typography,
                          [slot]: { ...v, weight: parts[0] || undefined, sizes: parts[1] || undefined },
                        },
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Voice</Label>
            <Input
              placeholder="adjectives (comma sep)"
              value={joinList(data.voice?.adjectives)}
              onChange={(e) =>
                setData({ ...data, voice: { ...data.voice, adjectives: splitList(e.target.value) } })
              }
            />
            <Input
              placeholder="reading grade"
              value={data.voice?.readingGrade ?? ""}
              onChange={(e) => setData({ ...data, voice: { ...data.voice, readingGrade: e.target.value } })}
            />
            <Input
              placeholder="point of view"
              value={data.voice?.pointOfView ?? ""}
              onChange={(e) => setData({ ...data, voice: { ...data.voice, pointOfView: e.target.value } })}
            />
            <Textarea
              placeholder="tone notes"
              rows={2}
              value={data.voice?.toneNotes ?? ""}
              onChange={(e) => setData({ ...data, voice: { ...data.voice, toneNotes: e.target.value } })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lexicon</Label>
            <Input
              placeholder="preferred (comma sep)"
              value={joinList(data.lexicon?.preferred)}
              onChange={(e) =>
                setData({ ...data, lexicon: { ...data.lexicon, preferred: splitList(e.target.value) } })
              }
            />
            <Input
              placeholder="banned (comma sep)"
              value={joinList(data.lexicon?.banned)}
              onChange={(e) =>
                setData({ ...data, lexicon: { ...data.lexicon, banned: splitList(e.target.value) } })
              }
            />
            <Input
              placeholder="signature phrases (comma sep)"
              value={joinList(data.lexicon?.signaturePhrases)}
              onChange={(e) =>
                setData({
                  ...data,
                  lexicon: { ...data.lexicon, signaturePhrases: splitList(e.target.value) },
                })
              }
            />
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Do's (one per line)</Label>
            <Textarea
              rows={4}
              value={(data.rules?.dos ?? []).join("\n")}
              onChange={(e) =>
                setData({
                  ...data,
                  rules: {
                    ...data.rules,
                    dos: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Don'ts (one per line)</Label>
            <Textarea
              rows={4}
              value={(data.rules?.donts ?? []).join("\n")}
              onChange={(e) =>
                setData({
                  ...data,
                  rules: {
                    ...data.rules,
                    donts: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            />
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Style DNA
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
