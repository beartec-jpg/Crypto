import { cn } from '@/lib/utils';

const INDICATOR_ABBREVS: Record<string, string> = {
  trendStrength: 'PTS',
  secondaryTrendStrength: 'STS',
  counterTrend: 'CTW',
  inducementSequence: 'IND',
};

export interface ReadOnlyIndicator {
  id: string;
  fullName: string;
  value?: string;
  score: number;
  met: boolean;
}

interface CompactIndicatorRowProps {
  conditions: ReadOnlyIndicator[];
}

function getIndicatorColorClass(id: string, met: boolean): string {
  if (id === 'counterTrend') {
    // met = counter-trend active (warning)
    return met ? 'text-orange-400' : 'text-green-400';
  }
  return met ? 'text-green-400' : 'text-slate-400';
}

export function CompactIndicatorRow({ conditions }: CompactIndicatorRowProps) {
  if (conditions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5 bg-slate-800/50 rounded border border-slate-700/40">
      {conditions.map((indicator, i) => {
        const abbr = INDICATOR_ABBREVS[indicator.id] ?? indicator.id.toUpperCase();
        const colorClass = getIndicatorColorClass(indicator.id, indicator.met);
        const displayValue = indicator.value ?? '—';

        return (
          <div key={indicator.id} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="text-slate-600 text-[10px] mr-1" aria-hidden="true">│</span>
            )}
            <abbr
              title={indicator.fullName}
              className="no-underline cursor-help"
            >
              <span className="text-[10px] text-slate-400 font-semibold">{abbr}</span>
            </abbr>
            <span className={cn('text-[10px] font-mono ml-0.5', colorClass)}>
              {displayValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}
