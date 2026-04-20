import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Copy, Pickaxe, ShieldCheck } from 'lucide-react';
import QBTCNavigation from '../components/QBTCNavigation';

const POOL_API = '/api/qbtc/pool-stats';

interface PoolStats {
  running?: boolean;
  connected_miners?: number;
  authorized_workers?: number;
  networkHashPs?: number;
  pool_earnings_24h?: number;
  last_template_height?: number;
  pool_router_mode?: string;
  history_24h?: { timestamp?: number; hashrate?: number; shares?: number }[];
}

function isValidQbtcAddress(value: string) {
  return /^qbtc(t|r)?1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i.test(value.trim());
}

function formatHashrate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 H/s';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GH/s`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MH/s`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} kH/s`;
  return `${value.toFixed(0)} H/s`;
}

export default function QBTCMiningPage() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [poolHashrate, setPoolHashrate] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const [browserMinerAddress, setBrowserMinerAddress] = useState('');
  const [browserMinerAlias, setBrowserMinerAlias] = useState('browser1');
  const [browserThreads, setBrowserThreads] = useState(() =>
    typeof navigator === 'undefined' ? 2 : Math.max(1, Math.min(2, navigator.hardwareConcurrency || 2))
  );
  const [browserThrottle, setBrowserThrottle] = useState(30);
  const [browserMining, setBrowserMining] = useState(false);
  const [browserStatus, setBrowserStatus] = useState('Idle');
  const [browserHashrate, setBrowserHashrate] = useState(0);
  const [browserAcceptedShares, setBrowserAcceptedShares] = useState(0);
  const [browserRejectedShares, setBrowserRejectedShares] = useState(0);
  const browserWorkersRef = useRef<Worker[]>([]);
  const browserJobTimerRef = useRef<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [poolRes, networkRes] = await Promise.all([
        fetch(POOL_API, { cache: 'no-store' }),
        fetch('/api/qbtc-scan/stats', { cache: 'no-store' }).catch(() => null),
      ]);
      if (!poolRes.ok) return;
      const poolData = await poolRes.json();
      const networkData = networkRes?.ok ? await networkRes.json() : null;
      const data: PoolStats = { ...poolData, networkHashPs: Number(networkData?.networkHashPs ?? 0) };
      setStats(data);
      const recent = (data.history_24h ?? []).slice(-8).map((p) => Number(p.hashrate ?? 0)).filter((v) => v > 0);
      setPoolHashrate(recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = window.setInterval(fetchStats, 15000);
    return () => window.clearInterval(id);
  }, [fetchStats]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const browserThreadCap = useMemo(() =>
    typeof navigator === 'undefined' ? 2 : Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)), []);

  const stopBrowserMining = useCallback(() => {
    if (browserJobTimerRef.current) { window.clearInterval(browserJobTimerRef.current); browserJobTimerRef.current = null; }
    browserWorkersRef.current.forEach((w) => { w.postMessage({ type: 'stop' }); w.terminate(); });
    browserWorkersRef.current = [];
    setBrowserMining(false);
    setBrowserStatus('Stopped');
  }, []);

  const fetchBrowserJob = useCallback(async () => {
    const address = browserMinerAddress.trim();
    if (!isValidQbtcAddress(address)) throw new Error('Enter a valid QBTC payout address');
    const alias = (browserMinerAlias.trim() || 'browser1').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'browser1';
    const res = await fetch(
      `${POOL_API.replace('pool-stats', 'browser-miner')}?action=job&address=${encodeURIComponent(address)}&worker=${encodeURIComponent(alias)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'Unable to fetch browser mining job');
    return {
      worker_name: data.worker_name,
      extranonce1: data.extranonce1 || data.subscription_id,
      extranonce2_size: Number(data.extranonce2_size ?? 4),
      share_difficulty: Number(data.share_difficulty ?? 0.000001),
      pool_tier: String(data.pool_tier || 'home'),
      job: data.job,
    };
  }, [browserMinerAddress, browserMinerAlias]);

  const submitBrowserShare = useCallback(async (payload: Record<string, string>) => {
    try {
      const res = await fetch(`${POOL_API.replace('pool-stats', 'browser-miner')}?action=submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.ok) {
        setBrowserAcceptedShares((v) => v + 1);
        setBrowserStatus(`Mining in ${data.pool_tier || 'home'} lane`);
        fetchStats();
      } else {
        setBrowserRejectedShares((v) => v + 1);
        setBrowserStatus(`Share ${data?.reason || 'rejected'}`);
      }
    } catch {
      setBrowserRejectedShares((v) => v + 1);
      setBrowserStatus('Share submit retrying…');
    }
  }, [fetchStats]);

  const startBrowserMining = useCallback(async () => {
    try {
      if (typeof Worker === 'undefined') throw new Error('This browser does not support Web Workers');
      if (!window.isSecureContext && window.location.hostname !== 'localhost') throw new Error('Browser mining requires HTTPS');
      stopBrowserMining();
      setBrowserStatus('Requesting browser mining job…');
      setBrowserAcceptedShares(0);
      setBrowserRejectedShares(0);
      setBrowserHashrate(0);
      const config = await fetchBrowserJob();
      const count = Math.max(1, Math.min(browserThreads, browserThreadCap));
      const nextWorkers = Array.from({ length: count }, () => new Worker('/qbtc-browser-miner-worker.js'));
      nextWorkers.forEach((w) => {
        w.onmessage = (e) => {
          const { type, payload } = e.data || {};
          if (type === 'stats') setBrowserHashrate((v) => v > 0 ? v * 0.6 + Number(payload?.hashrate ?? 0) * 0.4 : Number(payload?.hashrate ?? 0));
          if (type === 'share') void submitBrowserShare(payload);
        };
        w.postMessage({ type: 'start', payload: { ...config, throttleMs: browserThrottle } });
      });
      browserWorkersRef.current = nextWorkers;
      browserJobTimerRef.current = window.setInterval(async () => {
        try {
          const nextJob = await fetchBrowserJob();
          browserWorkersRef.current.forEach((w) => w.postMessage({ type: 'job', payload: { ...nextJob, throttleMs: browserThrottle } }));
        } catch { setBrowserStatus('Waiting for the next job…'); }
      }, 15000);
      setBrowserMining(true);
      setBrowserStatus(`Mining in ${config.pool_tier || 'home'} lane`);
    } catch (err: any) {
      setBrowserMining(false);
      setBrowserStatus(err?.message || 'Unable to start browser miner');
    }
  }, [browserThrottle, browserThreadCap, browserThreads, fetchBrowserJob, stopBrowserMining, submitBrowserShare]);

  useEffect(() => () => stopBrowserMining(), [stopBrowserMining]);

  const stratumUrl = 'stratum+tcp://89.167.109.241:3333';
  const cpuminerCommand = `minerd -a sha256d -o ${stratumUrl} -u YOUR_QBTC_ADDRESS.worker1 -p x`;
  const networkHashPs = Number(stats?.networkHashPs ?? 0);
  const earnings24h = Number(stats?.pool_earnings_24h ?? 0);
  const workerCount = Number(stats?.authorized_workers ?? 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-500 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-10 pb-28 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              ← Back to BearTec
            </button>
          </Link>
          <span className="text-xs px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
            BearTec Pool Beta
          </span>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Pickaxe className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">QBTC Mining</h1>
              <p className="text-slate-400 text-sm">Public mining pool — home CPU, GPU, and ASIC welcome.</p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Pool status</p>
              <p className={`font-semibold ${loading ? 'text-slate-400' : stats?.running ? 'text-emerald-300' : 'text-amber-300'}`}>
                {loading ? 'Loading…' : stats?.running ? 'Live' : 'Offline'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Pool hash rate</p>
              <p className="font-semibold text-violet-300">{formatHashrate(poolHashrate)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Network hash rate</p>
              <p className="font-semibold text-cyan-300">{formatHashrate(networkHashPs)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400 text-xs mb-1">24 hr QBTC earned</p>
              <p className="font-semibold text-amber-300">{earnings24h.toFixed(4)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Workers</p>
              <p className="font-semibold text-slate-100">{workerCount}</p>
            </div>
          </div>

          {/* Setup instructions */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              Connect your miner
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-300">
              <div className="space-y-1">
                <p><span className="text-slate-400">Host:</span> 89.167.109.241</p>
                <p><span className="text-slate-400">Port:</span> 3333</p>
                <p><span className="text-slate-400">Algorithm:</span> SHA-256d</p>
                <p><span className="text-slate-400">Mode:</span> {stats?.pool_router_mode || 'smart-gateway'}</p>
                <p><span className="text-slate-400">Block height:</span> {stats?.last_template_height ?? '—'}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Username format</p>
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-cyan-300">
                    YOUR_QBTC_ADDRESS.worker1
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Password</p>
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300">
                    x <span className="text-slate-500 ml-3">(or: home · gpu · pro to pin a lane)</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-slate-400 text-xs">Example cpuminer command</p>
                <button
                  onClick={() => copyText('command', cpuminerCommand)}
                  className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-cyan-400 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copied === 'command' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="font-mono text-[11px] text-amber-300 break-all">{cpuminerCommand}</p>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <p>• <span className="text-slate-300">Home CPU lane</span> — low-power CPUs and browser miners. Password: <code className="text-amber-300">home</code></p>
              <p>• <span className="text-slate-300">Open GPU lane</span> — consumer GPUs. Password: <code className="text-amber-300">gpu</code></p>
              <p>• <span className="text-slate-300">Pro / ASIC lane</span> — high-performance hardware. Password: <code className="text-amber-300">pro</code></p>
              <p>• Leave password as <code className="text-amber-300">x</code> to auto-route by observed hash rate.</p>
            </div>
          </div>

          {/* Browser miner */}
          <div className="rounded-xl border border-cyan-500/30 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Pickaxe className="w-4 h-4" />
                One-click browser CPU miner
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                Home lane • no install
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Enter a QBTC payout address and start mining directly in this browser. Routes into the home lane automatically — no software needed.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  value={browserMinerAddress}
                  onChange={(e) => setBrowserMinerAddress(e.target.value)}
                  placeholder="qbtct1… your payout address"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={browserMinerAlias}
                    onChange={(e) => setBrowserMinerAlias(e.target.value)}
                    placeholder="browser1"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                  <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 flex items-center justify-between">
                    <span>Threads</span>
                    <select
                      value={browserThreads}
                      onChange={(e) => setBrowserThreads(Number(e.target.value))}
                      className="bg-transparent text-cyan-300 focus:outline-none"
                    >
                      {Array.from({ length: browserThreadCap }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n} className="bg-slate-900 text-slate-100">{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>CPU throttle</span>
                    <span>{browserThrottle} ms pause</span>
                  </div>
                  <input
                    type="range" min={0} max={200} step={5}
                    value={browserThrottle}
                    onChange={(e) => setBrowserThrottle(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <p className="text-[11px] text-slate-500">Lower pause = more hashing = more CPU usage.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => void startBrowserMining()}
                    disabled={browserMining}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors disabled:opacity-60"
                  >
                    {browserMining ? 'Mining…' : 'Start mining'}
                  </button>
                  <button
                    onClick={stopBrowserMining}
                    disabled={!browserMining}
                    className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:border-rose-400 transition-colors disabled:opacity-60"
                  >
                    Stop
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400">Local hash rate</p>
                  <p className="font-semibold text-violet-300">{formatHashrate(browserHashrate)}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400">Status</p>
                  <p className="font-semibold text-cyan-300 text-xs">{browserStatus}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400">Accepted</p>
                  <p className="font-semibold text-emerald-300">{browserAcceptedShares}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400">Rejected</p>
                  <p className="font-semibold text-rose-300">{browserRejectedShares}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400 mb-1">Worker name</p>
                  <p className="font-mono text-[11px] text-amber-300 break-all">
                    {(browserMinerAddress.trim() || 'qbtct1…')}.{(browserMinerAlias.trim() || 'browser1').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'browser1'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <QBTCNavigation />
    </div>
  );
}
