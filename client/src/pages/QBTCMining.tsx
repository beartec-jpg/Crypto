import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Copy, Pickaxe, ShieldCheck, Users } from 'lucide-react';
import QBTCNavigation from '../components/QBTCNavigation';
import { getLaneRoundMetrics } from '../lib/qbtcMiningMetrics';
import { useCryptoAuth } from '../hooks/useCryptoAuth';
import { authenticatedApiRequest } from '../lib/apiAuth';

const POOL_API = '/api/qbtc/pool-stats';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierStats {
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
  earnings_24h?: number;
}

interface RoundContributor {
  worker_name: string;
  accepted_shares: number;
  invalid_shares: number;
  weighted_shares?: number;
  reward_estimate?: number;
  share_percent?: number;
}

interface WorkerInfo {
  worker_name: string;
  payout_address: string;
  last_seen: number;
  accepted_shares: number;
  invalid_shares: number;
  pending_balance: number;
  total_paid: number;
  pool_tier?: string;
  recent_hashrate?: number;
  earnings_24h?: number;
}

interface PoolStats {
  running?: boolean;
  connected_miners?: number;
  authorized_workers?: number;
  networkHashPs?: number;
  lastBlockTime?: number | null;
  pool_earnings_24h?: number;
  last_template_height?: number;
  pool_router_mode?: string;
  reward_method?: string;
  payout_threshold?: number;
  current_round_status?: string;
  current_round_shares?: number;
  current_round_weighted_shares?: number;
  current_round_total_rewards?: number;
  current_round_contributors?: RoundContributor[];
  pool_tiers?: Record<string, TierStats>;
  workers?: WorkerInfo[];
  history_24h?: { timestamp?: number; hashrate?: number; shares?: number }[];
}

type LaneTierKey = 'browser' | 'hobby' | 'pro';
type ProfileRig = { alias: string; lane: LaneTierKey | 'auto' };
type MiningProfile = {
  walletAddress: string;
  rigs: ProfileRig[];
};

type Tab = 'pool' | 'profile';

const MINING_PROFILE_STORAGE_KEY = 'qbtc-mining-profile';

const TABS: { key: Tab; label: string; tierKey?: LaneTierKey; lane: string; password: string }[] = [
  { key: 'pool',    label: 'Pool',         tierKey: undefined,  lane: 'auto-routed', password: 'x' },
  { key: 'profile', label: 'Profile',      tierKey: undefined,  lane: 'profile',     password: 'x' },
];

function normalizeTierKey(raw: unknown): LaneTierKey | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'browser' || value === 'home' || value.includes('cpu')) return 'browser';
  if (value === 'hobby' || value === 'standard' || value === 'open' || value.includes('gpu')) return 'hobby';
  if (value === 'pro' || value.includes('asic')) return 'pro';
  return null;
}

function aggregateLaneTierStats(stats: PoolStats | null, lane: LaneTierKey): TierStats {
  const tiers = Object.entries(stats?.pool_tiers ?? {});
  const matching = tiers
    .filter(([tierKey]) => normalizeTierKey(tierKey) === lane)
    .map(([, tierStats]) => tierStats);

  if (matching.length === 0) return {};

  return matching.reduce<TierStats>((acc, current) => ({
    worker_count: Number(acc.worker_count ?? 0) + Number(current.worker_count ?? 0),
    connected_miners: Number(acc.connected_miners ?? 0) + Number(current.connected_miners ?? 0),
    accepted_shares: Number(acc.accepted_shares ?? 0) + Number(current.accepted_shares ?? 0),
    invalid_shares: Number(acc.invalid_shares ?? 0) + Number(current.invalid_shares ?? 0),
    pending_payouts: Number(acc.pending_payouts ?? 0) + Number(current.pending_payouts ?? 0),
    total_paid: Number(acc.total_paid ?? 0) + Number(current.total_paid ?? 0),
    weighted_shares: Number(acc.weighted_shares ?? 0) + Number(current.weighted_shares ?? 0),
    estimated_hashrate: Number(acc.estimated_hashrate ?? 0) + Number(current.estimated_hashrate ?? 0),
    earnings_24h: Number(acc.earnings_24h ?? 0) + Number(current.earnings_24h ?? 0),
  }), {});
}

function computeGatewayHashrate(stats: PoolStats | null): number {
  return (['browser', 'hobby', 'pro'] as const).reduce((sum, lane) => {
    const laneStats = aggregateLaneTierStats(stats, lane);
    return sum + Number(laneStats.estimated_hashrate ?? 0);
  }, 0);
}

function formatHashCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)} T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} K`;
  return value.toFixed(0);
}

function normalizeRigs(rigs: ProfileRig[]): ProfileRig[] {
  return rigs
    .map((r) => ({
      alias: String(r.alias || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24),
      lane: (['browser', 'hobby', 'pro', 'auto'].includes(String(r.lane)) ? r.lane : 'auto') as LaneTierKey | 'auto',
    }))
    .filter((r) => r.alias.length > 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function QBTCMiningPage() {
  const { isAuthenticated, user } = useCryptoAuth();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [poolHashrate, setPoolHashrate] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pool');
  const [profile, setProfile] = useState<MiningProfile>({ walletAddress: '', rigs: [] });
  const [newRigAlias, setNewRigAlias] = useState('');
  const [newRigLane, setNewRigLane] = useState<LaneTierKey | 'auto'>('auto');
  const [profileStatus, setProfileStatus] = useState<string>('');

  // Browser miner controls (currently hidden — commented out for simplified UI)
  /*
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
  const [browserWeightedShares, setBrowserWeightedShares] = useState(0);
  const [browserRejectedShares, setBrowserRejectedShares] = useState(0);
  const browserShareDifficultyRef = useRef(0.00025);
  const browserWorkersRef = useRef<Worker[]>([]);
  const browserWorkerHashratesRef = useRef<Record<number, number>>({});
  const browserJobTimerRef = useRef<number | null>(null);
  */

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const [poolRes, networkRes] = await Promise.all([
        fetch(POOL_API, { cache: 'no-store' }),
        fetch('/api/qbtc-scan/stats', { cache: 'no-store' }).catch(() => null),
      ]);
      if (!poolRes.ok) return;
      const poolData = await poolRes.json();
      const networkData = networkRes?.ok ? await networkRes.json() : null;
      const data: PoolStats = { ...poolData, networkHashPs: Number(networkData?.networkHashPs ?? 0), lastBlockTime: networkData?.lastBlockTime ?? null };
      setStats(data);
      // Gateway is the sum of Browser + Hobby + Pro lanes.
      setPoolHashrate(computeGatewayHashrate(data));
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

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      setProfileStatus('');
      try {
        if (isAuthenticated) {
          const res = await authenticatedApiRequest('GET', '/api/users/settings');
          const settings = await res.json();
          const data = settings?.drawingDefaults?.byTool?.qbtcMiningProfile;
          if (!cancelled) {
            setProfile({
              walletAddress: String(data?.walletAddress || ''),
              rigs: normalizeRigs(Array.isArray(data?.rigs) ? data.rigs : []),
            });
            setProfileStatus('Profile loaded');
          }
          return;
        }
      } catch {
        // Fall back to local storage.
      }

      try {
        const raw = localStorage.getItem(MINING_PROFILE_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!cancelled) {
          setProfile({
            walletAddress: String(data?.walletAddress || ''),
            rigs: normalizeRigs(Array.isArray(data?.rigs) ? data.rigs : []),
          });
          setProfileStatus('Loaded local profile');
        }
      } catch {
        if (!cancelled) setProfileStatus('Could not load local profile');
      }
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const saveProfile = useCallback(async () => {
    const payload: MiningProfile = {
      walletAddress: profile.walletAddress.trim(),
      rigs: normalizeRigs(profile.rigs),
    };
    try {
      localStorage.setItem(MINING_PROFILE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore local storage errors.
    }

    try {
      if (isAuthenticated) {
        const currentRes = await authenticatedApiRequest('GET', '/api/users/settings');
        const currentSettings = await currentRes.json();
        const currentDrawingDefaults = currentSettings?.drawingDefaults || { byTool: {}, autoColorEnabled: true };
        const nextDrawingDefaults = {
          ...currentDrawingDefaults,
          byTool: {
            ...(currentDrawingDefaults?.byTool || {}),
            qbtcMiningProfile: payload,
          },
        };

        await authenticatedApiRequest('PUT', '/api/users/settings', {
          ...currentSettings,
          drawingDefaults: nextDrawingDefaults,
        });
        setProfileStatus('Saved to account profile');
      } else {
        setProfileStatus('Saved locally on this browser');
      }
    } catch {
      setProfileStatus('Saved locally (account sync unavailable)');
    }
  }, [isAuthenticated, profile]);

  // ── Browser miner logic (commented out for simplified UI) ─────────────────
  /*
  const browserThreadCap = useMemo(() =>
    typeof navigator === 'undefined' ? 2 : Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)), []);

  const stopBrowserMining = useCallback(() => {
    if (browserJobTimerRef.current) { window.clearInterval(browserJobTimerRef.current); browserJobTimerRef.current = null; }
    browserWorkersRef.current.forEach((w) => { w.postMessage({ type: 'stop' }); w.terminate(); });
    browserWorkersRef.current = [];
    browserWorkerHashratesRef.current = {};
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
      // stash so submitBrowserShare can weight contributions
      _diff: Number(data.share_difficulty ?? 0.000001),
      job: data.job,
    };
  }, [browserMinerAddress, browserMinerAlias]);

  const submitBrowserShare = useCallback(async (payload: Record<string, string | number>) => {
    try {
      const res = await fetch(`${POOL_API.replace('pool-stats', 'browser-miner')}?action=submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
        const data = await res.json();
        if (data?.ok) {
          setBrowserAcceptedShares((v) => v + 1);
          const submittedShareDifficulty = Number(payload?.share_difficulty ?? browserShareDifficultyRef.current);
          setBrowserWeightedShares((v) => v + submittedShareDifficulty);
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
      setBrowserWeightedShares(0);
      setBrowserRejectedShares(0);
      setBrowserHashrate(0);
      browserWorkerHashratesRef.current = {};
      const config = await fetchBrowserJob();
      browserShareDifficultyRef.current = (config as any)._diff ?? 0.00025;
      const count = Math.max(1, Math.min(browserThreads, browserThreadCap));
      const nextWorkers = Array.from({ length: count }, () => new Worker('/qbtc-browser-miner-worker.js'));
      nextWorkers.forEach((w, idx) => {
        w.onmessage = (e) => {
          const { type, payload } = e.data || {};
          if (type === 'stats') {
            browserWorkerHashratesRef.current[idx] = Number(payload?.hashrate ?? 0);
            const totalHashrate = Object.values(browserWorkerHashratesRef.current).reduce((sum, value) => sum + (value || 0), 0);
            setBrowserHashrate(totalHashrate);
          }
          if (type === 'share') void submitBrowserShare(payload);
        };
        w.postMessage({ type: 'start', payload: { ...config, throttleMs: browserThrottle } });
      });
      browserWorkersRef.current = nextWorkers;
      browserJobTimerRef.current = window.setInterval(async () => {
        try {
          const nextJob = await fetchBrowserJob();
          browserShareDifficultyRef.current = (nextJob as any)._diff ?? browserShareDifficultyRef.current;
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
  */

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch { setCopied(null); }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const networkHashPs = useMemo(() => {
    const raw = Number(stats?.networkHashPs ?? 0);
    if (!stats?.lastBlockTime) return raw;
    const secondsSinceBlock = Math.floor(Date.now() / 1000) - stats.lastBlockTime;
    return secondsSinceBlock > 60 ? 0 : raw;
  }, [stats?.networkHashPs, stats?.lastBlockTime]);

  // All pool workers and round contributors (no lane filtering in simplified view)
  const allWorkers = stats?.workers ?? [];
  const allRoundContributors = stats?.current_round_contributors ?? [];
  const poolRoundMetrics = useMemo(() => getLaneRoundMetrics(allRoundContributors), [allRoundContributors]);

  const stratumUrl = 'stratum+tcp://89.167.109.241:3333';
  const cpuminerCommand = `minerd -a sha256d -o ${stratumUrl} -u YOUR_QBTC_ADDRESS.worker1 -p x`;

  const profileMatchedWorkers = useMemo(() => {
    const wallets = profile.walletAddress
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const rigs = normalizeRigs(profile.rigs);
    if (wallets.length === 0 && rigs.length === 0) return [] as WorkerInfo[];
    return (stats?.workers ?? []).filter((worker) => {
      const payout = String(worker.payout_address || '').trim().toLowerCase();
      const payoutMatch = wallets.includes(payout);
      const workerName = String(worker.worker_name || '').toLowerCase();
      const rigMatch = rigs.length > 0 && rigs.some((rig) => workerName.endsWith(`.${rig.alias.toLowerCase()}`));
      return payoutMatch || rigMatch;
    });
  }, [profile, stats?.workers]);

  const profileWalletCount = useMemo(
    () => profile.walletAddress.split(',').map((value) => value.trim()).filter(Boolean).length,
    [profile.walletAddress],
  );

  const profileMetrics = useMemo(() => {
    const currentHashrate = profileMatchedWorkers.reduce((sum, worker) => sum + Number(worker.recent_hashrate || 0), 0);
    const earnings24h = profileMatchedWorkers.reduce((sum, worker) => sum + Number(worker.earnings_24h || 0), 0);
    const earningsAllTime = profileMatchedWorkers.reduce((sum, worker) => sum + Number(worker.total_paid || 0), 0);
    const weightedAllTime = profileMatchedWorkers.reduce((sum, worker) => sum + Number(worker.weighted_shares || 0), 0);
    const connectedDevices = profileMatchedWorkers.length;
    const estimatedHashes24h = currentHashrate * 86400;
    return {
      currentHashrate,
      earnings24h,
      earningsAllTime,
      weightedAllTime,
      connectedDevices,
      estimatedHashes24h,
    };
  }, [profileMatchedWorkers]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  function StatCard({ label, value, sub, color = 'text-slate-100' }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className={`font-semibold ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    );
  }

  function SetupInstructions() {
    return (
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
                <span className="text-amber-300">x</span>
                <span className="text-slate-500 ml-3">(or: browser · hobby · pro to pin a lane)</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-slate-400 text-xs">Example command</p>
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
          <p>• <span className="text-slate-300">Browser</span> — home / low-power rigs. Password: <code className="text-amber-300">browser</code></p>
          <p>• <span className="text-slate-300">Hobby</span> — CPUs &amp; GPUs up to 5 TH/s. Password: <code className="text-amber-300">hobby</code></p>
          <p>• <span className="text-slate-300">Pro / ASIC</span> — high-performance hardware &gt;5 TH/s. Password: <code className="text-amber-300">pro</code></p>
          <p>• Leave password as <code className="text-amber-300">x</code> to auto-route by observed hash rate.</p>
        </div>
      </div>
    );
  }

  function RoundFairness() {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
        <div className="flex items-center gap-2 text-violet-300 font-semibold">
          <Users className="w-4 h-4" />
          Current round
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <StatCard label="Round status" value={stats?.current_round_status || '—'} />
          <StatCard label="Shares" value={poolRoundMetrics.acceptedShares} color="text-emerald-300" />
          <StatCard label="Weighted" value={poolRoundMetrics.weightedShares.toFixed(4)} color="text-cyan-300" />
          <StatCard label="Reward est." value={`${poolRoundMetrics.rewardEstimate.toFixed(6)} QBTC`} color="text-amber-300" />
        </div>
        {allRoundContributors.length > 0 ? (
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
                {allRoundContributors.map((c) => (
                  <tr key={c.worker_name} className="border-t border-slate-800 text-slate-200">
                    <td className="px-3 py-2 font-mono text-[11px] break-all">{c.worker_name}</td>
                    <td className="px-3 py-2 text-right text-cyan-300">{Number(c.share_percent ?? 0).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right">{Number(c.weighted_shares ?? 0).toFixed(4)}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{c.accepted_shares ?? 0}</td>
                    <td className="px-3 py-2 text-right text-amber-300">{Number(c.reward_estimate ?? 0).toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No contributors in the current round yet.</p>
        )}
      </div>
    );
  }

  function WorkerList() {
    if (allWorkers.length === 0) return (
      <p className="text-sm text-slate-400">No active workers connected to the pool.</p>
    );
    return (
      <div className="space-y-2">
        {allWorkers.slice(0, 10).map((w) => (
          <div key={w.worker_name} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-cyan-300 truncate max-w-xs">{w.worker_name}</p>
              <p className="text-xs text-slate-500 font-mono truncate max-w-xs">{w.payout_address}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p className="text-emerald-300">Accepted: {w.accepted_shares}</p>
              <p className="text-amber-300">Pending: {Number(w.pending_balance ?? 0).toFixed(4)} QBTC</p>
              <p className="text-slate-400">Hash: {formatHashrate(Number(w.recent_hashrate ?? 0))}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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

        {/* Beta notice */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-2 text-xs text-amber-200">
          <span className="font-semibold text-amber-300">⚠ Beta Software</span>
          <span>The QBTC mining pool is in beta on testnet. Mining rewards are testnet QBTC and have no monetary value. Pool software and reward calculations may change without notice.</span>
          <span>Bug reports &amp; feedback:</span>
          <a href="mailto:beartec@beartec.uk" className="text-amber-400 hover:text-amber-300 underline">beartec@beartec.uk</a>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 md:p-8 space-y-6">
          {/* Title + Tabs */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Pickaxe className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">QBTC Mining</h1>
              <p className="text-slate-400 text-sm">Public mining pool — home CPU, GPU, and ASIC welcome.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${tab === t.key ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-cyan-400'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── POOL TAB ─────────────────────────────────────────────── */}
          {tab === 'pool' && (
            <div className="space-y-6">
              {/* Stats strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <StatCard
                  label="Pool status"
                  value={loading ? 'Loading…' : stats?.running ? 'Live' : 'Offline'}
                  color={loading ? 'text-slate-400' : stats?.running ? 'text-emerald-300' : 'text-amber-300'}
                />
                <StatCard label="Pool hash rate" value={formatHashrate(poolHashrate)} color="text-violet-300" />
                <StatCard label="Network hash rate" value={formatHashrate(networkHashPs)} color="text-cyan-300" />
                <StatCard label="24 hr QBTC earned" value={`${Number(stats?.pool_earnings_24h ?? 0).toFixed(4)}`} color="text-amber-300" />
                <StatCard label="Workers" value={Number(stats?.authorized_workers ?? 0)} />
              </div>

              <SetupInstructions />

              <RoundFairness />

              {/* Active workers */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Active workers
                </div>
                <WorkerList />
              </div>
            </div>
          )}

          {tab === 'profile' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-slate-100 font-semibold">Pool Profile</p>
                    <p className="text-xs text-slate-400">
                      {isAuthenticated ? `Signed in as ${user?.email || 'user'}` : 'Not signed in. Profile will be saved locally in this browser.'}
                    </p>
                  </div>
                  {profileStatus && <span className="text-xs text-cyan-300">{profileStatus}</span>}
                </div>

                <div className="space-y-3">
                  <label className="text-xs text-slate-400">Payout wallet addresses (comma-separated)</label>
                  <input
                    value={profile.walletAddress}
                    onChange={(e) => setProfile((prev) => ({ ...prev, walletAddress: e.target.value }))}
                    placeholder="qbtct1..., qbtct1..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Rig / device aliases</p>
                  <div className="grid md:grid-cols-3 gap-2">
                    <input
                      value={newRigAlias}
                      onChange={(e) => setNewRigAlias(e.target.value)}
                      placeholder="rig alias (e.g. gpu01)"
                      className="md:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                    />
                    <select
                      value={newRigLane}
                      onChange={(e) => setNewRigLane(e.target.value as LaneTierKey | 'auto')}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="browser">Browser</option>
                      <option value="hobby">Hobby</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const alias = newRigAlias.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
                        if (!alias) return;
                        setProfile((prev) => ({ ...prev, rigs: normalizeRigs([...prev.rigs, { alias, lane: newRigLane }]) }));
                        setNewRigAlias('');
                        setNewRigLane('auto');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 text-xs hover:bg-cyan-500/10"
                    >
                      Add rig
                    </button>
                    <button
                      onClick={() => void saveProfile()}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400"
                    >
                      Save profile
                    </button>
                  </div>
                  {profile.rigs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {profile.rigs.map((rig) => (
                        <span key={`${rig.alias}-${rig.lane}`} className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900 text-slate-200">
                          {rig.alias} · {rig.lane}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <StatCard label="Devices connected" value={profileMetrics.connectedDevices} color="text-cyan-300" />
                <StatCard label="24h QBTC earnings" value={`${profileMetrics.earnings24h.toFixed(6)} QBTC`} color="text-amber-300" />
                <StatCard label="All-time QBTC earnings" value={`${profileMetrics.earningsAllTime.toFixed(6)} QBTC`} color="text-emerald-300" />
                <StatCard label="Current hash rate" value={formatHashrate(profileMetrics.currentHashrate)} color="text-violet-300" />
                <StatCard label="Est. hashes (24h)" value={formatHashCount(profileMetrics.estimatedHashes24h)} color="text-cyan-300" />
                <StatCard label="All-time weighted work" value={profileMetrics.weightedAllTime.toFixed(4)} color="text-emerald-300" />
                <StatCard label="Wallets saved" value={profileWalletCount} />
                <StatCard label="Rigs saved" value={profile.rigs.length} />
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Profile-linked workers
                </div>
                {profileMatchedWorkers.length === 0 ? (
                  <p className="text-sm text-slate-400">No active workers found for this wallet/rig profile yet.</p>
                ) : (
                  <div className="space-y-2">
                    {profileMatchedWorkers.slice(0, 20).map((worker) => (
                      <div key={worker.worker_name} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold text-cyan-300 truncate max-w-xs">{worker.worker_name}</p>
                          <p className="text-xs text-slate-500 font-mono truncate max-w-xs">{worker.payout_address}</p>
                        </div>
                        <div className="text-right text-xs space-y-0.5">
                          <p className="text-violet-300">Hash: {formatHashrate(Number(worker.recent_hashrate ?? 0))}</p>
                          <p className="text-amber-300">24h: {Number(worker.earnings_24h ?? 0).toFixed(6)} QBTC</p>
                          <p className="text-emerald-300">All-time: {Number(worker.total_paid ?? 0).toFixed(6)} QBTC</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <QBTCNavigation />
    </div>
  );
}
