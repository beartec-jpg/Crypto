import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  Pickaxe,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import QBTCNavigation from '../components/QBTCNavigation';

const POOL_API = (import.meta.env.VITE_POOL_API_URL || 'http://89.167.109.241:8088').replace(/\/$/, '');

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
  workers?: WorkerInfo[];
}

interface HistoryPoint {
  time: string;
  shares: number;
  workers: number;
  pending: number;
}

function formatLastSeen(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

export default function QBTCMiningPage() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${POOL_API}/stats`);
      const data = await res.json();
      setStats(data);
      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            shares: Number(data.accepted_shares ?? 0),
            workers: Number(data.authorized_workers ?? 0),
            pending: Number(data.pending_payouts ?? 0),
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

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const workers = useMemo(() => stats?.workers ?? [], [stats]);
  const topWorkers = useMemo(() => [...workers].sort((a, b) => b.accepted_shares - a.accepted_shares).slice(0, 6), [workers]);
  const payoutRows = useMemo(() => [...workers].sort((a, b) => (b.pending_balance + b.total_paid) - (a.pending_balance + a.total_paid)).slice(0, 8), [workers]);

  const stratumUrl = 'stratum+tcp://89.167.109.241:3333';
  const workerExample = 'YOUR_QBTC_ADDRESS.worker1';
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
              <p className="text-slate-400 text-sm">Mine into the BearTec testnet pool from one shared dashboard.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
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
                  <div className="h-44">
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
                  <div className="h-32">
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

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Users className="w-4 h-4 text-cyan-400" /> Worker cards
              </div>
              {topWorkers.length === 0 ? (
                <p className="text-sm text-slate-400">No workers connected yet.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {topWorkers.map((worker) => (
                    <div key={worker.worker_name} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-cyan-300 text-sm truncate">{worker.worker_name}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          Active
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>Shares: <span className="text-slate-200">{worker.accepted_shares}</span></p>
                        <p>Invalid: <span className="text-slate-200">{worker.invalid_shares}</span></p>
                        <p>Pending: <span className="text-amber-300">{Number(worker.pending_balance ?? 0).toFixed(2)} QBTC</span></p>
                        <p>Last seen: <span className="text-slate-300">{formatLastSeen(worker.last_seen)}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Coins className="w-4 h-4 text-amber-400" /> Payout history
              </div>
              {payoutRows.length === 0 ? (
                <p className="text-sm text-slate-400">No payout records yet.</p>
              ) : (
                <div className="space-y-2">
                  {payoutRows.map((worker) => (
                    <div key={`${worker.worker_name}-pay`} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 flex items-center justify-between gap-3">
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

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Users className="w-4 h-4 text-cyan-400" /> Workers</div>
              <p className="text-sm text-slate-400">Shared pool onboarding for home miners and testnet operators.</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Coins className="w-4 h-4 text-amber-400" /> Payouts</div>
              <p className="text-sm text-slate-400">Accounting is live. Automatic payout sending remains in safe dry-run mode for now.</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold"><Wallet className="w-4 h-4 text-emerald-400" /> BearTec Wallet</div>
              <p className="text-sm text-slate-400">Use the wallet page for addresses, swaps, and future payout controls.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Pool listener, worker tracking, and payout accounting are live on testnet.
          </div>
        </div>
      </div>

      <QBTCNavigation />
    </div>
  );
}
