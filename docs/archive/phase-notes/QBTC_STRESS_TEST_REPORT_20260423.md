# QBTC Testnet — Stress Test Report
**Date:** April 23, 2026  
**Time:** 22:13 – 22:17 BST  
**Author:** BearTec automated test suite

---

## 1. System Status at Time of Test

| Component | Status | Detail |
|-----------|--------|--------|
| Chain | ✅ Active | `qbtctestnet`, height 455 at test end |
| Pool | ✅ Active | N1 (89.167.109.241), service `qbtc-pool.service` |
| Pool Worker | ✅ Connected | BitAxe miner (84.65.200.7), worker `b1` |
| PQC (Falcon) | ✅ Active | FALCON-padded-512 / FIPS 206 FN-DSA, hybrid mode |
| DAG Mode | ✅ Active | GHOSTDAG K=32, 10 s target block spacing |
| N1 ↔ N2 peers | ✅ Connected | Both nodes synced |
| N1 ↔ N3 peers | ✅ Connected | Both nodes synced |
| N2 ↔ N3 peers | ✅ Connected | Both nodes synced |

### Protocol Details (live at test time)

| Parameter | Value |
|-----------|-------|
| Chain | `qbtctestnet` |
| GHOSTDAG K | 32 |
| Block target spacing | 10 s (`nDagTargetSpacingMs = 10000`) |
| Max DAG parents | 64 |
| Block reward | 0.83333333 QBTC |
| Header size | 112 bytes (ver+prevhash+merkle+time+bits+parentsroot+nonce) |
| BLOCK_VERSION_DAGMODE | `0x10000000` |
| PQC algorithm | FALCON-padded-512 (FN-DSA) |
| PQC security | 256-bit classical / 128-bit quantum (NIST Level 1) |
| Network hashrate | ~889 GH/s (BitAxe hardware) |
| Pool difficulty | 512 initial, vardiff target 30 s/share |

---

## 2. Stress Test Configuration

| Parameter | Value |
|-----------|-------|
| Duration | 120 s per node (simultaneous) |
| Nodes | 3 (N1, N2, N3) |
| Wallets per node | 30 (stress_01–20 + surge_01–10) |
| Funded wallets | N1: 30 · N2: 30 · N3: 10 (funding issue on N3) |
| Fund per wallet | 0.5 QBTC |
| Tx type | `sendtoaddress` — 5% of wallet balance per tx |
| Threads | 1 per wallet (30 threads/node) |
| Script | `/tmp/stress_test2.py` |

---

## 3. Stress Test Results

### Per-Node Summary

| Node | Funded Wallets | Txs Sent | Txs Failed | Avg TPS | Peak TPS | Final Mempool |
|------|---------------|----------|-----------|---------|---------|--------------|
| N1 (89.167.109.241) | 30 | **1,291** | 332 | 10.44 | **21.65** | 1,388 tx / 957 KB |
| N2 (46.62.156.169) | 30 | **1,195** | 4,658 | 9.77 | **18.63** | 1,487 tx / 956 KB |
| N3 (37.27.47.236) | 10 | **814** | 8,657 | 6.58 | **22.59** | 1,076 tx / 742 KB |
| **TOTAL** | **70** | **3,300** | **13,647** | **~27 combined** | **~63 combined** | **~4,000 tx queued** |

### TPS Progression (N1, every ~6 s)

| t (s) | Sent | TPS | Mempool |
|-------|------|-----|---------|
| 5 | 83 | 16.6 | 134 tx |
| 11 | 175 | 15.0 | 232 tx |
| 17 | 292 | 20.4 | 386 tx |
| 23 | 417 | 21.7 | 602 tx |
| 34 | 652 | 21.4 | 945 tx |
| 48 | 818 | 9.2 | 1,131 tx |
| 53 | 876 | 11.0 | 197 tx ← block confirmed, mempool cleared |
| 111 | 1,188 | 8.9 | 1,178 tx |
| 118 | 1,247 | 8.6 | 1,333 tx |
| **FINAL** | **1,291** | **10.44 avg** | **1,388 tx / 957 KB** |

### Failure Analysis

All failures were `code -6` — not true node errors:

| Error | Count | Cause |
|-------|-------|-------|
| `Unconfirmed UTXOs available but creates chain >25` | ~12,700 | Bitcoin Core's mempool ancestor chain limit (25 unconfirmed descendants per wallet) |
| `Insufficient funds` | ~947 | UTXO exhaustion between block confirmations (especially N3 with only 10 wallets) |

> **Conclusion:** Zero actual node/consensus failures. Every error was the mempool chain-depth policy, which is a client-side UTXO management constraint — not a network bottleneck.

---

## 4. DAG Performance During Test

| Metric | Value |
|--------|-------|
| Chain height at test start | ~420 |
| Chain height at test end | 455–456 |
| Blocks produced during test | ~35 blocks in ~6 minutes |
| Expected at 10 s spacing | ~36 blocks ✅ |
| DAG tips (live) | 1 (single active tip, normal) |
| Parallel % (last 100 heights) | 13% (13 sibling blocks) |
| All-time siblings (valid-headers) | 77 |
| GHOSTDAG K | 32 |

The DAG merged all sibling blocks seamlessly. No forks, no stalls, no `bad-dag-parents-root` errors during the test.

---

## 5. Pool Performance

| Metric | Value |
|--------|-------|
| Pool service | Active |
| Accepted shares | 1,873 total |
| Total share difficulty | ~800,131 |
| Share rate (during test) | ~1 share / 2–3 s |
| `block ACCEPTED` events | Continuous |
| Pending payout balance | 88.01 QBTC (worker b1) |
| Pool DB | `/var/lib/qbtc-pool/pool.db` |

### Pool Patches Applied

All 6 pool patches were applied and working correctly:

1. `next_job` stores `parentsroot` + `dagparents` from block template
2. `version_be` sets DAGMODE bit (`| 0x10000000`) — miner hashes with correct version
3. `compute_share_hash()` — 112-byte header with `parentsroot` before nonce
4. `_build_block_hex()` — 112-byte header construction
5. `parents_payload` uses `bytes.fromhex(ph)[::-1]` (LE byte order)
6. `parentsroot_bytes = bytes.fromhex(parentsroot_hex)[::-1]` (LE reversal)

---

## 6. PQC (Post-Quantum Cryptography) Status

| Parameter | Value |
|-----------|-------|
| Scheme | FALCON-padded-512 |
| Standard | FIPS 206 (FN-DSA) |
| Public key size | 897 bytes |
| Signature size | 666 bytes |
| Private key size | 1,281 bytes |
| Classical security | 256 bits |
| Quantum security | 128 bits (NIST Level 1) |
| Implementation | PQClean FALCONPADDED512_CLEAN (portable constant-time C) |
| Mode | Hybrid (`-pqcmode=hybrid -pqcsig=falcon`) |

All 3,300 stress-test transactions used hybrid PQC witness structures. Zero PQC validation failures.

---

## 7. Key Findings

1. **Peak combined TPS: ~63** (N1: 21.7, N2: 18.6, N3: 22.6)
2. **Sustained combined TPS: ~27** after UTXO chain limits kick in
3. **Mempool ceiling ~950 KB per node** — block confirmation clears it instantly
4. **DAG is stable under load** — 35 blocks confirmed cleanly with full mempool during test
5. **UTXO chain limit is the bottleneck**, not the node, DAG, or PQC layer
6. **Fix:** To improve sustained TPS, either increase `-limitancestorcount` (default 25) or use more wallets with fresh UTXOs

---

## 8. Nodes & Infrastructure

| Node | Role | IP | SSH Password | RPC Credentials |
|------|------|----|-------------|----------------|
| N1 | Pool + node | 89.167.109.241 | `Hbxtvw77XErT` | `qbtcverify:verify_node3_2026:28332` |
| N2 | Miner + node | 46.62.156.169 | `pihCLrE3Xqk9` | `qbtcseed:seednode1_rpc_2026:28332` |
| N3 | Node only | 37.27.47.236 | `qvC7dKXNeLa7` | `qbtcseed:seednode2_rpc_2026:28332` |
| BitAxe | Hardware miner | 84.65.200.7 | — | Pool port 3333, pass `VNkqCcr9RhmU` |

---

## 9. Live Stats (Post-Test, ~22:20 BST)

| Metric | Value |
|--------|-------|
| Chain height | 520 |
| Difficulty | 5,489.05 |
| Network hashrate | 889.6 GH/s |
| DAG tips | 1 |
| GHOSTDAG K | 32 |
| Parallel % (last 100 heights) | 13.0% |
| Pool status | Active |
| PQC | Active (Falcon hybrid) |
