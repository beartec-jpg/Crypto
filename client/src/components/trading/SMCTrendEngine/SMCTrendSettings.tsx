import { Settings2 } from 'lucide-react';

interface SMCTrendSettingsProps {
  className?: string;
}

export function SMCTrendSettings({ className }: SMCTrendSettingsProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <Settings2 className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-medium">SMC Trend Engine Settings</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Uses existing SMC overlays (FVG, OB, BOS/MSS/CHoCH, liquidity, Auto-Fib, divergence) and independent trend scoring.
      </p>
    </div>
  );
}

