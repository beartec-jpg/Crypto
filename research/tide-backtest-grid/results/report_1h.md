# Tide Zone grid analysis — 1h

Configs evaluated: stage 1: 2352, stage 2: 62708, stage 3: 105600, stage 4: 25950, stage 5: 2079, stage 5b: 240, stage 6: 6600 (total 205529).

## Repo preset baseline (1h)
`TideOut ema21 N8 <-40 | stop pct0.005 | TideIn ema8 N8 min0 after0 hold0`

IS n159 wr47% avg+0.58% pf1.39 t1.1 rs+0.26 || OOS n101 wr48% avg+0.68% pf1.59 tot+8% dd-7% stop33%

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — all stages
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 then <0 ema3] | IS n160 wr49% avg+1.53% pf2.00 t1.9 rs+1.07 || OOS n86 wr42% avg-0.18% pf0.88 tot-2% dd-9% stop21% |
| 2 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 then <0 ema3] | IS n160 wr49% avg+1.53% pf2.00 t1.9 rs+1.07 || OOS n85 wr41% avg-0.26% pf0.84 tot-3% dd-10% stop21% |
| 3 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=20 then <10 ema8] | IS n160 wr49% avg+1.51% pf1.98 t1.8 rs+1.03 || OOS n86 wr42% avg-0.16% pf0.90 tot-2% dd-9% stop21% |
| 4 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=20 then <10 ema8] | IS n160 wr49% avg+1.51% pf1.98 t1.8 rs+1.03 || OOS n85 wr41% avg-0.24% pf0.85 tot-3% dd-10% stop21% |
| 5 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=10 drop>=30/6b ema3] | IS n160 wr49% avg+1.54% pf2.07 t1.9 rs+1.02 || OOS n86 wr44% avg-0.15% pf0.90 tot-2% dd-9% stop20% |
| 6 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=10 drop>=30/6b ema3] | IS n160 wr49% avg+1.54% pf2.07 t1.9 rs+1.02 || OOS n85 wr44% avg-0.23% pf0.85 tot-3% dd-9% stop20% |
| 7 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 drop>=40/8b ema1] | IS n160 wr50% avg+1.51% pf2.01 t1.8 rs+1.02 || OOS n86 wr44% avg-0.19% pf0.88 tot-3% dd-9% stop20% |
| 8 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 drop>=40/8b ema1] | IS n160 wr50% avg+1.51% pf2.01 t1.8 rs+1.02 || OOS n85 wr44% avg-0.27% pf0.83 tot-3% dd-9% stop20% |
| 9 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 then <10 ema3] | IS n160 wr49% avg+1.52% pf1.99 t1.8 rs+1.02 || OOS n86 wr43% avg-0.15% pf0.90 tot-2% dd-9% stop20% |
| 10 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 then <10 ema3] | IS n160 wr49% avg+1.52% pf1.99 t1.8 rs+1.02 || OOS n85 wr42% avg-0.23% pf0.85 tot-3% dd-9% stop20% |
| 11 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 drop>=25/6b ema1] | IS n160 wr51% avg+1.52% pf2.06 t1.9 rs+1.02 || OOS n86 wr43% avg-0.07% pf0.95 tot-1% dd-9% stop20% |
| 12 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 drop>=25/6b ema1] | IS n160 wr51% avg+1.52% pf2.06 t1.9 rs+1.02 || OOS n85 wr42% avg-0.15% pf0.90 tot-2% dd-9% stop20% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 1 (entry+stop, preset exit)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema89 N8 <0 | stop atr1.5 | TideIn ema8 N8 min0 after0 hold0 | IS n456 wr48% avg+0.63% pf1.53 t2.7 rs+0.53 || OOS n293 wr50% avg-0.06% pf0.95 tot-4% dd-17% stop19% |
| 2 | TideOut ema89 N8 <-10 | stop atr1.5 | TideIn ema8 N8 min0 after0 hold0 | IS n273 wr52% avg+0.70% pf1.49 t2.0 rs+0.49 || OOS n193 wr51% avg-0.14% pf0.91 tot-5% dd-15% stop23% |
| 3 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema8 N8 min0 after0 hold0 | IS n187 wr50% avg+0.71% pf1.44 t1.4 rs+0.48 || OOS n103 wr47% avg-0.30% pf0.82 tot-4% dd-14% stop36% |
| 4 | TideOut ema89 N8 <0 | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | IS n457 wr48% avg+0.56% pf1.46 t2.4 rs+0.45 || OOS n292 wr51% avg+0.01% pf1.01 tot-1% dd-17% stop16% |
| 5 | TideOut ema89 N5 <-20 | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | IS n186 wr50% avg+0.78% pf1.50 t1.6 rs+0.45 || OOS n103 wr50% avg-0.14% pf0.91 tot-2% dd-12% stop32% |
| 6 | TideOut ema5 N8 <-50 | stop pct0.005 | TideIn ema8 N8 min0 after0 hold0 | IS n198 wr48% avg+0.68% pf1.45 t1.6 rs+0.42 || OOS n124 wr40% avg-0.14% pf0.88 tot-2% dd-11% stop40% |
| 7 | TideOut ema89 N8 <0 | stop atr1.0 | TideIn ema8 N8 min0 after0 hold0 | IS n461 wr46% avg+0.51% pf1.43 t2.2 rs+0.40 || OOS n296 wr48% avg-0.04% pf0.96 tot-3% dd-16% stop23% |
| 8 | TideOut ema5 N8 <-50 | stop atr0.5 | TideIn ema8 N8 min0 after0 hold0 | IS n198 wr48% avg+0.68% pf1.44 t1.6 rs+0.40 || OOS n124 wr37% avg-0.24% pf0.80 tot-4% dd-11% stop44% |
| 9 | TideOut ema89 N5 <-20 | stop pct0.01 | TideIn ema8 N8 min0 after0 hold0 | IS n188 wr47% avg+0.69% pf1.47 t1.5 rs+0.40 || OOS n107 wr43% avg-0.19% pf0.88 tot-3% dd-13% stop41% |
| 10 | TideOut ema55 N8 <0 | stop atr1.5 | TideIn ema8 N8 min0 after0 hold0 | IS n540 wr49% avg+0.47% pf1.35 t2.3 rs+0.39 || OOS n340 wr49% avg-0.02% pf0.98 tot+0% dd-20% stop18% |
| 11 | TideOut ema89 N8 <0 | stop pct0.01 | TideIn ema8 N8 min0 after0 hold0 | IS n464 wr46% avg+0.46% pf1.38 t2.0 rs+0.39 || OOS n299 wr48% avg-0.08% pf0.94 tot-4% dd-18% stop23% |
| 12 | TideOut ema89 N8 <0 | stop atr0.5 | TideIn ema8 N8 min0 after0 hold0 | IS n468 wr45% avg+0.50% pf1.43 t2.3 rs+0.38 || OOS n300 wr46% avg-0.07% pf0.94 tot-4% dd-17% stop27% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 2 (exit grid)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | IS n186 wr49% avg+1.25% pf1.78 t1.7 rs+0.84 || OOS n106 wr41% avg-0.24% pf0.86 tot-4% dd-12% stop29% |
| 2 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold6 | IS n186 wr49% avg+1.25% pf1.78 t1.7 rs+0.84 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 3 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold12 | IS n186 wr49% avg+1.23% pf1.76 t1.7 rs+0.82 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 4 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after1 hold0 | IS n186 wr49% avg+1.23% pf1.76 t1.7 rs+0.82 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 5 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after1 hold3 | IS n186 wr49% avg+1.23% pf1.76 t1.7 rs+0.82 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 6 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after1 hold6 | IS n186 wr49% avg+1.23% pf1.76 t1.7 rs+0.82 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 7 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after1 hold12 | IS n186 wr49% avg+1.23% pf1.76 t1.7 rs+0.82 || OOS n106 wr41% avg-0.26% pf0.85 tot-4% dd-12% stop29% |
| 8 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold0 | IS n186 wr48% avg+1.25% pf1.79 t1.7 rs+0.82 || OOS n106 wr42% avg-0.21% pf0.87 tot-3% dd-12% stop28% |
| 9 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | IS n191 wr49% avg+1.20% pf1.84 t1.7 rs+0.79 || OOS n128 wr45% avg+0.06% pf1.04 tot+1% dd-13% stop21% |
| 10 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | IS n187 wr50% avg+1.07% pf1.58 t1.4 rs+0.79 || OOS n123 wr53% avg+0.07% pf1.04 tot+0% dd-13% stop31% |
| 11 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema13 N13 min-20 after0 hold6 | IS n186 wr50% avg+1.16% pf1.75 t1.6 rs+0.79 || OOS n107 wr36% avg-0.27% pf0.84 tot-4% dd-12% stop28% |
| 12 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 min-20 after0 hold0 | IS n190 wr49% avg+1.15% pf1.77 t1.6 rs+0.78 || OOS n127 wr46% avg-0.07% pf0.95 tot-1% dd-14% stop20% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 3 (entry filters)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | rearm20 | IS n166 wr50% avg+1.51% pf2.20 t1.9 rs+0.93 || OOS n106 wr42% avg-0.17% pf0.89 tot-2% dd-13% stop21% |
| 2 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | cd3,rearm20 | IS n166 wr50% avg+1.51% pf2.20 t1.9 rs+0.93 || OOS n106 wr42% avg-0.17% pf0.89 tot-2% dd-13% stop21% |
| 3 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | cd6,rearm20 | IS n166 wr50% avg+1.51% pf2.20 t1.9 rs+0.93 || OOS n106 wr42% avg-0.17% pf0.89 tot-2% dd-13% stop21% |
| 4 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | cd12,rearm20 | IS n166 wr50% avg+1.51% pf2.20 t1.9 rs+0.93 || OOS n106 wr42% avg-0.17% pf0.89 tot-2% dd-13% stop21% |
| 5 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema13 N13 minNone after0 hold12 | cd24,rearm20 | IS n166 wr50% avg+1.51% pf2.20 t1.9 rs+0.93 || OOS n106 wr42% avg-0.17% pf0.89 tot-2% dd-13% stop21% |
| 6 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | rearm20 | IS n166 wr52% avg+1.29% pf1.74 t1.6 rs+0.92 || OOS n106 wr51% avg-0.24% pf0.86 tot-3% dd-15% stop32% |
| 7 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | cd3,rearm20 | IS n166 wr52% avg+1.29% pf1.74 t1.6 rs+0.92 || OOS n106 wr51% avg-0.24% pf0.86 tot-3% dd-15% stop32% |
| 8 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | cd6,rearm20 | IS n166 wr52% avg+1.29% pf1.74 t1.6 rs+0.92 || OOS n106 wr51% avg-0.24% pf0.86 tot-3% dd-15% stop32% |
| 9 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | cd12,rearm20 | IS n166 wr52% avg+1.29% pf1.74 t1.6 rs+0.92 || OOS n105 wr51% avg-0.22% pf0.87 tot-3% dd-14% stop32% |
| 10 | TideOut ema89 N8 <-20 | stop atr1.5 | TideIn ema5 N13 min20 after0 hold0 | cd24,rearm20 | IS n166 wr52% avg+1.29% pf1.74 t1.6 rs+0.92 || OOS n105 wr51% avg-0.22% pf0.87 tot-3% dd-14% stop32% |
| 11 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | IS n160 wr49% avg+1.36% pf1.82 t1.6 rs+0.91 || OOS n86 wr42% avg-0.00% pf1.00 tot-1% dd-9% stop22% |
| 12 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | IS n160 wr49% avg+1.36% pf1.82 t1.6 rs+0.91 || OOS n85 wr41% avg-0.08% pf0.95 tot-1% dd-10% stop22% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 4 (Pull)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 then <0 ema3] | IS n160 wr49% avg+1.53% pf2.00 t1.9 rs+1.07 || OOS n86 wr42% avg-0.18% pf0.88 tot-2% dd-9% stop21% |
| 2 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 then <0 ema3] | IS n160 wr49% avg+1.53% pf2.00 t1.9 rs+1.07 || OOS n85 wr41% avg-0.26% pf0.84 tot-3% dd-10% stop21% |
| 3 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=20 then <10 ema8] | IS n160 wr49% avg+1.51% pf1.98 t1.8 rs+1.03 || OOS n86 wr42% avg-0.16% pf0.90 tot-2% dd-9% stop21% |
| 4 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=20 then <10 ema8] | IS n160 wr49% avg+1.51% pf1.98 t1.8 rs+1.03 || OOS n85 wr41% avg-0.24% pf0.85 tot-3% dd-10% stop21% |
| 5 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=10 drop>=30/6b ema3] | IS n160 wr49% avg+1.54% pf2.07 t1.9 rs+1.02 || OOS n86 wr44% avg-0.15% pf0.90 tot-2% dd-9% stop20% |
| 6 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=10 drop>=30/6b ema3] | IS n160 wr49% avg+1.54% pf2.07 t1.9 rs+1.02 || OOS n85 wr44% avg-0.23% pf0.85 tot-3% dd-9% stop20% |
| 7 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 drop>=40/8b ema1] | IS n160 wr50% avg+1.51% pf2.01 t1.8 rs+1.02 || OOS n86 wr44% avg-0.19% pf0.88 tot-3% dd-9% stop20% |
| 8 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 drop>=40/8b ema1] | IS n160 wr50% avg+1.51% pf2.01 t1.8 rs+1.02 || OOS n85 wr44% avg-0.27% pf0.83 tot-3% dd-9% stop20% |
| 9 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 then <10 ema3] | IS n160 wr49% avg+1.52% pf1.99 t1.8 rs+1.02 || OOS n86 wr43% avg-0.15% pf0.90 tot-2% dd-9% stop20% |
| 10 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 then <10 ema3] | IS n160 wr49% avg+1.52% pf1.99 t1.8 rs+1.02 || OOS n85 wr42% avg-0.23% pf0.85 tot-3% dd-9% stop20% |
| 11 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 drop>=25/6b ema1] | IS n160 wr51% avg+1.52% pf2.06 t1.9 rs+1.02 || OOS n86 wr43% avg-0.07% pf0.95 tot-1% dd-9% stop20% |
| 12 | TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | cd3,TS144/3 | Pull[exit peak>=30 drop>=25/6b ema1] | IS n160 wr51% avg+1.52% pf2.06 t1.9 rs+1.02 || OOS n85 wr42% avg-0.15% pf0.90 tot-2% dd-9% stop20% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 5/5b (alt entries)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=20 drop>=35/8b ema3] | IS n337 wr53% avg+1.05% pf1.67 t3.0 rs+0.76 || OOS n183 wr45% avg-0.35% pf0.79 tot-8% dd-21% stop34% |
| 2 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=40 drop>=35/8b ema3] | IS n337 wr53% avg+1.05% pf1.67 t3.0 rs+0.76 || OOS n183 wr45% avg-0.35% pf0.79 tot-8% dd-21% stop34% |
| 3 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=40 drop>=20/4b ema3] | IS n337 wr53% avg+1.05% pf1.67 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 4 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=40 drop>=35/4b ema3] | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 5 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 6 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=50 then <-10 ema5] | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 7 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=50 then <0 ema5] | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 8 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=50 then <10 ema5] | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr45% avg-0.33% pf0.80 tot-8% dd-21% stop34% |
| 9 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[be peak>=40 drop>=20/6b ema3] | IS n337 wr52% avg+1.04% pf1.66 t3.0 rs+0.76 || OOS n183 wr44% avg-0.35% pf0.80 tot-8% dd-21% stop36% |
| 10 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=20 drop>=35/4b ema3] | IS n337 wr53% avg+1.03% pf1.66 t3.0 rs+0.75 || OOS n183 wr44% avg-0.35% pf0.79 tot-8% dd-21% stop34% |
| 11 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=30 then <0 ema5] | IS n337 wr53% avg+1.03% pf1.65 t3.0 rs+0.75 || OOS n183 wr44% avg-0.35% pf0.79 tot-8% dd-21% stop34% |
| 12 | cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[be peak>=40 drop>=35/6b ema3] | IS n337 wr53% avg+1.04% pf1.66 t3.0 rs+0.75 || OOS n183 wr44% avg-0.34% pf0.80 tot-8% dd-21% stop36% |

## Entry EMA/pivot plateau (avg over below-score and stops; stage 1)
| EMA | N | cfgs | IS avg % | OOS avg % | OOS PF | OOS n |
|---|---|---|---|---|---|---|
| 89 | 5 | 24 | 0.81 | -0.15 | 0.90 | 155 |
| 89 | 8 | 24 | 0.61 | -0.06 | 0.96 | 168 |
| 89 | 4 | 22 | 0.49 | -0.54 | 0.69 | 157 |
| 55 | 8 | 24 | 0.48 | -0.06 | 0.95 | 211 |
| 34 | 8 | 30 | 0.44 | 0.10 | 1.09 | 238 |
| 21 | 8 | 30 | 0.38 | 0.32 | 1.26 | 317 |
| 55 | 5 | 24 | 0.30 | -0.34 | 0.78 | 214 |
| 89 | 13 | 24 | 0.27 | -0.42 | 0.71 | 144 |

## Paired feature effects (random-bases): variant minus its own base, OOS (2024+)
| effect | pairs | bases | dIS avg% | dOOS avg% | % pairs OOS better | t (across bases) | dOOS tot% | dOOS maxDD pp | dOOS stop-rate pp | trades x |
|---|---|---|---|---|---|---|---|---|---|---|
| pull cross/exit | 900 | 150 | -0.003 | -0.003 | 26 | -8.7 | -0.1 | -0.0 | -0.0 | 1.00 |
| pull peak/be | 300 | 150 | -0.008 | -0.012 | 11 | -11.1 | -0.5 | -0.1 | +3.2 | 1.00 |
| pull peak/exit | 1800 | 150 | -0.038 | -0.029 | 18 | -13.4 | -1.0 | -0.1 | -0.4 | 1.00 |
| pull xema/exit | 600 | 150 | -0.086 | -0.035 | 25 | -10.1 | -1.3 | -0.1 | -0.3 | 1.00 |
| pull ANY | 3600 | 150 | -0.034 | -0.022 | 20 | -13.1 | -0.8 | -0.1 | +0.0 | 1.00 |
| trend TP100/10 | 150 | 150 | +0.306 | +0.475 | 74 | +7.2 | +6.1 | +16.0 | -20.7 | 0.17 |
| trend TP100/20 | 150 | 150 | +0.314 | +0.432 | 72 | +6.9 | +5.8 | +15.8 | -20.0 | 0.18 |
| trend TP200/10 | 150 | 150 | +0.466 | +0.309 | 69 | +6.2 | +5.4 | +16.0 | -13.7 | 0.15 |
| trend TP200/20 | 150 | 150 | +0.432 | +0.257 | 70 | +5.9 | +5.0 | +15.5 | -11.3 | 0.16 |
| trend TP50/10 | 150 | 150 | +0.029 | +0.365 | 77 | +8.0 | +6.2 | +13.4 | -20.4 | 0.30 |
| trend TP50/20 | 150 | 150 | +0.027 | +0.330 | 74 | +7.5 | +6.0 | +13.2 | -19.1 | 0.30 |
| trend TS34/16 | 150 | 150 | +0.046 | +0.052 | 64 | +2.7 | +4.6 | +8.1 | -6.3 | 0.57 |
| trend TS34/8 | 150 | 150 | +0.182 | +0.039 | 62 | +2.0 | +3.7 | +6.9 | -5.0 | 0.62 |
| trend TS55/16 | 150 | 150 | +0.155 | +0.155 | 71 | +5.1 | +5.4 | +10.1 | -8.6 | 0.50 |
| trend TS55/8 | 150 | 150 | +0.076 | +0.052 | 65 | +3.0 | +4.5 | +8.3 | -6.8 | 0.57 |
| trend TS89/16 | 150 | 150 | +0.257 | +0.128 | 69 | +4.0 | +5.5 | +11.3 | -9.0 | 0.43 |
| trend TS89/8 | 150 | 150 | +0.339 | +0.143 | 71 | +4.4 | +5.4 | +10.1 | -10.2 | 0.49 |
| trend ANY | 1800 | 150 | +0.219 | +0.228 | 70 | +8.4 | +5.3 | +12.1 | -12.6 | 0.37 |
| cooldown 12 | 150 | 150 | -0.039 | -0.005 | 38 | -1.0 | -0.1 | +0.7 | -0.0 | 0.94 |
| cooldown 24 | 150 | 150 | -0.063 | -0.001 | 50 | -0.2 | +0.4 | +1.4 | -0.1 | 0.90 |
| cooldown 3 | 150 | 150 | -0.004 | -0.006 | 25 | -3.1 | -0.3 | +0.0 | -0.0 | 0.99 |
| cooldown 6 | 150 | 150 | -0.025 | -0.007 | 42 | -1.8 | -0.1 | +0.3 | -0.1 | 0.97 |
| rearm 20 | 150 | 150 | +0.006 | -0.010 | 48 | -1.7 | +0.1 | +0.8 | +0.1 | 0.92 |
| rearm 40 | 150 | 150 | +0.055 | +0.013 | 56 | +1.8 | +1.5 | +2.0 | +0.3 | 0.84 |

## Paired feature effects (grid-top-bases): variant minus its own base, OOS (2024+)
| effect | pairs | bases | dIS avg% | dOOS avg% | % pairs OOS better | t (across bases) | dOOS tot% | dOOS maxDD pp | dOOS stop-rate pp | trades x |
|---|---|---|---|---|---|---|---|---|---|---|
| trend TP | 22944 | 25 | +0.585 | +0.104 | 48 | +0.8 | +2.3 | +7.5 | -14.2 | 0.21 |
| trend TS | 40048 | 25 | -0.040 | +0.115 | 55 | +4.4 | +1.2 | +1.9 | -4.5 | 0.74 |
| trend TP100/10 | 2420 | 25 | +0.650 | +0.080 | 42 | +0.5 | +2.2 | +8.2 | -17.0 | 0.18 |
| trend TP100/20 | 2580 | 25 | +0.714 | +0.040 | 41 | +0.3 | +2.1 | +8.0 | -12.6 | 0.18 |
| trend TP100/5 | 2480 | 25 | +0.636 | +0.038 | 44 | +0.3 | +2.2 | +8.1 | -18.4 | 0.18 |
| trend TP200/10 | 1960 | 25 | +0.703 | -0.183 | 32 | -1.1 | +1.9 | +8.6 | -6.2 | 0.14 |
| trend TP200/20 | 2080 | 25 | +0.757 | -0.253 | 33 | -1.4 | +1.9 | +8.5 | -1.7 | 0.15 |
| trend TP200/5 | 2000 | 25 | +0.639 | -0.036 | 36 | -0.4 | +2.1 | +8.7 | -8.4 | 0.14 |
| trend TP50/10 | 3140 | 25 | +0.434 | +0.333 | 63 | +2.8 | +2.6 | +6.4 | -19.7 | 0.27 |
| trend TP50/20 | 3144 | 25 | +0.485 | +0.267 | 56 | +2.2 | +2.4 | +6.4 | -16.0 | 0.28 |
| trend TP50/5 | 3140 | 25 | +0.420 | +0.342 | 64 | +2.9 | +2.6 | +6.4 | -20.0 | 0.28 |
| trend TS144/16 | 3214 | 25 | -0.332 | +0.282 | 68 | +4.8 | +2.3 | +4.4 | -9.2 | 0.47 |
| trend TS144/3 | 3334 | 25 | +0.010 | +0.077 | 57 | +2.8 | +0.9 | +1.6 | -4.4 | 0.75 |
| trend TS144/8 | 3294 | 25 | -0.018 | +0.106 | 64 | +4.1 | +1.2 | +1.9 | -5.2 | 0.71 |
| trend TS34/16 | 3374 | 25 | +0.032 | +0.283 | 62 | +4.2 | +2.3 | +2.8 | -6.6 | 0.65 |
| trend TS34/3 | 3414 | 25 | +0.035 | -0.014 | 47 | +0.1 | +0.3 | +0.7 | -1.9 | 0.87 |
| trend TS34/8 | 3374 | 25 | +0.042 | +0.046 | 54 | +3.0 | +0.6 | +1.0 | -2.1 | 0.86 |
| trend TS55/16 | 3334 | 25 | -0.160 | +0.203 | 55 | +3.0 | +1.9 | +2.8 | -5.8 | 0.63 |
| trend TS55/3 | 3374 | 25 | +0.031 | -0.034 | 42 | -0.8 | +0.2 | +0.7 | -2.1 | 0.86 |
| trend TS55/8 | 3374 | 25 | -0.055 | +0.059 | 55 | +2.5 | +0.8 | +1.2 | -2.9 | 0.84 |
| trend TS89/16 | 3334 | 25 | -0.086 | +0.266 | 59 | +3.2 | +2.4 | +3.4 | -6.7 | 0.57 |
| trend TS89/3 | 3334 | 25 | +0.009 | -0.024 | 37 | -0.2 | +0.2 | +0.9 | -3.5 | 0.83 |
| trend TS89/8 | 3294 | 25 | -0.007 | +0.137 | 55 | +3.7 | +1.1 | +1.4 | -4.2 | 0.81 |
| cooldown 12 | 9455 | 25 | -0.012 | +0.001 | 16 | +1.1 | +0.0 | +0.0 | +0.1 | 0.99 |
| cooldown 24 | 9455 | 25 | -0.018 | +0.002 | 22 | +0.7 | +0.0 | +0.1 | +0.1 | 0.99 |
| cooldown 3 | 9455 | 25 | +0.003 | +0.001 | 7 | +2.3 | +0.0 | +0.0 | -0.0 | 1.00 |
| cooldown 6 | 9455 | 25 | +0.004 | +0.002 | 11 | +2.9 | +0.0 | +0.0 | -0.0 | 1.00 |
| rearm 20 | 11840 | 25 | -0.036 | -0.009 | 19 | -1.7 | -0.0 | +0.0 | +0.0 | 0.98 |
| rearm 40 | 11840 | 25 | -0.032 | -0.001 | 35 | -0.5 | +0.1 | +0.2 | +0.1 | 0.96 |
| RSI+ only | 29710 | 25 | +0.003 | -0.198 | 38 | -1.2 | +0.4 | +4.7 | +6.3 | 0.28 |
| absorb<=12 | 20000 | 25 | -1.019 | -0.466 | 28 | -2.3 | +0.2 | +7.7 | +7.4 | 0.13 |
| absorb<=36 | 25362 | 25 | -1.115 | -0.252 | 31 | -1.7 | -0.2 | +4.6 | +0.6 | 0.34 |
| distro near0.003 tape0 min0 | 61 | 60 | -0.027 | -0.024 | 31 | -3.9 | -0.9 | +0.5 | -0.7 | 1.00 |
| distro near0.003 tape0 min30 | 61 | 60 | -0.032 | -0.016 | 36 | -2.8 | -0.8 | +0.2 | -0.1 | 1.00 |
| distro near0.003 tape1 min0 | 61 | 60 | -0.023 | -0.033 | 26 | -5.5 | -1.3 | +0.5 | -0.7 | 1.00 |
| distro near0.003 tape1 min30 | 61 | 60 | -0.031 | -0.027 | 18 | -5.9 | -1.2 | +0.1 | -0.1 | 1.00 |
| distro near0.006 tape0 min0 | 61 | 60 | -0.001 | -0.099 | 10 | -7.9 | -3.2 | +0.1 | -1.4 | 1.01 |
| distro near0.006 tape0 min30 | 61 | 60 | -0.026 | -0.059 | 7 | -11.9 | -1.7 | -0.1 | -0.3 | 1.00 |
| distro near0.006 tape1 min0 | 61 | 60 | -0.023 | -0.076 | 15 | -7.2 | -2.4 | +0.2 | -1.3 | 1.01 |
| distro near0.006 tape1 min30 | 61 | 60 | -0.031 | -0.038 | 20 | -6.2 | -1.3 | +0.0 | -0.3 | 1.00 |
| pull cross/exit | 1440 | 30 | -0.001 | -0.005 | 29 | -0.6 | -0.1 | +0.1 | -0.5 | 1.00 |
| pull peak/be | 360 | 30 | -0.042 | -0.085 | 15 | -5.2 | -1.3 | -0.3 | +12.3 | 1.00 |
| pull peak/exit | 22680 | 30 | -0.129 | -0.055 | 22 | -4.2 | -0.9 | +0.1 | -1.0 | 1.00 |
| pull xema/exit | 1440 | 30 | -0.269 | -0.085 | 24 | -4.1 | -1.4 | +0.2 | -1.2 | 1.00 |

## Individual Pull variants on random bases, ranked by IN-sample gain (shows whether it carries to OOS)
| variant (kind/mode/X/Y|Z|slow) | bases | dIS avg% | dOOS avg% | % OOS better | t |
|---|---|---|---|---|---|
| peak/be/40/35 | 150 | +0.002 | -0.008 | 12 | -9.9 |
| peak/exit/40/35 | 150 | +0.001 | -0.014 | 13 | -16.1 |
| cross/exit/50/-10 | 150 | +0.000 | -0.000 | 0 | -2.2 |
| cross/exit/50/None | 150 | -0.000 | +0.000 | 32 | +4.5 |
| cross/exit/30/-10 | 150 | -0.000 | -0.000 | 46 | -0.5 |
| cross/exit/50/10 | 150 | -0.001 | -0.002 | 28 | -5.1 |
| cross/exit/30/None | 150 | -0.003 | -0.007 | 23 | -9.2 |
| peak/exit/20/35 | 150 | -0.008 | -0.010 | 37 | -7.4 |
| cross/exit/30/10 | 150 | -0.011 | -0.011 | 25 | -8.4 |
| peak/be/40/20 | 150 | -0.018 | -0.015 | 9 | -10.0 |
| peak/exit/40/20 | 150 | -0.033 | -0.028 | 13 | -13.5 |
| peak/exit/40/10 | 150 | -0.040 | -0.037 | 10 | -13.4 |

## Pull picked on IS (best IS t-stat per base), judged on OOS — 30 bases
OOS avg/trade better with Pull in 10/30 bases; mean OOS avg -0.208% -> -0.259%; OOS stop-rate 24.2% -> 25.9%; OOS maxDD -12.7% -> -12.7%.

## Expanding walk-forward (choose on years < Y by consistency score, trade year Y; folds 2024, 2025, 2026 YTD)
| selector pool | OOS trades | avg %/trade | PF | stop % |
|---|---|---|---|---|
| repo preset (fixed) | 101 | +0.680 | 1.59 | 33 |
| exits only (stage2) | 129 | -0.553 | 0.66 | 33 |
| +entry filters (stage3) | 63 | +0.088 | 1.10 | 22 |
| +Pull (stage4) | 125 | +0.061 | 1.06 | 10 |
| alt entries (5/5b) | 190 | -0.261 | 0.82 | 38 |
| all | 63 | +0.092 | 1.11 | 22 |

* exits only (stage2): 2024: `TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3` -> n42 avg-0.81%; 2025: `TideOut ema5 N3 <-50 | stop atr1.5 | exit ema8x55` -> n47 avg-1.14%; 2026: `TideOut ema3 N21 <-50 | stop pct0.005 | TideIn ema8 N8 minNone after0 hold12` -> n40 avg+0.40%
* +entry filters (stage3): 2024: `TideOut ema5 N8 <-50 | stop pct0.005 | TideIn ema13 N2 min-20 after0 hold6 | RSI+` -> n9 avg-0.09%; 2025: `TideOut ema5 N8 <-50 | stop pct0.005 | TideIn ema13 N2 min-20 after0 hold6 | cd3,RSI+` -> n16 avg-0.78%; 2026: `TideOut ema21 N8 <-10 | stop pct0.02 | TideIn ema3 N13 minNone after0 hold3 | rearm40,TS144/16` -> n38 avg+0.49%
* +Pull (stage4): 2024: `TideOut ema89 N5 <-20 | stop atr1.5 | TideIn ema21 N13 min-20 after0 hold3 | TS144/3 | Pull[exit peak>=30 then <0 ema3]` -> n36 avg-0.97%; 2025: `TideOut ema21 N8 <-10 | stop pct0.02 | TideIn ema3 N13 minNone after0 hold3 | rearm40,TS144/16 | Pull[exit peak>=10 drop>=40/6b ema3]` -> n51 avg+0.46%; 2026: `TideOut ema21 N8 <-10 | stop pct0.02 | TideIn ema3 N13 minNone after0 hold3 | rearm40,TS144/16 | Pull[exit peak>=10 drop>=40/6b ema3]` -> n38 avg+0.50%
* alt entries (5/5b): 2024: `cross(21,55,-40,0) | stop pct0.02 | TideIn ema8 N8 min0 after0 hold0 | Pull[exit peak>=20 drop>=35/8b ema3]` -> n55 avg+0.36%; 2025: `cross(21,55,-40,0) | stop atr1.0 | TideIn ema8 N8 min0 after0 hold0` -> n61 avg-1.11%; 2026: `cross(21,55,-40,0) | stop atr1.0 | exit score<0` -> n74 avg-0.02%
* all: 2024: `TideOut ema5 N8 <-50 | stop pct0.005 | TideIn ema13 N2 min-20 after0 hold6 | RSI+` -> n9 avg-0.09%; 2025: `TideOut ema5 N8 <-50 | stop pct0.005 | TideIn ema13 N2 min-20 after0 hold6 | cd3,RSI+` -> n16 avg-0.78%; 2026: `TideOut ema21 N8 <-10 | stop pct0.02 | TideIn ema3 N13 minNone after0 hold3 | rearm40,TS144/16 | Pull[exit peak>=10 drop>=40/6b ema3]` -> n38 avg+0.50%

## Cost sensitivity (OOS)
| candidate | cost | OOS n | avg %/trade | PF | tot % | maxDD % |
|---|---|---|---|---|---|---|
| repo preset | zero cost | 101 | +0.89 | 1.86 | +11 | -6 |
| repo preset | 4bp/side (repo research) | 101 | +0.81 | 1.75 | +10 | -7 |
| repo preset | base 9.5bp+5bp stop | 101 | +0.68 | 1.59 | +8 | -7 |
| repo preset | 20bp/side + 15bp stop | 101 | +0.44 | 1.34 | +5 | -8 |
| best IS stage3 (filters) | zero cost | 106 | +0.03 | 1.02 | +0 | -12 |
| best IS stage3 (filters) | 4bp/side (repo research) | 106 | -0.05 | 0.97 | -1 | -12 |
| best IS stage3 (filters) | base 9.5bp+5bp stop | 106 | -0.17 | 0.89 | -2 | -13 |
| best IS stage3 (filters) | 20bp/side + 15bp stop | 106 | -0.40 | 0.75 | -5 | -14 |
| best IS stage4 (Pull) | zero cost | 86 | +0.02 | 1.01 | -0 | -9 |
| best IS stage4 (Pull) | 4bp/side (repo research) | 86 | -0.06 | 0.96 | -1 | -9 |
| best IS stage4 (Pull) | base 9.5bp+5bp stop | 86 | -0.18 | 0.88 | -2 | -9 |
| best IS stage4 (Pull) | 20bp/side + 15bp stop | 86 | -0.41 | 0.76 | -5 | -10 |
| best IS overall | zero cost | 86 | +0.02 | 1.01 | -0 | -9 |
| best IS overall | 4bp/side (repo research) | 86 | -0.06 | 0.96 | -1 | -9 |
| best IS overall | base 9.5bp+5bp stop | 86 | -0.18 | 0.88 | -2 | -9 |
| best IS overall | 20bp/side + 15bp stop | 86 | -0.41 | 0.76 | -5 | -10 |
