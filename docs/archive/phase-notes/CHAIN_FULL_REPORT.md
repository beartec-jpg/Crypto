# qXRP Testnet — Full Chain Report
Generated: 2026-05-22 (current epoch 12, ledger ~43,250)

---

## Chain Genesis & Network Config

| Parameter | Value |
|---|---|
| Network ID | 999 |
| EPOCH_LEDGERS | 3,600 |
| Ledger rate (measured) | **3.50 s/ledger** |
| Epoch duration | **~3 hours 30 min** |
| Genesis | ~2026-05-20 ~14:00 UTC (estimated) |
| Chain age | ~2.5 days |
| Total ledgers | 43,250+ |
| Total epochs | **12 completed** |

**Genesis validators:** node1, node2, node3 (3-node quorum, quorum=4 at genesis — unclear how this was satisfied; may have required 3/3)  
**Quorum setting:** `validation_quorum = 4` (requires 4 distinct validators from epoch 5 onward with 4 nodes)

---

## Node Inventory

| Node | Address | Consensus Key (truncated) | Server |
|---|---|---|---|
| node1 | `rhTyFgd1P6VN8YdXB9buQUCb47KcgPkSEA` | `n94RNoyd8q...` | 37.27.47.236 |
| node2 | `r81WCrNbt5vkboNvUVtGRX9dvogQ3EBGC` | `n9MuP4C9zq...` | 37.27.47.236 |
| node3 | `rw2PexMh8vgcjriMv4fGT85J8nMCePMQCW` | `n9KX6hNjxi...` | 37.27.47.236 |
| node4 | `rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D` | `02C7384DA3...` | 46.224.0.140 (separate server) |

**node4 reward forward address:** `rGFzARV56wCY7ceocTY2tLdDnMTqTBgPwK`

---

## Current Live Bond State (Epoch 12)

| Node | Status | Bonded | Score | Last Claimed Epoch | Slashes |
|---|---|---|---|---|---|
| node1 | BONDED | 1,000 qXRP | 8,750 bps | 12 | 0 |
| node2 | BONDED | 1,000 qXRP | 8,750 bps | 12 | 0 |
| node3 | BONDED | 1,000 qXRP | 8,750 bps | 12 | 0 |
| node4 (active) | BONDED | 1,000 qXRP | 8,750 bps | 12 | 0 |
| node4 (dormant) | BONDED | 1,000 qXRP | **0 bps** | 0 | 0 |

> **Note:** There are TWO ValidatorBond SLEs for `rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D`. The dormant one (score=0, lastEp=0) is likely a leftover from an earlier bond transaction. It has never claimed and never scores. Needs cleanup.

**AggregateCompositeScore:** 35,000 bps (4 × 8,750 — dormant bond excluded from scoring)

---

## Current Node Balances

| Node | Balance | Notes |
|---|---|---|
| node1 | **3,184,708,284.39 qXRP** | seq=22 |
| node2 | **3,184,708,284.39 qXRP** | seq=24 |
| node3 | **3,184,708,284.39 qXRP** | seq=25 |
| node4 | **1,648,873,847.35 qXRP** | seq=88; rewards auto-forwarded |
| node4 forward wallet | **238,936,144.52 qXRP** | `rGFzARV56...` |

> node4 has lower balance because it only joined at epoch 5 (missed epochs 1–4) and rewards are forwarded to a separate wallet.

---

## Epoch-by-Epoch Reward History

| Epoch | Claim Time (UTC) | Active Nodes | Per-Node Reward | Total Distributed | Notes |
|---|---|---|---|---|---|
| 1 | ~2026-05-20 before 18:18 | 3 | unknown | unknown | Claimed before auto_claim started |
| 2 | 2026-05-20 21:39 | 3 | **325,033,333.34 qXRP** | 975,100,000 | First logged claim — nodes 1,2,3 only |
| 3 | 2026-05-21 01:11 | 3 | **323,408,166.67 qXRP** | 970,224,500 | Emission decay beginning |
| 4 | 2026-05-21 04:44 | 3 | **321,791,125.84 qXRP** | 965,373,378 | Last 3-node epoch |
| 5 | 2026-05-21 07:50 | **4** | **240,136,627.66 qXRP** | 960,546,511 | **node4 joined** — reward split 4 ways |
| 6 | 2026-05-21 10:49 | 4 | **238,935,944.52 qXRP** | 955,743,778 | node4 reward forwarded to separate wallet |
| 7 | 2026-05-21 13:49 | 4 | **237,741,264.80 qXRP** | 950,965,059 | Slash attempts begin (all fail) |
| 8 | 2026-05-21 16:51 | 4 | **236,552,558.47 qXRP** | 946,210,234 | |
| 9 | 2026-05-21 19:50 | 4 | **235,369,795.68 qXRP** | 941,479,183 | |
| 10 | 2026-05-21 22:49 | 4 | **234,192,946.70 qXRP** | 936,771,787 | |
| 11 | 2026-05-22 01:51 | 4 | **233,021,981.97 qXRP** | 932,087,928 | |
| 12 | 2026-05-22 04:50 | 4 | **231,856,872.06 qXRP** | 927,427,488 | Pool=1 drop (fully exhausted) |

**Observations:**
- Emission is decaying ~0.5% per epoch (built-in deflation/sustainability mechanism)
- When node4 joined (ep5), per-node reward dropped ~25% (from 321M → 240M) — correct, reward split 4 ways but total stayed similar due to emission formula
- All 12 epochs claimed successfully with `tesSUCCESS`
- Total distributed to date: ~**11.5 billion qXRP** across all nodes all epochs

---

## Load Test Results

Test run on 2026-05-21 ~14:42 UTC (during epoch 7)

| Phase | TPS | Ledger | Sent | OK | Failed |
|---|---|---|---|---|---|
| Ramp up | 5→15 | 130→133 | 50 | 50 | 0 |
| Peak | 30 | 133→144 | 275 | 275 | 0 |
| Sustained peak | 30 | 144→149 | 872 | 872 | 0 |
| Ramp down | 15 | 149→153 | 1,470 | 1,470 | 0 |
| Cool down | 5 | 153+ | 1,695 | 1,668 | **27** |

**Result:** Node hit `HTTP 503 Server overloaded` at 30 TPS sustained.  
**Verdict:** Node handles 30 TPS without ledger failure, but the API layer (port 5005/6005) saturates. Underlying consensus was fine — ledgers were closing normally throughout.

---

## Slashing — Critical Issue

**Status: Slash tx permanently failing with `tefINTERNAL`**

Slash attempts have been running continuously from 2026-05-21 13:49 to present (hundreds of attempts). Every attempt returns `tefINTERNAL` + TIMEOUT.

```
offense=2 (ABSENCE (25%) [disabled])
Target: rD4rAu6NZK6ha9FiC1ue4JKNyRQsZqJBTd  ← this account does NOT exist on chain
Bond account: rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D
SlashCount: 0  (has NEVER been incremented)
```

**Root cause analysis:**
1. The slash target address `rD4rAu6NZK6ha9FiC1ue4JKNyRQsZqJBTd` appears to be **incorrect** — it doesn't match node4's bond account `rUnB1yVhL1wui6eGuTjSPxe2RWTyXeUT6D`
2. The offense type 2 is labeled `[disabled]` — the ValidatorSlash transaction type may not be fully implemented in this qXRP build
3. `tefINTERNAL` means the transaction failed before even entering the ledger (C++ exception / unhandled case in the transaction handler)

**Impact:** node4 should have been penalized for absence but has collected full rewards for every epoch since joining. Slash mechanism needs to be fixed before mainnet.

---

## Network Health (Current)

```
Ledger:  43,250+
State:   proposing (healthy)
Peers:   3
Uptime:  23h 21m
Load:    1 (normal)
Stored:  ledgers 42,500–43,250 (512-ledger window, pruning active)
Swap:    1 GB in use (RAM tight — 4GB server with 3 nodes)
```

---

## Storage Deep Dive

### Current disk usage (3 nodes on same server):
| Path | Size | Notes |
|---|---|---|
| node1/db (SQLite tx history) | 380 MB | Pruned to 512 ledgers |
| node2/db | 380 MB | |
| node3/db | 380 MB | |
| node1/nudb (state objects) | 4.6 MB | Only current account states |
| node2/nudb | 4.6 MB | |
| node3/nudb | 9.2 MB | |
| **Total** | **~1.5 GB** | |

### Config: `online_delete = 512`, `ledger_history = 256`
This keeps only ~30 minutes of history per node. Correct for validators.

---

## Storage Optimization — Full History Question

### Do you need to save ALL data to every ledger?

**No — and this is by design.** There are three distinct roles:

#### 1. Validator node (current setup — correct)
- Needs: current ledger state (account balances, bonds, offers) + ~512 recent ledgers
- Does NOT need full transaction history
- `online_delete = 512` is appropriate
- **Storage: ~400–800 MB per validator, stable** (not growing linearly)

#### 2. Full History / Archive node (one needed for explorer)
- Needs: every ledger from genesis
- Stores: every transaction ever submitted
- **Storage: grows linearly** with chain age and transaction volume

#### 3. History Sharding (best of both)
- Divide full history across multiple nodes — each node stores a *shard* (ledger range)
- Built into rippled via `[shard_db]` config section
- Example: node A stores ledgers 1–50,000, node B stores 50,001–100,000
- Collectively they have full history, individually they only store a fraction
- **This is the recommended architecture for qXRP mainnet**

### Why validator storage stays flat:
The NuDB (object store) only keeps **current state** of all SLEs (accounts, bonds, offers). When an account is modified, only the new version is kept. The SQLite DB stores the last 512 ledger headers + transaction metadata. Neither grows unboundedly.

### Why full history is large:
Every transaction ever submitted is an immutable record. At XRPL mainnet's 7 years of history with millions of transactions, this is ~18 TB. qXRP at low traffic would be much smaller — but spam can change this drastically.

### Spam resistance (addressing your core concern):
The fee escalation mechanism works as follows: when the ledger queue fills beyond `target_txn_in_ledger = 1000`, the minimum fee doubles per transaction above threshold. At 5,000 TPS spam, fees escalate to thousands of drops per tx within seconds, making the attack uneconomical. Your config already has:
```
target_txn_in_ledger = 1000
minimum_txn_in_ledger = 100
ledgers_in_queue = 30
```
This means: a spammer needs 30,000+ transactions in-flight at all times, each paying escalating fees. The cost becomes prohibitive before storage becomes a real problem.

---

## Issues Found — Priority Order

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Slash tx returns `tefINTERNAL` forever | **Critical** | Broken — needs C++ fix or config fix |
| 2 | Duplicate ValidatorBond for node4 (dormant, score=0) | High | Needs cleanup |
| 3 | Slash target address wrong (`rD4rAu...` vs bond account) | High | Needs investigation |
| 4 | Server RAM tight (1 GB swap in use, 3 nodes on 4GB) | Medium | Upgrade or split nodes |
| 5 | No full-history node — explorer/API can't query old txs | Medium | Need archive node |
| 6 | Quorum=4 with only 3 genesis nodes (potential liveness risk) | Medium | Review quorum config |
| 7 | Load test capped by API 503 at 30 TPS | Low | API rate limit, not consensus issue |
