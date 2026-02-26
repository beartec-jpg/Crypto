/**
 * DivergenceBadge
 *
 * Displays a color-coded badge showing how many of the 7 oscillators confirm
 * a divergence signal. Clicking opens a popover listing the confirming indicators.
 *
 * Badge color:
 *   - 5-7 indicators → red   (strong)
 *   - 3-4 indicators → orange (medium)
 *   - 1-2 indicators → yellow (weak)
 */

import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getDivergenceBadgeColor } from '@/lib/calculations/divergenceCalculations';
import type { DivergencePoint } from '@/types/chart.types';

interface DivergenceBadgeProps {
  point: DivergencePoint;
  className?: string;
}

export function DivergenceBadge({ point, className = '' }: DivergenceBadgeProps) {
  const bgColor = getDivergenceBadgeColor(point.count);
  const emoji = point.type === 'bullish' ? '🐂' : '🐻';
  const label = point.type === 'bullish' ? 'Bullish' : 'Bearish';

  const badge = (
    <div
      className={`${bgColor} text-white px-2 py-1 rounded-full text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity ${className}`}
    >
      <div className="flex items-center gap-1">
        <span>{emoji}</span>
        <span>{point.count}</span>
        <span className="text-[10px] opacity-75">/7</span>
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-52 bg-slate-900 border-slate-700 text-white p-3">
        <div className="font-semibold mb-2 text-sm">
          {emoji} {label} Divergence
        </div>
        <div className="text-xs space-y-1">
          {point.indicators.map(ind => (
            <div key={ind} className="flex items-center gap-2">
              <span className={point.type === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                ✓
              </span>
              <span className="text-slate-200">{ind}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-400">
          {point.count} of 7 indicators confirm
        </div>
      </PopoverContent>
    </Popover>
  );
}
