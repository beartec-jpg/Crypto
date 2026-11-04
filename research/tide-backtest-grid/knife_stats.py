#!/usr/bin/env python3
"""Scott's falling-knife pattern: for preset trades that ended on the stop (all years, all symbols), how many had the tide
(EMA3 of score) reach >= X after entry before the stop hit, and what was the trade's best open profit before the stop?"""
import os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import engine as E, grid as G
for tf in ("4h", "1h"):
    P = G.PRESET[tf]; S_all = G.load(tf); stops = 0; tot = 0; reach = {20: 0, 40: 0}; mfe = []; nonstop_reach = {20: 0, 40: 0}; nonstop = 0
    for sn, S in S_all.items():
        sc = S.ema(3)
        for (e, fill, jx, ret, why) in E.simulate(S, dict(P)):
            tot += 1; pk = np.nanmax(sc[fill:jx + 1]); entry = S.o[fill]
            if why in (1, 4):
                stops += 1
                for X in reach: reach[X] += pk >= X
                mfe.append(100 * (S.h[fill:jx].max() / entry - 1) if jx > fill else 0.0)
            else:
                nonstop += 1
                for X in nonstop_reach: nonstop_reach[X] += pk >= X
    m = np.array(mfe)
    print(f"{tf} preset, all years: {tot} trades, {stops} stopped ({100*stops/tot:.0f}%). Of stopped trades the EMA3 tide reached >=20 before the stop in {100*reach[20]/stops:.0f}% and >=40 in {100*reach[40]/stops:.0f}% "
          f"(for non-stopped trades: {100*nonstop_reach[20]/nonstop:.0f}% / {100*nonstop_reach[40]/nonstop:.0f}%); median best open profit of stopped trades {np.median(m):+.2f}%, share that were ever >= +1% in profit {100*(m>=1).mean():.0f}%")
