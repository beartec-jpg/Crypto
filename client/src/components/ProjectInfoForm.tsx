import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList } from "lucide-react";

interface ProjectData {
  reference: string;
  engineerName: string;
  installationType: string;
  maxOperatingPressure: string;
  maxIncidentalPressure?: string;
  operationType: string;
  zoneType: string;
  roomVolume?: string;
}

interface ProjectInfoFormProps {
  data: ProjectData;
  onChange: (data: ProjectData) => void;
}

export function ProjectInfoForm({ data, onChange }: ProjectInfoFormProps) {
  const handleChange = (field: keyof ProjectData, value: string) => {
    let updatedData = { ...data, [field]: value };
    
    // Reset incompatible combinations
    if (field === "operationType" && value === "Strength Test" && data.installationType === "Existing") {
      updatedData.installationType = "";
    }
    if (field === "installationType" && value === "Existing" && data.operationType === "Strength Test") {
      updatedData.operationType = "";
    }
    
    onChange(updatedData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <ClipboardList className="text-primary mr-2 w-5 h-5" />
          Project Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="project-reference">Project Reference</Label>
            <Input
              id="project-reference"
              placeholder="e.g., COM-2024-001"
              value={data.reference}
              onChange={(e) => handleChange("reference", e.target.value)}
              data-testid="input-project-reference"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="engineer-name">Engineer Name</Label>
            <Input
              id="engineer-name"
              placeholder="Gas Safe Registered Engineer"
              value={data.engineerName}
              onChange={(e) => handleChange("engineerName", e.target.value)}
              data-testid="input-engineer-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="installation-type">Installation Type</Label>
            <Select 
              value={data.installationType} 
              onValueChange={(value) => handleChange("installationType", value)}
            >
              <SelectTrigger id="installation-type" data-testid="select-installation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="New Installation">New Installation</SelectItem>
                <SelectItem value="Existing" disabled={data.operationType === "Strength Test"}>Existing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-operating-pressure">Maximum Operating Pressure (mbar)</Label>
            <Input
              id="max-operating-pressure"
              type="number"
              step="1"
              max="16000"
              placeholder="e.g., 75"
              value={data.maxOperatingPressure}
              onChange={(e) => handleChange("maxOperatingPressure", e.target.value)}
              data-testid="input-max-operating-pressure"
            />
          </div>
          
          {/* Maximum Incidental Pressure for Strength Testing */}
          {data.operationType === "Strength Test" && (
            <div className="space-y-2">
              <Label htmlFor="max-incidental-pressure">Maximum Incidental Pressure (mbar)</Label>
              <Input
                id="max-incidental-pressure"
                type="number"
                step="1"
                min="0"
                placeholder="e.g., 100"
                value={data.maxIncidentalPressure || ""}
                onChange={(e) => handleChange("maxIncidentalPressure", e.target.value)}
                data-testid="input-max-incidental-pressure"
              />
              <p className="text-xs text-muted-foreground">
                Required for strength test pressure calculation
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="operation-type">Operation Type</Label>
            <Select 
              value={data.operationType} 
              onValueChange={(value) => handleChange("operationType", value)}
            >
              <SelectTrigger id="operation-type" data-testid="select-operation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Purge">Purging Operations</SelectItem>
                <SelectItem value="Tightness Test">Tightness Testing</SelectItem>
                <SelectItem value="Strength Test" disabled={data.installationType === "Existing"}>Strength Testing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Room Classification - only show for tightness testing */}
          {data.operationType === "Tightness Test" && (
            <div className="space-y-2">
              <Label htmlFor="zone-type">Room Classification</Label>
              <Select 
                value={data.zoneType} 
                onValueChange={(value) => handleChange("zoneType", value)}
              >
                <SelectTrigger id="zone-type" data-testid="select-zone-type">
                  <SelectValue placeholder="Select room class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Type A">Type A (Inadequately ventilated)</SelectItem>
                  <SelectItem value="Type B">Type B (Ventilated internal &lt;60 m³)</SelectItem>
                  <SelectItem value="Type C">Type C (Ventilated &gt;60 m³ or external/underground)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Room Volume for Type B - only show for tightness testing */}
          {data.operationType === "Tightness Test" && data.zoneType === "Type B" && (
            <div className="space-y-2">
              <Label htmlFor="room-volume">Room Volume (m³)</Label>
              <Input
                id="room-volume"
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g., 45.5"
                value={data.roomVolume || ""}
                onChange={(e) => handleChange("roomVolume", e.target.value)}
                data-testid="input-room-volume"
              />
              <p className="text-xs text-muted-foreground">
                Required for Type B (ventilated internal &lt;60 m³) calculations
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
