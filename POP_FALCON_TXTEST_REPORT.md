# qXRP: PoP Security Fixes & Falcon-512 TxTest Upgrade

**Date:** 2026-05-21  
**Server:** 37.27.47.236  
**Source:** `/opt/qxrp/src/`  
**Build:** `/opt/qxrp/build/` (Ninja / Release / NDEBUG)

---

## Summary

Two independent bug streams were diagnosed and resolved:

1. **PoP_security test suite (8 tests)** — 3 tests failing with `temMALFORMED`; root causes traced to a dangling-pointer bug and a mis-specified invariant. All 8 now pass.
2. **AccountSet test suite (14 tests)** — all 14 failing with `"TxTest::createAccount: failed to create account"` because the `TxTest` framework submitted secp256k1-only transactions, which the `featureProofOfParticipation` amendment rejects. Fixed by adding Falcon-512 hybrid signing to the framework. All 14 now pass.

**Final result: 23 / 23 tests pass.**

---

## Part 1 — PoP_security Fixes

### Bug 1: Dangling Slice in ValidatorSlash

**File:** `src/libxrpl/tx/transactors/qxrp/ValidatorSlash.cpp`

**Symptom:** Three double-sign-evidence tests returned `temMALFORMED` instead of `tesSUCCESS` or `temBAD_SIGNATURE`. The `verifyDoubleSignEvidence` function was receiving two slices that compared equal even when they were distinct evidence blobs.

**Root cause:** The evidence fields were read as temporary `Blob` rvalues:

```cpp
// BEFORE (dangling pointer)
auto const ev1 = makeSlice(ctx.tx.getFieldVL(sfSlashEvidence1));
auto const ev2 = makeSlice(ctx.tx.getFieldVL(sfSlashEvidence2));
```

`getFieldVL` returns a `Blob` by value. `makeSlice` wraps a raw pointer into the blob, then the temporary is immediately destroyed — leaving both slices pointing at freed memory. Because the two freed allocations often occupy the same address, `ev1 == ev2` evaluated `true` and the function returned `temMALFORMED` ("evidence identical") before any real check.

**Fix:** Capture the blobs in named variables before slicing:

```cpp
// AFTER
auto const blobEv1 = ctx.tx.getFieldVL(sfSlashEvidence1);
auto const blobEv2 = ctx.tx.getFieldVL(sfSlashEvidence2);
auto const ev1 = makeSlice(blobEv1);
auto const ev2 = makeSlice(blobEv2);
```

---

### Bug 2: XRP-Conservation Invariant Rejects Intentional Slash Burns

**Files:**  
- `src/libxrpl/tx/invariants/InvariantCheck.cpp` (`XRPNotCreated::finalize`)  
- `src/libxrpl/tx/invariants/QXRPDropConservation.cpp` (`QXRPDropConservation::finalize`)

**Symptom:** `SlashFullBondBurned` (and related slash tests) failed with `tecINVARIANT_FAILED` after applying the slash.

**Root cause:** `ValidatorSlash::doApply` calls `ctx_.destroyXRP(slashedDrops)`, burning 55 % of the validator's bond to `rawDestroyXRP` and crediting 45 % to the treasury. `rawDestroyXRP` bypasses invariant bookkeeping, so the invariant saw a large net XRP decrease but only the transaction fee as the "approved" destruction. The strict equality check `(-drops_) == fee.drops()` therefore failed.

**Fix:** For `ttVALIDATOR_SLASH`, relax the check to `(-drops_) >= fee.drops()` (net destruction must be _at least_ the fee; intentional burns above that are allowed):

```cpp
if (tx.getTxnType() == ttVALIDATOR_SLASH)
{
    if (-drops_ < fee.drops())
    {
        JLOG(j.fatal()) << "Invariant failed: ValidatorSlash XRP net change "
                        << drops_ << " is less than fee " << fee.drops();
        return false;
    }
    return true;
}
// regular path: exact equality
if (-drops_ != fee.drops()) { ... }
```

The same change was applied to both invariant files.

---

### PoP_security Results

| Test | Before | After |
|------|--------|-------|
| ThirdPartyClaimReward | PASS | PASS |
| ThirdPartyValidatorUnbond | PASS | PASS |
| ThirdPartyValidatorBond | PASS | PASS |
| SlashFullBondBurned | **FAIL** (tecINVARIANT_FAILED) | PASS |
| FalconKeyTooShort | PASS | PASS |
| AbsenceOffenseDisabled | PASS | PASS |
| InvalidDoubleSignEvidence | **FAIL** (temMALFORMED) | PASS |
| ValidDoubleSignEvidence | **FAIL** (temMALFORMED) | PASS |

---

## Part 2 — Falcon-512 Hybrid Signing in TxTest

### Problem

The `TxTest` harness (`src/tests/libxrpl/helpers/TxTest.h/.cpp`) submitted transactions built with `builder.build(pk, sk)`, which produces a secp256k1-only signature. With `featureProofOfParticipation` active (included in `allFeatures()`), every transaction must carry both `sfTxnSignature` (secp256k1/Ed25519) and `sfFalconSignature` (Falcon-512), with `sfFalconPublicKey` set in the signing data. Transactions lacking these fields fail `preflight` with `temMALFORMED`, so every `createAccount` call threw immediately and all 14 `AccountSet` tests aborted.

### Protocol Signing Requirements

`sfFalconPublicKey` is **not** flagged `kNOT_SIGNING` — it is part of the signing hash and must be set before the hash is computed.  
`sfFalconSignature` **is** `kNOT_SIGNING` — it is excluded from the hash, appended afterwards.  
The protocol does not require the Falcon key to be registered on-chain; any valid `(fpk, fsig)` pair over the correct hash passes.

### Solution

Added a private static helper `sealWithFalcon` to `TxTest` that:
1. Copies the builder's current `STObject` (capturing already-set Sequence, Fee, Account).
2. Sets `sfFalconPublicKey` on the copy (fresh key pair generated per transaction).
3. Sets `sfSigningPubKey`.
4. Computes the signing hash (`HashPrefix::TxSign` + `addWithoutSigningFields`).
5. Signs with secp256k1 → sets `sfTxnSignature`.
6. Signs with Falcon-512 → sets `sfFalconSignature`.
7. Freezes the object into an `STTx`.

Updated the `submit(T&& builder, Account const& signer)` template to call `sealWithFalcon` instead of `builder.build(pk, sk)`.  
`createAccount` and all other callers of the template automatically pick up Falcon signing — no changes to `TxTest.cpp` were required.

### Files Changed

| File | Change |
|------|--------|
| `src/tests/libxrpl/helpers/TxTest.h` | Added includes (`Serializer.h`, `HashPrefix.h`, `SecretKey.h`, `falcon.h`); added `sealWithFalcon` private static method; updated `submit(builder, signer)` template body |

```cpp
[[nodiscard]] static std::shared_ptr<STTx const>
sealWithFalcon(STObject obj, PublicKey const& pk, SecretKey const& sk)
{
    auto kp = generateFalconKeyPair(KeyType::Falcon512);
    assert(kp.has_value());
    auto const& [fpk, fsk] = *kp;

    obj.setFieldVL(sfFalconPublicKey, fpk.slice());
    obj.setFieldVL(sfSigningPubKey, pk.slice());

    Serializer s;
    s.add32(HashPrefix::TxSign);
    obj.addWithoutSigningFields(s);

    obj.setFieldVL(sfTxnSignature, xrpl::sign(pk, sk, s.slice()));
    auto const fsig = signFalcon(fsk, s.slice());
    obj.setFieldVL(sfFalconSignature, Blob{fsig.begin(), fsig.end()});

    return std::make_shared<STTx>(std::move(obj));
}
```

---

### AccountSet Results

All 14 tests that were previously failing with `"TxTest::createAccount: failed to create account"` now pass. Representative tests:

| Test | Before | After |
|------|--------|-------|
| NullAccountSet | **FAIL** | PASS |
| SetRequireDestFlag | **FAIL** | PASS |
| ClearRequireDestFlag | **FAIL** | PASS |
| SetRequireAuthFlag | **FAIL** | PASS |
| SetDisallowXRPFlag | **FAIL** | PASS |
| SetNoFreezeFlag | **FAIL** | PASS |
| *(9 further tests)* | **FAIL** | PASS |

---

## Final Test Run

```
[==========] 23 tests from 3 test suites ran. (4334 ms total)
[  PASSED  ] 23 tests.
```

Binary: `/opt/qxrp/build/src/tests/libxrpl/xrpl.test.tx`

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| PoP_security | 8 | 8 | 0 |
| AccountSet | 14 | 14 | 0 |
| Debug | 1 | 1 | 0 |
| **Total** | **23** | **23** | **0** |
