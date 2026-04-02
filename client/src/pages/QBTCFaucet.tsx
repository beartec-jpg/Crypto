import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Pickaxe, Zap, ShieldCheck, Hourglass, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';

type FaucetPhase = 'idle' | 'mining' | 'success' | 'error';

interface FaucetResponse {
  success: boolean;
  txid?: string;
  explorerUrl?: string;
  nextClaimAt?: number;
  error?: string;
}

const MINING_STAGES = ['Mining block...', 'Block found!', 'Sending QBTC...'];

function isValidQbtcTestnetAddress(address: string): boolean {
  return address.toLowerCase().startsWith('qbtct1') && /^[a-z0-9]{14,90}$/i.test(address);
}

export default function QBTCFaucetPage() {
  const [address, setAddress] = useState('');
  const [phase, setPhase] = useState<FaucetPhase>('idle');
  const [message, setMessage] = useState('Enter your qbtct1... address and start mining.');
  const [progress, setProgress] = useState(0);
  const [txid, setTxid] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [stats, setStats] = useState<{ blockHeight?: number; difficulty?: number; network?: string }>({});
  const [claimCountdown, setClaimCountdown] = useState<string | null>(null);

  const addressError = useMemo(() => {
    if (!address.trim()) return null;
    if (!isValidQbtcTestnetAddress(address.trim())) return 'Please enter a valid QBTC testnet address (qbtct1...).';
    return null;
  }, [address]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/qbtc-faucet/stats');
      if (!res.ok) return;
      const data = await res.json();
      setStats({
        blockHeight: data.blockHeight,
        difficulty: data.difficulty,
        network: data.network,
      });
    } catch {
      // Best-effort UI enhancement only.
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const runMiningAnimation = async () => {
    setPhase('mining');
    setProgress(8);
    setMessage(MINING_STAGES[0]);
    await new Promise((r) => setTimeout(r, 800));

    setProgress(48);
    setMessage(MINING_STAGES[1]);
    await new Promise((r) => setTimeout(r, 900));

    setProgress(82);
    setMessage(MINING_STAGES[2]);
  };

  const formatCountdown = (nextClaimAt?: number): string | null => {
    if (!nextClaimAt) return null;
    const ms = nextClaimAt - Date.now();
    if (ms <= 0) return null;

    const mins = Math.ceil(ms / 60000);
    const hours = Math.floor(mins / 60);
    const remain = mins % 60;
    if (hours <= 0) return `${remain}m`;
    return `${hours}h ${remain}m`;
  };

  const onClaim = async () => {
    const cleanAddress = address.trim();
    if (!isValidQbtcTestnetAddress(cleanAddress)) {
      setPhase('error');
      setMessage('Invalid address format. Use a qbtct1... testnet address.');
      return;
    }

    await runMiningAnimation();

    try {
      let recaptchaToken: string | undefined;
      const captchaSiteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY;

      if (captchaSiteKey && (window as any).grecaptcha?.execute) {
        recaptchaToken = await (window as any).grecaptcha.execute(captchaSiteKey, { action: 'qbtc_faucet_claim' });
      }

      const res = await fetch('/api/qbtc-faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: cleanAddress, recaptchaToken }),
      });

      const data = (await res.json()) as FaucetResponse;

      if (!res.ok || !data.success) {
        setPhase('error');
        setProgress(100);
        setClaimCountdown(formatCountdown(data.nextClaimAt));
        setMessage(data.error || 'Faucet request failed. Please try again later.');
        return;
      }

      setTxid(data.txid || '');
      setExplorerUrl(data.explorerUrl || '');
      setProgress(100);
      setPhase('success');
      setMessage('50 QBTC sent successfully. Your transaction is on the way.');
      await fetchStats();
    } catch {
      setPhase('error');
      setProgress(100);
      setMessage('Unable to reach faucet backend. Check server and QBTC node status.');
    }
  };

  const reset = () => {
    setPhase('idle');
    setProgress(0);
    setTxid('');
    setExplorerUrl('');
    setClaimCountdown(null);
    setMessage('Enter your qbtct1... address and start mining.');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-emerald-500 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              Back to BearTec
            </button>
          </Link>
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap justify-end">
            <Link href="/qbtc">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300">
                QBTC Info
              </button>
            </Link>
            <Link href="/marketplace">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300">
                Marketplace
              </button>
            </Link>
            <Link href="/qbtc-scan">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300">
                QBTC Scan
              </button>
            </Link>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Testnet only • One claim per hour
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 backdrop-blur p-6 md:p-8">
          <div className="flex items-center gap-3 mb-2">
            <Pickaxe className="w-7 h-7 text-cyan-400" />
            <h1 className="text-3xl font-bold tracking-tight">QBTC Testnet Faucet</h1>
          </div>
          <p className="text-slate-300 mb-6">
            Claim 50 QBTC for testing. Spin up experiments, break things safely, and mine the future.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400">Network</p>
              <p className="font-semibold text-cyan-300">{stats.network || 'QBTC Testnet'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400">Block Height</p>
              <p className="font-semibold">{stats.blockHeight ?? '...'}</p>
            </div>
            <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/60">
              <p className="text-slate-400">Difficulty</p>
              <p className="font-semibold">{stats.difficulty ?? '...'}</p>
            </div>
          </div>

          {phase !== 'success' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 block mb-2">QBTC Testnet Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="qbtct1q..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
                  disabled={phase === 'mining'}
                />
                {addressError && <p className="mt-2 text-sm text-rose-400">{addressError}</p>}
              </div>

              <button
                onClick={onClaim}
                disabled={!!addressError || !address.trim() || phase === 'mining'}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {phase === 'mining' ? 'Mining...' : 'Claim 50 QBTC'}
              </button>

              {(phase === 'mining' || phase === 'error') && (
                <div className="rounded-xl border border-slate-700 p-4 bg-slate-950/70">
                  <div className="h-2 rounded bg-slate-800 overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm flex items-center gap-2">
                    {phase === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <Zap className="w-4 h-4 text-cyan-300" />}
                    {message}
                  </p>
                  {claimCountdown && (
                    <p className="text-xs mt-2 text-amber-300 flex items-center gap-2">
                      <Hourglass className="w-3.5 h-3.5" />
                      Next claim available in {claimCountdown}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400">Rate limiting: You can claim once per hour per IP.</p>
            </div>
          )}

          {phase === 'success' && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
              <p className="text-emerald-300 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {message}
              </p>
              <div className="text-sm">
                <p className="text-slate-300 mb-1">Transaction ID</p>
                <p className="font-mono break-all text-cyan-300">{txid}</p>
              </div>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200 text-sm">
                  View on explorer
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <div>
                <button onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                  Claim Again Later
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}