import { useState } from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react';
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

      {/* Raw Readings - Always Visible */}
      <div className="mt-4 border-t border-slate-700 pt-4">
        <h5 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          📊 Current Market Readings
        </h5>
        <div className="grid grid-cols-5 gap-3 text-xs">
          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 mb-1">Funding Rate</div>
            <div className={`text-lg font-bold ${
              gds.rawReadings.fundingRate === undefined ? 'text-slate-500' :
              gds.rawReadings.fundingRate < 0 ? 'text-green-400' :
              gds.rawReadings.fundingRate > 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {gds.rawReadings.fundingRate === undefined ? 'N/A' :
               `${(gds.rawReadings.fundingRate * 100).toFixed(4)}%`}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 mb-1">Premium</div>
            <div className={`text-lg font-bold ${
              gds.rawReadings.coinbasePremium === undefined ? 'text-slate-500' :
              gds.rawReadings.coinbasePremium > 0 ? 'text-green-400' :
              gds.rawReadings.coinbasePremium < 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {gds.rawReadings.coinbasePremium === undefined ? 'N/A' :
               `${gds.rawReadings.coinbasePremium.toFixed(3)}%`}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 mb-1">OI Change</div>
            <div className={`text-lg font-bold ${
              gds.rawReadings.oiChange === undefined ? 'text-slate-500' :
              gds.rawReadings.oiChange < 0 ? 'text-green-400' :
              gds.rawReadings.oiChange > 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {gds.rawReadings.oiChange === undefined ? 'N/A' :
               `${gds.rawReadings.oiChange.toFixed(2)}%`}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 mb-1">CVD Delta</div>
            <div className={`text-lg font-bold ${
              gds.rawReadings.cvdDelta === undefined ? 'text-slate-500' :
              gds.rawReadings.cvdDelta > 0 ? 'text-green-400' :
              gds.rawReadings.cvdDelta < 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {gds.rawReadings.cvdDelta === undefined ? 'N/A' :
               (() => {
                 const v = gds.rawReadings.cvdDelta;
                 const abs = Math.abs(v);
                 const sign = v >= 0 ? '+' : '-';
                 if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
                 if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
                 return `${sign}${abs.toFixed(0)}`;
               })()}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded p-2">
            <div className="text-slate-400 mb-1">Price Change</div>
            <div className={`text-lg font-bold ${
              gds.rawReadings.priceChangePct === undefined ? 'text-slate-500' :
              gds.rawReadings.priceChangePct > 0 ? 'text-green-400' :
              gds.rawReadings.priceChangePct < 0 ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {gds.rawReadings.priceChangePct === undefined ? 'N/A' :
               `${gds.rawReadings.priceChangePct >= 0 ? '+' : ''}${gds.rawReadings.priceChangePct.toFixed(2)}%`}
            </div>
          </div>
        </div>
      </div>

      {/* Pattern Analysis - Expandable */}
      {isExpanded && (
        <div className="mt-4 border-t border-slate-700 pt-4">
          <h5 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            {gds.pattern.emoji} Pattern: {gds.pattern.name}
            <span className="text-xs text-slate-400">({gds.pattern.confidence} Confidence)</span>
          </h5>

          <p className="text-sm text-slate-300 mb-4">{gds.pattern.description}</p>

          {gds.pattern.bullishSignals.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-green-400 mb-1">✅ Bullish Signals:</div>
              <ul className="text-xs text-slate-300 space-y-1 ml-4">
                {gds.pattern.bullishSignals.map((signal, i) => (
                  <li key={`bull-${i}-${signal}`}>• {signal}</li>
                ))}
              </ul>
            </div>
          )}

          {gds.pattern.bearishSignals.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-red-400 mb-1">❌ Bearish Signals:</div>
              <ul className="text-xs text-slate-300 space-y-1 ml-4">
                {gds.pattern.bearishSignals.map((signal, i) => (
                  <li key={`bear-${i}-${signal}`}>• {signal}</li>
                ))}
              </ul>
            </div>
          )}

          {gds.pattern.neutralSignals.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-yellow-400 mb-1">⚠️ Neutral Signals:</div>
              <ul className="text-xs text-slate-300 space-y-1 ml-4">
                {gds.pattern.neutralSignals.map((signal, i) => (
                  <li key={`neutral-${i}-${signal}`}>• {signal}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-950/30 border border-blue-700/50 rounded">
            <div className="text-xs font-semibold text-blue-300 mb-1">💡 Recommendation:</div>
            <div className="text-xs text-slate-300">{gds.pattern.recommendation}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function clampGauge(value: number): number {
  return Math.min(100, Math.max(0, value));
}
