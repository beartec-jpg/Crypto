import { useEffect, useRef } from 'react';
import { getDivergenceBadgeColor } from '@/lib/calculations/divergenceCalculations';
import type { DivergencePoint } from '@/types/chart.types';

interface DivergenceBadgePopupProps {
  point: DivergencePoint;
  onClose: () => void;
}

export function DivergenceBadgePopup({ point, onClose }: DivergenceBadgePopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const bgColor = getDivergenceBadgeColor(point.count);
  const emoji = point.type === 'bullish' ? '🐂' : '🐻';
  const label = point.type === 'bullish' ? 'Bullish' : 'Bearish';

  return (
    <div
      ref={ref}
      className="absolute top-16 right-4 z-40 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pr-5">
        <span className={`${bgColor} text-white px-1.5 py-0.5 rounded-full text-xs font-bold`}>
          {emoji} {point.count}
        </span>
        <span className="text-sm font-semibold text-white">{label} Divergence</span>
      </div>

      {/* Confluence summary */}
      <div className="text-xs text-slate-300 mb-2">
        {point.count} of 7 showing {label.toLowerCase()} divergence
      </div>

      {/* Separator */}
      <div className="border-t border-slate-700 pt-2 space-y-1">
        {point.indicators.map(ind => (
          <div key={ind} className="flex items-center gap-2 text-xs">
            <span className={point.type === 'bullish' ? 'text-green-400' : 'text-red-400'}>
              ✓
            </span>
            <span className="text-slate-200">{ind}</span>
          </div>
        ))}
      </div>

      {/* Close button */}
      <button
        className="absolute top-2 right-2 text-slate-400 hover:text-white text-xs leading-none"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
