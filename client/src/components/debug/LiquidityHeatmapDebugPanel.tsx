import { useState } from 'react';
import type { LiquidityHeatmapData, LiquidityHeatmapSettings, CoinglassRange } from '@/types/liquidityHeatmap';
import type { LiquidityHeatmapDebugInfo } from '@/hooks/useLiquidityHeatmapData';
import type { EndpointDiagnostic } from '@/services/predictiveLiquidationApi';

interface LiquidityHeatmapDebugPanelProps {
  data: LiquidityHeatmapData | null;
  isLoading: boolean;
  error: string | null;
  effectiveRange: CoinglassRange;
  settings: LiquidityHeatmapSettings;
  symbol: string;
  debugInfo: LiquidityHeatmapDebugInfo;
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
}: LiquidityHeatmapDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const longLevels = data?.levels.filter((l) => l.side === 'long') ?? [];
  const shortLevels = data?.levels.filter((l) => l.side === 'short') ?? [];

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
      style={{ maxWidth: 320 }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-2 py-1 rounded-t bg-slate-900/90 border border-slate-600 text-slate-200 hover:bg-slate-800/90 transition-colors"
        title={collapsed ? 'Expand debug panel' : 'Collapse debug panel'}
      >
        <span className="font-semibold">🔧 LH Debug</span>
        <span className="text-slate-400">{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="bg-slate-900/90 border border-t-0 border-slate-600 rounded-b px-2 py-1 space-y-2">
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
                {data.maxLongPrice > 0 && (
                  <Row label="Max Long @" value={`$${data.maxLongPrice.toLocaleString()}`} valueClass="text-red-400" />
                )}
                {data.maxShortPrice > 0 && (
                  <Row label="Max Short @" value={`$${data.maxShortPrice.toLocaleString()}`} valueClass="text-green-400" />
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
            <Row label="Cache Warm" value={debugInfo.stats.cacheWarm ? 'Yes' : 'No'} />
          </section>

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
  return (
    <section>
      <p className="text-slate-500 uppercase tracking-wide mb-0.5">Endpoint Health</p>
      <div className="space-y-0.5">
        {diagnostics.map((d, i) => {
          const isSlow = d.ms > 3000;
          const icon = !d.ok ? '❌' : isSlow ? '⚠️' : '✅';
          const msColor = isSlow ? 'text-yellow-400' : d.ok ? 'text-slate-400' : 'text-red-400';
          const nameColor = d.ok ? 'text-slate-200' : 'text-red-400';
          const msText = d.ms > 0 ? `${d.ms}ms` : '';
          const countText = d.dataPoints !== undefined ? ` (${d.dataPoints})` : '';
          const errorText = !d.ok && d.error ? ` ${d.error}` : '';

          return (
            <div key={i} className="flex items-start gap-1 leading-5">
              <span className="shrink-0">{icon}</span>
              <span className={`shrink-0 ${nameColor}`} style={{ minWidth: 120 }}>{d.endpoint}</span>
              <span className="flex-1 text-right truncate">
                {msText && <span className={msColor}>{msText}</span>}
                {countText && <span className="text-slate-400">{countText}</span>}
                {errorText && <span className="text-red-400 ml-1 truncate" title={d.error}>{errorText.length > 20 ? errorText.slice(0, 20) + '…' : errorText}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
