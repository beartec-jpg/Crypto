import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Box, Gauge, Download, FileText, Printer, CheckCircle, XCircle, Clock, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import type { CalculationResult } from "@shared/schema";

interface ResultsPanelProps {
  results: CalculationResult | null;
}

interface TestResultsPanelProps {
  results: CalculationResult | null;
}

interface PurgeResultsPanelProps {
  results: CalculationResult | null;
}

function PurgeResultsPanel({ results }: PurgeResultsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch company branding for Professional users
  const { data: companyBranding } = useQuery<any>({
    queryKey: ["/api/company-branding"],
    enabled: user?.subscriptionTier === 'professional',
  });
  const [actualFlowRate, setActualFlowRate] = useState<string>("");
  const [actualGasContent, setActualGasContent] = useState<string>("");
  const [purgeResult, setPurgeResult] = useState<string>("PENDING");
  const [siteName, setSiteName] = useState<string>("");
  const [sectionIdentity, setSectionIdentity] = useState<string>("");
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          toast({
            title: "Location Captured",
            description: `Lat: ${position.coords.latitude.toFixed(6)}, Long: ${position.coords.longitude.toFixed(6)}`,
          });
        },
        (error) => {
          toast({
            title: "Location Error",
            description: "Unable to get current location",
            variant: "destructive",
          });
        }
      );
    }
  };

  // Calculate purge pass/fail when values change
  const handleFlowRateChange = (value: string) => {
    setActualFlowRate(value);
    calculatePurgeResult(value, actualGasContent);
  };

  const handleGasContentChange = (value: string) => {
    setActualGasContent(value);
    calculatePurgeResult(actualFlowRate, value);
  };

  const calculatePurgeResult = (flowRate: string, gasContent: string) => {
    if (!results || !flowRate || !gasContent) {
      setPurgeResult("PENDING");
      return;
    }

    const flow = parseFloat(flowRate);
    const content = parseFloat(gasContent);
    const minFlow = parseFloat(results.calculation.minimumFlowRate || "0");

    // Check flow rate and gas content criteria
    if (flow >= minFlow && content <= 5.0) {
      setPurgeResult("PASS");
    } else {
      setPurgeResult("FAIL");
    }
  };

  const handleExportPDF = async () => {
    if (!results) return;
    
    // Check if user has PDF export privileges (Premium or Professional only)
    if (user?.subscriptionTier === 'free' || user?.subscriptionTier === 'basic') {
      toast({
        title: "Premium Subscription Required",
        description: "PDF export requires Premium subscription. Upgrade to export professional reports and access advanced features.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const testResults = {
        purgeFlowRate: actualFlowRate,
        purgeGasContent: actualGasContent,
        purgeResult,
        siteName: siteName,
        sectionIdentity: sectionIdentity,
        location: location,
        purgeCompleted: true
      };
      
      await generatePDF(results, testResults, user?.subscriptionTier === 'professional' ? companyBranding : undefined);
      toast({
        title: "PDF Generated",
        description: "Purge report has been generated and downloaded",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Purge Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Gauge className="text-primary mr-2 w-5 h-5" />
            Purge Test Results
          </CardTitle>
          <CardDescription>
            Record purge measurements and determine pass/fail status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Site Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purge-site-name">Site Name</Label>
                <Input
                  id="purge-site-name"
                  type="text"
                  placeholder="Enter site name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  data-testid="input-purge-site-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="purge-section-identity">Section Identity</Label>
                <Input
                  id="purge-section-identity"
                  type="text"
                  placeholder="Enter section identity"
                  value={sectionIdentity}
                  onChange={(e) => setSectionIdentity(e.target.value)}
                  data-testid="input-purge-section-identity"
                />
              </div>
            </div>

            {/* Location Capture */}
            <div className="space-y-2">
              <Label>Location Coordinates</Label>
              <div className="flex items-center gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={getCurrentLocation}
                  className="flex items-center gap-2"
                  data-testid="button-purge-get-location"
                >
                  <MapPin className="w-4 h-4" />
                  Get Current Location
                </Button>
                {location && (
                  <span className="text-sm text-muted-foreground">
                    Lat: {location.latitude.toFixed(6)}, Long: {location.longitude.toFixed(6)}
                  </span>
                )}
              </div>
            </div>

            {/* Purge Measurements */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="actual-flow-rate">Actual Flow Rate (m³/h)</Label>
                <Input
                  id="actual-flow-rate"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Enter measured flow rate"
                  value={actualFlowRate}
                  onChange={(e) => handleFlowRateChange(e.target.value)}
                  data-testid="input-actual-flow-rate"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum required: {results?.calculation.minimumFlowRate || "0"} m³/h
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="actual-gas-content">Gas Content (%)</Label>
                <Input
                  id="actual-gas-content"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="Enter measured gas content"
                  value={actualGasContent}
                  onChange={(e) => handleGasContentChange(e.target.value)}
                  data-testid="input-actual-gas-content"
                />
                <p className="text-xs text-muted-foreground">
                  Must be ≤ 5.0% for pass
                </p>
              </div>

              {/* Test Result Badge */}
              <div className="flex items-center justify-center">
                <div 
                  className={`px-6 py-3 rounded-lg font-bold text-lg border-2 ${
                    purgeResult === "PASS" 
                      ? "bg-green-50 border-green-200 text-green-800" 
                      : purgeResult === "FAIL"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : "bg-yellow-50 border-yellow-200 text-yellow-800"
                  }`}
                  data-testid="badge-purge-result"
                >
                  {purgeResult === "PASS" && "✓ PASS"}
                  {purgeResult === "FAIL" && "✗ FAIL"}
                  {purgeResult === "PENDING" && "⏳ PENDING"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="text-primary mr-2 w-5 h-5" />
            Export Purge Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExportPDF} variant="outline" className="flex items-center gap-2" data-testid="button-export-purge-pdf">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button onClick={() => window.print()} variant="outline" className="flex items-center gap-2" data-testid="button-print-purge">
              <Printer className="w-4 h-4" />
              Print Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// New Strength Test Panel - separate component
function StrengthResultsPanel({ results }: TestResultsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch company branding for Professional users
  const { data: companyBranding } = useQuery<any>({
    queryKey: ["/api/company-branding"],
    enabled: user?.subscriptionTier === 'professional',
  });
  const [strengthPressureDrop, setStrengthPressureDrop] = useState<string>("");
  const [strengthResult, setStrengthResult] = useState<string>("PENDING");
  const [strengthDropPercentage, setStrengthDropPercentage] = useState<number | null>(null);
  const [siteName, setSiteName] = useState<string>("");
  const [sectionIdentity, setSectionIdentity] = useState<string>("");
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // Calculate pass/fail when actual pressure drop changes for strength test
  const handleStrengthPressureDropChange = (value: string) => {
    setStrengthPressureDrop(value);
    
    if (!results || !value) {
      setStrengthResult("PENDING");
      setStrengthDropPercentage(null);
      return;
    }
    
    const measuredDrop = parseFloat(value);
    const testPressure = parseFloat(results.calculation.testPressure || "0");
    
    // Strength test: calculate pressure drop as percentage of test pressure
    const dropPercentage = (measuredDrop / testPressure) * 100;
    const maxDropPercent = parseFloat(results.calculation.maxPressureDropPercent || "20");
    
    setStrengthDropPercentage(dropPercentage);
    setStrengthResult(dropPercentage <= maxDropPercent ? "PASS" : "FAIL");
  };

  const handleStrengthExportPDF = async () => {
    if (!results) return;
    
    // Check if user has PDF export privileges (Premium or Professional only)
    if (user?.subscriptionTier === 'free' || user?.subscriptionTier === 'basic') {
      toast({
        title: "Premium Subscription Required",
        description: "PDF export requires Premium subscription. Upgrade to export professional reports and access advanced features.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const testResults = {
        strengthPressureDrop,
        strengthDropPercentage: strengthDropPercentage ?? undefined,
        strengthResult,
        siteName: siteName,
        sectionIdentity: sectionIdentity,
        location: location,
        strengthCompleted: true
      };
      
      await generatePDF(results, testResults, user?.subscriptionTier === 'professional' ? companyBranding : undefined);
      toast({
        title: "PDF Generated",
        description: "Strength test report has been generated and downloaded",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    }
  };

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          toast({
            title: "Location Captured",
            description: `Lat: ${position.coords.latitude.toFixed(6)}, Long: ${position.coords.longitude.toFixed(6)}`,
          });
        },
        (error) => {
          toast({
            title: "Location Error",
            description: "Unable to get current location",
            variant: "destructive",
          });
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Strength Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Gauge className="text-primary mr-2 w-5 h-5" />
            Strength Test Results
          </CardTitle>
          <CardDescription>
            Record strength test measurements and determine pass/fail status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Site Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strength-site-name">Site Name</Label>
                <Input
                  id="strength-site-name"
                  type="text"
                  placeholder="Enter site name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  data-testid="input-strength-site-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="strength-section-identity">Section Identity</Label>
                <Input
                  id="strength-section-identity"
                  type="text"
                  placeholder="Enter section identity"
                  value={sectionIdentity}
                  onChange={(e) => setSectionIdentity(e.target.value)}
                  data-testid="input-strength-section-identity"
                />
              </div>
            </div>

            {/* Location Capture */}
            <div className="space-y-2">
              <Label>Location Coordinates</Label>
              <div className="flex items-center gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={getCurrentLocation}
                  className="flex items-center gap-2"
                  data-testid="button-strength-get-location"
                >
                  <MapPin className="w-4 h-4" />
                  Get Current Location
                </Button>
                {location && (
                  <span className="text-sm text-muted-foreground">
                    Lat: {location.latitude.toFixed(6)}, Long: {location.longitude.toFixed(6)}
                  </span>
                )}
              </div>
            </div>

            {/* Strength Test Measurements */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="strength-pressure-drop">Actual Pressure Drop (mbar)</Label>
                <Input
                  id="strength-pressure-drop"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter measured pressure drop"
                  value={strengthPressureDrop}
                  onChange={(e) => handleStrengthPressureDropChange(e.target.value)}
                  data-testid="input-strength-pressure-drop"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the pressure drop measured during the {results?.calculation.testDuration} strength test
                </p>
              </div>

              {strengthDropPercentage !== null && (
                <div className="bg-warning/10 p-4 rounded-lg border border-warning/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-foreground">
                      Pressure Drop Percentage:
                    </span>
                    <span className="font-bold text-lg text-warning" data-testid="text-strength-drop-percentage">
                      {strengthDropPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pressure drop as percentage of test pressure ({results?.calculation.testPressure} mbar). 
                    Max allowed: {results?.calculation.maxPressureDropPercent || "20"}%
                  </p>
                </div>
              )}

              {/* Test Result Badge */}
              <div className="flex items-center justify-center">
                <div 
                  className={`px-6 py-3 rounded-lg font-bold text-lg border-2 ${
                    strengthResult === "PASS" 
                      ? "bg-green-50 border-green-200 text-green-800" 
                      : strengthResult === "FAIL"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : "bg-yellow-50 border-yellow-200 text-yellow-800"
                  }`}
                  data-testid="badge-strength-result"
                >
                  {strengthResult === "PASS" && "✓ PASS"}
                  {strengthResult === "FAIL" && "✗ FAIL"}
                  {strengthResult === "PENDING" && "⏳ PENDING"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="text-primary mr-2 w-5 h-5" />
            Export Strength Test Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleStrengthExportPDF} variant="outline" className="flex items-center gap-2" data-testid="button-export-strength-pdf">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button onClick={() => window.print()} variant="outline" className="flex items-center gap-2" data-testid="button-print-strength">
              <Printer className="w-4 h-4" />
              Print Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Updated Tightness Test Panel - only for tightness tests  
function TestResultsPanel({ results }: TestResultsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch company branding for Professional users
  const { data: companyBranding } = useQuery<any>({
    queryKey: ["/api/company-branding"],
    enabled: user?.subscriptionTier === 'professional',
  });
  const [tightnessPressureDrop, setTightnessPressureDrop] = useState<string>("");
  const [tightnessResult, setTightnessResult] = useState<string>("PENDING");
  const [tightnessLeakageRate, setTightnessLeakageRate] = useState<number | null>(null);
  const [letByRise, setLetByRise] = useState<string>("");
  const [siteName, setSiteName] = useState<string>("");
  const [sectionIdentity, setSectionIdentity] = useState<string>("");
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);

  // Calculate pass/fail when tightness pressure drop changes
  const handleTightnessPressureDropChange = (value: string) => {
    setTightnessPressureDrop(value);
    
    if (!results || !value) {
      setTightnessResult("PENDING");
      setTightnessLeakageRate(null);
      return;
    }
    
    const measuredDrop = parseFloat(value);
    const testPressure = parseFloat(results.calculation.testPressure || "0");
    
    // Tightness test: calculate leakage rate
    const grm = parseFloat(results.calculation.maxPressureDrop || "0");
    const iv = parseFloat(results.calculation.totalSystemVolume || "0");
    const grmCalc = results.project.gaugeType === "Water Gauge" ? 0.5 : 0.1;
    const ttdOriginal = (iv * grmCalc * 1000) / (testPressure * 1.025);
    const actualLeakageRate = (measuredDrop / ttdOriginal) * 1000;
    
    setTightnessLeakageRate(actualLeakageRate);
    setTightnessResult(actualLeakageRate <= grm ? "PASS" : "FAIL");
  };

  const handleTightnessExportPDF = async () => {
    if (!results) return;
    
    // Check if user has PDF export privileges (Premium or Professional only)
    if (user?.subscriptionTier === 'free' || user?.subscriptionTier === 'basic') {
      toast({
        title: "Premium Subscription Required",
        description: "PDF export requires Premium subscription. Upgrade to export professional reports and access advanced features.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const testResults = {
        tightnessPressureDrop,
        tightnessLeakageRate: tightnessLeakageRate ?? undefined,
        tightnessResult,
        letByRise,
        siteName: siteName,
        sectionIdentity: sectionIdentity,
        location: location,
        tightnessCompleted: true
      };
      
      await generatePDF(results, testResults, user?.subscriptionTier === 'professional' ? companyBranding : undefined);
      toast({
        title: "PDF Generated",
        description: "Tightness test report has been generated and downloaded",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    }
  };

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          toast({
            title: "Location Captured",
            description: `Lat: ${position.coords.latitude.toFixed(6)}, Long: ${position.coords.longitude.toFixed(6)}`,
          });
        },
        (error) => {
          toast({
            title: "Location Error",
            description: "Unable to get current location",
            variant: "destructive",
          });
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Tightness Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Gauge className="text-primary mr-2 w-5 h-5" />
            Tightness Test Results
          </CardTitle>
          <CardDescription>
            Record tightness test measurements and determine pass/fail status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Site Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tightness-site-name">Site Name</Label>
                <Input
                  id="tightness-site-name"
                  type="text"
                  placeholder="Enter site name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  data-testid="input-tightness-site-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tightness-section-identity">Section Identity</Label>
                <Input
                  id="tightness-section-identity"
                  type="text"
                  placeholder="Enter section identity"
                  value={sectionIdentity}
                  onChange={(e) => setSectionIdentity(e.target.value)}
                  data-testid="input-tightness-section-identity"
                />
              </div>
            </div>

            {/* Location Capture */}
            <div className="space-y-2">
              <Label>Location Coordinates</Label>
              <div className="flex items-center gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={getCurrentLocation}
                  className="flex items-center gap-2"
                  data-testid="button-tightness-get-location"
                >
                  <MapPin className="w-4 h-4" />
                  Get Current Location
                </Button>
                {location && (
                  <span className="text-sm text-muted-foreground">
                    Lat: {location.latitude.toFixed(6)}, Long: {location.longitude.toFixed(6)}
                  </span>
                )}
              </div>
            </div>

            {/* Tightness Test Measurements */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tightness-pressure-drop">Actual Pressure Drop (mbar)</Label>
                <Input
                  id="tightness-pressure-drop"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter measured pressure drop"
                  value={tightnessPressureDrop}
                  onChange={(e) => handleTightnessPressureDropChange(e.target.value)}
                  data-testid="input-tightness-pressure-drop"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the pressure drop measured during the {results?.calculation.testDuration} tightness test
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="let-by-rise">Let-by Rise (mbar)</Label>
                <Input
                  id="let-by-rise"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter witnessed rise"
                  value={letByRise}
                  onChange={(e) => setLetByRise(e.target.value)}
                  data-testid="input-let-by-rise"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the let-by rise witnessed during the tightness test
                </p>
              </div>

              {tightnessLeakageRate !== null && (
                <div className="bg-warning/10 p-4 rounded-lg border border-warning/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-foreground">
                      Leakage Rate:
                    </span>
                    <span className="font-bold text-lg text-warning" data-testid="text-tightness-leakage-rate">
                      {tightnessLeakageRate.toFixed(3)} cm³/h
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calculated leakage rate. Max allowed: {results?.calculation.maxPressureDrop || "0"} cm³/h
                  </p>
                </div>
              )}

              {/* Test Result Badge */}
              <div className="flex items-center justify-center">
                <div 
                  className={`px-6 py-3 rounded-lg font-bold text-lg border-2 ${
                    tightnessResult === "PASS" 
                      ? "bg-green-50 border-green-200 text-green-800" 
                      : tightnessResult === "FAIL"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : "bg-yellow-50 border-yellow-200 text-yellow-800"
                  }`}
                  data-testid="badge-tightness-result"
                >
                  {tightnessResult === "PASS" && "✓ PASS"}
                  {tightnessResult === "FAIL" && "✗ FAIL"}
                  {tightnessResult === "PENDING" && "⏳ PENDING"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="text-primary mr-2 w-5 h-5" />
            Export Tightness Test Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleTightnessExportPDF} variant="outline" className="flex items-center gap-2" data-testid="button-export-tightness-pdf">
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <Button onClick={() => window.print()} variant="outline" className="flex items-center gap-2" data-testid="button-print-tightness">
              <Printer className="w-4 h-4" />
              Print Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Export all components for use in other parts of the application
export { StrengthResultsPanel, TestResultsPanel, PurgeResultsPanel };

// Main Results Panel component that determines which sub-component to render
export function ResultsPanel({ results }: ResultsPanelProps) {
  const isTestOperation = results?.project.operationType === "Tightness Test" || results?.project.operationType === "Strength Test";
  const isPurgeOperation = results?.project.operationType === "Purge";
  
  if (isTestOperation) {
    // For test operations, show the appropriate test panel
    if (results?.project.operationType === "Strength Test") {
      return <StrengthResultsPanel results={results} />;
    } else {
      return <TestResultsPanel results={results} />;
    }
  }
  
  if (isPurgeOperation) {
    return <PurgeResultsPanel results={results} />;
  }
  
  // Default fallback for other operation types
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Box className="text-primary mr-2 w-5 h-5" />
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            <p>No results to display</p>
            <p className="text-sm">Complete the form and click Calculate to see results</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}