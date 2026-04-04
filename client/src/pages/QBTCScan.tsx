import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Search, Activity, Blocks, Gauge, Clock3, AlertTriangle, ExternalLink, Wifi, GitFork, Zap, Timer, Coins, Hash, HardDrive, Database, Shield, Network, Server } from 'lucide-react';

interface ScanStats {
  network?: string;
  blocks?: number;
  headers?: number;
  difficulty?: number;
  verificationProgress?: number;
  mempoolTx?: number;
  mempoolBytes?: number;
  networkHashPs?: number;
  // Network health
  peers?: number | null;
  uptime?: number | null;
  txCount?: number | null;
  txRate?: number | null;
  // Chain info
  circulatingSupply?: string | null;
  utxoCount?: number | null;
  // Protocol
  dagTips?: number | null;
  ghostdagK?: number | null;
  pqcActive?: boolean | null;
  dagMode?: boolean | null;
  chainSizeBytes?: number | null;
  chainwork?: string | null;
  nodeVersion?: string | null;
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

export default function QBTCScanPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [stats, setStats] = useState<ScanStats>({});
  const [overview, setOverview] = useState<ScanOverview>({});
  const isRefreshingRef = useRef(false);

  const hasQuery = useMemo(() => query.trim().length > 0, [query]);

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

  const onSearch = async () => {
    const q = query.trim();
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
    } catch {
      setError('Unable to reach QBTC scan endpoint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-25">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-blue-500 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/qbtc-faucet">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              Back to Faucet
            </button>
          </Link>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap justify-end">
            <Link href="/qbtc">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                QBTC Info
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
          <p className="text-slate-300 mb-6">Search transactions, addresses, blocks, and monitor live QBTC performance stats.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Blocks className="w-3.5 h-3.5" /> Blocks</p>
              <p className="font-semibold">{stats.blocks ?? '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Difficulty</p>
              <p className="font-semibold">{stats.difficulty != null ? Number(stats.difficulty.toFixed(10)) : '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> Hash Rate</p>
              <p className="font-semibold">{formatHashrate(stats.networkHashPs)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> Mempool Tx</p>
              <p className="font-semibold">{stats.mempoolTx ?? '...'}</p>
            </div>
          </div>

          {/* Network Health */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Wifi className="w-3.5 h-3.5" /> Peers</p>
              <p className="font-semibold">{stats.peers ?? '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><GitFork className="w-3.5 h-3.5" /> DAG Tips</p>
              <p className="font-semibold">{stats.dagTips ?? '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Tx/sec</p>
              <p className="font-semibold">{stats.txRate != null ? stats.txRate.toFixed(2) : '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Uptime</p>
              <p className="font-semibold">{formatUptime(stats.uptime)}</p>
            </div>
          </div>

          {/* Chain Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> Supply</p>
              <p className="font-semibold">{formatSupply(stats.circulatingSupply)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Total Txs</p>
              <p className="font-semibold">{formatNumber(stats.txCount)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Chain Size</p>
              <p className="font-semibold">{formatChainSize(stats.chainSizeBytes)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400 flex items-center gap-1"><Database className="w-3.5 h-3.5" /> UTXO Set</p>
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
                      onClick={() => setQuery(block.hash)}
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
                      onClick={() => setQuery(txid)}
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
              <pre className="text-xs overflow-auto max-h-[420px] p-3 rounded bg-slate-900 border border-slate-800">
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
