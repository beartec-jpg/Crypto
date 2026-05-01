/**
 * MultiChainMarketTab.tsx
 *
 * Multi-chain atomic swap marketplace — redesigned with entry / buy / sell views.
 *
 * Signing uses the internal wallet (password → unlockWallet → ethers.Wallet),
 * exactly the same as the rest of the wallet. No MetaMask required.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import {
  ArrowLeftRight,
  RefreshCw,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Info,
  KeyRound,
  ArrowUpDown,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import { unlockWallet } from '@/lib/walletService';
import {
  type ChainId,
  type V2Offer,
  buildV2Message,
  generateSecret,
  fetchV2AllOffers,
  cancelV2Offer,
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
  walletBtcPubKey?: string;  // compressed BTC pubkey hex — passed as takerPubKeyHex when accepting BTC offers
  walletBtcAddress?: string; // BTC address (testnet) for balance display
  walletXrpAddress?: string;
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

function formatAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

// ─── Price & balance helpers ──────────────────────────────────────────────────

const COINGECKO_CHAIN_IDS: Partial<Record<ChainId, string>> = {
  ETH:  'ethereum',
  XRP:  'ripple',
  BNB:  'binancecoin',
  BTC:  'bitcoin',
  USDC: 'usd-coin',
};

const _priceCache: Record<string, { price: number; ts: number }> = {};

async function fetchCoinPrice(chain: ChainId): Promise<number | null> {
  const id = COINGECKO_CHAIN_IDS[chain];
  if (!id) return null;
  const cached = _priceCache[id];
  if (cached && Date.now() - cached.ts < 60_000) return cached.price;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return cached?.price ?? null;
    const data = await res.json() as Record<string, { usd?: number }>;
    const price = data[id]?.usd ?? null;
    if (price) _priceCache[id] = { price, ts: Date.now() };
    return price;
  } catch {
    return cached?.price ?? null;
  }
}

async function fetchChainBalance(
  chain: ChainId,
  evmAddress: string,
  xrpAddress: string,
  qbtcAddress?: string,
  btcAddress?: string,
): Promise<string | null> {
  try {
    if (chain === 'ETH' || chain === 'BNB' || chain === 'USDC') {
      const rpcUrl = chain === 'BNB'
        ? (import.meta.env.VITE_BNB_RPC_URL || 'https://bsc-testnet.publicnode.com')
        : (import.meta.env.VITE_ETH_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const bal = await provider.getBalance(evmAddress);
      return parseFloat(ethers.formatEther(bal)).toFixed(6);
    }
    if (chain === 'XRP' && xrpAddress) {
      const httpUrl = (import.meta.env.VITE_XRPL_HTTP_URL || 'https://s.altnet.rippletest.net:51234');
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'account_info', params: [{ account: xrpAddress, ledger_index: 'current' }] }),
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json() as { result?: { account_data?: { Balance?: string } } };
      const drops = data?.result?.account_data?.Balance;
      if (!drops) return null;
      return (Number(drops) / 1_000_000).toFixed(6);
    }
    if (chain === 'QBTC' && qbtcAddress) {
      const rpcProxy = import.meta.env.VITE_QBTC_RPC_URL || '/api/qbtc/rpc';
      const res = await fetch(rpcProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'scantxoutset', params: ['start', [{ desc: `addr(${qbtcAddress})` }]] }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json() as { result?: { total_amount?: number } };
      const amt = data?.result?.total_amount;
      if (amt == null) return null;
      return parseFloat(amt.toFixed(8)).toString();
    }
    if (chain === 'BTC' && btcAddress) {
      const esplora = import.meta.env.VITE_BTC_ESPLORA_URL || 'https://blockstream.info/testnet';
      const res = await fetch(`${esplora}/api/address/${btcAddress}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json() as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number }; mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } };
      const confirmed = (data.chain_stats?.funded_txo_sum ?? 0) - (data.chain_stats?.spent_txo_sum ?? 0);
      const unconfirmed = (data.mempool_stats?.funded_txo_sum ?? 0) - (data.mempool_stats?.spent_txo_sum ?? 0);
      return ((confirmed + unconfirmed) / 1e8).toFixed(8);
    }
  } catch { /* network failure — caller handles null */ }
  return null;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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

// ─── Accept Offer Modal ───────────────────────────────────────────────────────

function AcceptOfferModal({
  offer, walletId, walletEvmAddress, walletAddress, walletXrpAddress, walletPubKey, walletBtcPubKey, walletBtcAddress, onClose, onAccepted,
}: {
  offer: V2Offer | null;
  walletId: string; walletEvmAddress: string; walletAddress: string; walletXrpAddress: string;
  walletPubKey?: string; walletBtcPubKey?: string; walletBtcAddress?: string;
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
    if (offer.baseChain === 'XRP') setTakerAddress(walletXrpAddress || '');
    else if (offer.baseChain === 'QBTC') setTakerAddress(walletAddress);
    else if (offer.baseChain === 'BTC') setTakerAddress(walletBtcAddress || '');
    else if (['ETH', 'BNB', 'USDC'].includes(offer.baseChain)) setTakerAddress(walletEvmAddress);
    else setTakerAddress('');
  }, [offer, walletAddress, walletEvmAddress, walletXrpAddress, walletBtcAddress]);

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

      // Include the taker's pubkey so the maker can reconstruct the HTLC claim script.
      // The stored pubkey is used as the claimer in the BASE chain HTLC.
      // For BTC→QBTC: taker claims BTC → send BTC pubkey.
      // For QBTC→BTC: taker claims QBTC → send QBTC pubkey.
      let takerPubKeyHex: string | undefined;
      if (offer.baseChain === 'BTC') {
        takerPubKeyHex = walletBtcPubKey || undefined; // taker claims BTC → provide BTC pubkey
      } else if (offer.quoteChain === 'BTC') {
        takerPubKeyHex = walletBtcPubKey || undefined;
      } else {
        takerPubKeyHex = walletPubKey || undefined; // QBTC ECDSA pubkey
      }

      setStatus('submitting');
      const result = await postV2Accept({
        offerId: offer.id, takerChainAddress: takerAddress,
        takerPubKeyHex,
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
                <label className="block text-xs text-slate-400 mb-1">Your {offer.baseChain} receive address</label>
                <input type="text" placeholder={`Your ${offer.baseChain} address`} value={takerAddress}
                  readOnly autoComplete="off"
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono cursor-default select-all" />
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

// ─── Entry Screen ─────────────────────────────────────────────────────────────

function EntryScreen({ onBuy, onSell }: { onBuy: () => void; onSell: () => void }) {
  return (
    <div className="space-y-4 py-2">
      <div className="text-center space-y-1 mb-6">
        <h2 className="text-lg font-bold text-white">Multi-Chain Marketplace</h2>
        <p className="text-sm text-slate-400">Atomic swaps across QBTC, BTC, ETH, BNB, USDC and XRP</p>
      </div>

      <button
        onClick={onBuy}
        className="w-full flex flex-col items-center gap-2 py-6 px-5 rounded-2xl border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 hover:border-cyan-400/60 transition-all group"
      >
        <div className="flex items-center gap-3">
          <ShoppingCart size={28} className="text-cyan-400 group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold text-cyan-300">Buy</span>
        </div>
        <span className="text-sm text-slate-400 text-center">Browse all offers and accept one</span>
      </button>

      <button
        onClick={onSell}
        className="w-full flex flex-col items-center gap-2 py-6 px-5 rounded-2xl border-2 border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400/60 transition-all group"
      >
        <div className="flex items-center gap-3">
          <Tag size={28} className="text-purple-400 group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold text-purple-300">Sell</span>
        </div>
        <span className="text-sm text-slate-400 text-center">List your crypto for sale</span>
      </button>
    </div>
  );
}

// ─── Buy View ────────────────────────────────────────────────────────────────

type SortMode = 'amount_desc' | 'chain_asc';
type ChainFilter = ChainId | 'All';

function BuyView({
  walletId, walletEvmAddress, walletAddress, walletXrpAddress, walletPubKey, walletBtcPubKey, walletBtcAddress, onBack,
}: {
  walletId: string; walletEvmAddress: string; walletAddress: string; walletXrpAddress: string;
  walletPubKey?: string; walletBtcPubKey?: string; walletBtcAddress?: string;
  onBack: () => void;
}) {
  const [allOffers, setAllOffers] = useState<V2Offer[]>([]);
  const [loading, setLoading]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filterSelling, setFilterSelling] = useState<ChainFilter>('All');
  const [filterPayWith, setFilterPayWith] = useState<ChainFilter>('All');
  const [sortMode, setSortMode]     = useState<SortMode>('amount_desc');
  const [acceptTarget, setAcceptTarget] = useState<V2Offer | null>(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const offers = await fetchV2AllOffers();
      setAllOffers(offers);
      setLastRefresh(new Date());
    } catch {
      setAllOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffers();
    const t = setInterval(loadOffers, 15_000);
    return () => clearInterval(t);
  }, [loadOffers]);

  const filtered = allOffers
    .filter(o => filterSelling === 'All' || o.baseChain === filterSelling)
    .filter(o => filterPayWith === 'All' || o.quoteChain === filterPayWith)
    .sort((a, b) => {
      if (sortMode === 'amount_desc') return parseFloat(b.baseAmount) - parseFloat(a.baseAmount);
      return a.baseChain.localeCompare(b.baseChain);
    });

  const selectClass = 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <h2 className="text-base font-semibold text-white">Browse Offers</h2>
        <div className="ml-auto flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-slate-600 hidden sm:flex items-center gap-1">
              <Clock size={10} /> {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={loadOffers} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Selling</span>
          <select value={filterSelling} onChange={e => setFilterSelling(e.target.value as ChainFilter)} className={selectClass}>
            <option value="All">All</option>
            {ALL_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Pay with</span>
          <select value={filterPayWith} onChange={e => setFilterPayWith(e.target.value as ChainFilter)} className={selectClass}>
            <option value="All">All</option>
            {ALL_CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={() => setSortMode(m => m === 'amount_desc' ? 'chain_asc' : 'amount_desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:border-slate-500 transition-colors"
        >
          <ArrowUpDown size={12} />
          {sortMode === 'amount_desc' ? 'Amount ↓' : 'Chain A→Z'}
        </button>
        <span className="text-xs text-slate-600 ml-auto">{filtered.length} offer{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Offers table */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
        {loading && allOffers.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading offers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
            <ArrowLeftRight size={32} className="opacity-30" />
            <p className="text-sm">No open offers found</p>
            <p className="text-xs text-slate-600">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="text-left px-4 py-2.5">Selling</th>
                  <th className="text-left px-4 py-2.5">Wants</th>
                  <th className="text-left px-4 py-2.5">Rate</th>
                  <th className="text-left px-4 py-2.5">Age</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(offer => {
                  const isOwn = offer.authEvmAddress.toLowerCase() === walletEvmAddress.toLowerCase();
                  return (
                    <tr key={offer.id} className={`hover:bg-slate-800/30 transition-colors ${isOwn ? 'opacity-80' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChainBadge chain={offer.baseChain} />
                          <span className="font-mono font-medium text-white text-xs">
                            {parseFloat(offer.baseAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChainBadge chain={offer.quoteChain} />
                          <span className="font-mono text-cyan-300 text-xs">
                            {parseFloat(offer.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">
                        {formatRate(offer.baseAmount, offer.quoteAmount)} {CHAIN_SYMBOLS[offer.quoteChain]}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatAge(offer.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isOwn ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400 border border-slate-600">
                            Your listing
                          </span>
                        ) : (
                          <button
                            onClick={() => setAcceptTarget(offer)}
                            className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
                          >
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
        )}
      </div>

      {/* How it works */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-400 mb-2 flex items-center gap-1.5">
          <Info size={13} /> How multi-chain atomic swaps work
        </p>
        <p>1. <strong className="text-slate-300">Maker</strong> creates an offer with a secret hash — signed with wallet key.</p>
        <p>2. <strong className="text-slate-300">Taker</strong> accepts and locks quote-chain funds with the same hash.</p>
        <p>3. Maker reveals preimage to claim quote funds. Taker uses the revealed preimage to claim base funds.</p>
        <p>4. Timelocks ensure full refunds if either party abandons the swap.</p>
      </div>

      {acceptTarget && (
        <AcceptOfferModal
          offer={acceptTarget}
          walletId={walletId} walletEvmAddress={walletEvmAddress} walletAddress={walletAddress}
          walletXrpAddress={walletXrpAddress}
          walletPubKey={walletPubKey}
          walletBtcPubKey={walletBtcPubKey}
          walletBtcAddress={walletBtcAddress}
          onClose={() => setAcceptTarget(null)}
          onAccepted={loadOffers}
        />
      )}
    </div>
  );
}

// ─── Sell View ────────────────────────────────────────────────────────────────

function SellView({
  walletId, walletEvmAddress, walletAddress, walletXrpAddress, walletBtcAddress, onBack,
}: {
  walletId: string; walletEvmAddress: string; walletAddress: string; walletXrpAddress: string;
  walletBtcAddress?: string;
  onBack: () => void;
}) {
  // Chain selectors
  const [base, setBase]   = useState<ChainId>('XRP');
  const [quote, setQuote] = useState<ChainId>('ETH');

  // Form state
  const [baseAmount, setBaseAmount]   = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [makerAddress, setMakerAddress] = useState('');
  const [locktimeHours, setLocktimeHours] = useState(48);
  const [password, setPassword]       = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');

  // Balance & price state
  const [balance, setBalance]         = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [basePrice, setBasePrice]     = useState<number | null>(null);
  const [quotePrice, setQuotePrice]   = useState<number | null>(null);
  const quoteEditedRef = useRef(false);

  // Active listings state
  const [myListings, setMyListings]   = useState<V2Offer[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError]   = useState<string>('');

  // Auto-fill receive address based on quote chain
  useEffect(() => {
    if (['ETH', 'BNB', 'USDC'].includes(quote)) setMakerAddress(walletEvmAddress);
    else if (quote === 'XRP') setMakerAddress(walletXrpAddress || '');
    else if (quote === 'QBTC') setMakerAddress(walletAddress);
    else setMakerAddress('');
  }, [quote, walletAddress, walletEvmAddress, walletXrpAddress]);

  // When base changes, ensure quote is different
  useEffect(() => {
    if (quote === base) {
      const alt = ALL_CHAINS.find(c => c !== base);
      if (alt) setQuote(alt);
    }
  }, [base, quote]);

  // Fetch prices when pair changes
  useEffect(() => {
    quoteEditedRef.current = false;
    setQuoteAmount('');
    setBasePrice(null);
    setQuotePrice(null);
    fetchCoinPrice(base).then(setBasePrice);
    fetchCoinPrice(quote).then(setQuotePrice);
  }, [base, quote]);

  // Fetch balance when base changes
  useEffect(() => {
    setBalance(null);
    setBalanceLoading(true);
    fetchChainBalance(base, walletEvmAddress, walletXrpAddress, walletAddress, walletBtcAddress)
      .then(b => setBalance(b))
      .finally(() => setBalanceLoading(false));
  }, [base, walletEvmAddress, walletXrpAddress, walletAddress, walletBtcAddress]);

  // Auto-populate quote amount from market rate
  useEffect(() => {
    if (quoteEditedRef.current) return;
    if (!basePrice || !quotePrice || !baseAmount) { setQuoteAmount(''); return; }
    const qty = parseFloat(baseAmount);
    if (isNaN(qty) || qty <= 0) { setQuoteAmount(''); return; }
    setQuoteAmount((qty * basePrice / quotePrice).toFixed(6));
  }, [baseAmount, basePrice, quotePrice]);

  // Load my listings
  const loadMyListings = useCallback(async () => {
    setListingsLoading(true);
    try {
      const all = await fetchV2AllOffers();
      setMyListings(all.filter(o => o.authEvmAddress.toLowerCase() === walletEvmAddress.toLowerCase() && o.status === 'OPEN'));
    } catch {
      setMyListings([]);
    } finally {
      setListingsLoading(false);
    }
  }, [walletEvmAddress]);

  useEffect(() => { loadMyListings(); }, [loadMyListings]);

  const handleCancelListing = useCallback(async (offer: V2Offer) => {
    if (!password.trim()) { setCancelError('Enter your wallet password to cancel'); return; }
    setCancelError('');
    setCancellingId(offer.id);
    try {
      await cancelV2Offer(offer, walletId, password, signWithWallet);
      await loadMyListings();
    } catch (e: unknown) {
      setCancelError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  }, [password, walletId, loadMyListings]);

  const balanceNum   = balance   ? parseFloat(balance)   : null;
  const baseAmountNum = baseAmount ? parseFloat(baseAmount) : null;
  const insufficientBalance = balanceNum !== null && baseAmountNum !== null && baseAmountNum > balanceNum;
  const marketRate = basePrice && quotePrice ? basePrice / quotePrice : null;
  const busy = submitStatus === 'signing' || submitStatus === 'submitting';

  const handleBaseChange = (c: ChainId) => {
    setBase(c);
    if (quote === c) {
      const alt = ALL_CHAINS.find(ch => ch !== c);
      if (alt) setQuote(alt);
    }
  };

  const handleQuoteChange = (c: ChainId) => {
    if (c === base) return;
    setQuote(c);
  };

  const submitOffer = async () => {
    try {
      setErrorMsg('');
      if (!baseAmount || !quoteAmount || !makerAddress) { setErrorMsg('Fill in all fields'); return; }
      if (insufficientBalance) { setErrorMsg(`Insufficient ${base} balance (have ${balance}, need ${baseAmount})`); return; }
      if (!password.trim()) { setErrorMsg('Enter your wallet password'); return; }

      setSubmitStatus('signing');
      const { secret, secretHash } = await generateSecret();
      const timestamp = Math.floor(Date.now() / 1000);
      const makerLocktime = timestamp + locktimeHours * 3600;

      const message = buildV2Message(
        'CREATE_OFFER', base, quote,
        walletEvmAddress.toLowerCase(), baseAmount, quoteAmount,
        secretHash, makerLocktime, timestamp,
      );
      const signature = await signWithWallet(walletId, password, message);

      setSubmitStatus('submitting');
      await postV2Offer({
        baseChain: base, quoteChain: quote,
        baseAmount, quoteAmount, secretHash, makerLocktime,
        makerChainAddress: makerAddress,
        authEvmAddress: walletEvmAddress, signature, timestamp,
      });

      try {
        const existing = JSON.parse(localStorage.getItem('v2_secrets') || '{}');
        existing[secretHash] = { secret, createdAt: Date.now(), base, quote };
        localStorage.setItem('v2_secrets', JSON.stringify(existing));
      } catch { /* storage full */ }

      setSubmitStatus('done');
      setBaseAmount(''); setQuoteAmount(''); setPassword('');
      quoteEditedRef.current = false;
      loadMyListings();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setSubmitStatus('error');
    }
  };

  const chainBtnClass = (active: boolean, disabled: boolean) =>
    `px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
      disabled ? 'border-slate-800 bg-slate-900 text-slate-700 cursor-not-allowed' :
      active
        ? 'border-cyan-500 bg-cyan-500/15 text-white'
        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-200'
    }`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <h2 className="text-base font-semibold text-white">Create Listing</h2>
      </div>

      {/* Create listing form */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 space-y-4">
        <div className="text-xs text-slate-500 flex items-start gap-2 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
          Signed with your wallet's EVM key — no external wallet needed. Secret generated locally; server never sees the preimage.
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2">
          <KeyRound size={12} className="text-cyan-400" />
          <span className="font-mono">{truncate(walletEvmAddress, 10)}</span>
          <span className="text-slate-600 ml-auto">EVM signing key</span>
        </div>

        {/* Chain pickers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400 font-medium">You're selling</div>
            <div className="flex flex-wrap gap-1">
              {ALL_CHAINS.map(c => (
                <button key={c} onClick={() => handleBaseChange(c)}
                  className={chainBtnClass(base === c, false)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400 font-medium">You want to receive</div>
            <div className="flex flex-wrap gap-1">
              {ALL_CHAINS.map(c => (
                <button key={c} onClick={() => handleQuoteChange(c)}
                  disabled={c === base}
                  className={chainBtnClass(quote === c, c === base)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1">
              <span className="flex items-center justify-between">
                <span className="text-slate-400">Amount to sell ({base})</span>
                {balanceLoading
                  ? <span className="text-slate-600 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> checking…</span>
                  : balance !== null
                    ? <span className={insufficientBalance ? 'text-red-400 font-medium' : 'text-slate-500'}>
                        Bal: {balance} {base}
                      </span>
                    : null}
              </span>
            </label>
            <input type="number" min="0" step="any" placeholder="0.00" value={baseAmount}
              onChange={e => setBaseAmount(e.target.value)}
              className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none ${insufficientBalance ? 'border-red-500/60 focus:border-red-500' : 'border-slate-700 focus:border-cyan-500'}`} />
            {insufficientBalance && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> Insufficient {base} balance
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs mb-1">
              <span className="flex items-center justify-between">
                <span className="text-slate-400">Amount to receive ({quote})</span>
                {marketRate && !quoteEditedRef.current && (
                  <span className="text-slate-600">at market rate</span>
                )}
              </span>
            </label>
            <input type="number" min="0" step="any" placeholder="0.00" value={quoteAmount}
              onChange={e => { quoteEditedRef.current = true; setQuoteAmount(e.target.value); }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
            {marketRate && (
              <p className="text-xs text-slate-600 mt-1">
                1 {base} ≈ {marketRate.toFixed(6)} {quote}
                {marketRate && quoteEditedRef.current && quoteAmount && baseAmount && (() => {
                  const yourRate = parseFloat(quoteAmount) / parseFloat(baseAmount);
                  const pct = ((yourRate - marketRate) / marketRate) * 100;
                  if (isNaN(pct) || Math.abs(pct) < 0.01) return null;
                  return <span className={pct > 0 ? 'text-emerald-400 ml-1' : 'text-amber-400 ml-1'}>({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>;
                })()}
              </p>
            )}
          </div>
        </div>

        {/* Receive address */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Your {quote} receive address</label>
          <input type="text" placeholder={`${quote} address`} value={makerAddress}
            readOnly autoComplete="off"
            className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono cursor-default select-all" />
        </div>

        {/* Locktime */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Locktime</label>
          <div className="flex items-center gap-2">
            <input type="range" min="12" max="168" step="12" value={locktimeHours}
              onChange={e => setLocktimeHours(Number(e.target.value))} className="flex-1 accent-cyan-500" />
            <span className="text-sm text-slate-300 w-16 text-right">{locktimeHours}h</span>
          </div>
        </div>

        <PasswordField value={password} onChange={setPassword} disabled={busy} />

        {errorMsg && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />{errorMsg}
          </div>
        )}

        {submitStatus === 'done' && (
          <div className="space-y-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium">
              <CheckCircle2 size={14} /> Listing created!
            </div>
            <p className="text-xs text-slate-400">Your secret has been saved securely on this device.</p>
          </div>
        )}

        {submitStatus !== 'done' && (
          <button onClick={submitOffer} disabled={busy || !password.trim() || insufficientBalance}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {busy
              ? <><Loader2 size={14} className="animate-spin" />{submitStatus === 'signing' ? 'Signing…' : 'Submitting…'}</>
              : 'Create Listing'}
          </button>
        )}
      </div>

      {/* Your active listings */}
      <div className="space-y-3">
        {cancelError && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg p-2">
            <AlertCircle size={12} className="shrink-0" />{cancelError}
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">Your Active Listings</h3>
          <button onClick={loadMyListings} disabled={listingsLoading}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw size={11} className={listingsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {listingsLoading && myListings.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-slate-600 text-sm">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading…
          </div>
        ) : myListings.length === 0 ? (
          <div className="text-center py-6 text-slate-600 text-sm">No active listings</div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left px-4 py-2.5">Selling</th>
                    <th className="text-left px-4 py-2.5">Wants</th>
                    <th className="text-left px-4 py-2.5">Rate</th>
                    <th className="text-left px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {myListings.map(offer => (
                    <tr key={offer.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChainBadge chain={offer.baseChain} />
                          <span className="font-mono font-medium text-white text-xs">
                            {parseFloat(offer.baseAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChainBadge chain={offer.quoteChain} />
                          <span className="font-mono text-cyan-300 text-xs">
                            {parseFloat(offer.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">
                        {formatRate(offer.baseAmount, offer.quoteAmount)} {CHAIN_SYMBOLS[offer.quoteChain]}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatAge(offer.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleCancelListing(offer)}
                          disabled={cancellingId === offer.id}
                          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                        >
                          {cancellingId === offer.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MultiChainMarketTab({
  walletId, userId: _userId, walletEvmAddress, walletAddress, walletPubKey, walletXrpAddress = '', walletBtcPubKey = '', walletBtcAddress = '',
}: MultiChainMarketTabProps) {
  const [view, setView] = useState<'entry' | 'buy' | 'sell'>('entry');

  if (view === 'buy') {
    return (
      <BuyView
        walletId={walletId}
        walletEvmAddress={walletEvmAddress}
        walletAddress={walletAddress}
        walletXrpAddress={walletXrpAddress}
        walletPubKey={walletPubKey}
        walletBtcPubKey={walletBtcPubKey}
        walletBtcAddress={walletBtcAddress}
        onBack={() => setView('entry')}
      />
    );
  }

  if (view === 'sell') {
    return (
      <SellView
        walletId={walletId}
        walletEvmAddress={walletEvmAddress}
        walletAddress={walletAddress}
        walletXrpAddress={walletXrpAddress}
        walletBtcAddress={walletBtcAddress}
        onBack={() => setView('entry')}
      />
    );
  }

  return <EntryScreen onBuy={() => setView('buy')} onSell={() => setView('sell')} />;
}
