#!/usr/bin/env python3
"""Part 1: Tether Bottom + token daily bullish divergence (price lower low / RSI higher low) ladder."""
import sys, json, itertools, time, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tdlib as T

which = sys.argv[1] if len(sys.argv) > 1 else "wide"
out_path = sys.argv[2] if len(sys.argv) > 2 else f"results/part1_{which}.json"
os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
P = T.Panel(which)
sc, top = P.score()
B = T.crosses(sc, 80.0)
B[:, P.days < T.START] = False
bottoms = [[int(i) for i in np.where(B[a])[0]] for a in range(P.A)]
print("raw Bottom crosses per asset", [len(x) for x in bottoms], flush=True)

OSC = {"rsi": P.coin_rsi(14), "score": top}     # score-osc: 100-score (low at bottoms) so 'higher low' = score lower high
KS = (3, 5, 8); NS = (10, 20, 40, 60); XS = (0.05, 0.10, 0.20, None)

divs = {}
for o, k in itertools.product(OSC, KS):
    divs[(o, k)] = [T.bullish_divs(P.l[a], OSC[o][a], k) for a in range(P.A)]
    print("divs", o, k, [len(x) for x in divs[(o, k)]], flush=True)

def good(P, a, i):
    f = P.fwd[30][a, i]; m = P.mae[30][a, i]
    if np.isnan(f) or np.isnan(m): return None
    return bool(f > 0 and m > -0.10)
def misfire(P, a, i):
    m = P.mae[30][a, i]
    return None if np.isnan(m) else bool(m <= -0.10)

def simulate(o, k, N, X):
    zones = []; control = []
    for a in range(P.A):
        ds = divs[(o, k)][a]  # (confirm, p2, p1) sorted by confirm
        conf = [d[0] for d in ds]
        i_end = -1
        for b in bottoms[a]:
            if b <= i_end: continue     # still inside active zone (ignored for zone purposes)
            end = b + N; broken = False
            if X is not None:
                lim = P.c[a, b] * (1 - X)
                seg = P.l[a, b+1:min(P.D, b+N+1)]
                brk = np.where(seg < lim)[0]
                if len(brk): end = b + 1 + int(brk[0]); broken = True   # first invalidating bar t; zone alive for c < t
            end = min(end, P.D - 1)
            live = [c for c in conf if b <= c < end] if broken else [c for c in conf if b <= c <= end]
            zones.append(dict(a=a, b=b, end=end, divs=live))
            i_end = end
    # control: divergences not inside any zone (zone span [b, end])
    spans = {a: [(z["b"], z["end"]) for z in zones if z["a"] == a] for a in range(P.A)}
    for a in range(P.A):
        for c, _, _ in divs[(o, k)][a]:
            if c < 0 or any(s <= c <= e for s, e in spans[a]): continue
            control.append((a, c))
    return zones, control

PERIODS = ("tune", "oos")
def compact(st):
    keys = ["n", "n_clusters", "n30", "exc30_mean", "ret30_med", "hit30", "exc14_mean", "exc60_mean", "ret7_med", "ret14_med", "ret60_med",
            "hit7", "hit14", "hit60", "mae30_med", "mae60_med", "mae30_p10", "recover60", "recover_days_med", "days_to_low_med",
            "frac_low_ahead", "frac_low_already", "premium_over_low_med"]
    return {k: st.get(k) for k in keys}

def analyse(o, k, N, X, full=False):
    zones, control = simulate(o, k, N, X)
    sets = {"zone_start": [(z["a"], z["b"]) for z in zones],
            "zone_nodiv": [(z["a"], z["b"]) for z in zones if not z["divs"]],
            "zone_div": [(z["a"], z["b"]) for z in zones if z["divs"]],
            "x1": [(z["a"], z["divs"][0]) for z in zones if len(z["divs"]) >= 1],
            "x2": [(z["a"], z["divs"][1]) for z in zones if len(z["divs"]) >= 2],
            "x3": [(z["a"], z["divs"][2]) for z in zones if len(z["divs"]) >= 3],
            "x4plus": [(z["a"], c) for z in zones for c in z["divs"][3:]],
            "div_outside_zone": control}
    res = {}
    for pn in PERIODS:
        r = {}
        for nm, ev in sets.items():
            r[nm] = compact(T.event_stats(P, ev, pn))
        # misfire / good-call rates + paired confirm-vs-raw comparison
        mask = P.tune if pn == "tune" else P.oos
        zs = [z for z in zones if mask[z["b"]]]
        def rate(fn, evs):
            v = [fn(P, a, i) for a, i in evs]; v = [x for x in v if x is not None]
            return (float(np.mean(v)), len(v)) if v else (None, 0)
        for nm in ("zone_start", "zone_nodiv", "zone_div", "x1", "x2", "x3"):
            ev = [(a, i) for a, i in sets[nm] if mask[i]]
            r[nm]["misfire_rate"], r[nm]["misfire_n"] = rate(misfire, ev)
            r[nm]["good_rate"], r[nm]["good_n"] = rate(good, ev)
        # paired: for zones with a div and fwd30 at both b and x1
        pr = []
        for z in zs:
            if z["divs"]:
                c = z["divs"][0]
                fb = P.fwd[30][z["a"], z["b"]]; fc = P.fwd[30][z["a"], c]
                if not (np.isnan(fb) or np.isnan(fc)): pr.append((fb, fc, c - z["b"], P.c[z["a"], c] / P.c[z["a"], z["b"]] - 1))
        r["paired"] = {"n": len(pr),
                       "x1_delay_days_med": float(np.median([p[2] for p in pr])) if pr else None,
                       "price_x1_vs_bottom_med": float(np.median([p[3] for p in pr])) if pr else None,
                       "fwd30_from_bottom_mean": float(np.mean([p[0] for p in pr])) if pr else None,
                       "fwd30_from_x1_mean": float(np.mean([p[1] for p in pr])) if pr else None}
        r["n_zones"] = len(zs); r["zones_with_div_frac"] = float(np.mean([bool(z["divs"]) for z in zs])) if zs else None
        r["ladder_counts"] = {"0": sum(1 for z in zs if len(z["divs"]) == 0), "1": sum(1 for z in zs if len(z["divs"]) == 1),
                              "2": sum(1 for z in zs if len(z["divs"]) == 2), "3+": sum(1 for z in zs if len(z["divs"]) >= 3)}
        res[pn] = r
    if full:
        res["_zones"] = zones
        res["_sets"] = sets
    return res

# plain Bottom (all crosses) + all-days baseline
plain_ev = [(a, i) for a in range(P.A) for i in bottoms[a]]
allbase = {}
res = {"which": which, "plain": {}, "baseline": {}, "grid": []}
for pn in PERIODS:
    res["plain"][pn] = compact(T.event_stats(P, plain_ev, pn))
    mask = P.tune if pn == "tune" else P.oos
    v = [(a, i) for a in range(P.A) for i in range(P.first[a] + 60, P.D) if mask[i] and not np.isnan(P.fwd[30][a, i])]
    res["baseline"][pn] = {"n30": len(v), "ret30_med": float(np.expm1(np.median([P.fwd[30][a, i] for a, i in v]))),
                           "hit30": float(np.mean([P.fwd[30][a, i] > 0 for a, i in v])), "mae30_med": float(np.median([P.mae[30][a, i] for a, i in v])),
                           "misfire_rate": float(np.mean([P.mae[30][a, i] <= -0.10 for a, i in v]))}
    ev = [(a, i) for a, i in plain_ev if mask[i]]
    res["plain"][pn]["misfire_rate"] = float(np.mean([m for m in (misfire(P, a, i) for a, i in ev) if m is not None]))
    res["plain"][pn]["good_rate"] = float(np.mean([m for m in (good(P, a, i) for a, i in ev) if m is not None]))
print("plain", json.dumps(res["plain"]["tune"])[:300], flush=True)

t0 = time.time()
for o, k, N, X in itertools.product(OSC, KS, NS, XS):
    r = analyse(o, k, N, X)
    res["grid"].append({"osc": o, "k": k, "N": N, "X": X, "res": r})
print("grid done", len(res["grid"]), round(time.time() - t0), "s", flush=True)

# headline (pre-declared): RSI14 osc, k=5, N=40, X=20%  -> full detail incl. bootstrap CIs
r = analyse("rsi", 5, 40, 0.20, full=True)
zones = r.pop("_zones"); sets = r.pop("_sets")
res["headline_cfg"] = dict(osc="rsi", k=5, N=40, X=0.20)
res["headline"] = r
res["headline_ci"] = {}
for nm in ("zone_start", "zone_nodiv", "zone_div", "x1", "x2", "x3", "div_outside_zone"):
    res["headline_ci"][nm] = {pn: T.month_boot_ci(P, sets[nm], pn, 30) for pn in PERIODS}
res["headline_ci"]["plain"] = {pn: T.month_boot_ci(P, plain_ev, pn, 30) for pn in PERIODS}
# per-asset counts, example zones
res["headline_zone_examples"] = [dict(sym=P.syms[z["a"]], bottom=time.strftime("%F", time.gmtime(int(P.days[z["b"]]))), n_div=len(z["divs"]),
                                      x1=time.strftime("%F", time.gmtime(int(P.days[z["divs"][0]]))) if z["divs"] else None) for z in zones[-40:]]
# XRP spot-checks for Scott's two screenshots: Bottom dates around 2026-02 / 2026-05..2026-06
xa = P.syms.index("XRPUSDT")
res["xrp_zones_2026"] = [dict(bottom=time.strftime("%F", time.gmtime(int(P.days[z["b"]]))), end=time.strftime("%F", time.gmtime(int(P.days[z["end"]]))),
                              divs=[time.strftime("%F", time.gmtime(int(P.days[c]))) for c in z["divs"]]) for z in zones if z["a"] == xa and P.days[z["b"]] >= 1767225600]
json.dump(res, open(out_path, "w"), indent=1, default=float)
print("saved", out_path)
