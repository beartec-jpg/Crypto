import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle } from "lucide-react";
import type { CalculationResult } from "@shared/schema";

interface CompliancePanelProps {
  results: CalculationResult | null;
}

export function CompliancePanel({ results }: CompliancePanelProps) {
  if (!results) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="text-success mr-2 w-5 h-5" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-center text-muted-foreground">
            <p>No calculations yet</p>
            <p className="text-sm">Complete calculation to check compliance</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { compliance } = results;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <CheckCircle className={`mr-2 w-5 h-5 ${compliance.isCompliant ? 'text-success' : 'text-warning'}`} />
          Compliance Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {compliance.notes.map((note, index) => (
            <div key={index} className="flex items-start space-x-3">
              <CheckCircle className="text-success w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-foreground">{note}</span>
            </div>
          ))}
          
          <div className="flex items-start space-x-3">
            <AlertTriangle className="text-warning w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-foreground">Risk Assessment Required</span>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Next Steps:</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {compliance.nextSteps.map((step, index) => (
              <li key={index}>• {step}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
