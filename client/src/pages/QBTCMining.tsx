import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  last_share_at?: number;
  accepted_shares: number;
  invalid_shares: number;
  pending_balance: number;
  total_paid: number;
  weighted_shares?: number;
  pool_tier?: string;
  recent_hashrate?: number;
  acceptance_rate?: number;
  earnings_24h?: number;
  remaining_to_payout?: number;
  estimated_hours_to_payout?: number | null;
}

interface PoolTierStats {
  key?: string;
  label?: string;
  worker_count?: number;
  connected_miners?: number;
  accepted_shares?: number;
  invalid_shares?: number;
  pending_payouts?: number;
  total_paid?: number;
  weighted_shares?: number;
  estimated_hashrate?: number;
}

interface RoundContributor {
  worker_name: string;
  accepted_shares: number;
  invalid_shares: number;
  weighted_shares?: number;
  reward_estimate?: number;
  share_percent?: number;
}

interface PoolStats {
  pool_name?: string;
  running?: boolean;
  connected_miners?: number;
  authorized_workers?: number;
  accepted_shares?: number;
  invalid_shares?: number;
  weighted_shares?: number;
  pending_payouts?: number;
  total_paid?: number;
  last_template_height?: number;
  networkHashPs?: number;
  reward_method?: string;
  pool_router_mode?: string;
  payout_threshold?: number;
  payout_interval_sec?: number;
  share_difficulty?: number;
  pool_acceptance_rate?: number;
  pool_earnings_24h?: number;
  current_round_id?: string;
  current_round_status?: string;
  current_round_started_at?: number;
  current_round_shares?: number;
  current_round_weighted_shares?: number;
  current_round_total_rewards?: number;
  current_round_contributors?: RoundContributor[];
  pool_tiers?: Record<string, PoolTierStats>;
  history_24h?: Partial<HistoryPoint>[];
  workers?: WorkerInfo[];
}

interface HistoryPoint {
  time: string;
  timestamp: number;
  shares: number;
  rejected: number;
  accepted24h: number;
  rejected24h: number;
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

function formatEta(hours?: number | null) {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function normalizeServerHistory(points: Partial<HistoryPoint>[] | undefined, networkHashPs: number) {
  if (!Array.isArray(points) || points.length === 0) return [] as HistoryPoint[];

  return points.map((point, index, all) => {
    const timestamp = Number(point.timestamp ?? Date.now());
    const previous = all[index - 1];
    const accepted24h = Number(point.accepted24h ?? point.shares ?? 0);
    const rejected24h = Number(point.rejected24h ?? point.rejected ?? 0);
    const elapsedSeconds = previous ? Math.max((timestamp - Number(previous.timestamp ?? timestamp)) / 1000, 1) : 300;
    const acceptedDelta = previous ? Math.max(accepted24h - Number(previous.accepted24h ?? previous.shares ?? 0), 0) : 0;

    let hashrate = Number(point.hashrate ?? 0);
    if (!hashrate && acceptedDelta > 0) {
      hashrate = (acceptedDelta * 4294967296) / elapsedSeconds;
    }
    if (networkHashPs > 0) {
      hashrate = Math.min(hashrate, networkHashPs * 0.98);
    }

    return {
      time: String(point.time ?? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      timestamp,
      shares: accepted24h,
      rejected: rejected24h,
      accepted24h,
      rejected24h,
      workers: Number(point.workers ?? 0),
      pending: Number(point.pending ?? 0),
      hashrate: Math.max(hashrate, 0),
    };
  });
}

export default function QBTCMiningPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useCryptoAuth();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [selectedTier, setSelectedTier] = useState<'all' | 'home' | 'standard' | 'pro'>('all');
  const [payoutAddress, setPayoutAddress] = useState('');
  const [workerAlias, setWorkerAlias] = useState('worker1');
  const [bindMessage, setBindMessage] = useState<string | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [browserMinerAddress, setBrowserMinerAddress] = useState('');
  const [browserMinerAlias, setBrowserMinerAlias] = useState('browser1');
  const [browserThreads, setBrowserThreads] = useState(() => {
    if (typeof navigator === 'undefined') return 2;
    return Math.max(1, Math.min(2, navigator.hardwareConcurrency || 2));
  });
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

      const serverHistory = normalizeServerHistory(data.history_24h, Number(data.networkHashPs ?? 0));
      if (serverHistory.length > 0) {
        setHistory(serverHistory);
        return;
      }

      setHistory((prev) => {
        const now = Date.now();
        const shares = Number(data.accepted_shares ?? 0);
        const rejected = Number(data.invalid_shares ?? 0);
        const workers = Number(data.connected_miners ?? data.authorized_workers ?? 0);
        const pending = Number(data.pending_payouts ?? 0);
        const networkHashPs = Math.max(Number(data.networkHashPs ?? 0), 0);
        const previous = prev[prev.length - 1];
        const windowStart = prev.length > 10 ? prev[prev.length - 10] : prev[0];
        const elapsedSeconds = windowStart ? Math.max((now - windowStart.timestamp) / 1000, 1) : 15;
        const sharesDelta = windowStart ? Math.max(shares - windowStart.shares, 0) : 0;
        const rawHashrate = sharesDelta > 0 ? (sharesDelta * 4294967296) / elapsedSeconds : 0;

        let smoothedHashrate = rawHashrate > 0
          ? previous?.hashrate ? (previous.hashrate * 0.7) + (rawHashrate * 0.3) : rawHashrate
          : previous?.hashrate ? previous.hashrate * 0.9 : 0;

        if (networkHashPs > 0) {
          smoothedHashrate = Math.min(smoothedHashrate, networkHashPs * 0.98);
        }

        const hashrate = Math.max(smoothedHashrate, 0);
        const cutoff = now - (24 * 60 * 60 * 1000);
        const next = [
          ...prev,
          {
            time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: now,
            shares,
            rejected,
            accepted24h: 0,
            rejected24h: 0,
            workers,
            pending,
            hashrate,
          },
        ].filter((point) => point.timestamp >= cutoff);

        const base = next[0];
        return next.map((point) => ({
          ...point,
          accepted24h: Math.max(point.shares - (base?.shares ?? 0), 0),
          rejected24h: Math.max(point.rejected - (base?.rejected ?? 0), 0),
        }));
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

  useEffect(() => {
    if (payoutAddress && !browserMinerAddress) {
      setBrowserMinerAddress(payoutAddress);
    }
  }, [payoutAddress, browserMinerAddress]);

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
    const recent = history.slice(-8).map((point) => point.hashrate).filter((value) => value > 0);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, value) => sum + value, 0) / recent.length;
  }, [history]);

  const currentNetworkHashrate = useMemo(() => Number(stats?.networkHashPs ?? 0), [stats]);
  const activeTierStats = useMemo<PoolTierStats>(() => {
    if (selectedTier === 'all') {
      return {
        key: 'all',
        label: 'Gateway',
        worker_count: Number(stats?.authorized_workers ?? 0),
        connected_miners: Number(stats?.connected_miners ?? 0),
        accepted_shares: Number(stats?.accepted_shares ?? 0),
        invalid_shares: Number(stats?.invalid_shares ?? 0),
        pending_payouts: Number(stats?.pending_payouts ?? 0),
        total_paid: Number(stats?.total_paid ?? 0),
        weighted_shares: Number(stats?.weighted_shares ?? 0),
        estimated_hashrate: currentPoolHashrate,
      };
    }

    return stats?.pool_tiers?.[selectedTier] ?? {
      key: selectedTier,
      label: selectedTier,
      worker_count: 0,
      connected_miners: 0,
      accepted_shares: 0,
      invalid_shares: 0,
      pending_payouts: 0,
      total_paid: 0,
      weighted_shares: 0,
      estimated_hashrate: 0,
    };
  }, [selectedTier, stats, currentPoolHashrate]);

  const displayedPoolHashrate = useMemo(() => Number(activeTierStats?.estimated_hashrate ?? 0), [activeTierStats]);
  const poolSharePercent = useMemo(() => {
    if (!currentNetworkHashrate || currentNetworkHashrate <= 0) return 0;
    return Math.min((displayedPoolHashrate / currentNetworkHashrate) * 100, 100);
  }, [displayedPoolHashrate, currentNetworkHashrate]);

  const workers = useMemo(() => stats?.workers ?? [], [stats]);
  const workerTierMap = useMemo(() => new Map(workers.map((worker) => [worker.worker_name, worker.pool_tier || 'home'])), [workers]);
  const roundContributors = useMemo(() => {
    const list = stats?.current_round_contributors ?? [];
    if (selectedTier === 'all') return list;
    return list.filter((worker) => workerTierMap.get(worker.worker_name) === selectedTier);
  }, [stats, selectedTier, workerTierMap]);
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
  const walletAcceptedShares = useMemo(() => linkedWorkers.reduce((sum, worker) => sum + Number(worker.accepted_shares ?? 0), 0), [linkedWorkers]);
  const walletInvalidShares = useMemo(() => linkedWorkers.reduce((sum, worker) => sum + Number(worker.invalid_shares ?? 0), 0), [linkedWorkers]);
  const walletAcceptanceRate = useMemo(() => {
    const total = walletAcceptedShares + walletInvalidShares;
    return total > 0 ? (walletAcceptedShares / total) * 100 : 100;
  }, [walletAcceptedShares, walletInvalidShares]);
  const walletEarnings24h = useMemo(() => linkedWorkers.reduce((sum, worker) => sum + Number(worker.earnings_24h ?? 0), 0), [linkedWorkers]);
  const walletPendingBalance = useMemo(() => linkedWorkers.reduce((sum, worker) => sum + Number(worker.pending_balance ?? 0), 0), [linkedWorkers]);
  const walletPaidTotal = useMemo(() => linkedWorkers.reduce((sum, worker) => sum + Number(worker.total_paid ?? 0), 0), [linkedWorkers]);
  const nextPayoutEstimateHours = useMemo(() => {
    const threshold = Number(stats?.payout_threshold ?? 0);
    if (!threshold || walletEarnings24h <= 0) return null;
    const remaining = Math.max(threshold - walletPendingBalance, 0);
    return remaining > 0 ? remaining / (walletEarnings24h / 24) : 0;
  }, [stats?.payout_threshold, walletEarnings24h, walletPendingBalance]);

  const browserThreadCap = useMemo(() => {
    if (typeof navigator === 'undefined') return 2;
    return Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
  }, []);

  const stopBrowserMining = useCallback(() => {
    if (browserJobTimerRef.current) {
      window.clearInterval(browserJobTimerRef.current);
      browserJobTimerRef.current = null;
    }
    browserWorkersRef.current.forEach((worker) => {
      worker.postMessage({ type: 'stop' });
      worker.terminate();
    });
    browserWorkersRef.current = [];
    setBrowserMining(false);
    setBrowserStatus('Stopped');
  }, []);

  const fetchBrowserJob = useCallback(async () => {
    const address = browserMinerAddress.trim();
    if (!isValidQbtcAddress(address)) {
      throw new Error('Enter a valid QBTC payout address');
    }

    const worker = (browserMinerAlias.trim() || 'browser1').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'browser1';
    const response = await fetch(`${POOL_API.replace('pool-stats', 'browser-miner')}?action=job&address=${encodeURIComponent(address)}&worker=${encodeURIComponent(worker)}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Unable to fetch browser mining job');
    }
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
      const response = await fetch(`${POOL_API.replace('pool-stats', 'browser-miner')}?action=submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data?.ok) {
        setBrowserAcceptedShares((value) => value + 1);
        setBrowserStatus(`Mining in ${data.pool_tier || 'home'} lane`);
        fetchStats();
      } else {
        setBrowserRejectedShares((value) => value + 1);
        setBrowserStatus(`Share ${data?.reason || 'rejected'}`);
      }
    } catch {
      setBrowserRejectedShares((value) => value + 1);
      setBrowserStatus('Share submit retrying…');
    }
  }, [fetchStats]);

  const startBrowserMining = useCallback(async () => {
    try {
      if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        throw new Error('This browser does not support worker-based mining');
      }
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Browser mining requires HTTPS');
      }

      stopBrowserMining();
      setBrowserStatus('Requesting browser mining job…');
      setBrowserAcceptedShares(0);
      setBrowserRejectedShares(0);
      setBrowserHashrate(0);

      const config = await fetchBrowserJob();
      const workerCount = Math.max(1, Math.min(browserThreads, browserThreadCap));
      const nextWorkers = Array.from({ length: workerCount }, () => new Worker('/qbtc-browser-miner-worker.js'));

      nextWorkers.forEach((worker) => {
        worker.onmessage = (event) => {
          const { type, payload } = event.data || {};
          if (type === 'stats') {
            setBrowserHashrate((value) => (value > 0 ? (value * 0.6) + (Number(payload?.hashrate ?? 0) * 0.4) : Number(payload?.hashrate ?? 0)));
          }
          if (type === 'share') {
            void submitBrowserShare(payload);
          }
        };
        worker.postMessage({ type: 'start', payload: { ...config, throttleMs: browserThrottle } });
      });

      browserWorkersRef.current = nextWorkers;
      browserJobTimerRef.current = window.setInterval(async () => {
        try {
          const nextJob = await fetchBrowserJob();
          browserWorkersRef.current.forEach((worker) => worker.postMessage({ type: 'job', payload: { ...nextJob, throttleMs: browserThrottle } }));
        } catch {
          setBrowserStatus('Waiting for the next job…');
        }
      }, 15000);

      setBrowserMining(true);
      setBrowserStatus(`Mining in ${config.pool_tier || 'home'} lane`);
    } catch (error: any) {
      setBrowserMining(false);
      setBrowserStatus(error?.message || 'Unable to start browser miner');
    }
  }, [browserThrottle, browserThreadCap, browserThreads, fetchBrowserJob, stopBrowserMining, submitBrowserShare]);

  useEffect(() => () => stopBrowserMining(), [stopBrowserMining]);

  const stratumUrl = 'stratum+tcp://89.167.109.241:3333';
  const payoutSeed = payoutAddress.trim() || 'YOUR_QBTC_ADDRESS';
  const workerExample = `${payoutSeed}.${(workerAlias || 'worker1').trim()}`;
  const passwordHint = selectedTier === 'home' ? 'home' : selectedTier === 'standard' ? 'gpu' : selectedTier === 'pro' ? 'pro' : 'x';
  const cpuminerCommand = `minerd -a sha256d -o ${stratumUrl} -u ${workerExample} -p ${passwordHint}`;

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

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'all', label: 'Gateway' },
                { key: 'home', label: 'Home CPU' },
                { key: 'standard', label: 'Open GPU' },
                { key: 'pro', label: 'Pro / ASIC' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedTier(tab.key)}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${selectedTier === tab.key ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-cyan-400'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">One public entry point auto-routes miners by observed hash power. Switch tabs to inspect each lane while keeping the gateway unified.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-8 gap-3 text-sm">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Pool Status</p>
              <p className={`font-semibold ${stats?.running ? 'text-emerald-300' : 'text-amber-300'}`}>
                {loading ? 'Loading…' : stats?.running ? 'Live' : 'Offline'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Workers</p>
              <p className="font-semibold text-cyan-300">{Number(activeTierStats?.worker_count ?? 0)}</p>
              <p className="text-[10px] text-slate-500 mt-1">Connected: {Number(activeTierStats?.connected_miners ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Accepted</p>
              <p className="font-semibold text-emerald-300">{Number(activeTierStats?.accepted_shares ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Rejected</p>
              <p className="font-semibold text-rose-300">{Number(activeTierStats?.invalid_shares ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Pool Hash</p>
              <p className="font-semibold text-violet-300">{formatHashrate(displayedPoolHashrate)}</p>
              <p className="text-[10px] text-slate-500 mt-1">Smoothed estimate capped to network rate</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Network Hash</p>
              <p className="font-semibold text-cyan-300">{formatHashrate(currentNetworkHashrate)}</p>
              <p className="text-[10px] text-slate-500 mt-1">Pool share: {poolSharePercent.toFixed(2)}%</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Pending</p>
              <p className="font-semibold text-amber-300">{Number(activeTierStats?.pending_payouts ?? 0).toFixed(2)} QBTC</p>
              <p className="text-[10px] text-slate-500 mt-1">Awaiting next payout pass</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-slate-400">Paid</p>
              <p className="font-semibold text-emerald-300">{Number(activeTierStats?.total_paid ?? 0).toFixed(2)} QBTC</p>
              <p className="text-[10px] text-slate-500 mt-1">Sent on-chain</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Activity className="w-4 h-4" />
                Live pool charts
              </div>
              <p className="text-xs text-slate-400">Charts show the combined gateway over 24 hours; the tabs above switch the lane-specific card and fairness stats.</p>
              {history.length > 1 ? (
                <div className="space-y-4">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="accepted24h" stroke="#22c55e" strokeWidth={2} dot={false} name="Accepted 24h" />
                        <Line type="monotone" dataKey="rejected24h" stroke="#fb7185" strokeWidth={2} dot={false} name="Rejected 24h" />
                        <Line type="monotone" dataKey="workers" stroke="#22d3ee" strokeWidth={2} dot={false} name="Workers Live" />
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
                  <p>Mode: {stats?.pool_router_mode || 'smart-gateway'}</p>
                  <p>Lane: {activeTierStats?.label || 'Gateway'}</p>
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
                  <p className="text-[10px] text-slate-500 mb-2">Optional lane hint password: {passwordHint}</p>
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
              Enter a QBTC payout wallet and start mining directly in this browser. It is designed for easy low-power CPU participation and routes into the home lane automatically.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  value={browserMinerAddress}
                  onChange={(e) => setBrowserMinerAddress(e.target.value)}
                  placeholder="qbtct1..."
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
                      {Array.from({ length: browserThreadCap }, (_, i) => i + 1).map((count) => (
                        <option key={count} value={count} className="bg-slate-900 text-slate-100">
                          {count}
                        </option>
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
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={browserThrottle}
                    onChange={(e) => setBrowserThrottle(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <p className="text-[11px] text-slate-500">Lower pause means more hashing and more CPU usage.</p>
                </div>
                <div className="flex gap-3 flex-wrap">
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
                  <p className="font-semibold text-cyan-300">{browserStatus}</p>
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
                  <p className="text-xs text-slate-400">Browser worker name</p>
                  <p className="font-mono text-[11px] text-amber-300 break-all">
                    {(browserMinerAddress.trim() || 'qbtct1...')}.{(browserMinerAlias.trim() || 'browser1').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'browser1'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-violet-300 font-semibold">
              <Users className="w-4 h-4" />
              Current round fairness
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-400">Round status</p>
                <p className="font-semibold text-slate-100">{stats?.current_round_status || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-400">Round shares</p>
                <p className="font-semibold text-emerald-300">{stats?.current_round_shares ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-400">Weighted shares</p>
                <p className="font-semibold text-cyan-300">{Number(stats?.current_round_weighted_shares ?? 0).toFixed(4)}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-xs text-slate-400">Round reward est.</p>
                <p className="font-semibold text-amber-300">{Number(stats?.current_round_total_rewards ?? 0).toFixed(6)} QBTC</p>
              </div>
            </div>

            {roundContributors.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="text-left px-3 py-2">Worker</th>
                      <th className="text-right px-3 py-2">Share %</th>
                      <th className="text-right px-3 py-2">Weighted</th>
                      <th className="text-right px-3 py-2">Accepted</th>
                      <th className="text-right px-3 py-2">Est. reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundContributors.map((worker) => (
                      <tr key={worker.worker_name} className="border-t border-slate-800 text-slate-200">
                        <td className="px-3 py-2 font-mono text-[11px] break-all">{worker.worker_name}</td>
                        <td className="px-3 py-2 text-right text-cyan-300">{Number(worker.share_percent ?? 0).toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">{Number(worker.weighted_shares ?? 0).toFixed(4)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300">{worker.accepted_shares ?? 0}</td>
                        <td className="px-3 py-2 text-right text-amber-300">{Number(worker.reward_estimate ?? 0).toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Waiting for more verified round submissions to rank contributors.</p>
            )}
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Acceptance</p>
                    <p className="text-sm font-semibold text-emerald-300">{walletAcceptanceRate.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">24h earnings</p>
                    <p className="text-sm font-semibold text-cyan-300">{walletEarnings24h.toFixed(2)} QBTC</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Next payout</p>
                    <p className="text-sm font-semibold text-amber-300">{formatEta(nextPayoutEstimateHours)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Reward method</p>
                    <p className="text-sm font-semibold text-violet-300">{stats?.reward_method || 'PPS'}</p>
                  </div>
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
                            <p className="text-xs text-slate-500">Tier: {worker.pool_tier || 'home'} • Hash: {formatHashrate(Number(worker.recent_hashrate ?? 0))}</p>
                            <p className="text-xs text-slate-500">Last seen: {formatLastSeen(worker.last_seen)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold">
                      <Coins className="w-4 h-4 text-amber-400" /> Payout history
                    </div>
                    <div className="text-xs text-slate-400">
                      Pending: <span className="text-amber-300">{walletPendingBalance.toFixed(2)} QBTC</span>
                      {' • '}
                      Paid: <span className="text-emerald-300">{walletPaidTotal.toFixed(2)} QBTC</span>
                      {' • '}
                      Threshold: <span className="text-cyan-300">{Number(stats?.payout_threshold ?? 0).toFixed(2)} QBTC</span>
                    </div>
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
              <p className="text-sm text-slate-400">Accounting and automatic payouts are live, with gateway routing now separating home, standard, and pro lanes.</p>
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
