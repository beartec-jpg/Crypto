import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Gauge } from "lucide-react";
import { METER_TYPES } from "@/lib/meterData";

interface MeterConfig {
  meterType: string;
  quantity: number;
}

interface MeterConfigurationFormProps {
  configs: MeterConfig[];
  onChange: (configs: MeterConfig[]) => void;
}

export function MeterConfigurationForm({ configs, onChange }: MeterConfigurationFormProps) {
  const addMeter = () => {
    onChange([...configs, { meterType: "", quantity: 1 }]);
  };

  const removeMeter = (index: number) => {
    onChange(configs.filter((_, i) => i !== index));
  };

  const updateConfig = (index: number, field: keyof MeterConfig, value: string | number) => {
    const newConfigs = [...configs];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    onChange(newConfigs);
  };

  const getMeterSpecs = (meterType: string): { internalVolume: string; cyclicVolume: string } => {
    const meter = METER_TYPES.find(m => m.type === meterType);
    if (!meter) return { internalVolume: "--", cyclicVolume: "--" };
    return {
      internalVolume: meter.internalVolume.toFixed(4),
      cyclicVolume: meter.cyclicVolume.toFixed(4)
    };
  };

  const calculateTotalVolumes = (config: MeterConfig): { totalInternal: string; totalCyclic: string } => {
    if (!config.meterType || config.quantity <= 0) {
      return { totalInternal: "0.0000", totalCyclic: "0.0000" };
    }
    
    const meter = METER_TYPES.find(m => m.type === config.meterType);
    if (!meter) return { totalInternal: "0.0000", totalCyclic: "0.0000" };

    return {
      totalInternal: (meter.internalVolume * config.quantity).toFixed(4),
      totalCyclic: (meter.cyclicVolume * config.quantity).toFixed(4)
    };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center">
            <Gauge className="text-primary mr-2 w-5 h-5" />
            Meter Configuration
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={addMeter}
            data-testid="button-add-meter"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Meter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium">ℹ️ Meter volumes calculated separately</p>
          <p className="text-xs text-amber-600">Internal volume added to system volume, cyclic volume used for purge calculations</p>
        </div>
        
        {configs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Gauge className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No meters configured</p>
            <p className="text-xs">Click "Add Meter" to add gas meters to your system</p>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config, index) => (
              <div key={index} className="grid grid-cols-12 gap-3 p-4 bg-muted/50 rounded-lg border">
                <div className="col-span-4">
                  <Label className="text-xs font-medium">Meter Type</Label>
                  <Select 
                    value={config.meterType} 
                    onValueChange={(value) => updateConfig(index, "meterType", value)}
                  >
                    <SelectTrigger className="h-9" data-testid={`select-meter-type-${index}`}>
                      <SelectValue placeholder="Select meter type" />
                    </SelectTrigger>
                    <SelectContent>
                      {METER_TYPES.map((meter) => (
                        <SelectItem key={meter.type} value={meter.type}>
                          {meter.display}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-2">
                  <Label className="text-xs font-medium">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={config.quantity}
                    onChange={(e) => updateConfig(index, "quantity", parseInt(e.target.value) || 1)}
                    className="h-9"
                    data-testid={`input-quantity-${index}`}
                  />
                </div>
                
                <div className="col-span-2">
                  <Label className="text-xs font-medium">Internal Vol (m³)</Label>
                  <div className="h-9 flex items-center px-3 bg-background border rounded-md text-sm text-muted-foreground">
                    {getMeterSpecs(config.meterType).internalVolume}
                  </div>
                </div>
                
                <div className="col-span-2">
                  <Label className="text-xs font-medium">Cyclic Vol (m³)</Label>
                  <div className="h-9 flex items-center px-3 bg-background border rounded-md text-sm text-muted-foreground">
                    {getMeterSpecs(config.meterType).cyclicVolume}
                  </div>
                </div>
                
                <div className="col-span-1">
                  <Label className="text-xs font-medium">Total Int.</Label>
                  <div className="h-9 flex items-center px-2 bg-green-50 border border-green-200 rounded-md text-xs font-mono text-green-700">
                    {calculateTotalVolumes(config).totalInternal}
                  </div>
                </div>
                
                <div className="col-span-1 flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeMeter(index)}
                    className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                    data-testid={`button-remove-meter-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {configs.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-800 mb-1">Total Internal Volume:</p>
                <p className="text-lg font-mono text-blue-700">
                  {configs.reduce((sum, config) => {
                    const meter = METER_TYPES.find(m => m.type === config.meterType);
                    return sum + (meter ? meter.internalVolume * config.quantity : 0);
                  }, 0).toFixed(4)} m³
                </p>
                <p className="text-xs text-blue-600">Added to system volume for testing</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="font-medium text-green-800 mb-1">Total Cyclic Volume:</p>
                <p className="text-lg font-mono text-green-700">
                  {configs.reduce((sum, config) => {
                    const meter = METER_TYPES.find(m => m.type === config.meterType);
                    return sum + (meter ? meter.cyclicVolume * config.quantity : 0);
                  }, 0).toFixed(4)} m³
                </p>
                <p className="text-xs text-green-600">Used for purge volume calculation (5x factor)</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}