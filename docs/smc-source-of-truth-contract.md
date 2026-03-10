# SMC Source-of-Truth Contract

## Overview

The Smart Money Concepts (SMC) scoring system enforces a **single source of truth** for all
zone data consumed by the scoring engine, renderers, and debug tooling.  Every runtime path
(live fullscreen, historical signal events, viewport backtest, confluence monitor) must follow
this contract.

---

## Canonical `ScoringInput` Schema

### Entry Zones

| Field | Type | Description |
|---|---|---|
| `fvgs` | `Array<{high, low, filled, type}>` | Fair Value Gaps — unfilled imbalance zones |
| `orderBlocks` | `Array<{high, low, type, mitigated?}>` | Order Blocks — supply/demand zones |
| `breakers` | `Array<{high, low, type, mitigated?, conversionIndex?, conversionPrice?}>` | Breaker Blocks — former OBs that flipped polarity |

**Rule:** Breaker data lives exclusively in `breakers[]`.  Order block objects (`orderBlocks[]`)
must **never** carry `breaker` or `breakerType` fields.  Scoring logic must **never** read
breaker state from order block objects.

### Bonus / Confluence Factors

| Field | Type | Description |
|---|---|---|
| `liquidityZones` | `Array<{price, type, swept, sweepPrice?, sweepIndex?, sweptIndex?}>` | Equal-high / equal-low sweeps |
| `smtDivergence` / `priceHistory` / `rsiHistory` / `macdHistHistory` | various | Divergence detection inputs |
| `autoFibResult` | `{primary, secondary}` | Auto-Fibonacci levels |
| `structureBreaks` | array | MSS / BOS / CHoCH for trend strength multiplier |

### Required Sweep Metadata

The following fields on `liquidityZones` entries **must be preserved** throughout all mapping
operations:

- `sweepPrice` — wick extreme that swept through the level (used for invalidation logic)
- `sweepIndex` — candle index of the wick candle (debug fallback)
- `sweptIndex` — candle index of the confirmation close (primary scoring input for decay)

Stripping these fields at the call site causes incorrect look-ahead protection and silent
scoring degradation.

---

## Data Flow

```
Raw detector output (useFVGDetection, useOrderBlockDetection,
                     useBreakerBlockDetection, useLiquidityDetection)
         │
         ▼
  buildSmcZoneInputs(fvgs, orderBlocks, breakers, liquidityZones, currentTime?)
         │   ┌─ top/bottom → high/low remapping
         │   ├─ optional look-ahead time filter (backtest mode)
         │   └─ sweep metadata preserved verbatim
         ▼
     ScoringInput  ──►  scoreSmartMoney()
                    ──►  SMCDebugTable (debug display)
```

**`buildSmcZoneInputs`** (exported from `tradingSystemScoring.ts`) is the **single mapping
helper** used by every scoring path.  When `currentTime` is omitted the function is in
*live/fullscreen* mode and includes all items.  When provided it is in *backtest* mode and
filters items by their formation timestamps (look-ahead guard).

---

## Look-ahead Guard Logic

| Array | Filter condition |
|---|---|
| `fvgs` | `!fvg.endTime \|\| fvg.endTime <= currentTime` |
| `orderBlocks` | `!ob.time \|\| ob.time <= currentTime` |
| `breakers` | `!b.conversionTime \|\| b.conversionTime <= currentTime` |
| `liquidityZones` | `touchTimes[last] <= currentTime` (or empty) |

Mitigation flags are also time-gated: a zone is marked `mitigated: true` only when
`mitigationTime <= currentTime`.

---

## Conditions Array Invariant

`scoreSmartMoney()` **always** returns a populated `conditions[]` array — even when the final
score is 0.  Conditions are never omitted due to an early return.  When a condition is not
met, it appears with `met: false` and its raw score.

This ensures:
- Weight sliders are always visible in the debug table regardless of market state.
- Downstream consumers (UI, alerts, logging) always receive a complete evaluation.
- Score = 0 is distinguishable from "not computed".

---

## Render / Scoring Source Parity

| Renderer | Data Source |
|---|---|
| `OrderBlockRenderer` | `orderBlocks` array from `useOrderBlockDetection` |
| `BreakerRenderer` | `breakers` array from `useBreakerBlockDetection` |
| `SMCDebugTable` | `scoringInput` passed to `scoreSmartMoney()` |

Renderers and the scoring engine consume the **same data objects**.  There is no separate or
stale copy of SMC data used for display.

---

## Key Exports from `tradingSystemScoring.ts`

| Export | Purpose |
|---|---|
| `ScoringInput` | The canonical input type for all scoring functions |
| `buildSmcZoneInputs()` | Maps raw detector output → `ScoringInput` zone fields |
| `RawSmcFVG` | Input type for `buildSmcZoneInputs` FVG parameter |
| `RawSmcOrderBlock` | Input type for `buildSmcZoneInputs` OB parameter |
| `RawSmcBreaker` | Input type for `buildSmcZoneInputs` breaker parameter |
| `RawSmcLiquidityZone` | Input type for `buildSmcZoneInputs` liquidity zone parameter |
| `scoreSmartMoney()` | Primary SMC scoring function |
| `scoreBreakerBlockProximity()` (internal) | Reads exclusively from `ScoringInput.breakers` |
