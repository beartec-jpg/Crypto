# Tide Zone backtest grid (research, offline)

Branch `research/tide-backtest-grid`. Nothing here changes the app, the live trader or any setting; it is evidence for deciding defaults.
Everything was run on beartec-brain in `~/scratch/tide-backtest` at low priority. The code in this folder reproduces every number below.

## Verdict in plain English

* **Keep the repo presets as the defaults, for both 1h and 4h.** After about 205,000 configurations per timeframe, nothing chosen on the 2019-2023 data beat the presets on the untouched 2024 to Nov 2026 data in a way I would trust. The presets are the best single thing on 1h (OOS PF 1.59, +0.68% per trade net) and a solid one on 4h (OOS PF 1.19, +0.42%).
* **"Pull" (exit when the tide was high and then drops sharply) does not earn a place as an exit.** On 1h it is slightly *harmful* (-0.03% per trade across 150 random bases, better in only 18% of pairs). On 4h it is tiny and not reliable (-0.05% to +0.10% per trade on the preset, depending on the variant; on the strongest bases it is indistinguishable from zero, t = 0.3). Why: in the preset, only about 12% (4h) / 4% (1h) of the trades that end on the stop ever had the tide EMA reach +20 first, so there is very little for it to catch. The pattern Scott saw on XRP is real but rare (see `results/knife_stats.txt`).
* **Trend-EMA entry filter: one variant is worth a look, not a default.** Requiring the tide EMA (34 to 144 bars) to be rising over 8 to 16 bars before an entry helps out-of-sample in most paired tests (+0.05 to +0.3% per trade, better in 55-88% of pairs) and cuts the stop-hit rate by 4-9 points, at the price of removing 15-50% of trades. But its effect on the preset itself is mixed and sign-flips between lengths and timeframes (see tables), and the in-sample effect is slightly negative. Treat as optional/experimental. A "price EMA is falling, so block entries" filter (TP) removes ~80% of the trades and is harmful on the best bases.
* **Slow EMA crossover entries (lengths 100+ on price or on the tide)** looked great in-sample (t of 4-5, thousands of trades) and are flat to negative out of sample (OOS avg about 0%, max drawdown -47% to -54%). Do not use.
* **Cooldown, one-entry-per-swing re-arm and the other #596 guards** are close to no-ops on the presets (they change fewer than 10% of trades and the OOS effect is about 0). Harmless to keep optional.
* **Profit protection (move the stop to breakeven or trail once +1% to +3% in profit)** was tested as an alternative way to end "falling knife" trades positive. It converts many winners into scratch trades and is worse out of sample in all 12 variants on both timeframes.
* **Tide out + (RSI < 30 between pivot and confirm) as a hard requirement** is not stable: great in-sample on 4h and 1h, OOS +1.6% (4h preset) but -0.5% (1h preset) and -1.0% (4h) / -0.2% (1h) on the strongest bases. Do not make it a requirement.
* **One challenger worth forward-testing on 4h:** `ema5 / N21 / below -40`, 1.5 ATR stop, Tide in `ema3 N8 min 20 (peak after entry)`, plus cooldown 24 and the TS55/16 filter. It is positive in every calendar year from 2019 to 2025 (2026 YTD -0.1%) with a stop-hit rate of 4-5% and a max drawdown of -13% in OOS, and its neighbouring settings are mostly positive OOS too (ema8, N13, N34, below -50). It still came out of 205,000 trials on the 2019-2023 data, so it needs a paper/forward run before it is trusted. A walk-forward that re-picks every year from the grid did not work (see below), so the selection procedure is not proven even if this one config is fine.

## Recommended settings

| | 1h | 4h |
|---|---|---|
| Default | **repo preset**: Tide out ema21 / N8 / below -40, stop 0.5%, Tide in ema8 / N8 / min 0 | **repo preset**: Tide out ema8 / N3 / below -20, stop 0.5 ATR, Tide in ema8 / N5 / min 0 |
| Optional safe tweak | 2% stop (stop-hit 33% to 19%, OOS avg +0.82% vs +0.68%, PF 1.70 vs 1.59; but in-sample is a bit worse, so it is a risk-preference choice, not an edge) | none |
| Challenger (forward test only) | none beat the preset | `ema5 N21 <-40`, stop 1.5 ATR, Tide in ema3 N8 min20 after-entry, cooldown 24, TS55/16 (above) |
| Pull | do not enable | do not enable as an exit (could be shown as an informational marker only) |
| Trend filter | optional TS34/16 or TS55/8: costs a little OOS return on 1h (+0.42 / +0.63 vs +0.68) but fewer trades | optional TS34/16 (+0.91 vs +0.42 OOS) but negative in 2021/2022 in-sample; do not default |

## Data, method, costs

* **Data**: Binance spot klines (public data API, closed candles only), 1h and 4h, from 2019-01-01 (SOL from 2020-08-11, DOGE from 2019-07-05, LINK from 2019-01-16, the rest from 2019-01-01) to Nov 2026. Symbols: BTC, ETH, XRP, SOL, BNB, DOGE, ADA, LINK. `fetch_klines.py`.
* **Tide Zone**: a numpy port of the repo logic (score from 4h RSI14 percentile + distance to EMA50 percentile + energy + tape, causal bullish divergence with N-bar fractals and zigzag = Tide out, confirmed EMA peak = Tide in, #596 guards). Parity: `test_parity.py` matches the repo's TypeScript fixtures bar-for-bar (XRP score check tolerates 48 of 68,554 bars with sub-0.5 difference from float tie-breaks in the rolling percentile), and `test_engine_vs_sim.py` reproduces the repo's own `scripts/tide_live_core.sim` trade list exactly (same entry and exit bars, 6 of 6 symbol/timeframe cases).
* **Simulator** (`engine.py`): one position per symbol, fills at the next open, stop checked on every bar (gaps fill at the open), max hold 48 bars (1h) / 18 bars (4h). Costs: 9.5 bp per side plus 5 bp extra on stop-market fills (the repo research uses 4 bp; cost stress at 20 bp per side plus 15 bp stop is in the tables and `results/cost_sensitivity_*.csv`).
* **Split**: in-sample (IS) = trades confirmed before 2024-01-01; out-of-sample (OOS) = 2024-01-01 to Nov 2026. Selection between stages used IS only. The ranking key is a consistency score (mean of the yearly average %/trade minus half their standard deviation, over IS years with enough trades), because ranking by IS t-stat picked small-sample overfits. Expanding annual walk-forward (choose on years before Y, trade Y) for 2024, 2025, 2026 YTD.
* **Grid** (`grid.py`, staged coarse to fine, every config logged in `results/*_stage*.csv.gz`, 205,529 per timeframe):
  1. entry EMA (3 to 89) x pivot N (2 to 21) x below-score (0 to -60) x stop (ATR 0.5 / 1 / 1.5, % 0.5 / 1 / 2) with the preset exit;
  2. exit family on the top bases: Tide in EMA x N x min-score x after-entry x min-hold, zero-cross, EMA cross, distribution proxy;
  3. entry filters: cooldown, one-entry-per-swing re-arm, trend filter (TP price-EMA falling / TS tide-EMA rising), RSI+ only, absorption confirm;
  4. Pull exit (peak X then drop Y within n bars; cross below Z; fast EMA below slow EMA; and a breakeven-stop mode);
  5. alternative entries (long-EMA slope with price still dropping, price/tide EMA crossovers with 100+ length, absorption bottoms);
  6. a paired panel: each feature applied to 150 random bases and to the grid-top bases, "variant minus its own base", to see the effect without selection bias.
* `recommend.py` compares the presets against small, explainable changes (tables below). `knife_stats.py`, `signal_clusters.py` are small diagnostics.

## What the data says about the XRP pattern

4h preset, all years: 432 trades, 156 stopped (36%). Of stopped trades the EMA3 tide reached >=20 before the stop in 12% and >=40 in 3% (for non-stopped trades: 85% / 58%); median best open profit of stopped trades +1.15%, share that were ever >= +1% in profit 54%
1h preset, all years: 260 trades, 92 stopped (35%). Of stopped trades the EMA3 tide reached >=20 before the stop in 4% and >=40 in 0% (for non-stopped trades: 59% / 30%); median best open profit of stopped trades +0.68%, share that were ever >= +1% in profit 40%

So the falling-knife shape (tide high, then collapses, then stop) is a small slice of the losers. A larger share of stopped trades (54% on 4h, 40% on 1h) were at least +1% in profit at some point before stopping, which is why profit-protection stops were tried; they hurt out of sample because they also cut the winners that retrace and then go on.

Repeated signals: 1h preset: all symbols 271 signals, 6 (2%) within 6 bars of the previous signal; XRP last 150d: 1 signals, 0 within 6 bars of the previous one | 4h preset: all symbols 451 signals, 25 (6%) within 6 bars of the previous signal; XRP last 150d: 3 signals, 0 within 6 bars of the previous one | 1h loose ema8 N3 <0: all symbols 2038 signals, 95 (5%) within 6 bars of the previous signal; XRP last 150d: 11 signals, 0 within 6 bars of the previous one | 4h loose ema8 N3 <0: all symbols 608 signals, 30 (5%) within 6 bars of the previous signal; XRP last 150d: 5 signals, 0 within 6 bars of the previous one. With the causal detector as in the repo, new Tide out signals within 6 bars of the previous one are rare (2-6%), and XRP produced only 1 (1h preset) or 3 (4h preset) signals in the last 150 days. The "entries fire candle after candle and both stop out" pattern could not be reproduced with the preset settings on the klines here; it presumably comes from different settings or the chart's non-causal display. Cooldown and re-arm are available if it recurs, but they do not improve results.

## Results: 4h (net of costs; OOS = 2024 to Nov 2026)

| candidate | IS n | IS avg % | OOS n | OOS win % | OOS avg %/trade | OOS PF | OOS max DD % | OOS stop-hit % | OOS avg % at 20bp+15bp stress | yearly avg % 2019 20 21 22 23 24 25 26 |
|---|---|---|---|---|---|---|---|---|---|---|
| preset (repo default) | 269 | -0.12 | 163 | 45 | +0.42 | 1.19 | -23 | 38 | +0.17 | -0.9 +1.3 +0.1 -0.4 -0.2 +1.6 -0.1 -0.4 |
| +TS34/16 (tide-EMA34 rising over 16 bars) | 88 | -0.88 | 56 | 45 | +0.91 | 1.44 | -12 | 34 | +0.66 | -0.6 +3.4 -3.7 -0.9 +0.0 +3.4 -0.4 -1.1 |
| +TS55/16 (tide-EMA55 rising over 16 bars) | 58 | -0.67 | 37 | 32 | -0.71 | 0.71 | -10 | 41 | -0.96 | -1.7 +2.0 -3.6 -0.2 +1.6 +0.8 -0.9 -1.8 |
| +TS89/16 (tide-EMA89 rising over 16 bars) | 32 | -1.64 | 24 | 29 | -0.39 | 0.84 | -7 | 42 | -0.64 | -1.6 +0.1 -8.3 -0.3 +1.1 +3.7 -0.6 -2.5 |
| +TS144/16 (tide-EMA144 rising over 16 bars) | 21 | -0.43 | 16 | 19 | -2.66 | 0.08 | -6 | 44 | -2.91 | -1.6 -0.6 +2.5 -1.0 -0.4 -2.6 -2.0 -3.1 |
| +TS55/8 (tide-EMA55 rising over 8 bars) | 54 | -0.74 | 39 | 46 | +2.01 | 2.19 | -7 | 26 | +1.77 | -3.8 +3.9 -0.1 -1.8 -1.4 +7.6 +1.3 -2.2 |
| +cooldown 6 bars | 252 | -0.08 | 149 | 45 | +0.59 | 1.27 | -22 | 38 | +0.34 | -0.7 +1.2 -0.0 -0.2 -0.5 +1.6 +0.1 -0.0 |
| +cooldown 24 bars | 224 | -0.18 | 136 | 43 | +0.30 | 1.13 | -23 | 40 | +0.05 | -1.3 +1.5 -0.2 -0.0 -0.9 +1.1 +0.0 -0.3 |
| +rearm0 (one entry per swing) | 230 | -0.08 | 146 | 44 | +0.30 | 1.13 | -23 | 38 | +0.05 | -1.0 +1.3 +0.2 -0.1 -0.8 +1.0 +0.1 -0.3 |
| +RSI+ only (Tide out +) | 131 | +0.05 | 47 | 53 | +1.64 | 1.89 | -7 | 30 | +1.40 | -1.5 +0.2 +1.2 -0.1 +1.2 +4.9 -0.8 -1.3 |
| +TP100/10 (block entry in price downtrend) | 40 | +1.29 | 24 | 58 | +0.97 | 1.37 | -7 | 21 | +0.74 | +1.6 +2.7 +2.1 -2.0 -1.1 -4.2 +4.4 +1.9 |
| +guards (peak after entry, hold 3) | 269 | -0.12 | 163 | 45 | +0.42 | 1.19 | -23 | 38 | +0.17 | -0.9 +1.3 +0.1 -0.4 -0.2 +1.6 -0.1 -0.4 |
| +Protect: at +1% stop->breakeven | 277 | +0.45 | 165 | 17 | -0.12 | 0.91 | -17 | 78 | -0.41 | +0.2 +1.0 +0.9 -0.0 +0.4 +0.1 -1.0 +0.7 |
| +Protect: at +2% stop->breakeven | 273 | +0.16 | 164 | 26 | +0.07 | 1.04 | -21 | 68 | -0.21 | -0.5 +1.3 +0.3 -0.1 +0.1 +0.6 -0.4 -0.0 |
| +Protect: at +3% stop->breakeven | 272 | +0.08 | 163 | 32 | +0.17 | 1.09 | -22 | 58 | -0.09 | -0.7 +1.2 +0.6 -0.2 -0.2 +1.2 -0.5 -0.2 |
| +Protect: at +1% stop->breakeven, trail 1.0% below high | 277 | +0.70 | 165 | 53 | -0.34 | 0.73 | -17 | 95 | -0.64 | -0.1 +0.6 +1.1 +1.0 +0.6 -0.4 -0.9 +0.4 |
| +Protect: at +2% stop->breakeven, trail 1.5% below high | 274 | +0.59 | 165 | 56 | -0.38 | 0.79 | -20 | 88 | -0.68 | -0.7 +1.2 +0.7 +1.1 +0.5 -0.4 -0.7 +0.1 |
| +Protect: at +3% stop->breakeven, trail 2.0% below high | 272 | +0.49 | 164 | 54 | -0.21 | 0.89 | -20 | 80 | -0.50 | -1.0 +1.0 +1.1 +1.0 +0.2 +0.1 -0.7 +0.1 |
| +Pull peak X20 Y25 n6 ps8 | 269 | -0.09 | 163 | 44 | +0.40 | 1.18 | -23 | 37 | +0.15 | -0.9 +1.3 +0.1 -0.3 -0.2 +1.6 -0.2 -0.4 |
| +Pull peak X20 Y35 n6 ps3 | 269 | -0.02 | 163 | 44 | +0.44 | 1.21 | -21 | 35 | +0.20 | -0.9 +1.5 +0.1 -0.2 -0.2 +1.5 -0.0 -0.3 |
| +Pull peak X40 Y35 n6 ps3 | 269 | -0.08 | 163 | 44 | +0.44 | 1.20 | -22 | 36 | +0.19 | -0.9 +1.3 +0.1 -0.3 -0.2 +1.6 -0.1 -0.3 |
| +Pull peak X30 Y20 n4 ps3 | 269 | -0.04 | 163 | 44 | +0.52 | 1.25 | -21 | 34 | +0.28 | -0.8 +1.3 +0.2 -0.4 -0.2 +1.6 -0.0 -0.1 |
| +Pull peak-be X40 Y35 n6 ps3 | 269 | -0.09 | 163 | 44 | +0.45 | 1.21 | -22 | 43 | +0.20 | -1.0 +1.3 +0.1 -0.3 -0.2 +1.6 -0.1 -0.3 |
| +Pull cross X30 <10 ps3 | 269 | -0.03 | 163 | 43 | +0.46 | 1.22 | -22 | 35 | +0.22 | -0.9 +1.3 +0.1 -0.1 -0.1 +1.7 -0.1 -0.3 |
| +Pull xema X40 3<13 | 269 | -0.13 | 163 | 44 | +0.37 | 1.17 | -22 | 36 | +0.12 | -0.8 +1.3 -0.1 -0.3 -0.3 +1.5 -0.2 -0.3 |
| +TS55/16 +Pull peak X20 Y25 n6 ps8 | 58 | -0.62 | 37 | 32 | -0.75 | 0.70 | -11 | 38 | -1.00 | -1.7 +2.0 -3.6 -0.0 +1.6 +0.7 -0.9 -1.8 |
| +TS89/16 +Pull peak X20 Y25 n6 ps8 | 32 | -1.55 | 24 | 29 | -0.40 | 0.84 | -7 | 42 | -0.66 | -1.6 +0.1 -8.3 -0.1 +1.1 +3.7 -0.6 -2.5 |
| ALT robust-IS: ema5 N21 <-40 atr1.5 / Tide in ema3 N8 min20 after1 | 137 | +1.96 | 111 | 47 | +0.13 | 1.07 | -17 | 8 | -0.09 | +2.9 +2.4 +2.3 +2.0 +0.7 +1.1 +0.3 -0.9 |
| ALT +cd24 +TS55/16 | 115 | +2.29 | 97 | 49 | +0.53 | 1.31 | -13 | 5 | +0.32 | +1.9 +2.4 +2.6 +2.8 +1.4 +1.1 +0.7 -0.1 |
| ALT +cd24 +TS55/16 +Pull peak X20 Y25 n6 ps8 | 116 | +2.50 | 98 | 47 | +0.55 | 1.32 | -12 | 4 | +0.33 | +2.5 +2.8 +3.0 +2.8 +1.4 +0.8 +0.9 +0.0 |
| ALT-neighbour ema3 N21 <-40 (+cd24 +TS55/16) | 124 | +2.16 | 108 | 46 | -0.00 | 1.00 | -17 | 10 | -0.22 | +1.3 +3.7 +1.8 +2.6 +0.8 +1.1 +0.4 -1.2 |
| ALT-neighbour ema8 N21 <-40 (+cd24 +TS55/16) | 95 | +0.98 | 70 | 54 | +0.56 | 1.29 | -13 | 6 | +0.34 | +0.2 -0.1 +1.2 +3.5 -0.1 +0.7 -0.2 +1.2 |
| ALT-neighbour ema5 N13 <-40 (+cd24 +TS55/16) | 108 | +1.17 | 94 | 54 | +1.64 | 1.90 | -14 | 11 | +1.42 | +1.0 -0.6 -1.1 +1.4 +5.0 +5.0 +3.7 -2.2 |
| ALT-neighbour ema5 N34 <-40 (+cd24 +TS55/16) | 91 | +0.17 | 54 | 54 | +1.20 | 2.09 | -6 | 4 | +0.99 | -1.7 +0.7 +5.3 -3.0 +0.6 +1.5 -0.2 +3.2 |
| ALT-neighbour ema5 N21 <-30 (+cd24 +TS55/16) | 148 | +1.63 | 131 | 47 | +0.03 | 1.01 | -22 | 9 | -0.19 | +1.6 +3.2 +0.9 +1.7 +0.8 +2.1 -0.1 -1.3 |
| ALT-neighbour ema5 N21 <-50 (+cd24 +TS55/16) | 65 | +2.24 | 43 | 60 | +2.13 | 2.81 | -4 | 2 | +1.92 | +1.9 -0.3 +4.2 +4.6 +0.8 +0.5 +2.8 +2.5 |

## Results: 1h

| candidate | IS n | IS avg % | OOS n | OOS win % | OOS avg %/trade | OOS PF | OOS max DD % | OOS stop-hit % | OOS avg % at 20bp+15bp stress | yearly avg % 2019 20 21 22 23 24 25 26 |
|---|---|---|---|---|---|---|---|---|---|---|
| preset (repo default) | 159 | +0.58 | 101 | 48 | +0.68 | 1.59 | -7 | 33 | +0.44 | +0.5 +1.3 +0.1 -0.3 +1.4 +0.8 +0.0 +1.4 |
| +TS34/16 (tide-EMA34 rising over 16 bars) | 93 | +0.13 | 74 | 47 | +0.42 | 1.35 | -6 | 32 | +0.18 | -0.6 +1.5 -1.0 -0.3 +1.4 +1.2 +0.1 +0.0 |
| +TS55/16 (tide-EMA55 rising over 16 bars) | 80 | -0.11 | 64 | 47 | +0.28 | 1.22 | -6 | 36 | +0.03 | -1.2 +1.5 -1.7 -0.2 +1.2 +1.0 -0.0 +0.0 |
| +TS89/16 (tide-EMA89 rising over 16 bars) | 48 | -0.67 | 41 | 46 | +0.32 | 1.26 | -4 | 37 | +0.07 | -1.9 -1.8 -0.5 +0.3 +0.2 +2.6 -0.0 -0.8 |
| +TS144/16 (tide-EMA144 rising over 16 bars) | 29 | +0.50 | 20 | 60 | +0.37 | 1.48 | -2 | 15 | +0.15 | -2.2 -1.8 +2.4 +1.6 +2.0 -0.1 +1.0 -0.6 |
| +TS55/8 (tide-EMA55 rising over 8 bars) | 131 | +0.28 | 90 | 46 | +0.63 | 1.53 | -7 | 33 | +0.39 | -0.5 +1.9 -1.1 -0.1 +1.4 +0.9 -0.1 +1.2 |
| +cooldown 6 bars | 156 | +0.59 | 100 | 48 | +0.69 | 1.60 | -7 | 32 | +0.45 | +0.5 +1.3 +0.1 -0.3 +1.4 +0.8 +0.1 +1.4 |
| +cooldown 24 bars | 145 | +0.79 | 94 | 46 | +0.45 | 1.38 | -8 | 33 | +0.21 | +0.7 +1.7 +0.3 -0.0 +1.4 +0.2 -0.1 +1.3 |
| +rearm0 (one entry per swing) | 142 | +0.75 | 92 | 46 | +0.44 | 1.37 | -8 | 34 | +0.20 | +0.7 +1.6 -0.1 +0.1 +1.4 +0.3 -0.2 +1.3 |
| +RSI+ only (Tide out +) | 89 | +1.38 | 38 | 37 | -0.51 | 0.68 | -6 | 47 | -0.77 | +1.1 +3.4 +1.2 +0.4 +1.9 -1.0 +0.3 -1.1 |
| +TP100/10 (block entry in price downtrend) | 24 | +0.41 | 9 | 67 | +2.67 | 6.02 | -1 | 0 | +2.46 | -1.0 -1.9 -0.1 +7.4 +0.8 +7.8 -0.3 +0.4 |
| +guards (peak after entry, hold 3) | 159 | +0.58 | 101 | 48 | +0.68 | 1.59 | -7 | 33 | +0.44 | +0.5 +1.3 +0.1 -0.3 +1.4 +0.8 +0.0 +1.4 |
| +Protect: at +1% stop->breakeven | 162 | +0.07 | 102 | 21 | +0.28 | 1.48 | -5 | 74 | -0.01 | -0.0 -1.0 +0.2 +0.1 +0.6 +0.6 -0.3 +0.6 |
| +Protect: at +2% stop->breakeven | 161 | +0.46 | 101 | 35 | +0.32 | 1.34 | -7 | 54 | +0.06 | -0.2 +1.2 +0.1 -0.0 +1.3 +0.3 -0.1 +0.9 |
| +Protect: at +3% stop->breakeven | 160 | +0.59 | 101 | 39 | +0.30 | 1.28 | -7 | 45 | +0.04 | -0.2 +1.5 +0.6 -0.1 +1.3 +0.2 -0.1 +0.9 |
| +Protect: at +1% stop->breakeven, trail 1.0% below high | 163 | +0.13 | 102 | 58 | +0.14 | 1.25 | -4 | 93 | -0.17 | +0.1 -0.7 +0.0 +0.3 +0.5 +0.2 -0.0 +0.2 |
| +Protect: at +2% stop->breakeven, trail 1.5% below high | 161 | +0.22 | 102 | 60 | +0.08 | 1.09 | -7 | 78 | -0.21 | -0.0 -0.9 +0.1 +0.3 +1.0 +0.1 +0.0 +0.2 |
| +Protect: at +3% stop->breakeven, trail 2.0% below high | 161 | +0.47 | 102 | 53 | +0.06 | 1.06 | -7 | 64 | -0.22 | +0.0 -0.1 +0.2 +0.4 +1.3 -0.0 -0.1 +0.3 |
| +Pull peak X20 Y25 n6 ps8 | 159 | +0.54 | 101 | 46 | +0.64 | 1.56 | -7 | 33 | +0.39 | +0.4 +1.3 +0.1 -0.3 +1.4 +0.6 +0.0 +1.4 |
| +Pull peak X20 Y35 n6 ps3 | 159 | +0.60 | 101 | 46 | +0.65 | 1.58 | -7 | 32 | +0.41 | +0.4 +1.4 +0.1 -0.3 +1.4 +0.7 +0.1 +1.3 |
| +Pull peak X40 Y35 n6 ps3 | 159 | +0.58 | 101 | 48 | +0.64 | 1.56 | -7 | 33 | +0.40 | +0.5 +1.3 +0.1 -0.3 +1.4 +0.7 +0.0 +1.4 |
| +Pull peak X30 Y20 n4 ps3 | 159 | +0.59 | 101 | 47 | +0.63 | 1.55 | -7 | 33 | +0.39 | +0.5 +1.3 +0.2 -0.4 +1.4 +0.6 +0.1 +1.3 |
| +Pull peak-be X40 Y35 n6 ps3 | 159 | +0.57 | 101 | 48 | +0.68 | 1.59 | -7 | 34 | +0.43 | +0.4 +1.3 +0.1 -0.3 +1.4 +0.8 +0.0 +1.4 |
| +Pull cross X30 <10 ps3 | 159 | +0.58 | 101 | 47 | +0.67 | 1.58 | -7 | 33 | +0.42 | +0.4 +1.3 +0.1 -0.3 +1.5 +0.6 +0.2 +1.3 |
| +Pull xema X40 3<13 | 159 | +0.48 | 101 | 48 | +0.63 | 1.55 | -7 | 33 | +0.39 | +0.4 +0.4 +0.2 -0.2 +1.4 +0.5 +0.1 +1.4 |
| +TS55/16 +Pull peak X20 Y25 n6 ps8 | 80 | -0.15 | 64 | 42 | +0.19 | 1.15 | -6 | 36 | -0.06 | -1.2 +1.5 -1.7 -0.2 +1.1 +0.7 -0.1 +0.0 |
| +TS89/16 +Pull peak X20 Y25 n6 ps8 | 48 | -0.70 | 41 | 41 | +0.21 | 1.17 | -4 | 37 | -0.04 | -1.9 -1.8 -0.6 +0.3 +0.1 +2.1 -0.0 -0.8 |
| ALT: ema21 N8 <-40 atr1.0 stop | 156 | +0.41 | 100 | 51 | +0.85 | 1.79 | -7 | 27 | +0.61 | +0.3 +1.1 -0.3 -0.6 +1.6 +1.0 +0.2 +1.4 |
| ALT: preset + 2% stop | 155 | +0.41 | 98 | 54 | +0.82 | 1.70 | -8 | 19 | +0.59 | +0.3 +0.8 -0.2 -0.7 +1.6 +0.6 +0.0 +1.9 |
| ALT: ema21 N8 <-40 + Tide-in ema8 N5 | 160 | +0.50 | 101 | 43 | +0.43 | 1.38 | -8 | 32 | +0.19 | +0.5 +0.8 +0.1 -0.2 +1.2 -0.0 +0.0 +1.3 |
| ALT: ema21 N8 <-40 + Tide-in ema8 N13 | 159 | +0.29 | 101 | 45 | +0.75 | 1.64 | -7 | 34 | +0.51 | +0.4 +0.6 +0.3 -0.7 +0.9 +0.5 +0.2 +1.7 |
| ALT: ema13 N8 <-40 | 234 | +0.22 | 155 | 46 | +0.48 | 1.39 | -11 | 38 | +0.23 | +0.4 +1.3 -0.7 -0.5 +0.7 +0.5 -0.1 +1.2 |
| ALT: ema34 N8 <-40 | 101 | +0.64 | 64 | 42 | -0.16 | 0.89 | -7 | 36 | -0.40 | +1.1 -0.7 +1.7 -1.3 +1.1 +0.7 -0.6 -0.2 |
| ALT: ema21 N5 <-40 | 132 | -0.00 | 114 | 45 | +0.71 | 1.66 | -8 | 43 | +0.46 | -0.0 +1.6 -1.0 -1.1 +0.5 +1.3 -0.4 +1.6 |
| ALT: ema21 N13 <-40 | 148 | +0.52 | 94 | 36 | +0.02 | 1.01 | -9 | 34 | -0.23 | +0.8 +0.9 +1.0 -1.1 +1.2 +0.0 -0.9 +0.8 |
| ALT: ema21 N8 <-30 | 339 | +0.42 | 223 | 46 | +0.24 | 1.20 | -16 | 37 | -0.01 | +1.0 +0.5 +0.9 -0.7 +0.6 +0.0 -0.1 +1.2 |
| ALT: ema21 N8 <-50 | 50 | +2.08 | 31 | 45 | -0.16 | 0.86 | -4 | 26 | -0.39 | +0.0 +4.2 +2.5 -0.2 +2.4 -1.7 +0.9 +0.1 |

Files with the per-symbol OOS breakdown: `results/recommend_by_symbol_*.csv`. Preset OOS positive in 4 of 8 symbols on 4h and 7 of 8 on 1h (XRP 1h preset: n11, +2.06% avg; XRP 4h: n19, +0.28%).

## Walk-forward and selection (why I do not recommend the grid winner)

Choosing the best-looking config on the years before Y and trading Y gave, stitched over 2024/25/26-YTD (`results/walkforward_*.csv`, `report_*.md`):

| pool | 4h OOS avg %/trade | 1h OOS avg %/trade |
|---|---|---|
| repo preset (fixed) | +0.42 (n163) | +0.68 (n101) |
| best of exit grid | -0.07 | -0.55 |
| plus entry filters | -0.01 | +0.09 |
| plus Pull | -0.02 | +0.06 |
| alternative entry families | +0.07 (n984) | -0.26 |

The fixed preset beat every selected pool. The grid finds many in-sample "t = 3-5" configs that do not survive; with about 205k trials that is expected.

## Caveats

* Spot klines, not perpetual futures (funding, mark-price stops and liquidity differ). Open interest history is not available, so the distribution tell is approximated from price, score and tape (no OI); it had no measurable effect.
* The grid tested EMA lengths above the app's current clamp of 34 (up to 89 on entries, 144 on trend EMAs); adopting any of them needs a settings-range change.
* Results are pooled over 8 symbols with different histories; the OOS window is one regime (2024 to Nov 2026), about 100-160 trades per candidate, so differences under about 0.3% per trade are noise. The OOS window was used to judge only; but the same OOS window was seen across many reports, so treat any positive OOS as lightly optimistic.
* Costs are modelled, not measured; the cost-stress tables show the sign of the preset survives 20 bp per side plus 15 bp stop slippage on both timeframes.
* The repo preset reaches OOS PF 1.19 (4h) / 1.59 (1h) here with the cost model above; any other number from earlier repo research used its own cost model, symbol set and window, so do not compare them directly.
* Stage-3/4 top lists contain near-duplicate rows because cooldown and re-arm are often no-ops.
* XRP score parity: 0.07% of bars differ by a rolling-percentile tie-break; the detector fixtures are exact.
* Brain was unreachable (tailscale 502) for a short time at the start of the run; the run was repeated cleanly afterwards.

## Reproduce

```
python3 fetch_klines.py            # ~16 npz files into data/ (gitignored)
python3 test_parity.py && python3 test_engine_vs_sim.py
./run_all.sh 4h; ./run_all.sh 1h   # stages 1-6, about 10 min on 10 workers (nice 19)
python3 analyze.py --tf 4h; python3 analyze.py --tf 1h
python3 recommend.py --tf 4h; python3 recommend.py --tf 1h
python3 knife_stats.py; python3 signal_clusters.py
```
Requires python3 and numpy only. Full grid logs: `results/<tf>_stage<k>.csv.gz`; reports: `results/report_<tf>.md`.
