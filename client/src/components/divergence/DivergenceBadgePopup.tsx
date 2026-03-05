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
  const hasSMT = point.smtScore !== undefined && point.smtScore > 0;

  return (
    <div
      ref={ref}
      className="absolute top-16 right-4 z-40 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pr-5">
        <span className={`${bgColor} text-white px-1.5 py-0.5 rounded-full text-xs font-bold`}>
          {emoji} {point.count}
        </span>
        <span className="text-sm font-semibold text-white">{label} Divergence</span>
      </div>

      {/* Confluence summary */}
      <div className="text-xs text-slate-300 mb-3">
        {point.count} of 7 showing {label.toLowerCase()} divergence
      </div>

      {/* SMT Section (if present) */}
      {hasSMT && (
        <div className="bg-slate-800 border border-yellow-500/30 rounded px-2 py-2 mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-sm font-semibold text-yellow-300">⭐ SMT Divergence</span>
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span>Strength:</span>
              <span className="text-yellow-300 font-semibold">{point.smtScore}/100</span>
            </div>
            {point.smtConfidence !== undefined && (
              <div className="flex justify-between">
                <span>Confidence:</span>
                <span className="text-yellow-300 font-semibold">{point.smtConfidence}/100</span>
              </div>
            )}
            {point.correlationSymbol && (
              <div className="flex justify-between">
                <span>vs.</span>
                <span className="text-yellow-300 font-semibold">{point.correlationSymbol}</span>
              </div>
            )}
            {point.smtTimeSyncScore !== undefined && (
              <div className="flex justify-between">
                <span>Time Sync:</span>
                <span className="text-yellow-300 font-semibold">{point.smtTimeSyncScore}/100</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single-Asset Indicators */}
      <div className="border-t border-slate-700 pt-2 space-y-1">
        <div className="text-xs font-semibold text-slate-400 mb-1">Oscillators</div>
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
