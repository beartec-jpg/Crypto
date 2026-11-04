export const TECHNICAL_SCENARIO_DISCLAIMER =
  'General technical analysis for information only, not financial advice or a recommendation. Not tailored to your circumstances. Crypto is high risk; do your own research.';

export function TechnicalScenarioDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-500 ${className}`} data-testid="technical-scenario-disclaimer">
      {TECHNICAL_SCENARIO_DISCLAIMER}
    </p>
  );
}
