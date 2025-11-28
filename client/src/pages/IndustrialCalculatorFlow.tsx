import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, ArrowLeft, Wrench, TestTube, Gauge, Wind, Settings, Play, ClipboardList, ArrowRight, Building, CheckCircle, FileText } from "lucide-react";
import { SiX } from "react-icons/si";
import { UserHeader } from "@/components/UserHeader";
import { Stopwatch } from "@/components/Stopwatch";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubscriptionGate } from "@/components/SubscriptionGate";

// Industrial pipe volumes - includes all sizes from calculations.tsx
const INDUSTRIAL_PIPE_VOLUMES = {
  steel: {
    "15": { label: "15mm (1/2\")", volume: 0.00024 },
    "20": { label: "20mm (3/4\")", volume: 0.00046 },
    "25": { label: "25mm (1\")", volume: 0.00064 },
    "32": { label: "32mm (1¼\")", volume: 0.0011 },
    "40": { label: "40mm (1½\")", volume: 0.0015 },
    "50": { label: "50mm (2\")", volume: 0.0024 },
    "65": { label: "65mm (2½\")", volume: 0.0038 },
    "80": { label: "80mm (3\")", volume: 0.0054 },
    "100": { label: "100mm (4\")", volume: 0.009 },
    "125": { label: "125mm (5\")", volume: 0.014 },
    "150": { label: "150mm (6\")", volume: 0.02 },
    "200": { label: "200mm (8\")", volume: 0.035 },
    "250": { label: "250mm (10\")", volume: 0.053 },
    "300": { label: "300mm (12\")", volume: 0.074 },
  },
  copper: {
    "15": { label: "15mm", volume: 0.00014 },
    "22": { label: "22mm", volume: 0.00032 },
    "28": { label: "28mm", volume: 0.00054 },
    "35": { label: "35mm", volume: 0.00084 },
    "42": { label: "42mm", volume: 0.0012 },
    "54": { label: "54mm", volume: 0.0021 },
    "67": { label: "67mm", volume: 0.0033 },
    "76": { label: "76mm", volume: 0.0042 },
    "108": { label: "108mm", volume: 0.0084 },
    "133": { label: "133mm", volume: 0.013 },
    "159": { label: "159mm", volume: 0.018 },
  }
};

// Industrial meter volumes - matches backend METER_SPECS exactly
const INDUSTRIAL_METER_VOLUMES = {
  none: { label: "No Meter", volume: 0 },
  "G4/U6": { label: "G4/U6", volume: 0.008 },
  "U16": { label: "U16", volume: 0.025 },
  "U25": { label: "U25", volume: 0.037 },
  "U40": { label: "U40", volume: 0.067 },
  "U65": { label: "U65", volume: 0.1 },
  "U100": { label: "U100", volume: 0.182 },
  "U160": { label: "U160", volume: 0.304 },
};

type FlowStep = "job-details" | "installation-type" | "pipe-configuration" | "meter-configuration" | "calculation-settings" | "results";

interface JobDetails {
  jobNumber: string;
  customerName: string;
  engineerName: string;
  gasSafeNumber: string;
  location: string;
}

interface PipeConfig {
  id: string;
  nominalSize: string;
  length: string;
  material?: string;
}

interface MeterConfig {
  type: string;
  quantity: string;
}

export default function IndustrialCalculatorFlow() {
  const [currentStep, setCurrentStep] = useState<FlowStep>("job-details");
  
  // Fetch company branding for auto-populate
  const { data: companyBranding } = useQuery({
    queryKey: ["/api/company-branding"],
  }) as { data: any };
  
  const [jobDetails, setJobDetails] = useState<JobDetails>({
    jobNumber: "",
    customerName: "",
    engineerName: "",
    gasSafeNumber: "",
    location: ""
  });

  const [installationType, setInstallationType] = useState<string>("");

  const [pipeConfigs, setPipeConfigs] = useState<PipeConfig[]>([
    { id: "1", nominalSize: "", length: "" }
  ]);

  const [meterConfig, setMeterConfig] = useState<MeterConfig>({
    type: "none",
    quantity: "0"
  });

  const [operationType, setOperationType] = useState<string>("");
  const [testMedium, setTestMedium] = useState<string>("Air");
  const [gaugeType, setGaugeType] = useState<string>("electronic05");
  const [maxOperatingPressure, setMaxOperatingPressure] = useState<string>("");
  const [maxIncidentalPressure, setMaxIncidentalPressure] = useState<string>("");
  const [zoneType, setZoneType] = useState<string>("Type A");
  const [roomVolume, setRoomVolume] = useState<string>("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Actual test reading inputs
  const [actualPressureDrop, setActualPressureDrop] = useState<string>("");
  const [actualFlowRate, setActualFlowRate] = useState<string>("");
  const [actualGasContent, setActualGasContent] = useState<string>("");
  const [letByPressureReading, setLetByPressureReading] = useState<string>("");
  const [letByTestCompleted, setLetByTestCompleted] = useState<boolean>(false);
  const [purgeDirection, setPurgeDirection] = useState<"air-to-gas" | "gas-to-air" | "">("");
  
  // Purge hose/stack configuration
  const [purgeHoseSize, setPurgeHoseSize] = useState<string>("");
  const [purgeHoseLength, setPurgeHoseLength] = useState<string>("");
  const [purgeStackSize, setPurgeStackSize] = useState<string>("");
  const [purgeStackLength, setPurgeStackLength] = useState<string>("");
  
  // Multiple test workflow state
  const [completedTests, setCompletedTests] = useState<{
    [key: string]: {
      results: any;
      actualReadings: any;
      testResult: string;
      timestamp: string;
    }
  }>({});

  const { toast } = useToast();
  
  // Auto-populate engineer details from company branding
  useEffect(() => {
    if (companyBranding && !jobDetails.engineerName && !jobDetails.gasSafeNumber) {
      setJobDetails(prev => ({
        ...prev,
        engineerName: companyBranding.engineerName || "",
        gasSafeNumber: companyBranding.gasSafeNumber || ""
      }));
    }
  }, [companyBranding]);

  // Auto-scroll to new sections as they appear
  useEffect(() => {
    const timer = setTimeout(() => {
      const elements = document.querySelectorAll('[data-auto-scroll="true"]');
      if (elements.length > 0) {
        const lastElement = elements[elements.length - 1];
        lastElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep, results]);

  // Reset let-by test state when changing operation types
  useEffect(() => {
    if (operationType !== "Tightness Test") {
      // When leaving Tightness Test, preserve let-by data if test was completed
      if (!letByTestCompleted) {
        setLetByPressureReading("");
      }
      // Note: Don't reset letByTestCompleted here - let it persist
    } else if (operationType === "Tightness Test") {
      // When entering Tightness Test, only clear if let-by test wasn't completed
      if (!letByTestCompleted) {
        setLetByPressureReading("");
      }
      // Note: Don't reset letByTestCompleted here - let user actions control it
    }
  }, [operationType]);

  // Calculate let-by test result
  const getLetByTestResult = (): 'PASS' | 'FAIL' => {
    if (!letByPressureReading) return 'FAIL';
    const pressureIncrease = parseFloat(letByPressureReading);
    // Let-by test passes when pressure hasn't increased (≤ 0)
    return pressureIncrease <= 0 ? 'PASS' : 'FAIL';
  };
  
  // Calculate test result based on actual readings
  const getTestResult = (): 'PASS' | 'FAIL' => {
    if (!actualPressureDrop || !results?.calculation) return 'FAIL';
    
    const actualDrop = parseFloat(actualPressureDrop);
    
    if (operationType === "Strength Test") {
      // Strength test: actual drop should be ≤ 20% of test pressure
      const testPressure = parseFloat(results.calculation.testPressure);
      const maxAllowedDrop = testPressure * 0.2;
      return actualDrop <= maxAllowedDrop ? 'PASS' : 'FAIL';
    } else if (operationType === "Tightness Test") {
      // Tightness test: actual drop should be ≤ max permissible drop
      const maxDropString = results.calculation.maxPressureDrop;
      if (!maxDropString || maxDropString === "" || maxDropString === null) {
        console.error("Max pressure drop not calculated:", maxDropString);
        return 'FAIL';
      }
      const maxDrop = parseFloat(maxDropString);
      if (isNaN(maxDrop)) {
        console.error("Invalid max pressure drop:", maxDropString);
        return 'FAIL';
      }
      return actualDrop <= maxDrop ? 'PASS' : 'FAIL';
    }
    
    return 'FAIL';
  };

  // Calculate purge result - uses flow rate AND gas content criteria
  const getPurgeResult = (): 'PASS' | 'FAIL' => {
    if (!actualFlowRate || !actualGasContent || !results?.calculation || !purgeDirection) {
      return 'FAIL';
    }
    
    const flowRatePass = parseFloat(actualFlowRate) >= parseFloat(results.calculation.minimumFlowRate || "0");
    const gasContentPass = purgeDirection === "air-to-gas" 
      ? parseFloat(actualGasContent) >= 90
      : parseFloat(actualGasContent) <= 1.8;
    
    return (flowRatePass && gasContentPass) ? 'PASS' : 'FAIL';
  };

  // Enhanced test persistence system
  const saveCurrentTest = () => {
    if (!results || !operationType) return;
    
    const testResult = operationType === "Purge" ? getPurgeResult() : getTestResult();
    const actualReadings = {
      actualPressureDrop,
      actualFlowRate,
      actualGasContent
    };
    
    setCompletedTests(prev => ({
      ...prev,
      [operationType]: {
        results,
        actualReadings,
        testResult,
        timestamp: new Date().toISOString()
      }
    }));
  };
  
  // Save let-by test data for existing installations
  const saveLetByTest = () => {
    if (installationType !== "existing" || !letByPressureReading) return;
    
    setCompletedTests(prev => ({
      ...prev,
      "Let-by Test": {
        actualReadings: {
          actualPressureDrop: letByPressureReading,
          letByPressureReading: letByPressureReading // For compatibility
        },
        testResult: getLetByTestResult(),
        results: results, // Include current test pressure info
        timestamp: new Date().toISOString()
      }
    }));
  };
  
  // Comprehensive save before test transitions
  const saveAllTestData = () => {
    // Save current test data if available
    if (results && operationType) {
      saveCurrentTest();
    }
    
    // Save let-by data if we're on existing tightness test with let-by reading
    if (installationType === "existing" && operationType === "Tightness Test" && letByPressureReading) {
      saveLetByTest();
    }
  };

  // Start next test in sequence
  const startNextTest = async (nextTestType: string) => {
    saveAllTestData(); // Use comprehensive save instead of just current test
    
    // Reset actual readings for new test
    setActualPressureDrop("");
    setActualFlowRate("");
    setActualGasContent("");
    
    // IMPORTANT: Clear results from previous test
    setResults(null);
    
    // Set new operation type
    setOperationType(nextTestType);
    
    // For purge operations, go directly to results since no pressure calculation needed
    // For other tests, go to pipe configuration so user can review/modify pipes
    if (nextTestType === "Purge") {
      // Need to trigger calculation first for purge parameters, then go to results
      await handleCalculate();
      setCurrentStep("results");
    } else {
      // Go to pipe configuration first so user can review pipe setup
      setCurrentStep("pipe-configuration");
    }
  };

  // Get next logical test
  const getNextTest = (): string | null => {
    if (operationType === "Strength Test") return "Tightness Test";
    if (operationType === "Tightness Test") return "Purge";
    return null; // No next test after Purge
  };

  const addPipeConfig = () => {
    const newId = (pipeConfigs.length + 1).toString();
    setPipeConfigs([...pipeConfigs, { 
      id: newId, 
      nominalSize: "", 
      length: ""
    }]);
  };

  const removePipeConfig = (id: string) => {
    if (pipeConfigs.length > 1) {
      setPipeConfigs(pipeConfigs.filter(pipe => pipe.id !== id));
    }
  };

  const updatePipeConfig = (id: string, field: keyof PipeConfig, value: string) => {
    setPipeConfigs(pipeConfigs.map(pipe => 
      pipe.id === id ? { ...pipe, [field]: value } : pipe
    ));
  };

  // Convert time string like "06:26" to seconds
  const parseTimeToSeconds = (timeString: string): number => {
    if (!timeString) return 0;
    const parts = timeString.split(':');
    if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return (minutes * 60) + seconds;
  };

  // Calculate installation volume from pipe configurations
  const calculateInstallationVolume = () => {
    const total = pipeConfigs.reduce((totalVolume, pipe) => {
      if (!pipe.nominalSize || !pipe.length) return totalVolume;
      
      const material = pipe.material || "steel";
      const volumes = INDUSTRIAL_PIPE_VOLUMES[material as keyof typeof INDUSTRIAL_PIPE_VOLUMES];
      
      // Try multiple key formats: "100", "100mm", etc.
      const sizeKey = pipe.nominalSize;
      const sizeKeyMm = pipe.nominalSize.endsWith('mm') ? pipe.nominalSize : pipe.nominalSize + 'mm';
      const sizeKeyNum = pipe.nominalSize.replace('mm', '');
      
      
      let volumeData = null;
      if (volumes) {
        const lookup1 = (volumes as any)[sizeKey];
        const lookup2 = (volumes as any)[sizeKeyMm];
        const lookup3 = (volumes as any)[sizeKeyNum];
        volumeData = lookup1 || lookup2 || lookup3;
      }
      
      if (volumeData) {
        const volumePerMeter = volumeData.volume; // Use .volume property, not .volumePerMeter
        const length = parseFloat(pipe.length) || 0;
        const pipeVolume = volumePerMeter * length;
        return totalVolume + pipeVolume;
      }
      
      return totalVolume;
    }, 0);
    
    return total;
  };

  // Calculate let-by test duration - same as TTD for Industrial
  const calculateLetByTiming = () => {
    // For industrial, let-by test duration should be the same as TTD
    if (results?.calculation?.testDurationSeconds) {
      return results.calculation.testDurationSeconds; // Use existing calculation if available
    }
    
    // Calculate TTD for both let-by and tightness tests (they use the same duration)
    const installationVolume = calculateInstallationVolume();
    if (installationVolume <= 0 || isNaN(installationVolume)) return null; // Need valid pipe config first
    
    // TTD calculation matching backend logic
    const grm = (gaugeType === "electronic05" || gaugeType === "water" || gaugeType === "Water Gauge") ? 0.5 : 0.1;
    const f1 = testMedium === "Air" ? 67 : 42;
    
    let ttdSeconds = grm * installationVolume * f1 * 60; // Default Type A calculation
    
    // Type B calculation - only for existing installations with room volume
    if (zoneType === "Type B" && installationType === "existing" && roomVolume) {
      const rv = parseFloat(roomVolume);
      if (!isNaN(rv) && rv > 0) {
        ttdSeconds = 2.8 * grm * installationVolume * (1/rv) * f1 * 60;
      }
    }
    
    // Type C calculation
    if (zoneType === "Type C") {
      ttdSeconds = 0.047 * grm * installationVolume * f1 * 60;
    }
    
    // Apply minimum 2-minute test time (120 seconds) and ensure valid number
    const finalTime = Math.max(ttdSeconds, 120);
    return isNaN(finalTime) ? null : finalTime;
  };

  const letByTiming = useMemo(() => {
    return calculateLetByTiming();
  }, [results?.calculation?.testDurationSeconds, pipeConfigs, gaugeType, zoneType, installationType, roomVolume, testMedium]);

  const handleCalculate = async () => {
    // Detailed validation with specific error messages
    const missingFields = [];
    
    if (!jobDetails.jobNumber) missingFields.push("Job Number");
    if (!jobDetails.engineerName) missingFields.push("Engineer Name");
    if (!jobDetails.gasSafeNumber) missingFields.push("Gas Safe Number");
    if (!jobDetails.customerName) missingFields.push("Customer Name"); 
    if (!jobDetails.location) missingFields.push("Location");
    if (!installationType) missingFields.push("Installation Type");
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing Required Information",
        description: `Please complete: ${missingFields.join(", ")}. Go back to previous steps to fill these in.`,
        variant: "destructive",
      });
      return;
    }

    const validPipes = pipeConfigs.filter(pipe => pipe.nominalSize && pipe.length);
    if (validPipes.length === 0) {
      toast({
        title: "No Pipe Configuration",
        description: "Please go back to 'Pipe Configuration' step and add at least one pipe section",
        variant: "destructive",
      });
      return;
    }

    // Additional validation for operation-specific fields
    if ((operationType === "Strength Test" || operationType === "Tightness Test") && !maxOperatingPressure) {
      toast({
        title: "Missing Operating Pressure",
        description: "Maximum Operating Pressure (MOP) is required for test calculations",
        variant: "destructive",
      });
      return;
    }

    setIsCalculating(true);
    
    try {
      const calculationData = {
        calculatorType: "industrial", // Add calculator type for Industrial Calculator
        project: {
          reference: jobDetails.jobNumber, // Backend expects 'reference' not 'jobNumber'
          engineerName: jobDetails.engineerName,
          installationType,
          operationType,
          gasType: "Natural Gas",
          testMedium,
          gaugeType,
          maxOperatingPressure: maxOperatingPressure ? parseFloat(maxOperatingPressure) : undefined,
          maxIncidentalPressure: maxIncidentalPressure ? parseFloat(maxIncidentalPressure) : undefined,
          safetyFactor: 1.5,
          zoneType: zoneType,
          roomVolume: (installationType === "existing" && zoneType === "Type B" && roomVolume) ? parseFloat(roomVolume) : undefined
        },
        pipeConfigurations: pipeConfigs.map(pipe => ({
          nominalSize: pipe.nominalSize + "mm", // Add mm suffix for backend compatibility
          length: parseFloat(pipe.length) || 0
        })),
        purgeConfigurations: operationType === "Purge" && (purgeHoseSize || purgeStackSize) ? [
          ...(purgeHoseSize && purgeHoseLength ? [{
            type: "hose",
            nominalSize: purgeHoseSize + "mm",
            length: parseFloat(purgeHoseLength) || 0
          }] : []),
          ...(purgeStackSize && purgeStackLength ? [{
            type: "stack",
            nominalSize: purgeStackSize + "mm", 
            length: parseFloat(purgeStackLength) || 0
          }] : [])
        ] : [],
        meterConfigurations: meterConfig.type !== "none" ? [
          {
            meterType: meterConfig.type,
            quantity: parseInt(meterConfig.quantity) || 1
          }
        ] : []
      };

      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calculationData)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Calculation failed');
      }

      setResults(data);
      setCurrentStep("results");
      
      toast({
        title: "Calculation Complete",
        description: `${operationType} calculations completed successfully`,
      });
    } catch (error) {
      console.error('Calculation error:', error);
      toast({
        title: "Calculation Error",
        description: error instanceof Error ? error.message : "Failed to calculate. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  };


  // Render functions for progressive disclosure
  const renderJobDetails = () => (
    <div className="max-w-2xl mx-auto">
      <Card data-auto-scroll="true">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Job Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="jobNumber">Job Number *</Label>
              <Input
                id="jobNumber"
                value={jobDetails.jobNumber}
                onChange={(e) => setJobDetails({...jobDetails, jobNumber: e.target.value})}
                placeholder="e.g., IND-2024-001"
                data-testid="input-job-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={jobDetails.customerName}
                onChange={(e) => setJobDetails({...jobDetails, customerName: e.target.value})}
                placeholder="e.g., ABC Manufacturing Ltd"
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engineerName">Engineer Name *</Label>
              <Input
                id="engineerName"
                value={jobDetails.engineerName}
                onChange={(e) => setJobDetails({...jobDetails, engineerName: e.target.value})}
                placeholder="e.g., John Smith"
                data-testid="input-engineer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gasSafeNumber">Gas Safe Number *</Label>
              <Input
                id="gasSafeNumber"
                value={jobDetails.gasSafeNumber}
                onChange={(e) => setJobDetails({...jobDetails, gasSafeNumber: e.target.value})}
                placeholder="e.g., 12345678"
                data-testid="input-gas-safe-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={jobDetails.location}
                onChange={(e) => setJobDetails({...jobDetails, location: e.target.value})}
                placeholder="e.g., London, UK"
                data-testid="input-location"
              />
            </div>
          </div>
          
        </CardContent>
      </Card>
    </div>
  );

  const renderInstallationTypeSelection = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Industrial Gas Installation</h1>
        <p className="text-muted-foreground">Select your installation type and room classification</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Installation Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <button
              className="h-32 flex flex-col items-center justify-center gap-4 bg-white rounded-lg shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all duration-200 transform hover:-translate-y-1"
              onClick={() => {
                setInstallationType("new");
              }}
            >
              <Wrench className="w-12 h-12 text-blue-600" />
              <div className="font-semibold text-lg">New Installation</div>
            </button>

            <button
              className="h-32 flex flex-col items-center justify-center gap-4 bg-white rounded-lg shadow-lg hover:shadow-xl hover:bg-green-50 transition-all duration-200 transform hover:-translate-y-1"
              onClick={() => {
                setInstallationType("existing");
              }}
            >
              <Settings className="w-12 h-12 text-green-600" />
              <div className="font-semibold text-lg">Existing Installation</div>
            </button>
          </div>
        </CardContent>
      </Card>


      {/* Room Type Selection - Only show for existing installations */}
      {installationType === "existing" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Room Classification
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Select the room type for tightness test requirements
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                className={`h-28 flex flex-col items-center justify-center gap-3 rounded-lg transition-all duration-200 transform hover:-translate-y-1 border-b-4 shadow-lg hover:shadow-xl ${
                  zoneType === "Type A" 
                    ? "bg-orange-500 text-white border-orange-700 shadow-orange-200" 
                    : "bg-white text-gray-700 border-gray-300 hover:bg-orange-50 hover:border-orange-200"
                }`}
                onClick={() => setZoneType("Type A")}
                data-testid="button-zone-type-a"
              >
                <Building className="w-8 h-8" />
                <div className="text-center">
                  <div className="font-semibold text-sm">Type A</div>
                  <div className="text-xs opacity-90">New & Existing</div>
                  <div className="text-xs opacity-90">Unventilated Areas</div>
                </div>
              </button>

              <button
                className={`h-28 flex flex-col items-center justify-center gap-3 rounded-lg transition-all duration-200 transform hover:-translate-y-1 border-b-4 shadow-lg hover:shadow-xl ${
                  zoneType === "Type B" 
                    ? "bg-orange-500 text-white border-orange-700 shadow-orange-200" 
                    : "bg-white text-gray-700 border-gray-300 hover:bg-orange-50 hover:border-orange-200"
                }`}
                onClick={() => setZoneType("Type B")}
                data-testid="button-zone-type-b"
              >
                <Building className="w-8 h-8" />
                <div className="text-center">
                  <div className="font-semibold text-sm">Type B</div>
                  <div className="text-xs opacity-90">Existing Rooms</div>
                  <div className="text-xs opacity-90">&lt; 60m³</div>
                </div>
              </button>

              <button
                className={`h-28 flex flex-col items-center justify-center gap-3 rounded-lg transition-all duration-200 transform hover:-translate-y-1 border-b-4 shadow-lg hover:shadow-xl ${
                  zoneType === "Type C" 
                    ? "bg-orange-500 text-white border-orange-700 shadow-orange-200" 
                    : "bg-white text-gray-700 border-gray-300 hover:bg-orange-50 hover:border-orange-200"
                }`}
                onClick={() => setZoneType("Type C")}
                data-testid="button-zone-type-c"
              >
                <Building className="w-8 h-8" />
                <div className="text-center">
                  <div className="font-semibold text-sm">Type C</div>
                  <div className="text-xs opacity-90">Adequately</div>
                  <div className="text-xs opacity-90">Ventilated</div>
                </div>
              </button>
            </div>

            {/* Selected Zone Type Summary */}
            {zoneType && (
              <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-orange-600" />
                  <span className="font-semibold text-orange-800">Selected: {zoneType}</span>
                </div>
                <p className="text-sm text-orange-700 mt-2">
                  {zoneType === "Type A" && "New and existing installations in unventilated areas - Standard tightness test requirements apply."}
                  {zoneType === "Type B" && "Existing installations in rooms less than 60m³ - Modified tightness test requirements."}
                  {zoneType === "Type C" && "Installations in adequately ventilated areas - Relaxed tightness test requirements."}
                </p>
              </div>
            )}

            {/* Room Volume Input - Only show for existing Type B */}
            {installationType === "existing" && zoneType === "Type B" && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-3">📏 Room Volume Required</h4>
                <p className="text-sm text-blue-700 mb-4">
                  Type B calculations require the room volume for the TTD formula: TTD = 2.8 × GRM × IV × (1/RV) × F1 × 60
                </p>
                <div className="space-y-2">
                  <Label htmlFor="room-volume">Room Volume (m³)</Label>
                  <Input
                    id="room-volume"
                    type="number"
                    step="0.1"
                    min="1"
                    max="59.9"
                    placeholder="Enter room volume (must be < 60m³)"
                    value={roomVolume}
                    onChange={(e) => setRoomVolume(e.target.value)}
                    data-testid="input-room-volume"
                    className="w-full"
                  />
                  {parseFloat(roomVolume) >= 60 && (
                    <p className="text-sm text-red-600">
                      ⚠️ Room volume must be less than 60m³ for Type B. Use Type C for larger rooms.
                    </p>
                  )}
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderPipeConfiguration = () => (
    <div className="max-w-4xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Pipe Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {pipeConfigs.map((pipe) => (
              <div key={pipe.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-gray-100 border border-gray-200 rounded-lg shadow-sm">
                <div className="space-y-2">
                  <Label>Material</Label>
                  <Select
                    value={pipe.material || "steel"}
                    onValueChange={(value) => updatePipeConfig(pipe.id, "material", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="steel">Steel</SelectItem>
                      <SelectItem value="copper">Copper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nominal Size</Label>
                  <Select
                    value={pipe.nominalSize}
                    onValueChange={(value) => updatePipeConfig(pipe.id, "nominalSize", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(INDUSTRIAL_PIPE_VOLUMES[pipe.material as keyof typeof INDUSTRIAL_PIPE_VOLUMES || "steel"] || INDUSTRIAL_PIPE_VOLUMES.steel).map(([size, info]) => (
                        <SelectItem key={size} value={size}>
                          {(info as any).label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Length (m)</Label>
                  <Input
                    type="number"
                    placeholder="Enter length"
                    value={pipe.length}
                    onChange={(e) => updatePipeConfig(pipe.id, "length", e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removePipeConfig(pipe.id)}
                    disabled={pipeConfigs.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          <Button onClick={addPipeConfig} variant="outline" className="w-full">
            + Add Pipe Section
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderTestSelection = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle>Test Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-4 ${installationType === "new" ? "grid-cols-3" : "grid-cols-2"}`}>
            {installationType === "new" && (
              <button
                className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-orange-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
                onClick={() => {
                  setOperationType("Strength Test");
                  setTimeout(() => {
                    const element = document.querySelector('[data-auto-scroll="true"]');
                    if (element) {
                      const lastElement = document.querySelectorAll('[data-auto-scroll="true"]');
                      if (lastElement.length > 0) {
                        lastElement[lastElement.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }
                  }, 100);
                }}
              >
                <Gauge className="w-8 h-8 text-orange-600" />
                <span className="text-sm font-semibold">Strength Test</span>
              </button>
            )}

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-blue-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => {
                setOperationType("Tightness Test");
                setTimeout(() => {
                  const element = document.querySelector('[data-auto-scroll="true"]');
                  if (element) {
                    const lastElement = document.querySelectorAll('[data-auto-scroll="true"]');
                    if (lastElement.length > 0) {
                      lastElement[lastElement.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }
                }, 100);
              }}
            >
              <TestTube className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-semibold">Tightness Test</span>
            </button>

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-purple-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => {
                setOperationType("Purge");
                setTimeout(() => {
                  const element = document.querySelector('[data-auto-scroll="true"]');
                  if (element) {
                    const lastElement = document.querySelectorAll('[data-auto-scroll="true"]');
                    if (lastElement.length > 0) {
                      lastElement[lastElement.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }
                }, 100);
              }}
            >
              <Wind className="w-8 h-8 text-purple-600" />
              <span className="text-sm font-semibold">Purge</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render functions for remaining sections
  const renderTestConfiguration = () => (
    <div className="max-w-4xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5" />
            {operationType} Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Gauge Type Selection - Required for all Industrial tests */}
          {(operationType === "Strength Test" || operationType === "Tightness Test") && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">Test Equipment Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gaugeType">Gauge Type *</Label>
                  <Select value={gaugeType} onValueChange={(newGaugeType) => {
                    setGaugeType(newGaugeType);
                    // Auto-recalculate if we already have results
                    if (results && !isCalculating) {
                      handleCalculate();
                    }
                  }}>
                    <SelectTrigger data-testid="select-gauge-type">
                      <SelectValue placeholder="Select gauge type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="electronic01">Electronic (0.1 mbar / 2 decimal)</SelectItem>
                      <SelectItem value="electronic05">Electronic (0.5 mbar GRM)</SelectItem>
                      <SelectItem value="water">Water Gauge</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-700">
                    GRM affects TTD calculations: 0.1 mbar for precision gauges, 0.5 mbar for standard electronic/water gauges
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="testMedium">Test Medium *</Label>
                  <Select value={testMedium} onValueChange={setTestMedium}>
                    <SelectTrigger data-testid="select-test-medium">
                      <SelectValue placeholder="Select test medium" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Air">Air</SelectItem>
                      <SelectItem value="Natural Gas">Natural Gas</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-700">
                    Affects TTD calculations (F1: Air=67, Gas=42)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Operating Pressure Inputs - only for Strength and Tightness tests */}
          {(operationType === "Strength Test" || operationType === "Tightness Test") && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="maxOperatingPressure">Maximum Operating Pressure (MOP) - mbar *</Label>
                  <Input
                    id="maxOperatingPressure"
                    type="number"
                    step="0.1"
                    placeholder="Enter MOP"
                    value={maxOperatingPressure}
                    onChange={(e) => setMaxOperatingPressure(e.target.value)}
                    data-testid="input-max-operating-pressure"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxIncidentalPressure">Maximum Incidental Pressure (MIP) - mbar</Label>
                  <Input
                    id="maxIncidentalPressure"
                    type="number"
                    step="0.1"
                    placeholder="Enter MIP (optional)"
                    value={maxIncidentalPressure}
                    onChange={(e) => setMaxIncidentalPressure(e.target.value)}
                    data-testid="input-max-incidental-pressure"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Let-by Test as part of Tightness Test - ONLY for existing installations */}
          {operationType === "Tightness Test" && installationType === "existing" && !letByTestCompleted && (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-semibold text-yellow-800 mb-2">Step 1: Let-by Test (Safety Requirement)</h4>
                <div className="text-sm text-yellow-700 space-y-1">
                  <p>• Close all isolation valves and appliance valves</p>
                  <p>• Apply test pressure to upstream of meter</p>
                  <p>• Monitor downstream pressure for any increase</p>
                  <p>• Test passes if pressure doesn't increase (≤ 0 mbar)</p>
                </div>
              </div>

              {/* Let-by Test Timing and Stopwatch - Show immediately when we have MOP */}
              {maxOperatingPressure && (
                <div className="mt-6">
                  <div className="mb-4 p-3 bg-yellow-100 rounded-lg">
                    <h4 className="font-semibold text-yellow-800 mb-2">Let-by Test Parameters</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm text-yellow-700">
                      <div>
                        <span className="font-semibold">Test Pressure:</span>
                        <div className="text-lg font-bold text-yellow-900">{(parseFloat(maxOperatingPressure) * 0.5).toFixed(1)} mbar</div>
                        <div className="text-xs text-yellow-600">50% of MOP</div>
                      </div>
                      <div>
                        <span className="font-semibold">Test Duration:</span>
                        <div className="text-lg font-bold text-yellow-900">
                          {letByTiming ? Math.round(letByTiming / 60) : "Calculating..."} minutes
                        </div>
                        <div className="text-xs text-yellow-600">Same as TTD</div>
                      </div>
                    </div>
                  </div>
                  {letByTiming && (
                    <Stopwatch 
                      presetTime={Math.round(letByTiming)}
                      className="bg-yellow-50"
                    />
                  )}
                </div>
              )}
              
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Let-by Test Reading</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="letByPressureReading">Pressure Increase (mbar)</Label>
                    <Input
                      id="letByPressureReading"
                      type="number"
                      step="0.1"
                      placeholder="Enter pressure increase (0 or negative = pass)"
                      value={letByPressureReading}
                      onChange={(e) => setLetByPressureReading(e.target.value)}
                      data-testid="input-letby-pressure"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter positive value if pressure increased, 0 or negative if no increase
                    </p>
                  </div>
                  
                  {/* Let-by Test Result */}
                  {letByPressureReading !== "" && (
                    <div className="space-y-2">
                      <Label>Let-by Test Result</Label>
                      <div 
                        key={`letby-result-${letByPressureReading}`}
                        className={`p-3 rounded-lg font-bold text-lg ${
                          getLetByTestResult() === 'PASS' 
                            ? 'bg-green-100 text-green-800 border border-green-300' 
                            : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {getLetByTestResult() === 'PASS' ? '✓ PASS' : '✗ FAIL'}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Continue to Tightness Test button */}
                {letByPressureReading && getLetByTestResult() === 'PASS' && (
                  <div className="mt-4">
                    <Button 
                      onClick={() => setLetByTestCompleted(true)}
                      className="w-full gap-2 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Continue to Tightness Test
                    </Button>
                  </div>
                )}
                
                {letByPressureReading && getLetByTestResult() === 'FAIL' && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 font-semibold">⚠️ Let-by test failed. Resolve gas leakage before continuing to tightness test.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Purge Configuration - only for Purge operations */}
          {operationType === "Purge" && (
            <div className="space-y-6">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="font-semibold text-purple-800 mb-2">Purge Equipment Configuration</h4>
                <div className="text-sm text-purple-700 space-y-1">
                  <p>• Configure purge hose and stack dimensions for volume calculations</p>
                  <p>• PV = (IV pipe + fittings(10%) + IV meter + IV purge) × 1.5</p>
                  <p>• Flow rate based on largest pipe diameter</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h5 className="font-semibold text-purple-800">Purge Hose</h5>
                  <div className="space-y-2">
                    <Label htmlFor="purgeHoseSize">Hose Size</Label>
                    <Select value={purgeHoseSize} onValueChange={setPurgeHoseSize}>
                      <SelectTrigger data-testid="select-purge-hose-size">
                        <SelectValue placeholder="Select hose size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20mm (3/4")</SelectItem>
                        <SelectItem value="25">25mm (1")</SelectItem>
                        <SelectItem value="40">40mm (1.5")</SelectItem>
                        <SelectItem value="50">50mm (2")</SelectItem>
                        <SelectItem value="100">100mm (4")</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purgeHoseLength">Hose Length (m)</Label>
                    <Input
                      id="purgeHoseLength"
                      type="number"
                      step="0.1"
                      placeholder="Enter hose length"
                      value={purgeHoseLength}
                      onChange={(e) => setPurgeHoseLength(e.target.value)}
                      data-testid="input-purge-hose-length"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="font-semibold text-purple-800">Purge Stack</h5>
                  <div className="space-y-2">
                    <Label htmlFor="purgeStackSize">Stack Size</Label>
                    <Select value={purgeStackSize} onValueChange={setPurgeStackSize}>
                      <SelectTrigger data-testid="select-purge-stack-size">
                        <SelectValue placeholder="Select stack size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20mm (3/4")</SelectItem>
                        <SelectItem value="25">25mm (1")</SelectItem>
                        <SelectItem value="40">40mm (1.5")</SelectItem>
                        <SelectItem value="50">50mm (2")</SelectItem>
                        <SelectItem value="100">100mm (4")</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purgeStackLength">Stack Length (m)</Label>
                    <Input
                      id="purgeStackLength"
                      type="number"
                      step="0.1"
                      placeholder="Enter stack length"
                      value={purgeStackLength}
                      onChange={(e) => setPurgeStackLength(e.target.value)}
                      data-testid="input-purge-stack-length"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Calculate Button - show for strength test or tightness test after let-by completed */}
          {(operationType === "Strength Test" || 
            (operationType === "Tightness Test" && 
             (installationType === "new" || letByTestCompleted))) && (
            <Button
              onClick={handleCalculate}
              disabled={!operationType || isCalculating || !maxOperatingPressure}
              className={operationType === "Tightness Test" 
                ? "w-full gap-2 bg-green-600 hover:bg-green-700 text-white shadow-lg transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                : "w-full gap-2"
              }
            >
              {isCalculating ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Calculating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Calculate {operationType}
                </>
              )}
            </Button>
          )}

          {/* Calculate Button for Purge operations */}
          {operationType === "Purge" && (
            <Button
              onClick={handleCalculate}
              disabled={!operationType || isCalculating || (!purgeHoseSize && !purgeStackSize)}
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {isCalculating ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Calculating...
                </>
              ) : (
                <>
                  <Wind className="w-4 h-4" />
                  Calculate Purge Requirements
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderResults = () => (
    <div className="max-w-4xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-green-600" />
              {operationType} Results
            </span>
            {results?.calculation && (
              <Badge className="bg-green-600">
                Calculated
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {results?.calculation && operationType !== "Purge" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-green-700">Test Pressure</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-800">{results.calculation.testPressure} mbar</p>
                </CardContent>
              </Card>
              
              {operationType === "Tightness Test" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-700">Max Pressure Drop</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-blue-800">{results.calculation.maxPressureDrop} mbar</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Purge Results Display */}
          {results?.calculation && operationType === "Purge" && (
            <div className="space-y-6">
              {/* Purge Calculation Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-purple-700">Required Purge Volume</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-purple-800">{results.calculation.requiredPurgeVolume} m³</p>
                    <p className="text-xs text-muted-foreground">PV = (IV + purge) × 1.5</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-700">Minimum Flow Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-blue-800">{results.calculation.minimumFlowRate} m³/hr</p>
                    <p className="text-xs text-muted-foreground">From Industrial Purge Table</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-orange-700">Maximum Purge Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-orange-800">{results.calculation.maximumPurgeTime}</p>
                    <p className="text-xs text-muted-foreground">PV × 3600 ÷ Flow Rate</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-green-700">System Volume</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-800">{results.calculation.totalSystemVolume} m³</p>
                    <p className="text-xs text-muted-foreground">Total Installation Volume</p>
                  </CardContent>
                </Card>
              </div>

              {/* Purge Direction Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Purge Direction</h3>
                <RadioGroup value={purgeDirection} onValueChange={(value: "air-to-gas" | "gas-to-air") => setPurgeDirection(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="air-to-gas" id="air-to-gas" />
                    <Label htmlFor="air-to-gas">Air to Gas (Final gas content must be ≥ 90%)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="gas-to-air" id="gas-to-air" />
                    <Label htmlFor="gas-to-air">Gas to Air (Final gas content must be ≤ 1.8%)</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Equipment Requirements */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Required Equipment (Industrial Purge Table)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Purge Point Nominal Bore</Label>
                    <Input 
                      value={`${results.calculation.purgePointBore || 20}mm`}
                      readOnly
                      className="bg-gray-50 font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Minimum required bore size</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Largest Pipe Diameter</Label>
                    <Input 
                      value={`${results.calculation.largestPipeDiameter || 0}mm`}
                      readOnly
                      className="bg-gray-50 font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Determines flow rate requirements</p>
                  </div>
                </div>
              </div>

              {/* Purge Timer */}
              {purgeDirection && results?.calculation?.maximumPurgeTime && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Purge Timer</h3>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-orange-700">Maximum Purge Time</div>
                        <div className="text-lg font-bold text-orange-800">{results.calculation.maximumPurgeTime}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-orange-700">Flow Rate Required</div>
                        <div className="text-lg font-bold text-orange-800">≥ {results.calculation.minimumFlowRate} m³/hr</div>
                      </div>
                    </div>
                    <Stopwatch 
                      presetTime={Math.round(parseTimeToSeconds(results.calculation.maximumPurgeTime))}
                      className="bg-orange-50"
                    />
                  </div>
                </div>
              )}

              {/* Actual Readings for Purge */}
              {purgeDirection && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Actual Readings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="actualFlowRate">Actual Flow Rate Achieved (m³/hr)</Label>
                      <Input
                        id="actualFlowRate"
                        type="number"
                        step="0.1"
                        placeholder="Enter actual flow rate"
                        value={actualFlowRate}
                        onChange={(e) => setActualFlowRate(e.target.value)}
                        data-testid="input-actual-flow-rate"
                      />
                      <p className="text-xs text-muted-foreground">
                        Must be ≥ {results.calculation.minimumFlowRate} m³/hr
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="actualGasContent">Actual Gas Content Achieved (%)</Label>
                      <Input
                        id="actualGasContent"
                        type="number"
                        step="0.1"
                        placeholder="Enter final gas percentage"
                        value={actualGasContent}
                        onChange={(e) => setActualGasContent(e.target.value)}
                        data-testid="input-actual-gas-content"
                      />
                      <p className="text-xs text-muted-foreground">
                        {purgeDirection === "air-to-gas" ? "Must be ≥ 90%" : "Must be ≤ 1.8%"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Purge Test Result */}
                  {actualFlowRate && actualGasContent && (
                    <div className="space-y-2">
                      <Label>Purge Test Result</Label>
                      <div className={`p-3 rounded-lg font-bold text-lg ${
                        (() => {
                          const flowRatePass = parseFloat(actualFlowRate) >= parseFloat(results.calculation.minimumFlowRate || "0");
                          const gasContentPass = purgeDirection === "air-to-gas" 
                            ? parseFloat(actualGasContent) >= 90
                            : parseFloat(actualGasContent) <= 1.8;
                          const passed = flowRatePass && gasContentPass;
                          return passed
                            ? 'bg-green-100 text-green-800 border border-green-300' 
                            : 'bg-red-100 text-red-800 border border-red-300';
                        })()
                      }`}>
                        {(() => {
                          const flowRatePass = parseFloat(actualFlowRate) >= parseFloat(results.calculation.minimumFlowRate || "0");
                          const gasContentPass = purgeDirection === "air-to-gas" 
                            ? parseFloat(actualGasContent) >= 90
                            : parseFloat(actualGasContent) <= 1.8;
                          const passed = flowRatePass && gasContentPass;
                          return passed ? '✓ PASS' : '✗ FAIL';
                        })()}
                      </div>
                      
                      {/* Show detailed pass/fail breakdown */}
                      <div className="text-sm space-y-1">
                        <div className={`flex items-center gap-2 ${
                          parseFloat(actualFlowRate) >= parseFloat(results.calculation.minimumFlowRate || "0")
                            ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {parseFloat(actualFlowRate) >= parseFloat(results.calculation.minimumFlowRate || "0") ? '✓' : '✗'}
                          Flow Rate: {actualFlowRate} m³/hr (Required: ≥ {results.calculation.minimumFlowRate} m³/hr)
                        </div>
                        <div className={`flex items-center gap-2 ${
                          purgeDirection === "air-to-gas" 
                            ? (parseFloat(actualGasContent) >= 90 ? 'text-green-600' : 'text-red-600')
                            : (parseFloat(actualGasContent) <= 1.8 ? 'text-green-600' : 'text-red-600')
                        }`}>
                          {(() => {
                            const gasContentPass = purgeDirection === "air-to-gas" 
                              ? parseFloat(actualGasContent) >= 90
                              : parseFloat(actualGasContent) <= 1.8;
                            return gasContentPass ? '✓' : '✗';
                          })()}
                          Gas Content: {actualGasContent}% (Required: {purgeDirection === "air-to-gas" ? "≥ 90%" : "≤ 1.8%"})
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* Test Timing and Stopwatch */}
          {(operationType === "Strength Test" || operationType === "Tightness Test") && (
            <div className="mt-6">
              <div className="mb-4">
                <h4 className="font-semibold text-green-800 mb-2">Test Timing</h4>
                {operationType === "Strength Test" ? (
                  <div className="text-sm text-green-700 space-y-1">
                    <p>• Stabilization: {results.calculation?.stabilizationTime || 5} minutes</p>
                    <p>• Test Duration: {Math.round((results.calculation?.testDurationSeconds || 300) / 60)} minutes</p>
                    <p className="font-semibold">• Total: {((results.calculation?.stabilizationTime || 5) + Math.round((results.calculation?.testDurationSeconds || 300) / 60))} minutes</p>
                  </div>
                ) : (
                  <div className="text-sm text-green-700 space-y-1">
                    <p>• Stabilization: {Math.max(15, Math.round((results.calculation?.testDurationSeconds || 120) / 60))} minutes (Industrial standard)</p>
                    <p>• Test Duration: {Math.round((results.calculation?.testDurationSeconds || 120) / 60)} minutes (TTD)</p>
                    <p className="font-semibold">• Total: {Math.max(15, Math.round((results.calculation?.testDurationSeconds || 120) / 60)) + Math.round((results.calculation?.testDurationSeconds || 120) / 60)} minutes</p>
                  </div>
                )}
              </div>
              <Stopwatch 
                presetTime={
                  operationType === "Strength Test" 
                    ? ((results.calculation?.stabilizationTime || 5) * 60) + (results.calculation?.testDurationSeconds || 300)
                    : (() => {
                        // Parse TTD from "20:00" format and calculate industrial stabilization
                        const testDurationStr = results.calculation?.testDuration || "2:00";
                        const [minutes] = testDurationStr.split(':').map(Number);
                        const ttdMinutes = minutes || 2;
                        
                        // Industrial stabilization: max(15 minutes, TTD)
                        const stabilizationMinutes = Math.max(15, ttdMinutes);
                        const totalMinutes = stabilizationMinutes + ttdMinutes;
                        
                        return totalMinutes * 60; // Convert to seconds
                      })()
                }
                className="bg-green-50"
              />
            </div>
          )}

          {/* Test Input Fields */}
          {(operationType === "Strength Test" || operationType === "Tightness Test") && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Test Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="actualPressureDrop">Actual Pressure Drop (mbar)</Label>
                  <Input
                    id="actualPressureDrop"
                    type="number"
                    step="0.1"
                    placeholder="Enter actual pressure drop"
                    value={actualPressureDrop}
                    onChange={(e) => setActualPressureDrop(e.target.value)}
                    data-testid="input-actual-pressure-drop"
                  />
                </div>
                
                {/* Test Result */}
                {actualPressureDrop && (
                  <div className="space-y-2">
                    <Label>Test Result</Label>
                    <div className={`p-3 rounded-lg font-bold text-lg ${
                      getTestResult() === 'PASS' 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      {getTestResult() === 'PASS' ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* Print Certificate and Next Test Buttons */}
          {((operationType === "Strength Test" && actualPressureDrop) ||
            (operationType === "Tightness Test" && (installationType === "new" || letByTestCompleted) && actualPressureDrop) ||
            (operationType === "Purge" && actualFlowRate && actualGasContent)) && (
            <div className="mt-6 space-y-4">
              {/* Export Certificate Button */}
              <Button 
                onClick={async () => {
                  // Save all current data before generating PDF
                  saveAllTestData();
                  
                  // Collect all test data for the certificate - REVERTED TO WORKING DIRECT MAPPING APPROACH
                  const testData = {
                    // Job Details
                    jobNumber: jobDetails.jobNumber,
                    customerName: jobDetails.customerName,
                    location: jobDetails.location,
                    engineerName: jobDetails.engineerName,
                    gasSafeNumber: jobDetails.gasSafeNumber,
                    // System Configuration
                    zoneType: zoneType,
                    installationType: installationType,
                    testMedium: testMedium,
                    gaugeType: gaugeType,
                    pipeConfigs: pipeConfigs.map(pipe => {
                      if (!pipe.nominalSize || !pipe.length) return pipe;
                      
                      // Calculate volume for this pipe
                      const material = pipe.material || "steel";
                      const volumes = INDUSTRIAL_PIPE_VOLUMES[material as keyof typeof INDUSTRIAL_PIPE_VOLUMES];
                      
                      // Try multiple key formats: "100", "100mm", etc.
                      const sizeKey = pipe.nominalSize;
                      const sizeKeyMm = pipe.nominalSize.endsWith('mm') ? pipe.nominalSize : pipe.nominalSize + 'mm';
                      const sizeKeyNum = pipe.nominalSize.replace('mm', '');
                      
                      let volumeData = null;
                      if (volumes) {
                        const lookup1 = (volumes as any)[sizeKey];
                        const lookup2 = (volumes as any)[sizeKeyMm];
                        const lookup3 = (volumes as any)[sizeKeyNum];
                        volumeData = lookup1 || lookup2 || lookup3;
                      }
                      
                      const calculatedVolume = volumeData ? (volumeData.volume * parseFloat(pipe.length)).toFixed(3) : '0.000';
                      
                      return {
                        ...pipe,
                        calculatedVolume
                      };
                    }),
                    meterType: meterConfig.type,
                    meterQuantity: meterConfig.quantity,
                    totalSystemVolume: results?.calculation?.totalSystemVolume,
                    maximumOperatingPressure: maxOperatingPressure,
                    roomVolume: roomVolume,
                    // Test Results - Prioritize completed tests, fall back to current test
                    strengthTestPressure: completedTests["Strength Test"]?.results?.calculation?.testPressure || 
                                        (operationType === "Strength Test" ? results?.calculation?.testPressure : undefined),
                    strengthTestDuration: '10',
                    strengthActualPressureDrop: completedTests["Strength Test"]?.actualReadings?.actualPressureDrop || 
                                              (operationType === "Strength Test" ? actualPressureDrop : undefined),
                    strengthMaxPressureDrop: completedTests["Strength Test"]?.results?.calculation?.testPressure ? 
                                           (completedTests["Strength Test"].results.calculation.testPressure * 0.2).toFixed(1) : 
                                           (operationType === "Strength Test" && results?.calculation?.testPressure ? 
                                             (results.calculation.testPressure * 0.2).toFixed(1) : undefined),
                    strengthTestResult: completedTests["Strength Test"]?.testResult || 
                                      (operationType === "Strength Test" ? getTestResult() : undefined),
                    tightnessTestPressure: completedTests["Tightness Test"]?.results?.calculation?.testPressure || 
                                         (operationType === "Tightness Test" ? results?.calculation?.testPressure : undefined),
                    tightnessStabilization: completedTests["Tightness Test"]?.results?.calculation?.stabilizationTime || 
                                          (operationType === "Tightness Test" ? results?.calculation?.stabilizationTime : undefined),
                    stabilizationTime: completedTests["Tightness Test"]?.results?.calculation?.stabilizationTime || 
                                     (operationType === "Tightness Test" ? results?.calculation?.stabilizationTime : undefined),
                    testDuration: completedTests["Tightness Test"]?.results?.calculation?.testDuration || 
                                (operationType === "Tightness Test" ? results?.calculation?.testDuration : undefined),
                    tightnessActualPressureDrop: completedTests["Tightness Test"]?.actualReadings?.actualPressureDrop || 
                                               (operationType === "Tightness Test" ? actualPressureDrop : undefined),
                    tightnessMaxPressureDrop: completedTests["Tightness Test"]?.results?.calculation?.maxPressureDrop || 
                                            (operationType === "Tightness Test" ? results?.calculation?.maxPressureDrop : undefined),
                    tightnessTestResult: completedTests["Tightness Test"]?.testResult || 
                                       (operationType === "Tightness Test" ? getTestResult() : undefined),
                    // Purge Test Results (if completed)
                    purgeVolume: completedTests["Purge"]?.results?.calculation?.requiredPurgeVolume || 
                               (operationType === "Purge" ? results?.calculation?.requiredPurgeVolume : undefined),
                    minimumFlowRate: completedTests["Purge"]?.results?.calculation?.minimumFlowRate || 
                                   (operationType === "Purge" ? results?.calculation?.minimumFlowRate : undefined),
                    maxPurgeTime: completedTests["Purge"]?.results?.calculation?.maximumPurgeTime || 
                                (operationType === "Purge" ? results?.calculation?.maximumPurgeTime : undefined),
                    actualGasContent: completedTests["Purge"]?.actualReadings?.actualGasContent || 
                                    (operationType === "Purge" ? actualGasContent : undefined),
                    actualFlowRate: completedTests["Purge"]?.actualReadings?.actualFlowRate || 
                                  (operationType === "Purge" ? actualFlowRate : undefined),
                    purgeTestResult: completedTests["Purge"]?.testResult || 
                                   (operationType === "Purge" ? getPurgeResult() : undefined),
                    // Let-by Test Results (only for existing installations)
                    letByTestPressure: installationType === "existing" && maxOperatingPressure ? 
                                     (parseFloat(maxOperatingPressure) * 0.5).toFixed(1) : undefined,
                    letByActualPressureDrop: installationType === "existing" ? 
                                          (completedTests["Let-by Test"]?.actualReadings?.actualPressureDrop || 
                                           letByPressureReading || undefined) : undefined,
                    letByMaxAllowed: installationType === "existing" ? 0 : undefined,
                    letByTestResult: installationType === "existing" ? 
                                   (completedTests["Let-by Test"]?.testResult || getLetByTestResult()) : undefined
                  };
                  
                  try {
                    const response = await fetch('/api/pdf/generate-industrial', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(testData),
                      credentials: 'include'
                    });
                    
                    if (response.ok) {
                      // Get HTML response and navigate to it directly
                      const html = await response.text();
                      
                      // Store current page state in sessionStorage
                      sessionStorage.setItem('calculatorReturnUrl', window.location.href);
                      
                      // Replace current page with certificate
                      document.open();
                      document.write(html);
                      document.close();
                    } else {
                      toast({
                        title: "Error",
                        description: "Failed to generate certificate. Please try again.",
                        variant: "destructive"
                      });
                    }
                  } catch (error) {
                    console.error('Error generating certificate:', error);
                    toast({
                      title: "Error",
                      description: "Failed to generate certificate. Please try again.",
                      variant: "destructive"
                    });
                  }
                }}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform text-white"
              >
                <FileText className="w-4 h-4" />
                Print Test Certificate
              </Button>
              
              {/* Next Test Button - Only show when current test is completed and passed */}
              {getNextTest() && 
               ((operationType === "Strength Test" && actualPressureDrop && getTestResult() === 'PASS') ||
                (operationType === "Tightness Test" && (installationType === "new" || letByTestCompleted) && actualPressureDrop && getTestResult() === 'PASS')) && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-green-800">Ready for Next Test?</h4>
                      <p className="text-sm text-green-600">Continue to {getNextTest()} using the same system volume and settings</p>
                    </div>
                    <Button 
                      onClick={() => startNextTest(getNextTest()!)}
                      className="bg-green-600 hover:bg-green-700 text-white gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Start {getNextTest()}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );

  const renderMeterConfiguration = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="w-5 h-5 mr-2 text-primary" />
            Meter Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="meter-type">Meter Type</Label>
              <Select value={meterConfig.type} onValueChange={(value) => setMeterConfig(prev => ({ ...prev, type: value }))}>
                <SelectTrigger data-testid="select-meter-type">
                  <SelectValue placeholder="Select meter type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INDUSTRIAL_METER_VOLUMES).map(([key, meter]) => (
                    <SelectItem key={key} value={key}>
                      {meter.label} {key !== "none" && `(${meter.volume.toFixed(3)} m³)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {meterConfig.type !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="meter-quantity">Quantity</Label>
                <Input
                  id="meter-quantity"
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={meterConfig.quantity}
                  onChange={(e) => setMeterConfig(prev => ({ ...prev, quantity: e.target.value }))}
                  data-testid="input-meter-quantity"
                />
              </div>
            )}
          </div>
          
          {meterConfig.type !== "none" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-blue-700 font-medium">Total Meter Volume:</span>
                <span className="text-blue-900 font-mono">
                  {(INDUSTRIAL_METER_VOLUMES[meterConfig.type as keyof typeof INDUSTRIAL_METER_VOLUMES]?.volume * parseInt(meterConfig.quantity || "0")).toFixed(6)} m³
                </span>
              </div>
            </div>
          )}

          {/* IV Synopsis Display - Show when both pipes and meter are configured */}
          {pipeConfigs.some(pipe => pipe.nominalSize && pipe.length) && meterConfig.type && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-3">📊 Installation Volume (IV) Synopsis</h4>
              
              {/* Pipe Volumes Breakdown */}
              <div className="space-y-2 mb-4">
                <h5 className="font-medium text-green-700">Pipe Volumes:</h5>
                {pipeConfigs.map((pipe, index) => {
                  if (!pipe.nominalSize || !pipe.length) return null;
                  const material = pipe.material || "steel";
                  const materialData = INDUSTRIAL_PIPE_VOLUMES[material as keyof typeof INDUSTRIAL_PIPE_VOLUMES];
                  const pipeData = materialData?.[pipe.nominalSize as keyof typeof materialData];
                  const volume = pipeData ? pipeData.volume * parseFloat(pipe.length) : 0;
                  return (
                    <div key={index} className="text-sm text-green-600 ml-2">
                      • {pipeData?.label} × {pipe.length}m = {volume.toFixed(4)} m³
                    </div>
                  );
                })}
                
                {/* Pipe Total with Fittings */}
                {(() => {
                  let totalPipeVolume = 0;
                  pipeConfigs.forEach(pipe => {
                    if (pipe.nominalSize && pipe.length) {
                      const material = pipe.material || "steel";
                      const materialData = INDUSTRIAL_PIPE_VOLUMES[material as keyof typeof INDUSTRIAL_PIPE_VOLUMES];
                      const pipeData = materialData?.[pipe.nominalSize as keyof typeof materialData];
                      if (pipeData) {
                        totalPipeVolume += pipeData.volume * parseFloat(pipe.length);
                      }
                    }
                  });
                  const totalWithFittings = totalPipeVolume * 1.1;
                  return (
                    <div className="text-sm font-medium text-green-700 ml-2 mt-1 pt-1 border-t border-green-300">
                      Pipe Total: {totalPipeVolume.toFixed(4)} m³ + 10% fittings = {totalWithFittings.toFixed(4)} m³
                    </div>
                  );
                })()}
              </div>

              {/* Meter Volume */}
              <div className="space-y-2 mb-4">
                <h5 className="font-medium text-green-700">Meter Volume:</h5>
                {(() => {
                  const meterVolume = INDUSTRIAL_METER_VOLUMES[meterConfig.type as keyof typeof INDUSTRIAL_METER_VOLUMES]?.volume || 0;
                  const totalMeterVolume = meterVolume * parseInt(meterConfig.quantity || "1");
                  const meterLabel = INDUSTRIAL_METER_VOLUMES[meterConfig.type as keyof typeof INDUSTRIAL_METER_VOLUMES]?.label || meterConfig.type;
                  return (
                    <div className="text-sm text-green-600 ml-2">
                      • {meterLabel} × {meterConfig.quantity || 1} = {totalMeterVolume.toFixed(4)} m³
                    </div>
                  );
                })()}
              </div>

              {/* Total Installation Volume */}
              {(() => {
                let totalPipeVolume = 0;
                pipeConfigs.forEach(pipe => {
                  if (pipe.nominalSize && pipe.length) {
                    const material = pipe.material || "steel";
                    const materialData = INDUSTRIAL_PIPE_VOLUMES[material as keyof typeof INDUSTRIAL_PIPE_VOLUMES];
                    const pipeData = materialData?.[pipe.nominalSize as keyof typeof materialData];
                    if (pipeData) {
                      totalPipeVolume += pipeData.volume * parseFloat(pipe.length);
                    }
                  }
                });
                const meterVolume = INDUSTRIAL_METER_VOLUMES[meterConfig.type as keyof typeof INDUSTRIAL_METER_VOLUMES]?.volume || 0;
                const totalMeterVolume = meterVolume * parseInt(meterConfig.quantity || "1");
                const totalInstallationVolume = totalPipeVolume * 1.1 + totalMeterVolume;
                
                return (
                  <div className="p-3 bg-green-100 rounded border border-green-300">
                    <div className="font-bold text-green-800 text-lg">
                      🎯 Total Installation Volume (IV): {totalInstallationVolume.toFixed(4)} m³
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      Used for TTD calculations and test requirements
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <SubscriptionGate calculatorType="industrial">
      <div className="min-h-screen bg-background">
      <UserHeader />
      
      <div className="container mx-auto px-4 py-8" id="main-content">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Selection</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-3 bg-green-100 rounded-lg">
                <Factory className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" aria-label="Industrial Calculator Icon" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-green-600">Industrial Calculator</h1>
              </div>
            </div>
          </div>
          
          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={() => {
              // Reset all data
              setJobDetails({ jobNumber: "", customerName: "", engineerName: "", gasSafeNumber: "", location: "" });
              setInstallationType("");
              setPipeConfigs([{ id: "1", nominalSize: "", length: "" }]);
              setMeterConfig({ type: "none", quantity: "0" });
              setOperationType("");
              setMaxOperatingPressure("");
              setMaxIncidentalPressure("");
              setActualPressureDrop("");
              setActualFlowRate("");
              setActualGasContent("");
              setResults(null);
              setCompletedTests({});
              setCurrentStep("job-details");
              toast({
                title: "Data Reset",
                description: "All test data has been cleared. You can start fresh.",
              });
            }}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Clear All Data</span>
            <span className="sm:hidden">Clear</span>
          </Button>
        </div>

        {/* Progressive Form Content */}
        <div className="space-y-6">
          {/* Job Details Section - Always visible */}
          {renderJobDetails()}
          
          {/* Installation Type Section - Show when job details complete */}
          {(jobDetails.jobNumber && jobDetails.engineerName && jobDetails.gasSafeNumber && jobDetails.customerName && jobDetails.location) && renderInstallationTypeSelection()}
          
          {/* Test Selection Section - Show when installation type selected */}
          {installationType && renderTestSelection()}
          
          {/* Pipe Configuration Section - Show when test type selected */}
          {installationType && operationType && renderPipeConfiguration()}
          
          {/* Meter Configuration Section - Show when pipes configured */}
          {installationType && operationType && pipeConfigs.some(pipe => pipe.nominalSize && pipe.length) && renderMeterConfiguration()}
          
          {/* Test Configuration Section - Show when pipes and meter configured */}
          {installationType && operationType && pipeConfigs.some(pipe => pipe.nominalSize && pipe.length) && meterConfig.type && renderTestConfiguration()}
          
          {/* Completed Test Summary Sections - Show completed tests when not currently active */}
          {completedTests["Strength Test"] && operationType !== "Strength Test" && (
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <TestTube className="w-5 h-5" />
                    Strength Test - Completed
                    <Badge className={completedTests["Strength Test"].testResult === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {completedTests["Strength Test"].testResult}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <span className="text-muted-foreground">Test Pressure:</span>
                    <span>{completedTests["Strength Test"].results.calculation?.testPressure} mbar</span>
                    <span className="text-muted-foreground">Actual Drop:</span>
                    <span className={completedTests["Strength Test"].testResult === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                      {completedTests["Strength Test"].actualReadings.actualPressureDrop} mbar
                    </span>
                    <span className="text-muted-foreground">Result:</span>
                    <span className={completedTests["Strength Test"].testResult === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {completedTests["Strength Test"].testResult}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {completedTests["Tightness Test"] && operationType !== "Tightness Test" && (
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <TestTube className="w-5 h-5" />
                    Tightness Test - Completed
                    <Badge className={completedTests["Tightness Test"].testResult === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {completedTests["Tightness Test"].testResult}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <span className="text-muted-foreground">Test Pressure:</span>
                    <span>{completedTests["Tightness Test"].results.calculation?.testPressure} mbar</span>
                    <span className="text-muted-foreground">Max Pressure Drop:</span>
                    <span>{completedTests["Tightness Test"].results.calculation?.maxPressureDrop} mbar</span>
                    <span className="text-muted-foreground">Actual Drop:</span>
                    <span className={completedTests["Tightness Test"].testResult === 'PASS' ? 'text-blue-600' : 'text-red-600'}>
                      {completedTests["Tightness Test"].actualReadings.actualPressureDrop} mbar
                    </span>
                    <span className="text-muted-foreground">Result:</span>
                    <span className={completedTests["Tightness Test"].testResult === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {completedTests["Tightness Test"].testResult}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {completedTests["Purge"] && operationType !== "Purge" && (
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-600">
                    <TestTube className="w-5 h-5" />
                    Purge Test - Completed
                    <Badge className={completedTests["Purge"].testResult === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {completedTests["Purge"].testResult}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <span className="text-muted-foreground">Required Volume:</span>
                    <span>{completedTests["Purge"].results.calculation?.requiredPurgeVolume} m³</span>
                    <span className="text-muted-foreground">Flow Rate:</span>
                    <span>{completedTests["Purge"].actualReadings.actualFlowRate} m³/h</span>
                    <span className="text-muted-foreground">Gas Content:</span>
                    <span className={completedTests["Purge"].testResult === 'PASS' ? 'text-purple-600' : 'text-red-600'}>
                      {completedTests["Purge"].actualReadings.actualGasContent}%
                    </span>
                    <span className="text-muted-foreground">Result:</span>
                    <span className={completedTests["Purge"].testResult === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {completedTests["Purge"].testResult}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Results Section - Show when calculation is done */}
          {results && (operationType === "Strength Test" || operationType === "Purge" || (operationType === "Tightness Test" && (installationType === "new" || letByTestCompleted))) && renderResults()}
          
          {/* X Social Link Footer */}
          <div className="mt-12 pt-6 border-t border-border">
            <div className="flex justify-center">
              <a 
                href="https://x.com/beartecuk?t=z-LarE7LCa4ArrQmXfNzug&s=09" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-x-profile"
                aria-label="Follow BearTec on X"
              >
                <SiX className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
      </div>
    </SubscriptionGate>
  );
}