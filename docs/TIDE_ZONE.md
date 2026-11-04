# Tide Zone

## v2 (Sep 2026): 1h/4h only, per-timeframe presets, point-in-time signals

**What changed on the chart**

- **Timeframes:** Tide only runs on **1h** and **4h** charts. On any other timeframe the pane,
  the markers and the HUD numbers are blank. A small note says `Tide: 1h/4h only`.
  (`calculateTideZoneForTimeframe`: the score isn't even computed off 1h/4h.)
- **Per-timeframe settings:** 1h and 4h each keep their own values. The chart loads the set that
  matches its timeframe. The settings modal has **1h / 4h tabs**, each with *Reset to preset*.
  Storage key: `tide-zone-settings-v2` (v1 keys are ignored). Removed fields: `minGap`, `emaSep`,
  `priceLlPct`. They were never used by the detector.
- **No repainting.** Each Tide-out is emitted **once, on the bar where it confirms**. It only uses
  bars up to and including that bar, and it is never removed later:
  - The newest (still-forming) candle is excluded from signal detection.
  - The 1h chart's 4h resample drops an incomplete trailing 4h bucket, so the newest bar's score
    doesn't change when the next 1h bar lands.
  - Signals confirmed in the first 400 loaded bars are hidden. These are warm-up bars: on
    1000-bar windows vs full history, all mismatches were in the first ~400 bars and none after.
    The site loads 3000 1h/4h bars.
  - Signals already shown are kept in a per-series ledger for the session.
- **Tide out +:** when **RSI(14) < 30** at any bar from the pivot low to the confirmation bar, the
  marker reads `Tide out +` (green) instead of `Tide out` (violet).
- **Tide in:** the exit. It is the first confirmed peak of the exit EMA (a zigzag high becoming the
  tail, N bars after the peak) at or after the entry bar. It is only drawn when it closes a Tide-out.
- **Stop line:** each Tide-out gets a dashed stop line under its pivot low. The line runs from the
  signal bar until the Tide-in exit (the next open) or until the stop is hit (✕ `stop hit`).
  While the trade is open, the line extends to the newest bar with an `SL` price.

**Presets.** These come from the live-accurate re-search: non-repainting signals, BTC ETH XRP SOL BNB
DOGE, train < 2024, holdout 2024+, fees 4 bp per side, Tide-in exit only (no target), with a
max-hold time exit in the backtest (4h 18 bars, 1h 48 bars) that is not drawn on the chart.
Adding a 1.5R target on 1h gives holdout PF 1.87 (n 67). It is not drawn.

| | Smoothing EMA | Pivot N | Threshold | Tide-in exit | Stop | Train | Holdout |
|---|---|---|---|---|---|---|---|
| **4h** | 8 | 3 | −20 | EMA 8 peak, N 5 | pivot low − 0.5 × ATR(14) | PF 1.32, n 206, +0.62% | PF 1.92, n 117, +1.44%/trade, 48% win |
| **1h** | 21 | 8 | −40 | EMA 8 peak, N 8 | pivot low − 0.5% | PF 2.00, n 112, +0.75% | PF 1.78, n 66, +0.58%/trade, 55% win |

**How these compare with the old setup:**
- Old live default 8/5/−10 with the same exits: 4h holdout PF 0.63 (negative every year from 2024),
  and 1h holdout PF 1.00 (EMA 8 N 8 exit, ATR stop).
- The earlier write-up presets lose a lot once repainting is removed: 4h P1 PF 2.66 → 1.79, and the
  1h preset PF 2.29 → 1.38.
- Weak spots: 4h is soft on ETH and BNB (PF ≈ 0.9–1.0). The BTC 1h preset (−40) is rare, about 5
  signals a year.
- RSI+ was the only confluence that improved both train and holdout on 4h: fwd 24h +0.77% → +1.65%,
  book PF 1.92 → 2.41. Holdout n is only 32, so treat it as a quality tag, not a filter.

**Code**

- `client/src/lib/indicators/tideSignals.ts`:
  - presets params type
  - `detectTideOutSignals`, `detectTideInPeaks`, `tideStopLevel`, `buildTideTrades`, `computeTideV2`
  - timeframe helpers
- `client/src/lib/indicators/tideTimeframe.ts`: 1h/4h gating for the score.
- `client/src/hooks/useTideV2.ts`: per-chart computation plus the ledger, the overlay builder and the HUD status.
- `client/src/types/tideZoneSettings.ts`: `TIDE_PRESETS`, v2 settings, normalisation.
- `client/src/lib/chartPrimitives/TideAccumPrimitive.ts`: draws the markers and stop lines.
- UI: `TideAccumRenderer`, `TideZonePanel` (EMA lines, `out`/`in` markers, blank note),
  `TideZoneHud` (`Tide out(+)` / `Tide in` / `Stop hit` badge, `SL` price), `TideZoneSettingsModal` (tabs).
- **Parity:** `scripts/tide_live_core.py` is the Python research detector.
  `scripts/tide_v2_parity_fixture.py` writes `client/src/__tests__/lib/fixtures/tide_btc_{4h,1h}.json`
  from real BTC perp bars. `tideSignals.test.ts` checks, bar for bar:
  - score, EMAs, signals, RSI+, peaks, stops and outcomes
  - a prefix test that signals never disappear or change as bars are appended

**Caveats**
- The site's candles come from Binance **spot** (`/api/crypto/extended-history`). The research used
  USDT-M perp bars, so levels can differ by a few basis points.
- Absorb boxes (legacy) still use the old zigzag and can repaint. They are off by default.

---

## v1 notes (original scan)

New oscillator from a **fresh** holistic scan of the falcon2 warehouse
(`market.sqlite` + Coinglass extra series pulled 2026-09-03). This did **not**
reuse the combo / reclaim / cap engines.

## Data

- Klines 15m / 1h / 4h, six coins, 2019-01 → 2026-09
- Funding 8h (listing → now)
- OI 1h/4h from 2026-03-06 (Coinglass window)
- **New:** pair liquidations, global long/short, pair taker buy/sell (1h+4h, 2026-03-07 → 2026-09-03)

Target: ATR-normalized forward return `zH` (15m H=48, 1h H=12, 4h H=6).
Buy zone = top quintile of zH. Sell zone = bottom quintile.

Full tables: `falcon@falcon2:~/crypto-data/holistic/report.txt`

## What actually tells a zone

Same-bar RSI, stoch, MFI, Williams — **almost nothing** (rho ~0). The live
oscillator suite is not the tell.

**Year-stable (same sign every year 2019–2026):**

| Feature | 15m | 1h | Reading |
|---|---|---|---|
| 4h RSI | rho +0.087, lift Q1−Q5 ≈ −2.0 | +0.069 | High 4h RSI → buy zone. Low → sell. Trend, not fade. |
| 4h EMA50 distance | +0.061 | +0.049 | Price above 4h EMA50 → buy zone |
| 1h RSI / EMA50 | yes on 15m | — | Same direction, weaker |
| CVD slope (12) | weak | same sign every year | Positive tape → buy |

**2026 derivatives window (six coins, 15m):**

- Coinglass taker imbalance: high buy tape → buy zone (same sign, all coins)
- Long liquidations high → sell zone (cascade, not a bounce)
- Strongest 6-coin cell: **taker buy × 4h EMA50 up** → mean z = **+2.43 ATR**. Both down → **−0.89**

**Two-mode structure (15m, 4 coins):**

- Quiet + below 4h EMA50 → sell (mean z ≈ −1.8)
- **High ATR% + below 4h EMA50 → bounce buy** (mean z ≈ +4.0)
- High 4h RSI → buy whether energy is high or not

So: follow the 4h tide; only fade it when local energy is extreme.

## Formula

On the chart timeframe, resample a 4h series (16×15m, 4×1h, native 4h).

```
tide   = 0.6 * pctile(4h RSI, 80) + 0.4 * pctile(close/4h EMA50 − 1, 80)
energy = 0.5 * pctile(ATR%/close, 200) + 0.5 * pctile(BB width, 200)
tape   = pctile(12-bar signed-volume / volume, 100)

raw = 0.55*(2*tide−1) + 0.35*(2*energy−1)*(1−tide) + 0.25*(2*tape−1)
score = 100 * tanh(raw)     # −100 … +100
```

Live labels (location, not a constant buy/sell):

- **Up tide** (green): score ≥ +40 — with the 4h, not a buy signal the whole trend
- **Bounce vs down tide** (amber): tide < 0.45 and energy > 0.65 and score > 15
- **Down tide** (red): score ≤ −40

Tape uses candle signed volume so the pane works without Coinglass. When
taker/liq history is on the box, it confirmed the same direction.

## Files

- `client/src/lib/indicators/tideZone.ts`
- `client/src/components/indicators/oscillators/TideZonePanel.tsx`
- Enable from the Oscillators menu as **Tide Zone**
