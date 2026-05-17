# qXRP Optimisation Roadmap

Priority order: **P1 = before mainnet launch**, **P2 = post-launch v1.1**, **P3 = future**

---

## P1 — Must Fix Before Mainnet

### OPT-1: Remove `sfFalconPublicKey` from Transaction Blobs
**Impact:** HIGH — reduces every tx from ~2,645B to ~1,750B (34% smaller)  
**Files:** `TxFormats.cpp`, `STTx.cpp::checkSingleSign`, `TransactionSign.cpp`  
**What to do:**
- Remove `sfFalconPublicKey` from `TxFormats.cpp` common fields (keep only `sfFalconSignature`)
- In `STTx.cpp` verifier, fetch `sfFalconPublicKey` from the sender's `AccountRoot` via the ledger view
- In `TransactionSign.cpp`, stop embedding the PK in the tx (only use it to derive the sig, then discard)
- Chain wipe required (breaking change to tx format)

**Why now:** Every user on mainnet pays 898 extra bytes forever. It compounds with volume.

---

### OPT-2: Deploy OQS_SIG Thread-Local Caching
**Impact:** MEDIUM — eliminates ~39M heap alloc/free cycles over 13M tx  
**Files:** `/opt/qxrp/src/src/libxrpl/protocol/falcon.cpp` (already built, just not deployed)  
**What to do:** `cp /opt/qxrp/build/xrpld /opt/qxrp/bin/xrpld` + service restart  
**No chain wipe needed** — pure runtime optimisation

---

### OPT-3: Deploy Key Material Zeroing
**Impact:** SECURITY — prevents seed-derived bytes lingering in heap after keygen  
**Same binary as OPT-2** — already built.  
**No chain wipe needed**

---

### OPT-4: Add `RewardDestination` to ValidatorBond
**Impact:** HIGH — enables rewards to flow to a user's wallet, not stay locked on the server  
**Files:** `ledger_entries.macro` (add field to ValidatorBond), `TxFormats.cpp`, bond enforcement logic  
**What to do:**
- Add `sfDestination` (optional) to `ValidatorBond` ledger object
- When validator earns a reward payout, if `sfDestination` is set, pay out to that address instead of the bond account
- This is what enables the wallet-linked "one-command" node setup the user wants

---

### OPT-5: Dedicated Validator Key vs Bond Account
**Impact:** SECURITY + UX — validator signing key should be separate from the account holding the bond  
**Currently:** The genesis account holds both roles. On a standalone node, the signing key seed is stored in the config — if the server is compromised, both the consensus key AND bond funds are at risk.  
**Fix:** 
- `ValidatorRegister` registers a separate consensus key (already done in current design)
- The bond is held by a separate `BondAccount` 
- The server only needs the consensus signing key; the bond wallet can be cold/hardware-secured

---

## P2 — Post-Launch Improvements

### OPT-6: Falcon-512 → Falcon-1024 Option
**Impact:** Higher security margin at the cost of larger signatures (~1,280B sig vs ~690B)  
Currently hardcoded to Falcon-512. Add a `KeyType::falcon1024` variant and allow validators to choose.

---

### OPT-7: Batch Falcon Verification with SIMD
**Impact:** 2–4× throughput improvement on Intel/AMD validators  
liboqs has AVX2-optimised Falcon. Ensure the build uses `-mavx2` and benchmark the gain. Currently `node_size=tiny` is single-threaded for many operations.

---

### OPT-8: Falcon PK Caching in Validator Hot Path
**Impact:** MEDIUM — avoids repeated AccountRoot lookups for the same account in a busy ledger  
After OPT-1, the verifier will look up `AccountRoot.sfFalconPublicKey` for every tx. Add an LRU cache (e.g., 4,096 entries) mapping `AccountID → PQPublicKey`. High-volume accounts (exchanges, AMMs) will benefit most.

---

### OPT-9: Reduce Consensus Log Verbosity
**Impact:** LOW DISK — the verbose `ConsensusLogger` messages are adding ~50KB/ledger to the journal  
The logs currently output full consensus state on every heartbeat (1s interval). Reduce to summary-only at `INFO` level; full detail only at `DEBUG`.

---

### OPT-10: Streamline Bond Process
**Impact:** UX — currently requires a separate Python script  
Build `validator_bond` as a first-class RPC method that takes the validator's seed and runs the 2-step (ValidatorRegister + ValidatorBond) atomically from inside xrpld. Eliminates the need for an external script.

---

### OPT-11: Auto-Sweep Rewards to Wallet
**Impact:** UX — until OPT-4 is implemented, validators accumulate rewards on-server  
Add a built-in scheduled task (configurable in `xrpld.cfg`) that sweeps any balance above the bond + reserve threshold to a configured `reward_address`.  
```
[validator_reward_address]
rYOURWALLETADDRESS
reward_sweep_threshold_xrp=100
```

---

## P3 — Future / Research

### OPT-12: Key Rotation Protocol
Allow an account to replace its `sfFalconPublicKey` on `AccountRoot` via a signed `FalconKeyRotation` transaction. Required for long-term security hygiene.

### OPT-13: Multi-Sig with Falcon
Extend the signers list to support Falcon signers. Currently `SignerList` only supports secp256k1.

### OPT-14: Hardware Security Module (HSM) Integration
Store the Falcon secret key in an HSM rather than on disk. liboqs supports custom key providers.

### OPT-15: Compact Signature Scheme Research
Falcon-512 at 690B is already among the most compact post-quantum schemes. Monitor NIST PQC round 4 for any schemes that offer smaller signatures with equivalent security. Current candidates: HAWK (Falcon successor, smaller PK), CROSS.

---

## Summary Table

| # | Name | Priority | Chain Wipe? | Est. Effort |
|---|------|----------|-------------|-------------|
| OPT-1 | Remove PK from tx | P1 | Yes | 4 hours |
| OPT-2 | Deploy OQS caching | P1 | No | 5 minutes |
| OPT-3 | Deploy key zeroing | P1 | No | 5 minutes (same binary) |
| OPT-4 | RewardDestination field | P1 | Yes | 1 day |
| OPT-5 | Separate validator/bond keys | P1 | Yes | 4 hours |
| OPT-6 | Falcon-1024 option | P2 | Yes | 1 day |
| OPT-7 | SIMD verification | P2 | No | 2 hours |
| OPT-8 | PK lookup cache | P2 | No | 3 hours |
| OPT-9 | Log verbosity | P2 | No | 1 hour |
| OPT-10 | Built-in bond RPC | P2 | No | 1 day |
| OPT-11 | Auto-sweep rewards | P2 | No | 4 hours |
| OPT-12 | Key rotation | P3 | Yes | 2 days |
| OPT-13 | Falcon multi-sig | P3 | Yes | 3 days |
| OPT-14 | HSM integration | P3 | No | 3 days |
| OPT-15 | Compact sig research | P3 | N/A | Ongoing |
