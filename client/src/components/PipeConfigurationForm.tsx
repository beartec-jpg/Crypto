import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ruler, Plus, Trash2 } from "lucide-react";
import { STEEL_PIPE_SIZES, COPPER_PIPE_SIZES } from "@/lib/pipeData";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PipeConfig {
  nominalSize: string;
  length: number;
  material?: 'steel' | 'copper';
}

interface PipeConfigurationFormProps {
  configs: PipeConfig[];
  onChange: (configs: PipeConfig[]) => void;
}

export function PipeConfigurationForm({ configs, onChange }: PipeConfigurationFormProps) {
  // Material selection state (shared for all pipes)
  const pipeMaterial = configs[0]?.material || 'steel';
  
  const setPipeMaterial = (material: 'steel' | 'copper') => {
    // Update all pipe configs with new material
    const newConfigs = configs.map(c => ({ ...c, material, nominalSize: "" }));
    onChange(newConfigs);
  };
  
  const addPipeSize = () => {
    onChange([...configs, { nominalSize: "", length: 0, material: pipeMaterial }]);
  };

  const removePipeSize = (index: number) => {
    onChange(configs.filter((_, i) => i !== index));
  };

  const updateConfig = (index: number, field: keyof PipeConfig, value: string | number) => {
    const newConfigs = [...configs];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    onChange(newConfigs);
  };

  const getPipeSizes = () => {
    return pipeMaterial === 'copper' ? COPPER_PIPE_SIZES : STEEL_PIPE_SIZES;
  };
  
  const getInternalDiameter = (nominalSize: string): string => {
    const pipeList = getPipeSizes();
    const pipe = pipeList.find((p: any) => p.nominalSize === nominalSize);
    return pipe ? pipe.internalDiameter.toFixed(1) : "--";
  };

  const calculateVolume = (config: PipeConfig): string => {
    if (!config.nominalSize || config.length <= 0) return "0.00";
    
    const pipeList = getPipeSizes();
    const pipe = pipeList.find((p: any) => p.nominalSize === config.nominalSize);
    if (!pipe || !pipe.volumePer1m) return "0.00";

    // Use regulation table volume per 1m with 10% for fittings
    const pipeVolumeM3 = pipe.volumePer1m * config.length;
    const totalVolumeWithFittings = pipeVolumeM3 * 1.1; // Add 10% for fittings

    return totalVolumeWithFittings.toFixed(4);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center">
            <Ruler className="text-primary mr-2 w-5 h-5" />
            Pipe Configuration
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={addPipeSize}
            data-testid="button-add-pipe-size"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Pipe Size
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Material Selection */}
        <div className="mb-4">
          <Label className="text-base font-medium mb-2 block">Pipe Material</Label>
          <RadioGroup value={pipeMaterial} onValueChange={(value) => setPipeMaterial(value as 'steel' | 'copper')}>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="steel" id="steel" />
                <Label htmlFor="steel" className="cursor-pointer">Steel / Stainless Steel</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="copper" id="copper" />
                <Label htmlFor="copper" className="cursor-pointer">Copper</Label>
              </div>
            </div>
          </RadioGroup>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800 font-medium">ℹ️ Fittings included automatically</p>
          <p className="text-xs text-blue-600">10% allowance added to pipework volume for fittings (new regulations)</p>
        </div>
        <div className="space-y-4">
          {configs.map((config, index) => (
            <div key={index} className="grid grid-cols-8 gap-4 items-end p-4 bg-muted rounded-lg">
              <div className="col-span-5">
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Nominal Size
                </Label>
                <Select 
                  value={config.nominalSize} 
                  onValueChange={(value) => updateConfig(index, "nominalSize", value)}
                >
                  <SelectTrigger data-testid={`select-pipe-size-${index}`}>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="select">Select size</SelectItem>
                    {getPipeSizes().map((pipe: any) => (
                      <SelectItem key={pipe.nominalSize} value={pipe.nominalSize}>
                        {pipe.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-2">
                <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Length (m)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={config.length || ""}
                  onChange={(e) => updateConfig(index, "length", parseFloat(e.target.value) || 0)}
                  data-testid={`input-pipe-length-${index}`}
                  className="text-lg py-3 w-full"
                />
              </div>
              
              <div className="col-span-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePipeSize(index)}
                  className="w-full p-2 text-destructive hover:bg-destructive/10"
                  disabled={configs.length === 1}
                  data-testid={`button-remove-pipe-${index}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-sm text-muted-foreground">
            ℹ️ Internal diameters are based on standard BS EN 10255 medium series steel tubes. 10% allowance automatically added for fittings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
