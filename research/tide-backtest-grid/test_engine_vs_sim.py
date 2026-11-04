#!/usr/bin/env python3
"""Cross-check engine.simulate against the repo's scripts/tide_live_core.sim on real data (guards off, no time-varying costs).
Expect identical trade entries/exits except stop fills that gap through (engine fills at the open, repo sim at the stop price)."""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(REPO, "scripts"))
import engine as E, tide_core as C, tide_live_core as T, grid as G
tot_bad = 0
for tf in ("4h", "1h"):
    for sym in ("XRPUSDT", "BTCUSDT", "SOLUSDT"):
        z = np.load(os.path.join(HERE, "data", f"{sym}_{tf}.npz")); S = E.Sym(sym, tf, {k: z[k] for k in "tohlcv"})
        P = G.PRESET[tf]; cfg = dict(P)
        mine = E.simulate(S, cfg)
        cs = [{"t": int(S.t[i]), "o": S.o[i], "h": S.h[i], "l": S.l[i], "c": S.c[i], "v": S.v[i]} for i in range(S.n)]
        ent = {e: (pi, pl) for (e, pi, pl, _) in S.divs(P["e_ema"], P["e_n"], P["e_below"])}
        ex = [i for i in T.causal_ema_peaks(list(S.ema(P["x_ema"])), P["x_n"], 0)]
        # exitMinScore 0 -> only peaks >= 0 (the TS default); mirror it for the reference
        pk, _ = S.peaks(P["x_ema"], P["x_n"]); ex = [p[0] for p in pk if p[1] >= 0]
        st = {"kind": "struct_atr", "atr_mult": P["stop_val"]} if P["stop_kind"] == "atr" else {"kind": "struct_pct", "pct": P["stop_val"]}
        ref = T.sim(cs, ent, ex, T.atr_series(cs, 14), st, {"kind": "tide", "R": 0}, 0, E.MAXHOLD[tf], start=E.WARMUP)
        same = [(a[0], a[1], a[2]) for a in mine] == [(r["i"], r["i"] + 1, r["exit_i"]) for r in ref]
        d = max([abs((a[3] - 2 * T.FEE) - r["ret"]) for a, r in zip(mine, ref)] + [0]) if len(mine) == len(ref) else 9
        print(f"{'PASS' if same else 'FAIL'} {sym} {tf}: trades mine={len(mine)} repo={len(ref)} identical entry/exit bars={same} max |ret diff|={d:.4f} (stop gaps only)")
        tot_bad += (not same)
sys.exit(1 if tot_bad else 0)
