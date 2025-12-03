import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Wrench, TestTube, Gauge, Wind, Settings, Play, FileDown, ClipboardList, Shield, CheckCircle, AlertTriangle, ExternalLink, ArrowRight, FileText } from "lucide-react";
import { UserHeader as _UserHeader } from "@/components/UserHeader";
import { Stopwatch } from "@/components/Stopwatch";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Removed direct PDF import - using backend API like industrial calculator

// Import all the calculation constants from the original file
const PIPE_VOLUMES = {
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

const COMMERCIAL_PIPE_VOLUMES = PIPE_VOLUMES;

const METER_VOLUMES = {
  "none": { internal: 0, label: "No Meter" },
  "G4/U6": { internal: 0.008, label: "G4/U6" },
  "U16": { internal: 0.025, label: "U16" },
  "U25": { internal: 0.037, label: "U25" },
  "U40": { internal: 0.067, label: "U40" },
  "U65": { internal: 0.100, label: "U65" },
  "U100": { internal: 0.182, label: "U100" },
  "U160": { internal: 0.304, label: "U160" },
  "Domestic": { internal: 0.0024, label: "Domestic" },
};

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

// Table B13: Commercial Purge Data
const COMMERCIAL_PURGE_DATA = {
  "20": { flowRate: 0.7, purgePoint: 20, hoseVentStack: 20, flameArrestor: 20 },
  "25": { flowRate: 1.0, purgePoint: 20, hoseVentStack: 20, flameArrestor: 20 },
  "32": { flowRate: 1.7, purgePoint: 20, hoseVentStack: 20, flameArrestor: 20 },
  "40": { flowRate: 2.5, purgePoint: 20, hoseVentStack: 20, flameArrestor: 20 },
  "50": { flowRate: 4.5, purgePoint: 25, hoseVentStack: 40, flameArrestor: 50 },
  "80": { flowRate: 11, purgePoint: 25, hoseVentStack: 40, flameArrestor: 50 },
  "100": { flowRate: 20, purgePoint: 25, hoseVentStack: 40, flameArrestor: 50 },
  "125": { flowRate: 30, purgePoint: 40, hoseVentStack: 50, flameArrestor: 50 },
  "150": { flowRate: 38, purgePoint: 40, hoseVentStack: 50, flameArrestor: 50 }
};

// Table B14: Commercial Meter Cyclic Volumes
const COMMERCIAL_METER_VOLUMES = {
  "G4/U6": 0.002,
  "U16": 0.006,
  "U25": 0.01,
  "U40": 0.02,
  "U65": 0.025,
  "U100": 0.057,
  "U160": 0.071,
  "RD or TURBINE": 0,
  "DOMESTIC ULTRASONIC": 0
};

const IV_RANGES = [
  { max: 0.15, key: "0.15" }, { max: 0.20, key: "0.20" }, { max: 0.25, key: "0.25" }, { max: 0.30, key: "0.30" },
  { max: 0.35, key: "0.35" }, { max: 0.40, key: "0.40" }, { max: 0.45, key: "0.45" }, { max: 0.50, key: "0.50" },
  { max: 0.55, key: "0.55" }, { max: 0.60, key: "0.60" }, { max: 0.65, key: "0.65" }, { max: 0.70, key: "0.70" },
  { max: 0.75, key: "0.75" }, { max: 0.80, key: "0.80" }, { max: 0.85, key: "0.85" }, { max: 0.90, key: "0.90" },
  { max: 0.95, key: "0.95" }, { max: 1.00, key: "1.00" }
];

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

type FlowStep = 
  | "job-details"
  | "installation-type"
  | "test-selection"
  | "strength-setup"
  | "strength-config"
  | "strength-timer" 
  | "strength-reading"
  | "strength-result"
  | "tightness-setup"
  | "tightness-config"
  | "let-by-timer"
  | "let-by-reading"
  | "tightness-timer"
  | "tightness-reading"
  | "tightness-result"
  | "purge-selection"
  | "purge-setup";

interface TestResult {
  testType: string;
  result: 'PASS' | 'FAIL';
  details: any;
}

export default function CommercialCalculatorFlow() {
  const { toast } = useToast();

  // Clear all form data
  // Render just the pipe configuration section
  const _renderPipeConfigSection = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Installation Volume</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Pipe Sections</Label>
            {pipes.map((pipe, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-gray-100 border border-gray-200 rounded-lg shadow-sm">
                  <div className="space-y-2">
                    <Label>Material</Label>
                    <Select 
                      value={pipe.material} 
                      onValueChange={(value) => updatePipeSection(index, 'material', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Material" />
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
                      value={pipe.size} 
                      onValueChange={(value) => updatePipeSection(index, 'size', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Size" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipe.material && Object.entries(PIPE_VOLUMES[pipe.material as keyof typeof PIPE_VOLUMES]).map(([key, data]) => (
                          <SelectItem key={key} value={key}>
                            {data.label}
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
                      onChange={(e) => updatePipeSection(index, 'length', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removePipeSection(index)}
                      disabled={pipes.length === 1}
                    >
                      Remove
                    </Button>
                  </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addPipeSection}
              className="w-full"
            >
              Add Pipe Section
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Meter Type</Label>
            <Select value={meterType} onValueChange={setMeterType}>
              <SelectTrigger>
                <SelectValue placeholder="Select meter type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METER_VOLUMES).map(([key, meter]) => (
                  <SelectItem key={key} value={key}>
                    {meter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select meter type or "No Meter" if no meter is installed
            </p>
          </div>

          {/* Room Volume Input - Added early for table lookups */}
          <div className="space-y-2">
            <Label>Room Volume (m³) *</Label>
            <Input
              type="number"
              placeholder="Enter room volume"
              value={roomVolume}
              onChange={(e) => setRoomVolume(e.target.value)}
              data-testid="input-room-volume"
            />
            <p className="text-xs text-muted-foreground">
              Volume of the smallest occupied space - required for tightness test calculations
            </p>
          </div>

          {/* 1m³ Volume Limit Warning - Check FIRST before showing breakdown */}
          {renderIVLimitCheck()}

          {/* Installation Volume Breakdown - Only show if under limit */}
          {ivBreakdown && ivBreakdown.totalIV <= 1.0 && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">Installation Volume Breakdown</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">Pipe IV:</span>
                  <span className="font-mono">{ivBreakdown.pipeIV.toFixed(6)} m³</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Meter IV:</span>
                  <span className="font-mono">{ivBreakdown.meterIV.toFixed(6)} m³</span>
                </div>
                <div className="border-t border-blue-300 pt-2">
                  <div className="flex justify-between font-semibold">
                    <span className="text-blue-800">Total IV:</span>
                    <span className="font-mono text-blue-800">{ivBreakdown.totalIV.toFixed(6)} m³</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Continue button - Only show if under limit */}
          {ivBreakdown && ivBreakdown.totalIV <= 1.0 && (
            <div className="text-center">
              <Button 
                onClick={() => {
                  if (currentStep === "strength-setup") setCurrentStep("strength-config");
                  if (currentStep === "tightness-setup") setCurrentStep("tightness-config");
                }}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Continue to Test Configuration
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );


  // Render test equipment configuration step
  const _renderTestEquipmentConfig = () => {
    // Block access if over 1m³ limit
    if (ivBreakdown && ivBreakdown.totalIV > 1.0) {
      return renderIVLimitCheck();
    }
    
    return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Test Equipment Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gauge Type *</Label>
              <Select value={gaugeType} onValueChange={setGaugeType}>
                <SelectTrigger data-testid="select-gauge-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electronic01">Electronic (0.1 mbar GRM)</SelectItem>
                  <SelectItem value="electronic05">Electronic (0.5 mbar GRM)</SelectItem>
                  <SelectItem value="water">Water Gauge</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                GRM affects TTD calculations: 0.1 mbar for precision gauges, 0.5 mbar for standard electronic/water gauges
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Test Medium *</Label>
              <Select value={testMedium} onValueChange={setTestMedium}>
                <SelectTrigger data-testid="select-test-medium">
                  <SelectValue placeholder="Select test medium" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Air">Air</SelectItem>
                  <SelectItem value="Gas">Natural Gas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Affects TTD calculations (F1: Air=67, Gas=42)
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Maximum Operating Pressure (MOP) - mbar *</Label>
            <Input
              type="number"
              placeholder="Enter MOP (typically 21 mbar)"
              value={operatingPressure}
              onChange={(e) => setOperatingPressure(e.target.value)}
              data-testid="input-operating-pressure"
            />
            <p className="text-xs text-muted-foreground">
              Maximum operating pressure of the system (used for test pressure calculations)
            </p>
          </div>

          {operatingPressure && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-blue-800">Strength Test Pressure (STP):</span>
                  <span className="font-bold text-blue-900">
                    {Math.max(82.5, parseFloat(operatingPressure) * 2.5).toFixed(1)} mbar
                  </span>
                </div>
                <p className="text-xs text-blue-600">
                  STP = max(82.5 mbar, 2.5 × MOP) = max(82.5, {(parseFloat(operatingPressure) * 2.5).toFixed(1)}) mbar
                </p>
              </div>
            </div>
          )}

          {/* Continue to test timer */}
          {operatingPressure && gaugeType && testMedium && (
            <div className="text-center">
              <Button 
                onClick={() => {
                  if (currentStep === "strength-config") setCurrentStep("strength-timer");
                  if (currentStep === "tightness-config") setCurrentStep("tightness-timer");
                }}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Start {currentStep.includes('strength') ? 'Strength' : 'Tightness'} Test
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    );
  };


  // Enhanced persistence functions
  const saveTestResultToPersistent = (testType: 'strength' | 'tightness' | 'purge', result: any) => {
    setPersistentTestResults(prev => ({
      ...prev,
      [testType]: result
    }));
  };
  
  const saveAllCurrentResults = () => {
    // Save any current test results to persistent storage
    if (strengthResult) saveTestResultToPersistent('strength', strengthResult);
    if (tightnessResult) saveTestResultToPersistent('tightness', tightnessResult);
    if (purgeResult) saveTestResultToPersistent('purge', purgeResult);
  };
  
  const _clearAllData = () => {
    // Save current results before clearing
    saveAllCurrentResults();
    
    setJobDetails({ jobNumber: "", customerName: "", engineerName: "", location: "" });
    setInstallationType(null);
    setMeterType("");
    setPipes([{ size: "", material: "steel", length: "" }]);
    setOperatingPressure("");
    setGaugeType("");
    setStrengthResult(null);
    setTightnessResult(null);
    setPurgeResult(null);
    // Clear persistent storage only when explicitly clearing all data
    setPersistentTestResults({});
    setCurrentStep("job-details");
    toast({
      title: "Form Cleared",
      description: "All data has been reset.",
    });
  };
  
  // Job details state
  const [jobDetails, setJobDetails] = useState({
    jobNumber: "",
    customerName: "",
    engineerName: "",
    location: ""
  });

  // Flow state
  const [currentStep, setCurrentStep] = useState<FlowStep>("job-details");
  const [installationType, setInstallationType] = useState<"new" | "existing" | null>(null);
  
  // Test data
  const [pipes, setPipes] = useState<{size: string, length: string, material: string}[]>([{ size: "", length: "", material: "steel" }]);
  const [meterType, setMeterType] = useState("");
  const [roomVolume, setRoomVolume] = useState("");
  const [operatingPressure, setOperatingPressure] = useState("");
  const [gaugeType, setGaugeType] = useState("electronic05");
  const [testMedium, setTestMedium] = useState("Air");
  const [pressureDrop, setPressureDrop] = useState("");
  
  // Test results
  const [strengthResult, setStrengthResult] = useState<TestResult | null>(null);
  const [tightnessResult, setTightnessResult] = useState<TestResult | null>(null);
  const [purgeResult, setPurgeResult] = useState<any>(null);
  const [installationVolume, setInstallationVolume] = useState(0);
  const [_strengthTestDuration, _setStrengthTestDuration] = useState(300); // 5 minutes
  const [tightnessTestDuration, setTightnessTestDuration] = useState(120); // Will be calculated
  const [letByTestDuration, setLetByTestDuration] = useState(120); // Will be calculated based on IV
  const [letByResult, setLetByResult] = useState<TestResult | null>(null);
  const [letByPressureDrop, setLetByPressureDrop] = useState("");
  
  // Purge state
  const [purgeDirection, setPurgeDirection] = useState<"air-to-gas" | "gas-to-air" | "">("");
  const [actualFlowRate, setActualFlowRate] = useState("");
  const [actualGasContent, setActualGasContent] = useState("");
  const [purgeEquipment, setPurgeEquipment] = useState({
    purgePointSize: "",
    hoseVentStackSize: "",
    flameArrestorSize: ""
  });
  
  const [completedTests, setCompletedTests] = useState<string[]>([]); // Track test sequence
  
  // Persistent test results storage - survives state clearing
  const [persistentTestResults, setPersistentTestResults] = useState<{
    strength?: TestResult,
    tightness?: TestResult,
    purge?: any
  }>({});
  
  // Additional state for let-by test
  const [letByPressureReading, setLetByPressureReading] = useState("");
  const [letByTestCompleted, setLetByTestCompleted] = useState(false);
  
  // Purge calculation results
  const [purgeCalcResults, setPurgeCalcResults] = useState<any>(null);
  const [isCalculatingPurge, setIsCalculatingPurge] = useState(false);
  const [purgeTimerComplete, setPurgeTimerComplete] = useState(false);
  
  
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
  }, [pipes.length, meterType, installationType, currentStep, strengthResult, tightnessResult]);

  // Auto-advance when job details are complete
  useEffect(() => {
    if (jobDetails.jobNumber && jobDetails.customerName && jobDetails.engineerName && jobDetails.location && currentStep === "job-details") {
      setTimeout(() => setCurrentStep("installation-type"), 500);
    }
  }, [jobDetails, currentStep]);

  // Auto-advance from installation type to test selection after animation
  useEffect(() => {
    if (installationType && currentStep === "installation-type") {
      setTimeout(() => setCurrentStep("test-selection"), 300);
    }
  }, [installationType, currentStep]);

  
  
  // Calculate IV breakdown with memoization
  const ivBreakdown = useMemo(() => {
    if (!meterType || pipes.some(p => !p.size || !p.length)) {
      return null;
    }
    
    let totalPipeVolume = 0;
    
    for (const pipe of pipes) {
      if (pipe.size && pipe.length && pipe.material) {
        const materialData = COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
        if (materialData) {
          const pipeData = materialData[pipe.size as keyof typeof materialData];
          if (pipeData) {
            const length = parseFloat(pipe.length);
            const volume = pipeData.volume * length;
            totalPipeVolume += volume;
          }
        }
      }
    }

    const meter = COMMERCIAL_METER_VOLUMES[meterType as keyof typeof COMMERCIAL_METER_VOLUMES];
    const meterVolume = typeof meter === 'number' ? meter : 0;
    
    // Add 10% to pipe volume, then add meter volume
    const pipeVolumeWith10Percent = totalPipeVolume * 1.1;
    const iv = pipeVolumeWith10Percent + meterVolume;
    
    return {
      pipeIV: totalPipeVolume,
      pipePlusFittingsIV: pipeVolumeWith10Percent,
      meterIV: meterVolume,
      totalIV: iv
    };
  }, [pipes, meterType]);

  // Update installation volume when IV breakdown changes
  useEffect(() => {
    if (ivBreakdown) {
      setInstallationVolume(ivBreakdown.totalIV);
    }
  }, [ivBreakdown]);

  // Auto-calculate tightness test result as user types
  const liveTightnessResult = useMemo(() => {
    if (!pressureDrop || !roomVolume || !ivBreakdown) return null;
    
    const iv = ivBreakdown.totalIV;
    
    // Find appropriate IV range
    let ivKey = "0.15";
    for (const range of IV_RANGES) {
      if (iv <= range.max) {
        ivKey = range.key;
        break;
      }
    }
    if (iv > 1.0) ivKey = "1.00";

    // Find room volume column
    const roomVol = parseFloat(roomVolume);
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

    const maxDrop = TIGHTNESS_DROP_TABLE[ivKey][columnIndex];
    const actualDrop = parseFloat(pressureDrop);
    const passed = actualDrop <= maxDrop;

    return {
      testType: "Tightness Test",
      result: (passed ? "PASS" : "FAIL") as "PASS" | "FAIL",
      details: {
        installationVolume: iv,
        maxDrop,
        actualDrop,
        roomVolume: roomVol
      }
    };
  }, [pressureDrop, roomVolume, ivBreakdown]);

  // Auto-process tightness test completion - save result but let user choose next step
  useEffect(() => {
    if (liveTightnessResult?.result === 'PASS' && currentStep === 'tightness-reading' && !tightnessResult) {
      // Automatically save the tightness result and mark test as completed
      const timer = setTimeout(() => {
        setTightnessResult(liveTightnessResult);
        setCompletedTests(prev => [...prev.filter(t => t !== 'tightness'), 'tightness']);
        // Don't auto-redirect - let user choose purge or finish
      }, 1000); // Give user 1 second to see the PASS result, then show choices

      return () => clearTimeout(timer);
    }
  }, [liveTightnessResult, currentStep, tightnessResult]);

  const calculateTightnessTestDuration = (iv: number) => {
    let testDuration = 2; // Default minimum in minutes
    
    if (installationType === "new") {
      for (const row of TIGHTNESS_DURATION_NEW) {
        if (iv <= row.maxIV) {
          testDuration = gaugeType === "electronic05" ? row.electronic05 : row.electronicDecimal;
          break;
        }
      }
      if (iv > 0.96) {
        testDuration = gaugeType === "electronic05" ? 30 : 7;
      }
    }
    
    // IGE/UP/1A: Stabilization time is 6 minutes or same as tightness test, whichever is longest
    const stabilizationTime = Math.max(6, testDuration);
    
    // Return total duration: stabilization + test duration
    return (stabilizationTime + testDuration) * 60; // Convert to seconds
  };

  const getTightnessTestBreakdown = (iv: number) => {
    let testDuration = 2; // Default minimum in minutes
    
    if (installationType === "new") {
      for (const row of TIGHTNESS_DURATION_NEW) {
        if (iv <= row.maxIV) {
          testDuration = gaugeType === "electronic05" ? row.electronic05 : row.electronicDecimal;
          break;
        }
      }
      if (iv > 0.96) {
        testDuration = gaugeType === "electronic05" ? 30 : 7;
      }
    }
    
    const stabilizationTime = Math.max(6, testDuration);
    
    return { stabilizationTime, testDuration };
  };

  const calculateLetByTestDuration = (iv: number) => {
    // Table B12: Let-by Test Periods based on Installation Volume
    if (iv <= 0.5) {
      return 2 * 60; // 2 minutes in seconds
    } else if (iv <= 0.8) {
      return 3 * 60; // 3 minutes in seconds
    } else if (iv <= 1.0) {
      return 4 * 60; // 4 minutes in seconds
    } else {
      return 4 * 60; // Default to 4 minutes for larger installations
    }
  };

  const getLargestPipeDiameter = (): number => {
    if (pipes.length === 0) return 0;
    
    // Normalize pipe sizes to numeric millimeters
    const diameters = pipes.map(pipe => {
      if (!pipe.size) return 0;
      
      // Handle different size formats and convert to millimeters
      let size = pipe.size.toString().toLowerCase().trim();
      
      // Remove 'mm' suffix if present
      size = size.replace(/mm$/i, '');
      
      // Parse the numeric value
      const numericSize = parseFloat(size);
      if (isNaN(numericSize)) return 0;
      
      // If the size is less than 10, assume it's in inches and convert to mm
      // (e.g., 2.5" = 65mm, but 65mm = 65mm)
      if (numericSize > 0 && numericSize < 10) {
        const mmSize = numericSize * 25.4; // Convert inches to mm
        console.log(`🔧 Converting ${numericSize}" to ${mmSize.toFixed(0)}mm`);
        return Math.round(mmSize);
      }
      
      return numericSize;
    });
    
    const largest = Math.max(...diameters);
    
    console.log('🔧 PIPE SIZE DEBUG:');
    console.log('🔧 Raw pipe sizes:', pipes.map(p => p.size));
    console.log('🔧 Normalized diameters (mm):', diameters);  
    console.log('🔧 Largest diameter (mm):', largest);
    
    return largest;
  };

  const getPurgeData = () => {
    const largestDiameter = getLargestPipeDiameter();
    const keys = Object.keys(COMMERCIAL_PURGE_DATA).map(Number).sort((a, b) => a - b);
    
    // Find closest diameter that's >= the largest pipe diameter
    const targetDiameter = keys.find(key => key >= largestDiameter) || keys[keys.length - 1];
    const purgeData = COMMERCIAL_PURGE_DATA[targetDiameter.toString() as keyof typeof COMMERCIAL_PURGE_DATA];
    
    console.log('🔧 PURGE DATA DEBUG:');
    console.log('🔧 Largest diameter:', largestDiameter);
    console.log('🔧 Available keys:', keys);
    console.log('🔧 Target diameter:', targetDiameter);
    console.log('🔧 Flow rate result:', purgeData?.flowRate);
    
    return purgeData;
  };

  const calculatePurgeVolume = () => {
    if (!ivBreakdown) return null;
    const iv = ivBreakdown;
    const purgeData = getPurgeData();
    
    // Commercial purge calculation:
    // Pipe PV = pipe IV × 1.5
    // Total PV = Pipe PV + Meter Volume (from Table B14)
    const pipePurgeVolume = iv.pipeIV * 1.5;
    const commercialMeterVolume = COMMERCIAL_METER_VOLUMES[meterType as keyof typeof COMMERCIAL_METER_VOLUMES] || 0;
    const totalPurgeVolume = pipePurgeVolume + commercialMeterVolume;
    
    return {
      purgeVolume: totalPurgeVolume,
      pipePurgeVolume,
      commercialMeterVolume,
      flowRate: purgeData?.flowRate || 0,
      maxPurgeTime: purgeData?.flowRate ? (totalPurgeVolume * 3600) / purgeData.flowRate : 0, // in seconds
      largestDiameter: getLargestPipeDiameter(),
      purgeData
    };
  };

  const processStrengthTest = () => {
    if (!operatingPressure || !pressureDrop) {
      toast({
        title: "Missing Information",
        description: "Please enter MOP and pressure drop",
        variant: "destructive",
      });
      return;
    }

    if (!ivBreakdown) return;
    const iv = ivBreakdown.totalIV;
    const operatingPressureValue = parseFloat(operatingPressure);
    const stp = Math.max(82.5, 2.5 * operatingPressureValue);
    const maxDrop = stp * 0.2; // 20% of STP
    const actualDrop = parseFloat(pressureDrop);
    const dropPercentage = (actualDrop / stp) * 100;
    const passed = dropPercentage <= 20;

    const result: TestResult = {
      testType: "Strength Test",
      result: passed ? "PASS" : "FAIL",
      details: {
        installationVolume: iv,
        stp,
        maxDrop,
        actualDrop,
        dropPercentage
      }
    };

    setStrengthResult(result);
    setCompletedTests(prev => [...prev.filter(t => t !== 'strength'), 'strength']);
    setCurrentStep("strength-result");
  };

  const processTightnessTest = () => {
    if (!pressureDrop || !roomVolume) {
      toast({
        title: "Missing Information", 
        description: "Please enter room volume and pressure drop",
        variant: "destructive",
      });
      return;
    }

    if (!ivBreakdown) return;
    const iv = ivBreakdown.totalIV;
    
    // Find appropriate IV range
    let ivKey = "0.15";
    for (const range of IV_RANGES) {
      if (iv <= range.max) {
        ivKey = range.key;
        break;
      }
    }
    if (iv > 1.0) ivKey = "1.00";

    // Find room volume column
    const roomVol = parseFloat(roomVolume);
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

    const maxDrop = TIGHTNESS_DROP_TABLE[ivKey][columnIndex];
    const actualDrop = parseFloat(pressureDrop);
    const passed = actualDrop <= maxDrop;

    const result: TestResult = {
      testType: "Tightness Test",
      result: passed ? "PASS" : "FAIL",
      details: {
        installationVolume: iv,
        maxDrop,
        actualDrop,
        roomVolume: roomVol,
        letByRise: letByPressureDrop || "0", // Include let-by rise value
        actualPressureDrop: pressureDrop, // Store the actual pressure drop
        testDuration: tightnessTestDuration, // Store test duration
        maxAllowableDrop: maxDrop // Store max allowable drop
      }
    };

    setTightnessResult(result);
    setCompletedTests(prev => [...prev.filter(t => t !== 'tightness'), 'tightness']);
    setCurrentStep("tightness-result");
  };

  const renderJobDetails = () => (
    <div className="max-w-2xl mx-auto">
      <Card data-auto-scroll="true">
        <CardHeader>
          <CardTitle className="flex items-center">
            <ClipboardList className="w-5 h-5 mr-2 text-primary" />
            Job Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job-number">Job Number</Label>
              <Input
                id="job-number"
                placeholder="e.g., COM-2024-001"
                value={jobDetails.jobNumber}
                onChange={(e) => setJobDetails(prev => ({ ...prev, jobNumber: e.target.value }))}
                data-testid="input-job-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name</Label>
              <Input
                id="customer-name"
                placeholder="Customer or Company Name"
                value={jobDetails.customerName}
                onChange={(e) => setJobDetails(prev => ({ ...prev, customerName: e.target.value }))}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engineer-name">Engineer Name</Label>
              <Input
                id="engineer-name"
                placeholder="Gas Safe Registered Engineer"
                value={jobDetails.engineerName}
                onChange={(e) => setJobDetails(prev => ({ ...prev, engineerName: e.target.value }))}
                data-testid="input-engineer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Site Address"
                value={jobDetails.location}
                onChange={(e) => setJobDetails(prev => ({ ...prev, location: e.target.value }))}
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
        <p className="text-muted-foreground">Select your installation type to begin testing</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          className="h-32 flex flex-col items-center justify-center gap-4 bg-white border-2 border-gray-200 rounded-lg shadow-lg hover:shadow-xl hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 transform hover:-translate-y-1"
          onClick={() => {
            setInstallationType("new");
            setTimeout(() => setCurrentStep("test-selection"), 300);
          }}
        >
          <Wrench className="w-12 h-12 text-blue-600" />
          <div className="font-semibold text-lg">New Installation</div>
        </button>

        <button
          className="h-32 flex flex-col items-center justify-center gap-4 bg-white border-2 border-gray-200 rounded-lg shadow-lg hover:shadow-xl hover:bg-green-50 hover:border-green-300 transition-all duration-200 transform hover:-translate-y-1"
          onClick={() => {
            setInstallationType("existing");
            setTimeout(() => setCurrentStep("test-selection"), 300);
          }}
        >
          <Settings className="w-12 h-12 text-green-600" />
          <div className="font-semibold text-lg">Existing Installation</div>
        </button>
      </div>
    </div>
  );

  const renderTestSelection = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold mb-2">
          {installationType === "new" ? "New Installation Tests" : "Existing Installation Tests"}
        </h2>
        <p className="text-muted-foreground">Select which test to perform</p>
      </div>
      <Card className="border-0 shadow-none">
        <CardHeader className="sr-only">
          <CardTitle>Test Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-4 ${installationType === "new" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
            {installationType === "new" && (
              <button
                className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-rose-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
                onClick={() => {
                  setTimeout(() => setCurrentStep("strength-setup"), 300);
                }}
              >
                <Gauge className="w-8 h-8 text-rose-800" />
                <span className="text-sm font-semibold">Strength Test</span>
              </button>
            )}

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-blue-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => {
                setTimeout(() => setCurrentStep("tightness-setup"), 300);
              }}
            >
              <TestTube className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-semibold">Tightness Test</span>
            </button>

            <button
              className="h-24 flex flex-col items-center justify-center gap-2 bg-white rounded-lg shadow-sm hover:shadow-md hover:bg-purple-50 transition-all duration-200 transform hover:-translate-y-1 border-0"
              onClick={() => {
                setTimeout(() => setCurrentStep("purge-setup"), 300);
              }}
            >
              <Wind className="w-8 h-8 text-purple-600" />
              <span className="text-sm font-semibold">Purge</span>
            </button>
          </div>

        </CardContent>
      </Card>

      {/* Auto-populated Synopsis - appears when tests are completed */}
      {(completedTests.length > 0 || strengthResult || tightnessResult || purgeResult) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              Test Synopsis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              {/* Strength Test Result */}
              {strengthResult && (
                <div className={`p-3 rounded-lg border ${
                  strengthResult.result === 'PASS' 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-rose-800" />
                      Strength Test
                    </h4>
                    <Badge className={strengthResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {strengthResult.result}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>STP: {strengthResult.details.stp} mbar</p>
                    <p>Max Drop: {strengthResult.details.maxDrop} mbar</p>
                    <p>Actual Drop: {strengthResult.details.actualDrop} mbar</p>
                  </div>
                </div>
              )}

              {/* Tightness Test Result */}
              {tightnessResult && (
                <div className={`p-3 rounded-lg border ${
                  tightnessResult.result === 'PASS' 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <TestTube className="w-4 h-4 text-blue-600" />
                      Tightness Test
                    </h4>
                    <Badge className={tightnessResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {tightnessResult.result}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>Room Volume: {tightnessResult.details.roomVolume.toFixed(1)} m³</p>
                    <p>Installation Volume: {tightnessResult.details.installationVolume.toFixed(4)} m³</p>
                    <p>Max Drop: {tightnessResult.details.maxDrop.toFixed(1)} mbar</p>
                    <p>Actual Drop: {tightnessResult.details.actualDrop.toFixed(1)} mbar</p>
                  </div>
                </div>
              )}

              {/* Purge Test Result */}
              {purgeResult && (
                <div className={`p-3 rounded-lg border ${
                  purgeResult.result === 'PASS' 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Wind className="w-4 h-4 text-purple-600" />
                      Purge Test
                    </h4>
                    <Badge className={purgeResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                      {purgeResult.result}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>Direction: {purgeResult.details.direction}</p>
                    <p>Flow Rate: {purgeResult.details.flowRate} m³/hr</p>
                    <p>Gas Content: {purgeResult.details.gasContent}%</p>
                  </div>
                </div>
              )}
            </div>

            {/* Export Options */}
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Export Options</h4>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => {
                    const completedTestTypes = [];
                    if (strengthResult) completedTestTypes.push('strength');
                    if (tightnessResult) completedTestTypes.push('tightness');
                    if (purgeResult) completedTestTypes.push('purge');
                    exportCombinedResults(completedTestTypes as ('strength' | 'tightness' | 'purge')[]);
                  }}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <FileDown className="w-4 h-4" />
                  Export All Tests
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderStrengthSetup = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-rose-800" />
            Strength Test Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-sm font-semibold text-rose-900 mb-2">Test Parameters</p>
            <div className="text-xs text-rose-700 space-y-1 mb-3">
              <p>• STP: Greater of 82.5 mbar or 2.5 × MOP</p>
              <p>• Stabilization: 5 minutes</p>
              <p>• Test Duration: 5 minutes</p>
              <p>• Max Drop: 20% of STP</p>
            </div>
            
            {operatingPressure && (
              <div className="p-2 bg-white border border-rose-300 rounded text-center">
                <p className="text-sm font-bold text-rose-900">
                  🎯 Test at: {Math.max(82.5, parseFloat(operatingPressure) * 2.5).toFixed(1)} mbar
                </p>
                <p className="text-xs text-rose-700 mt-1">
                  This is your calculated Strength Test Pressure (STP)
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Maximum Operating Pressure (MOP) - mbar</Label>
            <Input
              type="number"
              placeholder="Enter MOP (typically 21 mbar)"
              value={operatingPressure}
              onChange={(e) => setOperatingPressure(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setCurrentStep("strength-timer")}
              disabled={!operatingPressure}
              className="w-full gap-2 bg-rose-800 hover:bg-rose-900 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-rose-800 hover:border-rose-900 rounded-lg"
            >
              <Play className="w-4 h-4" />
              Start Strength Test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStrengthTimer = () => {
    const stp = Math.max(82.5, parseFloat(operatingPressure || "0") * 2.5);
    
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-rose-800" />
              Strength Test in Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">Test Pressure: {stp.toFixed(1)} mbar</p>
              <p className="text-sm text-muted-foreground">
                Stabilization (5 min) + Test Duration (5 min)
              </p>
            </div>

            <Stopwatch
              presetTime={600} // 10 minutes total (5 + 5)
              onComplete={() => setCurrentStep("strength-reading")}
              className="bg-rose-50"
            />

            <div className="text-center text-sm text-muted-foreground">
              Click "Start" to begin the timer. It will advance when complete.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderStrengthReading = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-rose-800" />
            Strength Test Reading
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-800">⏰ Test Complete!</p>
            <p className="text-xs text-green-700">Enter the observed pressure drop reading</p>
          </div>

          <div className="space-y-2">
            <Label>Actual Pressure Drop (mbar)</Label>
            <Input
              type="number"
              placeholder="Enter observed pressure drop"
              value={pressureDrop}
              onChange={(e) => setPressureDrop(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={processStrengthTest}
              disabled={!pressureDrop}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-green-800 hover:border-green-900 rounded-lg"
            >
              Calculate Result
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStrengthResult = () => {
    if (!strengthResult) return null;
    
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-rose-800" />
                Strength Test Result
              </span>
              <Badge className={strengthResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                {strengthResult.result}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`p-4 rounded-lg ${
              strengthResult.result === 'PASS' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">STP:</span>
                <span>{strengthResult.details.stp.toFixed(1)} mbar</span>
                
                <span className="text-muted-foreground">Max Drop (20%):</span>
                <span>{strengthResult.details.maxDrop.toFixed(1)} mbar</span>
                
                <span className="text-muted-foreground">Actual Drop:</span>
                <span className={strengthResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                  {strengthResult.details.actualDrop.toFixed(1)} mbar
                </span>
                
                <span className="text-muted-foreground">Drop Percentage:</span>
                <span className={strengthResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                  {strengthResult.details.dropPercentage.toFixed(1)}%
                </span>
              </div>
            </div>

            {strengthResult.result === 'PASS' && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-semibold text-green-600">✅ Strength Test Complete</p>
                </div>
                
                {/* Tightness Test Progression */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-blue-800">Ready for Next Test?</h4>
                      <p className="text-sm text-blue-600">Continue to Tightness Test using the same installation volume</p>
                    </div>
                    <Button 
                      onClick={() => setCurrentStep("tightness-setup")}
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Start Tightness Test
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Export buttons - Always visible after test completion */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">Export Test Results</h4>
              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={() => exportSingleResult('strength', strengthResult)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white flex-1 min-w-40"
                >
                  <FileDown className="w-4 h-4" />
                  Export Strength Test
                </Button>
                
                {completedTests.length > 0 && (
                  <Button
                    onClick={() => exportCombinedResults(['strength', ...completedTests.filter(t => t !== 'strength')] as ('strength' | 'tightness' | 'purge')[])}
                    className="gap-2 bg-purple-600 hover:bg-purple-700 text-white flex-1 min-w-40"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Group Tests
                  </Button>
                )}
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    );
  };

  const addPipeSection = () => {
    setPipes([...pipes, { size: "", length: "", material: "steel" }]);
  };

  const removePipeSection = (index: number) => {
    setPipes(pipes.filter((_, i) => i !== index));
  };

  const updatePipeSection = (index: number, field: 'size' | 'length' | 'material', value: string) => {
    const newPipes = [...pipes];
    newPipes[index][field] = value;
    setPipes(newPipes);
  };

  // Generate meaningful file name using job details and timestamp
  const generateFileName = (testType: string, certificateType?: string) => {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY
    const time = now.toLocaleTimeString('en-GB', { hour12: false }).replace(/:/g, '-'); // HH-MM-SS
    const jobPrefix = jobDetails.jobNumber || 'Unknown-Job';
    const testName = certificateType || testType.charAt(0).toUpperCase() + testType.slice(1);
    
    return `${jobPrefix}_${testName}_${date}_${time}.pdf`;
  };

  const exportSingleResult = async (testType: 'strength' | 'tightness', result: TestResult) => {
    try {
      // Use the same backend API approach as industrial calculator
      const exportData = {
        format: 'pdf' as const,
        jobDetails,
        projectDetails: {
          installationType: installationType || 'Unknown',
          testMedium: testMedium,
          gaugeType: gaugeType || 'Unknown',
          roomVolume: roomVolume ? parseFloat(roomVolume) : 0,
          maxOperatingPressure: parseFloat(operatingPressure) || 0
        },
        pipeConfigurations: pipes.filter(p => p.size && p.length).map(pipe => {
          // Calculate volume for each pipe using PIPE_VOLUMES data
          let pipeVolume = 0;
          const materialData = COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
          if (materialData) {
            const pipeData = materialData[pipe.size as keyof typeof materialData];
            if (pipeData) {
              pipeVolume = pipeData.volume * parseFloat(pipe.length);
            }
          }
          return {
            nominalSize: pipe.size,
            length: parseFloat(pipe.length) || 0,
            material: pipe.material,
            internalDiameter: 0, // Not used in PDF but keeping for compatibility
            volume: pipeVolume
          };
        }),
        meterConfiguration: {
          meterType: meterType || 'Unknown',
          quantity: 1,
          internalVolume: ivBreakdown?.meterIV || 0, // Use actual calculated value
          cyclicVolume: 0 // Not used in this calculator
        },
        completedTests: {
          [testType]: {
            results: {
              calculation: {
                totalSystemVolume: installationVolume.toFixed(4),
                testDuration: result.details.testDuration || 0,
                maxPressureDrop: result.details.maxAllowableDrop || 0
              }
            },
            actualReadings: { 
              actualPressureDrop: result.details.actualPressureDrop || 0,
              letByRise: result.details.letByRise || 0,
              maxOperatingPressure: parseFloat(operatingPressure) || 0
            },
            testResult: result.result,
            timestamp: new Date().toISOString()
          }
        },
        isMultipleTests: false
      };

      // DEBUG: Log installationType value before PDF generation (exportSingleResult)
      console.log('🐞 COMMERCIAL SINGLE PDF DEBUG - installationType state:', installationType);
      console.log('🐞 COMMERCIAL SINGLE PDF DEBUG - currentStep:', currentStep);

      // Prepare test data for PDF generation
      const testData = {
        jobNumber: jobDetails.jobNumber,
        customerName: jobDetails.customerName,
        engineerName: jobDetails.engineerName,
        location: jobDetails.location,
        installationType: installationType, // This is the key fix!
        testMedium: testMedium,
        gaugeType: gaugeType,
        operatingPressure: operatingPressure,
        roomVolume: roomVolume,
        meterType: meterType,
        pipeConfigs: pipes.filter(p => p.size && p.length).map(pipe => {
          // Calculate volume for each pipe using COMMERCIAL_PIPE_VOLUMES data
          let pipeVolume = 0;
          const materialData = COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
          if (materialData) {
            const pipeData = materialData[pipe.size as keyof typeof materialData];
            if (pipeData) {
              pipeVolume = pipeData.volume * parseFloat(pipe.length);
            }
          }
          return {
            nominalSize: pipe.size,
            length: pipe.length,
            material: pipe.material,
            calculatedVolume: pipeVolume.toFixed(4)
          };
        }),
        installationVolume: installationVolume.toFixed(4),
        testType: testType,
        testResult: result.result,
        testDuration: result.details.testDuration,
        maxAllowableDrop: result.details.maxAllowableDrop,
        actualPressureDrop: result.details.actualPressureDrop,
        letByRise: result.details.letByRise
      };

      // Generate PDF by opening in new window
      const response = await fetch('/api/pdf/generate-commercial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      // Get the HTML response and open in new window for printing
      const htmlContent = await response.text();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      }
      
      toast({
        title: "Certificate Generated",
        description: `${testType === 'strength' ? 'Strength' : testType === 'tightness' ? 'Tightness' : 'Purge'} test certificate opened for printing.`,
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const exportCombinedResults = async (tests: ('strength' | 'tightness' | 'purge')[]) => {
    try {
      const certificateType = tests.length === 2 ? 'Dual Certificate' : 'Triple Certificate';
      
      // Prepare completed tests data
      const completedTestsData: any = {};
      
      if (tests.includes('strength') && strengthResult) {
        completedTestsData['strength'] = {
          results: {
            calculation: {
              totalSystemVolume: installationVolume.toFixed(4),
              testDuration: strengthResult.details.testDuration || 0,
              maxPressureDrop: strengthResult.details.maxAllowableDrop || 0
            }
          },
          actualReadings: { 
            actualPressureDrop: strengthResult.details.actualPressureDrop || 0
          },
          testResult: strengthResult.result,
          timestamp: new Date().toISOString()
        };
      }
      
      if (tests.includes('tightness') && tightnessResult) {
        completedTestsData['tightness'] = {
          results: {
            calculation: {
              totalSystemVolume: installationVolume.toFixed(4),
              testDuration: tightnessResult.details.testDuration || 0,
              maxPressureDrop: tightnessResult.details.maxAllowableDrop || 0
            }
          },
          actualReadings: { 
            actualPressureDrop: tightnessResult.details.actualPressureDrop || 0
          },
          testResult: tightnessResult.result,
          timestamp: new Date().toISOString()
        };
      }

      const exportData = {
        format: 'pdf' as const,
        jobDetails,
        projectDetails: {
          installationType: installationType || 'Unknown',
          testMedium: testMedium,
          gaugeType: gaugeType || 'Unknown',
          roomVolume: roomVolume ? parseFloat(roomVolume) : 0,
          maxOperatingPressure: parseFloat(operatingPressure) || 0
        },
        pipeConfigurations: pipes.filter(p => p.size && p.length).map(pipe => ({
          nominalSize: pipe.size,
          length: parseFloat(pipe.length) || 0,
          material: pipe.material,
          internalDiameter: 0,
          volume: 0
        })),
        meterConfiguration: {
          meterType: meterType || 'Unknown',
          quantity: 1,
          internalVolume: 0,
          cyclicVolume: 0
        },
        completedTests: completedTestsData,
        isMultipleTests: true
      };

      // DEBUG: Log installationType value before PDF generation (exportCombinedResults)
      console.log('🐞 COMMERCIAL COMBINED PDF DEBUG - installationType state:', installationType);
      console.log('🐞 COMMERCIAL COMBINED PDF DEBUG - currentStep:', currentStep);

      // Prepare test data for PDF generation
      const testData = {
        jobNumber: jobDetails.jobNumber,
        customerName: jobDetails.customerName,
        engineerName: jobDetails.engineerName,
        location: jobDetails.location,
        installationType: installationType, // This is the key fix!
        testMedium: testMedium,
        gaugeType: gaugeType,
        operatingPressure: operatingPressure,
        roomVolume: roomVolume,
        meterType: meterType,
        pipeConfigs: pipes.filter(p => p.size && p.length).map(pipe => {
          // Calculate volume for each pipe using COMMERCIAL_PIPE_VOLUMES data
          let pipeVolume = 0;
          const materialData = COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
          if (materialData) {
            const pipeData = materialData[pipe.size as keyof typeof materialData];
            if (pipeData) {
              pipeVolume = pipeData.volume * parseFloat(pipe.length);
            }
          }
          return {
            nominalSize: pipe.size,
            length: pipe.length,
            material: pipe.material,
            calculatedVolume: pipeVolume.toFixed(4)
          };
        }),
        installationVolume: installationVolume.toFixed(4),
        combinedTests: completedTestsData,
        certificateType: certificateType
      };

      // Generate PDF by opening in new window
      const response = await fetch('/api/pdf/generate-commercial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      // Get the HTML response and open in new window for printing
      const htmlContent = await response.text();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      }
      
      toast({
        title: "Combined Certificate Generated", 
        description: `${certificateType} opened for printing.`,
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({
        title: "Export Failed",
        description: "Failed to generate combined PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const renderTightnessSetup = () => {
    // Check if pipes are configured and IV exceeds commercial limit
    if (ivBreakdown && ivBreakdown.totalIV > 1.0) {
      return (
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                Installation Volume Limit Exceeded
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-600 mb-4">
                This installation volume ({ivBreakdown.totalIV.toFixed(4)} m³) exceeds the 1 m³ limit for commercial testing.
                You must use the Industrial Calculator for this installation.
              </p>
              <Button
                onClick={() => window.open('/industrial', '_blank')}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Switch to Industrial Calculator
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-blue-600" />
              Tightness Test Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Test Parameters</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Gauge Type</Label>
                  <Select value={gaugeType} onValueChange={setGaugeType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="electronic01">Electronic (0.1 mbar / 2 decimal)</SelectItem>
                      <SelectItem value="electronic05">Electronic (0.5 mbar GRM)</SelectItem>
                      <SelectItem value="water">Water Gauge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Test Medium *</Label>
                  <Select value={testMedium} onValueChange={setTestMedium}>
                    <SelectTrigger data-testid="select-test-medium">
                      <SelectValue placeholder="Select test medium" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Air">Air</SelectItem>
                      <SelectItem value="Gas">Natural Gas</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Affects TTD calculations (F1: Air=67, Gas=42)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Room Volume (m³) *</Label>
                  <Input
                    type="number"
                    placeholder="Enter room volume"
                    value={roomVolume}
                    onChange={(e) => setRoomVolume(e.target.value)}
                    data-testid="input-room-volume-tightness"
                  />
                  <p className="text-xs text-muted-foreground">
                    Volume of the smallest occupied space - required for tightness test calculations
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Max Operating Pressure (MOP) *</Label>
                  <Input
                    type="number"
                    placeholder="Enter MOP in mbar"
                    value={operatingPressure}
                    onChange={(e) => setOperatingPressure(e.target.value)}
                    data-testid="input-operating-pressure"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum operating pressure of the system (used for test pressure calculations)
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Installation Volume</h3>
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Pipe Sections</Label>
                {pipes.map((pipe, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-gray-100 border border-gray-200 rounded-lg shadow-sm">
                    <div className="space-y-2">
                      <Label>Material</Label>
                      <Select 
                        value={pipe.material} 
                        onValueChange={(value) => updatePipeSection(index, 'material', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Material" />
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
                        value={pipe.size} 
                        onValueChange={(value) => updatePipeSection(index, 'size', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Size" />
                        </SelectTrigger>
                        <SelectContent>
                          {pipe.material && Object.entries(PIPE_VOLUMES[pipe.material as keyof typeof PIPE_VOLUMES]).map(([key, data]) => (
                            <SelectItem key={key} value={key}>
                              {data.label}
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
                        onChange={(e) => updatePipeSection(index, 'length', e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removePipeSection(index)}
                        disabled={pipes.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPipeSection}
                  className="w-full"
                >
                  Add Pipe Section
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Meter Type</Label>
                <Select value={meterType} onValueChange={setMeterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select meter" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METER_VOLUMES).map(([key, meter]) => (
                      <SelectItem key={key} value={key}>
                        {meter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pipe volume includes 10% allowance for fittings
                </p>
              </div>

              {/* Installation Volume Breakdown */}
              {ivBreakdown && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-3">Installation Volume Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Pipe IV:</span>
                      <span className="font-mono">{ivBreakdown.pipeIV.toFixed(6)} m³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Pipe + Fittings IV (+ 10%):</span>
                      <span className="font-mono">{ivBreakdown.pipePlusFittingsIV.toFixed(6)} m³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Meter IV:</span>
                      <span className="font-mono">{ivBreakdown.meterIV.toFixed(6)} m³</span>
                    </div>
                    <div className="border-t border-blue-300 pt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-blue-800">Total IV:</span>
                        <span className="font-mono text-blue-800">{ivBreakdown.totalIV.toFixed(6)} m³</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentStep("test-selection")}
                className="gap-2"
              >
                ← Back
              </Button>
              <Button
                onClick={() => {
                  if (!ivBreakdown) return;
                  const iv = ivBreakdown.totalIV;
                  const tightnessDuration = calculateTightnessTestDuration(iv);
                  const letByDuration = calculateLetByTestDuration(iv);
                  setTightnessTestDuration(tightnessDuration);
                  setLetByTestDuration(letByDuration);
                  setCurrentStep("let-by-timer");
                }}
                disabled={!roomVolume || !meterType || pipes.some(p => !p.size || !p.length)}
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-blue-800 hover:border-blue-900 rounded-lg"
              >
                <Play className="w-4 h-4" />
                Start Let-by Test
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTightnessTimer = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-blue-600" />
            Tightness Test in Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">
              Installation Volume: {installationVolume.toFixed(4)} m³
            </p>
            <p className="text-sm text-muted-foreground">
              {(() => {
                const breakdown = getTightnessTestBreakdown(installationVolume);
                return `Total Duration: ${Math.floor(tightnessTestDuration / 60)} min (${breakdown.stabilizationTime} min stabilization + ${breakdown.testDuration} min test)`;
              })()}
            </p>
          </div>

          <Stopwatch
            presetTime={tightnessTestDuration}
            onComplete={() => setCurrentStep("tightness-reading")}
            className="bg-blue-50"
          />

          <div className="text-center text-sm text-muted-foreground">
            Click "Start" to begin the timer. It will advance when complete.
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTightnessReading = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-blue-600" />
            Tightness Test Reading
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-800">⏰ Test Complete!</p>
            <p className="text-xs text-green-700">Enter the observed pressure drop reading</p>
          </div>

          <div className="space-y-2">
            <Label>Actual Pressure Drop (mbar)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="Enter observed pressure drop"
              value={pressureDrop}
              onChange={(e) => setPressureDrop(e.target.value)}
            />
          </div>

          {liveTightnessResult && (
            <div className={`p-4 rounded-lg border ${
              liveTightnessResult.result === 'PASS' 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <h4 className={`font-semibold mb-3 ${
                liveTightnessResult.result === 'PASS' ? 'text-green-800' : 'text-red-800'
              }`}>Tightness Test Result</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Room Volume:</span>
                <span>{liveTightnessResult.details.roomVolume.toFixed(1)} m³</span>
                
                <span className="text-muted-foreground">Installation Volume:</span>
                <span>{liveTightnessResult.details.installationVolume.toFixed(4)} m³</span>
                
                <span className="text-muted-foreground">Max Allowed Drop:</span>
                <span>{liveTightnessResult.details.maxDrop.toFixed(1)} mbar</span>
                
                <span className="text-muted-foreground">Actual Drop:</span>
                <span className={liveTightnessResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                  {liveTightnessResult.details.actualDrop.toFixed(1)} mbar
                </span>
              </div>
            </div>
          )}

          {/* Export buttons - Always visible when test results are available */}
          {liveTightnessResult && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-3">Export Test Results</h4>
              <div className="flex gap-3 flex-wrap">
                <Button 
                  onClick={() => exportSingleResult('tightness', liveTightnessResult)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white flex-1 min-w-40"
                >
                  <FileDown className="w-4 h-4" />
                  Export Tightness Test
                </Button>
                {completedTests.length > 0 && (
                  <Button 
                    onClick={() => exportCombinedResults(['tightness', ...completedTests.filter(t => t !== 'tightness')] as ('strength' | 'tightness' | 'purge')[])}
                    className="gap-2 bg-purple-600 hover:bg-purple-700 text-white flex-1 min-w-40"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Group Tests
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Next Step Choice - Show after tightness test passes */}
          {liveTightnessResult?.result === 'PASS' && tightnessResult && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm font-semibold text-purple-800 mb-2">Next Step</p>
              <p className="text-xs text-purple-700 mb-3">
                Tightness test passed! Is purging required?
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => {
                    setCurrentStep("purge-setup");
                  }}
                  className="w-full sm:flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
                >
                  <Wind className="w-4 h-4" />
                  Yes, Purge Required
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Go to synopsis
                    setCurrentStep("test-selection");
                  }}
                  className="w-full sm:flex-1"
                >
                  No, Tests Complete
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep("tightness-timer")}
              className="gap-2"
            >
              ← Back to Timer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTightnessResult = () => {
    if (!tightnessResult) return null;
    
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-blue-600" />
                Tightness Test Result
              </span>
              <Badge className={tightnessResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
                {tightnessResult.result}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`p-4 rounded-lg ${
              tightnessResult.result === 'PASS' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Room Volume:</span>
                <span>{tightnessResult.details.roomVolume.toFixed(1)} m³</span>
                
                <span className="text-muted-foreground">Installation Volume:</span>
                <span>{tightnessResult.details.installationVolume.toFixed(4)} m³</span>
                
                <span className="text-muted-foreground">Max Allowed Drop:</span>
                <span>{tightnessResult.details.maxDrop.toFixed(1)} mbar</span>
                
                <span className="text-muted-foreground">Actual Drop:</span>
                <span className={tightnessResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                  {tightnessResult.details.actualDrop.toFixed(1)} mbar
                </span>
              </div>
            </div>

            {tightnessResult.result === 'PASS' && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm font-semibold text-purple-800 mb-2">Next Step</p>
                <p className="text-xs text-purple-700 mb-3">
                  Tightness test passed! Is purging required?
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => setCurrentStep("purge-setup")}
                    className="w-full sm:flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
                  >
                    <Wind className="w-4 h-4" />
                    Yes, Purge Required
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Auto-redirect to synopsis  
                      setTimeout(() => setCurrentStep("test-selection"), 100);
                    }}
                    className="w-full sm:flex-1"
                  >
                    View Test Synopsis
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  onClick={() => exportSingleResult('tightness', tightnessResult)}
                  className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-blue-800 hover:border-blue-900 rounded-lg"
                >
                  <FileDown className="w-4 h-4" />
                  Export Tightness Test
                </Button>
                
                {completedTests.includes('strength') && (
                  <Button
                    onClick={() => exportCombinedResults(['strength', 'tightness'])}
                    className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Both Tests
                  </Button>
                )}
              </div>
              

            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPurgeSelection = () => (
    <div className="max-w-2xl mx-auto" data-auto-scroll="true">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-purple-600" />
            Commercial Gas Purging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Purge Direction Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Purge Direction</h3>
            <RadioGroup value={purgeDirection} onValueChange={(value: "air-to-gas" | "gas-to-air") => setPurgeDirection(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="air-to-gas" id="air-to-gas" />
                <Label htmlFor="air-to-gas">Air to Gas (Final gas content must be ≤ 1.8%)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="gas-to-air" id="gas-to-air" />
                <Label htmlFor="gas-to-air">Gas to Air (Final gas content must be ≥ 90%)</Label>
              </div>
            </RadioGroup>
          </div>


          {/* MOP Configuration */}
          <div className="space-y-2">
            <Label>Maximum Operating Pressure (MOP) - mbar</Label>
            <Input
              type="number"
              placeholder="Enter MOP (typically 21 mbar)"
              value={operatingPressure}
              onChange={(e) => setOperatingPressure(e.target.value)}
            />
          </div>

          {/* Meter Configuration */}
          <div className="space-y-2">
            <Label>Meter Type</Label>
            <Select value={meterType} onValueChange={setMeterType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Meter</SelectItem>
                <SelectItem value="U6">U6 (Domestic)</SelectItem>
                <SelectItem value="G4">G4</SelectItem>
                <SelectItem value="G6">G6</SelectItem>
                <SelectItem value="G10">G10</SelectItem>
                <SelectItem value="G16">G16</SelectItem>
                <SelectItem value="G25">G25</SelectItem>
                <SelectItem value="G40">G40</SelectItem>
                <SelectItem value="G65">G65</SelectItem>
                <SelectItem value="G100">G100</SelectItem>
                <SelectItem value="G160">G160</SelectItem>
                <SelectItem value="G250">G250</SelectItem>
                <SelectItem value="G400">G400</SelectItem>
                <SelectItem value="G650">G650</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Continue to Equipment Configuration */}
          {purgeDirection && operatingPressure && (
            <div className="text-center">
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white gap-2 px-8 py-3"
                onClick={() => setCurrentStep("purge-setup")}
              >
                <Settings className="w-4 h-4" />
                Configure Purge Equipment
              </Button>
            </div>
          )}

          {purgeResult && (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-lg font-semibold text-green-600">✅ {purgeResult.purgeType} Complete</p>
                <p className="text-sm text-green-700 mt-1">{purgeResult.method}</p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={() => exportSingleResult('purge' as any, { result: purgeResult.result, details: purgeResult } as any)}
                    className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
                  >
                    <FileDown className="w-4 h-4" />
                    Export Purge Result
                  </Button>
                  
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep("test-selection")}
              className="gap-2"
            >
 to Tests
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderLetByTimer = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-rose-800" />
            Let-by Test in Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">
              Installation Volume: {installationVolume.toFixed(4)} m³
            </p>
            <p className="text-sm text-muted-foreground">
              Test Duration: {Math.floor(letByTestDuration / 60)} minutes (at half operating pressure)
            </p>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm font-semibold text-rose-900">📋 Let-by Test</p>
              <p className="text-xs text-rose-700">Testing at 50% of operating pressure before main tightness test</p>
            </div>
          </div>

          <Stopwatch
            presetTime={letByTestDuration}
            onComplete={() => setCurrentStep("let-by-reading")}
            className="bg-rose-50"
          />

          <div className="text-center text-sm text-muted-foreground">
            Click "Start" to begin the let-by test timer. It will advance when complete.
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderLetByReading = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-rose-800" />
            Let-by Test Reading
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-800">⏰ Let-by Test Complete!</p>
            <p className="text-xs text-green-700">Enter the observed pressure change (negative = decrease, positive = increase)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="letByPressureDrop">Pressure Change (mbar)</Label>
            <Input
              id="letByPressureDrop"
              type="number"
              step="0.1"
              placeholder="Enter pressure change (- for drop, + for rise)"
              value={letByPressureDrop}
              onChange={(e) => setLetByPressureDrop(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep("let-by-timer")}
              className="gap-2"
            >
 to Timer
            </Button>
            <Button
              onClick={() => {
                if (!ivBreakdown) return;
                const iv = ivBreakdown.totalIV;
                const pressureChange = parseFloat(letByPressureDrop) || 0;
                
                // Let-by test passes if pressure hasn't increased (no positive rise)
                const passed = pressureChange <= 0;
                
                const result: TestResult = {
                  testType: "Let-by Test", 
                  result: passed ? "PASS" : "FAIL",
                  details: {
                    installationVolume: iv,
                    pressureDrop: pressureChange,
                    testDuration: letByTestDuration / 60 // in minutes
                  }
                };
                
                setLetByResult(result);
                setCurrentStep("tightness-timer");
              }}
              disabled={!letByPressureDrop}
              className="flex-1 bg-rose-800 hover:bg-rose-900"
            >
              Complete Let-by Test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Calculate purge requirements using server-side calculations
  const calculatePurgeRequirements = async () => {
    setIsCalculatingPurge(true);
    try {
      const calculationData = {
        project: {
          reference: jobDetails.jobNumber,
          engineerName: jobDetails.engineerName, 
          installationType,
          operationType: "Purge",
          gasType: testMedium,
          maxOperatingPressure: operatingPressure ? parseFloat(operatingPressure) : undefined,
          zoneType: "Type A" // Default for commercial
        },
        pipeConfigurations: pipes.map(pipe => ({
          nominalSize: pipe.size + "mm",
          length: parseFloat(pipe.length) || 0
        })),
        meterConfigurations: meterType !== "none" ? [{
          meterType: meterType,
          quantity: 1
        }] : []
      };

      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...calculationData, calculatorType: "commercial"})
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Calculation failed');
      
      setPurgeCalcResults(data.calculation);
      toast({
        title: "Purge Requirements Calculated",
        description: "Commercial purge parameters calculated successfully"
      });
    } catch (error) {
      toast({
        title: "Calculation Error",
        description: error instanceof Error ? error.message : "Failed to calculate purge requirements",
        variant: "destructive"
      });
    } finally {
      setIsCalculatingPurge(false);
    }
  };

  const renderPurgeSetup = () => (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-purple-600" />
            Purge Test Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm font-semibold text-purple-800 mb-2">Purge Test Parameters</p>
            <div className="text-xs text-purple-700 space-y-1">
              <p>• Configure pipe installation for purge volume calculations</p>
              <p>• Flow rate based on largest pipe diameter (Table B13)</p>
              <p>• PV = (IV pipe + fittings(10%) + IV meter + IV purge) × 1.5</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Maximum Operating Pressure (MOP) - mbar</Label>
            <Input
              type="number"
              placeholder="Enter MOP (typically 21 mbar)"
              value={operatingPressure}
              onChange={(e) => setOperatingPressure(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setCurrentStep("purge-selection")}
              disabled={!operatingPressure}
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
            >
              <Settings className="w-4 h-4" />
              Configure Purge Equipment
            </Button>
          </div>
            <div className="space-y-2">
              <Label>Maximum Operating Pressure (MOP) - mbar</Label>
              <Input
                type="number"
                placeholder="Enter MOP (typically 21 mbar)"
                value={operatingPressure}
                onChange={(e) => setOperatingPressure(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Installation Volume</h3>
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Pipe Sections</Label>
                {pipes.map((pipe, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end p-4 bg-gray-100 border border-gray-200 rounded-lg shadow-sm">
                    <div className="space-y-2">
                      <Label>Material</Label>
                      <Select 
                        value={pipe.material} 
                        onValueChange={(value) => updatePipeSection(index, 'material', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Material" />
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
                        value={pipe.size} 
                        onValueChange={(value) => updatePipeSection(index, 'size', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Size" />
                        </SelectTrigger>
                        <SelectContent>
                          {pipe.material && Object.entries(PIPE_VOLUMES[pipe.material as keyof typeof PIPE_VOLUMES]).map(([key, data]) => (
                            <SelectItem key={key} value={key}>
                              {data.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Length (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Length"
                        value={pipe.length}
                        onChange={(e) => updatePipeSection(index, 'length', e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removePipeSection(index)}
                      disabled={pipes.length === 1}
                      className="h-10"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={addPipeSection}
                  className="w-full"
                >
                  + Add Pipe Section
                </Button>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Meter Configuration</Label>
                <div className="space-y-2">
                  <Label>Meter Type</Label>
                  <Select value={meterType} onValueChange={setMeterType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Meter</SelectItem>
                      <SelectItem value="U6">U6 (Domestic)</SelectItem>
                      <SelectItem value="G4">G4</SelectItem>
                      <SelectItem value="G6">G6</SelectItem>
                      <SelectItem value="G10">G10</SelectItem>
                      <SelectItem value="G16">G16</SelectItem>
                      <SelectItem value="G25">G25</SelectItem>
                      <SelectItem value="G40">G40</SelectItem>
                      <SelectItem value="G65">G65</SelectItem>
                      <SelectItem value="G100">G100</SelectItem>
                      <SelectItem value="G160">G160</SelectItem>
                      <SelectItem value="G250">G250</SelectItem>
                      <SelectItem value="G400">G400</SelectItem>
                      <SelectItem value="G650">G650</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setCurrentStep("purge-selection")}
                  disabled={!operatingPressure}
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-purple-800 hover:border-purple-900 rounded-lg"
                >
                  <Settings className="w-4 h-4" />
                  Configure Purge Equipment
                </Button>
              </div>
            </div>

            <div className="space-y-6">
            {/* Installation Volume Synopsis */}
            {ivBreakdown && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-800 mb-3">📊 Installation Volume (IV) Synopsis</h3>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-blue-700">Pipe Volumes:</span>
                    <div className="ml-4 space-y-1">
                      {pipes.map((pipe, index) => {
                        const materialData = COMMERCIAL_PIPE_VOLUMES[pipe.material as keyof typeof COMMERCIAL_PIPE_VOLUMES];
                        const pipeData = materialData?.[pipe.size as keyof typeof materialData];
                        const volume = pipeData ? pipeData.volume * parseFloat(pipe.length) : 0;
                        return (
                          <div key={index} className="text-green-600">
                            • {pipe.size}mm ({pipeData?.label || pipe.size}) x {pipe.length}m = {volume.toFixed(4)} m³
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-blue-700">Pipe Total:</span>
                    <span className="text-green-600"> {ivBreakdown.pipeIV.toFixed(4)} m³ + 10% fittings = {ivBreakdown.pipePlusFittingsIV.toFixed(4)} m³</span>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-blue-700">Meter Volume:</span>
                    <span className="text-green-600"> {meterType === "none" ? "No Meter" : meterType} x {ivBreakdown.meterIV.toFixed(4)} = {ivBreakdown.meterIV.toFixed(4)} m³</span>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded">
                  <span className="font-bold text-green-800">🎯 Total Installation Volume (IIV): {ivBreakdown.totalIV.toFixed(4)} m³</span>
                  <p className="text-xs text-green-700 mt-1">Used for TTD calculations and test requirements</p>
                </div>
              </div>
            )}

            {!purgeCalcResults ? (
              <>
                {/* Purge Equipment Configuration */}
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800 mb-2">🛠️ Purge Equipment Configuration</h3>
                  <div className="space-y-2 text-sm text-purple-700">
                    <p>• Configure purge hose and stack dimensions for volume calculations</p>
                    <p>• PV = (IV pipe + fittings(10%) + IV meter + IV purge) × 1.5</p>
                    <p>• Flow rate based on largest pipe diameter</p>
                  </div>
                </div>

                {/* Purge Equipment Inputs */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Purge Hose */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-purple-800">Purge Hose</h3>
                    
                    <div className="space-y-2">
                      <Label>Hose Size</Label>
                      <Select
                        value={purgeEquipment.purgePointSize}
                        onValueChange={(value) => setPurgeEquipment(prev => ({ ...prev, purgePointSize: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select hose size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20mm</SelectItem>
                          <SelectItem value="25">25mm</SelectItem>
                          <SelectItem value="32">32mm</SelectItem>
                          <SelectItem value="40">40mm</SelectItem>
                          <SelectItem value="50">50mm</SelectItem>
                          <SelectItem value="65">65mm</SelectItem>
                          <SelectItem value="80">80mm</SelectItem>
                          <SelectItem value="100">100mm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Hose Length (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Enter hose length"
                        value={purgeEquipment.hoseVentStackSize}
                        onChange={(e) => setPurgeEquipment(prev => ({ ...prev, hoseVentStackSize: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Purge Stack */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-purple-800">Purge Stack</h3>
                    
                    <div className="space-y-2">
                      <Label>Stack Size</Label>
                      <Select
                        value={purgeEquipment.flameArrestorSize}
                        onValueChange={(value) => setPurgeEquipment(prev => ({ ...prev, flameArrestorSize: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select stack size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20mm</SelectItem>
                          <SelectItem value="25">25mm</SelectItem>
                          <SelectItem value="32">32mm</SelectItem>
                          <SelectItem value="40">40mm</SelectItem>
                          <SelectItem value="50">50mm</SelectItem>
                          <SelectItem value="65">65mm</SelectItem>
                          <SelectItem value="80">80mm</SelectItem>
                          <SelectItem value="100">100mm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Stack Length (m)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Enter stack length"
                        value={actualFlowRate}
                        onChange={(e) => setActualFlowRate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Calculate Button */}
                <div className="text-center py-4">
                  <Button 
                    onClick={calculatePurgeRequirements}
                    disabled={isCalculatingPurge || !purgeEquipment.purgePointSize || !purgeEquipment.hoseVentStackSize || !purgeEquipment.flameArrestorSize}
                    className="bg-purple-600 hover:bg-purple-700 gap-2 px-8 py-3"
                  >
                    {isCalculatingPurge ? (
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
                  {(!purgeEquipment.purgePointSize || !purgeEquipment.hoseVentStackSize || !purgeEquipment.flameArrestorSize) && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Please configure all purge equipment dimensions
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Installation Summary */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-rose-50 border border-rose-200 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Installation Volume</p>
                    <p className="text-lg text-rose-900">{purgeCalcResults.totalSystemVolume} m³</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Required Purge Volume</p>
                    <p className="text-lg text-rose-900">{purgeCalcResults.requiredPurgeVolume} m³</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Minimum Flow Rate</p>
                    <p className="text-lg text-rose-900">{purgeCalcResults.minimumFlowRate} m³/hr</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Maximum Purge Time</p>
                    <p className="text-lg text-rose-900">{purgeCalcResults.maximumPurgeTime}</p>
                  </div>
                </div>

                {/* Equipment Requirements */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Required Equipment (Table B13)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Purge Point Nominal Bore</Label>
                      <Input 
                        value={`${purgeCalcResults.purgePointBore || 20}mm`}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hose/Vent Stack Nominal Bore</Label>
                      <Input 
                        value={`${purgeCalcResults.purgeHoseBore || 20}mm`}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Largest Pipe Diameter</Label>
                      <Input 
                        value={`${purgeCalcResults.largestPipeDiameter || 0}mm`}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Purge Timer */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Purge Timer</h3>
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                    <div className="text-center space-y-2 mb-4">
                      <p className="text-sm font-semibold text-rose-900">
                        Maximum Purge Time: {purgeCalcResults.maximumPurgeTime}
                      </p>
                      <p className="text-xs text-rose-700">
                        Purge must not exceed this duration
                      </p>
                    </div>
                    
                    <Stopwatch
                      presetTime={purgeCalcResults.maximumPurgeTimeSeconds || 0}
                      onComplete={() => {
                        setPurgeTimerComplete(true);
                        toast({
                          title: "⏰ Maximum Purge Time Reached",
                          description: "Stop purging and take gas content readings",
                          variant: "destructive"
                        });
                      }}
                      className="bg-rose-50"
                    />
                    
                    <div className="text-center text-sm text-rose-700 mt-2">
                      Start the timer when beginning the purge operation
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Purge Direction Selection */}
            {purgeCalcResults && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Purge Direction</h3>
                <RadioGroup value={purgeDirection} onValueChange={(value: "air-to-gas" | "gas-to-air") => setPurgeDirection(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="air-to-gas" id="air-to-gas" />
                    <Label htmlFor="air-to-gas">Air to Gas (Final gas content must be ≤ 1.8%)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="gas-to-air" id="gas-to-air" />
                    <Label htmlFor="gas-to-air">Gas to Air (Final gas content must be ≥ 90%)</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Actual Readings */}
            {purgeCalcResults && purgeDirection && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Actual Readings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="actualFlowRate">Actual Flow Rate (m³/hr)</Label>
                    <Input
                      id="actualFlowRate"
                      type="number"
                      step="0.1"
                      placeholder="Enter actual flow rate"
                      value={actualFlowRate}
                      onChange={(e) => setActualFlowRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be ≥ {purgeCalcResults?.minimumFlowRate || 0} m³/hr
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actualGasContent">Final Gas Content (%)</Label>
                    <Input
                      id="actualGasContent"
                      type="number"
                      step="0.1"
                      placeholder="Enter final gas percentage"
                      value={actualGasContent}
                      onChange={(e) => setActualGasContent(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {purgeDirection === "air-to-gas" 
                        ? "Must be ≤ 1.8% for air to gas purging"
                        : "Must be ≥ 90% for gas to air purging"
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
            </div>
          </CardContent>
        </Card>
      </div>
    );

  const _renderStrengthSection = () => (
    <Card data-auto-scroll="true">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            Strength Test
          </div>
          {strengthResult && (
            <Badge className={strengthResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
              {strengthResult.result}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStep === "strength-setup" && renderStrengthSetup()}
        {currentStep === "strength-timer" && renderStrengthTimer()}
        {currentStep === "strength-reading" && renderStrengthReading()}
        {currentStep === "strength-result" && renderStrengthResult()}
        
        {/* Show completed strength result if test is done */}
        {strengthResult && currentStep !== "strength-result" && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">STP:</span>
              <span>{strengthResult.details.stp.toFixed(1)} mbar</span>
              <span className="text-muted-foreground">Max Drop:</span>
              <span>{strengthResult.details.maxDrop.toFixed(1)} mbar</span>
              <span className="text-muted-foreground">Actual Drop:</span>
              <span className={strengthResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                {strengthResult.details.actualDrop.toFixed(1)} mbar
              </span>
              <span className="text-muted-foreground">Result:</span>
              <span className={strengthResult.result === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {strengthResult.result}
              </span>
            </div>
            
            {/* Export buttons for completed strength test */}
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => exportSingleResult('strength', strengthResult)}
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <FileDown className="w-4 h-4" />
                Export Strength Test
              </Button>
              
              {completedTests.includes('tightness') && (
                <Button
                  onClick={() => exportCombinedResults(['strength', 'tightness'])}
                  className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                >
                  <FileDown className="w-4 h-4" />
                  Export Both Tests
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const _renderTightnessSection = () => (
    <Card data-auto-scroll="true">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            Tightness Test (with Let-by)
          </div>
          {tightnessResult && (
            <Badge className={tightnessResult.result === 'PASS' ? 'bg-green-600' : 'bg-red-600'}>
              {tightnessResult.result}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStep === "tightness-setup" && renderTightnessSetup()}
        {currentStep === "let-by-timer" && renderLetByTimer()}
        {currentStep === "let-by-reading" && renderLetByReading()}
        {currentStep === "tightness-timer" && renderTightnessTimer()}
        {currentStep === "tightness-reading" && renderTightnessReading()}
        {currentStep === "tightness-result" && renderTightnessResult()}
        
        {/* Show completed tightness result if test is done */}
        {tightnessResult && currentStep !== "tightness-result" && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Room Volume:</span>
              <span>{tightnessResult.details.roomVolume.toFixed(1)} m³</span>
              <span className="text-muted-foreground">Installation Volume:</span>
              <span>{tightnessResult.details.installationVolume.toFixed(4)} m³</span>
              <span className="text-muted-foreground">Max Drop:</span>
              <span>{tightnessResult.details.maxDrop.toFixed(1)} mbar</span>
              <span className="text-muted-foreground">Actual Drop:</span>
              <span className={tightnessResult.result === 'PASS' ? 'text-blue-600' : 'text-red-600'}>
                {tightnessResult.details.actualDrop.toFixed(1)} mbar
              </span>
              <span className="text-muted-foreground">Result:</span>
              <span className={tightnessResult.result === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {tightnessResult.result}
              </span>
            </div>
            
            {letByResult && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-sm font-semibold text-blue-800 mb-1">Let-by Test:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Pressure Change:</span>
                  <span className={letByResult.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                    {letByResult.details.pressureDrop.toFixed(1)} mbar
                  </span>
                  <span className="text-muted-foreground">Duration:</span>
                  <span>{letByResult.details.testDuration.toFixed(0)} minutes</span>
                  <span className="text-muted-foreground">Result:</span>
                  <span className={letByResult.result === 'PASS' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {letByResult.result}
                  </span>
                </div>
              </div>
            )}
            
            {/* Export buttons for completed tightness test */}
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => exportSingleResult('tightness', tightnessResult)}
                className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <FileDown className="w-4 h-4" />
                Export Tightness Test
              </Button>
              
              {completedTests.includes('strength') && (
                <Button
                  onClick={() => exportCombinedResults(['strength', 'tightness'])}
                  className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                >
                  <FileDown className="w-4 h-4" />
                  Export Both Tests
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderIVLimitCheck = () => {
    if (!ivBreakdown) return null;
    const isOverLimit = ivBreakdown.totalIV > 1.0;
    
    if (!isOverLimit) return null;
    
    return (
      <Card className="bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Installation Volume Exceeds Commercial Limit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-red-100 border border-red-200 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <span className="font-semibold text-red-800">Current Installation Volume:</span>
              <span className="font-bold text-red-900">{ivBreakdown.totalIV.toFixed(4)} m³</span>
              <span className="font-semibold text-red-800">Commercial Limit:</span>
              <span className="font-bold text-red-900">1.000 m³</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <p className="text-sm text-red-700 font-semibold">
              ⚠️ This installation exceeds the 1 m³ volume limit for commercial testing.
            </p>
            <p className="text-sm text-red-600">
              For installations above 1 m³, you must use the <strong>Industrial Calculator</strong> 
              which follows different testing protocols and standards.
            </p>
          </div>
          
          <div className="flex gap-3">
            <Link href="/industrial-calculator">
              <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 border-b-4 border-green-800 hover:border-green-900 rounded-lg">
                <Building className="w-4 h-4" />
                Switch to Industrial Calculator
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                // Reset pipes to allow user to reconfigure
                setPipes([]);
                toast({
                  title: "Configuration Reset",
                  description: "Reduce pipe sizes or lengths to stay under 1 m³ limit",
                });
              }}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Reconfigure Installation
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        {currentStep === "job-details" && renderJobDetails()}
        {currentStep === "installation-type" && renderInstallationTypeSelection()}
        {currentStep === "test-selection" && renderTestSelection()}
        {currentStep === "strength-setup" && renderStrengthSetup()}
        {currentStep === "strength-timer" && renderStrengthTimer()}
        {currentStep === "strength-reading" && renderStrengthReading()}
        {currentStep === "strength-result" && renderStrengthResult()}
        {currentStep === "tightness-setup" && renderTightnessSetup()}
        {currentStep === "tightness-config" && renderTightnessSetup()}
        {currentStep === "let-by-timer" && renderLetByTimer()}
        {currentStep === "let-by-reading" && renderLetByReading()}
        {currentStep === "tightness-timer" && renderTightnessTimer()}
        {currentStep === "tightness-reading" && renderTightnessReading()}
        {currentStep === "tightness-result" && renderTightnessResult()}
        {currentStep === "purge-selection" && renderPurgeSelection()}
        {currentStep === "purge-setup" && renderPurgeSetup()}
      </div>
    </div>
  );
}