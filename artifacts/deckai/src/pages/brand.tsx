import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetBrandProfile, useUpdateBrandProfile, useResetBrandProfile, getGetBrandProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Image as ImageIcon } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";

const brandFormSchema = z.object({
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex color code"),
  headingFont: z.string().min(1, "Heading font is required"),
  bodyFont: z.string().min(1, "Body font is required"),
  density: z.enum(["spacious", "balanced", "dense"]),
});

type BrandFormValues = z.infer<typeof brandFormSchema>;

export function BrandPage() {
  const { data: brandProfile, isLoading } = useGetBrandProfile();
  const updateBrand = useUpdateBrandProfile();
  const resetBrand = useResetBrandProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleReset = async () => {
    try {
      const defaults = await resetBrand.mutateAsync();
      queryClient.setQueryData(getGetBrandProfileQueryKey(), defaults);
      toast({ title: "Brand profile reset to defaults" });
    } catch {
      toast({ title: "Failed to reset brand profile", variant: "destructive" });
    }
  };
  
  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    values: {
      primaryColor: brandProfile?.primaryColor || "#1E293B",
      secondaryColor: brandProfile?.secondaryColor || "#334155",
      accentColor: brandProfile?.accentColor || "#3B82F6",
      headingFont: brandProfile?.headingFont || "Inter",
      bodyFont: brandProfile?.bodyFont || "Inter",
      density: (brandProfile?.density as "spacious" | "balanced" | "dense") || "balanced",
    },
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      updateBrand.mutate(
        { data: { logoObjectPath: response.objectPath } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetBrandProfileQueryKey() });
            toast({ title: "Logo updated successfully" });
          },
          onError: () => toast({ title: "Failed to update logo", variant: "destructive" }),
        }
      );
    },
    onError: () => toast({ title: "Failed to upload logo", variant: "destructive" }),
  });

  const onSubmit = async (data: BrandFormValues) => {
    try {
      await updateBrand.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getGetBrandProfileQueryKey() });
      toast({ title: "Brand settings saved" });
    } catch (error) {
      toast({ title: "Failed to save settings", variant: "destructive" });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 overflow-auto max-w-4xl mx-auto w-full space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-auto bg-gray-50/50">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-foreground tracking-tight">Brand Configuration</h1>
          <p className="text-muted-foreground mt-1">Customize the visual identity applied to all generated decks.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Typography & Colors</CardTitle>
                <CardDescription>Set the core visual parameters for your firm.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="headingFont"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Heading Font</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Playfair Display" />
                            </FormControl>
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
                            <FormControl>
                              <Input {...field} placeholder="e.g. Inter" />
                            </FormControl>
                            <FormDescription>Google Font name</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      <FormField
                        control={form.control}
                        name="primaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Primary Color</FormLabel>
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
                      <FormField
                        control={form.control}
                        name="secondaryColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secondary Color</FormLabel>
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
                      <FormField
                        control={form.control}
                        name="accentColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Accent Color</FormLabel>
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
                    </div>

                    <FormField
                      control={form.control}
                      name="density"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Content Density</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select density" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spacious">Spacious (Marketing)</SelectItem>
                              <SelectItem value="balanced">Balanced (Standard)</SelectItem>
                              <SelectItem value="dense">Dense (Data-heavy)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>Controls the amount of whitespace on slides.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3">
                      <Button type="submit" disabled={updateBrand.isPending || !form.formState.isDirty}>
                        {updateBrand.isPending ? "Saving..." : "Save Changes"}
                        {!updateBrand.isPending && <Save className="ml-2 h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="button-reset-brand"
                        disabled={resetBrand.isPending}
                        onClick={handleReset}
                      >
                        {resetBrand.isPending ? "Resetting..." : "Reset to Defaults"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Company Logo</CardTitle>
                <CardDescription>Appears on title and footer slides.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="w-full aspect-square border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 relative overflow-hidden mb-4">
                  {brandProfile?.logoObjectPath ? (
                    <img 
                      src={`/api/storage${brandProfile.logoObjectPath}`} 
                      alt="Company Logo" 
                      className="w-full h-full object-contain p-4"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <span className="text-sm">No logo uploaded</span>
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoUpload} 
                    disabled={isUploading}
                    className="cursor-pointer"
                  />
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
