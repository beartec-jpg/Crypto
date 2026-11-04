#!/usr/bin/env python3
"""How often do raw 'Tide out' signals (what the chart draws, independent of any open trade) repeat within a few bars of the previous one?
Counts per timeframe for the repo preset, all symbols, and for XRP over the last 150 days."""
import os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import engine as E, grid as G
LOOSE = dict(e_ema=8, e_n=3, e_below=0)   # a loose user setting: tiny pivot length, any score below 0
for tf, tag in [("1h", "preset"), ("4h", "preset"), ("1h", "loose ema8 N3 <0"), ("4h", "loose ema8 N3 <0")]:
    P = dict(G.PRESET[tf]); 
    if tag != "preset": P.update(LOOSE)
    S_all = G.load(tf); tot = rep = 0; line = []
    for sn, S in S_all.items():
        ev = [e for (e, pi, pl, _) in S.divs(P["e_ema"], P["e_n"], P["e_below"]) if e >= E.WARMUP]
        r = sum(1 for a, b in zip(ev, ev[1:]) if b - a <= 6); tot += len(ev); rep += r
        if sn == "XRPUSDT":
            cut = S.t[-1] - 150 * 86400; ev2 = [e for e in ev if S.t[e] >= cut]
            line.append(f"XRP last 150d: {len(ev2)} signals, {sum(1 for a,b in zip(ev2,ev2[1:]) if b-a<=6)} within 6 bars of the previous one")
    print(f"{tf} {tag}: all symbols {tot} signals, {rep} ({100*rep/tot:.0f}%) within 6 bars of the previous signal; " + "; ".join(line))
