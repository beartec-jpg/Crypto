import { useState } from 'react';
import { Link } from 'wouter';
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
} from 'lucide-react';

type TradeType = 'buy' | 'sell';
type PaymentMethod = 'USDC' | 'USDT';
type TradeStatus = 'Open' | 'In Escrow' | 'Completed';

interface Trade {
  id: string;
  type: TradeType;
  amount: string;
  price: string;
  payment: PaymentMethod;
  trader: string;
  status: TradeStatus;
}

// Placeholder/mock listings for draft UI
const MOCK_TRADES: Trade[] = [
  {
    id: '1',
    type: 'sell',
    amount: '500',
    price: '0.0042',
    payment: 'USDC',
    trader: 'qbtct1q3zyf…r9x2',
    status: 'Open',
  },
  {
    id: '2',
    type: 'buy',
    amount: '250',
    price: '0.0040',
    payment: 'USDT',
    trader: 'qbtct1qkdp4…a1wm',
    status: 'Open',
  },
  {
    id: '3',
    type: 'sell',
    amount: '1000',
    price: '0.0045',
    payment: 'USDC',
    trader: 'qbtct1qhvtz…c8j3',
    status: 'In Escrow',
  },
  {
    id: '4',
    type: 'buy',
    amount: '100',
    price: '0.0038',
    payment: 'USDT',
    trader: 'qbtct1qm7xr…b5nk',
    status: 'Completed',
  },
];

function statusBadge(status: TradeStatus) {
  switch (status) {
    case 'Open':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'In Escrow':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'Completed':
      return 'bg-slate-700 text-slate-400 border-slate-600';
  }
}

function typeBadge(type: TradeType) {
  return type === 'buy'
    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
    : 'bg-purple-500/20 text-purple-300 border-purple-500/40';
}

export default function QBTCMarketplacePage() {
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('USDC');
  const [walletAddress, setWalletAddress] = useState('');
  const [posted, setPosted] = useState(false);

  const canPost =
    amount.trim() !== '' &&
    price.trim() !== '' &&
    walletAddress.trim().toLowerCase().startsWith('qbtct1');

  const handlePostTrade = () => {
    // Draft only — no real backend
    setPosted(true);
    setTimeout(() => {
      setPosted(false);
      setAmount('');
      setPrice('');
      setWalletAddress('');
    }, 3000);
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
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              ← Back to BearTec
            </button>
          </Link>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/qbtc">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                QBTC Info
              </button>
            </Link>
            <Link href="/qbtc-faucet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300 transition-colors">
                Faucet
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
            Peer-to-Peer Trading
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
            QBTC Marketplace
          </h1>
          <p className="text-slate-300 text-lg">Trade QBTC peer-to-peer for USDC and USDT</p>
        </div>

        {/* Testnet warning */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">
            <span className="font-semibold">Testnet Only</span> — These trades use testnet QBTC
            tokens with no real value. This is a draft marketplace for testing and development
            purposes only.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: Create Trade + How It Works ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Create Trade */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-5">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-400" />
                Create Trade
              </h2>

              {/* Trade type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-slate-700">
                <button
                  onClick={() => setTradeType('buy')}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    tradeType === 'buy'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Buy QBTC
                </button>
                <button
                  onClick={() => setTradeType('sell')}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    tradeType === 'sell'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Sell QBTC
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Amount (QBTC)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 100"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">
                    Price (per QBTC in {payment})
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 0.0042"
                    min="0"
                    step="0.0001"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Payment Method</label>
                  <select
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm appearance-none"
                  >
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">
                    Your QBTC Wallet Address
                  </label>
                  <input
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="qbtct1q..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
                  />
                </div>
              </div>

              {posted ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-300 text-sm font-medium">
                    Trade posted! (Draft — no real transaction submitted)
                  </p>
                </div>
              ) : (
                <button
                  onClick={handlePostTrade}
                  disabled={!canPost}
                  className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-400 hover:to-cyan-400 transition-all"
                >
                  Post Trade
                </button>
              )}

              <p className="text-xs text-slate-500">
                Draft marketplace — trade matching and escrow are not yet implemented.
              </p>
            </div>

            {/* How It Works */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-5">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                How It Works
              </h2>
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    icon: Send,
                    title: 'Post a Trade',
                    desc: 'List your buy or sell order with your price and amount. Set your wallet address to receive funds.',
                    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                  },
                  {
                    step: 2,
                    icon: Users,
                    title: 'Match & Escrow',
                    desc: "When someone accepts your trade, QBTC is locked in smart escrow. Neither party can disappear with the funds.",
                    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
                  },
                  {
                    step: 3,
                    icon: ArrowLeftRight,
                    title: 'Send Payment',
                    desc: 'Buyer sends USDC or USDT to the seller\'s address. Share your payment confirmation.',
                    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
                  },
                  {
                    step: 4,
                    icon: CheckCircle2,
                    title: 'Release',
                    desc: 'Seller confirms payment received. QBTC is automatically released from escrow to the buyer.',
                    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                  },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-4">
                    <div
                      className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${s.color}`}
                    >
                      <s.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {s.step}. {s.title}
                      </p>
                      <p className="text-slate-400 text-sm mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right column: Trade Stats ── */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Trade Stats
              </h2>
              {[
                { label: 'Total Trades', value: '0' },
                { label: '24h Volume', value: '0 QBTC' },
                { label: 'Active Listings', value: '0' },
                { label: 'Average Price', value: '—' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-slate-400">{stat.label}</span>
                  <span className="text-sm font-semibold text-cyan-300">{stat.value}</span>
                </div>
              ))}
              <p className="text-xs text-slate-600 pt-1">
                Placeholder stats — live data coming in a future release.
              </p>
            </div>

            {/* Escrow info card */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <Lock className="w-4 h-4" />
                Escrow Protection
              </div>
              <p className="text-xs text-slate-400">
                QBTC is held in a time-locked escrow smart contract during a trade. If a dispute
                occurs, arbitration can release funds to the rightful party. Coming in Phase 5.
              </p>
            </div>

            {/* Testnet reminder */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                <Clock className="w-4 h-4" />
                Testnet Reminder
              </div>
              <p className="text-xs text-slate-400">
                All QBTC here is testnet only. Get free testnet QBTC from the faucet to practice
                trading before mainnet launches.
              </p>
              <Link href="/qbtc-faucet">
                <button className="w-full py-2 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                  Go to Faucet →
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Active Trades Table ── */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
            Active Trades
          </h2>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Amount (QBTC)</th>
                  <th className="pb-3 pr-4 font-medium">Price</th>
                  <th className="pb-3 pr-4 font-medium">Payment</th>
                  <th className="pb-3 pr-4 font-medium">Trader</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {MOCK_TRADES.map((trade) => (
                  <tr key={trade.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-xs font-medium ${typeBadge(trade.type)}`}
                      >
                        {trade.type === 'buy' ? 'Buy' : 'Sell'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono">{trade.amount}</td>
                    <td className="py-3 pr-4 font-mono">
                      {trade.price} {trade.payment}
                    </td>
                    <td className="py-3 pr-4">{trade.payment}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">{trade.trader}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(trade.status)}`}
                      >
                        {trade.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        disabled={trade.status !== 'Open'}
                        className="px-3 py-1 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {trade.status === 'Completed' ? 'View' : 'Trade'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {MOCK_TRADES.map((trade) => (
              <div
                key={trade.id}
                className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded-full border text-xs font-medium ${typeBadge(trade.type)}`}
                  >
                    {trade.type === 'buy' ? 'Buy' : 'Sell'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(trade.status)}`}
                  >
                    {trade.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <span className="text-slate-400">Amount</span>
                  <span className="font-mono">{trade.amount} QBTC</span>
                  <span className="text-slate-400">Price</span>
                  <span className="font-mono">
                    {trade.price} {trade.payment}
                  </span>
                  <span className="text-slate-400">Trader</span>
                  <span className="font-mono text-xs text-slate-400">{trade.trader}</span>
                </div>
                <button
                  disabled={trade.status !== 'Open'}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {trade.status === 'Completed' ? 'View' : 'Trade'}
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-600 pt-2">
            Placeholder listings — live P2P matching coming in a future release.
          </p>
        </div>
      </div>
    </div>
  );
}
