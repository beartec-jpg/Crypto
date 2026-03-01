# Weighted Scoring Calibration Guide (Compact)

## Purpose
Use this guide to calibrate the new granular weighted scoring system so signals are stable, interpretable, and consistent across all 8 trading systems.

- Score range per condition: `-100..+100`
- User condition weight: `0..3`
- System score: weighted average of active conditions
- Long trigger: `score >= buyThreshold`
- Short trigger: `score <= -sellThreshold`

---

## Where to Calibrate

### Core Scoring
- `client/src/lib/tradingSystemScoring.ts`
- `client/src/lib/conditionScoring.ts`

### Weights + Defaults
- `client/src/lib/conditionWeights.ts`

### UI + Recompute Wiring
- `client/src/components/tradingSystems/ActiveSystemMonitor.tsx`
- `client/src/pages/ChartFullscreenPage.tsx`
- `client/src/hooks/useMultiSystemConfluence.ts`

---

## Fast Calibration Workflow (Per System)
1. Pick one system and one timeframe pair (example: `1h` + `4h`).
2. Run through 3 market regimes:
   - trend up,
   - trend down,
   - chop/range.
3. Observe condition scores in expanded monitor and final system score.
4. Adjust only one of the following at a time:
   - condition score mapping (function ranges),
   - default condition weight,
   - buy/sell threshold.
5. Re-check historical marker count and false-trigger rate.
6. Repeat for all systems.

---

## Target Operating Bands
Use these as practical guardrails:

- `|score| < 20`: mostly noise / neutral
- `20..39`: weak setup
- `40..59`: moderate setup
- `60..79`: strong setup
- `>= 80`: very strong setup

Recommended initial thresholds:
- `buyThreshold = 70`
- `sellThreshold = 70`

If too many signals: raise to `75-85`.
If too few signals: lower to `60-68`.

---

## Condition Weight Policy
Keep weights sparse and intentional:

- `0`: disable condition (exclude from average)
- `1`: baseline
- `2`: high importance
- `3`: critical / anchor condition

Guidelines:
- Avoid more than 1-2 conditions at weight `3`.
- If many conditions are `2/3`, score becomes overly sensitive.
- Prefer improving score mapping before over-weighting conditions.

---

## Practical Tuning Rules

### 1) Score Compression / Expansion
- If most scores cluster near `0`, widen mapping gradients (more aggressive bins).
- If scores hit extremes too often, compress mapping around neutral.

### 2) Directional Symmetry
- Ensure bullish and bearish paths have comparable magnitude unless strategy explicitly favors one side.

### 3) Confluence Quality
- Strong signals should usually require at least 2-3 aligned non-zero conditions.
- Single-condition spikes should rarely exceed threshold unless intentionally weighted.

### 4) Disabled Condition Behavior
- Verify weight `0` truly removes condition contribution (weighted score = `0`, excluded from denominator).

---

## Multi-System Confluence Checks
After calibrating each system, validate aggregate behavior:

- Confluence score should not pin near extremes in normal markets.
- Regime transitions should shift confluence smoothly, not in single-bar jumps.
- Weight changes in one system should produce visible but not disproportionate confluence shifts.

---

## Regression Checklist
Use this quick pass before merging:

- [ ] All systems emit granular condition scores (`-100..100`)
- [ ] All systems respect per-condition weight (`0..3`)
- [ ] Weight `0` excludes condition from averaging
- [ ] Threshold sliders still control actions correctly
- [ ] Historical marker count updates when weights change
- [ ] Multi-system confluence updates when weights change
- [ ] Reasoning reflects strongest active weighted conditions
- [ ] Default weights reset correctly per system

---

## Deterministic Test Anchors
Use these as known references during regression:

- Mean Reversion example (default weights): expected `53`
- Mean Reversion example (custom weights with trend disabled): expected `81`

Related tests:
- `client/src/__tests__/lib/conditionWeights.test.ts`
- `client/src/__tests__/lib/tradingSystemScoring.weighted.test.ts`

---

## Recommended Next Calibration Order
1. `trend-following`
2. `breakout-momentum`
3. `smart-money`
4. `momentum-scalper`
5. `divergence-master`
6. `mtf-confluence`
7. `volume-profile`
8. `mean-reversion` (final polish against anchors)

This order usually stabilizes high-frequency systems first, then aligns slower/confirmatory systems for cleaner aggregate confluence.
