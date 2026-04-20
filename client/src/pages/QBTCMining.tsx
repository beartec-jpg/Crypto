import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Activity, Coins, Pickaxe, ShieldCheck, Users, Wallet } from 'lucide-react';
import QBTCNavigation from '../components/QBTCNavigation';

const POOL_API = (import.meta.env.VITE_POOL_API_URL || 'http://89.167.109.241:8088').replace(/\/$/, '');

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
}

export default function QBTCMiningPage() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${POOL_API}/stats`);
      const data = await res.json();
      setStats(data);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-500 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10 pb-28 space-y-6">
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Activity className="w-4 h-4" />
                Connection details
              </div>
              <div className="text-sm text-slate-300 space-y-1">
                <p>Host: 89.167.109.241</p>
                <p>Port: 3333</p>
                <p>Pool fee: 1.0%</p>
                <p>Template height: {stats?.last_template_height ?? '—'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                How to start
              </div>
              <ol className="text-sm text-slate-300 space-y-1 list-decimal pl-5">
                <li>Open the wallet and copy your QBTC receive address.</li>
                <li>Use that address as the worker username.</li>
                <li>Point your miner at the BearTec pool host and port.</li>
                <li>Watch your shares and pending balance update here.</li>
              </ol>
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
        </div>
      </div>

      <QBTCNavigation />
    </div>
  );
}
