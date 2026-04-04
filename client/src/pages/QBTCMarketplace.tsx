import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Lock,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  RefreshCw,
  ExternalLink,
  Info,
} from 'lucide-react';
import { isSwapMainnetActive } from '../lib/evmHTLC';

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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    case 'OPEN':             return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'PENDING_QBTC_LOCK': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'QBTC_LOCKED':     return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'EVM_LOCKED':      return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    case 'COMPLETE':        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'EXPIRED':
    case 'REFUNDED':        return 'bg-red-500/20 text-red-300 border-red-500/40';
    default:                return 'bg-slate-700 text-slate-400 border-slate-600';
  }
}

function statusLabel(status: SwapStatus | string) {
  switch (status) {
    case 'PENDING_QBTC_LOCK': return 'Awaiting QBTC Lock';
    case 'QBTC_LOCKED':     return 'QBTC Locked';
    case 'EVM_LOCKED':      return 'USDC Locked';
    case 'COMPLETE':        return 'Complete';
    case 'EXPIRED':         return 'Expired';
    case 'REFUNDED':        return 'Refunded';
    default:                return status;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TestnetBanner() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-amber-200 text-sm space-y-1">
        <p>
          <span className="font-semibold">Testnet Mode</span> — Trading QBTC testnet tokens only.
          QBTC locks use Sepolia EVM; QBTC chain RPC on port 28332.
          All cryptographic guarantees are identical to mainnet.
        </p>
        <p className="text-xs text-amber-300/70">
          Get free testnet QBTC from the faucet before posting or accepting offers.
        </p>
      </div>
    </div>
  );
}

function MainnetActiveBanner() {
  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="text-emerald-200 text-sm space-y-1">
        <p>
          <span className="font-semibold">Mainnet Live</span> — Trustless QBTC ↔ USDC atomic swaps
          are active on Ethereum mainnet. Funds are secured by cryptographic hash-locks and
          time-locks; no custodian or intermediary is involved.
        </p>
        <p className="text-xs text-emerald-300/70">
          QBTC side: P2WSH HTLC with ML-DSA-44 + ECDSA hybrid signatures on the QBTC mainnet chain (port 58332).
          EVM side: HashedTimelockERC20 contract on Ethereum, settling in USDC.
        </p>
      </div>
    </div>
  );
}

function SwapTimelockInfo({ swap }: { swap: AtomicSwap }) {
  const qbtcCountdown = useCountdown(swap.qbtcLocktime);
  const evmCountdown  = useCountdown(swap.evmLocktime);

  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
        <p className="text-slate-400 mb-1">QBTC Refund Window</p>
        <p className="font-mono text-amber-300">{qbtcCountdown || '—'}</p>
      </div>
      <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
        <p className="text-slate-400 mb-1">USDC Refund Window</p>
        <p className="font-mono text-purple-300">{evmCountdown || '—'}</p>
      </div>
    </div>
  );
}

// ─── Active Swap Detail Panel ─────────────────────────────────────────────────

function ActiveSwapPanel({ swap, onRefresh }: { swap: AtomicSwap; onRefresh: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-400" />
          Active Swap
        </h3>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-md hover:bg-slate-800 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(swap.status)}`}>
          {statusLabel(swap.status)}
        </span>
        <span className="text-xs text-slate-500 font-mono">{swap.id.slice(0, 8)}…</span>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Amount</span>
          <span className="font-mono">{swap.qbtcAmount} QBTC → {swap.usdcAmount} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Secret Hash</span>
          <span className="font-mono text-slate-500">{swap.secretHash.slice(0, 12)}…</span>
        </div>
        {swap.qbtcHtlcAddress && (
          <div className="flex justify-between">
            <span className="text-slate-400">HTLC Address</span>
            <span className="font-mono text-cyan-400 text-xs">{swap.qbtcHtlcAddress.slice(0, 14)}…</span>
          </div>
        )}
        {swap.evmContractId && (
          <div className="flex justify-between">
            <span className="text-slate-400">EVM Contract</span>
            <span className="font-mono text-purple-400 text-xs">{swap.evmContractId.slice(0, 12)}…</span>
          </div>
        )}
        {swap.secret && (
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Secret (claim QBTC)</span>
            <span className="font-mono text-emerald-400 text-xs">{swap.secret.slice(0, 12)}…</span>
          </div>
        )}
      </div>

      <SwapTimelockInfo swap={swap} />

      {swap.status === 'COMPLETE' && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-emerald-300 text-xs font-medium">Swap complete! Both parties have been paid.</p>
        </div>
      )}

      {(swap.status === 'EXPIRED' || swap.status === 'REFUNDED') && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-red-300 text-xs">Swap expired. Both parties can claim refunds via their respective timelocks.</p>
        </div>
      )}
    </div>
  );
}

// ─── Create Offer Form ────────────────────────────────────────────────────────

function CreateOfferForm({ onOfferCreated }: { onOfferCreated: () => void }) {
  const [qbtcAmount, setQbtcAmount]               = useState('');
  const [usdcAmount, setUsdcAmount]               = useState('');
  const [sellerQbtcAddress, setSellerQbtcAddress] = useState('');
  const [sellerEvmAddress, setSellerEvmAddress]   = useState('');
  const [sellerPubKeyHex, setSellerPubKeyHex]     = useState('');
  const [loading, setLoading]                     = useState(false);
  const [success, setSuccess]                     = useState(false);
  const [error, setError]                         = useState('');

  const canPost =
    qbtcAmount.trim() !== '' &&
    usdcAmount.trim() !== '' &&
    sellerQbtcAddress.toLowerCase().startsWith('qbtct1') &&
    sellerEvmAddress.startsWith('0x') && sellerEvmAddress.length === 42 &&
    sellerPubKeyHex.length === 66;

  const handlePost = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/swap/offer', {
        sellerQbtcAddress,
        sellerEvmAddress,
        sellerPubKeyHex,
        qbtcAmount,
        usdcAmountRequested: usdcAmount,
      });
      setSuccess(true);
      setQbtcAmount('');
      setUsdcAmount('');
      setSellerQbtcAddress('');
      setSellerEvmAddress('');
      setSellerPubKeyHex('');
      onOfferCreated();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to post offer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-5">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Send className="w-5 h-5 text-cyan-400" />
        Post Sell Offer
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-slate-300 block mb-1.5">QBTC Amount</label>
          <input
            type="number"
            value={qbtcAmount}
            onChange={(e) => setQbtcAmount(e.target.value)}
            placeholder="e.g. 1.0"
            min="0"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-slate-300 block mb-1.5">USDC Requested</label>
          <input
            type="number"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value)}
            placeholder="e.g. 45000"
            min="0"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-slate-300 block mb-1.5">Your QBTC Address</label>
        <input
          type="text"
          value={sellerQbtcAddress}
          onChange={(e) => setSellerQbtcAddress(e.target.value)}
          placeholder="qbtct1q…"
          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
        />
      </div>

      <div>
        <label className="text-sm text-slate-300 block mb-1.5">
          Your ECDSA Public Key (hex, 66 chars)
          <span className="ml-2 text-slate-500 text-xs">— from QBTC Wallet page</span>
        </label>
        <input
          type="text"
          value={sellerPubKeyHex}
          onChange={(e) => setSellerPubKeyHex(e.target.value)}
          placeholder="02… or 03…"
          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
        />
      </div>

      <div>
        <label className="text-sm text-slate-300 block mb-1.5">Your EVM Address (to receive USDC)</label>
        <input
          type="text"
          value={sellerEvmAddress}
          onChange={(e) => setSellerEvmAddress(e.target.value)}
          placeholder="0x…"
          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {success ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-300 text-sm font-medium">Offer posted! Buyers can now accept it.</p>
        </div>
      ) : (
        <button
          onClick={handlePost}
          disabled={!canPost || loading}
          className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-400 hover:to-cyan-400 transition-all"
        >
          {loading ? 'Posting…' : 'Post Offer'}
        </button>
      )}
    </div>
  );
}

// ─── Accept Offer Flow ────────────────────────────────────────────────────────

function AcceptOfferModal({
  offer,
  onClose,
  onSwapStarted,
}: {
  offer: SwapOffer;
  onClose: () => void;
  onSwapStarted: (swap: AcceptResponse) => void;
}) {
  const [buyerQbtcAddress, setBuyerQbtcAddress] = useState('');
  const [buyerEvmAddress, setBuyerEvmAddress]   = useState('');
  const [buyerPubKeyHex, setBuyerPubKeyHex]     = useState('');
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');

  const canAccept =
    buyerQbtcAddress.toLowerCase().startsWith('qbtct1') &&
    buyerEvmAddress.startsWith('0x') && buyerEvmAddress.length === 42 &&
    buyerPubKeyHex.length === 66;

  const handleAccept = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post<AcceptResponse>(`/api/swap/accept/${offer.id}`, {
        buyerQbtcAddress,
        buyerEvmAddress,
        buyerPubKeyHex,
      });
      onSwapStarted(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to accept offer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-5">
        <h3 className="text-lg font-bold">Accept Offer</h3>

        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Buying</span>
            <span className="font-semibold">{offer.qbtcAmount} QBTC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">You Pay</span>
            <span className="font-semibold">{offer.usdcAmountRequested} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Seller</span>
            <span className="font-mono text-xs text-slate-400">{offer.sellerQbtcAddress.slice(0, 16)}…</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-300 block mb-1.5">Your QBTC Address (to receive QBTC)</label>
            <input
              type="text"
              value={buyerQbtcAddress}
              onChange={(e) => setBuyerQbtcAddress(e.target.value)}
              placeholder="qbtct1q…"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-slate-300 block mb-1.5">
              Your ECDSA Public Key (hex, 66 chars)
            </label>
            <input
              type="text"
              value={buyerPubKeyHex}
              onChange={(e) => setBuyerPubKeyHex(e.target.value)}
              placeholder="02… or 03…"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-slate-300 block mb-1.5">Your EVM Address (to pay USDC from)</label>
            <input
              type="text"
              value={buyerEvmAddress}
              onChange={(e) => setBuyerEvmAddress(e.target.value)}
              placeholder="0x…"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={!canAccept || loading}
            className="flex-1 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-400 hover:to-cyan-400 transition-all text-sm"
          >
            {loading ? 'Accepting…' : 'Accept & Initiate Swap'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Swap Instructions Panel ──────────────────────────────────────────────────

function SwapInstructions({ swapDetails }: { swapDetails: AcceptResponse }) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
      <h3 className="text-base font-bold flex items-center gap-2 text-blue-300">
        <Info className="w-4 h-4" />
        Swap Initiated — Next Steps
      </h3>
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-300">1</div>
          <div>
            <p className="font-semibold text-slate-200">Seller: Lock QBTC in HTLC</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Use your QBTC Wallet to create a P2WSH HTLC transaction to address derived from
              secret hash <code className="bg-slate-800 px-1 rounded font-mono">{swapDetails.secretHash.slice(0, 16)}…</code>.
              Then post the txid via the API or wallet interface.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-cyan-300">2</div>
          <div>
            <p className="font-semibold text-slate-200">Buyer: Lock USDC in EVM HTLC</p>
            <p className="text-slate-400 text-xs mt-0.5">
              After the QBTC lock is confirmed, use MetaMask to call <code className="bg-slate-800 px-1 rounded">newContract()</code> on
              the HashedTimelockERC20 contract with the same secret hash.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-purple-300">3</div>
          <div>
            <p className="font-semibold text-slate-200">Seller: Claim USDC (reveals secret)</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Seller calls <code className="bg-slate-800 px-1 rounded">withdraw(contractId, secret)</code> on EVM.
              This reveals the secret on-chain.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-emerald-300">4</div>
          <div>
            <p className="font-semibold text-slate-200">Buyer: Claim QBTC using revealed secret</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Poll <code className="bg-slate-800 px-1 rounded">GET /api/swap/{swapDetails.swapId}</code> until
              <code className="bg-slate-800 px-1 rounded ml-1">status = COMPLETE</code> and use
              the returned <code className="bg-slate-800 px-1 rounded ml-1">secret</code> to broadcast
              the HTLC claim transaction.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-xs space-y-1">
        <p className="text-slate-400">Swap ID: <span className="font-mono text-cyan-300">{swapDetails.swapId}</span></p>
        <p className="text-slate-400">Secret Hash: <span className="font-mono text-slate-300">{swapDetails.secretHash}</span></p>
        <p className="text-slate-400">QBTC refund after: <span className="font-mono text-amber-300">{new Date(swapDetails.qbtcLocktime * 1000).toLocaleString()}</span></p>
        <p className="text-slate-400">EVM refund after: <span className="font-mono text-purple-300">{new Date(swapDetails.evmLocktime * 1000).toLocaleString()}</span></p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QBTCMarketplacePage() {
  const [offers, setOffers]               = useState<SwapOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<SwapOffer | null>(null);
  const [swapDetails, setSwapDetails]     = useState<AcceptResponse | null>(null);
  const [activeSwap, setActiveSwap]       = useState<AtomicSwap | null>(null);
  const isMainnet = isSwapMainnetActive();

  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const { data } = await axios.get<SwapOffer[]>('/api/swap/offers');
      setOffers(data);
    } catch {
      // non-fatal
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  const fetchActiveSwap = useCallback(async (swapId: string) => {
    try {
      const { data } = await axios.get<AtomicSwap>(`/api/swap/${swapId}`);
      setActiveSwap(data);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Poll active swap every 15 s
  useEffect(() => {
    if (!swapDetails?.swapId) return;
    fetchActiveSwap(swapDetails.swapId);
    const id = setInterval(() => fetchActiveSwap(swapDetails.swapId), 15_000);
    return () => clearInterval(id);
  }, [swapDetails?.swapId, fetchActiveSwap]);

  const handleSwapStarted = (details: AcceptResponse) => {
    setSelectedOffer(null);
    setSwapDetails(details);
    fetchOffers();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-600 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-600 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10 space-y-8">
        {/* Top nav bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Link href="/crypto">
              <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
                ← BearTec
              </button>
            </Link>
            <Link href="/qbtc">
              <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
                ← QBTC
              </button>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/qbtc-faucet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Faucet
              </button>
            </Link>
            <Link href="/qbtc-scan">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Scan
              </button>
            </Link>
            <Link href="/wallet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Wallet
              </button>
            </Link>
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300 text-xs font-medium">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Atomic Swap P2P Trading
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
            QBTC Marketplace
          </h1>
          <p className="text-slate-300 text-lg">Trustless QBTC ↔ USDC atomic swaps via HTLC</p>
        </div>

        {/* Network banner */}
        {isMainnet ? <MainnetActiveBanner /> : <TestnetBanner />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left/main column ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active swap instructions */}
            {swapDetails && !activeSwap && (
              <SwapInstructions swapDetails={swapDetails} />
            )}

            {/* Create offer */}
            <CreateOfferForm onOfferCreated={fetchOffers} />

            {/* How It Works */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-5">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                How Atomic Swaps Work
              </h2>
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    icon: Send,
                    title: 'Seller Posts Offer',
                    desc: 'Seller lists QBTC for sale at a USDC price. No funds are locked at this stage — the offer is just a public intent.',
                    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                  },
                  {
                    step: 2,
                    icon: Lock,
                    title: 'Seller Locks QBTC in P2WSH HTLC',
                    desc: 'Seller broadcasts a QBTC transaction to a P2WSH Hash Time-Lock Contract address. The script uses an ML-DSA-44 + ECDSA hybrid signature scheme. The buyer can redeem with the secret; the seller can refund after 48 hours via CLTV.',
                    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
                  },
                  {
                    step: 3,
                    icon: Users,
                    title: 'Buyer Locks USDC in EVM HTLC',
                    desc: 'After the QBTC lock is confirmed, the buyer calls newContract() on the HashedTimelockERC20 contract with the same SHA-256 hash. The seller can withdraw USDC by revealing the secret; the buyer can refund after 24 hours.',
                    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
                  },
                  {
                    step: 4,
                    icon: ArrowLeftRight,
                    title: 'Atomic Settlement',
                    desc: 'Seller calls withdraw(contractId, secret) on the EVM contract to claim USDC — this reveals the preimage on-chain. The buyer then uses the revealed secret to broadcast the HTLC claim transaction on QBTC. Both legs settle atomically with no trusted third party.',
                    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                  },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-4">
                    <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${s.color}`}>
                      <s.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{s.step}. {s.title}</p>
                      <p className="text-slate-400 text-sm mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Technical spec summary */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 space-y-2 text-xs text-slate-400">
                <p className="text-slate-300 font-semibold text-sm mb-2">Technical Specification</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span>QBTC Script</span>
                    <span className="text-slate-300 font-mono">P2WSH HTLC (OP_IF / CLTV)</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Hash Function</span>
                    <span className="text-slate-300 font-mono">SHA-256</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Signature Scheme</span>
                    <span className="text-slate-300 font-mono">ML-DSA-44 + ECDSA</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>EVM Contract</span>
                    <span className="text-slate-300 font-mono">HashedTimelockERC20</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>QBTC Refund Window</span>
                    <span className="text-slate-300 font-mono">48 hours</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>EVM Refund Window</span>
                    <span className="text-slate-300 font-mono">24 hours</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Settlement Token</span>
                    <span className="text-slate-300 font-mono">USDC (ERC-20)</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Trust Model</span>
                    <span className="text-slate-300 font-mono">Trustless (no custodian)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">
            {/* Active swap panel */}
            {activeSwap && (
              <ActiveSwapPanel
                swap={activeSwap}
                onRefresh={() => fetchActiveSwap(activeSwap.id)}
              />
            )}

            {/* Stats */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Trade Stats
              </h2>
              {[
                { label: 'Open Offers', value: String(offers.length) },
                { label: 'Network', value: isMainnet ? 'Mainnet' : 'Testnet' },
                { label: 'QBTC Chain', value: isMainnet ? 'Mainnet (:58332)' : 'Testnet (:28332)' },
                { label: 'EVM Chain', value: isMainnet ? 'Ethereum' : 'Sepolia' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-slate-400">{stat.label}</span>
                  <span className="text-sm font-semibold text-cyan-300">{stat.value}</span>
                </div>
              ))}
            </div>

            {/* Escrow info */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <Lock className="w-4 h-4" />
                Atomic Guarantee
              </div>
              <p className="text-xs text-slate-400">
                Funds are locked by cryptographic hash-lock + time-lock. If either party
                disappears, timelocks expire and both parties get full refunds. No custody,
                no KYC, no arbitration.
              </p>
            </div>

            {/* Testnet reminder */}
            {!isMainnet && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Clock className="w-4 h-4" />
                  Testnet — No Real Value
                </div>
                <p className="text-xs text-slate-400">
                  All QBTC and USDC here are testnet tokens with no monetary value.
                  Get free testnet QBTC from the faucet to try the swap flow end-to-end.
                </p>
                <Link href="/qbtc-faucet">
                  <button className="w-full py-2 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                    Go to Faucet →
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Open Offers Table ── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
              Open Offers
            </h2>
            <button
              onClick={fetchOffers}
              disabled={loadingOffers}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${loadingOffers ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {offers.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {loadingOffers ? 'Loading offers…' : 'No open offers yet. Be the first to post one!'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="pb-3 pr-4 font-medium">QBTC</th>
                      <th className="pb-3 pr-4 font-medium">USDC</th>
                      <th className="pb-3 pr-4 font-medium">Rate</th>
                      <th className="pb-3 pr-4 font-medium">Seller</th>
                      <th className="pb-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {offers.map((offer) => (
                      <tr key={offer.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pr-4 font-mono font-semibold">{offer.qbtcAmount}</td>
                        <td className="py-3 pr-4 font-mono">{offer.usdcAmountRequested}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                          {Number(offer.qbtcAmount) > 0 ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2) : "—"} USDC/QBTC
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                          {offer.sellerQbtcAddress.slice(0, 14)}…
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => setSelectedOffer(offer)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                          >
                            Accept
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {offers.map((offer) => (
                  <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{offer.qbtcAmount} QBTC</span>
                      <span className="font-mono text-slate-300">{offer.usdcAmountRequested} USDC</span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{offer.sellerQbtcAddress.slice(0, 18)}…</p>
                    <button
                      onClick={() => setSelectedOffer(offer)}
                      className="w-full py-2 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                    >
                      Accept Offer
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Docs link */}
        <div className="text-center text-xs text-slate-600 space-y-1">
          <p>
            EVM contract ABI compatible with{' '}
            <a
              href="https://github.com/chatch/hashed-timelock-contract-ethereum"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 hover:text-cyan-500 inline-flex items-center gap-1"
            >
              HashedTimelockERC20 <ExternalLink className="w-3 h-3" />
            </a>
          </p>
          <p>QBTC P2WSH HTLC verified against QuantBTC node (CheckPQCSignature + CLTV). Secret size: 32 bytes (256-bit entropy).</p>
        </div>
      </div>

      {/* Accept offer modal */}
      {selectedOffer && (
        <AcceptOfferModal
          offer={selectedOffer}
          onClose={() => setSelectedOffer(null)}
          onSwapStarted={handleSwapStarted}
        />
      )}
    </div>
  );
}
