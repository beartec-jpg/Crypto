# Tether Divergence — token-divergence ladder + settings sweep (backtest)

Indicator under test: `client/src/lib/indicators/tetherDivergence.ts` (Tether Divergence score, **not** Tide Zone). Python port verified against the repo TypeScript `computeTetherDivergence` (max |diff| 1e-13, `parity.py`).
Full tables: `results/tables.md`. Raw results: `results/part1_*.json`, `results/part2_*.json`. Everything is reproducible with the scripts in this folder.

## TL;DR

1. **Raw Bottom (score ≥ 80 cross) is not a statistically distinguishable edge** on 8 majors, 2019–2026: mean excess fwd-30d return −1.2% (tune 2019–23, n=130, 25 independent clusters) / −1.7% (OOS 2024–26, n=74, 13 clusters), 95% CI spans ±6–7% either side of zero. 56% / 62% of Bottoms see a ≥10% lower low within 30 days (all-days baseline 60% / 57%). It is **early**: the median Bottom is 21–23% above the eventual swing low and the low is a median 12 d (tune) / 6 d (OOS) ahead.
2. **The token-divergence ladder does not robustly filter misfires or improve timing in this sample.** Only 16% (tune) / 31% (OOS) of Bottom zones ever print a daily Coin-RSI bullish divergence; x1 arrives a median 17–26 days after the Bottom; at the confirmation bar the mean excess 30d return is −0.3% (tune, n=14) / −3.0% (OOS, n=16) with CIs of ±8–12%. Across the 96-config grid, the Coin-RSI-divergence x1 is positive in 75% of configs in tune but only 17% in OOS (median +2.6% → −4.9%). x2 shows a strong OOS (n=5, 3 clusters, +6.4%, 80% good calls) but had 1 event in tune and x3 has 1 event ever — **too few to claim anything**.
3. **A weak hint, flagged as a hypothesis not a result:** with the TD *score* itself as the oscillator (instead of Coin RSI), k=5, tight zones (N 20–40 d, new-low expiry 10–20%), x1 was positive in both periods (tune +3–9%, OOS +3–5%, misfire 27–46% in tune but 33–70% in OOS, vs 56–62% raw) but with n=3–14 per period out of 96 configs tried. Needs forward/out-of-sample monitoring before it is shipped as a claim.
4. **Settings: 10 of 13 parameters are flat. Ship a fixed indicator.** What moves results is almost only the Bottom/Top *threshold* and the coin-side knobs (`coinRsiLen`, `wCoin`/`wStretch`), and those mostly change *how often* it fires, not call quality. No setting combination reliably improves quality out of sample (tune-best 1% of configs: 17.5% tune → 5.7% OOS on 1D, 6.7–10.8% → −3.0–1.5% on 1W; rank-corr tune→OOS 0.06–0.33 on 1D, −0.14–0.06 on 1W).
5. **The "Top" side is wrong-signed.** After topScore ≥ 80 crosses, coins go *up* on average (excess fwd-30d +8.2% tune / +9.8% OOS 1D; +13% / +20% 1W); 78% / 67% (1D) rise ≥10% within 30 days. This holds across settings (median LHS config is negative at every setting; tune-best Top configs become −14 to −16% OOS). It behaves as a momentum / stretched-overbought read, not a top call. I'd not market it as a Top.

## Recommendation

- **Ladder:** don't present "Bottom → div → x2 → x3" as a confirmation/filter with performance claims. If you want it for chart reading, ship it as an *annotation* (Bottom marker, then "Div" markers numbered x1/x2/x3) using Coin RSI-14 daily, pivot k=5, zone N=40d or new low >20% — it reproduces your XRP examples (Bottom 2026-01-31, zone ended 2026-02-05 with no div = the false alarm; Bottom 2026-06-02, div 2026-07-01 = the "bottoming zone") — but treat it as descriptive. Revisit with the score-oscillator variant after more history.
- **Fixed values (both 1D and 1W; no data justify separate 1W values, see caveats):** usdtRsiLen 14, emaLen 20, bbLen 20, bbMult 2.0, emaDistFullPct 4, wRsi/wEma/wBb 1/1/1, coinRsiLen 14, wStretch 1, wCoin 1, Bottom 80, Watch 60, Top 80 (= current code defaults). RSI 20 / EMA 19 (the figures in the brief) are statistically the same as 14/20 (EMA 19 vs 20 is identical in every event; RSI 20: −1.2%/−1.7% → +0.5%/−2.0%, noise).
- **Minimal editable set: zero is justified.** If one dial is wanted, expose only **Bottom threshold** (75–85; it trades frequency for selectivity: ≥85 gives n=29/18 events at +8.2%/+0.5%, ≥90 is ~1–4 events). Hide the other 12 (USDT.D RSI/EMA/BB lengths, BB mult, EMA distance, the three component weights, Coin RSI length, wStretch/wCoin, Watch, Top).
- Consider renaming/removing the Top marker or relabelling it "Stretched", given it points the wrong way.

## Method (short)

- **Indicator:** exact port (score = clamp((wS·stretch + wC·(100−CoinRSI))/(wS+wC)), stretch = weighted RSI / EMA-dist / %B of USDT.D; topScore = 100−score; Bottom = cross up through 80).
- **USDT.D history:** production USDT.D is a CoinGecko 365-day basket, far too short. I rebuilt 2018→2026 from Coin Metrics community market caps (keyless), a basket proxy, `wide` (~45 assets) and `narrow` (btc+eth+usdt+usdc). Validated against the production endpoint over its 365 days: RSI14 corr 0.995, diff corr 0.979 (`build_usdtd.py`). All results are re-run on `narrow` as a robustness check and agree (see `results/tables.md`).
- **Assets:** BTC, ETH, XRP, SOL, BNB, DOGE, ADA, LINK Binance spot, daily bars from 1h klines (full 24-bar UTC days; ~20 holes per asset forward-filled). 1W bars resampled from daily (Mon–Sun UTC, complete weeks).
- **Periods:** tune 2019-01-01→2023-12-31; OOS 2024-01-01→2026-11. Forward windows overlap the boundary slightly.
- **Metrics:** excess log fwd return vs each asset's all-days mean in the same period (7/14/30/60 d; 1W uses 1/2/4/8 bars); MAE (lowest low in next 30/60 d); misfire = MAE30 ≤ −10%; good call = fwd30 > 0 and MAE30 > −10%; timing = lowest low in [t−30, t+60]: days to low and premium of entry over it. Events are clustered (within 10 d of each other across assets) and CIs are calendar-month cluster bootstraps.
- **Ladder:** divergence = strict price pivot lows over ±k (confirmed at pivot+k) with price lower low and oscillator higher low (pivots ≤60 bars apart). Oscillators: Coin RSI-14 (headline) and the TD score (100−score, so "higher low" = score lower high). k ∈ {3,5,8}; a Bottom opens a zone if none is active; zone ends at N ∈ {10,20,40,60} d or a new low beyond X ∈ {5,10,20,none}%. Divergences confirmed in the zone are x1, x2, x3. Control: divergences outside any zone. Headline config (pre-declared before running): Coin RSI, k=5, N=40, X=20%.
- **Sweep:** one-at-a-time (all 13 settings, 5–8 levels each), 3^9 full factorial (19,683 configs) and a 20,000-point Latin hypercube across all 13 settings, per timeframe, both proxies. Sensitivity = ANOVA η² of call quality (Bottom: mean excess fwd30; Top: −mean excess fwd30) by parameter; minimum events (1D: 15 tune / 5 OOS; 1W: 6 / 3) for a config to count. Tune→OOS persistence by rank correlation and by the OOS performance of the tune-top 1%.

## Part 1 results (wide proxy; narrow is within noise of these)

Headline config, 1D, fwd 30d (full tables incl. 7/14/60 d, MAE, timing in `results/tables.md`):

| set | period | n (clusters) | exc30 | misfire | good | med days→swing low | entry premium over low |
|---|---|---|---|---|---|---|---|
| all days | tune / OOS | 13,337 / 8,064 | 0 | 60% / 57% | – | – | – |
| raw Bottom | tune | 130 (25) | −1.2% | 56% | 35% | 12 | 21% |
| raw Bottom | OOS | 74 (13) | −1.7% | 62% | 30% | 6 | 24% |
| Bottom whose zone ended with NO div | tune / OOS | 71 (19) / 36 (11) | −2.0% / −2.8% | 62% / 67% | 28% / 31% | 6 / 5 | 29% / 29% |
| Bottom whose zone later got a div (look-ahead, not tradable) | tune / OOS | 14 (10) / 16 (9) | −4.9% / +1.2% | 50% / 69% | 29% / 13% | 26 / 28 | 19% / 20% |
| **x1** (at the div confirm bar) | tune | 14 (13) | −0.3% | 57% | 36% | 2 | 28% |
| **x1** | OOS | 16 (8) | −3.0% | 50% | 50% | 26 | 26% |
| x2 | tune / OOS | 1 / 5 (3) | −20.8% / +6.4% | 100% / 20% | 0% / 80% | 34 / −5 | 31% / 11% |
| x3 | tune / OOS | 0 / 1 | – / +26.1% | – | – | – / −5 | – / 2% |
| div outside any zone (control) | tune / OOS | 67 (34) / 30 (20) | +1.0% / −3.5% | – | – | 7 / 22 | 24% / 30% |

Bootstrap 95% CI of exc30: raw Bottom tune [−7.6, +5.7]%, OOS [−5.8, +4.2]%; x1 tune [−8.8, +7.6]%, OOS [−13.1, +10.7]%.

- *Does it cut false alarms?* The majority of Bottoms (84% tune / 69% OOS of zones) never print a div and their misfire rate (62% / 67%) is the same as or worse than the raw Bottom (56% / 62%) and the all-days baseline. Bottoms that later do print a div are not clearly better (50% / 69%). So "no div" is not a usable misfire discriminator here.
- *Does it improve timing?* x1 lands at the swing low in tune (low a median 2 d ahead, 50% of the time already behind) but in OOS the low is still a median 26 d ahead. Inconsistent.
- Across the 96 grid configs the x1 outcome is a function of k/N/X, with tune and OOS frequently disagreeing (full grid in `results/tables.md`).

## Part 2 results

η² of call quality by parameter (LHS 20k, 1D; higher = matters more; <0.01 = flat). Event-count column shows what the parameter does to *frequency*:

| param | Bottom Q tune | Bottom Q OOS | Top Q tune | Top Q OOS | #Bottom events | #Top events |
|---|---|---|---|---|---|---|
| bottomThreshold | **0.210** | **0.161** | 0.000 | 0.000 | **0.623** | 0.000 |
| topThreshold | 0.001 | 0.000 | **0.099** | **0.588** | 0.000 | **0.682** |
| wCoin | 0.005 | 0.003 | 0.018 | 0.022 | 0.059 | 0.031 |
| coinRsiLen | 0.002 | 0.007 | 0.006 | 0.007 | 0.033 | 0.036 |
| wStretch | 0.006 | 0.002 | 0.021 | 0.021 | 0.031 | 0.019 |
| wRsi | 0.007 | 0.001 | 0.001 | 0.007 | 0.019 | 0.029 |
| usdtRsiLen, emaLen, bbLen, bbMult, emaDistFullPct, wEma, wBb | ≤0.007 | ≤0.003 | ≤0.005 | ≤0.013 | ≤0.007 | ≤0.007 |

The 3^9 factorial gives the same ranking (bottomThreshold, coinRsiLen, wCoin on top; in the factorial `coinRsiLen` η² is 0.12 / 0.07 for Bottom, but it works by changing event frequency: Coin RSI 7→21 changes events 314→72 with no consistent quality gain). On 1W the pattern is the same, with even less data: 13/11 default Bottom events (2/2 clusters), 30/15 Top events; Bottom/Top thresholds dominate and everything else is noise.

Selection effect (why not "pick the best"): tune-best 1% of 20k LHS configs score +17.5% (Bottom) in tune but +5.7% OOS (all-config median −2.1% / −1.4%); factorial tune-best +10.5% → +2.2%. Share of configs with positive tune quality that stay positive OOS: 17–38% (Bottom, 1D), 0–8% (Top). For Top the tune-best configs lose 14–16% OOS.

Per-timeframe verdict:
- **1D:** fixed defaults. Only Bottom threshold is a meaningful dial (and only for frequency).
- **1W:** no evidence for different values than 1D; only 11–13 Bottom events (2–4 clusters) per period even on the long proxy, and production only has ~52 weekly bars. Fixed defaults, and I would not make claims about 1W call quality.

## Caveats (be honest)

- 8 highly correlated majors → effective independent samples ≈ the "clusters" figures (13–25 Bottom clusters, 8–10 for x1). Most differences quoted above are inside the bootstrap CIs.
- The USDT.D proxy is a market-cap basket proxy (coverage drift: no native BNB after 2019-04, no SOL/TRX/TON); validated at 0.995 RSI correlation to production but not identical. `narrow` basket reproduces the conclusions.
- Tune/OOS are single splits with slightly overlapping forward windows; OOS 2024–26 is one regime.
- 96 + 40k configs were evaluated; the score-oscillator "hint" is a post-hoc subset.
- The XRP examples come from reading your screenshots, not from a full chart replay.
- Holes (~20 days/asset, mostly Binance gaps) are forward-filled.

## Files

`fetch_usdtd.py`, `build_usdtd.py` (USDT.D proxy), `tdlib.py` (indicator port + analysis library), `parity.py` (TS parity), `part1.py` (ladder), `part2.py` (sweep), `make_tables.py`, `results/`.
