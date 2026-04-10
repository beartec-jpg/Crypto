import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Period = '24h' | '1w' | '1m';

interface DataPoint {
  time: number;
  value: number;
}

interface MetricChartModalProps {
  metric: string;
  metricLabel: string;
  formatter?: (value: number) => string;
  onClose: () => void;
}

const PERIOD_LABELS: Record<Period, string> = {
  '24h': '24h',
  '1w': '1 Week',
  '1m': '1 Month',
};

export default function MetricChartModal({
  metric,
  metricLabel,
  formatter,
  onClose,
}: MetricChartModalProps) {
  const [period, setPeriod] = useState<Period>('24h');
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNote(null);
    try {
      const res = await fetch(`/api/qbtc-scan/history?metric=${encodeURIComponent(metric)}&period=${period}`);
      const json = await res.json();
      setData(json.data ?? []);
      setNote(json.note ?? null);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [metric, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatXAxis = (tick: number) => {
    const date = new Date(tick);
    if (period === '24h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatValue = (value: number) => {
    if (formatter) return formatter(value);
    if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
    if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(2) + 'K';
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-chart-title"
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 transition-colors"
          aria-label="Close chart"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="metric-chart-title" className="text-lg font-semibold text-slate-100 mb-0.5">{metricLabel}</h2>
        <p className="text-xs text-slate-400 mb-4">Historical data from QBTC blockchain</p>

        <div className="flex gap-2 mb-5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="h-64">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Loading…
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm text-center px-4">
              {note ?? 'No historical data available for this metric.'}
            </div>
          ) : data.length === 1 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <span className="text-4xl font-bold text-cyan-400">{formatValue(data[0].value)}</span>
              <span className="text-xs text-slate-400">
                {note ?? 'Live value — historical tracking coming soon.'}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatXAxis}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#475569' }}
                  tickLine={false}
                  minTickGap={48}
                  scale="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatValue}
                  width={72}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => new Date(label as number).toLocaleString()}
                  formatter={(value: any) => [formatValue(value as number), metricLabel]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#22d3ee' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
