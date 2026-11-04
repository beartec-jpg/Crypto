"""Part 2: Tether Divergence settings sweep (OAT + 3^9 factorial + Latin hypercube), 1D and 1W.
Measures Bottom-call and Top-call quality (tune 2019-23 vs OOS 2024-26).  python3 part2.py [wide|narrow] [out.json]"""
import sys, json, time, itertools
import numpy as np
import tdlib as T

which = sys.argv[1] if len(sys.argv) > 1 else "wide"
out_path = sys.argv[2] if len(sys.argv) > 2 else f"results/part2_{which}.json"
DAY = 86400
t0 = time.time()
P = T.Panel(which)

class View:
    """Aggregated timeframe view exposing what Panel.score() needs + forward arrays."""
    pass

def make_view(P, tf):
    V = T.Panel.__new__(T.Panel)
    A = P.A
    if tf == "1D":
        V.days = P.days; V.usdtd = P.usdtd; V.c = P.c; V.h = P.h; V.l = P.l; V.o = P.o
        V.warm = 60; V.hz = 30; V.back = 30; V.fwd_ = 60; V.mfe_hz = 30
    else:
        wk = (P.days // DAY + 3) // 7
        uw = np.unique(wk)
        idx = [np.where(wk == w)[0] for w in uw]
        idx = [ix for ix in idx if len(ix) == 7]
        B = len(idx)
        V.days = np.array([P.days[ix[0]] for ix in idx]); V.usdtd = np.array([P.usdtd[ix[-1]] for ix in idx])
        V.c = np.full((A, B), np.nan); V.h = V.c.copy(); V.l = V.c.copy(); V.o = V.c.copy()
        for b, ix in enumerate(idx):
            cc = P.c[:, ix]; ok = ~np.isnan(cc).any(1)
            V.c[ok, b] = cc[ok, -1]; V.h[ok, b] = P.h[:, ix][ok].max(1); V.l[ok, b] = P.l[:, ix][ok].min(1); V.o[ok, b] = P.o[:, ix][ok, 0]
        V.warm = 30; V.hz = 4; V.back = 4; V.fwd_ = 8; V.mfe_hz = 4
    A, D = V.c.shape; V.A = A; V.D = D
    V.first = np.array([int(np.argmax(~np.isnan(V.c[a]))) for a in range(A)])
    V.tune = (V.days >= T.START) & (V.days < T.TUNE_END); V.oos = V.days >= T.TUNE_END
    V._cache = {}
    hz = V.hz
    lc = np.log(V.c)
    fwd = np.full((A, D), np.nan); fwd[:, :D-hz] = lc[:, hz:] - lc[:, :D-hz]; V.fwdh = fwd
    mae = np.full((A, D), np.nan); mfe = np.full((A, D), np.nan)
    for a in range(A):
        lw = np.lib.stride_tricks.sliding_window_view(V.l[a, 1:], hz); hw = np.lib.stride_tricks.sliding_window_view(V.h[a, 1:], hz)
        mae[a, :D-hz] = lw[:D-hz].min(1) / V.c[a, :D-hz] - 1
        mfe[a, :D-hz] = hw[:D-hz].max(1) / V.c[a, :D-hz] - 1
    V.mae = mae; V.mfe = mfe
    # swing low timing in [t-back, t+fwd]
    dl = np.full((A, D), np.nan); pr = np.full((A, D), np.nan)
    W = V.back + V.fwd_ + 1
    for a in range(A):
        sw = np.lib.stride_tricks.sliding_window_view(V.l[a], W)   # window start s covers [s, s+W-1]; centre i = s+back
        ok = ~np.isnan(sw).any(1)
        am = np.argmin(np.where(np.isnan(sw), np.inf, sw), axis=1)
        mn = sw[np.arange(len(sw)), am]
        i = np.arange(len(sw)) + V.back
        dl[a, i] = np.where(ok, am - V.back, np.nan); pr[a, i] = np.where(ok, V.c[a, i] / mn - 1, np.nan)
    V.dlow = dl; V.prem = pr
    # baselines: mean fwd over valid post-warmup bars per asset/period
    V.valid = np.arange(D)[None, :] >= (V.first[:, None] + V.warm)
    V.base = {}
    for pn, m in (("tune", V.tune), ("oos", V.oos)):
        b = np.array([np.nanmean(np.where(V.valid[a] & m, fwd[a], np.nan)) for a in range(A)]); V.base[pn] = b
    V.exc = {pn: fwd - V.base[pn][:, None] for pn in ("tune", "oos")}
    V.sd_all = {pn: float(np.nanstd(np.where(V.valid & m[None, :], V.exc[pn], np.nan))) for pn, m in (("tune", V.tune), ("oos", V.oos))}
    V.pm = {"tune": V.tune, "oos": V.oos}
    return V

MISF = -0.10   # bottom misfire: lowest low within hz bars <= -10%
MISF_TOP = 0.10  # top misfire: highest high within hz bars >= +10%

def metrics(V, ev, side, pn):
    m = ev & V.valid & V.pm[pn][None, :]
    m = m & ~np.isnan(V.fwdh)
    n = int(m.sum())
    r = {"n": n}
    if n == 0: return r
    ex = V.exc[pn][m]; f = V.fwdh[m]; mae = V.mae[m]; mfe = V.mfe[m]
    cols = np.where(m)[1]; ts = np.unique(cols); gap = 10 if V.hz == 30 else 2
    ncl = 1 + int((np.diff(ts) > gap).sum()); r["ncl"] = ncl
    r["exc"] = float(ex.mean())
    r["z"] = float(ex.mean() / (V.sd_all[pn] / np.sqrt(ncl))) if V.sd_all[pn] > 0 else None
    if side == "bottom":
        r["hit"] = float((f > 0).mean()); r["mis"] = float((mae <= MISF).mean()); r["good"] = float(((f > 0) & (mae > MISF)).mean())
        d = V.dlow[m]; d = d[~np.isnan(d)]
        if len(d): r["dlow_med"] = float(np.median(d)); r["prem_med"] = float(np.nanmedian(V.prem[m]))
    else:
        r["q"] = -r["exc"]; r["zq"] = -r["z"] if r["z"] is not None else None
        r["hit"] = float((f < 0).mean()); r["mis"] = float((mfe >= MISF_TOP).mean()); r["good"] = float(((f < 0) & (mfe < MISF_TOP)).mean())
    return r

PAR = dict(T.DEFAULTS)
def run_cfg(V, p):
    sc, top = V.score(p)
    out = {}
    eb = T.crosses(sc, p["bottomThreshold"]); et = T.crosses(top, p["topThreshold"])
    for pn in ("tune", "oos"):
        out[pn] = {"bottom": metrics(V, eb, "bottom", pn), "top": metrics(V, et, "top", pn)}
    return out

def trim(r):
    """flatten to compact row"""
    row = {}
    for pn in ("tune", "oos"):
        for sd in ("bottom", "top"):
            m = r[pn][sd]
            k = f"{pn[0]}{sd[0]}"
            row[k + "_n"] = m.get("n", 0); row[k + "_ncl"] = m.get("ncl", 0)
            row[k + "_q"] = m.get("exc" if sd == "bottom" else "q"); row[k + "_good"] = m.get("good"); row[k + "_mis"] = m.get("mis")
            row[k + "_z"] = m.get("z" if sd == "bottom" else "zq")
            if sd == "bottom": row[k + "_dlow"] = m.get("dlow_med")
    return row

LEVELS = {  # OAT levels  (default marked in DEFAULTS)
    "usdtRsiLen": [5, 7, 10, 14, 20, 28, 40],
    "emaLen": [8, 10, 14, 19, 20, 30, 50],
    "bbLen": [10, 14, 20, 30, 40],
    "bbMult": [1.0, 1.5, 2.0, 2.5, 3.0],
    "emaDistFullPct": [1, 2, 4, 6, 8, 12],
    "wRsi": [0, 0.5, 1, 2, 3], "wEma": [0, 0.5, 1, 2, 3], "wBb": [0, 0.5, 1, 2, 3],
    "coinRsiLen": [5, 7, 10, 14, 21, 30],
    "wStretch": [0.25, 0.5, 1, 2, 4], "wCoin": [0, 0.5, 1, 2, 4],
    "bottomThreshold": [60, 65, 70, 75, 80, 85, 90, 95],
    "topThreshold": [60, 65, 70, 75, 80, 85, 90, 95],
}
# watchThreshold only draws the Watch colour band (and the marker when markerOnCross='watch'): bottomThreshold=60 here IS that case.
FACT = {"usdtRsiLen": [7, 14, 28], "emaLen": [10, 20, 34], "bbLen": [10, 20, 40], "bbMult": [1.5, 2.0, 2.5], "emaDistFullPct": [2, 4, 8],
        "coinRsiLen": [7, 14, 21], "wCoin": [0.5, 1, 2], "bottomThreshold": [75, 80, 85], "topThreshold": [75, 80, 85]}
LHS_RANGES = {"usdtRsiLen": (5, 40, True), "emaLen": (8, 50, True), "bbLen": (10, 40, True), "bbMult": (1.0, 3.0, False), "emaDistFullPct": (1, 12, False),
              "wRsi": (0, 3, False), "wEma": (0, 3, False), "wBb": (0, 3, False), "coinRsiLen": (5, 30, True), "wStretch": (0.25, 4, False), "wCoin": (0, 4, False),
              "bottomThreshold": (60, 95, False), "topThreshold": (60, 95, False)}

def lhs(n, seed=7):
    rng = np.random.default_rng(seed); keys = list(LHS_RANGES); X = np.zeros((n, len(keys)))
    for j in range(len(keys)):
        X[:, j] = (rng.permutation(n) + rng.random(n)) / n
    cfgs = []
    for i in range(n):
        p = dict(PAR)
        for j, k in enumerate(keys):
            lo, hi, isint = LHS_RANGES[k]; v = lo + X[i, j] * (hi - lo)
            p[k] = int(round(v)) if isint else float(v)
        if p["wRsi"] + p["wEma"] + p["wBb"] < 0.3: p["wRsi"] = 1.0
        cfgs.append(p)
    return cfgs

def eta2(vals, y):
    """one-way ANOVA eta^2 of y by group labels"""
    ok = ~np.isnan(y); vals = np.asarray(vals)[ok]; y = y[ok]
    if len(y) < 10: return None
    tot = ((y - y.mean())**2).sum()
    if tot == 0: return 0.0
    ss = 0.0
    for g in np.unique(vals):
        yy = y[vals == g]; ss += len(yy) * (yy.mean() - y.mean())**2
    return float(ss / tot)

def spearman(a, b):
    ok = ~(np.isnan(a) | np.isnan(b)); a = a[ok]; b = b[ok]
    if len(a) < 10: return None
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])

res = {"which": which, "min_events": None, "tf": {}}
NMIN = {"1D": (15, 5), "1W": (6, 3)}

for tf in ("1D", "1W"):
    V = make_view(P, tf)
    print(tf, "bars", V.D, "tune bars", int(V.tune.sum()), "oos bars", int(V.oos.sum()), "valid cells", int(V.valid.sum()), f"{time.time()-t0:.0f}s", flush=True)
    R = {"bars": V.D}
    base = run_cfg(V, PAR); R["default"] = trim(base)
    R["default_full"] = base
    # ---- OAT ----
    oat = {}
    for k, lv in LEVELS.items():
        rows = []
        for v in lv:
            p = dict(PAR); p[k] = v
            if k in ("wRsi", "wEma", "wBb") and p["wRsi"] + p["wEma"] + p["wBb"] == 0: continue
            rows.append({"v": v, **trim(run_cfg(V, p))})
        oat[k] = rows
    R["oat"] = oat
    print(tf, "OAT done", f"{time.time()-t0:.0f}s", flush=True)
    # ---- factorial ----
    keys = list(FACT); fcfg = []
    for combo in itertools.product(*[FACT[k] for k in keys]):
        p = dict(PAR); p.update(dict(zip(keys, combo))); fcfg.append((combo, p))
    frows = [trim(run_cfg(V, p)) for _, p in fcfg]
    print(tf, "factorial", len(fcfg), f"{time.time()-t0:.0f}s", flush=True)
    # ---- LHS ----
    lcfg = lhs(20000 if tf == "1D" else 20000)
    lrows = [trim(run_cfg(V, p)) for p in lcfg]
    print(tf, "LHS", len(lcfg), f"{time.time()-t0:.0f}s", flush=True)

    def arr(rows, k): return np.array([np.nan if r[k] is None else r[k] for r in rows], dtype=float)
    ntb, nob = NMIN[tf]
    sens = {}
    # factorial sensitivity (exact levels)
    def sens_block(rows, getvals, keys_, label):
        o = {}
        for side, qk, nk in (("bottom", "tb_q", "tb_n"), ("top", "tt_q", "tt_n")):
            for per, pre in (("tune", "t"), ("oos", "o")):
                y = arr(rows, f"{pre}{side[0]}_q"); n = arr(rows, f"{pre}{side[0]}_n")
                need = ntb if per == "tune" else nob
                y = np.where(n >= need, y, np.nan)
                o[f"{side}_{per}"] = {k: eta2(getvals(k), y) for k in keys_}
            # event-count sensitivity
            n = arr(rows, f"t{side[0]}_n")
            o[f"{side}_nevents"] = {k: eta2(getvals(k), n) for k in keys_}
        return o
    fvals = {k: [c[i] for c, _ in fcfg] for i, k in enumerate(keys)}
    sens["factorial"] = sens_block(frows, lambda k: np.array(fvals[k]), keys, "fact")
    # marginal means (factorial) -- tune and OOS
    marg = {}
    for k in keys:
        mm = {}
        for side in ("bottom", "top"):
            for per, pre in (("tune", "t"), ("oos", "o")):
                y = arr(frows, f"{pre}{side[0]}_q"); n = arr(frows, f"{pre}{side[0]}_n")
                need = ntb if per == "tune" else nob
                y = np.where(n >= need, y, np.nan)
                mm[f"{side}_{per}"] = {str(v): (float(np.nanmean(y[np.array(fvals[k]) == v])) if np.isfinite(y[np.array(fvals[k]) == v]).any() else None) for v in FACT[k]}
                mm[f"{side}_{per}_n"] = {str(v): float(np.nanmean(n[np.array(fvals[k]) == v])) for v in FACT[k]}
        marg[k] = mm
    R["factorial_marginals"] = marg
    # LHS sensitivity: bin continuous params into 5 quantile bins
    keysL = list(LHS_RANGES)
    lv = {k: np.array([p[k] for p in lcfg]) for k in keysL}
    lbin = {}
    for k in keysL:
        q = np.quantile(lv[k], [0.2, 0.4, 0.6, 0.8]); lbin[k] = np.digitize(lv[k], q)
    sens["lhs"] = sens_block(lrows, lambda k: lbin[k], keysL, "lhs")
    # LHS binned marginals
    lm = {}
    for k in keysL:
        mm = {}
        for side in ("bottom", "top"):
            for per, pre in (("tune", "t"), ("oos", "o")):
                y = arr(lrows, f"{pre}{side[0]}_q"); n = arr(lrows, f"{pre}{side[0]}_n")
                need = ntb if per == "tune" else nob
                y = np.where(n >= need, y, np.nan)
                mm[f"{side}_{per}"] = [float(np.nanmean(y[lbin[k] == b])) if np.isfinite(y[lbin[k] == b]).any() else None for b in range(5)]
            mm["nevents_tune_" + side] = [float(np.nanmean(arr(lrows, f"t{side[0]}_n")[lbin[k] == b])) for b in range(5)]
        mm["bin_edges"] = [float(lv[k].min())] + [float(x) for x in np.quantile(lv[k], [0.2, 0.4, 0.6, 0.8])] + [float(lv[k].max())]
        lm[k] = mm
    R["lhs_marginals"] = lm
    R["sensitivity"] = sens
    # tune -> OOS persistence
    pers = {}
    for side in ("bottom", "top"):
        for name, rows in (("factorial", frows), ("lhs", lrows)):
            yt = arr(rows, f"t{side[0]}_q"); yo = arr(rows, f"o{side[0]}_q")
            nt = arr(rows, f"t{side[0]}_n"); no = arr(rows, f"o{side[0]}_n")
            ok = (nt >= ntb) & (no >= nob)
            yt2 = np.where(ok, yt, np.nan); yo2 = np.where(ok, yo, np.nan)
            d = {"rank_corr_tune_oos": spearman(yt2, yo2), "n_cfg": int(ok.sum())}
            if ok.sum() > 50:
                order = np.argsort(-np.where(ok, yt, -np.inf)); top1 = order[:max(5, int(ok.sum() * 0.01))]
                d["top1pct_tune_q"] = float(np.nanmean(yt[top1])); d["top1pct_oos_q"] = float(np.nanmean(yo[top1]))
                d["all_tune_q"] = float(np.nanmean(yt2)); d["all_oos_q"] = float(np.nanmean(yo2))
                # share of configs with tune>0 that stay >0 OOS
                pos = ok & (yt > 0); d["pos_tune_stays_pos_oos"] = float((yo[pos] > 0).mean()) if pos.any() else None
                d["default_pctile_tune"] = None
            pers[f"{side}_{name}"] = d
    R["persistence"] = pers
    # best configs by tune quality (LHS) with their OOS
    best = {}
    for side in ("bottom", "top"):
        yt = arr(lrows, f"t{side[0]}_q"); yo = arr(lrows, f"o{side[0]}_q"); nt = arr(lrows, f"t{side[0]}_n"); no = arr(lrows, f"o{side[0]}_n")
        ok = (nt >= ntb) & (no >= nob)
        order = np.argsort(-np.where(ok, yt, -np.inf))[:8]
        best[side] = [{"params": {k: lcfg[i][k] for k in keysL}, **{kk: lrows[i][kk] for kk in lrows[i] if kk.startswith("t" + side[0]) or kk.startswith("o" + side[0])}} for i in order]
    R["best_by_tune"] = best
    R["lhs_default_context"] = {side: {"lhs_median_tune_q": float(np.nanmedian(arr(lrows, f"t{side[0]}_q"))), "lhs_median_oos_q": float(np.nanmedian(arr(lrows, f"o{side[0]}_q")))} for side in ("bottom", "top")}
    res["tf"][tf] = R
res["nmin"] = NMIN
res["elapsed_s"] = time.time() - t0
json.dump(res, open(out_path, "w"), indent=1, default=float)
print("saved", out_path, f"{time.time()-t0:.0f}s")
