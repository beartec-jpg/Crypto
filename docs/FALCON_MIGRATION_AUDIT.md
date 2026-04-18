# Falcon Migration Audit (Issue #504)

## Scope Audited
- `client/src/lib/crypto.ts`
- `client/src/lib/qbtcService.ts`
- `cold-signer/src/lib/qbtcSigner.ts`
- `cold-signer/src/lib/coldSigner.ts`
- `server/python/qbtc_wallet.py`
- QBTC wallet UI copy in `client/src/components/Wallet/*` and `client/src/pages/QBTC*`

## Current signing inventory
- **Generic client hybrid signing (`client/src/lib/crypto.ts`)**
  - Previous PQC: ML-DSA-65 (`@noble/post-quantum`)
  - Classical companion: ECDSA secp256k1
  - **Status in this change:** migrated to Falcon-512 + ECDSA hybrid

- **QBTC on-chain signing (`client/src/lib/qbtcService.ts`, `cold-signer/src/lib/qbtcSigner.ts`, `server/python/qbtc_wallet.py`)**
  - Current PQC: Dilithium / ML-DSA-44 variant
  - Classical companion: ECDSA secp256k1
  - Dependency: QBTC node/witness format expectations
  - **Status in this change:** on-chain witness unchanged, plus new off-chain Falcon staged compatibility sidecar proof for signed QBTC transactions

- **Non-QBTC chain transaction signing (`cold-signer/src/lib/coldSigner.ts`)**
  - Current signing is chain-native (EVM secp256k1, XRP secp256k1, BTC secp256k1, Solana ed25519)
  - **Status:** no Falcon signature layer yet

## Migration notes for downstream clients
- Generic hybrid signatures now emit algorithm string:
  - `hybrid-falcon-512-ecdsa-secp256k1`
- Generic hybrid signature payload keys are now Falcon-based:
  - `falconPublicKey` / `falconSecretKey`
  - `falconSignature`
- QBTC signing now emits optional compatibility proof metadata in the signer layer:
  - `algorithm: falcon-512-staged-compat`
  - `mode: offchain-sidecar`
  - `messageDigestHex`, `falconPublicKeyHex`, `falconSignatureHex`
  - This proof is **not part of QBTC consensus witness validation yet** and must be treated as transitional telemetry/compatibility material.

## Remaining high-priority tasks
- Define QBTC protocol migration plan from Dilithium witness fields to Falcon witness fields (network upgrade required).
- Add Falcon-focused test vectors and integration checks for all migrated paths.
- Update user-facing QBTC/cold-signer copy to clearly distinguish:
  - Falcon-default generic hybrid signing
  - Legacy Dilithium requirement for current QBTC consensus flows until protocol upgrade.
