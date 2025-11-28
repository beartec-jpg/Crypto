import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Shield, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";
import { ProjectInfoForm } from "@/components/ProjectInfoForm";
import { PipeConfigurationForm } from "@/components/PipeConfigurationForm";
import { MeterConfigurationForm } from "@/components/MeterConfigurationForm";
import { PurgeParametersForm } from "@/components/PurgeParametersForm";
import { ResultsPanel } from "@/components/ResultsPanel";
import { UserHeader } from "@/components/UserHeader";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { CalculationRequest, CalculationResult } from "@shared/schema";

interface PipeInput {
  nominalSize: string;
  length: number;
}

interface MeterInput {
  meterType: string;
  quantity: number;
}

export default function Home() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Auto-refresh subscription status after successful payment
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upgraded') === 'true' && isAuthenticated) {
      console.log('🔄 Auto-refreshing subscription status after successful payment');
      
      // Call refresh subscription API
      apiRequest("POST", "/api/refresh-subscription")
        .then((response) => response.json())
        .then((data) => {
          toast({
            title: "Subscription Updated!",
            description: `Your subscription has been activated successfully.`,
          });
          
          // Invalidate subscription status to refresh the UI immediately
          queryClient.invalidateQueries({ queryKey: ["/api/subscription-status"] });
          
          // Clean up URL parameter
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        })
        .catch((error) => {
          console.error('Auto-refresh failed:', error);
          // Don't show error toast - user may not notice and it would work on next page load
        });
    }
  }, [isAuthenticated, toast]);
  const [projectData, setProjectData] = useState({
    reference: "",
    engineerName: "",
    installationType: "New Installation",
    maxOperatingPressure: "",
    maxIncidentalPressure: "",
    operationType: "Purge",
    zoneType: "",
    roomVolume: "",
    gasType: "Natural Gas",
    purgeMethod: "Direct Purge (Air to Gas)",
    safetyFactor: "1.5",
    gaugeType: "",
    testMedium: "",
  });
  
  const [pipeConfigs, setPipeConfigs] = useState<PipeInput[]>([
    { nominalSize: "", length: 0 }
  ]);
  
  const [meterConfigs, setMeterConfigs] = useState<MeterInput[]>([]);
  
  const [results, setResults] = useState<CalculationResult | null>(null);

  const calculateMutation = useMutation({
    mutationFn: async (request: CalculationRequest) => {
      const response = await apiRequest("POST", "/api/calculate", request);
      return response.json();
    },
    onSuccess: (data: CalculationResult) => {
      setResults(data);
      toast({
        title: "Calculation Complete",
        description: "Purge requirements calculated successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      // Check if it's a subscription restriction error
      if (error.message.includes('upgradeRequired') || error.message.includes('subscription')) {
        toast({
          title: "Subscription Required",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCalculate = () => {
    // Validate inputs
    if (!projectData.reference || !projectData.engineerName || !projectData.installationType) {
      toast({
        title: "Missing Required Information",
        description: "Please fill in project reference, engineer name, and installation type before calculating",
        variant: "destructive",
      });
      return;
    }

    const validPipes = pipeConfigs.filter(pipe => 
      pipe.nominalSize && pipe.length > 0
    );

    if (validPipes.length === 0) {
      toast({
        title: "No Pipe Configuration",
        description: "Please add at least one pipe configuration",
        variant: "destructive",
      });
      return;
    }

    const validMeters = meterConfigs.filter(meter => 
      meter.meterType && meter.quantity > 0
    );

    // Convert string fields to numbers for the request
    const projectRequest = {
      ...projectData,
      maxOperatingPressure: projectData.maxOperatingPressure ? Number(projectData.maxOperatingPressure) : undefined,
      maxIncidentalPressure: projectData.maxIncidentalPressure ? Number(projectData.maxIncidentalPressure) : undefined,
      safetyFactor: projectData.safetyFactor ? Number(projectData.safetyFactor) : undefined,
      roomVolume: projectData.roomVolume ? Number(projectData.roomVolume) : undefined,
    };

    const request: CalculationRequest = {
      project: projectRequest,
      pipeConfigurations: validPipes,
      meterConfigurations: validMeters.length > 0 ? validMeters : undefined,
      calculatorType: "commercial"
    };

    calculateMutation.mutate(request);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-20 w-full flex items-center justify-center">
            <img 
              src={beartecLogo} 
              alt="Beartec Engineering Limited - Professional Gas Testing Services" 
              className="h-full max-w-full object-contain"
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 lg:py-4" id="main-content">
        {/* Only show login buttons if not authenticated */}
        {!isAuthenticated && (
          <div className="text-center mb-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Button 
                size="lg" 
                onClick={() => window.location.href = "/api/auth/google"}
                className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => window.location.href = "/api/login"}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                Continue with Replit
              </Button>
            </div>
          </div>
        )}
        
        <UserHeader />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
          {/* Input Section */}
          <div className="lg:col-span-2 space-y-4">
            <ProjectInfoForm 
              data={{
                reference: projectData.reference,
                engineerName: projectData.engineerName,
                installationType: projectData.installationType,
                maxOperatingPressure: projectData.maxOperatingPressure,
                maxIncidentalPressure: projectData.maxIncidentalPressure,
                operationType: projectData.operationType,
                zoneType: projectData.zoneType,
                roomVolume: projectData.roomVolume,
              }}
              onChange={(data) => setProjectData(prev => ({ ...prev, ...data }))}
            />
            
            <PipeConfigurationForm
              configs={pipeConfigs}
              onChange={setPipeConfigs}
            />
            
            <MeterConfigurationForm
              configs={meterConfigs}
              onChange={setMeterConfigs}
            />
            
            <PurgeParametersForm
              data={projectData}
              onChange={setProjectData}
            />

            {/* Calculate Button */}
            <div className="flex justify-center">
              <Button 
                onClick={handleCalculate}
                disabled={calculateMutation.isPending}
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-10 py-4 text-lg shadow-lg rounded-lg border border-green-500 disabled:bg-green-400 disabled:cursor-not-allowed"
                data-testid="calculate-button"
              >
                <Calculator className="w-5 h-5 mr-3" />
                {calculateMutation.isPending ? "Calculating..." : 
                  projectData.operationType === "Purge" ? "Get Test Results" : 
                  `Get Test Results`}
              </Button>
            </div>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-1 space-y-4">
            <ResultsPanel results={results} />
          </div>
        </div>

      </div>

      {/* Safety Notice */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <Card className="bg-warning/10 border-warning/20 p-4">
          <div className="flex items-start space-x-3">
            <div className="text-warning text-xl mt-0.5">⚠️</div>
            <div>
              <h3 className="font-semibold text-warning mb-1">Safety Notice</h3>
              <p className="text-sm text-foreground">
                This calculator is for use by competent Gas Safe registered engineers only. All purging operations must comply with IGE/UP/1 Edition 2 +A: 2005 standards and require proper risk assessment under DSEAR regulations.
              </p>
            </div>
          </div>
        </Card>
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
