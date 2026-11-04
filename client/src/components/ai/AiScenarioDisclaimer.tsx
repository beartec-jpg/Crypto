// Copyright (c) 2026 BEARTEC LTD. All rights reserved.
import { Info } from 'lucide-react';
import { SCENARIO_DISCLAIMER_TEXT } from '@shared/scenarioFraming';
import { cn } from '@/lib/utils';

/** Not-financial-advice notice shown next to every piece of AI output. */
export function AiScenarioDisclaimer({ className }: { className?: string }) {
  return (
    <div
      role="note"
      data-testid="ai-scenario-disclaimer"
      className={cn(
        'flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100',
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{SCENARIO_DISCLAIMER_TEXT}</span>
    </div>
  );
}
