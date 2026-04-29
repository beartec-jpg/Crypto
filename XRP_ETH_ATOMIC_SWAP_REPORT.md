# XRP ↔ ETH Atomic Swap — Implementation & Test Report
**Date:** 2026-04-29  
**Network:** Testnet (Sepolia + XRPL Testnet + BSC Testnet)  
**Protocol:** QBTC V2 Atomic Swap — HTLC-based, non-custodial, trustless

---

## Wallets

| Role | EVM Address | XRP Address |
|------|-------------|-------------|
| Wallet A (PC) | `0x4f6019D0F36038c904632614f085c16264D29EEB` | `rPvDE8ukCC1oBYQXMVi6KhYwNmpWXgZNBT` |
| Wallet B (Phone) | `0xE4016D70aBe8C89529193142142Cba9c1979fCeb` | `rfNqtAMnoZ44FXnEoWaeTzjRLLuaCM2cqk` |

---

## Contracts

| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum Sepolia | HashedTimelockETH | `0x66fB849eb255E3e7bCfcD439dd0521acF2458B64` |
| XRPL Testnet | Native EscrowCreate/EscrowFinish | N/A (built-in) |

---

## Completed Swaps

### Swap 1 — ETH/XRP (Wallet B sells ETH, Wallet A buys with XRP)
| Field | Value |
|-------|-------|
| **Swap ID** | `fa7d3121-b0b8-4264-b66f-0e02048d85a5` |
| **Direction** | ETH → XRP |
| **Amounts** | 0.7 ETH ↔ 344 XRP |
| **Maker (Side A)** | `0x4f6019...` — locked 0.7 ETH |
| **Taker (Side B)** | `0xE4016D...` — locked 344 XRP |
| **ETH HTLC Lock ID** | `0x6637f6566bdc874e63a931a7288a9e1c014c3ccc283d77a7cb590435a123aa30` |
| **XRP Escrow** | `rPvDE8ukCC1oBYQXMVi6KhYwNmpWXgZNBT:16904417` |
| **Secret Hash** | `761d12c228e0c6c679589436cd124989dce8f7c2740c85389224d68d793c0296` |
| **Secret** | `fa423cd15c644165a79a96defeb2a812a2ee5183aa0710a6f1dc2bb3d15a7111` |
| **Started** | 2026-04-29 08:58 UTC |
| **Completed** | 2026-04-29 09:02 UTC (~4 min) |
| **Final Status** | `COMPLETE` ✅ |

---

### Swap 2 — ETH/XRP (Wallet A sells ETH, Wallet B buys with XRP)
| Field | Value |
|-------|-------|
| **Swap ID** | `cb333d0f-a7ae-47c8-9ddc-933044ea4644` |
| **Direction** | ETH → XRP |
| **Amounts** | 0.7 ETH ↔ 448 XRP |
| **Maker (Side A)** | `0xE4016D...` — locked 0.7 ETH |
| **Taker (Side B)** | `0x4f6019...` — locked 448 XRP |
| **ETH HTLC Lock ID** | `0x5925bf2f0724e5de6d09bc757eb5495e894caf4a50df7d9ea2286e1ec85e30af` |
| **XRP Escrow** | `rfNqtAMnoZ44FXnEoWaeTzjRLLuaCM2cqk:16898481` |
| **Secret Hash** | `92e208958a3fa2723144f207e6fd6eacea5eec00ab773b318ed65675408f7e55` |
| **Secret** | `1a772c9214b44726553b1db96fcf3295ed37d2385a4cc1550aaf2700e67ad8d3` |
| **Started** | 2026-04-29 09:22 UTC |
| **Completed** | 2026-04-29 09:23 UTC (~1 min) |
| **Final Status** | `COMPLETE` ✅ |

---

### Swap 3 — XRP/ETH (Wallet B sells XRP, Wallet A buys with ETH)
| Field | Value |
|-------|-------|
| **Swap ID** | `38a179f2-7e4b-4cbd-86d0-7f2277bb707a` |
| **Direction** | XRP → ETH |
| **Amounts** | 450 XRP ↔ 0.79 ETH |
| **Maker (Side A)** | `0xE4016D...` — locked 450 XRP |
| **Taker (Side B)** | `0x4f6019...` — locked 0.79 ETH |
| **XRP Escrow** | `rPvDE8ukCC1oBYQXMVi6KhYwNmpWXgZNBT:16904419` |
| **ETH HTLC Lock ID** | `0xe857f016b3999b9a182ba4b865280c5cf507c524d475ed6dc5c5510e735b1106` |
| **Secret Hash** | `9e3d755c76e1b813688f571adde6e7c53a802da6d4ee2eaba49f988af2022ee3` |
| **Secret** | `c267a573b7b89647693b5b7b482496e95fb90c2d014259d6a606a4f013ea8329` |
| **Started** | 2026-04-29 09:25 UTC |
| **Completed** | 2026-04-29 09:28 UTC (~3 min) |
| **Final Status** | `COMPLETE` ✅ |

---

### Swap 4 — XRP/ETH (Wallet A sells XRP, Wallet B buys with ETH)
| Field | Value |
|-------|-------|
| **Swap ID** | `f51a2f3b-f125-40b8-b78b-ee8e4aabae8a` |
| **Direction** | XRP → ETH |
| **Amounts** | 450 XRP ↔ 0.270325 ETH |
| **Maker (Side A)** | `0x4f6019...` — locked 450 XRP |
| **Taker (Side B)** | `0xE4016D...` — locked 0.270325 ETH |
| **XRP Escrow** | `rfNqtAMnoZ44FXnEoWaeTzjRLLuaCM2cqk:16898485` |
| **ETH HTLC Lock ID** | `0x9a2386a35b175180fbb53662dc9826522ca26e8616e1a71a8a37e6bab8a18efd` |
| **Secret Hash** | `af735cc5ef76b4757a599a61d7541d1ffd44344711d17d048c22081a6b58ba39` |
| **Secret** | `fea21fc089aaeb5fc8132e84cbaa48608de53171f8175cd74950d091612c3cd1` |
| **Started** | 2026-04-29 09:39 UTC |
| **Completed** | 2026-04-29 09:42 UTC (~3 min) |
| **Final Status** | `COMPLETE` ✅ |

---

### Swap 5 — XRP/ETH (Wallet B sells XRP, Wallet A buys with ETH)
| Field | Value |
|-------|-------|
| **Swap ID** | `913711f6-2a60-45f6-b902-ad88807c9797` |
| **Direction** | XRP → ETH |
| **Amounts** | 400 XRP ↔ 0.239404 ETH |
| **Maker (Side A)** | `0xE4016D...` — locked 400 XRP |
| **Taker (Side B)** | `0x4f6019...` — locked 0.239404 ETH |
| **Secret Hash** | `e29338ed1d6d1ead006341e0aaa0ab143e231af42be06cf442cc21b2f11af964` |
| **Secret** | `b2941b2ca7dd92dd9476fa8c5a8f9c83d6779c396ca301e04222cf2eb4008ab1` |
| **Started** | 2026-04-29 09:52 UTC |
| **Completed** | 2026-04-29 09:53 UTC (~1 min) |
| **Final Status** | `COMPLETE` ✅ |

---

## Protocol Flow

### ETH/XRP direction (maker sells ETH)
```
Maker                    Server               Taker
  │                        │                    │
  ├─ POST /offer ─────────►│                    │
  │  (secretHash, ETH amt) │                    │
  │                        │◄─ POST /accept ────┤
  │                        │   (taker XRP addr) │
  │                        │──► CREATE swap ─────
  │                        │    PENDING_SIDE_A   │
  │                        │                    │
  ├─ Lock ETH on Sepolia ──►                    │
  ├─ POST /lock/side-a ────►│                    │
  │                        │── SIDE_A_LOCKED ───►│
  │                        │                    ├─ Lock XRP escrow
  │                        │◄─ POST /lock/side-b─┤
  │                        │── SIDE_B_LOCKED ───►│
  │                        │                    │
  ├─ Claim XRP escrow ─────►  (reveals secret)  │
  ├─ POST /claim/side-b ───►│                    │
  │                        │── COMPLETE ─────────►│
  │                        │    (secret stored) │
  │                        │                    ├─ Claim ETH HTLC
  │                        │                    │  (using revealed secret)
```

### XRP/ETH direction (maker sells XRP)
```
Maker                    Server               Taker
  │                        │                    │
  ├─ POST /offer ─────────►│                    │
  │  (secretHash, XRP amt) │                    │
  │                        │◄─ POST /accept ────┤
  │                        │   (taker ETH addr) │
  │                        │──► CREATE swap ─────
  │                        │    PENDING_SIDE_A   │
  │                        │                    │
  ├─ Lock XRP escrow ──────►                    │
  ├─ POST /lock/side-a ────►│                    │
  │                        │── SIDE_A_LOCKED ───►│
  │                        │                    ├─ Lock ETH on Sepolia
  │                        │◄─ POST /lock/side-b─┤
  │                        │── SIDE_B_LOCKED ───►│
  │                        │                    │
  ├─ Claim ETH HTLC ───────►  (reveals secret)  │
  ├─ POST /claim/side-b ───►│                    │
  │                        │── COMPLETE ─────────►│
  │                        │    (secret stored) │
  │                        │                    ├─ Claim XRP escrow
  │                        │                    │  (using revealed secret)
```

---

## Bugs Fixed During Testing

| # | Bug | Fix |
|---|-----|-----|
| 1 | Rate limiter blocking all Vercel requests | `app.set('trust proxy', 1)` in Express — Vercel adds `X-Forwarded-For` which failed validation |
| 2 | No cancel button for market listings | Added `POST /api/swap/v2/offer/:offerId/cancel` + UI button |
| 3 | Maker shown spurious "Claim XRP" after completing XRP/ETH swap | Removed incorrect `canClaimXrp` condition `isMaker && COMPLETE && baseChain=XRP` |
| 4 | `tecUNFUNDED` on XRP lock left orphan DB row | Added `POST /api/swap/v2/swap/:swapId/cancel` + "Cancel Swap" button for `PENDING_SIDE_A` |

---

## BNB/BSC Implementation Status

BNB ↔ XRP swaps use **identical protocol** to ETH ↔ XRP. BNB uses the same `HashedTimelockETH` contract deployed on BSC, same HTLC flow, same EVM signing.

### Server (✅ Complete)
- `EvmMonitor` polls BSC for `BNB` swaps (configured via `BNB_RPC_URL` + `BNB_HTLC_CONTRACT`)
- `verifyLockOnChain('BNB', ...)` uses `_verifyEvmLock` — identical to ETH path
- `BNB_RPC_URL` already set on VPS: `https://data-seed-prebsc-1-s1.bnbchain.org:8545`

### Client (✅ Complete as of this report)
- `EvmAdapter` already supports `BNB` via `getEvmAdapterConfig('BNB')`
- `canLockBnb`, `canClaimBnb`, `handleLockBnb`, `handleClaimBnb` added to `MarketplaceTab.tsx`
- BNB lock/claim buttons added (yellow theme, same layout as ETH buttons)

### ⚠️ One step required before testing BNB/XRP
Deploy `HashedTimelockETH.sol` on **BSC Testnet (chainId 97)** and set:
```
# In client env (Vercel)
VITE_BNB_HTLC_CONTRACT=0x<deployed_address>
VITE_BNB_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
VITE_BNB_CHAIN_ID=97

# On VPS swap server
BNB_HTLC_CONTRACT=0x<deployed_address>
BNB_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
```

Get BSC testnet BNB: https://www.bnbchain.org/en/testnet-faucet

---

## Summary

| Metric | Value |
|--------|-------|
| Total swaps completed | **5** |
| ETH/XRP direction | 2 |
| XRP/ETH direction | 3 |
| Total ETH transacted | ~2.28 ETH (testnet) |
| Total XRP transacted | ~2,044 XRP (testnet) |
| Average completion time | ~2.4 minutes |
| Failed/stuck swaps | 1 (tecUNFUNDED — XRP wallet drained, no funds at risk) |
| Protocol security model | Non-custodial HTLC — funds auto-refund if swap abandoned |
