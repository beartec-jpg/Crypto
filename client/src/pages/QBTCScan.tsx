import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Search, Activity, Blocks, Gauge, Clock3, AlertTriangle, ExternalLink } from 'lucide-react';

interface ScanStats {
  network?: string;
  blocks?: number;
  headers?: number;
  difficulty?: number;
  verificationProgress?: number;
  mempoolTx?: number;
  mempoolBytes?: number;
  networkHashPs?: number;
}

interface ScanResponse {
  type: 'address' | 'transaction' | 'block';
  query: string;
  result: any;
  error?: string;
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

export default function QBTCScanPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [stats, setStats] = useState<ScanStats>({});

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

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 15000);
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
              <p className="font-semibold">{stats.difficulty ?? '...'}</p>
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
