// client/src/components/Wallet/MarketplaceTab.tsx
// QBTC ↔ USDC atomic swap marketplace — integrated into the wallet tab

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'wouter';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Filter,
  Lock,
  Search,
  Send,
  RefreshCw,
  Info,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { isSwapMainnetActive, EvmHTLC, getSwapNetworkConfig } from '@/lib/evmHTLC';
import {
  QBTCKeyPair,
  QBTCChain,
  createHTLCScript,
  getHTLCAddress,
  getQBTCRpcSettings,
  type QBTCNetwork,
  type QBTCHtlcParams,
} from '@/lib/qbtcService';
import { unlockWallet } from '@/lib/walletService';
import { ethers } from 'ethers';

const SWAP_API = (import.meta.env.VITE_SWAP_API_URL || '').replace(/\/$/, '');

// ─── Types ───────────────────────────────────────────────────────────────────

type SwapStatus =
  | 'PENDING_QBTC_LOCK'
  | 'QBTC_LOCKED'
  | 'EVM_LOCKED'
  | 'COMPLETE'
  | 'REFUNDED'
  | 'EXPIRED';

interface SwapOffer {
  id: string;
  sellerQbtcAddress: string;
  sellerEvmAddress: string;
  sellerPubKeyHex: string;
  qbtcAmount: string;
  usdcAmountRequested: string;
  secretHash: string | null;
  qbtcLocktime: number | null;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
  status: string;
  createdAt: string;
}

interface AtomicSwap {
  id: string;
  offerId: string;
  sellerQbtcAddress: string;
  sellerEvmAddress: string;
  sellerPubKeyHex: string;
  buyerQbtcAddress: string;
  buyerEvmAddress: string;
  buyerPubKeyHex: string;
  qbtcAmount: string;
  usdcAmount: string;
  secretHash: string;
  secret: string | null;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
  evmContractId: string | null;
  qbtcLocktime: number | null;
  evmLocktime: number | null;
  status: SwapStatus;
  createdAt: string;
}

interface AcceptResponse {
  swapId: string;
  secretHash: string;
  qbtcLocktime: number;
  evmLocktime: number;
  sellerPubKeyHex: string;
  buyerPubKeyHex: string;
  qbtcAmount: string;
  usdcAmount: string;
  status: string;
  qbtcHtlcTxid: string | null;
  qbtcHtlcAddress: string | null;
}

interface MarketplaceTabProps {
  userId: string;
  walletId: string;
  walletAddress: string;    // QBTC address
  walletPubKey: string;     // ECDSA pubkey hex (66 chars)
  walletEvmAddress: string; // EVM/Ethereum address
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayError(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const e = error as any;
    const rd = e.response?.data;
    if (typeof rd?.error === 'string' && rd.error.trim()) return rd.error;
    if (typeof rd?.message === 'string' && rd.message.trim()) return rd.message;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  return fallback;
}

function useCountdown(unixTs: number | null): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!unixTs) return;
    const tick = () => {
      const diff = unixTs - Math.floor(Date.now() / 1000);
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setLabel(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unixTs]);
  return label;
}

function statusBadge(status: SwapStatus | string) {
  switch (status) {
    case 'OPEN':              return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'PENDING_QBTC_LOCK': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'QBTC_LOCKED':       return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'EVM_LOCKED':        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    case 'COMPLETE':          return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'EXPIRED':
    case 'REFUNDED':          return 'bg-red-500/20 text-red-300 border-red-500/40';
    default:                  return 'bg-slate-700 text-slate-400 border-slate-600';
  }
}

function statusLabel(status: SwapStatus | string) {
  switch (status) {
    case 'PENDING_QBTC_LOCK': return 'Awaiting QBTC Lock';
    case 'QBTC_LOCKED':       return 'QBTC Locked';
    case 'EVM_LOCKED':        return 'USDC Locked';
    case 'COMPLETE':          return 'Complete';
    case 'EXPIRED':           return 'Expired';
    case 'REFUNDED':          return 'Refunded';
    default:                  return status;
  }
}

// ─── Seller: Lock QBTC in HTLC ──────────────────────────────────────────────

function SellerLockPanel({
  swap,
  walletId,
  onLocked,
}: {
  swap: AtomicSwap;
  walletId: string;
  onLocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'idle' | 'unlocking' | 'building' | 'broadcasting' | 'reporting'>('idle');
  const network: QBTCNetwork = isSwapMainnetActive() ? 'mainnet' : 'testnet';

  const handleLock = async () => {
    if (!password.trim()) { setError('Enter your wallet password'); return; }
    setLoading(true);
    setError('');
    try {
      setStep('unlocking');
      const wallet = await unlockWallet(walletId, password);
      const qbtcPrivateKey = wallet.privateKeys.qbtc;
      if (!qbtcPrivateKey) throw new Error('QBTC private key not found');
      const keyPair = QBTCKeyPair.fromECDSAPrivateKey(qbtcPrivateKey);

      setStep('building');
      const htlcParams: QBTCHtlcParams = {
        // Hash-only HTLC: no buyerPubKeyHex — anyone with secret can claim
        sellerPubKeyHex: swap.sellerPubKeyHex,
        secretHashHex: swap.secretHash,
        locktime: swap.qbtcLocktime!,
      };
      const htlcScript = createHTLCScript(htlcParams);
      const htlcAddress = getHTLCAddress(htlcScript, network);

      setStep('broadcasting');
      const qbtcChain = new QBTCChain(getQBTCRpcSettings());
      const txid = await qbtcChain.sendTransaction(keyPair, htlcAddress, swap.qbtcAmount);

      setStep('reporting');
      await axios.post(`${SWAP_API}/api/swap/lock/qbtc`, {
        swapId: swap.id,
        qbtcHtlcTxid: txid,
        qbtcHtlcAddress: htlcAddress,
      });

      setPassword('');
      onLocked();
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Failed to lock QBTC'));
    } finally {
      setLoading(false);
      setStep('idle');
    }
  };

  const stepLabels: Record<string, string> = {
    unlocking: 'Unlocking wallet…',
    building: 'Building HTLC transaction…',
    broadcasting: 'Broadcasting to QBTC network…',
    reporting: 'Confirming with swap server…',
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-amber-200 text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Your turn: Lock {swap.qbtcAmount} QBTC in HTLC
        </p>
        <p className="text-amber-300/70 text-xs mt-1">
          Enter your wallet password to sign and broadcast. Funds locked with a 48-hour refund window.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleLock()}
          placeholder="Wallet password"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
        />
        <button
          onClick={handleLock}
          disabled={loading || !password.trim()}
          className="px-4 py-2 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {loading ? 'Locking…' : 'Lock QBTC'}
        </button>
      </div>
      {loading && step !== 'idle' && (
        <p className="text-xs text-amber-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {stepLabels[step] || ''}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}

// ─── Buyer: Lock USDC via MetaMask ───────────────────────────────────────────

function BuyerLockPanel({
  swap,
  walletId,
  onLocked,
}: {
  swap: AtomicSwap;
  walletId: string;
  onLocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');

  const handleLock = async () => {
    if (!password.trim()) { setError('Enter your wallet password'); return; }
    setLoading(true);
    setError('');
    try {
      // 1. Unlock wallet to get Ethereum private key
      setStep('Unlocking wallet…');
      const wallet = await unlockWallet(walletId, password);
      const ethPrivateKey = wallet.privateKeys.ethereum;
      if (!ethPrivateKey) throw new Error('Ethereum private key not found in wallet');

      // 2. Create ethers.Wallet signer from the wallet's key
      setStep('Connecting to EVM network…');
      const config = getSwapNetworkConfig();
      if (!config.htlcContractAddress) throw new Error('EVM HTLC contract not configured (VITE_EVM_HTLC_CONTRACT)');
      if (!config.usdcContractAddress) throw new Error('USDC contract not configured (VITE_USDC_CONTRACT)');

      const provider = new ethers.JsonRpcProvider(config.evmRpcUrl);
      const signer = new ethers.Wallet('0x' + ethPrivateKey, provider);

      // 3. Approve USDC + create HTLC
      setStep('Approving USDC spend…');
      const evmHTLC = new EvmHTLC({
        contractAddress: config.htlcContractAddress,
        usdcAddress: config.usdcContractAddress,
        signerOrProvider: signer,
      });

      const usdcBaseUnits = BigInt(Math.round(Number(swap.usdcAmount) * 1_000_000));

      setStep('Creating EVM HTLC…');
      const contractId = await evmHTLC.initiate(
        swap.sellerEvmAddress,
        swap.secretHash,
        swap.evmLocktime!,
        usdcBaseUnits,
      );

      // 4. Report to swap server
      setStep('Confirming with swap server…');
      await axios.post(`${SWAP_API}/api/swap/lock/evm`, {
        swapId: swap.id,
        evmContractId: contractId,
      });

      setPassword('');
      onLocked();
    } catch (err: unknown) {
      setError(getDisplayError(err, 'Failed to lock USDC'));
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
        <p className="text-purple-200 text-sm font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Your turn: Lock {swap.usdcAmount} USDC in EVM HTLC
        </p>
        <p className="text-purple-300/70 text-xs mt-1">
          Enter your wallet password to approve USDC and create the hash time-lock on {isSwapMainnetActive() ? 'Ethereum' : 'Sepolia'}. 24-hour refund window.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleLock()}
          placeholder="Wallet password"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-purple-400 focus:outline-none text-sm"
        />
        <button
          onClick={handleLock}
          disabled={loading || !password.trim()}
          className="px-4 py-2 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {loading ? 'Locking…' : 'Lock USDC'}
        </button>
      </div>
      {loading && step && (
        <p className="text-xs text-purple-300/60 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {step}
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}

// ─── Single Swap Card ────────────────────────────────────────────────────────

function SwapCard({
  swap,
  walletAddress,
  walletId,
  onRefresh,
}: {
  swap: AtomicSwap;
  walletAddress: string;
  walletId: string;
  onRefresh: () => void;
}) {
  const isSeller = swap.sellerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
  const isBuyer = swap.buyerQbtcAddress?.toLowerCase() === walletAddress.toLowerCase();
  const role = isSeller ? 'Seller' : isBuyer ? 'Buyer' : 'Unknown';

  const qbtcCountdown = useCountdown(swap.qbtcLocktime);
  const evmCountdown = useCountdown(swap.evmLocktime);

  const needsSellerLock = isSeller && swap.status === 'PENDING_QBTC_LOCK';
  const needsBuyerLock = isBuyer && swap.status === 'QBTC_LOCKED';
  const waitingForOther =
    (isSeller && swap.status === 'QBTC_LOCKED') ||
    (isBuyer && swap.status === 'PENDING_QBTC_LOCK') ||
    swap.status === 'EVM_LOCKED';

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(swap.status)}`}>
            {statusLabel(swap.status)}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {role}
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono">{swap.id.slice(0, 8)}…</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-slate-400">QBTC</span><p className="font-mono font-semibold">{swap.qbtcAmount}</p></div>
        <div><span className="text-slate-400">USDC</span><p className="font-mono font-semibold">{swap.usdcAmount}</p></div>
      </div>

      {(swap.qbtcLocktime || swap.evmLocktime) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <span className="text-slate-500">QBTC Lock</span>
            <p className="font-mono text-amber-300">{qbtcCountdown || '—'}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            <span className="text-slate-500">USDC Lock</span>
            <p className="font-mono text-purple-300">{evmCountdown || '—'}</p>
          </div>
        </div>
      )}

      {swap.qbtcHtlcAddress && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">QBTC HTLC</span>
          <span className="font-mono text-cyan-400">{swap.qbtcHtlcAddress.slice(0, 18)}…</span>
        </div>
      )}
      {swap.evmContractId && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">EVM Contract</span>
          <span className="font-mono text-purple-400">{swap.evmContractId.slice(0, 14)}…</span>
        </div>
      )}
      {swap.secret && (
        <div className="text-xs flex justify-between">
          <span className="text-slate-400">Secret</span>
          <span className="font-mono text-emerald-400">{swap.secret.slice(0, 16)}…</span>
        </div>
      )}

      {needsSellerLock && <SellerLockPanel swap={swap} walletId={walletId} onLocked={onRefresh} />}
      {needsBuyerLock && <BuyerLockPanel swap={swap} walletId={walletId} onLocked={onRefresh} />}

      {waitingForOther && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <p className="text-blue-300 text-xs">
            {swap.status === 'PENDING_QBTC_LOCK' && isBuyer && 'Waiting for seller to lock QBTC…'}
            {swap.status === 'QBTC_LOCKED' && isSeller && 'QBTC locked. Waiting for buyer to lock USDC…'}
            {swap.status === 'EVM_LOCKED' && isSeller && 'Both locked! Server will claim USDC and reveal secret automatically.'}
            {swap.status === 'EVM_LOCKED' && isBuyer && 'Both locked. Waiting for seller to claim and reveal secret…'}
          </p>
        </div>
      )}

      {swap.status === 'COMPLETE' && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-emerald-300 text-xs font-medium">Swap complete!</p>
        </div>
      )}
      {(swap.status === 'EXPIRED' || swap.status === 'REFUNDED') && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-red-300 text-xs">Expired. Funds can be reclaimed via timelocks.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketplaceTab({
  userId,
  walletId,
  walletAddress,
  walletPubKey,
  walletEvmAddress,
}: MarketplaceTabProps) {
  const [offers, setOffers] = useState<SwapOffer[]>([]);
  const [mySwaps, setMySwaps] = useState<AtomicSwap[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [loadingSwaps, setLoadingSwaps] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<SwapOffer | null>(null);

  // Create offer form
  const [qbtcAmount, setQbtcAmount] = useState('');
  const [usdcAmount, setUsdcAmount] = useState('');
  const [postPassword, setPostPassword] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postError, setPostError] = useState('');
  const [postStep, setPostStep] = useState('');

  // Accept modal
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptSuccess, setAcceptSuccess] = useState<AcceptResponse | null>(null);

  // Cancel offer
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Offer filters / sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'qbtc-asc' | 'qbtc-desc' | 'usdc-asc' | 'usdc-desc'>('newest');
  const [showMineOnly, setShowMineOnly] = useState(false);

  const isMainnet = isSwapMainnetActive();
  const network: QBTCNetwork = isMainnet ? 'mainnet' : 'testnet';

  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const { data } = await axios.get<SwapOffer[]>(`${SWAP_API}/api/swap/offers`);
      setOffers(data);
    } catch { /* non-fatal */ }
    finally { setLoadingOffers(false); }
  }, []);

  const fetchMySwaps = useCallback(async () => {
    if (!walletAddress) return;
    setLoadingSwaps(true);
    try {
      const { data } = await axios.get<AtomicSwap[]>(
        `${SWAP_API}/api/swap/by-address?qbtcAddress=${encodeURIComponent(walletAddress)}`
      );
      setMySwaps(data);
    } catch { /* non-fatal */ }
    finally { setLoadingSwaps(false); }
  }, [walletAddress]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  useEffect(() => {
    fetchMySwaps();
    const id = setInterval(fetchMySwaps, 15_000);
    return () => clearInterval(id);
  }, [fetchMySwaps]);

  // ─── Post offer + lock QBTC in one step ───
  const canPost = qbtcAmount.trim() !== '' && usdcAmount.trim() !== '' && postPassword.trim() !== '' && walletAddress && walletPubKey && walletEvmAddress;

  const handlePost = async () => {
    setPostLoading(true);
    setPostError('');
    try {
      // 1. Create offer on server (generates secret + hash)
      setPostStep('Creating offer…');
      const { data: offer } = await axios.post(`${SWAP_API}/api/swap/offer`, {
        sellerQbtcAddress: walletAddress,
        sellerEvmAddress: walletEvmAddress,
        sellerPubKeyHex: walletPubKey,
        qbtcAmount,
        usdcAmountRequested: usdcAmount,
      });

      // 2. Unlock wallet
      setPostStep('Unlocking wallet…');
      const wallet = await unlockWallet(walletId, postPassword);
      const qbtcPrivateKey = wallet.privateKeys.qbtc;
      if (!qbtcPrivateKey) throw new Error('QBTC private key not found');
      const keyPair = QBTCKeyPair.fromECDSAPrivateKey(qbtcPrivateKey);

      // 3. Build hash-only HTLC (no buyer needed)
      setPostStep('Building HTLC…');
      const htlcParams: QBTCHtlcParams = {
        sellerPubKeyHex: walletPubKey,
        secretHashHex: offer.secretHash,
        locktime: offer.qbtcLocktime,
      };
      const htlcScript = createHTLCScript(htlcParams);
      const htlcAddress = getHTLCAddress(htlcScript, network);

      // 4. Broadcast QBTC to HTLC address
      setPostStep('Broadcasting QBTC…');
      const qbtcChain = new QBTCChain(getQBTCRpcSettings());
      const txid = await qbtcChain.sendTransaction(keyPair, htlcAddress, qbtcAmount);

      // 5. Report lock to server
      setPostStep('Confirming lock…');
      await axios.post(`${SWAP_API}/api/swap/lock/offer`, {
        offerId: offer.id,
        qbtcHtlcTxid: txid,
        qbtcHtlcAddress: htlcAddress,
      });

      setPostSuccess(true);
      setQbtcAmount('');
      setUsdcAmount('');
      setPostPassword('');
      fetchOffers();
      setTimeout(() => setPostSuccess(false), 6000);
    } catch (err: unknown) {
      setPostError(getDisplayError(err, 'Failed to post & lock offer'));
    } finally {
      setPostLoading(false);
      setPostStep('');
    }
  };

  // ─── Accept offer ───
  const handleAccept = async () => {
    if (!selectedOffer) return;
    setAcceptLoading(true);
    setAcceptError('');
    try {
      const { data } = await axios.post<AcceptResponse>(`${SWAP_API}/api/swap/accept/${selectedOffer.id}`, {
        buyerQbtcAddress: walletAddress,
        buyerEvmAddress: walletEvmAddress,
        buyerPubKeyHex: walletPubKey,
      });
      setAcceptSuccess(data);
      setSelectedOffer(null);
      fetchOffers();
      fetchMySwaps();
      // If QBTC is already locked, buyer should see the USDC lock prompt immediately
      // Auto-dismiss after 30s
      setTimeout(() => setAcceptSuccess(null), 30_000);
    } catch (err: unknown) {
      setAcceptError(getDisplayError(err, 'Failed to accept offer'));
    } finally {
      setAcceptLoading(false);
    }
  };

  // ─── Cancel offer ───
  const handleCancel = async (offerId: string) => {
    if (!confirm('Cancel this offer? If QBTC is already locked, you\'ll need to wait for the timelock to refund.')) return;
    setCancellingId(offerId);
    try {
      const { data } = await axios.post(`${SWAP_API}/api/swap/cancel/${offerId}`, {
        sellerQbtcAddress: walletAddress,
      });
      if (data.wasLocked) {
        alert(data.message);
      }
      fetchOffers();
    } catch (err: unknown) {
      alert(getDisplayError(err, 'Failed to cancel offer'));
    } finally {
      setCancellingId(null);
    }
  };

  // ─── Filtered & sorted offers ───
  const filteredOffers = useMemo(() => {
    let list = [...offers];

    // Mine-only filter
    if (showMineOnly) {
      list = list.filter(o => o.sellerQbtcAddress.toLowerCase() === walletAddress.toLowerCase());
    }

    // Search: match on QBTC amount, USDC amount, or seller address
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(o =>
        o.qbtcAmount.includes(q) ||
        o.usdcAmountRequested.includes(q) ||
        o.sellerQbtcAddress.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'qbtc-asc':  list.sort((a, b) => Number(a.qbtcAmount) - Number(b.qbtcAmount)); break;
      case 'qbtc-desc': list.sort((a, b) => Number(b.qbtcAmount) - Number(a.qbtcAmount)); break;
      case 'usdc-asc':  list.sort((a, b) => Number(a.usdcAmountRequested) - Number(b.usdcAmountRequested)); break;
      case 'usdc-desc': list.sort((a, b) => Number(b.usdcAmountRequested) - Number(a.usdcAmountRequested)); break;
      case 'newest':
      default: break; // server already returns by created_at ASC
    }

    return list;
  }, [offers, showMineOnly, searchQuery, sortBy, walletAddress]);

  // ─── Render ───
  const activeSwaps = mySwaps.filter(s => !['COMPLETE', 'EXPIRED', 'REFUNDED'].includes(s.status));
  const pastSwaps = mySwaps.filter(s => ['COMPLETE', 'EXPIRED', 'REFUNDED'].includes(s.status));

  return (
    <div className="space-y-6">
      {/* Network banner */}
      <div className={`rounded-xl border p-3 flex items-start gap-3 ${isMainnet ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
        <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isMainnet ? 'text-emerald-400' : 'text-amber-400'}`} />
        <p className={`text-sm ${isMainnet ? 'text-emerald-200' : 'text-amber-200'}`}>
          <span className="font-semibold">{isMainnet ? 'Mainnet' : 'Testnet'}</span> — QBTC ↔ USDC atomic swaps.
          {!isMainnet && ' Tokens have no real value.'}
        </p>
      </div>

      {/* Wallet info */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-400">QBTC Address</span>
          <span className="font-mono text-cyan-300">{walletAddress.slice(0, 20)}…</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">EVM Address</span>
          <span className="font-mono text-purple-300">{walletEvmAddress.slice(0, 10)}…{walletEvmAddress.slice(-4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Public Key</span>
          <span className="font-mono text-slate-400">{walletPubKey.slice(0, 12)}…</span>
        </div>
      </div>

      {/* ─── Accept Success Banner ─── */}
      {acceptSuccess && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300 font-bold text-sm">Swap Accepted!</span>
            <button onClick={() => setAcceptSuccess(null)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs">✕</button>
          </div>
          <p className="text-emerald-200/80 text-xs">
            Swap <span className="font-mono">{acceptSuccess.swapId.slice(0, 8)}…</span> created.
            {acceptSuccess.status === 'QBTC_LOCKED'
              ? <>The seller's QBTC is already locked! You can now lock your <span className="font-semibold">{acceptSuccess.usdcAmount} USDC</span> below in Active Swaps.</>
              : <>The seller needs to lock <span className="font-semibold">{acceptSuccess.qbtcAmount} QBTC</span> in the HTLC. Once confirmed, you'll be prompted to lock your USDC. This page auto-refreshes every 15 seconds.</>
            }
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
              <span className="text-slate-500">QBTC Refund</span>
              <p className="font-mono text-amber-300">{new Date(acceptSuccess.qbtcLocktime * 1000).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2">
              <span className="text-slate-500">USDC Refund</span>
              <p className="font-mono text-purple-300">{new Date(acceptSuccess.evmLocktime * 1000).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Active Swaps ─── */}
      {activeSwaps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" /> Active Swaps
            </h3>
            <button onClick={fetchMySwaps} disabled={loadingSwaps} className="p-1.5 rounded-md hover:bg-slate-800">
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingSwaps ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {activeSwaps.map(swap => (
            <SwapCard key={swap.id} swap={swap} walletAddress={walletAddress} walletId={walletId} onRefresh={fetchMySwaps} />
          ))}
        </div>
      )}

      {/* ─── Post & Lock Offer ─── */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Send className="w-4 h-4 text-cyan-400" /> Sell QBTC
        </h3>
        <p className="text-xs text-slate-400">
          Set the amount and price. Your QBTC will be locked in an HTLC immediately — ready for any buyer to accept.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300 block mb-1">QBTC Amount</label>
            <input
              type="number" value={qbtcAmount} onChange={(e) => setQbtcAmount(e.target.value)}
              placeholder="e.g. 1.0" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300 block mb-1">USDC Price</label>
            <input
              type="number" value={usdcAmount} onChange={(e) => setUsdcAmount(e.target.value)}
              placeholder="e.g. 45000" min="0"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-300 block mb-1">Wallet Password</label>
          <input
            type="password" value={postPassword} onChange={(e) => setPostPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canPost && !postLoading && handlePost()}
            placeholder="Required to sign the HTLC transaction"
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
          />
        </div>
        {postError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{postError}</div>
        )}
        {postLoading && postStep && (
          <p className="text-xs text-cyan-300/60 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> {postStep}
          </p>
        )}
        {postSuccess ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-emerald-300 text-sm font-medium">Offer posted & QBTC locked in HTLC!</p>
          </div>
        ) : (
          <button
            onClick={handlePost} disabled={!canPost || postLoading}
            className="w-full py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {postLoading ? 'Posting & Locking…' : 'Post & Lock QBTC'}
          </button>
        )}
      </div>

      {/* ─── Open Offers ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-cyan-400" /> Open Offers
            {offers.length > 0 && (
              <span className="text-xs font-normal text-slate-500">
                {filteredOffers.length === offers.length ? offers.length : `${filteredOffers.length}/${offers.length}`}
              </span>
            )}
          </h3>
          <button onClick={fetchOffers} disabled={loadingOffers} className="p-1.5 rounded-md hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingOffers ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter / Sort bar */}
        {offers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search amount or address…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-xs"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="qbtc-asc">QBTC ↑</option>
              <option value="qbtc-desc">QBTC ↓</option>
              <option value="usdc-asc">USDC ↑</option>
              <option value="usdc-desc">USDC ↓</option>
            </select>
            <button
              onClick={() => setShowMineOnly(v => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showMineOnly
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {showMineOnly ? 'My Offers' : 'All'}
            </button>
          </div>
        )}

        {filteredOffers.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {loadingOffers ? 'Loading…' : offers.length === 0 ? 'No open offers yet.' : 'No offers match your filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOffers.map(offer => {
              const isOwn = offer.sellerQbtcAddress.toLowerCase() === walletAddress.toLowerCase();
              const unitPrice = Number(offer.qbtcAmount) > 0
                ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2)
                : '—';
              return (
                <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-semibold">{offer.qbtcAmount} QBTC</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-mono">{offer.usdcAmountRequested} USDC</span>
                      <span className="text-[10px] text-slate-500">@ ${unitPrice}/QBTC</span>
                      {offer.status === 'LOCKED' && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold">
                          QBTC LOCKED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {isOwn ? '(Your offer)' : `${offer.sellerQbtcAddress.slice(0, 16)}…`}
                    </p>
                  </div>
                  {isOwn ? (
                    <button
                      onClick={() => handleCancel(offer.id)}
                      disabled={cancellingId === offer.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      {cancellingId === offer.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setSelectedOffer(offer); setAcceptError(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors flex-shrink-0"
                    >
                      Accept
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Past Swaps ─── */}
      {pastSwaps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-400">Completed / Expired</h3>
          {pastSwaps.map(swap => (
            <SwapCard key={swap.id} swap={swap} walletAddress={walletAddress} walletId={walletId} onRefresh={fetchMySwaps} />
          ))}
        </div>
      )}

      {/* ─── Accept Offer Modal ─── */}
      {selectedOffer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">Accept Offer</h3>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">You Buy</span>
                <span className="font-semibold">{selectedOffer.qbtcAmount} QBTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">You Pay</span>
                <span className="font-semibold">{selectedOffer.usdcAmountRequested} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Seller</span>
                <span className="font-mono text-xs text-slate-400">{selectedOffer.sellerQbtcAddress.slice(0, 16)}…</span>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200">
              <p className="font-semibold flex items-center gap-2 mb-1"><Info className="w-3.5 h-3.5" /> Your wallet details are used automatically</p>
              <p className="text-cyan-300/70">
                QBTC: {walletAddress.slice(0, 18)}… | EVM: {walletEvmAddress.slice(0, 10)}…{walletEvmAddress.slice(-4)}
              </p>
            </div>

            {acceptError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{acceptError}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedOffer(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                disabled={acceptLoading}
                className="flex-1 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {acceptLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</> : 'Accept & Start Swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
