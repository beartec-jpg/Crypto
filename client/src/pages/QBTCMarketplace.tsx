import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Lock,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  RefreshCw,
  ExternalLink,
  Wallet,
} from 'lucide-react';
import { isSwapMainnetActive } from '../lib/evmHTLC';
import QBTCNavigation from '../components/QBTCNavigation';

const SWAP_API = (import.meta.env.VITE_SWAP_API_URL || '').replace(/\/$/, '');
const POOL_API = (import.meta.env.VITE_POOL_API_URL || 'http://89.167.109.241:8088').replace(/\/$/, '');

// ─── Types ───────────────────────────────────────────────────────────────────

interface SwapOffer {
  id: string;
  offerType?: string;
  sellerQbtcAddress: string;
  buyerQbtcAddress?: string;
  qbtcAmount: string;
  usdcAmountRequested: string;
  status: string;
  createdAt: string;
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
}

const TERMINAL_SWAP_STATUSES = new Set([
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
  'CLAIMED',
  'SETTLED',
  'FILLED',
]);

function normalizeOffers(items: SwapOffer[]): SwapOffer[] {
  return items
    .filter((offer) => {
      const status = (offer.status || 'OPEN').toUpperCase();
      return !TERMINAL_SWAP_STATUSES.has(status);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
          Get free testnet QBTC from the faucet before trading.
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
          QBTC side: P2WSH HTLC with QBTC hybrid post-quantum + ECDSA signatures on the QBTC mainnet chain (port 58332).
          EVM side: HashedTimelockERC20 contract on Ethereum, settling in USDC.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page (Informational) ────────────────────────────────────────────────

export default function QBTCMarketplacePage() {
  const [offers, setOffers]               = useState<SwapOffer[]>([]);
  const [buyOffers, setBuyOffers]         = useState<SwapOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [poolStats, setPoolStats]         = useState<PoolStats | null>(null);
  const [loadingPool, setLoadingPool]     = useState(false);
  const [offerTab, setOfferTab]           = useState<'sell' | 'buy'>('sell');
  const isMainnet = isSwapMainnetActive();

  const fetchOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const ts = Date.now();
      const [sellRes, buyRes] = await Promise.all([
        axios.get<SwapOffer[]>(`${SWAP_API}/api/swap/offers?t=${ts}`),
        axios.get<SwapOffer[]>(`${SWAP_API}/api/swap/buy-offers?t=${ts}`),
      ]);
      setOffers(normalizeOffers(sellRes.data));
      setBuyOffers(normalizeOffers(buyRes.data));
    } catch { /* non-fatal */ }
    finally { setLoadingOffers(false); }
  }, []);

  const fetchPoolStats = useCallback(async () => {
    if (!POOL_API) return;
    setLoadingPool(true);
    try {
      const { data } = await axios.get<PoolStats>(`${POOL_API}/stats`, { timeout: 5000 });
      setPoolStats(data);
    } catch {
      setPoolStats(null);
    } finally {
      setLoadingPool(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  useEffect(() => {
    fetchPoolStats();
    const id = window.setInterval(fetchPoolStats, 15000);
    return () => window.clearInterval(id);
  }, [fetchPoolStats]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-600 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-600 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10 pb-28 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              ← Back to BearTec
            </button>
          </Link>
          <span className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            QBTC swaps • market hub
          </span>
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

        {/* CTA: Go to Wallet to Trade */}
        <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-6 flex flex-col sm:flex-row items-center gap-4">
          <Wallet className="w-8 h-8 text-cyan-400 flex-shrink-0" />
          <div className="flex-1 text-center sm:text-left">
            <p className="font-bold text-lg text-cyan-200">Trade in Wallet</p>
            <p className="text-sm text-cyan-300/70">
              All buying, selling, and swap management is done from your wallet.
              Create sell offers, post buy offers, and fulfil trades — all with one-click signing.
            </p>
          </div>
          <Link href="/wallet">
            <button className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 hover:from-blue-400 hover:to-cyan-400 transition-all whitespace-nowrap">
              Open Wallet →
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left/main column ── */}
          <div className="lg:col-span-2 space-y-6">
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
                    desc: 'Seller broadcasts a QBTC transaction to a P2WSH Hash Time-Lock Contract address. The script uses QBTC\'s hybrid post-quantum + ECDSA signature scheme. The buyer can redeem with the secret; the seller can refund after 48 hours via CLTV.',
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
                    <span className="text-slate-300 font-mono">Hybrid PQC + ECDSA</span>
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
            {/* Stats */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Market Overview
              </h2>
              {[
                { label: 'Sell Orders (ASK)', value: String(offers.length) },
                { label: 'Buy Orders (BID)', value: String(buyOffers.length) },
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

            {/* Pool beta */}
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  BearTec Pool Beta
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${poolStats?.running ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-amber-500/40 text-amber-300 bg-amber-500/10'}`}>
                  {loadingPool ? 'Refreshing…' : (poolStats?.running ? 'LIVE' : 'BOOTING')}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Public testnet mining endpoint is being brought online for BearTec. Workers,
                shares, and payouts are now surfaced through the pool API.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-500">Connected Miners</div>
                  <div className="text-cyan-300 font-semibold text-base">{poolStats?.connected_miners ?? 0}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-500">Workers</div>
                  <div className="text-cyan-300 font-semibold text-base">{poolStats?.authorized_workers ?? 0}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-500">Accepted Shares</div>
                  <div className="text-emerald-300 font-semibold text-base">{poolStats?.accepted_shares ?? 0}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-slate-500">Pending Payouts</div>
                  <div className="text-amber-300 font-semibold text-base">{Number(poolStats?.pending_payouts ?? 0).toFixed(2)} QBTC</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 space-y-1">
                <p>Stratum: 89.167.109.241:3333</p>
                <p>Template height: {poolStats?.last_template_height ?? '—'}</p>
              </div>
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

            {/* Trade CTA */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
                <Wallet className="w-4 h-4" />
                Ready to Trade?
              </div>
              <p className="text-xs text-slate-400">
                Go to your wallet to post sell offers, buy offers, or accept existing offers.
                Your addresses and keys auto-fill for one-click signing.
              </p>
              <Link href="/wallet">
                <button className="w-full py-2 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                  Open Wallet →
                </button>
              </Link>
            </div>

            {/* Testnet reminder */}
            {!isMainnet && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
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

        {/* ── Open Offers Table (read-only) ── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
              Open Orders
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

          {/* Sell / Buy tabs */}
          <div className="flex rounded-xl border border-slate-700 bg-slate-950/40 overflow-hidden">
            <button
              onClick={() => setOfferTab('sell')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${offerTab === 'sell' ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Sell Orders ({offers.length})
            </button>
            <button
              onClick={() => setOfferTab('buy')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${offerTab === 'buy' ? 'bg-emerald-500/20 text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Buy Orders ({buyOffers.length})
            </button>
          </div>

          {/* Sell offers table */}
          {offerTab === 'sell' && (
            <>
              {offers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {loadingOffers ? 'Loading offers…' : 'No sell offers yet.'}
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800">
                          <th className="pb-3 pr-4 font-medium">QBTC</th>
                          <th className="pb-3 pr-4 font-medium">USDC</th>
                          <th className="pb-3 pr-4 font-medium">Rate</th>
                          <th className="pb-3 pr-4 font-medium">Seller</th>
                          <th className="pb-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {offers.map((offer) => (
                          <tr key={offer.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 pr-4 font-mono font-semibold">{offer.qbtcAmount}</td>
                            <td className="py-3 pr-4 font-mono">{offer.usdcAmountRequested}</td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                              {Number(offer.qbtcAmount) > 0 ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2) : '—'} USDC/QBTC
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                              {offer.sellerQbtcAddress.slice(0, 14)}…
                            </td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                offer.status === 'LOCKED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              }`}>
                                {offer.status === 'LOCKED' ? 'QBTC Locked' : 'Open'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {offers.map((offer) => (
                      <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold">{offer.qbtcAmount} QBTC</span>
                          <span className="font-mono text-slate-300">{offer.usdcAmountRequested} USDC</span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{offer.sellerQbtcAddress.slice(0, 18)}…</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Buy offers table */}
          {offerTab === 'buy' && (
            <>
              {buyOffers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {loadingOffers ? 'Loading offers…' : 'No buy offers yet.'}
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800">
                          <th className="pb-3 pr-4 font-medium">QBTC Wanted</th>
                          <th className="pb-3 pr-4 font-medium">USDC Offered</th>
                          <th className="pb-3 pr-4 font-medium">Rate</th>
                          <th className="pb-3 pr-4 font-medium">Buyer</th>
                          <th className="pb-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {buyOffers.map((offer) => (
                          <tr key={offer.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 pr-4 font-mono font-semibold text-emerald-300">{offer.qbtcAmount}</td>
                            <td className="py-3 pr-4 font-mono">{offer.usdcAmountRequested}</td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                              {Number(offer.qbtcAmount) > 0 ? (Number(offer.usdcAmountRequested) / Number(offer.qbtcAmount)).toFixed(2) : '—'} USDC/QBTC
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                              {(offer.buyerQbtcAddress || '').slice(0, 14)}…
                            </td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                Open
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {buyOffers.map((offer) => (
                      <div key={offer.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-emerald-300">{offer.qbtcAmount} QBTC</span>
                          <span className="font-mono text-slate-300">{offer.usdcAmountRequested} USDC</span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{(offer.buyerQbtcAddress || '').slice(0, 18)}…</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Go to wallet prompt */}
          <div className="text-center pt-2">
            <Link href="/wallet">
              <button className="px-5 py-2 rounded-xl text-sm font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                Go to Wallet to Trade →
              </button>
            </Link>
          </div>
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

      <QBTCNavigation />
    </div>
  );
}
