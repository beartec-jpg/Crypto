import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  Activity,
  CheckCircle2,
  Coins,
  Copy,
  Lock,
  Pickaxe,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import QBTCNavigation from '../components/QBTCNavigation';

const POOL_API = '/api/qbtc/pool-stats';

interface WorkerInfo {
  worker_name: string;
  payout_address: string;
  last_seen: number;
  accepted_shares: number;
  invalid_shares: number;
  pending_balance: number;
  total_paid: number;
}

interface PoolStats {
  pool_name?: string;
  running?: boolean;
  connected_miners?: number;
  authorized_workers?: number;
  accepted_shares?: number;
  invalid_shares?: number;
  pending_payouts?: number;
  total_paid?: number;
  last_template_height?: number;
  networkHashPs?: number;
  workers?: WorkerInfo[];
}

interface HistoryPoint {
  time: string;
  timestamp: number;
  shares: number;
  workers: number;
  pending: number;
  hashrate: number;
}

function formatLastSeen(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
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
  const { user, isAuthenticated, isLoading: authLoading } = useCryptoAuth();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [payoutAddress, setPayoutAddress] = useState('');
  const [workerAlias, setWorkerAlias] = useState('worker1');
  const [bindMessage, setBindMessage] = useState<string | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const [poolRes, networkRes] = await Promise.all([
        fetch(POOL_API, { cache: 'no-store' }),
        fetch('/api/qbtc-scan/stats', { cache: 'no-store' }).catch(() => null),
      ]);

      if (!poolRes.ok) {
        throw new Error('Pool stats request failed');
      }

      const poolData = await poolRes.json();
      const networkData = networkRes && networkRes.ok ? await networkRes.json() : null;
      const data = {
        ...poolData,
        networkHashPs: Number(networkData?.networkHashPs ?? 0),
      };

      setStats(data);
      setHistory((prev) => {
        const now = Date.now();
        const shares = Number(data.accepted_shares ?? 0);
        const workers = Number(data.authorized_workers ?? 0);
        const pending = Number(data.pending_payouts ?? 0);
        const previous = prev[prev.length - 1];
        const elapsedSeconds = previous ? Math.max((now - previous.timestamp) / 1000, 1) : 15;
        const sharesDelta = previous ? Math.max(shares - previous.shares, 0) : 0;
        const hashrate = sharesDelta > 0 ? (sharesDelta * 4294967296) / elapsedSeconds : 0;

        const next = [
          ...prev,
          {
            time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: now,
            shares,
            workers,
            pending,
            hashrate,
          },
        ];
        return next.slice(-24);
      });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = window.setInterval(fetchStats, 15000);
    return () => window.clearInterval(id);
  }, [fetchStats]);

  const loadBinding = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;

    setBindingLoading(true);
    try {
      const res = await authenticatedApiRequest('GET', '/api/qbtc/miner/binding');
      const data = await res.json();

      if (data?.binding) {
        setPayoutAddress(data.binding.payoutAddress || '');
        setWorkerAlias(data.binding.workerAlias || 'worker1');
        setBindMessage('Payout wallet loaded from your BearTec account.');
        return;
      }

      const legacyRaw = localStorage.getItem(`qbtc-pool-binding:${user.id}`);
      if (!legacyRaw) return;

      const parsed = JSON.parse(legacyRaw);
      setPayoutAddress(parsed.payoutAddress || '');
      setWorkerAlias(parsed.workerAlias || 'worker1');
      setBindMessage('Loaded your earlier beta wallet settings. Save once to sync them to your account.');
    } catch {
      setBindMessage('Unable to load your saved miner wallet right now.');
    } finally {
      setBindingLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setPayoutAddress('');
      setWorkerAlias('worker1');
      setBindMessage(null);
      return;
    }

    loadBinding();
  }, [isAuthenticated, user?.id, loadBinding]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const saveBinding = async () => {
    if (!user?.id) return;
    if (!isValidQbtcAddress(payoutAddress)) {
      setBindMessage('Enter a valid QBTC payout address first.');
      return;
    }

    setBindingSaving(true);
    try {
      const res = await authenticatedApiRequest('POST', '/api/qbtc/miner/binding', {
        payoutAddress: payoutAddress.trim(),
        workerAlias: workerAlias.trim() || 'worker1',
      });
      const data = await res.json();

      setPayoutAddress(data?.binding?.payoutAddress || payoutAddress.trim());
      setWorkerAlias(data?.binding?.workerAlias || workerAlias.trim() || 'worker1');
      localStorage.removeItem(`qbtc-pool-binding:${user.id}`);
      setBindMessage('Payout wallet saved to your BearTec account.');
    } catch {
      setBindMessage('Unable to save your payout wallet right now. Please try again.');
    } finally {
      setBindingSaving(false);
    }
  };

  const currentPoolHashrate = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].hashrate > 0) return history[i].hashrate;
    }
    return 0;
  }, [history]);

  const currentNetworkHashrate = useMemo(() => Number(stats?.networkHashPs ?? 0), [stats]);

  const workers = useMemo(() => stats?.workers ?? [], [stats]);
  const linkedWorkers = useMemo(() => {
    const normalizedPayout = payoutAddress.trim().toLowerCase();
    if (!normalizedPayout) return [] as WorkerInfo[];

    return workers.filter((worker) => {
      const workerName = String(worker.worker_name || '').toLowerCase();
      const payout = String(worker.payout_address || '').toLowerCase();
      return payout === normalizedPayout || workerName === normalizedPayout || workerName.startsWith(`${normalizedPayout}.`);
    });
  }, [workers, payoutAddress]);
  const topWorkers = useMemo(() => [...linkedWorkers].sort((a, b) => b.accepted_shares - a.accepted_shares).slice(0, 6), [linkedWorkers]);
  const payoutRows = useMemo(() => [...linkedWorkers].sort((a, b) => (b.pending_balance + b.total_paid) - (a.pending_balance + a.total_paid)).slice(0, 8), [linkedWorkers]);

  const stratumUrl = 'stratum+tcp://89.167.109.241:3333';
  const payoutSeed = payoutAddress.trim() || 'YOUR_QBTC_ADDRESS';
  const workerExample = `${payoutSeed}.${(workerAlias || 'worker1').trim()}`;
  const cpuminerCommand = `minerd -a sha256d -o ${stratumUrl} -u ${workerExample} -p x`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-500 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10 pb-28 space-y-6">
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

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Pickaxe className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">QBTC Mining</h1>
              <p className="text-slate-400 text-sm">Public pool overview plus private miner account control through BearTec login.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Pool Status</p>
              <p className={`font-semibold ${stats?.running ? 'text-emerald-300' : 'text-amber-300'}`}>
                {loading ? 'Loading…' : stats?.running ? 'Live' : 'Offline'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Workers</p>
              <p className="font-semibold text-cyan-300">{stats?.authorized_workers ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Accepted Shares</p>
              <p className="font-semibold text-emerald-300">{stats?.accepted_shares ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Network Hash Rate</p>
              <p className="font-semibold text-violet-300">{formatHashrate(currentNetworkHashrate)}</p>
              <p className="text-[10px] text-slate-500 mt-1">Estimated pool rate: {formatHashrate(currentPoolHashrate)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Pending Payouts</p>
              <p className="font-semibold text-amber-300">{Number(stats?.pending_payouts ?? 0).toFixed(2)} QBTC</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Total Paid</p>
              <p className="font-semibold text-cyan-300">{Number(stats?.total_paid ?? 0).toFixed(2)} QBTC</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Activity className="w-4 h-4" />
                Live pool charts
              </div>
              {history.length > 1 ? (
                <div className="space-y-4">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="shares" stroke="#22c55e" strokeWidth={2} dot={false} name="Accepted Shares" />
                        <Line type="monotone" dataKey="workers" stroke="#22d3ee" strokeWidth={2} dot={false} name="Workers" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(value) => formatHashrate(Number(value))} width={70} />
                        <Tooltip formatter={(value) => formatHashrate(Number(value))} />
                        <Line type="monotone" dataKey="hashrate" stroke="#a78bfa" strokeWidth={2} dot={false} name="Estimated Pool Hash Rate" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="pending" stroke="#f59e0b" fill="#f59e0b33" name="Pending QBTC" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Collecting live pool samples…</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Direct miner setup
              </div>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <p>Host: 89.167.109.241</p>
                  <p>Port: 3333</p>
                  <p>Pool fee: 1.0%</p>
                  <p>Template height: {stats?.last_template_height ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-slate-400 text-xs mb-1">Username format</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-cyan-300 break-all">{workerExample}</span>
                    <button onClick={() => copyText('worker', workerExample)} className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-cyan-400">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-slate-400 text-xs mb-1">Example command</p>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] text-amber-300 break-all">{cpuminerCommand}</span>
                    <button onClick={() => copyText('command', cpuminerCommand)} className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-cyan-400">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {copied && <p className="text-xs text-emerald-300">Copied {copied}.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Lock className="w-4 h-4 text-cyan-400" />
              Private miner account and payout control
            </div>

            {authLoading ? (
              <p className="text-sm text-slate-400">Checking BearTec login…</p>
            ) : isAuthenticated && user ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  Signed in as {user.email || user.firstName || 'BearTec user'}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Wallet className="w-4 h-4 text-emerald-400" /> Wallet binding
                    </div>
                    <input
                      value={payoutAddress}
                      onChange={(e) => setPayoutAddress(e.target.value)}
                      placeholder="qbtct1..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                    />
                    <input
                      value={workerAlias}
                      onChange={(e) => setWorkerAlias(e.target.value)}
                      placeholder="worker1"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={saveBinding}
                      disabled={bindingSaving}
                      className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors disabled:opacity-60"
                    >
                      {bindingSaving ? 'Saving…' : 'Save payout wallet'}
                    </button>
                    {bindingLoading && <p className="text-xs text-slate-400">Loading your saved miner wallet…</p>}
                    {bindMessage && <p className="text-xs text-cyan-300">{bindMessage}</p>}
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Users className="w-4 h-4 text-cyan-400" /> Worker dashboard
                    </div>
                    {!payoutAddress.trim() ? (
                      <p className="text-sm text-slate-400">Save your payout wallet to load your linked workers.</p>
                    ) : topWorkers.length === 0 ? (
                      <p className="text-sm text-slate-400">No miners linked to this payout wallet are active yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {topWorkers.map((worker) => (
                          <div key={worker.worker_name} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                            <p className="text-sm font-semibold text-cyan-300 truncate">{worker.worker_name}</p>
                            <p className="text-xs text-slate-400">Shares: {worker.accepted_shares} • Pending: {Number(worker.pending_balance ?? 0).toFixed(2)} QBTC</p>
                            <p className="text-xs text-slate-500">Last seen: {formatLastSeen(worker.last_seen)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <Coins className="w-4 h-4 text-amber-400" /> Payout history
                  </div>
                  {!payoutAddress.trim() ? (
                    <p className="text-sm text-slate-400">Bind a payout wallet first to see your payout history.</p>
                  ) : payoutRows.length === 0 ? (
                    <p className="text-sm text-slate-400">No payout records found for this wallet yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {payoutRows.map((worker) => (
                        <div key={`${worker.worker_name}-pay`} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-200 truncate">{worker.worker_name}</p>
                            <p className="text-xs text-slate-500">{worker.payout_address}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-amber-300">Pending: {Number(worker.pending_balance ?? 0).toFixed(2)} QBTC</p>
                            <p className="text-emerald-300">Paid: {Number(worker.total_paid ?? 0).toFixed(2)} QBTC</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
                <p className="text-sm text-slate-300">
                  Sign in with BearTec to unlock the private worker dashboard, payout history, and wallet binding.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Link href="/cryptologin">
                    <button className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors">
                      Sign in
                    </button>
                  </Link>
                  <Link href="/wallet">
                    <button className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm hover:border-cyan-400 transition-colors">
                      Open wallet
                    </button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Users className="w-4 h-4 text-cyan-400" /> Public onboarding</div>
              <p className="text-sm text-slate-400">Open pages bring miners in; private account controls stay behind Clerk login.</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Coins className="w-4 h-4 text-amber-400" /> Payouts</div>
              <p className="text-sm text-slate-400">Accounting is live. Automatic payout sending remains in safe dry-run mode for now.</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Wallet className="w-4 h-4 text-emerald-400" /> BearTec Wallet</div>
              <p className="text-sm text-slate-400">Saved payout wallet details now persist through the signed-in BearTec account, not just the browser.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Pool listener, worker tracking, public onboarding, and Clerk-gated miner controls are live on testnet.
          </div>
        </div>
      </div>

      <QBTCNavigation />
    </div>
  );
}
