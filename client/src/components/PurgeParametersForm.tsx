import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wind } from "lucide-react";

interface PurgeData {
  gasType: string;
  purgeMethod: string;
  safetyFactor: string;
  operationType: string;
  gaugeType?: string;
  testMedium?: string;
}

interface PurgeParametersFormProps {
  data: PurgeData;
  onChange: (data: any) => void;
}

export function PurgeParametersForm({ data, onChange }: PurgeParametersFormProps) {
  const handleChange = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isPurgeMode = data.operationType === "Purge";
  const isTestMode = data.operationType === "Tightness Test" || data.operationType === "Strength Test";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Wind className="text-primary mr-2 w-5 h-5" />
          {isPurgeMode ? "Purge Parameters" : "Test Parameters"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gas-type">Gas Type</Label>
            <Select 
              value={data.gasType} 
              onValueChange={(value) => handleChange("gasType", value)}
            >
              <SelectTrigger id="gas-type" data-testid="select-gas-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Natural Gas">Natural Gas</SelectItem>
                <SelectItem value="Propane">Propane</SelectItem>
                <SelectItem value="Butane">Butane</SelectItem>
                <SelectItem value="LPG/Air (SNG)">LPG/Air (SNG)</SelectItem>
                <SelectItem value="LPG/Air (SMG)">LPG/Air (SMG)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {isPurgeMode && (
            <div className="space-y-2">
              <Label htmlFor="purge-method">Purge Method</Label>
              <Select 
                value={data.purgeMethod} 
                onValueChange={(value) => handleChange("purgeMethod", value)}
              >
                <SelectTrigger id="purge-method" data-testid="select-purge-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct Purge (Air to Gas)">Direct Purge (Air to Gas)</SelectItem>
                  <SelectItem value="Direct Purge (Gas to Air)">Direct Purge (Gas to Air)</SelectItem>
                  <SelectItem value="Indirect Purge (Inert Gas)">Indirect Purge (Inert Gas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {isPurgeMode && (
            <div className="space-y-2">
              <Label htmlFor="safety-factor">Safety Factor</Label>
              <Select 
                value={data.safetyFactor} 
                onValueChange={(value) => handleChange("safetyFactor", value)}
              >
                <SelectTrigger id="safety-factor" data-testid="select-safety-factor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.5">1.5 (Standard)</SelectItem>
                  <SelectItem value="2.0">2.0 (High Risk)</SelectItem>
                  <SelectItem value="3.0">3.0 (Critical Applications)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          
          {isTestMode && (
            <div className="space-y-2">
              <Label htmlFor="gauge-type">Gauge Type</Label>
              <Select 
                value={data.gaugeType || ""} 
                onValueChange={(value) => handleChange("gaugeType", value)}
              >
                <SelectTrigger id="gauge-type" data-testid="select-gauge-type">
                  <SelectValue placeholder="Select gauge type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Water Gauge">Water Gauge (0.5 readable movement)</SelectItem>
                  <SelectItem value="Electronic Gauge">Electronic Gauge (0.1 readable movement)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {isTestMode && (
            <div className="space-y-2">
              <Label htmlFor="test-medium">Test Medium</Label>
              <Select 
                value={data.testMedium || ""} 
                onValueChange={(value) => handleChange("testMedium", value)}
              >
                <SelectTrigger id="test-medium" data-testid="select-test-medium">
                  <SelectValue placeholder="Select test medium" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Air">Air (constant = 67)</SelectItem>
                  <SelectItem value="Gas">Gas (constant = 42)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {isTestMode && (
            <div className="col-span-full">
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Test Requirements</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Test pressure calculated automatically based on MOP and operation type</p>
                  <p>• Test duration determined by gauge type, test medium and system volume</p>
                  <p>• Pressure drop limits per IGE/UP/1 standards</p>
                  <p>• All tests must be performed by Gas Safe registered engineers</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
