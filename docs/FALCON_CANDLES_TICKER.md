# Falcon candles + ticker (follow-up to #617)

Draft. Not a verified UTC chart and not merge-ready. Chart mode has not been selected.

## What this adds
- Ticker selector: `USDC-FPL` (default) and `BTC4-FPL` (selectable). An empty USDC book is not replaced with BTC4.
- `GET /api/crypto/falcon/markets`, `GET /api/crypto/falcon/candles`, `POST /api/crypto/falcon/ingest`
- Chart hooks can request Falcon candles for those symbols. Binance paths are unchanged for USDT pairs.
- Brain `sync_candles.py` records explorer tip labels and pushes coverage. It does not publish verified UTC buckets.

Quote is **FPL**, not USD or USDT. Prices are FPL per 1 whole base. Both markets are Falcon testnet network 2300. Tokens have no monetary value.

## Clock contract

Three clocks are not interchangeable. This matches Falcon-faucet-wallet #187 `honestSealTimes` (`src/lib/explorer-api/mappers.ts`, draft `6c10e19`). #618 previously treated a parseable `sealed_at` as canonical wall time (`timeQuality=canonical_sealed`, `timeSource=explorer.sealed_at`) and joined `block_times` to fills on height alone. That reading is withdrawn.

| Clock | Meaning | Verified UTC bucket? |
| --- | --- | --- |
| `sealed_at_ms`, `tip_sealed_at_ms`, `last_pack_at_ms` | Chain physics and reward time. Quality `chain_physics`. | **No.** Never convert these to a UTC `Date` or ISO. |
| `sealed_utc_ms` + `sealed_utc_quality=utc_committed` + `sealed_utc_source=signed_utc_v5` | Proposed hash-bound v5 wall clock. #187 emits `sealed_at` / `sealed_utc` ISO **only** in this case. | **No, not in this package.** The label may be stored as `utc_committed`. It is not `verified_utc`. |
| `observed_at`, `first_seen_at` | Observer or collector arrival. Quality `observer`. | **No.** Not trade time and not an estimate of trade time. |

Rules:

- A parseable `sealed_at` is **not** verified UTC. ISO without `utc_committed` + `signed_utc_v5` + a positive matching `sealed_utc_ms` is rejected (`sealed_at_not_verified_utc` or `sealed_at_disagrees`).
- Physics-as-ISO (an ISO built from physics ms) stays `chain_physics` with reason `physics_iso_rejected`.
- Missing UTC, zero UTC, and malformed time stay `unavailable`. They do not become a bucket.
- Pre-activation stays off the verified axis. Network **2300** UTC activation is disabled; an explicit activation flag cannot arm it. A `utc_committed` payload on 2300 keeps that candidate label and still has `bucketUnix=null`, `verifiedUtc=false`, `preActivation=true`.
- A field existing in Falcon-PL #27 is not activation and not a candle source.
- Live Cloud `fpl_fills` have no timestamp. Fills that are not admitted stay `time_status=untimed` and are counted in `coverage.untimedFills`. They are not dropped and not placed on a candle time axis.
- `block_times` is still keyed by height. That join is **not** a hash-bound identity→committed-UTC source. This package does not promote rows across a hash change. Identity binding is later work (Package D), not done here.

Verified UTC candles require all of the following, and none of them is granted here:

1. Chart mode explicitly selected as verified UTC.
2. Protocol UTC activation signed off (not true on network 2300).
3. A validated block identity (height **and** hash) → committed UTC source.

`VERIFIED_UTC_BUCKETS_ENABLED` is false in `candle_lib.py` and `api/_lib/falconTimeQuality.ts`. `build_candles` returns no bars. Ingest rejects a non-empty `candles` array. `GET /api/crypto/falcon/candles` withholds stored rows (`withheldCandleRows`) instead of drawing them as UTC.

## Public time labels

These strings travel library → sync coverage → ingest → `GET /api/crypto/falcon/candles` (`timeQuality`, `timeSource`, and `coverage`).

| `timeQuality` | `timeSource` | When |
| --- | --- | --- |
| `chain_physics` | `chain_physics` | Positive physics ms only |
| `observer` | `observer` | Only observer arrival |
| `unavailable` | `none` | Missing, zero, malformed, rejected ISO, or mixed evidence |
| `utc_committed` | `signed_utc_v5` | #187 utcOk candidate. `verifiedUtc` is still false |

Retired and never presented as verified time:

| Old token | Becomes |
| --- | --- |
| `canonical_sealed` | `unavailable` |
| `estimated_observation` | `observer` (not a trade-time estimate) |
| `explorer.sealed_at` | `none` |
| `verified_utc` | not emitted; ingest will not store a verified series |
| `no_canonical_block_time` | `verified_utc_unavailable` |

`verifiedUtc` is false. `chartMode` is `not_selected`. `canonicalTipsStored` is always 0. Mixed evidence on one market collapses to `unavailable` so one candidate cannot paint the set as UTC. `evidenceCounts` keeps the split.

`time` on a public candle is Unix-seconds bucket-open. No public candle is produced by this package, so that field is not a physics clock and not an observer clock.

## Markets
- Default market: `USDC-FPL`. `BTC4-FPL` is selectable.
- USDC scale: base decimals 6, price scale 1_000_000.
- BTC4 scale: base decimals 8, price scale 100_000_000.
- Sync exports each pair from its own fills. It does not copy BTC4 candles into an empty USDC market.

## Limits
- Live RPC ring ≤200 fills. Not full history.
- Explorer tips are an instance-local ring. `observed_at` is when that API remembered the tip.
- Dated check (6 Nov 2026 handover): explorer tips were seen with `sealed_at: null`. That is not a committed UTC timestamp.
- There is no public block-by-height historical time API. Heights outside the tip ring stay untimed.

## Delivery path
Brain → HTTPS POST `/api/crypto/falcon/ingest` with `FALCON_BRAIN_INGEST_TOKEN` (server-only).

The body may include `coverage` (`timeQuality`, `timeSource`, `untimedFills`, `quote: "FPL"`). Non-empty `candles` are rejected with `candles_rejected_not_verified_utc` while verified UTC is off. A coverage `pair` that normalizes to a different market is `coverage_pair_mismatch`. Quote USD/USDT is `quote_must_be_fpl`.

No public brain port. No production deploy is part of this change.
