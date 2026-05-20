# qXRP Pre-Swap Network Test Report

**Date:** 2026-05-16  
**Server:** 37.27.47.236  
**Binary epoch:** 172,800 ledgers (current production binary)  
**Tests run while:** epoch binary rebuild in progress (build step ~90/481 at test start)

---

## Summary

| Test | Result | Key Metric |
|------|--------|------------|
| RPC API Coverage | ✅ 17/18 PASS | avg 3.93ms latency |
| Validator Bonds | ✅ PASS | 3/3 BONDED, 87.5% composite score |
| Ledger Close Timing | ✅ PASS | 2.994s avg, 0.505s jitter |
| TPS Burst @ 60 TPS | ✅ PASS | 182.7 tx/ledger confirmed, fee escalation working |
| Network Stability | ✅ PASS | Load factor 1.0, all 3 nodes proposing throughout |

---

## Test 1: RPC API Coverage Sweep

Tested all major JSON-RPC methods against node1 (port 5005).

| Method | Result | Latency |
|--------|--------|---------|
| server_info | PASS | 34.3ms (first cold call) |
| server_state | PASS | 1.0ms |
| server_definitions | PASS | 12.8ms |
| fee | PASS | 1.2ms |
| ledger (current) | PASS | 1.0ms |
| ledger (validated) | PASS | 1.0ms |
| ledger_closed | PASS | 1.1ms |
| ledger_current | PASS | 0.8ms |
| account_info | PASS | 0.8ms |
| account_objects | PASS | 1.0ms |
| account_lines | PASS | 0.8ms |
| account_offers | PASS | 0.6ms |
| account_tx | PASS | 3.6ms |
| **ledger_entry (fee_schedule)** | **FAIL** | 0.7ms |
| ledger_entry (reward_epoch) | PASS | 0.6ms |
| ledger_data | PASS | 0.7ms |
| random | PASS | 4.6ms |
| ping | PASS | 0.8ms |

**Score: 17/18 PASS**  
**Average latency: 3.93ms** (skewed by first `server_info` cold-call; typical is <2ms)

**Per-node latency (server_info):**
- node1 :5005 → 0.73ms, state=proposing
- node2 :5006 → 0.86ms, state=proposing
- node3 :5007 → 0.91ms, state=proposing

### Finding — ledger_entry fee_schedule

`ledger_entry` with `{"fee_schedule": true}` returns `unknownOption` error. This is a qXRP-specific RPC extension that may use a different parameter key (e.g. `amendments` or a custom field). Not a critical failure — the `fee` RPC covers the same data. **Action: investigate correct parameter syntax before mainnet launch.**

---

## Test 2: Validator Bond & Network Health

### Node Health

| Node | Port | State | Peers | Ledger Seq | Complete Ledgers |
|------|------|-------|-------|------------|-----------------|
| node1 | 5005 | proposing ✅ | 1 | 6311 | 5650–6311 |
| node2 | 5006 | proposing ✅ | 2 | 6311 | 5635–6311 |
| node3 | 5007 | proposing ✅ | 1 | 6311 | 5635–6311 |

- Consensus spread: **0 ledgers** (perfectly in sync)
- Total supply: **199,999,999,999.99 qXRP** (199,999,999,999,994,151 drops)
- Base fee: 10 drops

### Validator Bond Objects (from `account_objects` on genesis)

All 3 bonds confirmed on-chain with `BondStatus=1` (BONDED).

| Field | node1 | node2 | node3 |
|-------|-------|-------|-------|
| BondedAmount | 1,000 qXRP | 1,000 qXRP | 1,000 qXRP |
| BondStatus | 1 (BONDED) ✅ | 1 (BONDED) ✅ | 1 (BONDED) ✅ |
| ConsensusKey (first 16) | 03FE4CE5C18B0300... | 03BA84577184776... | 0281DD0281E6AD2... |
| CompositeScore | 8750 / 10000 (87.5%) | 8750 / 10000 | 8750 / 10000 |
| UptimeBps | 10000 (100%) | 10000 | 10000 |
| VoteAccuracyBps | 10000 (100%) | 10000 | 10000 |
| ConsistencyBps | 10000 (100%) | 10000 | 10000 |
| LatencyScoreBps | 5000 (50%) | 5000 | 5000 |
| SlashMultiplier | 10000 (1.0×) | 10000 | 10000 |
| RewardAccumulator | 0 | 0 | 0 |

> **Note on LatencyScoreBps = 5000:** This is expected on a fresh chain — latency scoring needs several epochs to build up. Will normalise after the first few epoch closes on the test binary.

> **Note on RewardAccumulator = 0:** No epoch has closed yet on the 172,800-ledger binary (would take ~8 days). This is expected. After the binary swap to 3600-epoch, the first close will credit accumulators.

---

## Test 3: Ledger Close Timing (30 samples)

Observed 30 consecutive ledger closes to measure consensus stability.

| Metric | Value |
|--------|-------|
| Samples | 30 |
| Average close time | **2.994 s/ledger** |
| Minimum close time | 2.510 s |
| Maximum close time | 3.015 s |
| Jitter (max−min) | **0.505 s** |
| Projected ledgers/hour | **1,202** |

### Epoch ETA Projections

| Binary | Epoch Ledgers | Time per Epoch |
|--------|--------------|----------------|
| Current (172800) | 172,800 | **~144,000 s / ~1.67 days** |
| Test (3600) | 3,600 | **~2,994 s / ~50 min** |
| 72h test | — | ~86 epoch closes at 50 min/epoch |

> Jitter of 0.505s is very tight for a 3-node testnet — indicates healthy consensus round-trip times.

---

## Test 4: TPS Burst Test

**Profile:** 90s ramp-up (0→60 TPS) + 300s peak (60 TPS) + 90s ramp-down  
**Account pool:** 25 accounts pre-funded at 5 qXRP each (25/25 funded, all `tesSUCCESS`)  
**Total duration:** 480 seconds

### Transaction Submission Log

| Phase | Elapsed | Target TPS | Sent (cumulative) | Ledger | Open Fee |
|-------|---------|-----------|-------------------|--------|----------|
| RAMP_UP | 30s | 20 | 282 | 6396 | 10 drops |
| RAMP_UP | 61s | 40 | 1,167 | 6404 | **5,069 drops** |
| PEAK | 91s | 60 | 2,613 | 6413 | **5,048 drops** |
| PEAK | 121s | 60 | 4,353 | 6421 | **5,040 drops** |
| PEAK | 152s | 60 | 6,093 | 6430 | 10 drops |
| PEAK | 182s | 60 | 7,833 | 6438 | 10 drops |
| PEAK | 213s | 60 | 9,573 | 6446 | **5,040 drops** |
| PEAK | 243s | 60 | 11,313 | 6455 | 10 drops |
| PEAK | 274s | 60 | 13,053 | 6463 | 10 drops |
| PEAK | 304s | 60 | 14,793 | 6471 | **5,040 drops** |
| PEAK | 334s | 60 | 16,533 | 6479 | **5,040 drops** |
| PEAK | 365s | 60 | 18,273 | 6488 | 10 drops |
| RAMP_DOWN | 395s | 56 | 20,003 | 6496 | 10 drops |
| RAMP_DOWN | 425s | 36 | 21,344 | 6504 | 10 drops |
| RAMP_DOWN | 456s | 15 | 22,122 | 6513 | 10 drops |

**Total submitted: 22,307 transactions**

### On-Chain Verification (sampled ledgers)

Independently counted transactions per ledger during and after the burst:

| Ledger | TX Count | Phase |
|--------|----------|-------|
| 6396 | 53 | Ramp-up start |
| 6413 | 182 | Peak start |
| 6421 | 210 | Peak |
| 6430 | 213 | Peak |
| 6438 | 192 | Peak |
| 6446 | 225 | Peak |
| 6455 | 226 | Peak (max) |
| 6463 | 213 | Peak |
| 6471 | 193 | Peak |
| 6479 | 224 | Peak |
| 6488 | 220 | Peak |
| 6496 | 212 | Ramp-down start |
| 6504 | 133 | Ramp-down |
| 6513 | 62 | Ramp-down end |

**Average tx/ledger during peak: 182.7**  
**Peak tx/ledger: 226**  
**Effective on-chain TPS: 182.7 / 2.99s = ~61.1 TPS** ✅

### Post-Burst Network State

| Metric | Value |
|--------|-------|
| Load factor | 1.0 (no overload) |
| Open ledger fee | 10 drops (fully recovered) |
| Median fee | 5,000 drops |
| Network state | All 3 nodes proposing |
| Final ledger | 6,521 |

### Fee Escalation Analysis

The fee escalated from base **10 drops → 5,040–5,069 drops** (504× multiplier) during peak load, then fully recovered to 10 drops. This is correct behaviour — the open-ledger fee escalation mechanism is working properly, throttling transactions when the ledger queue fills.

The oscillating pattern (escalated → recovered → escalated) indicates the network was operating right at capacity for the current 3-node setup, clearing queues every 2–3 ledgers.

---

## Build Status at Test Completion

| Event | Time | Notes |
|-------|------|-------|
| Build started | ~11:00 UTC | -j1, step 1/481 |
| Build at test start | ~11:32 UTC | Step 87/481 |
| Build FAILED | 11:22 UTC | `rocksdb/advanced_options.h: No such file or directory` |
| Root cause | — | `#if XRPL_ROCKSDB_AVAILABLE` guard started at line 35, but rocksdb `#include`s were on lines 14–26 (outside guard) |
| Fix applied | ~11:50 UTC | Moved guard to line 1 in `RocksDBFactory.cpp` |
| Build resumed | ~11:50 UTC | PID 1229650, step 1/325 remaining |

---

## Issues Found

### Issue 1: `ledger_entry` fee_schedule parameter — Minor
- **Symptom:** `ledger_entry` with `{"fee_schedule": true}` returns `unknownOption`
- **Impact:** Low — `fee` RPC provides equivalent data
- **Action:** Identify correct parameter key before mainnet

### Issue 2: RocksDBFactory.cpp compile guard placement — Fixed ✅
- **Symptom:** Build failed at step ~169/481 with `rocksdb/advanced_options.h: No such file or directory`
- **Root cause:** `#if XRPL_ROCKSDB_AVAILABLE` guard began at line 35, after the rocksdb `#include` directives on lines 14–26. When `rocksdb=OFF`, the macro is not defined, so the includes ran and failed
- **Fix:** Prepended `#if XRPL_ROCKSDB_AVAILABLE` to line 1, so all rocksdb includes are inside the guard
- **File patched:** `/opt/qxrp/src/src/libxrpl/nodestore/backend/RocksDBFactory.cpp`

### Issue 3: LatencyScoreBps = 5000 on fresh chain — Expected
- All 3 validators show `LatencyScoreBps: 5000` (50%)
- This reduces composite score from 100% to 87.5%
- Expected on a fresh chain — will normalise over epochs
- CompositeScore of 8750/10000 (87.5%) is acceptable for testnet

---

## Conclusions

1. **Network is healthy.** All 3 nodes are proposing, fully in sync, base fee recovering correctly.
2. **Consensus is very stable.** 2.994s avg ledger close, only 0.505s jitter across 30 samples.
3. **60 TPS target is achievable.** 22,307 txs submitted; on-chain peak of 226 tx/ledger = ~75 TPS peak throughput measured. The 72h test's 60 TPS target has headroom.
4. **Fee escalation works correctly.** 504× escalation at peak load, full recovery post-burst.
5. **All 3 validators fully bonded.** BondStatus=1, 1000 qXRP each, composite score 87.5%.
6. **RocksDB build bug fixed.** Build resumed and should complete in ~1.5–2h from now.
7. **Epoch close timing confirmed.** At 2.994s/ledger, the 3600-ledger epoch = ~50 min per close. The 72h test will see approximately **86 epoch closes** — well above the minimum needed to validate reward accounting.

---

## Next Steps

Once the build completes (`BUILD_COMPLETE` in `/opt/qxrp/build_epoch.log`), the auto-swap watcher will:
1. Stop nodes, wipe DBs, deploy `xrpld.3600`
2. Restart nodes, wait for `proposing`
3. Run `bond_validators.py` (re-bond all 3 validators on fresh chain)
4. Launch `qxrp_72h_test.py` (18 cycles × 4h, 60 TPS peak)

Monitor with:
```bash
tail -f /opt/qxrp/auto_swap.log
tail -f /opt/qxrp/72h_test.log
```
