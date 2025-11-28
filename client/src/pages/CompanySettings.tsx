import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Building, Upload, Crown, ArrowLeft, Palette, Lightbulb } from "lucide-react";
import { extractColorsFromImage, getColorSuggestions, type ExtractedColor } from "@/lib/colorExtractor";
import { Link } from "wouter";
import { LogoUploader } from "@/components/LogoUploader";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

const companyBrandingSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  companyWebsite: z.string().optional(),
  footerText: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").optional(),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color").optional(),
  engineerName: z.string().optional(),
  gasSafeNumber: z.string().optional(),
  engineerSignatureUrl: z.string().optional(),
});

type CompanyBrandingForm = z.infer<typeof companyBrandingSchema>;

export default function CompanySettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [headerLogoFile, setHeaderLogoFile] = useState<File | null>(null);
  const [extractedColors, setExtractedColors] = useState<ExtractedColor[]>([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  const form = useForm<CompanyBrandingForm>({
    resolver: zodResolver(companyBrandingSchema),
    defaultValues: {
      companyName: "",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      footerText: "",
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      engineerName: "",
      gasSafeNumber: "",
      engineerSignatureUrl: "",
    },
  });

  // Check if user has Professional access
  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription-status"],
    enabled: !authLoading,
  });

  const isProfessional = (subscription as any)?.tier === "professional";

  // Load existing branding data
  const { data: branding, isLoading: brandingLoading } = useQuery({
    queryKey: ["/api/company-branding"],
    enabled: !authLoading && isProfessional,
  }) as { data: any, isLoading: boolean };

  // Update form when branding data loads
  useEffect(() => {
    if (branding) {
      const brandingData = branding as any;
      form.reset({
        companyName: brandingData.companyName || "",
        companyAddress: brandingData.companyAddress || "",
        companyPhone: brandingData.companyPhone || "",
        companyEmail: brandingData.companyEmail || "",
        companyWebsite: brandingData.companyWebsite || "",
        footerText: brandingData.footerText || "",
        primaryColor: brandingData.primaryColor || "#2563eb",
        secondaryColor: brandingData.secondaryColor || "#64748b",
        engineerName: brandingData.engineerName || "",
        gasSafeNumber: brandingData.gasSafeNumber || "",
        engineerSignatureUrl: brandingData.engineerSignatureUrl || "",
      });
      setSignatureDataUrl(brandingData.engineerSignatureUrl || "");
    }
  }, [branding, form]);

  const saveBranding = useMutation({
    mutationFn: async (data: CompanyBrandingForm) => {
      const response = await apiRequest("POST", "/api/company-branding", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company branding saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company-branding"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogoUpload = (logoUrl: string) => {
    // Auto-extract colors when logo is uploaded
    if (logoUrl) {
      handleColorExtraction(logoUrl);
    }
    
    // Refresh branding data to get the updated logo
    queryClient.invalidateQueries({ queryKey: ["/api/company-branding"] });
  };

  const handleSignatureSave = async (signatureDataUrl: string) => {
    try {
      // Convert data URL to Blob
      const response = await fetch(signatureDataUrl);
      const blob = await response.blob();
      
      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', blob, 'signature.png');
      
      // Upload signature
      const uploadResponse = await fetch('/api/upload/signature', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload signature');
      }
      
      const { url } = await uploadResponse.json();
      
      // Update form with signature URL
      form.setValue('engineerSignatureUrl', url);
      setSignatureDataUrl(signatureDataUrl);
      
      toast({
        title: "Signature Saved",
        description: "Your signature has been uploaded successfully",
      });
      
    } catch (error) {
      console.error('Error uploading signature:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload signature. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleColorExtraction = async (logoUrl?: string) => {
    const imageUrl = logoUrl || (branding as any)?.logoUrl;
    if (!imageUrl) {
      toast({
        title: "No Logo",
        description: "Please upload a logo first to extract colors",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExtractingColors(true);
      const colors = await extractColorsFromImage(imageUrl);
      setExtractedColors(colors);
      
      // Auto-fill colors if none are set
      if (colors.length > 0) {
        const currentPrimary = form.getValues("primaryColor");
        const currentSecondary = form.getValues("secondaryColor");
        
        // Only auto-fill if using default colors
        if (currentPrimary === "#2563eb") {
          form.setValue("primaryColor", colors[0].hex);
        }
        if (currentSecondary === "#64748b" && colors.length > 1) {
          form.setValue("secondaryColor", colors[1].hex);
        }
      }
      
      toast({
        title: "Colors Extracted",
        description: `Found ${colors.length} colors from your logo`,
      });
    } catch (error) {
      console.error("Color extraction error:", error);
      toast({
        title: "Extraction Failed",
        description: "Unable to extract colors from the image. This may be due to CORS restrictions.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingColors(false);
    }
  };

  const onSubmit = (data: CompanyBrandingForm) => {
    saveBranding.mutate(data);
  };

  if (authLoading || brandingLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isProfessional) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center">
            <CardHeader>
              <Crown className="w-12 h-12 mx-auto mb-4 text-warning" />
              <CardTitle>Professional Subscription Required</CardTitle>
              <CardDescription>
                Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Upgrade to Professional to customize your reports with your company logo, 
                colors, and contact information for a professional white-label experience.
              </p>
              <Button asChild>
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-20 w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecLogo})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Navigation Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Home
                </Link>
              </Button>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building className="w-6 h-6" />
                Company Settings
              </h1>
            </div>
            <Badge variant="secondary" className="px-2 py-1">
              <Crown className="w-3 h-3 mr-1" />
              P
            </Badge>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Company Information */}
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Customize your company branding for professional reports. Basic company details that will appear on your reports.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      {...form.register("companyName")}
                      placeholder="Your Company Name"
                      data-testid="input-company-name"
                    />
                    {form.formState.errors.companyName && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.companyName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="companyAddress">Address</Label>
                    <Textarea
                      id="companyAddress"
                      {...form.register("companyAddress")}
                      placeholder="Company address"
                      rows={3}
                      data-testid="input-company-address"
                    />
                  </div>

                  <div>
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input
                      id="companyPhone"
                      {...form.register("companyPhone")}
                      placeholder="Company phone number"
                      data-testid="input-company-phone"
                    />
                  </div>

                  <div>
                    <Label htmlFor="companyEmail">Email</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      {...form.register("companyEmail")}
                      placeholder="Company email address"
                      data-testid="input-company-email"
                    />
                    {form.formState.errors.companyEmail && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.companyEmail.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="companyWebsite">Website</Label>
                    <Input
                      id="companyWebsite"
                      {...form.register("companyWebsite")}
                      placeholder="Company website URL"
                      data-testid="input-company-website"
                    />
                  </div>

                  <div>
                    <Label htmlFor="footerText">Footer Text</Label>
                    <Textarea
                      id="footerText"
                      {...form.register("footerText")}
                      placeholder="Additional footer text for reports"
                      rows={2}
                      data-testid="input-footer-text"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={saveBranding.isPending}
                    data-testid="button-save-company-info"
                  >
                    {saveBranding.isPending ? "Saving..." : "Save Company Information"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Engineer Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Default Engineer Details
                </CardTitle>
                <CardDescription>
                  Default engineer information that will auto-populate on new tests
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="engineerName">Engineer Name</Label>
                    <Input
                      id="engineerName"
                      {...form.register("engineerName")}
                      placeholder="Default engineer name"
                      data-testid="input-engineer-name"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This will auto-populate when starting new tests
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="gasSafeNumber">Gas Safe Registration Number</Label>
                    <Input
                      id="gasSafeNumber"
                      {...form.register("gasSafeNumber")}
                      placeholder="12345678"
                      data-testid="input-gas-safe-number"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Gas Safe registration number for certificates
                    </p>
                  </div>

                  <div>
                    <Label>Engineer Signature</Label>
                    <SignatureCanvas
                      onSave={handleSignatureSave}
                      existingSignature={signatureDataUrl}
                      width={400}
                      height={150}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={saveBranding.isPending}
                    data-testid="button-save-engineer-details"
                  >
                    {saveBranding.isPending ? "Saving..." : "Save Engineer Details"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Logo Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Company Logo
                </CardTitle>
                <CardDescription>
                  Upload your company logo for reports and certificates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LogoUploader 
                  onUploadComplete={handleLogoUpload}
                  currentLogoUrl={branding?.logoUrl}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Company Logo
                </LogoUploader>
              </CardContent>
            </Card>

            {/* Color Customization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Brand Colors
                </CardTitle>
                <CardDescription>
                  Set primary and secondary colors for your reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(branding as any)?.logoUrl && (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleColorExtraction()}
                        disabled={isExtractingColors}
                        className="w-full mb-4"
                      >
                        <Lightbulb className="w-4 h-4 mr-2" />
                        {isExtractingColors ? "Extracting..." : "Extract Colors from Logo"}
                      </Button>
                      
                      {extractedColors.length > 0 && (
                        <div className="mb-4">
                          <Label className="text-sm font-medium mb-2 block">
                            Extracted Colors (choose primary or secondary)
                          </Label>
                          <div className="space-y-3">
                            {extractedColors.map((color, index) => (
                              <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                                <div
                                  className="w-8 h-8 rounded-md border border-border"
                                  style={{ backgroundColor: color.hex }}
                                />
                                <div className="flex-1">
                                  <span className="text-sm font-medium">{color.hex}</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => form.setValue("primaryColor", color.hex)}
                                    className="text-xs"
                                  >
                                    Set Primary
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => form.setValue("secondaryColor", color.hex)}
                                    className="text-xs"
                                  >
                                    Set Secondary
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={form.watch("primaryColor")}
                          onChange={(e) => form.setValue("primaryColor", e.target.value)}
                          className="w-16 h-10 p-1"
                          data-testid="input-primary-color"
                        />
                        <Input
                          value={form.watch("primaryColor")}
                          onChange={(e) => form.setValue("primaryColor", e.target.value)}
                          placeholder="#2563eb"
                          className="flex-1"
                          data-testid="input-primary-color-text"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={form.watch("secondaryColor")}
                          onChange={(e) => form.setValue("secondaryColor", e.target.value)}
                          className="w-16 h-10 p-1"
                          data-testid="input-secondary-color"
                        />
                        <Input
                          value={form.watch("secondaryColor")}
                          onChange={(e) => form.setValue("secondaryColor", e.target.value)}
                          placeholder="#64748b"
                          className="flex-1"
                          data-testid="input-secondary-color-text"
                        />
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      disabled={saveBranding.isPending}
                      data-testid="button-save-colors"
                    >
                      {saveBranding.isPending ? "Saving..." : "Save Colors"}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  How your branding will appear on reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  {/* Report Header */}
                  <div 
                    className="p-4"
                    style={{ 
                      borderBottom: `4px solid ${form.watch("primaryColor") || "#2563eb"}` 
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      {(branding as any)?.logoUrl ? (
                        <img
                          src={String((branding as any).logoUrl)}
                          alt="Logo"
                          className="max-h-12 max-w-32 object-contain"
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">Your logo here</div>
                      )}
                      <div className="text-right text-sm">
                        <div className="font-medium">{form.watch("companyName") || "Company Name"}</div>
                        <div className="text-muted-foreground">{form.watch("companyEmail") || "email@company.com"}</div>
                      </div>
                    </div>
                    <h1 
                      className="text-lg font-bold uppercase tracking-wide" 
                      style={{ color: form.watch("secondaryColor") || "#64748b" }}
                    >
                      Gas System Test Certificate
                    </h1>
                    <p className="text-xs" style={{ color: form.watch("secondaryColor") || "#64748b" }}>Professional Gas Installation Test Report</p>
                  </div>
                  
                  {/* Test Results Section */}
                  <div className="p-4 space-y-3">
                    <div 
                      className="p-3 rounded border-l-4"
                      style={{ 
                        backgroundColor: form.watch("primaryColor") + "15" || "#2563eb15",
                        borderLeftColor: form.watch("secondaryColor") || "#64748b"
                      }}
                    >
                      <h3 
                        className="text-xs font-bold uppercase mb-2" 
                        style={{ color: form.watch("secondaryColor") || "#64748b" }}
                      >
                        Tightness Test
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div 
                          className="p-2 bg-card rounded border-l-2" 
                          style={{ borderLeftColor: form.watch("secondaryColor") || "#64748b" }}
                        >
                          <div className="text-muted-foreground uppercase text-[10px]">Test Pressure</div>
                          <div className="font-bold" style={{ color: form.watch("secondaryColor") || "#64748b" }}>32 mbar</div>
                        </div>
                        <div 
                          className="p-2 bg-card rounded border-l-2" 
                          style={{ borderLeftColor: form.watch("secondaryColor") || "#64748b" }}
                        >
                          <div className="text-muted-foreground uppercase text-[10px]">Actual Drop</div>
                          <div className="font-bold" style={{ color: form.watch("secondaryColor") || "#64748b" }}>0 mbar</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Pass/Fail Stamp */}
                    <div 
                      className="text-center py-2 px-4 rounded border-2 text-sm font-bold uppercase tracking-wider"
                      style={{ 
                        backgroundColor: form.watch("primaryColor") + "20" || "#2563eb20",
                        borderColor: form.watch("secondaryColor") || "#64748b",
                        color: form.watch("secondaryColor") || "#64748b"
                      }}
                    >
                      ✓ PASS
                    </div>
                    
                    {/* Footer Links */}
                    <div className="text-xs pt-2 border-t" style={{ borderTopColor: form.watch("secondaryColor") || "#64748b" }}>
                      <div className="flex justify-between">
                        <span>Email: <a href="#" style={{ color: form.watch("primaryColor") || "#2563eb" }}>info@company.com</a></span>
                        <span>Website: <a href="#" style={{ color: form.watch("primaryColor") || "#2563eb" }}>company.com</a></span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-surface border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col items-center space-y-4">
            {/* Links Row */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <Link href="/calculations">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Reference & Calculations
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Privacy Policy
                </Button>
              </Link>
              <Link href="/terms">
                <Button variant="link" size="sm" className="text-primary hover:underline h-auto p-0">
                  Terms of Service
                </Button>
              </Link>
              <a href="mailto:info@BearTec.uk" className="text-primary hover:underline">Support</a>
            </div>
            
            {/* Copyright Text */}
            <div className="text-sm text-muted-foreground text-center">
              © 2024 IGE/UP/1 Gas Purging Calculator. For use by qualified Gas Safe registered engineers only.
            </div>
            
            {/* Version */}
            <div className="text-sm text-muted-foreground text-center">
              Version 2.1.0
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="w-full overflow-hidden" style={{
            backgroundImage: `url(${beartecFooter})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            height: '120px'
          }}>
          </div>
        </div>
      </footer>
    </div>
  );
}