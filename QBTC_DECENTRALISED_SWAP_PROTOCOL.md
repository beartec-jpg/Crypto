# qBTC Decentralised Swap Protocol — Architecture Report
**Date:** May 7, 2026  
**Status:** Prototype / Conceptual Design  
**Author:** BearTec Engineering

---

## 1. What Exists Today

### 1.1 The qBTC Network
qBTC is a post-quantum Bitcoin testnet running a custom DAG-based node (`find_miner.py`). It uses a **hybrid signature scheme** combining:

- **ECDSA secp256k1** — for compatibility with existing Bitcoin tooling
- **Falcon-512** — a NIST-standardised lattice-based post-quantum signature algorithm

Every qBTC address commits to *both* public keys via `bech32(RIPEMD160(SHA256(ecdsaPub || falconPub)))`, producing addresses prefixed `qbtct1` (testnet) and `qbtc1` (mainnet). A transaction is only valid if both signatures are present in the witness. This makes qBTC wallets immune to quantum computing attacks that would break ECDSA alone.

The node exposes a Bitcoin-compatible JSON-RPC interface (`scantxoutset`, `sendrawtransaction`, `estimatesmartfee`, etc.) proxied through the BearTec server at `/api/qbtc/rpc`.

### 1.2 The BearTec Web Wallet
The main application at `beartec.uk/wallet` is a multi-chain sovereign wallet supporting Ethereum, Bitcoin, XRP, Solana, and qBTC. Key properties:

- **Non-custodial** — all key material generated and stored client-side
- **Passkey / WebAuthn authentication** — biometric unlock, no passwords sent to server
- **AES-256-GCM encrypted mnemonic** stored in IndexedDB (`beartec_wallet` database)
- **PBKDF2** key derivation (100,000 iterations, SHA-256) from the passkey-unlocked password
- **qBTC keys** derived via `HMAC-SHA512(masterSeed, 'QBTC' || index)` for ECDSA and `HMAC-SHA512(masterSeed, 'QBTC-PQC' || index)` for Falcon-512

### 1.3 The qBTC Mobile PWA
A standalone installable Progressive Web App at `beartec.uk/qbtc-wallet/` built with React 18 + Vite 5 + vite-plugin-pwa. It provides:

- **Two tabs: Wallet and Messenger**
- **Same-origin key import** — reads the `beartec_wallet` IndexedDB directly (same domain = shared storage), decrypts the mnemonic with the user's existing wallet password, re-encrypts locally with a 6-character PIN using PBKDF2 (600,000 iterations) + AES-256-GCM
- **Identical key derivation** to the main wallet — same qBTC address, same keys, no new seed phrase needed
- **Offline-capable** — service worker precaches all assets, works without internet after first load
- **Installable** — meets PWA installability criteria, can be added to home screen on iOS/Android

#### 1.3.1 Wallet Tab
- Live balance polling every 30 seconds via `scantxoutset`
- Send with fee estimation (`estimatesmartfee`)
- Receive with QR code display
- UTXO-based transaction building with largest-first coin selection
- 3-element witness: `[ecdsaSig, ecdsaPub, falconPub]`

#### 1.3.2 Messenger Tab
- **End-to-end encrypted** — server sees only ciphertext blobs
- **ECDH P-256** shared secret derived per-contact: `HKDF-SHA256(HMAC-SHA512(masterSeed, 'MSG-ECDH'))`
- **AES-256-GCM** message encryption with random IV per message
- Contact addressing uses qBTC addresses as identities — the same address you receive funds at is your messenger identity
- Messages relayed through `/api/qbtc/messages/send` and `/api/qbtc/messages/poll`
- 7-day TTL on relay server, messages stored encrypted locally in IndexedDB
- Polls every 8 seconds for new messages

#### 1.3.3 Current Relay Architecture
```
Alice PWA  →  [encrypted blob]  →  BearTec relay  →  [encrypted blob]  →  Bob PWA
              (server cannot read)                    (server cannot read)
```
The relay server is a **trusted courier, not a trusted party**. It routes messages but cannot decrypt or modify them.

### 1.4 Current Swap Architecture
Cross-chain swaps today are server-coordinated via the BearTec backend:
- Server constructs HTLC parameters
- Server monitors both chains for lock/claim/refund events
- Server knows swap participants, amounts, and timing
- Single point of failure and observation

---

## 2. The Problem with the Current Model

| Property | Today |
|---|---|
| Key custody | ✅ User holds keys |
| Message privacy | ✅ E2E encrypted |
| Swap privacy | ❌ Server knows all swap details |
| Swap censorship resistance | ❌ Server can block swaps |
| Cross-chain trustlessness | ⚠️ Cryptographically sound but operationally centralised |
| Peer discovery | ❌ Fully centralised |
| Node independence | ❌ All RPC goes through BearTec server |

The cryptographic primitives are sound. The **operational architecture** is the bottleneck.

---

## 3. Phase 2 — Messenger-Negotiated Swaps

### 3.1 Core Insight
The messenger already provides E2E encrypted, authenticated, asynchronous communication between any two qBTC addresses. This is exactly the communication channel needed to negotiate an atomic swap without a trusted third party.

The server in this model becomes a **dumb relay** — it cannot see swap terms, cannot front-run, cannot block specific pairs. It only knows that two addresses exchanged some encrypted blobs.

### 3.2 Swap Message Protocol (HTLC Negotiation over Messenger)

All swap messages are JSON payloads encrypted with the existing ECDH-P256 + AES-256-GCM scheme. A typed message envelope:

```typescript
type SwapMessageType = 
  | 'SWAP_OFFER'       // "I want to swap X qBTC for Y BTC"
  | 'SWAP_ACCEPT'      // "Accepted — here are my HTLC parameters"
  | 'SWAP_LOCK_CONF'   // "I've locked funds on my chain, here's the tx"
  | 'SWAP_CLAIM'       // "I've claimed — here's the preimage (as a courtesy)"
  | 'SWAP_REFUND'      // "Timelock expired, I'm refunding"
  | 'SWAP_CANCEL'      // "I'm backing out before any locks"

interface SwapMessage {
  type: SwapMessageType;
  swapId: string;          // UUID, randomly generated by initiator
  version: 1;              // protocol version for forward compat
  payload: SwapPayload;
  timestamp: number;
}
```

#### 3.2.1 Full Swap Flow

```
Alice (has qBTC, wants BTC)              Bob (has BTC, wants qBTC)

Step 1: Discovery (out of band or via broadcast)
Alice → Bob:  SWAP_OFFER {
                swapId, 
                offerAmount: "0.1 qBTC",
                wantAmount:  "0.1 BTC",
                myQbtcAddress, 
                myBtcAddress,
                expiresAt: now + 10min
              }

Step 2: Agreement
Bob → Alice:  SWAP_ACCEPT {
                swapId,
                myQbtcAddress,
                myBtcAddress,
                hashlock: H,           // H = SHA256(secret S), Bob holds S
                timelockBtc:  48h,     // Bob's timelock (longer — he locks second)
                timelockQbtc: 24h      // Alice's timelock (shorter — she locks first)
              }

Step 3: Alice locks qBTC
Alice broadcasts qBTC HTLC:
  "Pay Bob's qbtc address if he reveals S within 24h, 
   else refund Alice after 24h"
Alice → Bob:  SWAP_LOCK_CONF { swapId, chain: 'qbtc', txid, htlcScript }

Step 4: Bob verifies lock, locks BTC
Bob verifies Alice's qBTC HTLC on-chain (no trust needed).
Bob broadcasts Bitcoin HTLC:
  "Pay Alice's BTC address if she reveals S within 48h,
   else refund Bob after 48h"
Bob → Alice:  SWAP_LOCK_CONF { swapId, chain: 'btc', txid, htlcScript }

Step 5: Alice claims BTC (reveals S on Bitcoin chain)
Alice broadcasts claim tx on Bitcoin — S is now public on-chain.
Alice → Bob:  SWAP_CLAIM { swapId, preimage: S }  // courtesy only — S is already on-chain

Step 6: Bob claims qBTC using S
Bob broadcasts claim tx on qBTC chain.
Swap complete. No server involved after initial message relay.
```

#### 3.2.2 Timelock Asymmetry (Security Requirement)
Alice's qBTC HTLC timelock **must be shorter** than Bob's BTC HTLC timelock. This prevents a scenario where Bob claims Alice's qBTC after her refund window has closed but before she can claim his BTC. The standard safe ratio is 2:1 (e.g. 24h qBTC / 48h BTC).

### 3.3 What the Server Still Does
In Phase 2, the BearTec server:
- Routes encrypted negotiation messages (cannot read them)
- Does **not** participate in HTLC construction
- Does **not** hold any swap state
- Does **not** know swap amounts or participants (only ciphertext blobs)

The server can be replaced with any relay in this model (Nostr, Matrix, IPFS pubsub) without changing the swap protocol.

### 3.4 Cross-Chain Compatibility
Because qBTC uses a hybrid ECDSA+Falcon-512 signature scheme, the HTLC on the **Bitcoin side** uses standard Bitcoin Script (ECDSA only — Bitcoin doesn't know about Falcon). The HTLC on the **qBTC side** uses the full hybrid witness. This is fine: the security binding between the two HTLCs is the **hashlock** (`H = SHA256(S)`), which is chain-agnostic. The different signature schemes on each chain are orthogonal to the atomic swap guarantee.

Supported cross-chain pairs in this architecture:
- **qBTC ↔ BTC** (P2WSH HTLC on Bitcoin, hybrid HTLC on qBTC)
- **qBTC ↔ ETH** (HTLC via Solidity contract on Ethereum)
- **qBTC ↔ Any UTXO chain** (LTC, BCH, etc. — identical to BTC flow)
- **qBTC ↔ Lightning** (submarine swap variant — requires a routing node)

---

## 4. Phase 3 — Node Sidecar

### 4.1 What is a Sidecar?
A sidecar is a separate process that runs alongside the qBTC node, communicates with it via its existing RPC interface, and adds swap capability without modifying the node software. This is the model used by:
- **lnd** (Lightning) alongside Bitcoin Core
- **Boltz** (submarine swaps) alongside Lightning nodes
- **xud** (Lightning/Connext cross-chain) alongside LND + Geth

### 4.2 qBTC Swap Sidecar Architecture

```
┌─────────────────────────────────────────────┐
│                 qBTC Node                    │
│   (find_miner.py / full node software)       │
│   JSON-RPC :8332                             │
└──────────────────────┬──────────────────────┘
                       │ RPC
┌──────────────────────▼──────────────────────┐
│              qbtc-swapd (sidecar)            │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ HTLC Engine │  │  P2P Swap Messaging  │  │
│  │             │  │  (Nostr / relay)     │  │
│  │ - construct │  │                      │  │
│  │ - monitor   │  │ - broadcast offers   │  │
│  │ - claim     │  │ - receive/accept     │  │
│  │ - refund    │  │ - negotiate params   │  │
│  └─────────────┘  └──────────────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Foreign Chain Watchers              │   │
│  │  BTC RPC | ETH RPC | ...            │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  REST/gRPC API → wallet clients             │
└─────────────────────────────────────────────┘
```

### 4.3 Sidecar Responsibilities
- **HTLC construction** — builds and broadcasts lock/claim/refund transactions on qBTC
- **Cross-chain watching** — connects to Bitcoin Core (or Electrum), Ethereum node, etc. to watch for counterparty locks and claim transactions
- **Preimage management** — generates and securely stores HTLC secrets
- **Timeout management** — automatically broadcasts refund transactions before timelocks expire
- **Offer broadcasting** — announces liquidity to the p2p network
- **Fee management** — estimates and bumps fees (CPFP/RBF) if needed

### 4.4 Node Operator Opt-In
Node operators who want to earn swap routing fees run the sidecar alongside their node:

```toml
# qbtc-swapd.toml
[node]
rpc_host = "127.0.0.1:8332"
rpc_user = "..."
rpc_pass = "..."

[swap]
enabled = true
max_swap_amount = 1.0       # qBTC
min_swap_amount = 0.001     # qBTC
fee_rate = 0.001            # 0.1% per swap

[liquidity]
btc_rpc = "127.0.0.1:8333"
eth_rpc = "https://..."

[p2p]
listen = "0.0.0.0:9735"
announce = true
```

Operators who run this sidecar earn fees on every swap they route — creating a financial incentive for a healthy swap liquidity network to form organically.

---

## 5. Phase 4 — Node-Native Swap Module

### 5.1 Swap Capability as a First-Class Network Feature
In this phase, swap support is compiled into the qBTC node itself as an optional module. Node operators enable it with a single config flag:

```
swaps.enabled = true
```

This makes the qBTC network itself the swap routing layer — no external process, no separate binary.

### 5.2 How Nodes Advertise Liquidity
Swap-capable nodes add a new field to their p2p gossip messages:

```json
{
  "nodeId": "qbtct1...",
  "swapPairs": ["qBTC/BTC", "qBTC/ETH"],
  "maxLiquidity": { "qBTC": 10.0, "BTC": 1.0 },
  "feeRate": 0.001,
  "timelockDelta": 144
}
```

Any wallet (including the PWA) can query connected nodes for swap liquidity without any central order book. This is peer discovery at the protocol level.

### 5.3 Comparison with Thorchain
Thorchain uses validator nodes as liquidity providers in a pooled model — validators collectively hold funds in vaults and execute swaps. This introduces validator trust and bonding complexity.

The qBTC model is different: **each swap is a direct bilateral HTLC between two parties**. Nodes with the swap module are matchmakers and relays, not custodians. They never hold user funds. This preserves the non-custodial guarantee from day one.

### 5.4 The Complete Network Topology (Phase 4)

```
┌──────────┐    Nostr/P2P gossip     ┌──────────┐
│ qBTC Node│◄──────────────────────►│ qBTC Node│
│ +swapd   │    swap offers/routing  │ +swapd   │
└────┬─────┘                         └─────┬────┘
     │ RPC                                 │ RPC
┌────▼─────┐                         ┌─────▼────┐
│  Alice   │    direct HTLC          │   Bob    │
│ PWA/App  │◄──────────────────────►│ PWA/App  │
└──────────┘    (on-chain, no relay) └──────────┘
```

Alice's wallet discovers Bob (or a routing node) via the p2p gossip layer. They negotiate via E2E encrypted messages. They lock and claim via on-chain HTLCs. The BearTec server is completely absent from this flow.

---

## 6. Nostr as the Decentralised Relay

### 6.1 Why Nostr
The current BearTec relay (`/api/qbtc/messages`) is functionally a **Nostr relay** — it stores and forwards signed, encrypted events. Nostr is an open protocol that already has dozens of public relays. Migrating to Nostr would:

- Eliminate the BearTec relay as a single point of failure
- Allow messages to propagate across multiple relays (censorship resistant)
- Leverage existing Nostr infrastructure and clients
- Keep message content E2E encrypted (Nostr NIP-04 / NIP-44)

### 6.2 Migration Path
The PWA's `messaging.ts` currently calls `POST /api/qbtc/messages/send`. This can be swapped for a Nostr relay publish with minimal code change — the message format is identical, only the transport changes.

```typescript
// Today
await fetch('/api/qbtc/messages/send', { method: 'POST', body: encryptedBlob });

// Phase 3 — Nostr
await nostrRelay.publish({
  kind: 4,  // NIP-04 encrypted direct message
  pubkey: senderPubkey,
  tags: [['p', recipientPubkey]],
  content: encryptedBlob,
});
```

Swap negotiation messages use the same transport as regular chat messages — no protocol distinction needed. A `SWAP_OFFER` is just an encrypted message that the recipient's wallet interprets differently from a chat message.

---

## 7. Security Analysis

### 7.1 Atomic Swap Guarantees
The HTLC construction ensures:

| Scenario | Outcome |
|---|---|
| Both parties cooperative | Swap completes, both get funds |
| Alice locks but Bob doesn't | Alice refunds after 24h timelock |
| Both lock, Alice doesn't claim | Alice refunds (24h), Bob refunds (48h) |
| Both lock, Bob tries to steal Alice's qBTC without paying | Impossible — he needs preimage S to claim qBTC, revealing S allows Alice to claim BTC |
| Server goes down mid-swap | No impact — HTLCs are on-chain, refunds are trustless |

There is no scenario where a cooperative participant loses funds.

### 7.2 Quantum Resistance in Cross-Chain Context
The qBTC side of every swap uses Falcon-512 hybrid signatures — quantum resistant. The Bitcoin side uses standard P2WSH (ECDSA). This means:

- A quantum attacker could break the **Bitcoin HTLC** (steal BTC from the hashlock)
- The **qBTC HTLC** remains secure against quantum attack
- Full quantum security requires the counterparty chain to also support PQC signatures

This is the state of the ecosystem today — qBTC leads, other chains follow. As Bitcoin adds PQC opcodes (actively being discussed in BIPs), cross-chain swaps will become fully quantum resistant end-to-end.

### 7.3 Messenger Security Properties
| Property | Current | Phase 3+ |
|---|---|---|
| Message confidentiality | ✅ AES-256-GCM | ✅ Same |
| Message authentication | ✅ ECDH P-256 | ✅ + Nostr key signing |
| Forward secrecy | ❌ Static ECDH key | 🔄 Double Ratchet (future) |
| Metadata privacy | ⚠️ Server sees sender/recipient | ✅ Nostr: multiple relays see partial metadata |
| Censorship resistance | ❌ Single relay | ✅ Nostr: propagates to all relays |

---

## 8. Roadmap

### Now — Phase 1 (Complete)
- ✅ qBTC PWA with Wallet + Messenger tabs
- ✅ Same-origin key import (piggyback off main wallet)
- ✅ E2E encrypted messenger over BearTec relay
- ✅ Server-coordinated swaps (centralised)
- ✅ PWA installable, offline-capable

### Near Term — Phase 2
- [ ] Swap message type definitions (`SWAP_OFFER`, `SWAP_ACCEPT`, etc.)
- [ ] HTLC construction in PWA (`txBuilder.ts` extension)
- [ ] Cross-chain watchers (Bitcoin RPC / Electrum client in PWA)
- [ ] Swap UI in PWA Messenger tab (swap offer cards in chat)
- [ ] Timelock management + auto-refund

### Medium Term — Phase 3
- [ ] `qbtc-swapd` sidecar binary (Go or Rust)
- [ ] REST API from sidecar to PWA/web wallet
- [ ] Nostr relay migration for messenger
- [ ] Liquidity advertisement over p2p

### Long Term — Phase 4
- [ ] Swap module baked into qBTC node
- [ ] P2P swap gossip protocol in node
- [ ] Lightning submarine swaps (qBTC ↔ Lightning BTC)
- [ ] Full Nostr integration with NIP-44 encrypted swap messages
- [ ] Double Ratchet forward secrecy for messenger
- [ ] Multi-hop swap routing (like Lightning routing but for atomic swaps)

---

## 9. Summary

The qBTC ecosystem is being built in layers, each one reducing trust requirements:

```
Layer 0: qBTC Chain        — quantum-resistant consensus, no trusted party
Layer 1: PWA Wallet        — non-custodial, keys never leave device  
Layer 2: E2E Messenger     — server routes but cannot read
Layer 3: Messenger Swaps   — server routes but cannot see swap terms
Layer 4: Sidecar Swaps     — server not involved in swap execution
Layer 5: Node-Native Swaps — server completely absent, p2p only
```

Each layer is functional and deployable independently. The current implementation covers Layers 0–2 fully and lays the groundwork for Layer 3. The architecture at every level is designed so that decentralisation can be incrementally increased without breaking backwards compatibility.

The end state is a system where:
- **Users** install a PWA, import their existing wallet with one password, and swap any chain for qBTC without touching any server
- **Node operators** earn fees by running the swap module, with zero custody risk
- **The BearTec server** becomes optional infrastructure rather than a required trust anchor
- **Quantum resistance** is built in from the start, not retrofitted later
