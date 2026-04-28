/**
 * MultiChainMarketTab.tsx
 *
 * Multi-chain atomic swap marketplace — v2 order book, offer creation,
 * and swap acceptance UI. Integrated into the wallet MarketplaceTab.
 *
 * Signing uses the internal wallet (password → unlockWallet → ethers.Wallet),
 * exactly the same as the rest of the wallet. No MetaMask required.
 */

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  ArrowLeftRight,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Info,
  KeyRound,
} from 'lucide-react';
import { unlockWallet } from '@/lib/walletService';
import {
  type ChainId,
  type V2Offer,
  type V2Stats,
  buildV2Message,
  generateSecret,
  fetchV2Offers,
  fetchV2Stats,
  postV2Offer,
  postV2Accept,
} from '@/lib/swapV2Api';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MultiChainMarketTabProps {
  walletId: string;
  userId: string;
  walletEvmAddress: string;
  walletAddress: string;
  walletPubKey: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CHAINS: ChainId[] = ['QBTC', 'BTC', 'ETH', 'BNB', 'USDC', 'XRP'];

const CHAIN_COLORS: Record<ChainId, string> = {
  QBTC: 'text-cyan-400 bg-cyan-400/10 border-cyan-500/30',
  BTC:  'text-orange-400 bg-orange-400/10 border-orange-500/30',
  ETH:  'text-blue-400 bg-blue-400/10 border-blue-500/30',
  BNB:  'text-yellow-400 bg-yellow-400/10 border-yellow-500/30',
  USDC: 'text-green-400 bg-green-400/10 border-green-500/30',
  XRP:  'text-indigo-400 bg-indigo-400/10 border-indigo-500/30',
};

const CHAIN_SYMBOLS: Record<ChainId, string> = {
  QBTC: 'QBTC', BTC: 'BTC', ETH: 'ETH', BNB: 'BNB', USDC: 'USDC', XRP: 'XRP',
};

// ─── Internal wallet signer ──────────────────────────────────────────────────

async function signWithWallet(walletId: string, password: string, message: string): Promise<string> {
  const wallet = await unlockWallet(walletId, password);
  const ethPrivateKey = wallet.privateKeys.ethereum;
  if (!ethPrivateKey) throw new Error('Ethereum key not found in wallet');
  const signer = new ethers.Wallet('0x' + ethPrivateKey);
  return signer.signMessage(message);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(addr: string, chars = 8): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function formatRate(base: string, quote: string): string {
  const b = parseFloat(base);
  const q = parseFloat(quote);
  if (!b || !q) return '—';
  return (q / b).toFixed(6);
}

function ChainBadge({ chain }: { chain: ChainId }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${CHAIN_COLORS[chain]}`}>
      {chain}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'OPEN'           ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    status === 'MATCHED'        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
    status === 'LOCKED'         ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
    status === 'COMPLETE'       ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    status === 'PENDING_SIDE_A' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
    status === 'SIDE_A_LOCKED'  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
    status === 'SIDE_B_LOCKED'  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
    'bg-slate-700 text-slate-400 border-slate-600';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="ml-1 text-slate-500 hover:text-slate-300 transition-colors" title="Copy">
      {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Pair Selector ────────────────────────────────────────────────────────────

function PairSelector({
  selected, onChange,
}: {
  selected: [ChainId, ChainId];
  onChange: (pair: [ChainId, ChainId]) => void;
}) {
  const [sell, buy] = selected;

  const handleSell = (chain: ChainId) => {
    const newBuy = chain === buy
      ? ALL_CHAINS.find(c => c !== chain) ?? ALL_CHAINS.filter(c => c !== chain)[0]
      : buy;
    onChange([chain, newBuy]);
  };

  const handleBuy = (chain: ChainId) => {
    const newSell = chain === sell
      ? ALL_CHAINS.find(c => c !== chain) ?? ALL_CHAINS.filter(c => c !== chain)[0]
      : sell;
    onChange([newSell, chain]);
  };

  const chainSelectClass = (active: boolean) =>
    `px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
      active
        ? 'border-cyan-500 bg-cyan-500/15 text-white'
        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-200'
    }`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Sell side */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider px-1">Sell</div>
          <div className="flex flex-col gap-1">
            {ALL_CHAINS.map(chain => (
              <button
                key={chain}
                onClick={() => handleSell(chain)}
                disabled={chain === buy}
                className={`${chainSelectClass(sell === chain)} disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>

        {/* Buy side */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider px-1">Buy</div>
          <div className="flex flex-col gap-1">
            {ALL_CHAINS.map(chain => (
              <button
                key={chain}
                onClick={() => handleBuy(chain)}
                disabled={chain === sell}
                className={`${chainSelectClass(buy === chain)} disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats, base, quote }: { stats: V2Stats | null; base: ChainId; quote: ChainId }) {
  if (!stats) return null;
  const swapRow  = stats.swaps.find(s => s.baseChain === base && s.quoteChain === quote);
  const offerRow = stats.offers.find(o => o.baseChain === base && o.quoteChain === quote);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: 'Open Offers',  value: offerRow?.open     ?? 0, color: 'text-cyan-400' },
        { label: 'Active Swaps', value: swapRow?.active    ?? 0, color: 'text-blue-400' },
        { label: 'Completed',    value: swapRow?.completed ?? 0, color: 'text-emerald-400' },
        { label: 'Total',        value: swapRow?.total     ?? 0, color: 'text-purple-400' },
      ].map(stat => (
        <div key={stat.label} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Order Book ───────────────────────────────────────────────────────────────

function OrderBook({
  offers, base, quote, loading, onAccept, onCancel, walletEvmAddress,
}: {
  offers: V2Offer[];
  base: ChainId;
  quote: ChainId;
  loading: boolean;
  onAccept: (offer: V2Offer) => void;
  onCancel: (offer: V2Offer) => void;
  walletEvmAddress: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading...
      </div>
    );
  }
  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
        <ArrowLeftRight size={32} className="opacity-30" />
        <p className="text-sm">No open offers for {base}/{quote}</p>
        <p className="text-xs text-slate-600">Create one below</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wider">
            <th className="text-left pb-2 pr-4">Sell ({CHAIN_SYMBOLS[base]})</th>
            <th className="text-left pb-2 pr-4">Buy ({CHAIN_SYMBOLS[quote]})</th>
            <th className="text-left pb-2 pr-4">Rate</th>
            <th className="text-left pb-2 pr-4">Maker</th>
            <th className="text-left pb-2">Status</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {offers.map(offer => {
            const isOwn = offer.authEvmAddress.toLowerCase() === walletEvmAddress.toLowerCase();
            // Inverted offer: base/quote are flipped relative to current view
            const isInverted = offer.baseChain === quote && offer.quoteChain === base;
            return (
            <tr key={offer.id} className={`hover:bg-slate-800/30 transition-colors ${isOwn ? 'opacity-70' : ''}`}>
              <td className="py-2 pr-4 font-mono font-medium text-white">
                {isInverted
                  ? parseFloat(offer.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })
                  : parseFloat(offer.baseAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
              </td>
              <td className="py-2 pr-4 font-mono text-cyan-300">
                {isInverted
                  ? parseFloat(offer.baseAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })
                  : parseFloat(offer.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
              </td>
              <td className="py-2 pr-4 font-mono text-slate-300 text-xs">
                {isInverted
                  ? formatRate(offer.quoteAmount, offer.baseAmount)
                  : formatRate(offer.baseAmount, offer.quoteAmount)}
              </td>
              <td className="py-2 pr-4 text-slate-400 text-xs font-mono">
                {isOwn
                  ? <span className="text-cyan-400/70">You</span>
                  : <>{truncate(offer.authEvmAddress)}<CopyButton text={offer.authEvmAddress} /></>}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={offer.status} />
              </td>
              <td className="py-2">
                {offer.status === 'OPEN' && (
                  isOwn
                    ? <button onClick={() => onCancel(offer)}
                        className="px-2.5 py-1 text-xs bg-red-900/40 hover:bg-red-700/60 text-red-300 rounded transition-colors font-medium">
                        Cancel
                      </button>
                    : <button onClick={() => onAccept(offer)}
                        className="px-2.5 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors font-medium">
                        Accept
                      </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Password field ───────────────────────────────────────────────────────────

function PasswordField({ value, onChange, disabled = false }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
        <KeyRound size={11} /> Wallet password (to sign)
      </label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Your wallet password"
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}

// ─── Create Offer Form ────────────────────────────────────────────────────────

function CreateOfferForm({
  base, quote, walletId, walletEvmAddress, walletAddress, onCreated,
}: {
  base: ChainId; quote: ChainId;
  walletId: string; walletEvmAddress: string; walletAddress: string;
  onCreated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [baseAmount, setBaseAmount] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [makerAddress, setMakerAddress] = useState('');
  const [locktimeHours, setLocktimeHours] = useState(48);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (quote === 'QBTC') setMakerAddress(walletAddress);
    else if (['ETH', 'BNB', 'USDC'].includes(quote)) setMakerAddress(walletEvmAddress);
    else setMakerAddress('');
  }, [quote, walletAddress, walletEvmAddress]);

  const busy = status === 'signing' || status === 'submitting';

  const submitOffer = async () => {
    try {
      setErrorMsg('');
      if (!baseAmount || !quoteAmount || !makerAddress) { setErrorMsg('Fill in all fields'); return; }
      if (!password.trim()) { setErrorMsg('Enter your wallet password'); return; }

      setStatus('signing');
      const { secret, secretHash } = await generateSecret();
      const timestamp = Math.floor(Date.now() / 1000);
      const makerLocktime = timestamp + locktimeHours * 3600;

      const message = buildV2Message(
        'CREATE_OFFER', base, quote,
        walletEvmAddress.toLowerCase(), baseAmount, quoteAmount,
        secretHash, makerLocktime, timestamp,
      );
      const signature = await signWithWallet(walletId, password, message);

      setStatus('submitting');
      await postV2Offer({
        baseChain: base, quoteChain: quote,
        baseAmount, quoteAmount, secretHash, makerLocktime,
        makerChainAddress: makerAddress,
        authEvmAddress: walletEvmAddress, signature, timestamp,
      });

      // Save secret silently to localStorage — no manual save needed
      try {
        const existing = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        existing[secretHash] = { secret, createdAt: Date.now(), base, quote };
        localStorage.setItem('v2_secrets', JSON.stringify(existing));
      } catch { /* storage full — silently ignore */ }
      setStatus('done');
      setBaseAmount(''); setQuoteAmount(''); setPassword('');
      onCreated();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus size={16} className="text-cyan-400" />
          Create Offer — Sell {CHAIN_SYMBOLS[base]} for {CHAIN_SYMBOLS[quote]}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 bg-slate-800/20">
          <div className="pt-3 text-xs text-slate-500 flex items-start gap-2 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
            Signed with your wallet's EVM key — no external wallet needed. Secret generated locally; server never sees the preimage.
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
            <KeyRound size={12} className="text-cyan-400" />
            <span className="font-mono">{truncate(walletEvmAddress, 10)}</span>
            <span className="text-slate-600 ml-auto">EVM signing key</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Sell ({base})</label>
              <input type="number" min="0" step="any" placeholder="0.00" value={baseAmount}
                onChange={e => setBaseAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Receive ({quote})</label>
              <input type="number" min="0" step="any" placeholder="0.00" value={quoteAmount}
                onChange={e => setQuoteAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Your {quote} receive address</label>
            <input type="text" placeholder={`${quote} address`} value={makerAddress}
              onChange={e => setMakerAddress(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none font-mono" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Locktime</label>
            <div className="flex items-center gap-2">
              <input type="range" min="12" max="168" step="12" value={locktimeHours}
                onChange={e => setLocktimeHours(Number(e.target.value))} className="flex-1 accent-cyan-500" />
              <span className="text-sm text-slate-300 w-16 text-right">{locktimeHours}h</span>
            </div>
          </div>

          {baseAmount && quoteAmount && (
            <div className="text-xs text-slate-400 bg-slate-800/50 rounded-lg p-2 border border-slate-700">
              Rate: 1 {base} = {formatRate(baseAmount, quoteAmount)} {quote}
            </div>
          )}

          <PasswordField value={password} onChange={setPassword} disabled={busy} />

          {errorMsg && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />{errorMsg}
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium">
                <CheckCircle2 size={14} /> Offer created!
              </div>
              <p className="text-xs text-slate-400">Your secret has been saved securely on this device. You won't need to save it manually.</p>
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {busy ? <><Loader2 size={14} className="animate-spin" />{status === 'signing' ? 'Signing…' : 'Submitting…'}</> : 'Create Offer'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Accept Offer Modal ───────────────────────────────────────────────────────

function AcceptOfferModal({
  offer, walletId, walletEvmAddress, walletAddress, onClose, onAccepted,
}: {
  offer: V2Offer | null;
  walletId: string; walletEvmAddress: string; walletAddress: string;
  onClose: () => void; onAccepted: () => void;
}) {
  const [takerAddress, setTakerAddress] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [swapResult, setSwapResult] = useState<{
    swapId: string; sideALocktime: number; sideBLocktime: number;
    baseChain: string; quoteChain: string;
  } | null>(null);

  useEffect(() => {
    if (!offer) return;
    if (offer.quoteChain === 'QBTC') setTakerAddress(walletAddress);
    else if (['ETH', 'BNB', 'USDC'].includes(offer.quoteChain)) setTakerAddress(walletEvmAddress);
    else setTakerAddress('');
  }, [offer, walletAddress, walletEvmAddress]);

  if (!offer) return null;
  const busy = status === 'signing' || status === 'submitting';

  const submitAccept = async () => {
    try {
      setErrorMsg('');
      if (!takerAddress) { setErrorMsg('Enter your receive address'); return; }
      if (!password.trim()) { setErrorMsg('Enter your wallet password'); return; }

      setStatus('signing');
      const timestamp = Math.floor(Date.now() / 1000);
      const message = buildV2Message(
        'ACCEPT_OFFER', offer.baseChain, offer.quoteChain,
        offer.id, walletEvmAddress.toLowerCase(), timestamp,
      );
      const signature = await signWithWallet(walletId, password, message);

      setStatus('submitting');
      const result = await postV2Accept({
        offerId: offer.id, takerChainAddress: takerAddress,
        authEvmAddress: walletEvmAddress, signature, timestamp,
      });
      setSwapResult(result);
      setStatus('done');
      onAccepted();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-cyan-400" /> Accept Offer
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">You provide</span>
              <span className="font-semibold text-white font-mono">
                {parseFloat(offer.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {offer.quoteChain}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">You receive</span>
              <span className="font-semibold text-cyan-300 font-mono">
                {parseFloat(offer.baseAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {offer.baseChain}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-700">
              <span>Rate</span>
              <span className="font-mono">1 {offer.baseChain} = {formatRate(offer.baseAmount, offer.quoteAmount)} {offer.quoteChain}</span>
            </div>
          </div>

          {status === 'done' && swapResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-medium">
                <CheckCircle2 size={16} /> Swap initiated!
              </div>
              <div className="text-xs text-slate-400 space-y-1 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <p><span className="text-slate-500">Swap ID:</span> <span className="font-mono text-slate-300 break-all">{swapResult.swapId}</span></p>
                <p><span className="text-slate-500">Maker locks by:</span> <span className="text-slate-300">{new Date(swapResult.sideALocktime * 1000).toLocaleString()}</span></p>
                <p><span className="text-slate-500">Your lock by:</span> <span className="text-slate-300">{new Date(swapResult.sideBLocktime * 1000).toLocaleString()}</span></p>
              </div>
              <div className="text-xs text-amber-300/80 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                Next: wait for maker to lock {swapResult.baseChain}, then lock your {swapResult.quoteChain} HTLC.
              </div>
              <button onClick={onClose} className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors">Close</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
                <KeyRound size={12} className="text-cyan-400" />
                <span className="font-mono">{truncate(walletEvmAddress, 10)}</span>
                <span className="text-slate-600 ml-auto">EVM signing key</span>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Your {offer.quoteChain} lock address</label>
                <input type="text" placeholder={`Your ${offer.quoteChain} address`} value={takerAddress}
                  onChange={e => setTakerAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none font-mono" />
              </div>

              <PasswordField value={password} onChange={setPassword} disabled={busy} />

              {errorMsg && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />{errorMsg}
                </div>
              )}

              <button onClick={submitAccept} disabled={busy || !password.trim()}
                className="w-full py-2.5 rounded-lg font-medium text-sm bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {busy ? <><Loader2 size={14} className="animate-spin" />{status === 'signing' ? 'Signing…' : 'Submitting…'}</> : 'Accept & Initiate Swap'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MultiChainMarketTab({
  walletId, userId: _userId, walletEvmAddress, walletAddress, walletPubKey: _walletPubKey,
}: MultiChainMarketTabProps) {
  const [selectedPair, setSelectedPair] = useState<[ChainId, ChainId]>(['QBTC', 'USDC']);
  const [offers, setOffers]             = useState<V2Offer[]>([]);
  const [stats, setStats]               = useState<V2Stats | null>(null);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState<V2Offer | null>(null);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);

  const [base, quote] = selectedPair;

  const loadOffers = useCallback(async () => {
    try {
      setLoadingOffers(true);
      // Fetch both directions: base/quote AND quote/base (inverted)
      const [offersData, invertedData, statsData] = await Promise.all([
        fetchV2Offers(base, quote),
        fetchV2Offers(quote, base),
        fetchV2Stats(base, quote),
      ]);
      // Merge: normal offers first, then inverted (so selling ETH shows as a BUY opportunity)
      setOffers([...offersData, ...invertedData]);
      setStats(statsData);
      setLastRefresh(new Date());
    } catch {
      setOffers([]);
    } finally {
      setLoadingOffers(false);
    }
  }, [base, quote]);

  useEffect(() => {
    loadOffers();
    const t = setInterval(loadOffers, 15_000);
    return () => clearInterval(t);
  }, [loadOffers]);

  return (
    <div className="space-y-6">
      <PairSelector selected={selectedPair} onChange={setSelectedPair} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ChainBadge chain={base} />
            <ArrowLeftRight size={14} className="text-slate-500" />
            <ChainBadge chain={quote} />
          </div>
          <span className="text-sm font-semibold text-white">{base}/{quote}</span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-600 hidden sm:block">
              <Clock size={10} className="inline mr-1" />
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={loadOffers} disabled={loadingOffers}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loadingOffers ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <StatsBar stats={stats} base={base} quote={quote} />

      <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
          Open Offers ({base}/{quote})
        </div>
        <OrderBook offers={offers} base={base} quote={quote} loading={loadingOffers}
          onAccept={setAcceptTarget}
          onCancel={offer => {
            // TODO: wire up cancel endpoint once server-side cancel is implemented
            alert(`To cancel offer ${offer.id.slice(0,8)}…, contact support or wait for it to expire.`);
          }}
          walletEvmAddress={walletEvmAddress}
        />
      </div>

      <CreateOfferForm
        base={base} quote={quote}
        walletId={walletId} walletEvmAddress={walletEvmAddress} walletAddress={walletAddress}
        onCreated={loadOffers}
      />

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-400 mb-2 flex items-center gap-1.5">
          <Info size={13} /> How multi-chain atomic swaps work
        </p>
        <p>1. <strong className="text-slate-300">Maker</strong> creates an offer with a secret hash — signs with wallet key.</p>
        <p>2. <strong className="text-slate-300">Taker</strong> accepts and locks {quote} with the same hash.</p>
        <p>3. Maker reveals preimage to claim {quote}. Taker uses the revealed preimage to claim {base}.</p>
        <p>4. Timelocks ensure full refunds if either party abandons the swap.</p>
      </div>

      {acceptTarget && (
        <AcceptOfferModal
          offer={acceptTarget}
          walletId={walletId} walletEvmAddress={walletEvmAddress} walletAddress={walletAddress}
          onClose={() => setAcceptTarget(null)}
          onAccepted={loadOffers}
        />
      )}
    </div>
  );
}
