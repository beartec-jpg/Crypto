# Tide Zone grid analysis — 4h

Configs evaluated: stage 1: 2352, stage 2: 62708, stage 3: 105600, stage 4: 25950, stage 5: 2079, stage 5b: 240, stage 6: 6600 (total 205529).

## Repo preset baseline (4h)
`TideOut ema8 N3 <-20 | stop atr0.5 | TideIn ema8 N5 min0 after0 hold0`

IS n269 wr45% avg-0.12% pf0.95 t-0.3 rs-0.40 || OOS n163 wr45% avg+0.42% pf1.19 tot+7% dd-23% stop38%

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — all stages
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8] | IS n116 wr56% avg+2.50% pf2.62 t3.6 rs+2.22 || OOS n98 wr47% avg+0.55% pf1.32 tot+7% dd-12% stop4% |
| 2 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8] | IS n116 wr56% avg+2.50% pf2.62 t3.6 rs+2.22 || OOS n98 wr47% avg+0.55% pf1.32 tot+7% dd-12% stop4% |
| 3 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=30 drop>=25/6b ema8] | IS n116 wr57% avg+2.44% pf2.50 t3.5 rs+2.17 || OOS n98 wr47% avg+0.51% pf1.30 tot+6% dd-12% stop4% |
| 4 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=30 drop>=25/6b ema8] | IS n116 wr57% avg+2.44% pf2.50 t3.5 rs+2.17 || OOS n98 wr47% avg+0.51% pf1.30 tot+6% dd-12% stop4% |
| 5 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=10 drop>=25/6b ema8] | IS n116 wr55% avg+2.46% pf2.56 t3.5 rs+2.16 || OOS n98 wr47% avg+0.58% pf1.35 tot+7% dd-11% stop3% |
| 6 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=10 drop>=25/6b ema8] | IS n116 wr55% avg+2.46% pf2.56 t3.5 rs+2.16 || OOS n98 wr47% avg+0.58% pf1.35 tot+7% dd-11% stop3% |
| 7 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=30/6b ema8] | IS n116 wr57% avg+2.43% pf2.49 t3.4 rs+2.15 || OOS n98 wr47% avg+0.47% pf1.27 tot+6% dd-13% stop4% |
| 8 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 drop>=30/6b ema8] | IS n116 wr57% avg+2.43% pf2.49 t3.4 rs+2.15 || OOS n98 wr47% avg+0.47% pf1.27 tot+6% dd-13% stop4% |
| 9 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 then <10 ema8] | IS n116 wr56% avg+2.43% pf2.51 t3.5 rs+2.14 || OOS n98 wr47% avg+0.55% pf1.33 tot+7% dd-12% stop4% |
| 10 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 then <10 ema8] | IS n116 wr56% avg+2.43% pf2.51 t3.5 rs+2.14 || OOS n98 wr47% avg+0.55% pf1.33 tot+7% dd-12% stop4% |
| 11 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=10 drop>=30/6b ema8] | IS n116 wr57% avg+2.39% pf2.44 t3.4 rs+2.11 || OOS n98 wr47% avg+0.45% pf1.25 tot+6% dd-13% stop4% |
| 12 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=10 drop>=30/6b ema8] | IS n116 wr57% avg+2.39% pf2.44 t3.4 rs+2.11 || OOS n98 wr47% avg+0.45% pf1.25 tot+6% dd-13% stop4% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 1 (entry+stop, preset exit)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema3 N21 <-40 | stop atr1.0 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr49% avg+1.72% pf2.30 t3.3 rs+1.00 || OOS n127 wr44% avg+0.35% pf1.26 tot+6% dd-13% stop6% |
| 2 | TideOut ema3 N21 <-40 | stop atr1.5 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr49% avg+1.73% pf2.32 t3.3 rs+0.99 || OOS n127 wr44% avg+0.35% pf1.25 tot+6% dd-13% stop2% |
| 3 | TideOut ema3 N21 <-40 | stop pct0.02 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr48% avg+1.62% pf2.18 t3.1 rs+0.92 || OOS n127 wr44% avg+0.35% pf1.26 tot+6% dd-13% stop4% |
| 4 | TideOut ema3 N21 <-40 | stop pct0.01 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr47% avg+1.55% pf2.11 t3.0 rs+0.87 || OOS n127 wr43% avg+0.32% pf1.23 tot+6% dd-13% stop9% |
| 5 | TideOut ema3 N21 <-40 | stop atr0.5 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr47% avg+1.53% pf2.08 t3.0 rs+0.87 || OOS n127 wr43% avg+0.30% pf1.21 tot+5% dd-13% stop10% |
| 6 | TideOut ema3 N21 <-20 | stop atr1.0 | TideIn ema8 N5 min0 after0 hold0 | IS n192 wr49% avg+1.59% pf2.22 t3.6 rs+0.86 || OOS n155 wr42% avg-0.13% pf0.92 tot-2% dd-20% stop8% |
| 7 | TideOut ema3 N21 <-40 | stop pct0.005 | TideIn ema8 N5 min0 after0 hold0 | IS n150 wr46% avg+1.54% pf2.10 t3.0 rs+0.86 || OOS n127 wr43% avg+0.34% pf1.25 tot+6% dd-12% stop10% |
| 8 | TideOut ema3 N21 <-20 | stop atr1.5 | TideIn ema8 N5 min0 after0 hold0 | IS n192 wr49% avg+1.61% pf2.24 t3.6 rs+0.85 || OOS n155 wr42% avg-0.16% pf0.91 tot-3% dd-21% stop5% |
| 9 | TideOut ema3 N21 <-20 | stop atr0.5 | TideIn ema8 N5 min0 after0 hold0 | IS n192 wr47% avg+1.45% pf2.04 t3.2 rs+0.77 || OOS n156 wr42% avg-0.16% pf0.90 tot-2% dd-20% stop12% |
| 10 | TideOut ema3 N21 <-20 | stop pct0.02 | TideIn ema8 N5 min0 after0 hold0 | IS n192 wr48% avg+1.46% pf2.04 t3.2 rs+0.76 || OOS n155 wr42% avg-0.13% pf0.92 tot-2% dd-20% stop6% |
| 11 | TideOut ema3 N21 <-10 | stop atr1.0 | TideIn ema8 N5 min0 after0 hold0 | IS n197 wr48% avg+1.42% pf2.01 t3.2 rs+0.76 || OOS n155 wr42% avg-0.13% pf0.92 tot-2% dd-20% stop8% |
| 12 | TideOut ema3 N21 <0 | stop atr1.0 | TideIn ema8 N5 min0 after0 hold0 | IS n199 wr47% avg+1.38% pf1.98 t3.1 rs+0.75 || OOS n157 wr42% avg-0.14% pf0.92 tot-2% dd-21% stop8% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 2 (exit grid)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | IS n137 wr55% avg+1.96% pf2.05 t3.0 rs+1.69 || OOS n111 wr47% avg+0.13% pf1.07 tot+1% dd-17% stop8% |
| 2 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold3 | IS n137 wr55% avg+1.96% pf2.05 t3.0 rs+1.69 || OOS n111 wr47% avg+0.13% pf1.07 tot+1% dd-17% stop8% |
| 3 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold6 | IS n137 wr55% avg+1.96% pf2.05 t3.0 rs+1.69 || OOS n111 wr47% avg+0.13% pf1.07 tot+1% dd-17% stop8% |
| 4 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N8 min20 after1 hold0 | IS n137 wr55% avg+1.96% pf2.09 t3.1 rs+1.69 || OOS n111 wr48% avg+0.08% pf1.04 tot+0% dd-18% stop8% |
| 5 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N8 min20 after1 hold3 | IS n137 wr55% avg+1.96% pf2.09 t3.1 rs+1.69 || OOS n111 wr48% avg+0.08% pf1.04 tot+0% dd-18% stop8% |
| 6 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N8 min20 after1 hold6 | IS n137 wr55% avg+1.96% pf2.09 t3.1 rs+1.69 || OOS n111 wr48% avg+0.08% pf1.04 tot+0% dd-18% stop8% |
| 7 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after0 hold6 | IS n137 wr54% avg+1.97% pf2.07 t3.1 rs+1.68 || OOS n111 wr43% avg+0.06% pf1.03 tot-0% dd-17% stop7% |
| 8 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min40 after1 hold0 | IS n137 wr55% avg+1.91% pf2.01 t2.9 rs+1.65 || OOS n111 wr48% avg+0.13% pf1.06 tot+1% dd-17% stop9% |
| 9 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min40 after1 hold3 | IS n137 wr55% avg+1.91% pf2.01 t2.9 rs+1.65 || OOS n111 wr48% avg+0.13% pf1.06 tot+1% dd-17% stop9% |
| 10 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min40 after1 hold6 | IS n137 wr55% avg+1.91% pf2.01 t2.9 rs+1.65 || OOS n111 wr48% avg+0.13% pf1.06 tot+1% dd-17% stop9% |
| 11 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min40 after0 hold6 | IS n137 wr54% avg+1.92% pf2.02 t3.0 rs+1.64 || OOS n111 wr44% avg+0.05% pf1.03 tot-0% dd-17% stop8% |
| 12 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N8 min40 after1 hold0 | IS n137 wr55% avg+1.90% pf2.03 t3.0 rs+1.63 || OOS n111 wr48% avg+0.09% pf1.05 tot+0% dd-17% stop8% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 3 (entry filters)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n97 wr49% avg+0.53% pf1.31 tot+7% dd-13% stop5% |
| 2 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n97 wr49% avg+0.53% pf1.31 tot+7% dd-13% stop5% |
| 3 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm20,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n96 wr50% avg+0.55% pf1.31 tot+7% dd-13% stop5% |
| 4 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm40,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n96 wr50% avg+0.55% pf1.31 tot+7% dd-13% stop5% |
| 5 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold3 | cd24,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n97 wr49% avg+0.53% pf1.31 tot+7% dd-13% stop5% |
| 6 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold3 | cd24,rearm0,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n97 wr49% avg+0.53% pf1.31 tot+7% dd-13% stop5% |
| 7 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold3 | cd24,rearm20,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n96 wr50% avg+0.55% pf1.31 tot+7% dd-13% stop5% |
| 8 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold3 | cd24,rearm40,TS55/16 | IS n115 wr57% avg+2.29% pf2.30 t3.2 rs+1.96 || OOS n96 wr50% avg+0.55% pf1.31 tot+7% dd-13% stop5% |
| 9 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS34/3 | IS n94 wr57% avg+2.24% pf2.39 t3.1 rs+1.92 || OOS n85 wr46% avg+0.44% pf1.23 tot+4% dd-14% stop6% |
| 10 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS34/3 | IS n94 wr57% avg+2.24% pf2.39 t3.1 rs+1.92 || OOS n85 wr46% avg+0.44% pf1.23 tot+4% dd-14% stop6% |
| 11 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm20,TS34/3 | IS n94 wr57% avg+2.24% pf2.39 t3.1 rs+1.92 || OOS n84 wr46% avg+0.46% pf1.23 tot+4% dd-14% stop6% |
| 12 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm40,TS34/3 | IS n94 wr57% avg+2.24% pf2.39 t3.1 rs+1.92 || OOS n84 wr46% avg+0.46% pf1.23 tot+4% dd-14% stop6% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 4 (Pull)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8] | IS n116 wr56% avg+2.50% pf2.62 t3.6 rs+2.22 || OOS n98 wr47% avg+0.55% pf1.32 tot+7% dd-12% stop4% |
| 2 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8] | IS n116 wr56% avg+2.50% pf2.62 t3.6 rs+2.22 || OOS n98 wr47% avg+0.55% pf1.32 tot+7% dd-12% stop4% |
| 3 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=30 drop>=25/6b ema8] | IS n116 wr57% avg+2.44% pf2.50 t3.5 rs+2.17 || OOS n98 wr47% avg+0.51% pf1.30 tot+6% dd-12% stop4% |
| 4 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=30 drop>=25/6b ema8] | IS n116 wr57% avg+2.44% pf2.50 t3.5 rs+2.17 || OOS n98 wr47% avg+0.51% pf1.30 tot+6% dd-12% stop4% |
| 5 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=10 drop>=25/6b ema8] | IS n116 wr55% avg+2.46% pf2.56 t3.5 rs+2.16 || OOS n98 wr47% avg+0.58% pf1.35 tot+7% dd-11% stop3% |
| 6 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=10 drop>=25/6b ema8] | IS n116 wr55% avg+2.46% pf2.56 t3.5 rs+2.16 || OOS n98 wr47% avg+0.58% pf1.35 tot+7% dd-11% stop3% |
| 7 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=30/6b ema8] | IS n116 wr57% avg+2.43% pf2.49 t3.4 rs+2.15 || OOS n98 wr47% avg+0.47% pf1.27 tot+6% dd-13% stop4% |
| 8 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 drop>=30/6b ema8] | IS n116 wr57% avg+2.43% pf2.49 t3.4 rs+2.15 || OOS n98 wr47% avg+0.47% pf1.27 tot+6% dd-13% stop4% |
| 9 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 then <10 ema8] | IS n116 wr56% avg+2.43% pf2.51 t3.5 rs+2.14 || OOS n98 wr47% avg+0.55% pf1.33 tot+7% dd-12% stop4% |
| 10 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=20 then <10 ema8] | IS n116 wr56% avg+2.43% pf2.51 t3.5 rs+2.14 || OOS n98 wr47% avg+0.55% pf1.33 tot+7% dd-12% stop4% |
| 11 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=10 drop>=30/6b ema8] | IS n116 wr57% avg+2.39% pf2.44 t3.4 rs+2.11 || OOS n98 wr47% avg+0.45% pf1.25 tot+6% dd-13% stop4% |
| 12 | TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,rearm0,TS55/16 | Pull[exit peak>=10 drop>=30/6b ema8] | IS n116 wr57% avg+2.39% pf2.44 t3.4 rs+2.11 || OOS n98 wr47% avg+0.45% pf1.25 tot+6% dd-13% stop4% |

## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — stage 5/5b (alt entries)
(selection uses <2024 only; OOS columns are untouched holdout)

| # | config | result |
|---|---|---|
| 1 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=30 then <10 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 2 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 3 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=30 then <0 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 4 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=30 then <-10 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 5 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=50 then <10 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 6 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=50 then <0 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 7 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=50 then <-10 ema5] | IS n1615 wr36% avg+1.15% pf1.68 t5.1 rs+0.54 || OOS n1050 wr29% avg-0.02% pf0.99 tot-14% dd-47% stop4% |
| 8 | cross(21,34,0,0) | stop atr1.0 | exit ema8x21 | IS n1614 wr44% avg+1.07% pf1.51 t4.7 rs+0.52 || OOS n1040 wr37% avg+0.09% pf1.04 tot-4% dd-49% stop10% |
| 9 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=20 drop>=35/4b ema3] | IS n1616 wr36% avg+1.12% pf1.67 t5.0 rs+0.52 || OOS n1050 wr29% avg-0.01% pf0.99 tot-13% dd-47% stop4% |
| 10 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=40 drop>=35/4b ema3] | IS n1616 wr36% avg+1.12% pf1.67 t5.0 rs+0.52 || OOS n1050 wr29% avg-0.01% pf0.99 tot-13% dd-47% stop4% |
| 11 | cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[be peak>=40 drop>=35/6b ema3] | IS n1617 wr35% avg+1.12% pf1.67 t5.0 rs+0.51 || OOS n1050 wr28% avg-0.00% pf1.00 tot-11% dd-46% stop9% |
| 12 | cross(21,34,0,0) | stop pct0.02 | exit score<0 | IS n1615 wr36% avg+1.12% pf1.66 t5.0 rs+0.51 || OOS n1051 wr29% avg-0.03% pf0.98 tot-15% dd-48% stop4% |

## Entry EMA/pivot plateau (avg over below-score and stops; stage 1)
| EMA | N | cfgs | IS avg % | OOS avg % | OOS PF | OOS n |
|---|---|---|---|---|---|---|
| 3 | 21 | 42 | 1.29 | 0.01 | 1.01 | 121 |
| 89 | 4 | 18 | 1.09 | -0.91 | 0.62 | 66 |
| 5 | 21 | 36 | 1.02 | 0.11 | 1.07 | 130 |
| 89 | 3 | 18 | 0.98 | -0.86 | 0.66 | 54 |
| 89 | 5 | 18 | 0.98 | -0.55 | 0.74 | 71 |
| 55 | 3 | 18 | 0.91 | -0.85 | 0.67 | 74 |
| 8 | 2 | 36 | 0.65 | 1.31 | 1.71 | 146 |
| 8 | 21 | 36 | 0.61 | 0.26 | 1.19 | 119 |

## Paired feature effects (random-bases): variant minus its own base, OOS (2024+)
| effect | pairs | bases | dIS avg% | dOOS avg% | % pairs OOS better | t (across bases) | dOOS tot% | dOOS maxDD pp | dOOS stop-rate pp | trades x |
|---|---|---|---|---|---|---|---|---|---|---|
| pull cross/exit | 900 | 150 | +0.006 | -0.001 | 29 | -1.7 | -0.0 | +0.0 | -0.3 | 1.00 |
| pull peak/be | 300 | 150 | -0.036 | +0.019 | 66 | +4.8 | +0.5 | +0.6 | +13.0 | 1.00 |
| pull peak/exit | 1800 | 150 | -0.034 | +0.013 | 61 | +1.9 | +0.5 | +1.1 | -2.7 | 1.00 |
| pull xema/exit | 600 | 150 | -0.084 | +0.041 | 62 | +6.3 | +1.0 | +0.9 | -1.8 | 1.00 |
| pull ANY | 3600 | 150 | -0.033 | +0.015 | 53 | +3.1 | +0.5 | +0.8 | -0.6 | 1.00 |
| trend TP100/10 | 148 | 148 | +0.877 | +0.617 | 73 | +5.0 | +6.2 | +16.4 | -10.5 | 0.16 |
| trend TP100/20 | 150 | 150 | +0.864 | +0.361 | 65 | +2.9 | +5.3 | +15.3 | -5.9 | 0.17 |
| trend TP200/10 | 150 | 150 | +0.831 | +0.921 | 81 | +9.8 | +7.7 | +14.6 | -5.3 | 0.22 |
| trend TP200/20 | 150 | 150 | +0.677 | +0.858 | 78 | +9.4 | +7.7 | +14.2 | -3.7 | 0.23 |
| trend TP50/10 | 149 | 149 | +0.618 | +0.875 | 65 | +7.0 | +6.2 | +16.0 | -17.5 | 0.19 |
| trend TP50/20 | 149 | 149 | +0.985 | +0.579 | 62 | +4.9 | +5.5 | +15.4 | -15.0 | 0.19 |
| trend TS34/16 | 150 | 150 | +0.218 | +0.397 | 75 | +5.7 | +4.3 | +7.7 | -4.6 | 0.59 |
| trend TS34/8 | 150 | 150 | -0.275 | +0.480 | 83 | +8.8 | +5.3 | +7.4 | -6.9 | 0.65 |
| trend TS55/16 | 146 | 146 | +0.536 | +0.034 | 60 | +0.6 | +3.2 | +9.0 | -4.5 | 0.53 |
| trend TS55/8 | 149 | 149 | -0.006 | +0.607 | 84 | +6.8 | +5.1 | +8.3 | -8.7 | 0.60 |
| trend TS89/16 | 142 | 142 | +0.745 | -0.432 | 35 | -7.1 | +1.1 | +9.7 | -4.1 | 0.47 |
| trend TS89/8 | 146 | 146 | +0.474 | +0.184 | 64 | +2.3 | +3.3 | +9.3 | -9.5 | 0.54 |
| trend ANY | 1779 | 150 | +0.544 | +0.462 | 69 | +8.2 | +5.1 | +12.0 | -8.0 | 0.38 |
| cooldown 12 | 150 | 150 | -0.116 | -0.060 | 45 | -4.2 | -0.0 | +0.7 | +0.9 | 0.92 |
| cooldown 24 | 150 | 150 | -0.170 | -0.116 | 34 | -5.9 | -0.6 | +1.1 | +1.3 | 0.86 |
| cooldown 3 | 150 | 150 | +0.018 | +0.001 | 37 | +0.7 | -0.0 | +0.1 | +0.1 | 0.99 |
| cooldown 6 | 150 | 150 | +0.002 | +0.021 | 60 | +3.5 | +0.5 | +0.5 | +0.2 | 0.97 |
| rearm 20 | 150 | 150 | -0.043 | -0.046 | 40 | -4.9 | -0.1 | +0.6 | +0.2 | 0.95 |
| rearm 40 | 150 | 150 | -0.095 | -0.048 | 46 | -3.5 | +0.3 | +1.2 | +0.7 | 0.91 |

## Paired feature effects (grid-top-bases): variant minus its own base, OOS (2024+)
| effect | pairs | bases | dIS avg% | dOOS avg% | % pairs OOS better | t (across bases) | dOOS tot% | dOOS maxDD pp | dOOS stop-rate pp | trades x |
|---|---|---|---|---|---|---|---|---|---|---|
| trend TP | 15360 | 24 | +0.762 | -0.721 | 35 | -2.9 | +5.9 | +12.9 | -3.1 | 0.18 |
| trend TS | 26880 | 24 | -0.424 | +0.102 | 56 | +2.1 | +1.1 | +2.0 | -0.1 | 0.81 |
| trend TP100/10 | 1520 | 24 | +1.510 | -0.929 | 27 | -2.6 | +6.5 | +14.8 | -1.9 | 0.13 |
| trend TP100/20 | 1520 | 24 | +1.769 | -1.006 | 27 | -2.6 | +6.4 | +14.8 | -1.5 | 0.12 |
| trend TP100/5 | 1520 | 24 | +1.543 | -0.991 | 27 | -2.6 | +6.5 | +14.8 | -1.6 | 0.12 |
| trend TP200/10 | 1760 | 24 | +1.351 | -0.873 | 46 | -2.6 | +6.7 | +13.1 | -2.4 | 0.14 |
| trend TP200/20 | 1640 | 24 | +1.252 | -0.939 | 45 | -2.4 | +6.9 | +13.7 | -0.8 | 0.14 |
| trend TP200/5 | 1640 | 24 | +1.136 | -0.921 | 45 | -2.2 | +6.9 | +13.8 | -0.9 | 0.13 |
| trend TP50/10 | 1920 | 24 | -1.236 | -0.241 | 33 | -1.6 | +4.5 | +10.7 | -6.0 | 0.27 |
| trend TP50/20 | 1920 | 24 | +0.222 | -0.392 | 33 | -2.2 | +4.8 | +11.1 | -5.8 | 0.24 |
| trend TP50/5 | 1920 | 24 | +0.016 | -0.428 | 30 | -2.7 | +4.5 | +10.7 | -5.3 | 0.26 |
| trend TS144/16 | 2240 | 24 | +0.046 | +0.097 | 71 | +1.4 | +2.1 | +2.8 | -0.3 | 0.78 |
| trend TS144/3 | 2240 | 24 | -0.606 | -0.042 | 50 | -0.9 | +1.0 | +2.0 | +0.0 | 0.78 |
| trend TS144/8 | 2240 | 24 | -0.257 | +0.150 | 55 | +1.7 | +1.2 | +2.3 | -0.4 | 0.78 |
| trend TS34/16 | 2240 | 24 | -0.241 | +0.164 | 52 | +2.8 | +0.8 | +1.1 | +0.1 | 0.89 |
| trend TS34/3 | 2240 | 24 | -0.198 | -0.015 | 57 | -0.6 | +1.0 | +2.1 | -0.6 | 0.78 |
| trend TS34/8 | 2240 | 24 | -0.668 | +0.161 | 50 | +1.7 | +0.6 | +1.6 | +0.1 | 0.83 |
| trend TS55/16 | 2240 | 24 | -0.261 | +0.272 | 88 | +6.3 | +2.2 | +2.2 | -0.4 | 0.86 |
| trend TS55/3 | 2240 | 24 | -0.579 | +0.041 | 48 | +0.6 | +0.8 | +1.7 | -0.2 | 0.82 |
| trend TS55/8 | 2240 | 24 | -0.613 | +0.141 | 45 | +1.5 | +0.5 | +1.5 | +0.3 | 0.83 |
| trend TS89/16 | 2240 | 24 | -0.582 | +0.128 | 70 | +2.7 | +1.9 | +2.5 | -0.5 | 0.81 |
| trend TS89/3 | 2240 | 24 | -0.645 | -0.096 | 42 | -2.0 | +0.5 | +1.8 | +0.2 | 0.80 |
| trend TS89/8 | 2240 | 24 | -0.484 | +0.222 | 48 | +1.9 | +0.8 | +1.9 | -0.1 | 0.81 |
| cooldown 12 | 5956 | 24 | -0.012 | -0.004 | 8 | -0.5 | +0.0 | +0.0 | +0.1 | 0.99 |
| cooldown 24 | 5956 | 24 | +0.017 | +0.057 | 58 | +4.3 | +0.8 | +0.7 | -0.5 | 0.97 |
| cooldown 3 | 5956 | 24 | +0.004 | -0.004 | 2 | -1.3 | -0.0 | +0.0 | +0.0 | 1.00 |
| cooldown 6 | 5956 | 24 | -0.005 | -0.003 | 5 | -0.9 | -0.0 | +0.0 | +0.0 | 1.00 |
| rearm 20 | 7442 | 24 | -0.003 | +0.015 | 33 | +1.7 | +0.2 | +0.3 | -0.1 | 0.99 |
| rearm 40 | 7442 | 24 | -0.026 | +0.028 | 39 | +1.7 | +0.5 | +0.5 | -0.2 | 0.98 |
| RSI+ only | 18292 | 24 | +0.031 | -1.007 | 14 | -4.4 | -1.9 | +3.4 | -0.1 | 0.51 |
| absorb<=12 | 15640 | 20 | +2.591 | -0.889 | 26 | -4.4 | +6.5 | +17.5 | -12.9 | 0.08 |
| absorb<=36 | 20400 | 24 | -1.996 | -0.363 | 46 | -2.7 | +5.7 | +15.1 | -5.7 | 0.11 |
| distro near0.003 tape0 min0 | 61 | 61 | +0.015 | -0.016 | 34 | -1.7 | -0.4 | +0.1 | -0.0 | 1.00 |
| distro near0.003 tape0 min30 | 61 | 61 | +0.009 | -0.017 | 34 | -1.9 | -0.4 | +0.1 | +0.0 | 1.00 |
| distro near0.003 tape1 min0 | 61 | 61 | +0.009 | +0.010 | 49 | +3.9 | +0.2 | +0.1 | -0.0 | 1.00 |
| distro near0.003 tape1 min30 | 61 | 61 | +0.003 | +0.009 | 49 | +4.2 | +0.1 | +0.0 | +0.0 | 1.00 |
| distro near0.006 tape0 min0 | 61 | 61 | +0.011 | -0.109 | 25 | -4.9 | -1.8 | +0.6 | -0.3 | 1.00 |
| distro near0.006 tape0 min30 | 61 | 61 | +0.007 | -0.102 | 28 | -4.4 | -1.8 | +0.6 | -0.1 | 1.00 |
| distro near0.006 tape1 min0 | 61 | 61 | +0.008 | -0.006 | 57 | -0.5 | -0.2 | +0.5 | -0.3 | 1.00 |
| distro near0.006 tape1 min30 | 61 | 61 | +0.005 | -0.002 | 61 | -0.1 | -0.3 | +0.5 | -0.1 | 1.00 |
| pull cross/exit | 1440 | 30 | -0.035 | +0.009 | 42 | +0.7 | +0.1 | +0.4 | -1.3 | 1.00 |
| pull peak/be | 360 | 30 | -0.385 | +0.016 | 54 | +0.5 | +0.2 | +0.8 | +19.0 | 1.01 |
| pull peak/exit | 22680 | 30 | -0.256 | +0.007 | 44 | +0.3 | +0.1 | +0.9 | -2.0 | 1.01 |
| pull xema/exit | 1440 | 30 | -0.438 | +0.019 | 52 | +0.6 | +0.3 | +1.3 | -2.5 | 1.01 |

## Individual Pull variants on random bases, ranked by IN-sample gain (shows whether it carries to OOS)
| variant (kind/mode/X/Y|Z|slow) | bases | dIS avg% | dOOS avg% | % OOS better | t |
|---|---|---|---|---|---|
| peak/exit/20/35 | 150 | +0.018 | +0.046 | 80 | +8.8 |
| cross/exit/30/10 | 150 | +0.015 | -0.003 | 45 | -1.0 |
| cross/exit/30/None | 150 | +0.013 | +0.001 | 57 | +0.6 |
| cross/exit/30/-10 | 150 | +0.007 | +0.001 | 47 | +0.8 |
| cross/exit/50/-10 | 150 | -0.000 | -0.000 | 0 | -1.7 |
| cross/exit/50/None | 150 | -0.001 | -0.001 | 15 | -2.6 |
| cross/exit/50/10 | 150 | -0.001 | -0.007 | 8 | -10.8 |
| peak/exit/40/35 | 150 | -0.004 | +0.034 | 80 | +12.2 |
| peak/be/40/35 | 150 | -0.012 | +0.038 | 87 | +12.4 |
| peak/exit/20/20 | 150 | -0.033 | +0.065 | 74 | +6.8 |
| peak/exit/40/10 | 150 | -0.053 | -0.003 | 49 | -0.3 |
| peak/exit/20/10 | 150 | -0.054 | -0.075 | 32 | -5.6 |

## Pull picked on IS (best IS t-stat per base), judged on OOS — 30 bases
OOS avg/trade better with Pull in 20/30 bases; mean OOS avg -0.453% -> -0.395%; OOS stop-rate 10.1% -> 7.7%; OOS maxDD -17.7% -> -16.4%.

## Expanding walk-forward (choose on years < Y by consistency score, trade year Y; folds 2024, 2025, 2026 YTD)
| selector pool | OOS trades | avg %/trade | PF | stop % |
|---|---|---|---|---|
| repo preset (fixed) | 163 | +0.420 | 1.19 | 38 |
| exits only (stage2) | 111 | -0.073 | 0.97 | 11 |
| +entry filters (stage3) | 43 | -0.012 | 0.99 | 5 |
| +Pull (stage4) | 90 | -0.020 | 0.99 | 4 |
| alt entries (5/5b) | 984 | +0.071 | 1.04 | 7 |
| all | 43 | -0.012 | 0.99 | 5 |

* exits only (stage2): 2024: `TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0` -> n33 avg+1.11%; 2025: `TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N5 minNone after0 hold12` -> n40 avg+0.31%; 2026: `TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema5 N2 min40 after0 hold6` -> n38 avg-1.50%
* +entry filters (stage3): 2024: `TideOut ema3 N21 <-20 | stop atr1.0 | TideIn ema3 N8 min20 after0 hold6 | TP50/5` -> n13 avg+0.37%; 2025: `TideOut ema21 N13 <-10 | stop atr1.5 | TideIn ema8 N8 minNone after0 hold12 | TP50/10` -> n8 avg+2.86%; 2026: `TideOut ema21 N13 <-10 | stop atr1.5 | TideIn ema8 N8 minNone after0 hold12 | TP50/10` -> n22 avg-1.28%
* +Pull (stage4): 2024: `TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8]` -> n27 avg+0.76%; 2025: `TideOut ema3 N21 <-30 | stop atr1.0 | TideIn ema3 N2 min20 after1 hold0 | cd24,TS34/3,RSI+ | Pull[exit peak>=50 ema5<ema13]` -> n28 avg-0.84%; 2026: `TideOut ema5 N21 <-40 | stop atr1.5 | TideIn ema3 N8 min20 after1 hold0 | cd24,TS55/16 | Pull[exit peak>=20 drop>=25/6b ema8]` -> n35 avg+0.04%
* alt entries (5/5b): 2024: `cross(21,34,0,0) | stop atr1.0 | exit score<0 | Pull[exit peak>=30 then <10 ema5]` -> n372 avg+0.37%; 2025: `cross(21,55,0,0) | stop atr1.0 | exit ema8x21 | Pull[exit peak>=30 then <-10 ema5]` -> n314 avg+0.28%; 2026: `cross(21,55,0,0) | stop atr1.0 | exit ema8x21 | Pull[exit peak>=30 then <-10 ema5]` -> n298 avg-0.53%
* all: 2024: `TideOut ema3 N21 <-20 | stop atr1.0 | TideIn ema3 N8 min20 after0 hold6 | TP50/5` -> n13 avg+0.37%; 2025: `TideOut ema21 N13 <-10 | stop atr1.5 | TideIn ema8 N8 minNone after0 hold12 | TP50/10` -> n8 avg+2.86%; 2026: `TideOut ema21 N13 <-10 | stop atr1.5 | TideIn ema8 N8 minNone after0 hold12 | TP50/10` -> n22 avg-1.28%

## Cost sensitivity (OOS)
| candidate | cost | OOS n | avg %/trade | PF | tot % | maxDD % |
|---|---|---|---|---|---|---|
| repo preset | zero cost | 163 | +0.63 | 1.30 | +11 | -21 |
| repo preset | 4bp/side (repo research) | 163 | +0.55 | 1.26 | +10 | -22 |
| repo preset | base 9.5bp+5bp stop | 163 | +0.42 | 1.19 | +7 | -23 |
| repo preset | 20bp/side + 15bp stop | 163 | +0.17 | 1.07 | +1 | -24 |
| best IS stage3 (filters) | zero cost | 97 | +0.73 | 1.44 | +9 | -12 |
| best IS stage3 (filters) | 4bp/side (repo research) | 97 | +0.65 | 1.38 | +8 | -13 |
| best IS stage3 (filters) | base 9.5bp+5bp stop | 97 | +0.53 | 1.31 | +7 | -13 |
| best IS stage3 (filters) | 20bp/side + 15bp stop | 97 | +0.32 | 1.17 | +4 | -14 |
| best IS stage4 (Pull) | zero cost | 98 | +0.74 | 1.46 | +9 | -11 |
| best IS stage4 (Pull) | 4bp/side (repo research) | 98 | +0.66 | 1.40 | +8 | -11 |
| best IS stage4 (Pull) | base 9.5bp+5bp stop | 98 | +0.55 | 1.32 | +7 | -12 |
| best IS stage4 (Pull) | 20bp/side + 15bp stop | 98 | +0.33 | 1.18 | +4 | -13 |
| best IS overall | zero cost | 98 | +0.74 | 1.46 | +9 | -11 |
| best IS overall | 4bp/side (repo research) | 98 | +0.66 | 1.40 | +8 | -11 |
| best IS overall | base 9.5bp+5bp stop | 98 | +0.55 | 1.32 | +7 | -12 |
| best IS overall | 20bp/side + 15bp stop | 98 | +0.33 | 1.18 | +4 | -13 |
