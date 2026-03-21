import { useState } from 'react';
import type { LiquidityHeatmapData, LiquidityHeatmapSettings, CoinglassRange } from '@/types/liquidityHeatmap';
import type { LiquidityHeatmapDebugInfo } from '@/hooks/useLiquidityHeatmapData';
import type { EndpointDiagnostic } from '@/services/predictiveLiquidationApi';
import type { PredictedLiquidityPoint, LiquidationZone } from '@/hooks/useLiquidityPivotAnalysis';

interface LiquidityHeatmapDebugPanelProps {
  data: LiquidityHeatmapData | null;
  isLoading: boolean;
  error: string | null;
  effectiveRange: CoinglassRange;
  settings: LiquidityHeatmapSettings;
  symbol: string;
  debugInfo: LiquidityHeatmapDebugInfo;
  liquidityPivotAnalysis?: {
    points: PredictedLiquidityPoint[];
    zones: LiquidationZone[];
    directionBias: 'long' | 'short' | 'neutral';
    confidence: number;
  };
}

function formatValue(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function timeAgo(ts: number | null): string {
  if (ts === null) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function truncateUrl(url: string, maxLen = 50): string {
  if (!url) return '—';
  // Show host + path, strip the base
  try {
    const parsed = new URL(url);
    const short = parsed.pathname + parsed.search;
    return short.length > maxLen ? short.slice(0, maxLen) + '…' : short;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
  }
}

export function LiquidityHeatmapDebugPanel({
  data,
  isLoading,
  error,
  effectiveRange,
  settings,
  symbol,
  debugInfo,
  liquidityPivotAnalysis,
}: LiquidityHeatmapDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  const longLevels = data?.levels.filter((l) => l.side === 'long') ?? [];
  const shortLevels = data?.levels.filter((l) => l.side === 'short') ?? [];
  const primaryTarget = data?.targetLevels?.find((level) => level.type === 'primary') ?? null;
  const secondaryTarget = data?.targetLevels?.find((level) => level.type === 'secondary') ?? null;
  const pressureScore = Number(data?.directionScore ?? debugInfo.stats.directionScore ?? 50);
  const pressureLabel = pressureScore >= 50
    ? `${pressureScore.toFixed(1)} LONG pressure`
    : `${(100 - pressureScore).toFixed(1)} SHORT pressure`;
  const isFallbackPressure = !data?.targetLevels?.length || !Number.isFinite(Number(data?.directionScore));

  let statusIcon = '⏳';
  let statusText = 'Loading…';
  if (!isLoading && error) {
    statusIcon = '❌';
    statusText = 'Error';
  } else if (!isLoading && data) {
    statusIcon = '✅';
    statusText = 'Connected';
  } else if (!isLoading && !data && !error) {
    statusIcon = '—';
    statusText = 'No data';
  }

  // Derive API key status from fetch result rather than client-side env var
  let apiKeyStatus: string;
  if (data) {
    apiKeyStatus = '✅ Present';
  } else if (error && (error.toLowerCase().includes('api key') || error.toLowerCase().includes('not configured'))) {
    apiKeyStatus = '❌ Missing';
  } else {
    apiKeyStatus = '⚠️ Unknown';
  }

  return (
    <div
      className="absolute bottom-4 left-4 z-50 text-xs font-mono select-none"
      style={{ width: 360, maxWidth: 'min(360px, 42vw)' }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setCollapsed((c: boolean) => !c)}
        className="w-full flex items-center justify-between px-2 py-1 rounded-t bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800/90 transition-colors"
        title={collapsed ? 'Expand debug panel' : 'Collapse debug panel'}
      >
        <span className="font-semibold">🔧 LH Debug</span>
        <span className="text-slate-400">{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="bg-slate-900/90 border border-t-0 border-slate-600 rounded-b px-2 py-1 space-y-2 max-h-[48vh] overflow-y-auto">
          {/* Connection status */}
          <section>
            <p className="text-slate-500 uppercase tracking-wide mb-0.5">Status</p>
            <Row label="Status" value={`${statusIcon} ${statusText}`} />
            <Row label="API Key" value={apiKeyStatus} />
            <Row label="Source" value={debugInfo.source || '—'} />
            <Row label="Last Request" value={timeAgo(debugInfo.lastRequestTime)} />
            {error && (
              <Row label="Error" value={error} valueClass="text-red-400 break-all" />
            )}
          </section>

          <Divider />

          {/* Request details */}
          <section>
            <p className="text-slate-500 uppercase tracking-wide mb-0.5">Request</p>
            <Row label="Symbol" value={`${symbol} → ${debugInfo.normalizedSymbol || '—'}`} />
            <Row label="Exchange" value="Aggregated" />
            <Row
              label="Range"
              value={`${effectiveRange}${settings.syncToChartTimeframe ? ' (auto)' : ' (manual)'}`}
            />
            <Row
              label="URL"
              value={truncateUrl(debugInfo.lastRequestUrl)}
              valueClass="text-blue-300 break-all"
              title={debugInfo.lastRequestUrl || undefined}
            />
          </section>

          <Divider />

          {/* Response stats */}
          <section>
            <p className="text-slate-500 uppercase tracking-wide mb-0.5">Response</p>
            {data ? (
              <>
                <Row
                  label="Levels"
                  value={`${data.levels.length} (${longLevels.length} long, ${shortLevels.length} short)`}
                />
                <Row label="Total Long" value={formatValue(data.totalLongLiquidation)} valueClass="text-red-400" />
                <Row label="Total Short" value={formatValue(data.totalShortLiquidation)} valueClass="text-green-400" />
                <Row label="Pressure" value={pressureLabel} />
                <Row
                  label="Pressure Mode"
                  value={isFallbackPressure ? 'Derived from visible levels' : 'Backend supplied'}
                  valueClass={isFallbackPressure ? 'text-yellow-300' : 'text-slate-200'}
                />
                {data.maxLongPrice > 0 && (
                  <Row label="Max Long @" value={`$${data.maxLongPrice.toLocaleString()}`} valueClass="text-red-400" />
                )}
                {data.maxShortPrice > 0 && (
                  <Row label="Max Short @" value={`$${data.maxShortPrice.toLocaleString()}`} valueClass="text-green-400" />
                )}
                {primaryTarget && (
                  <Row
                    label="Primary Target"
                    value={`${primaryTarget.side.toUpperCase()} @ $${primaryTarget.price.toLocaleString()} (${formatValue(primaryTarget.liquidationValue)})`}
                    valueClass="text-amber-300"
                  />
                )}
                {secondaryTarget && (
                  <Row
                    label="Secondary Target"
                    value={`${secondaryTarget.side.toUpperCase()} @ $${secondaryTarget.price.toLocaleString()} (${formatValue(secondaryTarget.liquidationValue)})`}
                    valueClass="text-teal-300"
                  />
                )}
                <Row label="Data Age" value={timeAgo(data.lastUpdated)} />
              </>
            ) : (
              <p className="text-slate-400 italic">{isLoading ? 'Fetching…' : 'No data yet'}</p>
            )}
          </section>

          <Divider />

          {/* Source mix details */}
          <section>
            <p className="text-slate-500 uppercase tracking-wide mb-0.5">Source Mix</p>
            <Row label="REST Liqs" value={String(debugInfo.stats.forceOrderCount)} />
            <Row label="Realtime Liqs" value={String(debugInfo.stats.realtimeOrderCount)} />
            <Row label="Merged Liqs" value={String(debugInfo.stats.mergedForceOrderCount)} />
            <Row label="Coinalyze Map" value={String(debugInfo.stats.coinalyzeMapLevels)} />
            <Row
              label="Depth"
              value={`${debugInfo.stats.depthBidLevels} bids / ${debugInfo.stats.depthAskLevels} asks`}
            />
            <Row label="Direction Score" value={`${debugInfo.stats.directionScore.toFixed(1)}`} />
            <Row label="Cache Warm" value={debugInfo.stats.cacheWarm ? 'Yes' : 'No'} />
          </section>

          {liquidityPivotAnalysis && liquidityPivotAnalysis.points.length > 0 && (
            <>
              <Divider />
              <section>
                <p className="text-slate-500 uppercase tracking-wide mb-0.5">Pivot Analysis Predictions</p>
                <Row
                  label="Direction"
                  value={`${liquidityPivotAnalysis.directionBias.toUpperCase()} (${liquidityPivotAnalysis.confidence}% confidence)`}
                  valueClass={
                    liquidityPivotAnalysis.directionBias === 'long' ? 'text-red-400'
                    : liquidityPivotAnalysis.directionBias === 'short' ? 'text-green-400'
                    : 'text-slate-300'
                  }
                />
                <Row label="Top Points" value={String(liquidityPivotAnalysis.points.length)} />
                <Row label="Zones" value={String(liquidityPivotAnalysis.zones.length)} />
                {liquidityPivotAnalysis.points.length > 0 && (
                  <>
                    <p className="text-slate-400 text-[10px] mt-1 mb-1">Top 3 Points:</p>
                    {liquidityPivotAnalysis.points.slice(0, 3).map((point, idx) => (
                      <div key={idx} className="ml-2 text-[10px] text-slate-400 mb-0.5">
                        <span className="text-slate-500">$</span>
                        <span>{point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className="text-slate-600"> — </span>
                        <span className={point.direction === 'long' ? 'text-red-400' : point.direction === 'short' ? 'text-green-400' : 'text-slate-400'}>
                          {point.direction.toUpperCase()}
                        </span>
                        <span className="text-slate-600"> @ </span>
                        <span className="text-amber-300">{point.confidence}%</span>
                      </div>
                    ))}
                  </>
                )}
              </section>
            </>
          )}

          {debugInfo.diagnostics.length > 0 && (
            <>
              <Divider />
              <EndpointHealthSection diagnostics={debugInfo.diagnostics} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small helpers ────────────────────────────────────────────────── */

interface RowProps {
  label: string;
  value: string;
  valueClass?: string;
  title?: string;
}

function Row({ label, value, valueClass = 'text-slate-200', title }: RowProps) {
  return (
    <div className="flex justify-between gap-2 leading-5">
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span className={valueClass} title={title}>{value}</span>
    </div>
  );
}

function Divider() {
  return <hr className="border-slate-700" />;
}

/* ── Endpoint Health Section ──────────────────────────────────────── */

function EndpointHealthSection({ diagnostics }: { diagnostics: EndpointDiagnostic[] }) {
  const optionalFailureCount = diagnostics.filter((d) => d.optional && !d.ok).length;
  const visible = diagnostics;

  return (
    <section>
      <p className="text-slate-500 uppercase tracking-wide mb-0.5">Endpoint Health</p>
      {optionalFailureCount > 0 && (
        <p className="text-[10px] text-yellow-300 mb-1">{optionalFailureCount} optional source probes failed (non-blocking)</p>
      )}
      <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
        {visible.map((d, i) => {
          const isSlow = d.ms > 3000;
          const icon = !d.ok ? (d.optional ? '⚠️' : '❌') : isSlow ? '⚠️' : '✅';
          const msColor = isSlow ? 'text-yellow-400' : d.ok ? 'text-slate-400' : 'text-red-400';
          const nameColor = d.ok ? 'text-slate-200' : (d.optional ? 'text-yellow-300' : 'text-red-400');
          const msText = d.ms > 0 ? `${d.ms}ms` : '';
          const countText = d.dataPoints !== undefined ? ` (${d.dataPoints})` : '';
          const errorText = !d.ok && d.error ? ` ${d.error}` : '';

          return (
            <div key={i} className="flex items-start gap-1 leading-5">
              <span className="shrink-0">{icon}</span>
              <span className={`shrink-0 ${nameColor}`} style={{ minWidth: 130 }}>{d.endpoint}</span>
              <span className="flex-1 text-right truncate">
                {msText && <span className={msColor}>{msText}</span>}
                {countText && <span className="text-slate-400">{countText}</span>}
                {errorText && <span className="text-red-400 ml-1 truncate" title={d.error}>{errorText.length > 20 ? errorText.slice(0, 20) + '…' : errorText}</span>}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && <p className="text-slate-400 italic">No critical endpoint issues</p>}
      </div>
    </section>
  );
}
