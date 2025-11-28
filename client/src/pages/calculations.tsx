import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calculator, TestTube, Gauge } from "lucide-react";
import { CompliancePanel } from "@/components/CompliancePanel";
import beartecLogo from "@assets/Screenshot_20250823-074823_1755931718570.png";
import beartecFooter from "@assets/Screenshot_20250823-075417_1755932088384.png";

export default function Calculations() {
  return (
    <div className="min-h-screen bg-background">
      {/* Logo Header */}
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

      {/* Navigation Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Calculator
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-primary">Reference & Calculations</h1>
              <p className="text-muted-foreground">Industry standard gas testing formulas and calculation methods</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Compliance Standards */}
        <CompliancePanel results={null} />

        {/* Reference Standards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📚 Reference Standards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-foreground mb-3">Applicable Standards</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-primary mt-0.5 text-xs">🔗</span>
                    <a 
                      href="https://www.igem.org.uk/resource/ige-up-1-edition-2-a-2005-strength-testing-tightness-testing-direct-purging-of-industrial-and-commercial-gas-installations.html" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      IGE/UP/1 Edition 2 +A: 2005 - Reference Standard
                    </a>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-primary mt-0.5 text-xs">🔗</span>
                    <a 
                      href="https://www.igem.org.uk/resource/ige-up-1a-edition-2-a-2005-strength-tightness-testing-purging-of-small-low-pressure-industrial-commercial-installations.html" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      IGE/UP/1A Edition 2 +A: 2005 - Small Installations
                    </a>
                  </li>
                  <li>• BS EN 10255 - Steel tube dimensions</li>
                  <li>• Gas Safety (Installation and Use) Regulations</li>
                  <li>• DSEAR - Dangerous Substances Regulations</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-3">Gas Meter Standards</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• G4/U6: 0.0012 m³ internal, 0.0013 m³ cyclic</li>
                  <li>• U16: 0.006 m³ internal, 0.08 m³ cyclic</li>
                  <li>• U25: 0.008 m³ internal, 0.25 m³ cyclic</li>
                  <li>• U40: 0.015 m³ internal, 0.4 m³ cyclic</li>
                  <li>• U65: 0.023 m³ internal, 0.65 m³ cyclic</li>
                  <li>• U100: 0.04 m³ internal, 1.0 m³ cyclic</li>
                  <li>• U160: 0.08 m³ internal, 1.6 m³ cyclic</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Volume Calculations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Volume Calculations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Pipe Internal Volume</h5>
                <p className="text-sm font-mono mb-1">V = π × (D/2)² × L</p>
                <p className="text-xs text-muted-foreground">Where: D = internal diameter (m), L = length (m)</p>
              </div>
              
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Fittings Volume</h5>
                <p className="text-sm font-mono mb-1">V_fittings = N × 0.001</p>
                <p className="text-xs text-muted-foreground">Where: N = number of fittings (standard 0.001 m³ each)</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Total System Volume</h5>
                <p className="text-sm font-mono mb-1">V_system = V_pipe + V_fittings + V_meter_internal</p>
                <p className="text-xs text-muted-foreground">For testing operations (includes meter internal volume)</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Gas Meter Purge Volume</h5>
                <p className="text-sm font-mono mb-1">V_meter_purge = 5 × V_meter_cyclic</p>
                <p className="text-xs text-muted-foreground">5 times cyclic volume for effective meter purging</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purging Calculations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5" />
              Purging Calculations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Required Purge Volume</h5>
                <p className="text-sm font-mono mb-1">V_purge = (V_pipe + V_fittings) × SF + V_meter_purge</p>
                <p className="text-xs text-muted-foreground">Where: SF = Safety Factor (typically 1.5)</p>
              </div>
              
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Minimum Flow Rate</h5>
                <p className="text-sm font-mono mb-1">Q_min = V_max × 0.25 × 3600</p>
                <p className="text-xs text-muted-foreground">0.25 m/s minimum velocity in largest pipe (m³/h)</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Maximum Purge Time</h5>
                <p className="text-sm font-mono mb-1">T_max = V_purge / Q_min × 60</p>
                <p className="text-xs text-muted-foreground">Time in minutes at minimum flow rate</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Purge Pass Criteria</h5>
                <p className="text-sm mb-1">Gas to Air: &lt;1.8% gas content</p>
                <p className="text-sm mb-1">Air to Gas: ≥90% gas content</p>
                <p className="text-xs text-muted-foreground">Plus achieved flow rate ≥ minimum required</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Testing Calculations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="w-5 h-5" />
              Testing Calculations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Test Duration (TTD) - Type A</h5>
                <p className="text-sm font-mono mb-1">TTD = GRM × IV × F1</p>
                <p className="text-xs text-muted-foreground">Minimum 2 minutes, max 300 seconds applied</p>
              </div>
              
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Test Duration (TTD) - Type B</h5>
                <p className="text-sm font-mono mb-1">TTD = 2.8 × IV × (1/RV) × F1</p>
                <p className="text-xs text-muted-foreground">Where: RV = Room Volume (m³)</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Test Duration (TTD) - Type C</h5>
                <p className="text-sm font-mono mb-1">TTD = 0.047 × GRM × IV × F1</p>
                <p className="text-xs text-muted-foreground">For well-ventilated installations</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Leakage Rate (when drop &gt; GRM)</h5>
                <p className="text-sm font-mono mb-1">LR = (F3 × PD × IV) / TTD_original</p>
                <p className="text-xs text-muted-foreground">Where: PD = Pressure Drop, F3 = medium factor</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Strength Test - Fixed Parameters</h5>
                <p className="text-sm mb-1">Test Duration: 5:00 (fixed)</p>
                <p className="text-sm mb-1">Fail Threshold: &gt;20% pressure drop</p>
                <p className="text-xs text-muted-foreground">Drop % = (Actual Drop / Test Pressure) × 100</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Stabilization Time</h5>
                <p className="text-sm mb-1">MOP &lt;100 mbar: 5 minutes</p>
                <p className="text-sm mb-1">MOP ≥100 mbar: 10 minutes</p>
                <p className="text-xs text-muted-foreground">Based on Maximum Operating Pressure</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Factors and Constants */}
        <Card>
          <CardHeader>
            <CardTitle>Calculation Factors & Constants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Test Medium Factors</h5>
                <p className="text-sm mb-1">F1 (Gas): 42</p>
                <p className="text-sm mb-1">F1 (Air): 67</p>
                <p className="text-sm mb-1">F3 (Gas): 0.059</p>
                <p className="text-sm">F3 (Air): 0.94</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">Gauge Reading Multiplier (GRM)</h5>
                <p className="text-sm mb-1">Electronic Gauge: 0.1</p>
                <p className="text-sm">Water Gauge: 0.5</p>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium text-foreground mb-2">MPLR (m³/hr)</h5>
                <p className="text-sm mb-1">Type A: 0.0014 (New), 0.0028 (Existing)</p>
                <p className="text-sm mb-1">Type B: 0.0056 (New), 0.0084 (Existing)</p>
                <p className="text-sm">Type C: 0.0070 (New), 0.0140 (Existing)</p>
              </div>
            </div>
          </CardContent>
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
              © 2024 Professional Gas Testing Calculator. For use by qualified Gas Safe registered engineers only.
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