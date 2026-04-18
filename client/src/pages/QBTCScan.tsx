import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Search, Activity, Blocks, Gauge, Clock3, AlertTriangle, ExternalLink, Wifi, GitFork, Zap, Timer, Coins, Hash, HardDrive, Database, Shield, Network, Server, BarChart2, ArrowLeftRight, TrendingUp, DollarSign, ShoppingCart, XCircle, Lock, CheckCircle } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MetricChartModal from '../components/MetricChartModal';

interface ScanStats {
  network?: string;
  blocks?: number;
  headers?: number;
  difficulty?: number;
  verificationProgress?: number;
  mempoolTx?: number;
  mempoolBytes?: number;
  networkHashPs?: number;
  lastBlockTime?: number | null;
  // Network health
  peers?: number | null;
  uptime?: number | null;
  txCount?: number | null;
  txRate?: number | null;
  paymentsPerSec?: number | null;
  // Chain info
  circulatingSupply?: string | null;
  utxoCount?: number | null;
  // Protocol
  dagTips?: number | null;
  ghostdagK?: number | null;
  pqcActive?: boolean | null;
  dagMode?: boolean | null;
  pqcAlgorithm?: string | null;
  chainSizeBytes?: number | null;
  chainwork?: string | null;
  nodeVersion?: string | null;
  warnings?: string[] | null;
  warningCount?: number | null;
  // Per-block averages
  avgTxsPerBlock?: number | null;
  avgBlockTime?: number | null;
  avgFee?: number | null;
}

interface ScanResponse {
  type: 'address' | 'transaction' | 'block';
  query: string;
  result: any;
  error?: string;
}

interface OverviewBlock {
  height: number;
  hash: string;
  time?: number;
  txCount?: number;
  size?: number;
}

interface ScanOverview {
  latestBlocks?: OverviewBlock[];
  latestMempoolTxids?: string[];
}

function formatHashrate(value?: number): string {
  if (!value || value <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let v = value;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

function formatUptime(seconds?: number | null): string {
  if (seconds == null) return '...';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNumber(value?: number | null): string {
  if (value == null) return '...';
  return value.toLocaleString();
}

function formatSupply(value?: string | null): string {
  if (value == null) return '...';
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' QBTC';
}

function formatChainSize(bytes?: number | null): string {
  if (bytes == null) return '...';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function stripSlashes(s?: string | null): string {
  if (!s) return '...';
  return s.replace(/^\/|\/$/g, '');
}

function formatBlockTime(seconds?: number | null): string {
  if (seconds == null) return '...';
  return `${seconds.toFixed(1)}s`;
}

function formatFee(satPerVb?: number | null): string {
  if (satPerVb == null) return '...';
  return `${satPerVb} sat/vB`;
}

// ─── Swap / Marketplace stats types ─────────────────────────────────────────

interface SwapStats {
  offers: {
    total: number;
    open: number;
    locked: number;
    matched: number;
    cancelled: number;
    totalQbtcListed: number;
  };
  swaps: {
    total: number;
    completed: number;
    expired: number;
    active: number;
    totalQbtcVolume: number;
    totalUsdcVolume: number;
  };
  priceHistory: Array<{
    time: string;
    type: string;
    pricePerQbtc: number;
    qbtcAmount: number;
    usdcAmount: number;
  }>;
  priceTicks: Array<{
    id: number;
    type: string;
    time: string;
    pricePerQbtc: number;
    qbtcAmount: number;
    usdcAmount: number;
    offerId?: number;
    swapId?: number;
  }>;
  currentAsks: Array<{
    offerId: number;
    pricePerQbtc: number;
    qbtcAmount: number;
    usdcAmount: number;
  }>;
}

const SWAP_API = import.meta.env.VITE_SWAP_API_URL || '';

function TxDataTab() {
  const [stats, setStats] = useState<SwapStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SWAP_API}/api/swap/stats`);
        if (!res.ok) return;
        setStats(await res.json());
      } catch { /* silently fail */ }
      setLoading(false);
    };
    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => clearInterval(id);
  }, []);

  const chartData = useMemo(() => {
    if (!stats?.priceTicks?.length) return [];
    return stats.priceTicks.map((p) => ({
      time: new Date(p.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      fullTime: new Date(p.time).toLocaleString(),
      price: p.pricePerQbtc,
      volume: p.qbtcAmount,
      type: p.type,
    }));
  }, [stats?.priceTicks]);

  const tradeData = useMemo(() => chartData.filter(d => d.type === 'TRADE'), [chartData]);

  const avgAskPrice = useMemo(() => {
    if (!stats?.currentAsks?.length) return null;
    const sum = stats.currentAsks.reduce((a, b) => a + b.pricePerQbtc, 0);
    return sum / stats.currentAsks.length;
  }, [stats?.currentAsks]);

  const latestPrice = useMemo(() => {
    if (tradeData.length > 0) return tradeData[tradeData.length - 1].price;
    if (chartData.length > 0) return chartData[chartData.length - 1].price;
    return avgAskPrice;
  }, [chartData, tradeData, avgAskPrice]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-slate-400 text-center py-10">Unable to load marketplace statistics.</p>;
  }

  const { offers, swaps } = stats;

  return (
    <div className="space-y-6">
      {/* Price Banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">QBTC / USDC Price</p>
            <p className="text-3xl font-bold text-cyan-300">
              {latestPrice != null ? `$${latestPrice.toFixed(4)}` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {tradeData.length > 0 ? 'Last completed trade' : chartData.length > 0 ? 'Latest ask price' : avgAskPrice != null ? 'Avg ask price' : 'No trades yet'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">24h Volume</p>
            <p className="text-lg font-semibold text-slate-200">{swaps.totalQbtcVolume.toLocaleString()} QBTC</p>
            <p className="text-sm text-slate-400">${swaps.totalUsdcVolume.toLocaleString()} USDC</p>
          </div>
        </div>
      </div>

      {/* Price Chart */}
      {(chartData.length > 0 || (stats.currentAsks?.length ?? 0) > 0) && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> QBTC Price History (USDC)
          </h3>
          <div className="flex gap-4 mb-2 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> Trades</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Ask Offers</span>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, _name: string, props: any) => {
                    const type = props?.payload?.type === 'TRADE' ? 'Trade' : 'Ask';
                    return [`$${value.toFixed(4)}`, type];
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime ?? ''}
                />
                <Area type="monotone" dataKey="price" stroke="#94a3b8" strokeWidth={1} fill="url(#priceGradient)"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const isTrade = payload?.type === 'TRADE';
                    return <circle cx={cx} cy={cy} r={isTrade ? 5 : 3} fill={isTrade ? '#22d3ee' : '#f59e0b'} stroke={isTrade ? '#0891b2' : '#d97706'} strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-10 text-slate-500 text-sm">
              <p>No completed trades yet. Current ask prices:</p>
              <div className="flex justify-center gap-3 mt-3 flex-wrap">
                {stats.currentAsks.map((a) => (
                  <span key={a.offerId} className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-amber-300">
                    ${a.pricePerQbtc.toFixed(4)}/QBTC ({a.qbtcAmount} QBTC)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offer Stats */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-cyan-400" /> Marketplace Offers
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
            <p className="text-slate-400 text-xs">Total Offers</p>
            <p className="text-xl font-bold">{offers.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 p-3 bg-emerald-950/20">
            <p className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Open</p>
            <p className="text-xl font-bold text-emerald-300">{offers.open}</p>
          </div>
          <div className="rounded-lg border border-cyan-500/30 p-3 bg-cyan-950/20">
            <p className="text-cyan-400 text-xs flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</p>
            <p className="text-xl font-bold text-cyan-300">{offers.locked}</p>
          </div>
          <div className="rounded-lg border border-blue-500/30 p-3 bg-blue-950/20">
            <p className="text-blue-400 text-xs flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Matched</p>
            <p className="text-xl font-bold text-blue-300">{offers.matched}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 p-3 bg-rose-950/20">
            <p className="text-rose-400 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelled</p>
            <p className="text-xl font-bold text-rose-300">{offers.cancelled}</p>
          </div>
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
            <p className="text-slate-400 text-xs">QBTC Listed</p>
            <p className="text-xl font-bold">{offers.totalQbtcListed.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Swap Stats */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-cyan-400" /> Atomic Swaps
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
            <p className="text-slate-400 text-xs">Total Swaps</p>
            <p className="text-xl font-bold">{swaps.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 p-3 bg-emerald-950/20">
            <p className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</p>
            <p className="text-xl font-bold text-emerald-300">{swaps.completed}</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 p-3 bg-amber-950/20">
            <p className="text-amber-400 text-xs flex items-center gap-1"><Clock3 className="w-3 h-3" /> Active</p>
            <p className="text-xl font-bold text-amber-300">{swaps.active}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 p-3 bg-rose-950/20">
            <p className="text-rose-400 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" /> Expired</p>
            <p className="text-xl font-bold text-rose-300">{swaps.expired}</p>
          </div>
          <div className="rounded-lg border border-cyan-500/30 p-3 bg-cyan-950/20">
            <p className="text-cyan-400 text-xs flex items-center gap-1"><Coins className="w-3 h-3" /> QBTC Vol</p>
            <p className="text-xl font-bold text-cyan-300">{swaps.totalQbtcVolume.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-green-500/30 p-3 bg-green-950/20">
            <p className="text-green-400 text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> USDC Vol</p>
            <p className="text-xl font-bold text-green-300">${swaps.totalUsdcVolume.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Order Book / Current Asks */}
      {stats.currentAsks.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Current Ask Prices
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left py-2 px-3">Price (USDC/QBTC)</th>
                  <th className="text-right py-2 px-3">QBTC Amount</th>
                  <th className="text-right py-2 px-3">USDC Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.currentAsks
                  .sort((a, b) => a.pricePerQbtc - b.pricePerQbtc)
                  .map((ask) => (
                    <tr key={ask.offerId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-amber-300 font-mono">${ask.pricePerQbtc.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right font-mono">{ask.qbtcAmount.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">${ask.usdcAmount.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Completed Trades */}
      {stats.priceHistory.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Recent Completed Trades
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">QBTC</th>
                  <th className="text-right py-2 px-3">USDC</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.priceHistory].reverse().slice(0, 20).map((trade, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400 text-xs">{new Date(trade.time).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-300">${trade.pricePerQbtc.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right font-mono">{trade.qbtcAmount.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">${trade.usdcAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Price Ticks */}
      {stats.priceTicks.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> All Price Activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">QBTC</th>
                  <th className="text-right py-2 px-3">USDC</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.priceTicks].reverse().slice(0, 30).map((tick) => (
                  <tr key={tick.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400 text-xs">{new Date(tick.time).toLocaleString()}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tick.type === 'TRADE' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                        {tick.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-300">${tick.pricePerQbtc.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right font-mono">{tick.qbtcAmount.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">${tick.usdcAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type MetricKey =
  | 'difficulty'
  | 'hashRate'
  | 'mempoolTx'
  | 'mempoolBytes'
  | 'avgFee'
  | 'txsPerBlock'
  | 'blockTime'
  | 'dagTips'
  | 'peers';

interface MetricConfig {
  key: MetricKey;
  label: string;
  formatter?: (v: number) => string;
}

const METRIC_CONFIGS: Record<MetricKey, MetricConfig> = {
  difficulty: { key: 'difficulty', label: 'Difficulty' },
  hashRate: {
    key: 'hashRate',
    label: 'Hash Rate',
    formatter: (v) => {
      const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
      let val = v;
      let i = 0;
      while (val >= 1000 && i < units.length - 1) { val /= 1000; i++; }
      return `${val.toFixed(2)} ${units[i]}`;
    },
  },
  mempoolTx: { key: 'mempoolTx', label: 'Mempool Tx Count' },
  mempoolBytes: {
    key: 'mempoolBytes',
    label: 'Mempool Size (bytes)',
    formatter: (v) => `${(v / 1024).toFixed(1)} KB`,
  },
  avgFee: {
    key: 'avgFee',
    label: 'Avg Fee Rate',
    formatter: (v) => `${v} sat/vB`,
  },
  txsPerBlock: {
    key: 'txsPerBlock',
    label: 'Transactions per Block',
    formatter: (v) => v.toFixed(1),
  },
  blockTime: {
    key: 'blockTime',
    label: 'Block Time (seconds)',
    formatter: (v) => `${v.toFixed(1)}s`,
  },
  dagTips: { key: 'dagTips', label: 'DAG Tip Count' },
  peers: { key: 'peers', label: 'Peer Count' },
};

export default function QBTCScanPage() {
  const [activeTab, setActiveTab] = useState<'chain' | 'tx'>('chain');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [stats, setStats] = useState<ScanStats>({});
  const [overview, setOverview] = useState<ScanOverview>({});
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const isRefreshingRef = useRef(false);

  const hasQuery = useMemo(() => query.trim().length > 0, [query]);

  const openChart = useCallback((metric: MetricKey) => setSelectedMetric(metric), []);
  const closeChart = useCallback(() => setSelectedMetric(null), []);

  const runSearch = useCallback(async (nextQuery?: string) => {
    const q = (nextQuery ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/qbtc-scan/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Search failed');
        return;
      }

      setResult(data);
      setActiveTab('chain');
    } catch {
      setError('Unable to reach QBTC scan endpoint');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const txSummary = useMemo(() => {
    if (result?.type !== 'transaction' || !result.result) return null;

    const tx = result.result;
    const outputs = Array.isArray(tx.vout) ? tx.vout : [];
    const totalOutput = outputs.reduce((sum: number, out: any) => sum + Number(out?.value || 0), 0);
    const compatibility = tx.qbtcCompatibility || {};

    return {
      txid: tx.txid || result.query,
      confirmations: tx.confirmations ?? 0,
      inputs: Array.isArray(tx.vin) ? tx.vin.length : 0,
      outputs: outputs.length,
      totalOutput,
      pqcLabel: compatibility.standard || compatibility.scheme || (compatibility.hybridWitness ? 'Hybrid PQC witness' : 'Standard witness'),
      witnessShape: Array.isArray(compatibility.witnessHexLengths) && compatibility.witnessHexLengths.length > 0
        ? compatibility.witnessHexLengths[0].join(' / ')
        : null,
    };
  }, [result]);

  // Read ?q= from URL and auto-search on mount
  const initialSearchDone = useRef(false);
  useEffect(() => {
    if (initialSearchDone.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q')?.trim();
    if (q) {
      initialSearchDone.current = true;
      setQuery(q);
      setActiveTab('chain');
      void runSearch(q);
    }
  }, [runSearch]);

  // If last block is older than 60 seconds, mining is inactive — zero out live metrics
  const miningInactive = useMemo(() => {
    if (stats.lastBlockTime == null) return false;
    const secondsSinceBlock = Math.floor(Date.now() / 1000) - stats.lastBlockTime;
    return secondsSinceBlock > 60;
  }, [stats.lastBlockTime]);

  const liveHashRate = miningInactive ? 0 : stats.networkHashPs;
  const liveTxRate = miningInactive ? 0 : stats.txRate;
  const livePaymentsPerSec = miningInactive ? 0 : stats.paymentsPerSec;

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/qbtc-scan/stats');
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch {
      // Keep UI usable even when stats endpoint is unavailable.
    }
  };

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/qbtc-scan/overview');
      if (!res.ok) return;
      const data = await res.json();
      setOverview(data);
    } catch {
      // Keep page usable even if overview endpoint is unavailable.
    }
  };

  useEffect(() => {
    const refreshLiveData = async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        await Promise.all([fetchStats(), fetchOverview()]);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    refreshLiveData();
    const id = setInterval(refreshLiveData, 1000);
    return () => clearInterval(id);
  }, []);

  const onSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-25">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-blue-500 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/crypto">
              <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
                ← BearTec
              </button>
            </Link>
            <Link href="/qbtc">
              <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
                ← QBTC
              </button>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap justify-end">
            <Link href="/qbtc-faucet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Faucet
              </button>
            </Link>
            <Link href="/wallet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Wallet
              </button>
            </Link>
            <Link href="/marketplace">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Marketplace
              </button>
            </Link>
            <span>QBTC Testnet Chain Explorer</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 backdrop-blur p-6 md:p-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">QBTC Scan</h1>
          <p className="text-slate-300 mb-4">Search transactions, addresses, blocks, and monitor live QBTC chain, DAG, and PQC status.</p>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-slate-700 pb-0">
            <button
              onClick={() => setActiveTab('chain')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'chain' ? 'bg-slate-800 text-cyan-300 border border-slate-700 border-b-transparent -mb-px' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-1.5"><Blocks className="w-3.5 h-3.5" /> Chain Data</span>
            </button>
            <button
              onClick={() => setActiveTab('tx')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'tx' ? 'bg-slate-800 text-cyan-300 border border-slate-700 border-b-transparent -mb-px' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-1.5"><ArrowLeftRight className="w-3.5 h-3.5" /> Market Data</span>
            </button>
          </div>

          {activeTab === 'tx' ? (
            <TxDataTab />
          ) : (
          <>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Blocks className="w-3.5 h-3.5" aria-hidden="true" /> Blocks</p>
              <p className="font-semibold">{stats.blocks ?? '...'}</p>
            </div>
            <button
              onClick={() => openChart('difficulty')}
              aria-label="View difficulty history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" aria-hidden="true" /> Difficulty <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.difficulty != null ? Number(stats.difficulty.toFixed(10)) : '...'}</p>
            </button>
            <button
              onClick={() => openChart('hashRate')}
              aria-label="View hash rate history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Activity className="w-3.5 h-3.5" aria-hidden="true" /> Hash Rate <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{formatHashrate(liveHashRate)}</p>
            </button>
            <button
              onClick={() => openChart('mempoolTx')}
              aria-label="View mempool transaction count history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> Mempool Tx <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.mempoolTx ?? '...'}</p>
            </button>
          </div>

          {/* Network Health */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 text-sm">
            <button
              onClick={() => openChart('peers')}
              aria-label="View peer count history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Wifi className="w-3.5 h-3.5" aria-hidden="true" /> Peers <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.peers ?? '...'}</p>
            </button>
            <button
              onClick={() => openChart('dagTips')}
              aria-label="View DAG tip count history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><GitFork className="w-3.5 h-3.5" aria-hidden="true" /> DAG Tips <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.dagTips ?? '...'}</p>
            </button>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Zap className="w-3.5 h-3.5" aria-hidden="true" /> Tx/sec</p>
              <p className="font-semibold">{liveTxRate != null ? liveTxRate.toFixed(2) : '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Zap className="w-3.5 h-3.5" aria-hidden="true" /> Payments/sec</p>
              <p className="font-semibold">{livePaymentsPerSec != null ? livePaymentsPerSec.toFixed(1) : '...'}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Total outputs across all txs</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Timer className="w-3.5 h-3.5" aria-hidden="true" /> Uptime</p>
              <p className="font-semibold">{formatUptime(stats.uptime)}</p>
            </div>
          </div>

          {/* Oscillating Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <button
              onClick={() => openChart('mempoolBytes')}
              aria-label="View mempool size in bytes history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Database className="w-3.5 h-3.5" aria-hidden="true" /> Mempool Bytes <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.mempoolBytes != null ? (stats.mempoolBytes / 1024).toFixed(1) + ' KB' : '...'}</p>
            </button>
            <button
              onClick={() => openChart('blockTime')}
              aria-label="View block time history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> Block Time <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{formatBlockTime(stats.avgBlockTime)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Avg · target 10s</p>
            </button>
            <button
              onClick={() => openChart('txsPerBlock')}
              aria-label="View transactions per block history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Activity className="w-3.5 h-3.5" aria-hidden="true" /> Txs/Block <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{stats.avgTxsPerBlock != null ? stats.avgTxsPerBlock.toFixed(1) : '...'}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">50-block avg</p>
            </button>
            <button
              onClick={() => openChart('avgFee')}
              aria-label="View average fee per transaction history chart"
              className="rounded-lg border border-slate-700 p-3 bg-slate-950/60 text-left cursor-pointer hover:border-cyan-500/50 transition-colors group"
            >
              <p className="text-slate-400 flex items-center gap-1"><Coins className="w-3.5 h-3.5" aria-hidden="true" /> Avg Fee <BarChart2 className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" aria-hidden="true" /></p>
              <p className="font-semibold">{formatFee(stats.avgFee)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Latest block</p>
            </button>
          </div>

          {/* Chain Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Coins className="w-3.5 h-3.5" aria-hidden="true" /> Supply</p>
              <p className="font-semibold">{formatSupply(stats.circulatingSupply)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Hash className="w-3.5 h-3.5" aria-hidden="true" /> Total Txs</p>
              <p className="font-semibold">{formatNumber(stats.txCount)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" aria-hidden="true" /> Chain Size</p>
              <p className="font-semibold">{formatChainSize(stats.chainSizeBytes)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Database className="w-3.5 h-3.5" aria-hidden="true" /> UTXO Set</p>
              <p className="font-semibold">{formatNumber(stats.utxoCount)}</p>
            </div>
          </div>

          {/* Protocol Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6 text-xs">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">PQC:</span>
              {stats.pqcActive != null ? (
                <span className={`px-2 py-0.5 rounded-full font-medium ${stats.pqcActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                  {stats.pqcActive ? 'Active' : 'Inactive'}
                </span>
              ) : <span className="text-slate-500">...</span>}
            </span>
            {stats.pqcAlgorithm && (
              <span className="px-2 py-0.5 rounded-full font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {stats.pqcAlgorithm}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Network className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">DAG Mode:</span>
              {stats.dagMode != null ? (
                <span className="px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  GHOSTDAG K={stats.ghostdagK ?? '?'}
                </span>
              ) : <span className="text-slate-500">...</span>}
            </span>
            <span className="flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Node:</span>
              <span className="px-2 py-0.5 rounded-full font-medium bg-slate-700/60 text-slate-300 border border-slate-600">
                {stripSlashes(stats.nodeVersion)}
              </span>
            </span>
            {(stats.warningCount ?? 0) > 0 && (
              <span className="px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {stats.warningCount} warning{stats.warningCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="flex gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search txid, block hash/height, or qbtct1... address"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch();
              }}
            />
            <button
              onClick={onSearch}
              disabled={!hasQuery || loading}
              className="px-5 py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2"><Search className="w-4 h-4" /> {loading ? 'Searching...' : 'Search'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-4">Tip: address search may depend on node index/capabilities. Tx and block search are the most reliable.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold text-cyan-300 mb-3">Latest Blocks</h3>
              {!overview.latestBlocks || overview.latestBlocks.length === 0 ? (
                <p className="text-xs text-slate-400">No block data available.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-auto pr-1">
                  {overview.latestBlocks.slice(0, 10).map((block) => (
                    <button
                      key={block.hash}
                      onClick={() => {
                        setQuery(block.hash);
                        void runSearch(block.hash);
                      }}
                      className="w-full text-left rounded-lg border border-slate-800 p-2 hover:border-cyan-500/50 transition-colors"
                      title="Click to search this block hash"
                    >
                      <p className="text-xs text-slate-300">Height: <span className="text-cyan-300">{block.height}</span> • Tx: {block.txCount ?? 0}</p>
                      <p className="text-[11px] font-mono text-slate-400 truncate">{block.hash}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold text-cyan-300 mb-3">Recent Mempool TXIDs</h3>
              {!overview.latestMempoolTxids || overview.latestMempoolTxids.length === 0 ? (
                <p className="text-xs text-slate-400">No mempool txids available.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-auto pr-1">
                  {overview.latestMempoolTxids.slice(0, 20).map((txid) => (
                    <button
                      key={txid}
                      onClick={() => {
                        setQuery(txid);
                        void runSearch(txid);
                      }}
                      className="w-full text-left rounded-lg border border-slate-800 p-2 hover:border-cyan-500/50 transition-colors"
                      title="Click to search this transaction"
                    >
                      <p className="text-[11px] font-mono text-slate-400 truncate">{txid}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-rose-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-400">Result Type: <span className="text-cyan-300 font-semibold uppercase">{result.type}</span></p>
                {result.type === 'transaction' && result.result?.txid && (
                  <a
                    href={`/api/qbtc-scan/search?q=${encodeURIComponent(result.result.txid)}`}
                    className="text-cyan-300 hover:text-cyan-200 text-xs inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Raw view <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {txSummary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <p className="text-slate-400">Confirmations</p>
                    <p className="font-semibold text-slate-100">{txSummary.confirmations}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <p className="text-slate-400">Inputs / Outputs</p>
                    <p className="font-semibold text-slate-100">{txSummary.inputs} / {txSummary.outputs}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <p className="text-slate-400">Total Output</p>
                    <p className="font-semibold text-slate-100">{txSummary.totalOutput.toFixed(8)} QBTC</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 md:col-span-2">
                    <p className="text-slate-400">PQC Witness</p>
                    <p className="font-semibold text-cyan-300">{txSummary.pqcLabel}</p>
                    {txSummary.witnessShape && <p className="text-[10px] text-slate-500 mt-1">Hex lengths: {txSummary.witnessShape}</p>}
                  </div>
                </div>
              )}
              <pre className="text-xs overflow-auto max-h-[420px] p-3 rounded bg-slate-900 border border-slate-800">
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {selectedMetric && (
        <MetricChartModal
          metric={selectedMetric}
          metricLabel={METRIC_CONFIGS[selectedMetric].label}
          formatter={METRIC_CONFIGS[selectedMetric].formatter}
          onClose={closeChart}
        />
      )}
    </div>
  );
}
