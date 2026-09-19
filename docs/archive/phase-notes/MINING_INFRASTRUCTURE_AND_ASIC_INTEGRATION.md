# QBTC Mining Infrastructure & ASIC Miner Integration
**QuantumBTC Testnet — BearTec Pool**
**Last Updated:** April 25, 2026

---

## 1. Infrastructure Overview

### Node and Pool Topology

| Node | IP | Role | Hardware |
|---|---|---|---|
| **N1** | 89.167.109.241 | Stratum pool host + full node | Hetzner 4GB (berlin) |
| **N2** | 46.62.156.169 | Full node (canonical / miner backup) | Hetzner 4GB |
| **N3** | 37.27.47.236 | Full node | Hetzner 4GB |
| **N4** | 46.224.0.140 | Full node | Hetzner 4GB |
| **BitAxe** | 84.65.200.7 | Hardware ASIC miner | ~1 TH/s SHA256d |

### Service Layout

```
Internet
   │
   ▼
N1: 89.167.109.241
├── bitcoind  (port 28332 RPC, port 28333 P2P)
│   └── getblocktemplate → qbtc_pool.py
└── qbtc-pool.service (Python)
    ├── Stratum v1  listener  → port 3333
    ├── HTTP stats  endpoint  → port 8088
    └── DB: SQLite /var/lib/qbtc-pool/pool.db
         └── shares, rounds, bindings tables

BitAxe → stratum+tcp://89.167.109.241:3333
Browser miners → HTTPS proxy → api/qbtc/browser-miner → pool HTTP
```

### Pool Service

- **Script:** `/root/QuantBTC/contrib/qbtc-pool/qbtc_pool.py`
- **Systemd unit:** `qbtc-pool.service` (enabled, auto-restart)
- **Stratum port:** 3333
- **Stats API:** port 8088
- **Lane passwords** (worker `-p` flag):
  - `x` / `home` — CPU / home miners
  - `gpu` — GPU miners
  - `pro` — Pro / ASIC lane (BitAxe, Antminer, etc.)

---

## 2. The 80-Byte PoW Fix — ASIC Compatibility

### Background: The DAG Header Problem

QBTC runs in GHOSTDAG (BlockDAG) mode. DAG blocks must reference multiple parent blocks, not just one. This is stored in a `hashParents[]` vector appended to each block. To commit to those parents cryptographically, a 32-byte `hashParentsRoot` (SHA256d of all parent hashes concatenated) is included in the on-disk header.

**Without a fix**, the full DAG block header would be 112 bytes:
```
nVersion (4) + hashPrevBlock (32) + hashMerkleRoot (32) + nTime (4) + nBits (4) + hashParentsRoot (32) + nNonce (4)
= 112 bytes
```

Every SHA256d ASIC miner firmware hardcodes an 80-byte header for its hashing. Feeding 112 bytes would require firmware modifications to every miner model — this is not feasible.

### The Fix: Decouple PoW Preimage from Serialization

The fix is in `/root/QuantBTC/src/primitives/block.cpp`, function `CBlockHeader::GetHash()`:

```cpp
uint256 CBlockHeader::GetHash() const
{
    // Standard 80-byte PoW hash compatible with all SHA256d ASICs.
    // hashParentsRoot is carried in the serialised header and validated
    // against the hashParents vector in CheckBlock(), but is NOT part of
    // the PoW preimage — this allows standard miners to produce DAG blocks
    // without any firmware changes.
    HashWriter hasher{};
    hasher << nVersion << hashPrevBlock << hashMerkleRoot << nTime << nBits << nNonce;
    return hasher.GetHash();
}
```

The **PoW preimage is always exactly 80 bytes** — the six standard Bitcoin fields, in standard order:

| Field | Size | Notes |
|---|---|---|
| `nVersion` | 4 bytes | DAGMODE bit (`0x10000000`) is set — miner hashes it normally |
| `hashPrevBlock` | 32 bytes | Best-tip prevhash as LE |
| `hashMerkleRoot` | 32 bytes | Merkle root of transactions |
| `nTime` | 4 bytes | Unix timestamp |
| `nBits` | 4 bytes | Compact difficulty target |
| `nNonce` | 4 bytes | Miner rolls this |
| **Total** | **80 bytes** | Identical to standard Bitcoin PoW |

**hashParentsRoot is excluded from the hash preimage** but is still present in the 112-byte wire serialization. Consensus nodes verify `hashParentsRoot == SHA256d(hashParents[])` in `CheckBlock()`, independently of PoW validation.

### How the Pool Handles This Split

The pool (`qbtc_pool.py`) implements this correctly in two separate paths:

**Share verification (80-byte path):**
```python
header_80 = ver_bytes + prevhash_le + merkle_root + ntime_bytes + nbits_bytes + nonce_bytes
hash_80 = int.from_bytes(sha256d(header_80)[::-1], "big")
```

**Block submission to node (112-byte path):**
```python
header = ver_bytes + prevhash_le + merkle_root + ntime_bytes + nbits_bytes + parentsroot_bytes + nonce_bytes
block = header + parents_payload + varint + coinbase + transactions
result = self.rpc.call("submitblock", [block.hex()])
```

The miner never sees or touches `hashParentsRoot`. The pool inserts it when building the full block for `submitblock`. The node verifies the full 112-byte header + parents vector.

---

## 3. ASIC Miner Compatibility Matrix

### Hardware Miners

| Miner / Firmware | Compatible? | Notes |
|---|---|---|
| **Bitmain Antminer S9/S9i/S9j** | ✅ Yes | Stock Bitmain firmware, SHA256d 80-byte |
| **Bitmain Antminer S17/S17 Pro** | ✅ Yes | Stock firmware |
| **Bitmain Antminer S19/S19 Pro/S19 XP** | ✅ Yes | Stock firmware |
| **Bitmain Antminer S21/S21 Pro/S21 XP** | ✅ Yes | Stock firmware |
| **MicroBT Whatsminer M20/M30/M30S** | ✅ Yes | Stock firmware |
| **MicroBT Whatsminer M50/M50S/M60/M60S** | ✅ Yes | Stock firmware |
| **Canaan AvalonMiner 1066/1246/1366** | ✅ Yes | Stock firmware |
| **BitAxe (ESP32 open-source miner)** | ✅ Yes | Currently connected, worker `b1` ~1 TH/s |
| **Jasminer / iBeLink / Goldshell SHA256** | ✅ Yes | All SHA256d ASICs |
| **Braiins OS+ (custom firmware)** | ✅ Yes | Stratum v1, ASIC-Boost (overt) |
| **Vnish firmware** | ✅ Yes | Stratum v1 + version rolling |
| **LuxOS firmware** | ✅ Yes | Stratum v1 |

**Summary:** Any miner that implements standard Stratum v1 and SHA256d hashing over 80 bytes will work with no configuration changes beyond pointing at the pool address.

### Software Miners

| Miner | Compatible? | Notes |
|---|---|---|
| **cpuminer-multi** (`minerd -a sha256d`) | ✅ Yes | Shown in pool UI |
| **cgminer** | ✅ Yes | Stratum v1 |
| **bfgminer** | ✅ Yes | Stratum v1 |
| **BFGMiner with getblocktemplate** | ✅ Yes | Pool exposes GBT via node RPC |
| **Browser miner (WebWorker SHA256d)** | ✅ Yes | Built-in, proxied via API |
| **XMRig** | ❌ No | RandomX only, not SHA256d |
| **T-Rex / PhoenixMiner** | ❌ No | GPU ETHash/KawPoW only |

---

## 4. ASIC-Boost Compatibility (Overt Version Rolling)

Overt ASIC-Boost (BIP320) allows miners to roll bits in the version field to gain 2× effective nonce space. The pool supports this:

```python
roll_mask = 0x1fffe000  # BIP320 version-rolling bits
base_ver = (base_ver & ~roll_mask) | (int(version_bits, 16) & roll_mask)
# Always OR in DAGMODE bit after rolling:
base_ver |= 0x10000000  # BLOCK_VERSION_DAGMODE
```

- **Miners using overt ASIC-Boost (`mining.configure` → `version-rolling`):** The pool respects the rolled version bits and always enforces the DAGMODE bit afterward. The miner's rolled version is preserved in bits 13–28.
- **Miners that don't use version rolling:** No impact — they receive the pre-set version with DAGMODE set.

**Covert ASIC-Boost** (via segwit transaction manipulation) is not applicable — QBTC uses SegWit by default, and covert ASIC-Boost has been effectively disabled by segwit activation.

---

## 5. Remaining Miner Compatibility Risks

### 5.1 Stratum v2 (Native)

**Status: Not supported (low priority)**

Stratum v2 (BIP requires `STRATUM V2` protocol framing) is a different binary protocol. QBTC pool implements Stratum v1 only. Miners that *only* support v2 (rare, mostly firmware experiments) cannot connect directly.

**Workaround:** The Braiins Stratum V2 to V1 Translation Proxy (`stratum-mining-proxy`) allows v2 miners to connect to v1 pools. No pool changes needed.

### 5.2 nNonce Exhaustion at High Hashrate

**Status: Handled by extranonce design**

Standard nNonce is 4 bytes (4,294,967,296 values). At 1 TH/s, the full nonce space exhausts in ~4ms. The pool uses:
- `extranonce1`: 8 hex bytes (4 bytes) — unique per-worker subscription
- `extranonce2_size`: 4 bytes — rolled by the miner

Combined space: 2^64 combinations, effectively inexhaustible.

### 5.3 DAGMODE Version Bit (0x10000000)

**Status: Handled by pool**

All QBTC DAG blocks must have `nVersion & 0x10000000` set. The pool enforces this unconditionally:
```python
base_ver |= 0x10000000
```

A miner submitting shares with a version that doesn't have this bit set would produce a valid PoW hash but the block would fail node-side validation. This never happens because the pool always sends the pre-corrected version in `mining.notify` and re-applies the bit to any version-rolled submissions.

### 5.4 getblocktemplate (Non-Stratum Miners)

Miners using `getblocktemplate` (GBT) directly against the node RPC will receive the full QBTC DAG template including `hashParentsRoot` and the `dagparents` array. These fields are QBTC extensions; standard Bitcoin miners using GBT directly would need to handle them. This path is for software miners only — hardware ASICs use Stratum exclusively.

### 5.5 PQC Signatures in Transactions

**Status: No miner impact**

FALCON-512 PQC signatures only affect transaction validation, not block PoW. Miners do not validate transactions — they include them from the pool's coinbase template. No miner compatibility concern.

---

## 6. Coinbase Transaction Structure

The pool builds the coinbase transaction from scratch via `build_coinbase_parts()`:

```
coinb1 (pool-built prefix):
  [version 1 LE] [input count: 0x01]
  [prevhash: 0x00 * 32] [vout index: 0xffffffff]
  [script_sig_varint] [BIP34 height push]

extranonce1 (8 hex bytes, per-worker unique):
  [worker subscription ID, 4 bytes]

extranonce2 (4 bytes, rolled by miner)

coinb2 (pool-built suffix):
  [sequence: 0xffffffff] [output count: 0x02]
  [payout value LE 8 bytes] [payout script]
  [witness commitment output (BIP141)]
  [locktime: 0x00000000]
```

**Coinbase scriptSig size:** BIP34 height push (3-5 bytes at current height) + 12 bytes extranonce space = 15-17 bytes total. Well within the 100-byte miner limit. No scriptSig overflow issues.

**Segwit witness commitment:** All QBTC blocks are SegWit. The pool always generates a valid witness commitment output in coinb2, which is required for SegWit-capable nodes to accept the block.

---

## 7. Share Difficulty and Vardiff

| Setting | Value |
|---|---|
| Default share difficulty | ~23,000 (auto-set per worker) |
| Share target formula | `difficulty_to_target(worker.difficulty)` |
| Block target | From `nBits` in `getblocktemplate` |
| Block vs share validation | Separate: share only needs to meet share target |

The pool uses per-worker difficulty. For a 1 TH/s BitAxe, share difficulty auto-adjusts so shares arrive roughly every 10-30 seconds (not every block interval).

---

## 8. Pool RPC Configuration Recommendations

The pool relies heavily on N1's bitcoind RPC. Recommended `bitcoin.conf` on N1:

```ini
rpcthreads=16
rpcworkqueue=256
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

> **Warning:** Do not run flood tests on N1. Concurrent `bitcoin-cli` subprocesses will compete with the pool's `getblocktemplate` and `submitblock` RPC calls, causing 503 errors and mining stalls. The flood test script should run on N2/N3/N4 only.

---

## 9. Mining UI (Web Platform)

The `beartec-jpg/Crypto` repository provides the mining UI at `client/src/pages/QBTCMining.tsx`:

| Lane | Password | Target |
|---|---|---|
| Gateway | — | Info / overview |
| Home CPU | `home` | `minerd -a sha256d` |
| Open GPU | `gpu` | GPU SHA256d miners |
| Pro / ASIC | `pro` | BitAxe, Antminer, etc. |

Pool connection string shown in UI: `stratum+tcp://89.167.109.241:3333`

Browser miner API proxy: `api/qbtc/browser-miner.ts` — rate-limited, CORS-restricted, no credentials exposed.

---

## 10. Current Mining Status

As of April 25, 2026:

| Metric | Value |
|---|---|
| **Network hashrate** | ~693–1,020 GH/s |
| **Active miner** | BitAxe at 84.65.200.7, worker `b1` |
| **Pool service** | `qbtc-pool.service` active on N1, uptime 18h+ |
| **Block time** | ~10s target (GHOSTDAG K=32) |
| **Block reward** | 0.83333333 QBTC |
| **Chain height** | ~9,000+ blocks |
| **Blocks mined** | ~7,000+ DAG blocks confirmed |
| **RPC config** | `rpcthreads=16`, `rpcworkqueue=256` (applied on N1) |

---

## 11. Summary: Is the 80-Byte Fix Sufficient for All BTC Miners?

**Yes, for all SHA256d Stratum v1 hardware.** The fix is complete and correct:

1. `GetHash()` hashes exactly the same 80 bytes every Bitcoin ASIC has always hashed.
2. The pool correctly sends 80-byte headers to miners (via Stratum job notifications) and reconstructs full 112-byte DAG headers only for `submitblock`.
3. `hashParentsRoot` and DAG parent data are invisible to the miner firmware — handled entirely by the pool server.
4. Version rolling (overt ASIC-Boost) is supported; the DAGMODE bit is preserved.
5. Extranonce allocation prevents nonce exhaustion at any realistic hashrate.

The only cases not covered:
- **Stratum v2 native** (use a v2→v1 proxy)
- **GBT-only software miners** that don't know the QBTC DAG template fields (minor, affects self-mining software not hardware ASICs)
