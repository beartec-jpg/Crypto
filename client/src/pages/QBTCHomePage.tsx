import { Link } from 'wouter';
import {
  Shield,
  Zap,
  Cpu,
  CheckCircle2,
  Clock,
  GitBranch,
  Layers,
  Lock,
  Globe,
  Pickaxe,
  Rocket,
  FlaskConical,
  Wrench,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import QBTCNavigation from '../components/QBTCNavigation';

interface RoadmapPhase {
  phase: number;
  title: string;
  status: 'completed' | 'current' | 'planned' | 'future';
  statusLabel: string;
  items: string[];
}

const ROADMAP: RoadmapPhase[] = [
  {
    phase: 1,
    title: 'Foundation',
    status: 'completed',
    statusLabel: 'Completed ✅',
    items: [
      'Fork Bitcoin Core v28',
      'Implement BlockDAG data structures (multi-parent blocks)',
      'GHOSTDAG scoring algorithm (blue/red block classification)',
      'Custom genesis block: "QuantumBTC 31/Mar/2026 Quantum-safe BlockDAG for a post-quantum world"',
      'Unique chain parameters (magic bytes, bech32 prefixes qbtct/qbtcrt, ports)',
    ],
  },
  {
    phase: 2,
    title: 'Post-Quantum Integration',
    status: 'completed',
    statusLabel: 'Completed ✅',
    items: [
      'Hybrid ECDSA + post-quantum transaction signing',
      'Falcon compatibility support across wallet and explorer flows',
      'Kyber, NTRU, FrodoKEM key encapsulation',
      'PQC wallet tooling (qbtc_wallet.py with Shamir secret sharing)',
      '16 MB block weight limit (accommodating larger PQC signatures)',
    ],
  },
  {
    phase: 3,
    title: 'Consensus & Protection',
    status: 'completed',
    statusLabel: 'Completed ✅',
    items: [
      'DAG-aware difficulty adjustment algorithm',
      'GHOSTDAG K=32 for inclusive mining (People\'s Chain)',
      'Early Protection system (anti-monopolization for first 10,000 blocks)',
      'Per-IP/subnet throttling, miner ramp-up, activation delays',
      'RPC extensions exposing DAG data (blue_score, mergeset, selected_parent)',
    ],
  },
  {
    phase: 4,
    title: 'Testnet',
    status: 'current',
    statusLabel: 'Current 🔄',
    items: [
      'QBTC Testnet live on port 28333',
      'Testnet faucet operational',
      'Web wallet for testnet transactions',
      'Public mining pool UI with lane tabs (Home/GPU/Pro) and round fairness metrics',
      'Browser CPU miner (Web Worker + one-click start/stop + local hashrate)',
      'Mining proxy APIs live: /api/qbtc/pool-stats and /api/qbtc/browser-miner',
      'Community node operators onboarding',
    ],
  },
  {
    phase: 5,
    title: 'Hardening',
    status: 'planned',
    statusLabel: 'Planned 📋',
    items: [
      'Security audit of PQC integration',
      'Comprehensive consensus test suite',
      'P2P network stress testing',
      'Merge mining support (AuxPoW with Bitcoin)',
      'Block explorer',
    ],
  },
  {
    phase: 6,
    title: 'Mainnet',
    status: 'future',
    statusLabel: 'Future 🚀',
    items: [
      'Mainnet genesis block',
      'Exchange listings',
      'Full merge-mining with Bitcoin',
      'Mobile wallet',
      'Hardware wallet PQC support',
    ],
  },
];

const STATS = [
  { label: 'Block Time', value: '~1 second' },
  { label: 'GHOSTDAG K', value: '32' },
  { label: 'Max DAG Parents', value: '64' },
  { label: 'PQC Algorithms', value: 'Falcon, SPHINCS+, Kyber, NTRU' },
  { label: 'Genesis', value: 'March 31, 2026' },
  { label: 'Ticker', value: 'QBTC' },
];

function statusColor(status: RoadmapPhase['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500 bg-emerald-500/10 text-emerald-300';
    case 'current':
      return 'border-cyan-500 bg-cyan-500/10 text-cyan-300';
    case 'planned':
      return 'border-amber-500 bg-amber-500/10 text-amber-300';
    case 'future':
      return 'border-purple-500 bg-purple-500/10 text-purple-300';
  }
}

function statusDot(status: RoadmapPhase['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'current':
      return 'bg-cyan-500 animate-pulse';
    case 'planned':
      return 'bg-amber-500';
    case 'future':
      return 'bg-purple-500';
  }
}

function PhaseIcon({ status }: { status: RoadmapPhase['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'current':
      return <FlaskConical className="w-5 h-5 text-cyan-400" />;
    case 'planned':
      return <Wrench className="w-5 h-5 text-amber-400" />;
    case 'future':
      return <Rocket className="w-5 h-5 text-purple-400" />;
  }
}

export default function QBTCHomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-cyan-500 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-blue-600 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-purple-600 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10 pb-28 space-y-20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              ← Back to BearTec
            </button>
          </Link>
          <span className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            QBTC hub • mining beta live
          </span>
        </div>

        {/* Beta / Testnet disclaimer */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-2 text-xs text-amber-200">
          <span className="font-semibold text-amber-300">⚠ Testnet Beta</span>
          <span>QBTC is currently in active development on testnet. Coins, transactions, and mining rewards have no monetary value. The protocol and reward structure may change at any time.</span>
          <span>Feedback &amp; bug reports:</span>
          <a href="mailto:beartec@beartec.uk" className="text-amber-400 hover:text-amber-300 underline">beartec@beartec.uk</a>
        </div>

        {/* ── Hero ── */}
        <section className="text-center space-y-6 pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            Post-quantum secured • BlockDAG consensus • SHA-256 mining
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            QuantumBTC
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 font-medium">
            Quantum-Resistant Bitcoin for the People
          </p>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            SHA-256 mining&nbsp;•&nbsp;BlockDAG consensus&nbsp;•&nbsp;Post-quantum signatures&nbsp;•&nbsp;Built for everyone
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link href="/qbtc-mine">
              <button className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-amber-400 to-cyan-500 text-slate-950 hover:from-amber-300 hover:to-cyan-400 transition-all w-full sm:w-auto">
                Start Mining
              </button>
            </Link>
            <Link href="/qbtc-faucet">
              <button className="px-6 py-3 rounded-xl font-semibold border border-slate-600 hover:border-cyan-400 hover:text-cyan-300 transition-all w-full sm:w-auto">
                Get Testnet QBTC
              </button>
            </Link>
            <Link href="/wallet">
              <button className="px-6 py-3 rounded-xl font-semibold border border-slate-600 hover:border-cyan-400 hover:text-cyan-300 transition-all w-full sm:w-auto">
                Open Wallet
              </button>
            </Link>
          </div>
        </section>

        {/* ── What is QBTC? ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-center">What is QBTC?</h2>
          <p className="text-slate-300 text-center max-w-2xl mx-auto">
            QBTC is a fork of Bitcoin Core v28 that adds three key innovations to make Bitcoin
            quantum-safe, more inclusive for small miners, and ready for the post-quantum era.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-3 hover:border-cyan-500/60 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="font-semibold text-lg">Post-Quantum Cryptography</h3>
              <p className="text-slate-400 text-sm">
                Hybrid ECDSA + post-quantum signatures protect your coins from quantum
                computers — today and in the future.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-3 hover:border-blue-500/60 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-semibold text-lg">BlockDAG (GHOSTDAG)</h3>
              <p className="text-slate-400 text-sm">
                Multiple blocks can be mined simultaneously. Small miners don't get orphaned —
                everyone earns rewards. Your DAG is your equalizer.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-3 hover:border-purple-500/60 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="font-semibold text-lg">SHA-256 Compatible</h3>
              <p className="text-slate-400 text-sm">
                Same mining algorithm as Bitcoin. Existing miners can switch over or merge-mine
                at zero extra cost.
              </p>
            </div>
          </div>
        </section>

        {/* ── Key Stats ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Key Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-1"
              >
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className="font-semibold text-cyan-300 text-sm leading-snug">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Roadmap ── */}
        <section className="space-y-8">
          <h2 className="text-2xl font-bold text-center">Roadmap</h2>
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-6 top-6 bottom-6 w-px bg-slate-700 hidden sm:block" />

            <div className="space-y-6">
              {ROADMAP.map((phase) => (
                <div key={phase.phase} className="relative flex gap-4 sm:gap-6">
                  {/* Dot */}
                  <div className="hidden sm:flex flex-col items-center">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 z-10 ${statusDot(phase.status)}`}
                    />
                  </div>

                  <div
                    className={`flex-1 rounded-2xl border p-5 space-y-3 ${statusColor(phase.status)}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <PhaseIcon status={phase.status} />
                        <span className="font-bold text-lg">
                          Phase {phase.phase}: {phase.title}
                        </span>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusColor(phase.status)}`}
                      >
                        {phase.statusLabel}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {phase.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Technical Architecture ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-center">Technical Architecture</h2>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 md:p-8 space-y-6">
            {/* Flow diagram */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium">
              {[
                { label: 'SHA-256 PoW', icon: Pickaxe, color: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
                { label: 'BlockDAG', icon: GitBranch, color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
                { label: 'GHOSTDAG Ordering', icon: Layers, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
                { label: 'PQC Signatures', icon: Lock, color: 'text-purple-400 border-purple-500/40 bg-purple-500/10' },
                { label: 'Transactions', icon: Zap, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${step.color}`}
                  >
                    <step.icon className="w-4 h-4" />
                    <span>{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <span className="text-slate-600 font-bold hidden sm:block">→</span>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-slate-700 p-4 space-y-2">
                <div className="flex items-center gap-2 text-orange-400 font-semibold">
                  <Pickaxe className="w-4 h-4" />
                  SHA-256 + Merge Mining
                </div>
                <p className="text-sm text-slate-400">
                  SHA-256 keeps QBTC tied to Bitcoin's mining ecosystem. Existing Bitcoin miners can
                  switch over or merge-mine at zero extra cost — giving QBTC massive security from
                  day one.
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 p-4 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                  <GitBranch className="w-4 h-4" />
                  Your DAG is Your Equalizer
                </div>
                <p className="text-sm text-slate-400">
                  With GHOSTDAG K=32 and 1-second blocks, up to 32 concurrent blocks are all
                  considered valid. Small miners aren't orphaned — everyone earns rewards instead of
                  fighting a winner-take-all race.
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 p-4 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-semibold">
                  <Shield className="w-4 h-4" />
                  Quantum-Safe Transactions
                </div>
                <p className="text-sm text-slate-400">
                  Hybrid ECDSA + Falcon/SPHINCS+ signatures protect your coins from Shor's
                  algorithm. Grover's only gives a quadratic speedup on mining — 128-bit security
                  remains sufficient for PoW.
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <Globe className="w-4 h-4" />
                  Built for Everyone
                </div>
                <p className="text-sm text-slate-400">
                  Early Protection blocks monopolization for the first 10,000 blocks. Fast blocks,
                  wide DAG, and SHA-256 compatibility create a genuinely decentralized People's
                  Chain.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-slate-800 pt-8 pb-4 text-center space-y-4">
          <p className="text-slate-400 text-sm font-medium">
            Built for the people, secured for the future
          </p>
          <div className="flex items-center justify-center gap-6 text-sm">
            <a
              href="https://github.com/beartec-jpg/QuantBTC"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              QuantBTC on GitHub
            </a>
            <a
              href="https://github.com/beartec-jpg/Crypto"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Crypto Platform on GitHub
            </a>
          </div>
          <p className="text-xs text-slate-600">
            QBTC Testnet — No real monetary value
          </p>
        </footer>
      </div>
      <QBTCNavigation />
    </div>
  );
}
