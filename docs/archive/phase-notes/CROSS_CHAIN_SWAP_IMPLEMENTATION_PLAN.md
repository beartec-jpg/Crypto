# Cross-Chain Atomic Swap Expansion — Implementation Plan

**Date:** April 27, 2026  
**Status:** Ready to build  
**Existing baseline:** QBTC ↔ USDC live, 3 successful swaps April 14 2026

---

## What We Are Building

A trustless peer-to-peer atomic swap marketplace supporting **20 unique trading pairs** across
BTC, QBTC, ETH, BNB, USDC and XRP — all using real on-chain HTLCs with no bridge, no wrapped
token, no custodian.

The core swap server, order book, and secret-coordination state machine are **unchanged**.
We are adding a chain-adapter layer beneath them and making the pair dimension a first-class
concept everywhere it currently assumes QBTC ↔ USDC.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Wallet UI (React)                     │
│  MarketplaceTab: pair selector + order book + swap flow  │
└───────────────────────┬─────────────────────────────────┘
                        │  REST API
┌───────────────────────▼─────────────────────────────────┐
│              Swap Server (Express / Node.js)             │
│  Order book  │  State machine  │  Chain monitors        │
└──────┬────────────────┬───────────────────┬─────────────┘
       │                │                   │
┌──────▼──────┐  ┌──────▼──────┐  ┌────────▼────────┐
│ EvmAdapter  │  │BitcoinAdaptr│  │  XrplAdapter    │
│ETH/BNB/USDC │  │ BTC / QBTC  │  │      XRP        │
└─────────────┘  └─────────────┘  └─────────────────┘
```

**Chain Adapter Interface (TypeScript)**
```typescript
interface IChainAdapter {
  chain: ChainId;                // 'QBTC' | 'BTC' | 'ETH' | 'BNB' | 'USDC' | 'XRP'

  // Called by the locking party
  lockFunds(params: LockParams): Promise<LockResult>;
  // { secretHash, amountRaw, timelockSecs, counterpartyAddress, signerOrKey }
  // Returns { lockId, lockAddress?, lockTxId? }

  // Called by the claiming party after the other side reveals the secret
  claimFunds(params: ClaimParams): Promise<string>;
  // { lockId, secret } → claimTxId

  // Called by the locking party after timelock expires (no-deal refund)
  refundFunds(params: RefundParams): Promise<string>;
  // { lockId } → refundTxId

  // Server-side: verify the lock is confirmed on-chain
  verifyLock(lockId: string, expectedAmount: string, expectedHash: string): Promise<boolean>;

  // Server-side: check if the secret has been revealed on-chain (claim detected)
  getRevealedSecret(lockId: string): Promise<string | null>;
}
```

---

## Phases

---

### Phase 1 — Chain Adapter Foundation *(~2 days)*

**Goal:** Define and implement the adapter interface for all chains. No UI changes yet.

#### 1.1 Create adapter directory structure

```
client/src/lib/adapters/
├── IChainAdapter.ts          ← interface + shared types
├── EvmAdapter.ts             ← ETH, BNB, USDC (ERC-20 and native ETH)
├── BitcoinAdapter.ts         ← BTC and QBTC (reuse qbtcService logic)
├── XrplAdapter.ts            ← XRP (EscrowCreate / EscrowFinish)
└── index.ts                  ← factory: getAdapter(chain) → IChainAdapter

swap-server/adapters/
├── IChainAdapter.ts          ← same interface for server-side monitoring
├── EvmMonitor.ts             ← polls EVM for claim events (refactor from index.ts)
├── BitcoinMonitor.ts         ← polls QBTC/BTC node for claim txs
└── XrplMonitor.ts            ← polls XRPL for EscrowFinish events
```

#### 1.2 EvmAdapter — covers ETH, BNB, USDC

- **ERC-20 tokens (USDC):** uses the existing `HashedTimelockERC20` contract (already deployed).
- **Native ETH / BNB:** deploy a new `HashedTimelockETH` Solidity contract on Ethereum mainnet
  and BSC mainnet. This is identical in logic to the ERC-20 version but accepts `msg.value`
  instead of `transferFrom`. *No third-party bridge or wrapped token required.*
- Single `EvmAdapter` class; constructor receives `{ chain: 'ETH'|'BNB'|'USDC', rpcUrl, htlcAddress, tokenAddress?, signer }`.

**New Solidity contract needed:**
```solidity
// contracts/HashedTimelockETH.sol  (deploy on ETH + BSC)
// Identical to HashedTimelockERC20 but payable, stores msg.value
```

**Env vars to add:**
```
EVM_HTLC_ETH_CONTRACT=0x...      # Ethereum mainnet deployment
EVM_HTLC_ETH_RPC=https://...
EVM_HTLC_BNB_CONTRACT=0x...      # BSC mainnet deployment
EVM_HTLC_BNB_RPC=https://...
# Existing USDC contract stays
EVM_HTLC_USDC_CONTRACT=0x...
EVM_HTLC_USDC_RPC=https://...
```

#### 1.3 BitcoinAdapter — covers BTC and QBTC

- Extract HTLC script building from `client/src/lib/qbtcService.ts` into the new adapter.
- Parameterise: `{ chain: 'BTC'|'QBTC', network: 'mainnet'|'testnet', rpcUrl, rpcAuth }`.
- QBTC uses hybrid Dilithium+ECDSA keypair; BTC uses standard ECDSA (secp256k1 only).
- The Bitcoin Script HTLC (OP_SHA256 / OP_CLTV) is identical for both chains.
- `lockFunds` returns `{ lockId: htlcTxid, lockAddress: p2wshAddress }`.

#### 1.4 XrplAdapter — covers XRP

Install dependency:
```bash
npm install xrpl
```

XRP uses native ledger escrow — no smart contract deployment needed:
- `lockFunds` → `EscrowCreate` with `Condition` (SHA-256 PREIMAGE_SHA256 crypto-condition).
- `claimFunds` → `EscrowFinish` with `Fulfillment` (the 32-byte preimage, crypto-condition encoded).
- `refundFunds` → `EscrowCancel` after `CancelAfter` ledger sequence expires.
- `verifyLock` → look up escrow object by account + sequence.
- `getRevealedSecret` → query recent `EscrowFinish` txs for the escrow object.

Note: XRP uses PREIMAGE-SHA-256 crypto-conditions (RFC draft), not raw SHA256. The
`five-bells-condition` npm package handles encoding. The secret hash format must match.

#### 1.5 Deliverable test

Write a test script `tests/adapters/smoke_test.ts`:
- Instantiate each adapter against testnet.
- Call `lockFunds` with a test secret hash.
- Verify `verifyLock` returns true.
- Call `claimFunds` with the secret.
- Verify `getRevealedSecret` returns the correct preimage.

---

### Phase 2 — Database Schema Extension *(~1 day)*

**Goal:** Make `swap_offers` and `atomic_swaps` pair-aware without breaking the existing
QBTC/USDC live swap history.

#### 2.1 Schema changes in `shared/schema.ts`

**`swap_offers` additions:**
```typescript
baseChain: text("base_chain").notNull().default("QBTC"),  // what maker is selling
quoteChain: text("quote_chain").notNull().default("USDC"), // what maker wants
// Rename existing USDC-specific field to generic 'quoteAmountRequested'
// (keep usdcAmountRequested as alias for backward compat)
quoteAmountRequested: text("quote_amount_requested").notNull(),
// Rename qbtcAmount to baseAmount
baseAmount: text("base_amount").notNull(),
// Address on the base chain where taker delivers quote funds
makerQuoteAddress: text("maker_quote_address"),
```

**`atomic_swaps` additions:**
```typescript
baseChain: text("base_chain").notNull().default("QBTC"),
quoteChain: text("quote_chain").notNull().default("USDC"),

// Generic side A (maker/seller locks first)
sideAAddress: text("side_a_address").notNull(),    // maker's address on base chain
sideAAmount: text("side_a_amount").notNull(),
sideALockId: text("side_a_lock_id"),               // txid or contractId
sideALockAddress: text("side_a_lock_address"),     // HTLC P2WSH address (BTC/QBTC only)
sideALocktime: integer("side_a_locktime"),

// Generic side B (taker/buyer locks second)
sideBAddress: text("side_b_address").notNull(),    // taker's address on quote chain
sideBAmount: text("side_b_amount").notNull(),
sideBLockId: text("side_b_lock_id"),
sideBLocktime: integer("side_b_locktime"),

// Existing QBTC/EVM fields kept for backward compat — new pairs use sideA/B
```

#### 2.2 Migration file

Create `swap-server/migrations/0004_multi_chain_pairs.sql`:
```sql
ALTER TABLE swap_offers
  ADD COLUMN IF NOT EXISTS base_chain text NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain text NOT NULL DEFAULT 'USDC',
  ADD COLUMN IF NOT EXISTS base_amount text,
  ADD COLUMN IF NOT EXISTS quote_amount_requested text,
  ADD COLUMN IF NOT EXISTS maker_quote_address text;

-- Back-fill from existing columns
UPDATE swap_offers
  SET base_amount = qbtc_amount,
      quote_amount_requested = usdc_amount_requested
  WHERE base_amount IS NULL;

ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS base_chain text NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain text NOT NULL DEFAULT 'USDC',
  ADD COLUMN IF NOT EXISTS side_a_address text,
  ADD COLUMN IF NOT EXISTS side_a_amount text,
  ADD COLUMN IF NOT EXISTS side_a_lock_id text,
  ADD COLUMN IF NOT EXISTS side_a_lock_address text,
  ADD COLUMN IF NOT EXISTS side_a_locktime integer,
  ADD COLUMN IF NOT EXISTS side_b_address text,
  ADD COLUMN IF NOT EXISTS side_b_amount text,
  ADD COLUMN IF NOT EXISTS side_b_lock_id text,
  ADD COLUMN IF NOT EXISTS side_b_locktime integer;

-- Back-fill existing QBTC/USDC swaps
UPDATE atomic_swaps
  SET side_a_address = seller_qbtc_address,
      side_a_amount = qbtc_amount,
      side_a_lock_id = qbtc_htlc_txid,
      side_a_lock_address = qbtc_htlc_address,
      side_a_locktime = qbtc_locktime,
      side_b_address = buyer_evm_address,
      side_b_amount = usdc_amount,
      side_b_lock_id = evm_contract_id,
      side_b_locktime = evm_locktime
  WHERE side_a_address IS NULL;

-- Index for pair-filtered order book queries
CREATE INDEX IF NOT EXISTS idx_swap_offers_pair
  ON swap_offers(base_chain, quote_chain, status);
CREATE INDEX IF NOT EXISTS idx_atomic_swaps_pair
  ON atomic_swaps(base_chain, quote_chain, status);
```

---

### Phase 3 — Swap Server Generalisation *(~2 days)*

**Goal:** Make every API endpoint pair-aware. The state machine logic stays the same —
only the chain-specific lock/verify calls use the adapter.

#### 3.1 Pair validation middleware

Add to `swap-server/index.ts`:
```typescript
const SUPPORTED_CHAINS = ['QBTC', 'BTC', 'ETH', 'BNB', 'USDC', 'XRP'] as const;
const SUPPORTED_PAIRS = new Set([
  'QBTC/USDC', 'QBTC/ETH', 'QBTC/BNB', 'QBTC/BTC', 'QBTC/XRP',
  'ETH/USDC',  'ETH/BNB',  'ETH/BTC',  'ETH/XRP',
  'BNB/USDC',  'BNB/BTC',  'BNB/XRP',
  'USDC/BTC',  'USDC/XRP',
  'BTC/XRP',
]);

function validatePair(base: string, quote: string): void {
  if (!SUPPORTED_PAIRS.has(`${base}/${quote}`)) {
    throw Object.assign(
      new Error(`Unsupported pair: ${base}/${quote}`),
      { statusCode: 400 }
    );
  }
}
```

#### 3.2 API endpoint changes

All offer and swap creation endpoints gain optional `baseChain` / `quoteChain` body params
(default to `'QBTC'` / `'USDC'` for backward compatibility):

| Endpoint | Change |
|---|---|
| `POST /api/swap/offer` | Accept `baseChain`, `quoteChain`, `baseAmount`, `quoteAmountRequested`, `makerQuoteAddress` |
| `GET /api/swap/offers` | Accept `?base=QBTC&quote=USDC` filter (required, no default — caller must specify) |
| `POST /api/swap/buy-offer` | Same pair fields |
| `GET /api/swap/buy-offers` | Same pair filter |
| `POST /api/swap/accept/:offerId` | No change — pair inherited from offer |
| `POST /api/swap/lock/side-a` | Replaces `lock/qbtc` — chain-agnostic, uses `sideA` adapter |
| `POST /api/swap/lock/side-b` | Replaces `lock/evm` — chain-agnostic, uses `sideB` adapter |
| `GET /api/swap/stats` | Accept `?base=&quote=` filter |

Keep old `/lock/qbtc` and `/lock/evm` endpoints as aliases pointing to the new ones to
avoid breaking the live QBTC/USDC flow.

#### 3.3 Canonical signed message update

The signature challenge message must include the pair to prevent cross-pair replay attacks:

```typescript
// Before (existing):
`CREATE_OFFER:${evmAddress}:${qbtcAmount}:${usdcAmount}:${secretHash}:${timestamp}`

// After (new pairs):
`CREATE_OFFER:${baseChain}:${quoteChain}:${makerAddress}:${baseAmount}:${quoteAmount}:${secretHash}:${timestamp}`
```

The old format is kept for `QBTC/USDC` offers to maintain live compatibility.

#### 3.4 Chain monitor refactor

Currently the server has one inline polling loop that checks EVM for preimage revelation.
Replace with per-chain monitors using the adapter pattern:

```typescript
// swap-server/index.ts  — startMonitors()
for (const chainId of activeChains) {
  const monitor = getServerMonitor(chainId);   // returns EvmMonitor | BitcoinMonitor | XrplMonitor
  monitor.start(db, MONITOR_POLL_MS);
}
```

Each monitor queries the DB for `EVM_LOCKED` / `SIDE_B_LOCKED` swaps involving its chain
and calls `adapter.getRevealedSecret(lockId)`. When the preimage is found it sets
`status = COMPLETE` and stores `secret`.

---

### Phase 4 — Solidity Contracts for Native ETH and BNB *(~1 day)*

**Goal:** Deploy a native-ETH HTLC contract on Ethereum and BSC so ETH and BNB pairs
do not require WETH wrapping.

#### 4.1 HashedTimelockETH.sol

Create `contracts/HashedTimelockETH.sol`. Key differences from ERC-20 version:
- `newContract(...)` is `payable`; amount stored is `msg.value`
- `withdraw(contractId, preimage)` sends ETH with `call{value: amount}("")`
- `refund(contractId)` sends ETH back to sender
- Same hashlock / timelock / withdrawn / refunded logic

This is a ~80-line contract. No external dependencies. Can be verified on Etherscan.

#### 4.2 Deployment script

Create `scripts/deploy_htlc_eth.ts`:
```typescript
// Deploy HashedTimelockETH to Ethereum mainnet
// Deploy HashedTimelockETH to BSC mainnet
// Print deployed addresses to add to .env
```

#### 4.3 EvmAdapter update

Add `nativeMode: true` flag to EvmAdapter config for ETH and BNB chains. When `nativeMode`:
- `lockFunds` calls `newContract` with `{ value: amountWei }`
- `claimFunds` and `refundFunds` identical (no token approval step)

---

### Phase 5 — XRPL Adapter and Monitor *(~2 days)*

**Goal:** Support XRP pairs using XRPL native EscrowCreate.

#### 5.1 XrplAdapter implementation

```typescript
// client/src/lib/adapters/XrplAdapter.ts

import { Client, EscrowCreate, EscrowFinish, EscrowCancel } from 'xrpl';
import { cc } from 'five-bells-condition';  // crypto-conditions library

class XrplAdapter implements IChainAdapter {
  chain = 'XRP' as const;

  async lockFunds({ secretHash, amountDrops, timelockSecs, destinationAddress, wallet }) {
    // 1. Encode secretHash as PREIMAGE-SHA-256 crypto-condition
    const condition = cc.PreimageSha256.fromPreimage(Buffer.from(secretHash, 'hex'));
    // 2. Submit EscrowCreate
    const result = await client.submitAndWait({
      TransactionType: 'EscrowCreate',
      Account: wallet.classicAddress,
      Destination: destinationAddress,
      Amount: amountDrops.toString(),
      Condition: condition.getConditionBinary().toString('hex').toUpperCase(),
      CancelAfter: xrpLedgerTimestamp(timelockSecs),
      FinishAfter: xrpLedgerTimestamp(3600),  // earliest claim: 1h
    }, { wallet });
    return { lockId: `${wallet.classicAddress}:${result.result.Sequence}` };
  }

  async claimFunds({ lockId, secret, wallet }) {
    const [account, sequence] = lockId.split(':');
    const fulfillment = cc.PreimageSha256.fromPreimage(Buffer.from(secret, 'hex'));
    await client.submitAndWait({
      TransactionType: 'EscrowFinish',
      Account: wallet.classicAddress,
      Owner: account,
      OfferSequence: Number(sequence),
      Condition: ...
      Fulfillment: fulfillment.serializeBinary().toString('hex').toUpperCase(),
    }, { wallet });
  }

  async getRevealedSecret(lockId: string): Promise<string | null> {
    // Query account_tx for EscrowFinish transactions matching this sequence
    // Parse Fulfillment field to extract preimage
  }
}
```

Install: `npm install xrpl five-bells-condition`

#### 5.2 XrplMonitor (server-side)

Polls XRPL for `EscrowFinish` transactions on the destination accounts of active swaps.
Parses the `Fulfillment` field to extract the 32-byte preimage (which is the HTLC secret).
Updates swap status to `COMPLETE` in the DB.

---

### Phase 6 — Frontend Pair Selector and Order Book *(~2 days)*

**Goal:** Update `MarketplaceTab.tsx` to show a pair selector and dynamically load the
correct order book and swap flow for the selected pair.

#### 6.1 Pair selector component

Create `client/src/components/Wallet/PairSelector.tsx`:
```typescript
// Two dropdowns: BASE chain and QUOTE chain
// Filters out invalid combinations (e.g. QBTC/QBTC, SOL removed)
// Default: QBTC / USDC
// Emits { base: ChainId, quote: ChainId } on change

const BASE_CHAINS  = ['QBTC', 'ETH', 'BNB', 'USDC', 'BTC', 'XRP'];
const QUOTE_CHAINS = ['USDC', 'QBTC', 'ETH', 'BNB', 'BTC', 'XRP'];
```

#### 6.2 MarketplaceTab changes

- Add `selectedBase`, `selectedQuote` state (defaults: `'QBTC'`, `'USDC'`).
- Pass pair to all API calls: `GET /api/swap/offers?base=${selectedBase}&quote=${selectedQuote}`.
- The lock/claim workflow is already abstracted as steps. Change the step components to
  call the correct frontend adapter for each side:
  ```typescript
  const sideAAdapter = getAdapter(selectedBase, walletKeys);
  const sideBAdapter = getAdapter(selectedQuote, walletKeys);
  ```
- Show the correct "lock" instructions per chain:
  - BTC/QBTC: "Broadcast HTLC transaction to Bitcoin node"
  - ETH/BNB: "Approve + call newContract() on EVM"
  - XRP: "Submit EscrowCreate to XRPL"
  - USDC: existing ERC-20 HTLC flow

#### 6.3 Wallet key availability gating

Each chain requires different keys:
| Chain | Required wallet credential |
|---|---|
| QBTC | QBTC private key (Dilithium+ECDSA hybrid) |
| BTC | BTC private key (secp256k1) |
| ETH / BNB / USDC | EVM private key (MetaMask or embedded) |
| XRP | XRPL account seed |

The pair selector should grey out pairs for which the user doesn't have the necessary keys
loaded in their wallet. Show a "Connect XRP wallet" / "Connect BTC wallet" prompt.

#### 6.4 Price display

Update the price chart in the marketplace to show the correct price feed per pair:
- QBTC/* — show QBTC price in terms of quote chain
- ETH/USDC, BNB/USDC — use Binance price feed (already available in `tokenService.ts`)
- BTC/USDC — existing BTC price feed
- XRP/* — CoinGecko / Binance XRP feed

---

### Phase 7 — BTC-Specific Adapter and Testing *(~2 days)*

**Goal:** Support BTC (Bitcoin mainnet) as both a base and quote chain.

#### 7.1 BitcoinAdapter — BTC mainnet

The QBTC chain adapter already handles the HTLC script and P2WSH encoding. BTC mainnet
needs:
- `network: bitcoin.networks.bitcoin` (instead of QBTC testnet params)
- Standard ECDSA-only keypair (no Dilithium)
- A Bitcoin mainnet RPC or Electrum server for broadcasting and monitoring

Add config:
```
BTC_RPC_URL=https://...   # or Electrum server
BTC_RPC_USER=...
BTC_RPC_PASS=...
```

Or use a lightweight alternative: `@electrum-client/client` or Blockstream API for read,
user-signed PSBTs broadcast via their node / any relay.

#### 7.2 BitcoinMonitor (server-side)

For BTC monitoring, the server cannot directly watch Bitcoin mainnet with the same RPC as
QBTC testnet. Options (in order of simplicity):
1. **Blockstream Esplora API** (no auth, public): `GET /api/tx/:txid` — free to use
2. **User-provided Bitcoin Core RPC** (advanced users)
3. **Electrum protocol** (standard)

Recommended for MVP: Blockstream Esplora. Parse P2WSH output and spending transaction to
detect when the HTLC is claimed (which reveals the secret via witness stack).

---

### Phase 8 — Integration Tests *(~1 day)*

Extend the existing E2E test suite to cover multi-chain scenarios:

```
tests/
├── e2e/
│   ├── qbtc_usdc_swap.test.ts        ← existing (passes)
│   ├── eth_usdc_swap.test.ts         ← new (Sepolia testnet)
│   ├── bnb_usdc_swap.test.ts         ← new (BSC testnet)
│   └── xrp_usdc_swap.test.ts         ← new (XRPL testnet)
└── adapters/
    ├── evm_adapter.test.ts           ← unit tests
    ├── bitcoin_adapter.test.ts       ← unit tests
    └── xrpl_adapter.test.ts          ← unit tests
```

Each E2E test follows the same pattern as the working QBTC/USDC test:
1. Alice posts ASK offer for pair X/Y
2. Bob accepts
3. Alice locks side A
4. Bob locks side B
5. Monitor detects side B lock
6. Bob claims side A (reveals secret on-chain)
7. Monitor detects revealed secret
8. Alice claims side B
9. Assert both parties received correct funds

---

## Implementation Order (Recommended)

| Week | Phase | Deliverable | Live Pair Added |
|------|-------|-------------|-----------------|
| 1 | Phase 1 + 2 | Adapter interfaces + DB migration | — |
| 1 | Phase 3 | Server generalisation + backward compat | — |
| 2 | Phase 4 | HashedTimelockETH deployed | ETH/USDC, BNB/USDC |
| 2 | Phase 6 (partial) | Pair selector UI + EVM pairs in UI | ETH/USDC, BNB/USDC |
| 3 | Phase 5 | XRPL adapter + monitor | XRP/USDC, QBTC/XRP |
| 3 | Phase 6 (complete) | XRP UI flow | All XRP pairs |
| 4 | Phase 7 | BTC mainnet adapter | BTC/USDC, QBTC/BTC |
| 4 | Phase 8 | Full integration test suite | All 20 pairs |

---

## Files to Create (New)

```
contracts/
└── HashedTimelockETH.sol

scripts/
└── deploy_htlc_eth.ts

client/src/lib/adapters/
├── IChainAdapter.ts
├── EvmAdapter.ts
├── BitcoinAdapter.ts
├── XrplAdapter.ts
└── index.ts

client/src/components/Wallet/
└── PairSelector.tsx

swap-server/adapters/
├── IChainAdapter.ts
├── EvmMonitor.ts
├── BitcoinMonitor.ts
└── XrplMonitor.ts

swap-server/migrations/
└── 0004_multi_chain_pairs.sql

tests/adapters/
├── evm_adapter.test.ts
├── bitcoin_adapter.test.ts
└── xrpl_adapter.test.ts

tests/e2e/
├── eth_usdc_swap.test.ts
├── bnb_usdc_swap.test.ts
└── xrp_usdc_swap.test.ts
```

## Files to Modify (Existing)

```
shared/schema.ts              ← add pair columns to swap_offers + atomic_swaps
swap-server/index.ts          ← pair validation, generalised endpoints, monitor refactor
client/src/lib/evmHTLC.ts     ← add nativeMode flag, multi-chain config
client/src/lib/qbtcService.ts ← extract HTLC logic into BitcoinAdapter (keep as thin wrapper)
client/src/components/Wallet/MarketplaceTab.tsx  ← add pair selector, adapter-driven flow
package.json (root + swap-server)  ← add xrpl, five-bells-condition
```

---

## Key Decisions and Rationale

| Decision | Rationale |
|----------|-----------|
| Native ETH HTLC contract (not WETH) | Cleaner UX, no wrapping step, users see real ETH in wallet |
| XRP native escrow (not EVM bridge) | XRP ledger has built-in escrow — no smart contract needed, no bridge risk |
| BTC via Esplora API for monitoring | No Bitcoin Core node required on server; public API; production-grade |
| Backward-compat: keep old QBTC/USDC column names | Preserve the 3 live swaps and live order book without migration risk |
| Pair as `base_chain/quote_chain` text fields | Simple, queryable, human-readable in logs and DB inspection |
| Adapter pattern on both client and server | Client builds + signs HTLCs; server monitors chains. Same interface, different implementations |
| SOL excluded for now | Solana requires a custom Anchor program (1-2 week effort); no native escrow primitive; can be Phase 9 |

---

## Security Notes

- **No new custodial risk introduced.** Adapters only build and sign transactions locally.
  The server never holds private keys.
- **HashedTimelockETH.sol** must pass audit checklist: reentrancy guard on ETH send,
  only sender can refund, only receiver can withdraw (after timelock), no selfdestruct.
- **XRP crypto-conditions:** the `Condition` field on EscrowCreate commits to the preimage hash.
  Only the holder of the secret can submit `EscrowFinish`. This is equivalent security to
  Bitcoin OP_SHA256 HTLC.
- **Signature replay across pairs:** the canonical signed message includes `baseChain` and
  `quoteChain` so a signature for an ETH/USDC offer cannot be replayed as a QBTC/USDC offer.
- **Timelock asymmetry preserved:** side-A timelock (maker) must be at least 2× side-B
  timelock (taker) for all pairs, regardless of chains involved.

---

## What Makes This Competitively Unique (Summary)

1. **True HTLC, not a bridge** — funds travel directly between counterparties' own wallets
   on their native chains. No protocol contract ever holds assets in a pool.

2. **P2P order book** — users set their own prices. No LP fees, no slippage against a pool.

3. **Post-quantum on QBTC side** — every QBTC HTLC uses ML-DSA-44 + ECDSA. No other
   swap system offers this.

4. **Five chains in one wallet** — the user never leaves beartec.uk. Keys, balances,
   order book, and swap execution are unified.

5. **Proven and testable** — live swaps already completed; automated E2E test suite;
   not a whitepaper.

6. **Extensible** — adding SOL or any future chain is a single adapter (~200 lines) plus
   one monitor. The order book and state machine need zero changes.
