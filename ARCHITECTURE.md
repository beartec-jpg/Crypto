# BearTec — Full Business Architecture

```
                              ┌─────────────┐
                              │   BearTec    │
                              │  (org root)  │
                              └──────┬───────┘
                 ┌───────────────────┼───────────────────┐
                 │                                       │
         ┌───────▼────────┐                     ┌────────▼────────┐
         │  beartec-jpg/   │                     │  beartec-jpg/   │
         │     Crypto      │                     │    QuantBTC     │
         │  (Web Platform) │                     │ (QBTC Full Node)│
         │   TypeScript    │                     │    C++ / C      │
         └───────┬─────────┘                     └────────┬────────┘
                 │                                        │
    ┌────────────┼────────────────┐           ┌───────────┼──────────────┐
    │            │                │           │           │              │
┌───▼───┐  ┌────▼────┐  ┌───────▼──┐   ┌────▼────┐ ┌────▼─────┐ ┌─────▼──────┐
│client/│  │ server/ │  │cold-     │   │ src/dag/│ │src/crypto│ │ src/       │
│(React │  │(Express │  │signer/   │   │GHOSTDAG │ │/pqc/     │ │ consensus/ │
│ SPA)  │  │ API)    │  │(PWA)     │   │engine   │ │Falcon-512│ │ validation │
└───┬───┘  └────┬────┘  └────┬────┘   └─────────┘ │SPHINCS+  │ └────────────┘
    │           │             │                    │Kyber/NTRU│
    │           │             │                    └──────────┘
    │           │             │
    ▼           ▼             ▼
```

---

## 1. Repository Overview

### `beartec-jpg/Crypto` — Web Platform (TypeScript 95%)

The full-stack crypto trading + wallet platform deployed to Vercel.

### `beartec-jpg/QuantBTC` — QBTC Node (C++ 59% / C 15%)

A Bitcoin Core v28 fork with BlockDAG (GHOSTDAG K=32) + post-quantum cryptography.

---

## 2. Crypto Platform — Detailed Tree

```
beartec-jpg/Crypto
├── client/                          # React SPA (Vite + TailwindCSS)
│   └── src/
│       ├── components/
│       │   ├── Wallet/              # Multi-chain wallet UI
│       │   │   ├── WalletPanel      #   Main wallet dashboard
│       │   │   ├── SendForm         #   Multi-chain send (ETH, BTC, SOL, XRP, BSC, QBTC)
│       │   │   ├── VaultTab         #   Quantum Vault (PQC hybrid signing)
│       │   │   ├── ColdSignerSetup  #   Cold signer QR setup + Shamir splits
│       │   │   └── SwapTab          #   QBTC ↔ USDC atomic swaps (HTLC)
│       │   ├── Security/            # Security scanner UI
│       │   ├── chart/               # Candlestick charting engine
│       │   ├── indicators/          # Technical indicators (MA, BB, VWAP, etc.)
│       │   ├── oscillators/         # RSI, MACD, Stochastic, etc.
│       │   ├── smc/                 # Smart Money Concepts (order blocks, FVG)
│       │   ├── smt/                 # SMT Divergence detection
│       │   ├── divergence/          # Hybrid divergence analysis
│       │   ├── elliottWave/         # Elliott Wave pattern detection
│       │   ├── patterns/            # Chart pattern recognition
│       │   ├── tradingSystems/      # Automated backtesting systems
│       │   ├── volume/              # Volume profile analysis
│       │   ├── alerts/              # Price alert system
│       │   ├── ai/                  # AI trading assistant
│       │   ├── drawings/            # Chart drawing tools
│       │   ├── watchlist/           # Watchlist management
│       │   └── tools/               # Misc trading tools
│       ├── lib/
│       │   ├── crypto.ts            # Hybrid Falcon-512 + ECDSA (wallet UI signing)
│       │   ├── qbtcService.ts       # QBTC chain interaction (RPC proxy)
│       │   ├── coldSignerService.ts # QR-based cold signer communication
│       │   ├── shamirSecretSharing  # Shamir's Secret Sharing (2-of-3)
│       │   ├── securityTier.ts      # PIN / Password / Passkey tier system
│       │   └── falcon-wasm/         # Falcon-512 WASM (for QBTC on-chain signing)
│       │       ├── src/             #   Vendored Falcon reference C code
│       │       ├── falcon.wasm      #   Compiled WASM binary
│       │       └── falconWasm.ts    #   TypeScript wrapper
│       └── pages/
│           ├── CryptoApp.tsx        # Main trading dashboard
│           ├── QBTCHomePage.tsx      # QBTC marketing / roadmap page
│           ├── QBTCMining.tsx         # QBTC mining pool + lane stats + browser miner
│           └── QBTCSwapPage.tsx       # Atomic swap interface
│   └── public/
│       └── qbtc-browser-miner-worker.js  # Canonical browser mining worker asset
│
├── server/                          # Express.js backend
│   ├── routes.ts                    # All API endpoints (~360KB)
│   ├── db.ts                        # PostgreSQL (Drizzle ORM)
│   ├── databaseStorage.ts           # Persistence layer
│   ├── stripeCheckout.ts            # Stripe subscription billing
│   ├── cryptoSubscriptionService.ts # Tier-gated feature access
│   ├── python/
│   │   └── qbtc_wallet.py           # Python QBTC wallet (Shamir + Falcon)
│   └── services/                    # Backend business logic
│
├── cold-signer/                     # Standalone offline signing PWA
│   └── src/
│       └── lib/
│           ├── coldSigner.ts        # Multi-chain cold signing engine
│           ├── qbtcSigner.ts        # QBTC hybrid ECDSA+Falcon signing
│           ├── falcon-wasm/         # Separate copy of Falcon-512 WASM
│           └── shamirReconstruct    # Mnemonic reconstruction from shares
│
├── swap-server/                     # Atomic swap coordinator
│   └── (HTLC secret management, swap state machine)
│
├── api/                             # Vercel serverless API routes
├── shared/                          # Shared types between client/server
└── migrations/                      # DB schema migrations (Drizzle)
```

---

### QBTC Mining UI Metrics Binding Notes

- Lane tabs (`Home CPU`, `Open GPU`, `Pro / ASIC`) display lane-bound metrics and labels, not pooled/global round totals.
- Round cards in lane tabs bind to lane-filtered round contributors for accepted shares, weighted shares, and reward estimate.
- `Pool round status` remains global and is labeled explicitly as pool-wide status.
- Browser miner worker asset has a single canonical source: `client/public/qbtc-browser-miner-worker.js`.

### QBTC Mining Infrastructure (Implemented in this repository)

- Frontend mining surface: `client/src/pages/QBTCMining.tsx`
  - Gateway + lane tabs, setup instructions, lane metrics, fairness table, active worker views.
  - Browser CPU miner controls (address, alias, threads, throttle, live hashrate, accepted/rejected/weighted shares).
- Browser mining runtime worker: `client/public/qbtc-browser-miner-worker.js`
  - SHA-256d hashing loop, target comparison from share difficulty, job refresh support, per-second hashrate telemetry.
- Mining proxy APIs:
  - `api/qbtc/pool-stats.ts` (stats proxy with CORS allowlist and secure upstream checks)
  - `api/qbtc/browser-miner.ts` (job fetch + share submit with payload validation and per-IP rate limits)
  - `api/qbtc/miner/binding.ts` (authenticated payout/worker alias binding persisted in Postgres)
- Environment controls for mining are defined in `.env.example`:
  - `QBTC_POOL_STATS_URL`
  - `QBTC_POOL_HTTP_BASE_URL`
  - `QBTC_MINING_CORS_ORIGINS`
  - `QBTC_MINING_ALLOW_ORIGINLESS`
  - `QBTC_BROWSER_MINER_SUBMIT_RATE_LIMIT_PER_MINUTE`

> This repository implements the mining integration layer (UI + browser worker + secure proxies).
> Pool core/stratum internals are external, and node consensus/mining internals are in `beartec-jpg/QuantBTC`.

---

## 3. QuantBTC Node — Detailed Tree

```
beartec-jpg/QuantBTC
├── src/
│   ├── dag/                         # BlockDAG layer (QBTC-specific)
│   │   ├── ghostdag.cpp/h           #   GHOSTDAG scoring (blue/red sets, K=32)
│   │   └── dagtipset.cpp/h          #   Tip tracking, parent selection (up to 64)
│   │
│   ├── crypto/pqc/                  # Post-Quantum Cryptography
│   │   ├── falcon/                  #   Vendored Falcon-512 (FN-DSA-512) reference C
│   │   │   ├── sign.c/h             #     Keygen, sign, verify
│   │   │   └── (fft, codec, shake, etc.)
│   │   ├── sphincsplus/             #   SLH-DSA-SHA2-128f (hash-based sigs)
│   │   ├── falcon.cpp/h             #   High-level Falcon wrapper
│   │   ├── kyber.cpp/h              #   ML-KEM-768 key encapsulation (config stub)
│   │   ├── ntru.cpp/h               #   NTRU-HPS-4096-821 (config stub)
│   │   ├── frodokem.cpp/h           #   FrodoKEM (config stub)
│   │   └── pqc_config.cpp/h         #   Algorithm selection + hybrid mode config
│   │
│   ├── consensus/
│   │   └── pqc_validation.cpp/h     #   Consensus-level PQC witness verification
│   │
│   ├── script/
│   │   └── sigcache.h               #   Falcon + ECDSA signature cache
│   │
│   ├── earlyprotection.h            # Anti-monopolization (first 10K blocks)
│   ├── validation.cpp               # Block + tx validation (DAG-aware)
│   ├── pow.cpp                      # PoW + DAG difficulty adjustment
│   ├── chainparams.cpp              # QBTC chain params (magic, ports, genesis)
│   ├── wallet/                      # Bitcoin Core wallet + PQC key storage
│   └── rpc/                         # RPC extensions (getpqcinfo, DAG RPCs)
│
├── contrib/
│   └── evm-htlc/                    # Solidity HTLC for QBTC↔USDC swaps
│
├── doc/
│   ├── pqc.md                       # PQC architecture documentation
│   ├── ghostdag.md                  # GHOSTDAG consensus documentation
│   └── join-testnet.md              # Node operator guide
│
└── test/                            # Integration test scripts
```

---

## 4. How Everything Connects

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        USER (Browser / Mobile)                          │
└───────────────┬─────────────────────────────┬────────────────────────────┘
                │                             │
        ┌───────▼────────┐           ┌────────▼─────────┐
        │  Crypto Client │           │  Cold Signer PWA │
        │  (React SPA)   │           │  (Offline PWA)   │
        │                │  QR/paste │                   │
        │  • Trading UI  │◄─────────►│  • Receives Share │
        │  • Wallet      │  signed   │  • Signs offline  │
        │  • Charts      │  tx hex   │  • Returns sig    │
        │  • Vault       │           │                   │
        └───────┬────────┘           └───────────────────┘
                │                              ▲
                │ REST API                     │ Shamir Share 1
                │                              │ (encrypted on device)
        ┌───────▼────────┐                     │
        │  Crypto Server │                     │
        │  (Express)     │            ┌────────┴─────────┐
        │                │            │  Shamir 2-of-3   │
        │  • /api/qbtc/* ├──RPC──►    │  Secret Sharing  │
        │  • /api/swap/* │            │                   │
        │  • /api/market │            │  Share 1: Cold    │
        │  • /api/stripe │            │  Share 2: Browser │
        │  • PostgreSQL  │            │  Share 3: Backup  │
        └───────┬────────┘            └──────────────────┘
                │
        ┌───────▼────────┐
        │  QBTC Testnet  │
        │  (QuantBTC      │
        │   Full Nodes)   │
        │                 │
        │  Port: 28333    │
        │  RPC:  28332    │
        │                 │
        │  ┌────────────┐ │
        │  │ GHOSTDAG   │ │    ┌────────────────────────┐
        │  │ K=32       │ │    │  Ethereum Sepolia       │
        │  │ ~10s blocks│ │    │  (EVM HTLC Contract)    │
        │  └────────────┘ │    │                          │
        │  ┌────────────┐ │    │  QBTC ↔ USDC Atomic     │
        │  │ PQC Verify │◄├────┤  Swaps via HTLCs        │
        │  │ ECDSA +    │ │    └────────────────────────┘
        │  │ Falcon-512 │ │
        │  └────────────┘ │
        └─────────────────┘
```

---

## 5. Feature Matrix

### Crypto Platform Features

| Category | Feature | Status |
|----------|---------|--------|
| **Trading** | Real-time candlestick charts | ✅ Live |
| | Multi-timeframe analysis | ✅ Live |
| | 20+ technical indicators (MA, BB, VWAP, Ichimoku) | ✅ Live |
| | Oscillators (RSI, MACD, Stochastic, Williams %R) | ✅ Live |
| | Smart Money Concepts (OB, FVG, BOS/CHoCH) | ✅ Live |
| | SMT Divergence detection | ✅ Live |
| | Elliott Wave analysis | ✅ Live |
| | Liquidity sweep detection | ✅ Live |
| | Automated backtesting | ✅ Live |
| | Chart drawing tools | ✅ Live |
| | Price alerts | ✅ Live |
| | AI trading assistant | ✅ Live |
| **Wallet** | Multi-chain (ETH, BTC, SOL, XRP, BSC, QBTC) | ✅ Live |
| | Quantum Vault (PQC hybrid signing) | ✅ Live |
| | Shamir Secret Sharing (2-of-3) | ✅ Live |
| | Cold Signer PWA (offline signing) | ✅ Live |
| | Tiered security (PIN → Password → Passkey) | ✅ Live |
| | QBTC native sends (ECDSA + Falcon-512) | ✅ Live |
| **Swaps** | QBTC ↔ USDC atomic swaps (HTLC) | ✅ Testnet |
| | EVM HTLC Solidity contract | ✅ Testnet |
| **Auth** | Clerk authentication | ✅ Live |
| | Stripe subscription billing | ✅ Live |
| **Security** | Security scanner | ✅ Live |
| | WebAuthn passkey support | ✅ Live |

### QuantBTC Node Features

| Category | Feature | Status |
|----------|---------|--------|
| **Consensus** | GHOSTDAG K=32 (parallel blocks) | ✅ Live |
| | ~10 second block targets | ✅ Live |
| | DAG-aware difficulty adjustment | ✅ Live |
| | Up to 64 parent blocks per block | ✅ Live |
| | Early Protection (anti-monopolization) | ✅ Live |
| **PQC Signatures** | Falcon-512 (FN-DSA-512) hybrid | ✅ Live |
| | SPHINCS+ (SLH-DSA-SHA2-128f) | ✅ Live |
| | 4-element witness: [ecdsa_sig, ec_pk, falcon_sig, falcon_pk] | ✅ Live |
| | PQC signature cache (CuckooCache) | ✅ Live |
| | BIP9 deployment DEPLOYMENT_PQC (bit 3) | ✅ Live |
| **PQC KEMs** | Kyber (ML-KEM-768) — quantum-safe key exchange | ⚠️ Config stub |
| | NTRU-HPS-4096-821 — lattice-based key encapsulation | ⚠️ Config stub |
| | FrodoKEM — conservative LWE key encapsulation | ⚠️ Config stub |
| **PQC Sigs (Future)** | SQIsign (isogeny-based) | ❌ Stub only |
| **Network** | QBTC Testnet (port 28333) | ✅ Live |
| | Bech32 prefix: qbtct1 / qbtcrt1 | ✅ Live |
| | 3 seed nodes | ✅ Live |
| | 16 MB block weight (PQC-sized) | ✅ Live |
| **Wallet** | PQC key storage (walletdescriptorpqckey) | ✅ Live |
| | Deterministic Falcon key derivation from 32-byte seeds | ✅ Live |

---

## 6. PQC KEMs vs PQC Signatures — Explained

### PQC Signatures (Falcon-512, SPHINCS+)
Used for **signing transactions**. Proves that the owner of a private key authorized a spend. This is what the QBTC consensus layer verifies on every transaction.

### PQC KEMs (Kyber, NTRU, FrodoKEM)
Used for **key exchange / key encapsulation** — the quantum-safe replacement for Diffie-Hellman and RSA key transport. Potential future uses:
- **Encrypted P2P node communication** (quantum-safe handshake between QBTC nodes)
- **Encrypted wallet-to-wallet messaging**
- **Quantum-safe TLS for RPC connections**

KEMs are **not** used for signing transactions. They are currently declared in `pqc_config.h` but not active in consensus.

---

## 7. Cryptographic Signing Paths

```
                    ┌─────────────────────────────────┐
                    │     Two distinct PQC paths       │
                    └────────┬────────────────┬────────┘
                             │                │
                    ┌────────▼───────┐ ┌──────▼────────┐
                    │  QBTC On-Chain │ │ Wallet UI     │
                    │  (Consensus)   │ │ (Off-chain)   │
                    ├────────────────┤ ├───────────────┤
                    │ Falcon-512     │ │ Falcon-512    │
                    │ (FN-DSA-512)   │ │ (FN-DSA-512)  │
                    │ PK:  897 B     │ │ via           │
                    │ Sig: ~666 B    │ │ @noble/pq     │
                    │ SK: 1281 B     │ │               │
                    │ WASM (C code)  │ │ + ECDSA       │
                    │ + ECDSA        │ │ secp256k1     │
                    │ secp256k1      │ │               │
                    └────────────────┘ └───────────────┘

  Falcon-512 sigs are ~3.6× smaller than the old Dilithium
  setup (666B vs 2420B), enabling lighter transactions.
```

---

## 8. Transaction Signing Flow (QBTC)

```
  User clicks "Send QBTC"
         │
         ▼
  ┌──────────────┐     ┌─────────────────┐
  │ Browser has  │ YES │ Hot sign:       │
  │ mnemonic in  ├────►│ qbtcService.ts  │
  │ memory?      │     │ → Falcon WASM   │
  └──────┬───────┘     │ → ECDSA sign    │
         │ NO          │ → 4-elem witness│
         ▼             └────────┬────────┘
  ┌──────────────┐              │
  │ Cold Signer  │              ▼
  │ mode?        │              ┌────────────────┐
  └──────┬───────┘     ┌───────►│ Broadcast to   │
         │ YES         │         │ QBTC Testnet   │
         ▼             │         │ via RPC proxy  │
  ┌──────────────┐     │         └────────────────┘
  │ Build unsig  │     │
  │ tx → QR code │     │
  │ → scan on    │     │
  │ cold PWA     │     │
  │ → combine    │     │
  │ Shamir shares│     │
  │ → sign       │     │
  │ → QR back    │     │
  │ → broadcast  │     │
  └──────────────┘     │
```
