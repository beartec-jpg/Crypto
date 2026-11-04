"""Event-driven Tide backtest engine (one position per symbol at a time, next-open fills).

Config = flat dict (see KEYS).  evaluate(tf_syms, cfg, cost) -> metrics row (in-sample / out-of-sample split,
per-year aggregates for walk-forward).
Execution model (mirrors scripts/tide_live_core.sim + buildTideTrades):
  * signal confirmed on bar e (close) -> fill at open of e+1, stop under the pivot low
  * exit-signal (Tide in / Pull / Distribution / cross) seen on bar x close -> exit at open of x+1 (checked before the stop on that bar)
  * stop hit (low <= stop) -> exit at min(stop, open) [gap-through is filled at the open]
  * time exit after maxhold bars at the close (1h 48 / 4h 18 bars, as the repo research)
  * costs: fee + slippage per side on every fill, extra slippage on stop-market exits
"""
import math, os
from bisect import bisect_left
import numpy as np
import tide_core as C
from tide_core import SPLIT, WARMUP

MAXHOLD = {"1h": 48, "4h": 18}
WHY = {0: "signal", 1: "stop", 2: "time", 3: "pull", 4: "be_stop"}
COST_SIDE = 0.00095      # 7.5 bp taker fee + 2 bp slippage per side
STOP_EXTRA = 0.0005      # extra 5 bp slippage on a stop-market fill
YEARS = list(range(2019, 2027))

class Sym:
    """One symbol/timeframe with lazily cached series."""
    def __init__(self, name, tf, a):
        self.name, self.tf = name, tf
        self.t = a["t"].astype(np.int64); self.o, self.h, self.l, self.c, self.v = (a[k].astype(float) for k in "ohlcv")
        self.n = len(self.t)
        self.score, self.tide, self.energy, self.tape = C.tide_series(self.t, self.o, self.h, self.l, self.c, self.v)
        self.ol, self.hl, self.ll, self.cl = self.o.tolist(), self.h.tolist(), self.l.tolist(), self.c.tolist()
        self.atr = C.atr_stop(self.h, self.l, self.c, 14).tolist()
        self.rsi = C.rsi_wilder(self.c, 14)
        self._c = {}
    def _get(self, key, fn):
        v = self._c.get(key)
        if v is None:
            v = self._c[key] = fn()
        return v
    def ema(self, p): return self._get(("ema", p), lambda: C.ema_carry(self.score, p))
    def emal(self, p): return self._get(("emal", p), lambda: self.ema(p).tolist())
    def pema(self, L): return self._get(("pema", L), lambda: C.ema_seed0(self.c, L).tolist())
    def pfr(self, n): return self._get(("pfr", n), lambda: C.price_fractals(self.h, self.l, n))
    def efr(self, p, n): return self._get(("efr", p, n), lambda: C.value_fractals(self.ema(p), n))
    def divs(self, p, n, below):
        def f():
            ev = C.causal_divs(self.t, self.pfr(n), self.efr(p, n), n, below)
            out = []
            for (ci, pi, plow, p1) in ev:
                w = self.rsi[pi:ci + 1]; w = w[np.isfinite(w)]
                rp = bool(len(w) and w.min() < 30)
                out.append((ci, pi, plow, rp))
            return out
        return self._get(("divs", p, n, below), f)
    def peaks(self, p, n):
        def f():
            pk = C.ema_peaks(self.efr(p, n), n, self.n)
            return pk, [x[0] for x in pk]
        return self._get(("peaks", p, n), f)
    def xdown(self, f, s):
        return self._get(("xdown", f, s), lambda: C.cross_down_bars(self.ema(f), self.ema(s)))
    def zero_down(self):
        def fn():
            sc = self.score
            with np.errstate(invalid="ignore"):
                x = (sc[:-1] > 0) & (sc[1:] <= 0)
            return (np.flatnonzero(x) + 1).tolist()
        return self._get(("zero",), fn)
    # ---- Tide absorption (bottoms) and distribution (tops), from tideZone.ts 'tell' (price/score/tape part) ----
    def _hilo16(self):
        def f():
            W = np.lib.stride_tricks.sliding_window_view
            pad_h = np.concatenate([np.full(C.SWING - 1, np.nan), self.h]); pad_l = np.concatenate([np.full(C.SWING - 1, np.nan), self.l])
            return np.nanmax(W(pad_h, C.SWING), 1), np.nanmin(W(pad_l, C.SWING), 1)
        return self._get(("hilo",), f)
    def absorb_bars(self, near=C.NEAR_PIVOT):
        """Absorb tell: price down/flat, tape up, and (score crosses up through 0, or score up while near the 16-bar low)."""
        def f():
            hi16, lo16 = self._hilo16()
            c, sc, tp = self.c, self.score, self.tape
            ok = np.zeros(self.n, bool)
            with np.errstate(invalid="ignore"):
                pxd = c[1:] <= c[:-1]; tup = tp[1:] > tp[:-1]; sup = sc[1:] > sc[:-1]
                zc = (sc[:-1] < 0) & (sc[1:] >= 0)
                nl = c[1:] <= lo16[1:] * (1 + near)
                ok[1:] = pxd & tup & (zc | (sup & nl))
            return ok
        return self._get(("absorb", near), f)
    def absorb_recent(self, k):
        def f():
            a = self.absorb_bars().astype(np.int32); cs = np.concatenate([[0], np.cumsum(a)])
            idx = np.arange(self.n); lo = np.maximum(0, idx - k + 1)
            return ((cs[idx + 1] - cs[lo]) > 0).tolist()
        return self._get(("absrec", k), f)
    def dist_bars(self, near=C.NEAR_PIVOT, need_tape=True, min_score=0):
        """Distribution (top) tell without OI: near the 16-bar high, score falling (and tape falling), score was >= min_score."""
        def f():
            hi16, lo16 = self._hilo16()
            c, sc, tp = self.c, self.score, self.tape
            with np.errstate(invalid="ignore"):
                x = (c[1:] >= hi16[1:] * (1 - near)) & (sc[1:] < sc[:-1]) & (sc[:-1] >= min_score)
                if need_tape: x &= tp[1:] < tp[:-1]
            return (np.flatnonzero(x) + 1).tolist()
        return self._get(("dist", near, need_tape, min_score), f)
    def swing_low(self, k=8):
        def f():
            W = np.lib.stride_tricks.sliding_window_view
            pad = np.concatenate([np.full(k - 1, np.nan), self.l])
            w = W(pad, k)
            am = np.nanargmin(np.where(np.isnan(w), np.inf, w), 1)
            return (np.arange(self.n) - (k - 1) + am), np.nanmin(np.where(np.isnan(w), np.inf, w), 1)
        return self._get(("swl", k), f)

# ───────────────────────── alternative entry families ─────────────────────────

def alt_entries(S, cfg):
    """Entries for non-divergence families: list of (confirm_i, pivot_i, pivot_low, rsiplus=False)."""
    fam = cfg["ent"]
    n = S.n; c = S.c
    if fam == "slope":      # long tide-EMA slope turns up over nb bars while price is still lower than nb bars ago
        L, nb, below, drop = cfg["a1"], cfg["a2"], cfg["a3"], cfg["a4"]
        se = S.ema(L)
        up = np.zeros(n, bool)
        with np.errstate(invalid="ignore"):
            up[nb:] = se[nb:] > se[:-nb]
        turn = np.zeros(n, bool); turn[1:] = up[1:] & ~up[:-1]
        cond = turn.copy()
        with np.errstate(invalid="ignore"):
            if below < 0: cond &= se < below
            if drop:
                d = np.zeros(n, bool); d[nb:] = c[nb:] < c[:-nb]; cond &= d
    elif fam == "cross":    # fast tide-EMA crosses above slow, from oversold; optional price still lower than 5 bars ago
        f, s, below, drop = cfg["a1"], cfg["a2"], cfg["a3"], cfg["a4"]
        ef, es = S.ema(f), S.ema(s)
        cond = np.zeros(n, bool)
        cu = C.cross_up_bars(ef, es)
        cond[cu] = True
        with np.errstate(invalid="ignore"):
            if below < 0: cond &= ef < below
            if drop:
                d = np.zeros(n, bool); d[5:] = c[5:] < c[:-5]; cond &= d
    elif fam == "absorb":   # Tide absorption tell, optionally only when the score is oversold
        below = cfg["a3"]
        cond = S.absorb_bars().copy()
        with np.errstate(invalid="ignore"):
            if below < 0: cond &= S.score < below
    else:
        raise ValueError(fam)
    idx = np.flatnonzero(cond)
    sw_i, sw_lo = S.swing_low(8)
    return [(int(i), int(sw_i[i]), float(sw_lo[i]), False) for i in idx if i < n - 1]

def entries_for(S, cfg):
    if cfg["ent"] == "div":
        return S.divs(cfg["e_ema"], cfg["e_n"], cfg["e_below"])
    return S._get(("alt", cfg["ent"], cfg["a1"], cfg["a2"], cfg["a3"], cfg["a4"]), lambda: alt_entries(S, cfg))

# ───────────────────────── simulation ─────────────────────────

def first_signal_bar(S, cfg, fill, e):
    """Earliest exit-signal bar x (exit at open of x+1) among the configured exit signals, or None."""
    xk = cfg.get("x_kind", "tidein"); best = None
    if xk == "tidein":
        pk, keys = S.peaks(cfg["x_ema"], cfg["x_n"])
        mn = cfg.get("x_min"); after = cfg.get("x_after"); hold = cfg.get("x_hold") or 0
        for k in range(bisect_left(keys, fill + hold), len(pk)):
            ci, val, pi = pk[k]
            if after and pi <= e: continue
            if mn is not None and val < mn: continue
            best = ci; break
    elif xk == "zero":
        xs = S.zero_down(); k = bisect_left(xs, fill); best = xs[k] if k < len(xs) else None
    elif xk == "xdown":
        xs = S.xdown(cfg["x_f"], cfg["x_s"]); k = bisect_left(xs, fill); best = xs[k] if k < len(xs) else None
    if cfg.get("dist"):
        xs = S.dist_bars(cfg.get("d_near", C.NEAR_PIVOT), bool(cfg.get("d_tape", 1)), cfg.get("d_min", 0))
        k = bisect_left(xs, fill)
        if k < len(xs) and (best is None or xs[k] < best): best = xs[k]
    return best

def simulate(S, cfg):
    """-> list of (confirm_i, fill_i, exit_j, gross_return, why)"""
    n = S.n; ol, hl, ll, cl = S.ol, S.hl, S.ll, S.cl
    entries = entries_for(S, cfg)
    maxhold = cfg.get("maxhold") or MAXHOLD[S.tf]
    sk, sv = cfg["stop_kind"], cfg["stop_val"]
    cd = cfg.get("cd") or 0
    rearm = cfg.get("rearm")
    tk, tL, tn = cfg.get("trend_kind"), cfg.get("trend_L"), cfg.get("trend_n")
    rsip = cfg.get("rsip"); absc = cfg.get("absc")
    pk = cfg.get("pull_kind")
    pema = S.pema(tL) if tk == "TP" else None
    sema = S.emal(tL) if tk == "TS" else None
    rarm_s = S.emal(5) if rearm is not None else None
    absrec = S.absorb_recent(absc) if absc else None
    if pk:
        mode = cfg.get("pull_mode", "exit"); pX = cfg["pull_X"]
        Sp = S.emal(cfg["pull_ps"]) if pk in ("peak", "cross") else S.emal(cfg["pull_pf"])
        Ss = S.emal(cfg["pull_pslow"]) if pk == "xema" else None
        pY = cfg.get("pull_Y"); pn = cfg.get("pull_n"); pZ = cfg.get("pull_Z")
    parm = cfg.get("prot_arm"); ptrail = cfg.get("prot_trail")   # profit protection: once a bar's high is >= entry*(1+arm), stop -> breakeven(+0.15%) and optionally trails ptrail below the running high
    out = []
    tnext = WARMUP; last_exit = -10**9; prev_fill = None
    for (e, pivot_i, plow, rp) in entries:
        if e < WARMUP or e < tnext: continue
        if cd and e - last_exit < cd: continue
        if rsip and not rp: continue
        if absrec is not None and not absrec[e]: continue
        if tk == "TP":
            if e < tn: continue
            if cl[e] < pema[e] and pema[e] < pema[e - tn]: continue
        elif tk == "TS":
            if e < tn: continue
            if not (sema[e] > sema[e - tn]): continue
        if rearm is not None and prev_fill is not None:
            seg = rarm_s[prev_fill:e + 1]
            if not seg or max(seg) < rearm: continue
        fill = e + 1
        if fill >= n: break
        entry = ol[fill]
        a = S.atr[e]
        if a != a: a = entry * 0.01
        if sk == "atr": sp = plow - sv * a
        elif sk == "pct": sp = plow * (1 - sv)
        else: sp = entry * (1 - sv)
        if sp >= entry: sp = min(plow, entry * 0.995)
        x = first_signal_bar(S, cfg, fill, e)
        xs_j = x + 1 if x is not None else None
        stop = sp; be = False; pull_x = None
        end = fill + maxhold
        if end > n - 1: end = n - 1
        j = fill; res = None
        peak_run = -1e18
        while j <= end:
            if xs_j is not None and j == xs_j: res = (j, ol[j], 0); break
            if pull_x is not None and j == pull_x: res = (j, ol[j], 3); break
            if ll[j] <= stop:
                px = stop if stop < ol[j] else ol[j]
                res = (j, px, 4 if be else 1); break
            if j - fill >= maxhold: res = (j, cl[j], 2); break
            if pk and pull_x is None and not be:
                v = Sp[j]
                if v > peak_run: peak_run = v
                trig = False
                if pk == "peak":
                    lo = j - pn + 1
                    if lo < fill: lo = fill
                    wmax = max(Sp[lo:j + 1])
                    trig = wmax >= pX and wmax - v >= pY
                elif pk == "cross":
                    trig = peak_run >= pX and v < pZ
                elif pk == "xema":
                    trig = peak_run >= pX and v < Ss[j]
                if trig:
                    if mode == "exit": pull_x = j + 1
                    else:
                        be = True; stop = max(stop, entry * 1.0015)
            if parm:
                if hl[j] >= entry * (1 + parm):
                    be = True
                    if entry * 1.0015 > stop: stop = entry * 1.0015
                    if ptrail:
                        hh = max(hl[fill:j + 1]); ts = hh * (1 - ptrail)
                        if ts > stop: stop = ts
            j += 1
        if res is None:
            break    # still open at end of data
        jx, px, why = res
        out.append((e, fill, jx, px / entry - 1, why))
        tnext = jx; last_exit = jx; prev_fill = fill
    return out

# ───────────────────────── aggregation ─────────────────────────

def _eq_dd(rets):
    eq = pk = 1.0; dd = 0.0
    for r in rets:
        eq *= 1 + r
        if eq > pk: pk = eq
        d = eq / pk - 1
        if d < dd: dd = d
    return eq - 1, dd

def aggregate(per_sym, cost=COST_SIDE, stop_extra=STOP_EXTRA):
    """per_sym: {name: (te array of confirm times, gross array, why array, bars array)} -> flat metrics dict."""
    row = {}
    pooled = {"is": [], "oos": []}
    yr = {y: np.zeros(7) for y in YEARS}      # n, wins, sum, gp, gl, stops, sumsq
    sym_tot = {"is": [], "oos": []}; sym_dd = {"is": [], "oos": []}; sympos = 0; symn = 0
    stops = {"is": 0, "oos": 0}; bars = {"is": [], "oos": []}
    for name, (te, g, why, nb) in per_sym.items():
        if len(te) == 0:
            for era in ("is", "oos"): sym_tot[era].append(0.0); sym_dd[era].append(0.0)
            continue
        net = g - 2 * cost - np.where((why == 1) | (why == 4), stop_extra, 0.0)
        isstop = (why == 1) | (why == 4)
        for era, m in (("is", te < SPLIT), ("oos", te >= SPLIT)):
            r = net[m]
            pooled[era].append(r); stops[era] += int(isstop[m].sum()); bars[era].append(nb[m])
            tot, dd = _eq_dd(r.tolist()) if len(r) else (0.0, 0.0)
            sym_tot[era].append(tot); sym_dd[era].append(dd)
            if era == "oos" and m.sum() >= 3:
                symn += 1; sympos += int(r.mean() > 0)
        years = (np.array(te, dtype="datetime64[s]").astype("datetime64[Y]").astype(int) + 1970)
        for y in np.unique(years):
            if y not in yr: continue
            mm = years == y; r = net[mm]
            a = yr[y]
            a += np.array([len(r), (r > 0).sum(), r.sum(), r[r > 0].sum(), -r[r <= 0].sum(), isstop[mm].sum(), (r * r).sum()])
    for era in ("is", "oos"):
        r = np.concatenate(pooled[era]) if pooled[era] else np.zeros(0)
        n = len(r)
        row[f"{era}_n"] = n
        if n:
            gp = r[r > 0].sum(); gl = -r[r <= 0].sum()
            sd = r.std(ddof=1) if n > 1 else 0.0
            row[f"{era}_wr"] = 100 * (r > 0).mean()
            row[f"{era}_avg"] = 100 * r.mean()
            row[f"{era}_pf"] = gp / gl if gl > 1e-12 else (99.0 if gp > 0 else 0.0)
            row[f"{era}_t"] = r.mean() / (sd / math.sqrt(n)) if sd > 0 else 0.0
            row[f"{era}_stop"] = 100 * stops[era] / n
            row[f"{era}_bars"] = float(np.concatenate(bars[era]).mean())
        else:
            for k in ("wr", "avg", "pf", "t", "stop", "bars"): row[f"{era}_{k}"] = 0.0
        row[f"{era}_tot"] = 100 * float(np.mean(sym_tot[era])) if sym_tot[era] else 0.0
        row[f"{era}_dd"] = 100 * float(np.mean(sym_dd[era])) if sym_dd[era] else 0.0
        row[f"{era}_ddw"] = 100 * float(np.min(sym_dd[era])) if sym_dd[era] else 0.0
    row["oos_sympos"] = sympos; row["oos_symn"] = symn
    for y in YEARS:
        a = yr[y]
        row[f"y{y}_n"], row[f"y{y}_w"], row[f"y{y}_sum"], row[f"y{y}_gp"], row[f"y{y}_gl"], row[f"y{y}_stop"], row[f"y{y}_sq"] = (float(x) for x in a)
    return row

def evaluate(syms, cfg, cost=COST_SIDE, stop_extra=STOP_EXTRA, want_trades=False):
    per = {}; trades = {}
    for name, S in syms.items():
        tr = simulate(S, cfg)
        trades[name] = tr
        if tr:
            te = S.t[[x[0] for x in tr]]
            per[name] = (te, np.array([x[3] for x in tr]), np.array([x[4] for x in tr]), np.array([x[2] - x[1] for x in tr]))
        else:
            per[name] = (np.zeros(0, np.int64), np.zeros(0), np.zeros(0, int), np.zeros(0))
    row = aggregate(per, cost, stop_extra)
    return (row, trades) if want_trades else row
