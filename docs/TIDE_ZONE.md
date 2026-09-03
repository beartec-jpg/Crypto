# Tide Zone

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
