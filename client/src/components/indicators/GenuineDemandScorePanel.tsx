import { useState } from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle, ChevronDown, ChevronUp, Bug } from 'lucide-react';
import type { Candle, CVDDataItem } from '@/types/chart';
import { useGenuineDemandScore } from '@/hooks/indicators/useGenuineDemandScore';
import type { GDSExternalMetrics } from '@/lib/indicators/genuineDemandScore';

interface GenuineDemandScorePanelProps {
  candles: Candle[];
  cvdData: CVDDataItem[];
  externalMetrics?: GDSExternalMetrics;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-emerald-400';
  if (score >= 40) return 'text-yellow-400';
  if (score >= 20) return 'text-orange-400';
  return 'text-red-400';
}

function getRingColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#4ade80';
  if (score >= 40) return '#facc15';
  if (score >= 20) return '#fb923c';
  return '#ef4444';
}

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="h-14 rounded-md bg-slate-800 border border-slate-700" />;
  }

  const width = 260;
  const height = 56;
  const minValue = Math.min(...points, 0);
  const maxValue = Math.max(...points, 100);
  const range = Math.max(1, maxValue - minValue);

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const normalized = (point - minValue) / range;
      const y = height - normalized * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const latest = points[points.length - 1];

  return (
    <div className="h-14 rounded-md border border-slate-700 bg-slate-800/70 p-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <path d={path} fill="none" stroke={getRingColor(latest)} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function GenuineDemandScorePanel({ candles, cvdData, externalMetrics }: GenuineDemandScorePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const { gds, latestScore, scoreHistory, dataCoverage } = useGenuineDemandScore({
    candles,
    cvdData,
    externalMetrics,
  });

  const scoreValue = Math.round(latestScore);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (clampGauge(scoreValue) / 100) * circumference;

  return (
    <div className="mt-6 bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-white">🔥 Genuine Demand Score (GDS)</h4>
          <p className="text-xs text-slate-400 mt-1">
            Data coverage: {dataCoverage.availableCount}/{dataCoverage.componentCount} components live
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            className="text-slate-300 hover:text-white text-sm inline-flex items-center gap-1 transition-colors"
          >
            Breakdown
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowDebug((previous) => !previous)}
            className="text-slate-400 hover:text-yellow-300 text-sm inline-flex items-center gap-1 transition-colors"
            title="Toggle debug panel"
          >
            <Bug className="h-4 w-4" />
            {showDebug ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="relative w-36 h-36 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={radius} stroke="#334155" strokeWidth="10" fill="none" />
            <circle
              cx="70"
              cy="70"
              r={radius}
              stroke={getRingColor(scoreValue)}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold ${getScoreColor(scoreValue)}`}>{scoreValue}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>

        <div className="flex-1">
          <p className="text-sm text-slate-300">
            {gds.emoji} {gds.verdict}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {gds.flags.fakeBreakoutWarning && (
              <span className="px-2.5 py-1 rounded bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-medium">
                ⚠️ Fake Breakout Warning
              </span>
            )}
            {gds.flags.confirmationStrength && (
              <span className="px-2.5 py-1 rounded bg-green-950/70 border border-green-700/50 text-green-300 text-xs font-medium">
                ✅ Confirmation Strength
              </span>
            )}
            {!gds.flags.fakeBreakoutWarning && !gds.flags.confirmationStrength && (
              <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs">
                Monitoring for full confirmation
              </span>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Recent GDS Trend</p>
            <MiniSparkline points={scoreHistory.slice(-30)} />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-slate-700 pt-4 space-y-2.5">
          {gds.components.map((component) => {
            const pct = component.maxScore > 0 ? (component.score / component.maxScore) * 100 : 0;

            return (
              <div key={component.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {component.isAvailable ? (
                      component.isPositive ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      )
                    ) : (
                      <MinusCircle className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="text-sm text-slate-200">{component.label}</span>
                  </div>

                  <span className="text-xs text-slate-400">
                    {component.score.toFixed(1)} / {component.maxScore}
                  </span>
                </div>

                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, pct))}%`,
                      backgroundColor: component.isAvailable
                        ? component.isPositive
                          ? '#22c55e'
                          : '#ef4444'
                        : '#64748b',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showDebug && (
        <div className="mt-4 border-t border-yellow-700/40 pt-4 space-y-4">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide flex items-center gap-1.5">
            <Bug className="h-3.5 w-3.5" /> Debug Panel
          </p>

          {/* Raw API values */}
          <div>
            <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Raw API Data</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                {
                  label: 'Funding Rate',
                  value: externalMetrics?.fundingRate,
                  format: (v: number) => `${v.toFixed(4)}%`,
                },
                {
                  label: 'Coinbase Premium',
                  value: externalMetrics?.coinbasePremiumPct,
                  format: (v: number) => `${v.toFixed(4)}%`,
                },
                {
                  label: 'OI Change',
                  value: externalMetrics?.openInterestChangePct,
                  format: (v: number) => `${v.toFixed(4)}%`,
                },
              ] as { label: string; value: number | undefined; format: (v: number) => string }[]).map(({ label, value, format }) => (
                <div key={label} className="bg-slate-800/60 rounded p-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 truncate">{label}</span>
                  {typeof value === 'number' ? (
                    <span className="text-xs font-mono text-green-400 shrink-0">{format(value)}</span>
                  ) : (
                    <span className="text-xs font-mono text-red-400 shrink-0">undefined</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scoring breakdown per component */}
          <div>
            <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Scoring Breakdown</p>
            <div className="space-y-2">
              {/* Funding Pressure */}
              <div className="bg-slate-800/60 rounded p-2 space-y-0.5">
                <p className="text-xs font-medium text-slate-200">Funding Pressure (max 20)</p>
                {typeof externalMetrics?.fundingRate !== 'number' ? (
                  <p className="text-xs text-red-400">⛔ No data — fundingRate is undefined</p>
                ) : externalMetrics.fundingRate >= 0 ? (
                  <p className="text-xs text-orange-400">
                    ⚠️ fundingRate = {externalMetrics.fundingRate.toFixed(4)}% — needs &lt; 0 to score
                    <span className="block text-slate-500">Suggestion: rate below −0.01% starts generating score; −0.03% = full 20 pts</span>
                  </p>
                ) : (
                  <p className="text-xs text-green-400">
                    ✅ fundingRate = {externalMetrics.fundingRate.toFixed(4)}% — scoring{' '}
                    {(Math.min(Math.abs(externalMetrics.fundingRate) / 0.03, 1) * 20).toFixed(1)} / 20
                  </p>
                )}
              </div>

              {/* Coinbase Premium */}
              <div className="bg-slate-800/60 rounded p-2 space-y-0.5">
                <p className="text-xs font-medium text-slate-200">Coinbase Premium (max 10)</p>
                {typeof externalMetrics?.coinbasePremiumPct !== 'number' ? (
                  <p className="text-xs text-red-400">⛔ No data — coinbasePremiumPct is undefined</p>
                ) : externalMetrics.coinbasePremiumPct <= 0 ? (
                  <p className="text-xs text-orange-400">
                    ⚠️ premium = {externalMetrics.coinbasePremiumPct.toFixed(4)}% — needs &gt; 0 to score
                    <span className="block text-slate-500">Suggestion: any positive value starts scoring; 0.2% = full 10 pts</span>
                  </p>
                ) : (
                  <p className="text-xs text-green-400">
                    ✅ premium = {externalMetrics.coinbasePremiumPct.toFixed(4)}% — scoring{' '}
                    {(Math.min(externalMetrics.coinbasePremiumPct / 0.2, 1) * 10).toFixed(1)} / 10
                  </p>
                )}
              </div>

              {/* OI Contraction */}
              <div className="bg-slate-800/60 rounded p-2 space-y-0.5">
                <p className="text-xs font-medium text-slate-200">OI Contraction (max 25)</p>
                {typeof externalMetrics?.openInterestChangePct !== 'number' ? (
                  <p className="text-xs text-red-400">⛔ No data — openInterestChangePct is undefined</p>
                ) : externalMetrics.openInterestChangePct >= 0 ? (
                  <p className="text-xs text-orange-400">
                    ⚠️ OI change = {externalMetrics.openInterestChangePct.toFixed(4)}% — needs &lt; 0 (contraction) + price up
                    <span className="block text-slate-500">Suggestion: negative OI change while price rises; −5% = full 25 pts</span>
                  </p>
                ) : (
                  <p className="text-xs text-green-400">
                    ✅ OI change = {externalMetrics.openInterestChangePct.toFixed(4)}% — scoring{' '}
                    {(Math.min(Math.abs(externalMetrics.openInterestChangePct) / 5, 1) * 25).toFixed(1)} / 25 (when price up)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Score summary */}
          <div className="bg-slate-800/60 rounded p-2">
            <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Score Summary</p>
            <p className="text-xs text-slate-300">
              Active weight: {gds.activeWeight} / {gds.totalWeight} &nbsp;·&nbsp; Normalized score:{' '}
              <span className={getScoreColor(scoreValue)}>{scoreValue}</span>
            </p>
            {gds.activeWeight < gds.totalWeight && (
              <p className="text-xs text-slate-500 mt-0.5">
                {gds.totalWeight - gds.activeWeight} pts unavailable (missing external data)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function clampGauge(value: number): number {
  return Math.min(100, Math.max(0, value));
}
