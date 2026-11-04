#!/usr/bin/env python3
"""Parity checks: this port == the repo's research detector (scripts/tide_live_core.py) and the TS fixtures
(client/src/__tests__/lib/fixtures/tide_btc_{4h,1h}.json). Run from anywhere: python3 test_parity.py"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(REPO, "scripts"))
import tide_core as C
import tide_live_core as T
import tide_out_in_backtest as bt

def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name, extra)
    if not ok: check.failed = True
check.failed = False

for tf in ("4h", "1h"):
    fx = json.load(open(os.path.join(REPO, "client/src/__tests__/lib/fixtures", f"tide_btc_{tf}.json")))
    a = np.array(fx["candles"], dtype=float)
    t = a[:, 0].astype(np.int64); o, h, l, c, v = a[:, 1], a[:, 2], a[:, 3], a[:, 4], a[:, 5]
    score, *_ = C.tide_series(t, o, h, l, c, v)
    fs = np.array([np.nan if x is None else x for x in fx["score"]])
    both = np.isfinite(score) & np.isfinite(fs)
    check(f"{tf} score finite mask equal", (np.isfinite(score) == np.isfinite(fs)).all(), f"{np.isfinite(score).sum()} vs {np.isfinite(fs).sum()}")
    err = float(np.abs(score[both] - fs[both]).max()) if both.any() else 9
    check(f"{tf} score max abs err < 1e-4", err < 1e-4, f"err={err:.2e}")
    p = fx["preset"]
    eo = C.ema_carry(fs, p["emaPeriod"]); ei = C.ema_carry(fs, p["exitEmaPeriod"])
    check(f"{tf} emaOut parity", np.nanmax(np.abs(eo - np.array([np.nan if x is None else x for x in fx["emaOut"]]))) < 1e-4)
    n = p["pivotN"]
    # reference
    cs = [{"t": int(t[i]), "o": o[i], "h": h[i], "l": l[i], "c": c[i], "v": v[i]} for i in range(len(t))]
    ref = T.causal_divs(cs, list(eo), n, p["belowScore"])
    mine = C.causal_divs(t, C.price_fractals(h, l, n), C.value_fractals(eo, n), n, p["belowScore"])
    check(f"{tf} divs == tide_live_core", [(e["confirm_i"], e["pivot_i"], e["price2"], e["pivot1_i"]) for e in ref] == [(a_, b_, c_, d_) for a_, b_, c_, d_ in mine], f"n={len(mine)}")
    check(f"{tf} divs == TS fixture", [s_["confirmTime"] for s_ in fx["signals"]] == [int(t[e[0]]) for e in mine])
    refp = T.causal_ema_peaks(list(ei), p["exitPivotN"], 0)
    minep = [x[0] for x in C.ema_peaks(C.value_fractals(ei, p["exitPivotN"]), p["exitPivotN"], len(t))]
    check(f"{tf} peaks == tide_live_core", refp == minep, f"n={len(minep)}")
    check(f"{tf} peaks == TS fixture", [int(t[i]) for i in minep] == fx["peaks"])
    # atr stop
    ar = T.atr_series(cs, 14); am = C.atr_stop(h, l, c, 14)
    check(f"{tf} atr14 parity", np.allclose(np.nan_to_num(am), np.nan_to_num(np.array(ar)), atol=1e-9))

# a real-data cross check on a fetched symbol (if data present) incl. many params
dd = os.path.join(HERE, "data")
if os.path.isdir(dd) and os.path.exists(os.path.join(dd, "XRPUSDT_1h.npz")):
    z = np.load(os.path.join(dd, "XRPUSDT_1h.npz")); t, o, h, l, c, v = (z[k] for k in "tohlcv")
    t = t.astype(np.int64)
    cs = [{"t": int(t[i]), "o": o[i], "h": h[i], "l": l[i], "c": c[i], "v": v[i]} for i in range(len(t))]
    import tide_zone_1h_refine as tz
    sc_ref, *_ = tz.tide_series(cs)
    sc, *_ = C.tide_series(t, o, h, l, c, v)
    m = np.isfinite(sc) & np.isfinite(np.array(sc_ref))
    dd_ = np.abs(sc[m] - np.array(sc_ref)[m]); frac = float((dd_ > 1e-6).mean())
    # a handful of bars differ because of float tie-breaking in the rolling percentile (<=) between the two implementations
    check("XRP 1h score vs scripts/tide_zone_1h_refine.tide_series (<0.1% bars differ)", (np.isfinite(sc) == np.isfinite(np.array(sc_ref))).all() and frac < 1e-3, f"mismatched bars={(dd_>1e-6).sum()}/{m.sum()} ({100*frac:.3f}%)")
    for (ep, n, below) in [(8, 3, -20), (21, 8, -40), (13, 5, -10), (55, 8, 0)]:
        eo = C.ema_carry(sc, ep)
        ref = T.causal_divs(cs, list(eo), n, below)
        mine = C.causal_divs(t, C.price_fractals(h, l, n), C.value_fractals(eo, n), n, below)
        check(f"XRP 1h divs ({ep},{n},{below}) == tide_live_core", [(e["confirm_i"], e["pivot_i"], e["price2"], e["pivot1_i"]) for e in ref] == mine, f"n={len(mine)}")
sys.exit(1 if check.failed else 0)
