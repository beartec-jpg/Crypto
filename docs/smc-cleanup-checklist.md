# SMC Cleanup Checklist

Use this checklist whenever you modify SMC scoring, rendering, or input mapping to verify
compliance with the [single-source-of-truth contract](./smc-source-of-truth-contract.md).

---

## When modifying `scoreSmartMoney()` or any SMC scoring helper

- [ ] `conditions[]` is populated in **every** return path — no early return emits an empty array.
- [ ] All conditions appear with `met: false` when not qualified (score = 0 is not "not computed").
- [ ] Breaker scoring reads **only** from `input.breakers`; no code reads `ob.breaker` or
      `ob.breakerType` from order block objects.
- [ ] Entry zones are limited to `fvgs`, `orderBlocks`, `breakers` — no other arrays used as
      entry zones.
- [ ] Bonus/confluence factors are limited to `liquidityZones`, `smtDivergence`, `autoFibResult`,
      and `structureBreaks` (trend multiplier).

---

## When adding a new scoring path (e.g., a new page, modal, or hook)

- [ ] Use `buildSmcZoneInputs(fvgs, orderBlocks, breakers, liquidityZones, currentTime?)` to
      build the zone fields — do **not** inline the `top/bottom → high/low` mapping.
- [ ] For live/fullscreen paths: call `buildSmcZoneInputs` without `currentTime`.
- [ ] For backtest/historical paths: call `buildSmcZoneInputs` with the per-candle `currentTime`
      to engage the look-ahead guard.
- [ ] `breakers` is always passed — never omitted from the call.
- [ ] Liquidity zone sweep metadata is preserved:
      - `sweepPrice` ✓
      - `sweepIndex` ✓
      - `sweptIndex` ✓

---

## When modifying `buildSmcZoneInputs()`

- [ ] The `top/bottom → high/low` remapping is applied to all three zone arrays (FVG, OB,
      Breaker).
- [ ] The look-ahead filter uses the correct timestamp field for each array:
      - FVG → `endTime`
      - OrderBlock → `time`
      - Breaker → `conversionTime`
      - LiquidityZone → `touchTimes[last]`
- [ ] Mitigation flags are time-gated: `mitigated` is `true` only when
      `mitigationTime <= currentTime`.
- [ ] Sweep metadata (`sweepPrice`, `sweepIndex`, `sweptIndex`) is passed through unchanged.

---

## When modifying renderers

- [ ] `OrderBlockRenderer` receives data from `orderBlocks` (via `useOrderBlockDetection`) only.
- [ ] `BreakerRenderer` receives data from `breakers` (via `useBreakerBlockDetection`) only.
- [ ] `SMCDebugTable` is passed the exact `scoringInput` object used by `scoreSmartMoney()` —
      not a separately constructed copy.

---

## When modifying `useMultiSystemConfluence()`

- [ ] The `breakers` parameter is present and wired into `ScoringInput`.
- [ ] The `liquidityZones` parameter carries full sweep metadata
      (`sweepPrice`, `sweepIndex`, `sweptIndex`).
- [ ] The call site in `ChartFullscreenPage` passes mapped breakers and full liquidity zone
      objects.

---

## When modifying `runTradingSystemBacktest()`

- [ ] `ViewportBacktestParams` includes a `breakers?` field.
- [ ] `buildSmcZoneInputs` is called with `currentTime` for per-candle look-ahead filtering.
- [ ] The call site passes `breakers` from `useOrderBlockDetection`.

---

## Tests to run after any SMC change

```bash
npx vitest run client/src/__tests__/lib/smcContract.test.ts
npx vitest run client/src/__tests__/lib/tradingSystemScoring.test.ts
npx vitest run client/src/__tests__/lib/tradingSystemScoring.weighted.test.ts
```

Key assertions validated by `smcContract.test.ts`:
1. `conditions[]` is never empty even when `score = 0`.
2. `breakerBlockProximity` score is 0 when `input.breakers` is empty — regardless of what OBs
   are present.
3. `buildSmcZoneInputs` produces identical mapped output for fullscreen and backtest paths when
   given the same raw data and a sufficiently future `currentTime`.
