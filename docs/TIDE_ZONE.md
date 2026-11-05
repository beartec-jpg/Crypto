# Tide Zone

## v3 (Nov 2026): stripped back, two EMAs, Tide in / Tide out as EMA crosses

Tide Zone is now just the **score histogram** plus **two EMAs of the score** and two signals.
Everything layered on in v2 is gone: the old Tide-out divergence markers, the old Tide-in peaks and exit
EMA, stop lines and simulated trades, DIV / Absorb / Distro / Reacc boxes, OI tags, the −20 line and the
per-timeframe presets. (The research write-up of v2 is in git history, and the Python research scripts are untouched.)

**What stays**
- The score and its colours (green up tide, amber bounce, red down tide), the +40 / 0 / −40 guides.
- The small HUD label with `T` (tide), `E` (energy), `Tp` (tape).
- 1h and 4h only. On any other timeframe the pane and HUD are blank (`Tide: 1h/4h only`).

**The two EMAs.** An EMA of the score (seeded on the first score) with period `EMA short` and one with
`EMA long`. Both are drawn on the histogram (short = blue, long = amber).

**Signals** (a cross of the *driving* EMA against the histogram; `diff = score − EMA`):

| Signal | Cross | Gate |
|---|---|---|
| **Tide in** | EMA crosses **below** the histogram (score crosses up through the EMA): `diff` goes from ≤ 0 to > 0 | score on the cross bar **≤ Tide in level** (0 to −80) |
| **Tide out** | EMA crosses **above** the histogram (score crosses down through the EMA): `diff` goes from ≥ 0 to < 0 | score on the cross bar **≥ Tide out level** (0 to 80) |

Tide in is the low-zone cross, Tide out the high-zone cross. Note this is the **reverse** of the old v2
naming (old "Tide out" was the bullish divergence entry, old "Tide in" the exit).

**Which EMA drives the cross** is a setting: **Short** (default) or **Long**. The toggle follows the label, not
which period happens to be larger. The other EMA is still drawn.

**No repaint.** A cross is evaluated only on a *closed* bar, from that bar and the one before it. The EMA is
causal, so a printed signal never moves or disappears when later bars arrive (pinned by a prefix test for both
Short and Long). The still-forming newest candle is ignored, and the 1h chart's 4h resample drops an incomplete
trailing 4h bucket. The first `period` bars of the driving EMA are a warm-up and never signal.
Markers show on the Tide pane (on the driving EMA line) and on the main chart candles.

**Settings** (gear on the Tide pane): 4 sliders and one toggle, nothing else.

| Setting | Range | Default |
|---|---|---|
| EMA short | 1 to 100 | 8 |
| EMA long | 1 to 100 | 21 |
| Tide in level | 0 to −80 | −40 |
| Tide out level | 0 to 80 | 40 |
| EMA that drives the cross | Short / Long | Short |

Stored in the browser (`localStorage` key `tide-zone-settings-v3`). The server oscillator preferences only
hold the favourites list, so there is no server-side copy. Older Tide keys are ignored.
No backtest was run on these defaults; they are a starting point, not a validated preset.

**Code**
- `client/src/lib/indicators/tideSignals.ts`: `computeTideCross`, `freshTideCross`, timeframe helpers.
- `client/src/lib/indicators/tideZone.ts`: the score (unchanged maths), `emaTideScore`, colours.
- `client/src/types/tideZoneSettings.ts`, `client/src/hooks/useTideZoneSettings.ts`: settings and storage.
- `client/src/components/modals/TideZoneSettingsModal.tsx`: the settings menu.
- `TideZonePanel` (histogram, EMAs, markers, gear), `TideZoneHud`, `TideCrossMarkers` (main chart).
- Tests: `client/src/__tests__/lib/tideSignals.test.ts` (crosses, gates, both modes, no repaint, settings, and the
  score vs real BTC bars from `fixtures/tide_btc_{4h,1h}.json`).

---

## v2 (Sep 2026, removed in v3)

Per-timeframe presets, Tide-out divergence signals, Tide-in exits and stops. Removed in v3, see above.

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
