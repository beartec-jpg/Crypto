import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, ArrowLeft, Wrench, TestTube, Gauge, Wind, Settings, Play, ClipboardList, ArrowRight, CheckCircle, FileText } from "lucide-react";
import { SiX } from "react-icons/si";
import { UserHeader } from "@/components/UserHeader";
import { Stopwatch } from "@/components/Stopwatch";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubscriptionGate } from "@/components/SubscriptionGate";

// Commercial pipe volumes - up to 6" pipe (same as original commercial)
const COMMERCIAL_PIPE_VOLUMES = {
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
  },
  copper: {
    "15": { label: "15mm", volume: 0.00014 },
    "22": { label: "22mm", volume: 0.00032 },
    "28": { label: "28mm", volume: 0.00054 },
    "35": { label: "35mm", volume: 0.00084 },
    "42": { label: "42mm", volume: 0.0012 },
    "54": { label: "54mm", volume: 0.0021 },
    "67": { label: "67mm", volume: 0.0033 },
  }
};

// Commercial meter volumes
const COMMERCIAL_METER_VOLUMES = {
  none: { label: "No Meter", volume: 0 },
  "G4/U6": { label: "G4/U6", volume: 0.008 },
  "U16": { label: "U16", volume: 0.025 },
  "U25": { label: "U25", volume: 0.037 },
  "U40": { label: "U40", volume: 0.067 },
  "U65": { label: "U65", volume: 0.100 },
  "U100": { label: "U100", volume: 0.182 },
  "U160": { label: "U160", volume: 0.304 },
  "Domestic": { label: "Domestic", volume: 0.0024 },
};

// Table 7 - Tightness Test Duration for EXISTING installations
const TIGHTNESS_DURATION_EXISTING = [
  { maxIV: 0.15, air: 2, gas: 2 },
  { maxIV: 0.3, air: 3, gas: 2 },
  { maxIV: 0.45, air: 5, gas: 3 },
  { maxIV: 0.6, air: 6, gas: 4 },
  { maxIV: 0.75, air: 8, gas: 5 },
  { maxIV: 0.9, air: 9, gas: 6 },
  { maxIV: 1.0, air: 10, gas: 6 }
];

// Table 8 - Let-by Test Duration for EXISTING installations only
const _LETBY_DURATION_EXISTING = [
  { maxIV: 0.5, duration: 2 },
  { maxIV: 0.8, duration: 3 },
  { maxIV: 1.0, duration: 4 }
];

// Table 6 - Tightness Test Duration for NEW installations
const TIGHTNESS_DURATION_NEW = [
  { maxIV: 0.06, electronic05: 2, electronicDecimal: 2 }, { maxIV: 0.09, electronic05: 3, electronicDecimal: 2 },
  { maxIV: 0.12, electronic05: 4, electronicDecimal: 2 }, { maxIV: 0.15, electronic05: 5, electronicDecimal: 2 },
  { maxIV: 0.18, electronic05: 6, electronicDecimal: 2 }, { maxIV: 0.21, electronic05: 7, electronicDecimal: 2 },
  { maxIV: 0.24, electronic05: 8, electronicDecimal: 2 }, { maxIV: 0.27, electronic05: 9, electronicDecimal: 2 },
  { maxIV: 0.30, electronic05: 10, electronicDecimal: 2 }, { maxIV: 0.33, electronic05: 11, electronicDecimal: 3 },
  { maxIV: 0.36, electronic05: 12, electronicDecimal: 3 }, { maxIV: 0.39, electronic05: 13, electronicDecimal: 3 },
  { maxIV: 0.42, electronic05: 14, electronicDecimal: 3 }, { maxIV: 0.45, electronic05: 15, electronicDecimal: 3 },
  { maxIV: 0.48, electronic05: 16, electronicDecimal: 4 }, { maxIV: 0.51, electronic05: 17, electronicDecimal: 4 },
  { maxIV: 0.54, electronic05: 18, electronicDecimal: 4 }, { maxIV: 0.57, electronic05: 19, electronicDecimal: 4 },
  { maxIV: 0.60, electronic05: 20, electronicDecimal: 4 }, { maxIV: 0.63, electronic05: 21, electronicDecimal: 5 },
  { maxIV: 0.66, electronic05: 22, electronicDecimal: 5 }, { maxIV: 0.69, electronic05: 23, electronicDecimal: 5 },
  { maxIV: 0.72, electronic05: 24, electronicDecimal: 5 }, { maxIV: 0.75, electronic05: 25, electronicDecimal: 5 },
  { maxIV: 0.78, electronic05: 26, electronicDecimal: 6 }, { maxIV: 0.81, electronic05: 27, electronicDecimal: 6 },
  { maxIV: 0.84, electronic05: 28, electronicDecimal: 6 }, { maxIV: 0.87, electronic05: 29, electronicDecimal: 6 },
  { maxIV: 0.90, electronic05: 30, electronicDecimal: 6 }, { maxIV: 0.93, electronic05: 30, electronicDecimal: 7 },
  { maxIV: 0.96, electronic05: 30, electronicDecimal: 7 }
];

// Table B13: Commercial Purge Flow Rate by Largest Pipe Diameter - IGE/UP/1
const COMMERCIAL_PURGE_FLOW_TABLE_B13 = {
  20: 0.7,   // 20mm → 0.7 m³/hr
  25: 1.0,   // 25mm → 1.0 m³/hr  
  32: 1.7,   // 32mm → 1.7 m³/hr
  40: 2.5,   // 40mm → 2.5 m³/hr
  50: 4.5,   // 50mm → 4.5 m³/hr
  80: 11,    // 80mm → 11 m³/hr
  100: 20,   // 100mm → 20 m³/hr
  125: 30,   // 125mm → 30 m³/hr
  150: 38    // 150mm → 38 m³/hr
};

// Unified certificate data builder for all calculators
function _buildCertificateData(
  calculatorType: 'commercial' | 'industrial',
  installationType: string,
  jobDetails: any,
  pipeConfigs: any[],
  meterConfig: any,
  testMedium: string,
  completedTests: any,
  currentTest: any = null,
  currentActualPressureDrop: string = "",
  zoneType?: string,
  gaugeType?: string,
  maxOperatingPressure?: string,
  roomVolume?: string,
  letByPressureReading?: string,
  actualGasContent?: string,
  results?: any
) {
  // Calculate individual pipe volumes
  const enrichedPipeConfigs = pipeConfigs.map(pipe => {
    if (!pipe.nominalSize || !pipe.length) return pipe;
    
    const material = pipe.material || "steel";
    const volumes = calculatorType === 'commercial' 
      ? COMMERCIAL_PIPE_VOLUMES[material as keyof typeof COMMERCIAL_PIPE_VOLUMES]
      : null; // Industrial pipe volumes would be imported if needed
    
    let calculatedVolume = '0.000';
    if (volumes) {
      const sizeKey = pipe.nominalSize;
      const sizeKeyMm = pipe.nominalSize.endsWith('mm') ? pipe.nominalSize : pipe.nominalSize + 'mm';
      const sizeKeyNum = pipe.nominalSize.replace('mm', '');
      
      const lookup1 = (volumes as any)[sizeKey];
      const lookup2 = (volumes as any)[sizeKeyMm];
      const lookup3 = (volumes as any)[sizeKeyNum];
      const volumeData = lookup1 || lookup2 || lookup3;
      
      if (volumeData) {
        calculatedVolume = (volumeData.volume * parseFloat(pipe.length)).toFixed(3);
      }
    }
    
    return {
      ...pipe,
      calculatedVolume
    };
  });

  // Helper functions for test results
  const getTestResult = (actualDrop: string, maxDrop: number) => {
    if (!actualDrop) return 'PENDING';
    const drop = parseFloat(actualDrop);
    return drop <= maxDrop ? 'PASS' : 'FAIL';
  };

  const getLetByTestResult = (pressureRise: string) => {
    if (!pressureRise) return 'PENDING';
    const rise = parseFloat(pressureRise);
    return rise <= 0 ? 'PASS' : 'FAIL';
  };

  // Extract completed test data
  const strengthTest = completedTests["Strength Test"];
  const tightnessTest = completedTests["Tightness Test"];
  const letByTest = completedTests["Let-by Test"];
  const purgeTest = completedTests["Purge"];

  // Calculate MOP and test pressures
  const mop = maxOperatingPressure ? parseFloat(maxOperatingPressure) : 21;
  
  // Base certificate data
  const baseData: any = {
    // Job Details
    jobNumber: jobDetails.jobNumber,
    customerName: jobDetails.customerName,
    location: jobDetails.location,
    engineerName: jobDetails.engineerName,
    gasSafeNumber: jobDetails.gasSafeNumber,
    
    // System Configuration
    installationType: installationType,
    testMedium: testMedium,
    pipeConfigs: enrichedPipeConfigs,
    meterType: meterConfig.type,
    meterQuantity: meterConfig.quantity,
    totalSystemVolume: results?.calculation?.totalSystemVolume,
    maximumOperatingPressure: maxOperatingPressure,
    
    // Zone/Gauge info for Industrial
    ...(calculatorType === 'industrial' && {
      zoneType: zoneType,
      gaugeType: gaugeType,
      roomVolume: roomVolume
    })
  };

  // Strength Test fields (using completedTests or current test)
  const strengthData = strengthTest || (currentTest?.operationType === "Strength Test" ? currentTest : {});
  const strengthTestPressure = strengthData.results?.calculation?.testPressure || results?.calculation?.testPressure;
  const strengthMaxAllowed = strengthTestPressure ? (strengthTestPressure * 0.2).toFixed(1) : undefined;
  
  baseData.strengthTestPressure = strengthTestPressure;
  baseData.strengthActualPressureDrop = strengthTest?.actualReadings?.actualPressureDrop || 
    (currentTest?.operationType === "Strength Test" ? currentActualPressureDrop : undefined);
  baseData.strengthMaxAllowed = strengthMaxAllowed;
  baseData.strengthTestResult = strengthTest?.testResult || 
    (currentTest?.operationType === "Strength Test" && currentActualPressureDrop ? 
      getTestResult(currentActualPressureDrop, parseFloat(strengthMaxAllowed || '0')) : undefined);

  // Tightness Test fields (using completedTests or current test)
  const tightnessData = tightnessTest || (currentTest?.operationType === "Tightness Test" ? currentTest : {});
  
  baseData.tightnessTestPressure = tightnessData.results?.calculation?.testPressure || results?.calculation?.testPressure;
  baseData.stabilizationTime = tightnessData.results?.calculation?.stabilizationTime || results?.calculation?.stabilizationTime;
  baseData.tightnessStabilization = baseData.stabilizationTime; // Alias for Industrial templates
  baseData.testDuration = tightnessData.results?.calculation?.testDuration || results?.calculation?.testDuration;
  baseData.tightnessActualPressureDrop = tightnessTest?.actualReadings?.actualPressureDrop || 
    (currentTest?.operationType === "Tightness Test" ? currentActualPressureDrop : undefined);
  baseData.tightnessMaxPressureDrop = tightnessData.results?.calculation?.maxPressureDrop || results?.calculation?.maxPressureDrop;
  baseData.tightnessMaxAllowed = baseData.tightnessMaxPressureDrop; // Alias for templates
  baseData.tightnessTestResult = tightnessTest?.testResult || 
    (currentTest?.operationType === "Tightness Test" && currentActualPressureDrop && baseData.tightnessMaxPressureDrop ? 
      getTestResult(currentActualPressureDrop, parseFloat(baseData.tightnessMaxPressureDrop)) : undefined);

  // Let-by Test fields (only for existing installations)
  if (installationType === "existing") {
    const letByTestPressure = mop * 0.5; // 50% of MOP
    baseData.letByTestPressure = letByTestPressure.toFixed(1);
    baseData.letByActualPressureDrop = letByTest?.actualReadings?.letByPressureReading || letByPressureReading; // Template expects letByActualPressureDrop
    baseData.letByTestResult = letByTest?.testResult || 
      (letByPressureReading ? getLetByTestResult(letByPressureReading) : undefined);
  }

  // Purge Test fields
  baseData.purgeVolume = purgeTest?.results?.calculation?.requiredPurgeVolume || results?.calculation?.requiredPurgeVolume;
  baseData.minimumFlowRate = purgeTest?.results?.calculation?.minimumFlowRate || results?.calculation?.minimumFlowRate;
  baseData.maxPurgeTime = purgeTest?.results?.calculation?.maximumPurgeTime || results?.calculation?.maximumPurgeTime;
  baseData.actualGasContent = purgeTest?.actualReadings?.actualGasContent || actualGasContent;
  baseData.purgeTestResult = purgeTest?.testResult;

  return baseData;
}

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

// Filter pipe sizes based on subscription tier
function getAvailablePipeSizes(subscriptionTier: string, pipeVolumes: any) {
  const tierLimits = {
    'free': 25,        // 1" = 25mm
    'basic': 80,       // 3" = 80mm  
    'premium': 150,    // 6" = 150mm
    'professional': 999 // No limit
  };
  
  const maxSize = tierLimits[subscriptionTier as keyof typeof tierLimits] || 25;
  
  return Object.entries(pipeVolumes).filter(([size]) => {
    const sizeNum = parseInt(size);
    return sizeNum <= maxSize;
  });
}

export default function CommercialCalculator() {
  const [currentStep, setCurrentStep] = useState<FlowStep>("job-details");
  
  // Get subscription status for pipe filtering
  const { data: subscriptionStatus } = useQuery({
    queryKey: ["/api/subscription-status"],
  });
  const currentTier = (subscriptionStatus as any)?.tier || 'free';
  
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
  const [installationAge, _setInstallationAge] = useState<string>("new");
  const [roomVolume, setRoomVolume] = useState<string>("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [showVolumeExceededDialog, setShowVolumeExceededDialog] = useState(false);
  
  // Proactive volume validation - triggers immediately when volume exceeds 1m³
  useEffect(() => {
    const currentVolume = calculateInstallationVolume();
    console.log('🔍 PROACTIVE: Volume check =', currentVolume, '> 1.0?', currentVolume > 1.0);
    
    if (currentVolume > 1.0 && !showVolumeExceededDialog) {
      console.log('🚨 PROACTIVE: Volume exceeds 1m³! Showing dialog immediately...');
      setShowVolumeExceededDialog(true);
    } else if (currentVolume <= 1.0 && showVolumeExceededDialog) {
      console.log('✅ PROACTIVE: Volume back under 1m³, hiding dialog');
      setShowVolumeExceededDialog(false);
    }
  }, [pipeConfigs, meterConfig, roomVolume, showVolumeExceededDialog]);
  
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

  // Save current test to completed tests
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

  // Convert time string like "06:26" to seconds
  const parseTimeToSeconds = (timeString: string): number => {
    if (!timeString) return 0;
    const parts = timeString.split(':');
    if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return (minutes * 60) + seconds;
  };

  // Calculate installation volume from pipe configurations - USING COMMERCIAL PIPE VOLUMES
  const calculateInstallationVolume = () => {
    const total = pipeConfigs.reduce((totalVolume, pipe) => {
      if (!pipe.nominalSize || !pipe.length) return totalVolume;
      
      const material = pipe.material || "steel";
      const volumes = COMMERCIAL_PIPE_VOLUMES[material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
      
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
    
    // Add meter volume if meter is configured
    let meterVolume = 0;
    if (meterConfig.type && meterConfig.type !== "none") {
      const meterVolumeData = COMMERCIAL_METER_VOLUMES[meterConfig.type as keyof typeof COMMERCIAL_METER_VOLUMES];
      if (meterVolumeData) {
        const quantity = parseInt(meterConfig.quantity) || 1;
        meterVolume = meterVolumeData.volume * quantity;
      }
    }
    
    return total + meterVolume;
  };

  // Get detailed installation volume breakdown for manual verification
  const getInstallationVolumeBreakdown = () => {
    const pipeBreakdown = pipeConfigs.map((pipe, index) => {
      if (!pipe.nominalSize || !pipe.length) return null;
      
      const material = pipe.material || "steel";
      const volumes = COMMERCIAL_PIPE_VOLUMES[material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
      
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
        const volumePerMeter = volumeData.volume;
        const length = parseFloat(pipe.length) || 0;
        const pipeVolume = volumePerMeter * length;
        return {
          id: index + 1,
          nominalSize: pipe.nominalSize,
          length: length,
          material: material,
          volumePerMeter: volumePerMeter,
          totalVolume: pipeVolume
        };
      }
      
      return null;
    }).filter(Boolean);

    // Calculate meter volume breakdown
    let meterBreakdown = null;
    if (meterConfig.type && meterConfig.type !== "none") {
      const meterVolumeData = COMMERCIAL_METER_VOLUMES[meterConfig.type as keyof typeof COMMERCIAL_METER_VOLUMES];
      if (meterVolumeData) {
        const quantity = parseInt(meterConfig.quantity) || 1;
        meterBreakdown = {
          type: meterConfig.type,
          quantity: quantity,
          volumePerMeter: meterVolumeData.volume,
          totalVolume: meterVolumeData.volume * quantity
        };
      }
    }

    const totalPipeVolume = pipeBreakdown.reduce((sum, pipe) => sum + (pipe?.totalVolume || 0), 0);
    const totalMeterVolume = meterBreakdown?.totalVolume || 0;
    const totalInstallationVolume = totalPipeVolume + totalMeterVolume;

    return {
      pipes: pipeBreakdown,
      meter: meterBreakdown,
      totals: {
        totalPipeVolume,
        totalMeterVolume,
        totalInstallationVolume
      }
    };
  };

  // Calculate let-by test duration - same as TTD for Commercial
  const calculateLetByTiming = () => {
    // For commercial, let-by test duration should be the same as TTD
    if (results?.calculation?.testDurationSeconds) {
      return results.calculation.testDurationSeconds; // Use existing calculation if available
    }
    
    // Calculate TTD early for both new and existing installations to show let-by test immediately
    if (operationType === "Tightness Test") {
      const installationVolume = calculateInstallationVolume();
      if (installationVolume <= 0 || isNaN(installationVolume)) return null; // Need valid pipe config first
      
      // TTD calculation matching backend logic
      const _grm = (gaugeType === "electronic05" || gaugeType === "water" || gaugeType === "Water Gauge") ? 0.5 : 0.1;
      const _f1 = testMedium === "Air" ? 67 : 42;
      
      // Commercial TTD calculation using new Tables 6 & 7
      let ttdSeconds = 120; // Default 2 minutes minimum
      
      if (installationType === "new" && testMedium === "Air") {
        // Table 6 - New installations
        for (const row of TIGHTNESS_DURATION_NEW) {
          if (installationVolume <= row.maxIV) {
            ttdSeconds = (gaugeType === "electronic05" ? row.electronic05 : row.electronicDecimal) * 60;
            break;
          }
        }
        if (installationVolume > 0.96) {
          ttdSeconds = (gaugeType === "electronic05" ? 30 : 7) * 60;
        }
      } else if (installationType === "existing") {
        // Table 7 - Existing installations  
        for (const row of TIGHTNESS_DURATION_EXISTING) {
          if (installationVolume <= row.maxIV) {
            ttdSeconds = (testMedium === "Air" ? row.air : row.gas) * 60;
            break;
          }
        }
      }
      
      // Apply minimum 2-minute test time (120 seconds) and ensure valid number
      const finalTime = Math.max(ttdSeconds, 120);
      return isNaN(finalTime) ? null : finalTime;
    }
    
    return null;
  };

  const letByTiming = useMemo(() => {
    return calculateLetByTiming();
  }, [results?.calculation?.testDurationSeconds, pipeConfigs, meterConfig, gaugeType, installationType, testMedium]);

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

    // Commercial tests require room volume for pressure drop calculations
    if ((operationType === "Strength Test" || operationType === "Tightness Test") && !roomVolume) {
      toast({
        title: "Room Volume Required",
        description: "Commercial tests require room volume to determine maximum allowable pressure drop from IGE/UP/1 tables",
        variant: "destructive",
      });
      return;
    }

    setIsCalculating(true);
    
    try {
      const _calculationData = {
        calculatorType: "commercial", // Use commercial calculator type
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
          installationAge: installationAge,
          roomVolume: roomVolume ? parseFloat(roomVolume) : undefined
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

      // COMMERCIAL CALCULATIONS using your provided tables (no backend call)
      const installationVolume = calculateInstallationVolume();
      console.log('🔍 DEBUG: installationVolume =', installationVolume, 'operationType =', operationType, 'roomVolume =', roomVolume);
      
      // Note: Volume validation is now handled proactively by useEffect
      
      const mop = maxOperatingPressure ? parseFloat(maxOperatingPressure) : 21;
      
      // Commercial test pressure calculation
      let testPressure;
      if (operationType === "Strength Test") {
        // Strength Test: greater of 82.5 mbar or 2.5×MOP
        testPressure = Math.max(82.5, mop * 2.5);
      } else {
        // Tightness Test: MOP (minimum 20 mbar)
        testPressure = Math.max(mop, 20);
      }
      
      // Commercial test durations
      let testDurationMinutes = 2;
      let stabilizationTimeMinutes = 5; // Default for commercial
      const roomVol = parseFloat(roomVolume) || 30; // Declare roomVol here
      
      if (operationType === "Strength Test") {
        // Commercial Strength Test: Fixed 5 min stabilization, 5 min duration
        stabilizationTimeMinutes = 5;
        testDurationMinutes = 5;
      } else if (operationType === "Tightness Test") {
        if (installationType === "new") {
          // Table 6 - New installations
          for (const row of TIGHTNESS_DURATION_NEW) {
            if (installationVolume <= row.maxIV) {
              testDurationMinutes = gaugeType === "electronic05" ? row.electronic05 : row.electronicDecimal;
              break;
            }
          }
          if (installationVolume > 0.96) {
            testDurationMinutes = gaugeType === "electronic05" ? 30 : 7;
          }
        } else {
          // Table 7 - Existing installations  
          for (const row of TIGHTNESS_DURATION_EXISTING) {
            if (installationVolume <= row.maxIV) {
              testDurationMinutes = testMedium === "Air" ? row.air : row.gas;
              break;
            }
          }
        }
        // Commercial Tightness Test: 6 minutes stabilization or test duration, whichever is longer
        stabilizationTimeMinutes = Math.max(6, testDurationMinutes);
      }
      
      // Commercial purge calculations
      let requiredPurgeVolume = 0;
      let minimumFlowRate = 0;
      let maximumPurgeTime = "";
      
      if (operationType === "Purge") {
        // Calculate purge volume: PV = (IV + purge) × 1.5
        let purgeVolume = 0;
        
        // Add purge hose volume if configured
        if (purgeHoseSize && purgeHoseLength) {
          const diameter = parseInt(purgeHoseSize) / 1000; // Convert mm to m
          const length = parseFloat(purgeHoseLength);
          purgeVolume += Math.PI * Math.pow(diameter / 2, 2) * length;
        }
        
        // Add purge stack volume if configured  
        if (purgeStackSize && purgeStackLength) {
          const diameter = parseInt(purgeStackSize) / 1000; // Convert mm to m
          const length = parseFloat(purgeStackLength);
          purgeVolume += Math.PI * Math.pow(diameter / 2, 2) * length;
        }
        
        // Calculate required purge volume: PV = (IV + purge volume) × 1.5
        requiredPurgeVolume = (installationVolume + purgeVolume) * 1.5;
        
        // Find minimum flow rate from Table B13 based on largest pipe diameter
        let largestDiameter = 0;
        
        // Check main pipe diameters
        pipeConfigs.forEach(pipe => {
          if (pipe.nominalSize && pipe.length) {
            const diameter = parseInt(pipe.nominalSize.replace('mm', '')) || 0;
            largestDiameter = Math.max(largestDiameter, diameter);
          }
        });
        
        // Check purge hose diameter
        if (purgeHoseSize) {
          const diameter = parseInt(purgeHoseSize) || 0;
          largestDiameter = Math.max(largestDiameter, diameter);
        }
        
        // Check purge stack diameter  
        if (purgeStackSize) {
          const diameter = parseInt(purgeStackSize) || 0;
          largestDiameter = Math.max(largestDiameter, diameter);
        }
        
        // Lookup flow rate from Table B13
        minimumFlowRate = COMMERCIAL_PURGE_FLOW_TABLE_B13[largestDiameter as keyof typeof COMMERCIAL_PURGE_FLOW_TABLE_B13] || 0.7; // Default to 20mm if not found
        
        // Calculate maximum purge time: PV ÷ 3600 ÷ Flow Rate (in hours)
        const purgeTimeHours = requiredPurgeVolume / minimumFlowRate;
        const purgeTimeMinutes = purgeTimeHours * 60;
        maximumPurgeTime = `${Math.floor(purgeTimeMinutes)}:${String(Math.round((purgeTimeMinutes % 1) * 60)).padStart(2, '0')}`;
      }
      
      // Calculate largest diameter for all operations (needed for purge results display)
      let largestDiameter = 0;
      
      // Check main pipe diameters
      pipeConfigs.forEach(pipe => {
        if (pipe.nominalSize && pipe.length) {
          const diameter = parseInt(pipe.nominalSize.replace('mm', '')) || 0;
          largestDiameter = Math.max(largestDiameter, diameter);
        }
      });
      
      // Check purge hose diameter
      if (purgeHoseSize) {
        const diameter = parseInt(purgeHoseSize) || 0;
        largestDiameter = Math.max(largestDiameter, diameter);
      }
      
      // Check purge stack diameter  
      if (purgeStackSize) {
        const diameter = parseInt(purgeStackSize) || 0;
        largestDiameter = Math.max(largestDiameter, diameter);
      }
      
      // Commercial max pressure drop using your TIGHTNESS_DROP_TABLE
      let maxPressureDrop = 0;
      if (operationType === "Tightness Test" && roomVolume) {
        const TIGHTNESS_DROP_TABLE: { [key: string]: number[] } = {
          "0.15": [0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.6, 1.7, 1.7, 1.8, 1.8, 1.9, 2, 2.1, 2.4, 2.8, 3.1, 3.5, 3.9, 4.2],
          "0.20": [0.7, 0.8, 0.9, 0.9, 0.9, 1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.6, 1.7, 1.7, 1.7, 1.8, 1.8, 1.9, 2.1, 2.3, 2.8, 3, 3.4, 3.8, 4.1],
          "0.25": [0.7, 0.7, 0.8, 0.9, 0.9, 0.9, 1, 1.1, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 1.7, 1.7, 1.7, 1.8, 1.8, 2, 2.2, 2.7, 2.9, 3.3, 3.7, 4.0],
          "0.30": [0.7, 0.7, 0.8, 0.9, 0.9, 0.9, 1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.5, 1.6, 1.6, 1.7, 1.7, 1.8, 1.8, 2, 2.1, 2.7, 2.9, 3.2, 3.6, 3.9],
          "0.35": [0.7, 0.7, 0.8, 0.9, 0.9, 0.9, 1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.5, 1.6, 1.6, 1.6, 1.7, 1.7, 1.8, 1.9, 2.1, 2.6, 2.8, 3.2, 3.6, 3.9],
          "0.40": [0.6, 0.7, 0.8, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.3, 1.3, 1.5, 1.5, 1.5, 1.6, 1.6, 1.7, 1.7, 1.8, 1.9, 2, 2.6, 2.8, 3.1, 3.5, 3.8],
          "0.45": [0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.3, 1.3, 1.3, 1.4, 1.5, 1.5, 1.6, 1.7, 1.7, 1.8, 1.9, 2, 2.5, 2.7, 3.1, 3.4, 3.7],
          "0.50": [0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.5, 1.5, 1.5, 1.6, 1.7, 1.7, 1.9, 2, 2.5, 2.7, 3, 3.4, 3.7],
          "0.55": [0.6, 0.6, 0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.5, 1.5, 1.5, 1.6, 1.6, 1.7, 1.8, 2, 2.4, 2.6, 3, 3.3, 3.6],
          "0.60": [0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7, 1.8, 1.9, 2.4, 2.6, 3, 3.3, 3.6],
          "0.65": [0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.4, 1.5, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 2.5, 2.9, 3.2, 3.5],
          "0.70": [0.5, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.2, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7, 1.9, 2.3, 2.5, 2.9, 3.2, 3.5],
          "0.75": [0.5, 0.6, 0.6, 0.7, 0.8, 0.8, 0.9, 0.9, 1, 1.1, 1.1, 1.1, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.7, 1.9, 2.2, 2.4, 2.9, 3.1, 3.4],
          "0.80": [0.5, 0.5, 0.6, 0.7, 0.8, 0.8, 0.9, 0.9, 1, 1.1, 1.1, 1.1, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.7, 1.9, 2.2, 2.4, 2.8, 3.1, 3.3],
          "0.85": [0.5, 0.5, 0.6, 0.6, 0.7, 0.8, 0.8, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.5, 1.6, 1.8, 2.1, 2.3, 2.8, 3, 3.2],
          "0.90": [0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.9, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.5, 1.5, 1.6, 1.8, 2.1, 2.3, 2.6, 3, 3.1],
          "0.95": [0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.9, 0.9, 1, 1, 1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.6, 2.9, 3.1],
          "1.00": [0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.7, 2, 2.2, 2.5, 2.8, 3.0]
        };
        
        const ROOM_VOLUMES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 40, 45, 50, 55, 60];
        
        // Find IV range
        let ivKey = "0.15";
        const IV_RANGES = [
          { max: 0.15, key: "0.15" }, { max: 0.20, key: "0.20" }, { max: 0.25, key: "0.25" }, { max: 0.30, key: "0.30" },
          { max: 0.35, key: "0.35" }, { max: 0.40, key: "0.40" }, { max: 0.45, key: "0.45" }, { max: 0.50, key: "0.50" },
          { max: 0.55, key: "0.55" }, { max: 0.60, key: "0.60" }, { max: 0.65, key: "0.65" }, { max: 0.70, key: "0.70" },
          { max: 0.75, key: "0.75" }, { max: 0.80, key: "0.80" }, { max: 0.85, key: "0.85" }, { max: 0.90, key: "0.90" },
          { max: 0.95, key: "0.95" }, { max: 1.00, key: "1.00" }
        ];
        
        for (const range of IV_RANGES) {
          if (installationVolume <= range.max) {
            ivKey = range.key;
            break;
          }
        }
        
        // Volume validation now handled earlier for all test types

        // Find room volume column (roomVol already declared above)
        let columnIndex = 0;
        if (roomVol < 10) {
          columnIndex = 0;
        } else if (roomVol > 60) {
          columnIndex = ROOM_VOLUMES.length - 1;
        } else {
          for (let i = 0; i < ROOM_VOLUMES.length; i++) {
            if (roomVol <= ROOM_VOLUMES[i]) {
              columnIndex = i;
              break;
            }
          }
        }
        
        maxPressureDrop = TIGHTNESS_DROP_TABLE[ivKey][columnIndex];
      }

      // Create commercial calculation result locally
      const data = {
        project: {
          id: "commercial-" + Date.now(),
          reference: jobDetails.jobNumber,
          engineerName: jobDetails.engineerName,
          installationType,
          operationType,
          gasType: "Natural Gas",
          testMedium,
          gaugeType,
          maxOperatingPressure: mop,
          testPressure,
          stabilizationTime: stabilizationTimeMinutes,
          maxPressureDropPercent: operationType === "Strength Test" ? 20 : null,
          roomVolume: roomVol,
        },
        calculation: {
          totalSystemVolume: installationVolume.toFixed(4),
          testPressure: testPressure.toFixed(1),
          testDuration: `${Math.floor(testDurationMinutes)}:${String(Math.round((testDurationMinutes % 1) * 60)).padStart(2, '0')}`,
          stabilizationTime: stabilizationTimeMinutes,
          maxPressureDrop: maxPressureDrop.toFixed(1),
          // Commercial purge calculations
          requiredPurgeVolume: requiredPurgeVolume.toFixed(4),
          minimumFlowRate: minimumFlowRate.toString(),
          maximumPurgeTime: maximumPurgeTime,
          largestPipeDiameter: largestDiameter,
        }
      };

      setResults(data);
      setCurrentStep("results");
      
      toast({
        title: "Calculation Complete", 
        description: `${operationType} parameters calculated successfully`,
      });
    } catch (error) {
      console.error('Calculation error:', error);
      toast({
        title: "Calculation Error",
        description: error instanceof Error ? error.message : "Failed to calculate test parameters. Please check your inputs and try again.",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

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

  const renderJobDetails = () => (
    <div className="max-w-4xl mx-auto" data-auto-scroll="true">
      <Card>
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
                placeholder="e.g., COM-2024-001"
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
        <h1 className="text-2xl font-bold mb-2">Commercial Gas Installation</h1>
        <p className="text-muted-foreground">Select your installation type and room classification</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Installation Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <button
              className="h-32 flex flex-col items-center justify-center gap-4 bg-white rounded-lg shadow-lg hover:shadow-xl hover:bg-orange-50 transition-all duration-200 transform hover:-translate-y-1"
              onClick={() => {
                setInstallationType("new");
              }}
            >
              <Wrench className="w-12 h-12 text-orange-600" />
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

      {/* Room Volume Input - Required for ALL commercial tests - Show immediately after installation type */}
      {installationType && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-red-600" />
              Room Volume Required *
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-red-600">Required:</span> Commercial tests require room volume for IGE/UP/1 pressure drop calculations
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="room-volume" className="text-red-700">Room Volume (m³) *</Label>
              <Input
                id="room-volume"
                type="number"
                step="0.1"
                min="1"
                max="60"
                placeholder="Enter room volume (1-60 m³) - REQUIRED"
                value={roomVolume}
                onChange={(e) => setRoomVolume(e.target.value)}
                data-testid="input-room-volume"
                className={`w-full ${!roomVolume ? 'border-red-300 focus:border-red-500' : ''}`}
                required
              />
              {!roomVolume && (
                <p className="text-sm text-red-600 font-medium">
                  ⚠️ Room volume is required for all commercial tightness and strength tests
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Used to determine maximum allowable pressure drop from IGE/UP/1 drop table
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderTestSelection = () => (
    <div className="max-w-4xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5" />
            Test Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-4 ${installationType === "new" ? "grid-cols-3" : "grid-cols-2"}`}>
            {/* Strength Test - Only for new installations */}
            {installationType === "new" && (
              <button
                className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-orange-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
                onClick={() => setOperationType("Strength Test")}
              >
                <Gauge className="w-8 h-8 text-orange-600" />
                <div className="font-semibold text-sm">Strength Test</div>
              </button>
            )}

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-blue-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => setOperationType("Tightness Test")}
            >
              <TestTube className="w-8 h-8 text-blue-600" />
              <div className="font-semibold text-sm">Tightness Test</div>
            </button>

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-purple-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => setOperationType("Purge")}
            >
              <Wind className="w-8 h-8 text-purple-600" />
              <div className="font-semibold text-sm">Purge</div>
            </button>
          </div>
        </CardContent>
      </Card>
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
                      {getAvailablePipeSizes(currentTier, COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES || "steel"] || COMMERCIAL_PIPE_VOLUMES.steel).map(([size, info]) => (
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

  const renderMeterConfiguration = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            Meter Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meter Type</Label>
              <Select
                value={meterConfig.type}
                onValueChange={(value) => setMeterConfig({...meterConfig, type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select meter type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMERCIAL_METER_VOLUMES).map(([key, meter]) => (
                    <SelectItem key={key} value={key}>
                      {meter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {meterConfig.type !== "none" && (
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={meterConfig.quantity}
                  onChange={(e) => setMeterConfig({...meterConfig, quantity: e.target.value})}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

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
          {/* Gauge Type Selection - Required for all Commercial tests */}
          {(operationType === "Strength Test" || operationType === "Tightness Test") && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <h4 className="font-semibold text-orange-800 mb-3">Test Equipment Configuration</h4>
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
                  <p className="text-xs text-orange-700">
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
                  <p className="text-xs text-orange-700">
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
            <SubscriptionGate operationType="Purge">
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
            </SubscriptionGate>
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
              <TestTube className="w-5 h-5 text-orange-600" />
              {operationType} Results
            </span>
            {results?.calculation && (
              <Badge className="bg-orange-600">
                Calculated
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pipework Synopsis - Always show for manual verification */}
          {results?.calculation && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-blue-800">Pipework Synopsis</h3>
              </div>
              
              {(() => {
                const breakdown = getInstallationVolumeBreakdown();
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pipe Configurations */}
                    <Card className="bg-blue-50 border-blue-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-blue-700">Pipe Configurations</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {breakdown.pipes.length > 0 ? breakdown.pipes.map((pipe: any) => (
                          <div key={pipe.id} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">
                              {pipe.nominalSize} × {pipe.length}m ({pipe.material})
                            </span>
                            <span className="font-mono text-blue-800">
                              {pipe.volumePerMeter.toFixed(6)} × {pipe.length} = {pipe.totalVolume.toFixed(6)} m³
                            </span>
                          </div>
                        )) : (
                          <div className="text-sm text-gray-500">No pipes configured</div>
                        )}
                        <div className="border-t pt-2 mt-2">
                          <div className="flex justify-between font-semibold text-blue-800">
                            <span>Total Pipe Volume:</span>
                            <span className="font-mono">{breakdown.totals.totalPipeVolume.toFixed(6)} m³</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Meter Configuration */}
                    <Card className="bg-green-50 border-green-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-green-700">Meter Configuration</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {breakdown.meter ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">
                                {breakdown.meter.type} × {breakdown.meter.quantity}
                              </span>
                              <span className="font-mono text-green-800">
                                {breakdown.meter.volumePerMeter.toFixed(6)} × {breakdown.meter.quantity} = {breakdown.meter.totalVolume.toFixed(6)} m³
                              </span>
                            </div>
                            <div className="border-t pt-2 mt-2">
                              <div className="flex justify-between font-semibold text-green-800">
                                <span>Total Meter Volume:</span>
                                <span className="font-mono">{breakdown.totals.totalMeterVolume.toFixed(6)} m³</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">No meter configured</div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Total Installation Volume */}
                    <Card className="lg:col-span-2 bg-orange-50 border-orange-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-orange-700">Total Installation Volume</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold text-gray-700">
                            Pipes + Meters = Total IV
                          </span>
                          <span className="text-2xl font-bold text-orange-800 font-mono">
                            {breakdown.totals.totalPipeVolume.toFixed(6)} + {breakdown.totals.totalMeterVolume.toFixed(6)} = {breakdown.totals.totalInstallationVolume.toFixed(6)} m³
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </div>
          )}

          {results?.calculation && operationType !== "Purge" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-orange-700">Test Pressure</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-orange-800">{results.calculation.testPressure} mbar</p>
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
                    <p className="text-xs text-muted-foreground">From Commercial Purge Table</p>
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
                <h3 className="text-lg font-semibold">Required Equipment (Commercial Purge Table)</h3>
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
                      
                      {/* Print Certificate Button for Purge Test */}
                      <SubscriptionGate requiresExport={true}>
                        <Button 
                          onClick={async () => {
                          // Save all current data before generating PDF
                          saveAllTestData();
                          
                          // Collect all test data for the certificate
                          const testData = {
                            // Job Details
                            jobNumber: jobDetails.jobNumber,
                            customerName: jobDetails.customerName,
                            location: jobDetails.location,
                            engineerName: jobDetails.engineerName,
                            gasSafeNumber: jobDetails.gasSafeNumber,
                            // System Configuration
                            installationType: installationType,
                            testMedium: testMedium,
                            pipeConfigs: pipeConfigs.map(pipe => {
                              if (!pipe.nominalSize || !pipe.length) return pipe;
                              
                              // Calculate volume for this pipe
                              const material = pipe.material || "steel";
                              const volumes = COMMERCIAL_PIPE_VOLUMES[material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
                              
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
                            // Purge Test Results
                            purgeVolume: results?.calculation?.requiredPurgeVolume,
                            minimumFlowRate: results?.calculation?.minimumFlowRate,
                            maxPurgeTime: results?.calculation?.maximumPurgeTime,
                            actualGasContent: actualGasContent,
                            actualFlowRate: actualFlowRate,
                            purgeTestResult: getPurgeResult(),
                            purgeDirection: purgeDirection,
                            // Include any completed test data from previous tests
                            ...Object.keys(completedTests).reduce((acc: any, testType) => {
                              const test = completedTests[testType];
                              if (testType === "Strength Test") {
                                acc.strengthTestPressure = test.results?.calculation?.testPressure;
                                acc.strengthTestResult = test.testResult;
                                acc.strengthActualPressureDrop = test.actualReadings?.actualPressureDrop;
                              } else if (testType === "Tightness Test") {
                                acc.tightnessTestPressure = test.results?.calculation?.testPressure;
                                acc.tightnessTestResult = test.testResult;
                                acc.stabilizationTime = test.results?.calculation?.stabilizationTime;
                                acc.testDuration = test.results?.calculation?.testDuration;
                                acc.tightnessMaxPressureDrop = test.results?.calculation?.maxPressureDrop;
                                acc.tightnessActualPressureDrop = test.actualReadings?.actualPressureDrop;
                              } else if (testType === "Let-by Test") {
                                acc.letByTestPressure = test.results?.calculation?.testPressure;
                                acc.letByActualPressureDrop = test.actualReadings?.actualPressureDrop;
                                acc.letByTestResult = test.testResult;
                              }
                              return acc;
                            }, {}),
                            // Let-by Test Results (only for existing installations) - use state variables like regular PDF path
                            letByTestPressure: installationType === "existing" && completedTests["Tightness Test"]?.results?.calculation?.testPressure ? 
                                             (completedTests["Tightness Test"].results.calculation.testPressure * 0.5) : undefined,
                            letByActualPressureDrop: installationType === "existing" ? letByPressureReading : undefined,
                            letByMaxAllowed: installationType === "existing" ? 0 : undefined,
                            letByTestResult: installationType === "existing" ? getLetByTestResult() : undefined
                          };
                          
                          try {
                            // Send POST request with test data
                            const response = await fetch('/api/pdf/generate-commercial', {
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
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform text-white mt-3"
                      >
                          <FileText className="w-4 h-4" />
                          Print Test Certificate
                        </Button>
                      </SubscriptionGate>
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
                <h4 className="font-semibold text-orange-800 mb-2">Test Timing</h4>
                {operationType === "Strength Test" ? (
                  <div className="text-sm text-orange-700 space-y-1">
                    <p>• Stabilization: {results.calculation?.stabilizationTime || 5} minutes</p>
                    <p>• Test Duration: {Math.round((results.calculation?.testDurationSeconds || 300) / 60)} minutes</p>
                    <p className="font-semibold">• Total: {((results.calculation?.stabilizationTime || 5) + Math.round((results.calculation?.testDurationSeconds || 300) / 60))} minutes</p>
                  </div>
                ) : (
                  <div className="text-sm text-orange-700 space-y-1">
                    {(() => {
                      // Parse TTD from "20:00" format
                      const testDurationStr = results.calculation?.testDuration || "2:00";
                      const [minutes] = testDurationStr.split(':').map(Number);
                      const ttdMinutes = minutes || 2;
                      
                      // Commercial stabilization logic
                      const stabilizationMinutes = Math.max(6, ttdMinutes);
                      const totalMinutes = stabilizationMinutes + ttdMinutes;
                      
                      return (
                        <>
                          <p>• Stabilization: {stabilizationMinutes} minutes (6 min or TTD, whichever is longer)</p>
                          <p>• Test Duration: {ttdMinutes} minutes (TTD)</p>
                          <p className="font-semibold">• Total: {totalMinutes} minutes</p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <Stopwatch 
                presetTime={
                  operationType === "Strength Test" 
                    ? ((results.calculation?.stabilizationTime || 5) * 60) + (results.calculation?.testDurationSeconds || 300)
                    : (() => {
                        // Parse TTD from "20:00" format and calculate commercial stabilization
                        const testDurationStr = results.calculation?.testDuration || "2:00";
                        const [minutes] = testDurationStr.split(':').map(Number);
                        const ttdMinutes = minutes || 2;
                        
                        // Commercial stabilization logic  
                        const stabilizationMinutes = Math.max(6, ttdMinutes);
                        const totalMinutes = stabilizationMinutes + ttdMinutes;
                        
                        return totalMinutes * 60; // Convert to seconds
                      })()
                }
                className="bg-orange-50"
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
                    
                    {/* Print Certificate Button */}
                    <SubscriptionGate requiresExport={true}>
                      <Button 
                        onClick={async () => {
                          // Save all current data before generating PDF
                        saveAllTestData();
                        
                        // Collect all test data for the certificate - REVERTED TO WORKING APPROACH
                        const testData = {
                          // Job Details
                          jobNumber: jobDetails.jobNumber,
                          customerName: jobDetails.customerName,
                          location: jobDetails.location,
                          engineerName: jobDetails.engineerName,
                          gasSafeNumber: jobDetails.gasSafeNumber,
                          // System Configuration
                          installationType: installationType,
                          testMedium: testMedium,
                          pipeConfigs: pipeConfigs.map(pipe => {
                            if (!pipe.nominalSize || !pipe.length) return pipe;
                            
                            // Calculate volume for this pipe
                            const material = pipe.material || "steel";
                            const volumes = COMMERCIAL_PIPE_VOLUMES[material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
                            
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
                          // Test Results - Prioritize completed tests, fall back to current test
                          strengthTestPressure: completedTests["Strength Test"]?.results?.calculation?.testPressure || 
                                              (operationType === "Strength Test" ? results?.calculation?.testPressure : undefined),
                          tightnessTestPressure: completedTests["Tightness Test"]?.results?.calculation?.testPressure || 
                                               (operationType === "Tightness Test" ? results?.calculation?.testPressure : undefined),
                          stabilizationTime: completedTests["Tightness Test"]?.results?.calculation?.stabilizationTime || 
                                           (operationType === "Tightness Test" ? results?.calculation?.stabilizationTime : undefined),
                          testDuration: completedTests["Tightness Test"]?.results?.calculation?.testDuration || 
                                      (operationType === "Tightness Test" ? results?.calculation?.testDuration : undefined),
                          strengthActualPressureDrop: completedTests["Strength Test"]?.actualReadings?.actualPressureDrop,
                          tightnessActualPressureDrop: completedTests["Tightness Test"]?.actualReadings?.actualPressureDrop || 
                                                     (operationType === "Tightness Test" ? actualPressureDrop : undefined),
                          tightnessMaxPressureDrop: completedTests["Tightness Test"]?.results?.calculation?.maxPressureDrop || 
                                                   (operationType === "Tightness Test" ? results?.calculation?.maxPressureDrop : undefined),
                          strengthTestResult: completedTests["Strength Test"]?.testResult || 
                                            (operationType === "Strength Test" ? getTestResult() : undefined),
                          tightnessTestResult: completedTests["Tightness Test"]?.testResult || 
                                             (operationType === "Tightness Test" ? getTestResult() : undefined),
                          // Purge Test Results (if completed)
                          purgeVolume: completedTests["Purge"]?.results?.calculation?.requiredPurgeVolume || 
                                     results?.calculation?.requiredPurgeVolume,
                          minimumFlowRate: completedTests["Purge"]?.results?.calculation?.minimumFlowRate || 
                                         results?.calculation?.minimumFlowRate,
                          maxPurgeTime: completedTests["Purge"]?.results?.calculation?.maximumPurgeTime || 
                                      results?.calculation?.maximumPurgeTime,
                          actualGasContent: completedTests["Purge"]?.actualReadings?.actualGasContent || actualGasContent,
                          purgeTestResult: completedTests["Purge"]?.testResult || 
                                         (actualGasContent ? getPurgeResult() : undefined),
                          // Let-by Test Results (only for existing installations)
                          letByTestPressure: installationType === "existing" && results?.calculation?.testPressure ? 
                                           (results.calculation.testPressure * 0.5) : undefined,
                          letByActualPressureDrop: installationType === "existing" ? letByPressureReading : undefined,
                          letByMaxAllowed: installationType === "existing" ? 0 : undefined,
                          letByTestResult: installationType === "existing" ? getLetByTestResult() : undefined
                        };
                        
                        try {
                          // Send POST request with test data
                          const response = await fetch('/api/pdf/generate-commercial', {
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
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform text-white mt-3"
                    >
                        <FileText className="w-4 h-4" />
                        Print Test Certificate
                      </Button>
                    </SubscriptionGate>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* Next Test Button - Only show when current test is completed and passed */}
          {getNextTest() && 
           ((operationType === "Strength Test" && actualPressureDrop && getTestResult() === 'PASS') ||
            (operationType === "Tightness Test" && (installationType === "new" || letByTestCompleted) && actualPressureDrop && getTestResult() === 'PASS')) && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
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
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <UserHeader />
      
      <div className="container mx-auto px-4 py-6" id="main-content">
        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Selection</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Building className="w-6 h-6 text-orange-800" aria-label="Commercial Calculator Icon" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-orange-800">Commercial Calculator</h1>
                <p className="text-sm text-muted-foreground">Up to 6" Pipe • IGE/UP/1 Standard</p>
              </div>
            </div>
          </div>
          
          {/* Clear Button */}
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
          
          {/* Results Section - Show when we have calculation results */}
          {results && renderResults()}
        </div>
      </div>

      {/* Volume Exceeded Dialog */}
      <AlertDialog open={showVolumeExceededDialog} onOpenChange={setShowVolumeExceededDialog}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md" data-testid="dialog-volume-exceeded">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600 text-lg">
              <Building className="w-5 h-5" />
              ⚠️ Volume Exceeds Commercial Threshold
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base leading-relaxed">
              Installation volume ({calculateInstallationVolume().toFixed(3)}m³) exceeds the 1.0m³ limit for IGE/UP/1A commercial installations.
              <br /><br />
              <strong>For installations over 1m³, you must use the Industrial Calculator</strong> which follows IGE/UP/1 standards for larger gas installations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-3 sm:flex-row sm:gap-2">
            <AlertDialogAction asChild className="w-full sm:w-auto order-1">
              <Link 
                href="/industrial" 
                className="bg-red-600 hover:bg-red-700 text-center py-3 sm:py-2" 
                data-testid="link-industrial-calculator"
              >
                Use Industrial Calculator
              </Link>
            </AlertDialogAction>
            <AlertDialogCancel 
              onClick={() => {
                // Clear pipe inputs to reduce volume
                setPipeConfigs([{ id: "1", nominalSize: "", length: "" }]);
                setMeterConfig({ type: "none", quantity: "1" });
                setRoomVolume("");
                setShowVolumeExceededDialog(false);
              }}
              className="w-full sm:w-auto order-2 py-3 sm:py-2"
              data-testid="button-clear-pipes"
            >
              Clear Pipe Inputs
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
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
  );
}