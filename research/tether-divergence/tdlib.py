"""Tether Divergence backtest library (research only; mirrors client/src/lib/indicators/tetherDivergence.ts).
Daily bars from Binance 1h klines (UTC day, full 24-bar days only). USDT.D from Coin Metrics basket proxy.
"""
import json, os, time, numpy as np
from functools import lru_cache
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("TD_DATA", os.path.join(HERE, "data"))
GRID = os.environ.get("TIDE_GRID_DATA", os.path.join(HERE, "data"))
SYMS = ["BTCUSDT","ETHUSDT","XRPUSDT","SOLUSDT","BNBUSDT","DOGEUSDT","ADAUSDT","LINKUSDT"]
TUNE_END = 1704067200  # 2024-01-01 UTC: tune < this <= OOS
START = 1546300800     # 2019-01-01 signals start
DAY = 86400

DEFAULTS = dict(usdtRsiLen=14, coinRsiLen=14, emaLen=20, bbLen=20, bbMult=2.0, emaDistFullPct=4.0,
                wRsi=1.0, wEma=1.0, wBb=1.0, wStretch=1.0, wCoin=1.0, bottomThreshold=80.0,
                watchThreshold=60.0, topThreshold=80.0)

def rsi_wilder(x, n):
    """x 1-D float array, NaN allowed at the front (leading). Returns RSI with NaN warm-up (first value at first_valid+n)."""
    out = np.full(len(x), np.nan)
    ok = np.where(~np.isnan(x))[0]
    if len(ok) == 0: return out
    s = ok[0]; y = x[s:]
    if len(y) <= n: return out
    d = np.diff(y)
    g = np.maximum(d, 0); l = np.maximum(-d, 0)
    ag = g[:n].mean(); al = l[:n].mean()
    o = np.full(len(y), np.nan)
    o[n] = 100.0 if al == 0 else 100 - 100/(1 + ag/al)
    for k in range(n, len(d)):
        ag = (ag*(n-1) + g[k])/n; al = (al*(n-1) + l[k])/n
        o[k+1] = 100.0 if al == 0 else 100 - 100/(1 + ag/al)
    out[s:] = o
    return out

def ema_series(x, n):
    out = np.full(len(x), np.nan)
    ok = np.where(~np.isnan(x))[0]
    if len(ok) == 0: return out
    s = ok[0]; y = x[s:]
    if len(y) < n: return out
    e = y[:n].mean(); o = np.full(len(y), np.nan); o[n-1] = e; k = 2/(n+1)
    for i in range(n, len(y)):
        e = y[i]*k + e*(1-k); o[i] = e
    out[s:] = o
    return out

def roll_mean_std(x, n):
    """population mean/std over trailing n (NaN until n values)."""
    m = np.full(len(x), np.nan); sd = np.full(len(x), np.nan)
    if len(x) < n: return m, sd
    w = np.lib.stride_tricks.sliding_window_view(x, n)
    m[n-1:] = w.mean(1); sd[n-1:] = w.std(1)
    return m, sd

def load_usdtd(which="wide"):
    d = json.load(open(os.path.join(DATA, "usdtd_proxies.json")))
    return np.array(d["days"], dtype=np.int64), np.array(d[which], dtype=float)

def load_daily(sym):
    z = np.load(os.path.join(GRID, f"{sym}_1h.npz"))
    t = z["t"]; O = z["o"]; H = z["h"]; L = z["l"]; C = z["c"]
    o_ = np.argsort(t, kind="stable"); t = t[o_]; O = O[o_]; H = H[o_]; L = L[o_]; C = C[o_]
    day = (t // DAY) * DAY
    ud, first_idx, cnt = np.unique(day, return_index=True, return_counts=True)
    last_idx = first_idx + cnt - 1
    o = O[first_idx]; c = C[last_idx]
    h = np.maximum.reduceat(H, first_idx); l = np.minimum.reduceat(L, first_idx)
    full = cnt == 24
    return ud[full], o[full], h[full], l[full], c[full]

class Panel:
    """Aligned 2-D arrays (assets x days) on a global UTC-day axis."""
    def __init__(self, which="wide", syms=SYMS):
        ud, uv = load_usdtd(which)
        self.days = ud; self.usdtd = uv; D = len(ud)
        self.syms = list(syms); A = len(syms)
        self.o = np.full((A, D), np.nan); self.h = self.o.copy(); self.l = self.o.copy(); self.c = self.o.copy()
        pos = {int(d): i for i, d in enumerate(ud)}
        for a, s in enumerate(syms):
            td, o, h, l, c = load_daily(s)
            for k in range(len(td)):
                i = pos.get(int(td[k]))
                if i is not None:
                    self.o[a, i] = o[k]; self.h[a, i] = h[k]; self.l[a, i] = l[k]; self.c[a, i] = c[k]
        self.D = D; self.A = A
        # forward-fill isolated missing days (partial/absent Binance UTC days) after first listing
        self.holes = np.zeros((A, D), bool)
        for a in range(A):
            f = int(np.argmax(~np.isnan(self.c[a])))
            for i in range(f, D):
                if np.isnan(self.c[a, i]):
                    self.holes[a, i] = True
                    self.o[a, i] = self.h[a, i] = self.l[a, i] = self.c[a, i] = self.c[a, i-1]
        self.first = np.array([int(np.argmax(~np.isnan(self.c[a]))) for a in range(A)])
        self.tune = (ud >= START) & (ud < TUNE_END)
        self.oos = ud >= TUNE_END
        self._cache = {}
        # forward stats
        self.H = (7, 14, 30, 60)
        self.fwd = {}
        self.mae = {}
        lc = np.log(self.c)
        for hh in self.H:
            f = np.full((A, D), np.nan); f[:, :D-hh] = lc[:, hh:] - lc[:, :D-hh]; self.fwd[hh] = f
        for hh in (30, 60):
            m = np.full((A, D), np.nan)
            for a in range(A):
                lw = np.lib.stride_tricks.sliding_window_view(self.l[a, 1:], hh) if D > hh+1 else None
                # min of low[i+1 .. i+hh]
                mm = np.full(D, np.nan)
                if lw is not None:
                    mm[:D-hh] = np.nanmin(lw[:D-hh], axis=1) if False else lw[:D-hh].min(1)
                m[a] = mm / self.c[a] - 1
            self.mae[hh] = m
        # baselines: mean fwd log return over all valid days per asset/period
        self.base = {}
        for hh in self.H:
            for pname, mask in (("tune", self.tune), ("oos", self.oos), ("all", self.tune | self.oos)):
                b = np.full(A, np.nan)
                for a in range(A):
                    v = self.fwd[hh][a][mask & (np.arange(D) >= self.first[a] + 60)]
                    v = v[~np.isnan(v)]
                    b[a] = v.mean() if len(v) else np.nan
                self.base[(hh, pname)] = b

    # ---- USDT-side indicator components (common to all assets) ----
    def usdt_rsi(self, n):
        k = ("ur", n)
        if k not in self._cache: self._cache[k] = rsi_wilder(self.usdtd, n)
        return self._cache[k]
    def usdt_ema_dist(self, n):
        k = ("ue", n)
        if k not in self._cache:
            e = ema_series(self.usdtd, n); self._cache[k] = (self.usdtd/e - 1)*100
        return self._cache[k]
    def bb_ms(self, n):
        k = ("bm", n)
        if k not in self._cache: self._cache[k] = roll_mean_std(self.usdtd, n)
        return self._cache[k]
    def coin_rsi(self, n):
        k = ("cr", n)
        if k not in self._cache:
            self._cache[k] = np.stack([rsi_wilder(self.c[a], n) for a in range(self.A)])
        return self._cache[k]

    def stretch(self, p):
        r = self.usdt_rsi(int(p["usdtRsiLen"]))
        dist = self.usdt_ema_dist(int(p["emaLen"]))
        full = p["emaDistFullPct"] if p["emaDistFullPct"] != 0 else 4
        emac = np.clip(50 + 50*(dist/full), 0, 100)
        m, sd = self.bb_ms(int(p["bbLen"]))
        width = 2*p["bbMult"]*sd
        with np.errstate(invalid="ignore", divide="ignore"):
            pb = np.where(width == 0, 0.5, (self.usdtd - (m - p["bbMult"]*sd))/width)
        pb[np.isnan(m)] = np.nan
        bbc = np.clip(pb, 0, 1)*100
        parts = [(r, p["wRsi"]), (emac, p["wEma"]), (bbc, p["wBb"])]
        num = np.zeros(self.D); den = np.zeros(self.D)
        for v, w in parts:
            if not w > 0: continue
            ok = ~np.isnan(v)
            num[ok] += v[ok]*w; den[ok] += w
        with np.errstate(invalid="ignore", divide="ignore"):
            st = np.where(den > 0, num/den, np.nan)
        return st

    def score(self, p=None):
        p = {**DEFAULTS, **(p or {})}
        st = self.stretch(p)
        cr = self.coin_rsi(int(p["coinRsiLen"]))
        ws, wc = p["wStretch"], p["wCoin"]
        if ws + wc == 0: ws = wc = 1
        sc = np.clip((ws*st[None, :] + wc*(100 - cr))/(ws + wc), 0, 100)
        top = np.clip((ws*(100 - st[None, :]) + wc*cr)/(ws + wc), 0, 100)
        # mask warm-up: need first-listing + 60 days so partial warm-up never counts
        mask = np.arange(self.D)[None, :] < (self.first[:, None] + getattr(self, "warm", 60))
        sc[mask] = np.nan; top[mask] = np.nan
        return sc, top

def crosses(score, th):
    """bool (A,D): score crosses >= th from < th (previous bar non-null)."""
    prev = np.concatenate([np.full((score.shape[0], 1), np.nan), score[:, :-1]], axis=1)
    with np.errstate(invalid="ignore"):
        return (prev < th) & (score >= th)

# ---------- divergence ----------
def pivot_lows(low, k):
    """indices j with low[j] strictly lowest in [j-k, j+k] (NaN-safe). Confirmed at j+k."""
    n = len(low); out = []
    for j in range(k, n-k):
        w = low[j-k:j+k+1]
        if np.isnan(w).any(): continue
        if low[j] == w.min() and (w == low[j]).sum() == 1: out.append(j)
    return out

def bullish_divs(low, osc, k, maxgap=60):
    """returns list of (confirm_idx, pivot2_idx, pivot1_idx): price lower low, osc higher low."""
    piv = pivot_lows(low, k); res = []
    for a, b in zip(piv[:-1], piv[1:]):
        if b - a > maxgap: continue
        if np.isnan(osc[a]) or np.isnan(osc[b]): continue
        if low[b] < low[a] and osc[b] > osc[a]:
            res.append((b + k, b, a))
    return res

# ---------- event stats ----------
def swing_stats(P, a, i, back=30, fwd=60):
    lo = max(0, i-back); hi = min(P.D, i+fwd+1)
    w = P.l[a, lo:hi]; j = int(np.nanargmin(w)) + lo
    return j - i, P.c[a, i]/P.l[a, j] - 1, (hi - 1 - i) >= fwd

def event_stats(P, events, period):
    """events: list of (a,i). period: 'tune'|'oos'|'all'. Returns dict."""
    mask = {"tune": P.tune, "oos": P.oos, "all": P.tune | P.oos}[period]
    ev = [(a, i) for a, i in events if mask[i]]
    out = {"n": len(ev)}
    if not ev: return out
    # clusters: events within 10 days of each other (any asset) form one cluster
    ts = sorted(set(i for _, i in ev)); nc = 0; last = -999
    for t in ts:
        if t - last > 10: nc += 1
        last = t
    out["n_clusters"] = nc
    out["n_assets"] = len(set(a for a, _ in ev))
    for hh in P.H:
        v = np.array([P.fwd[hh][a, i] for a, i in ev]); b = np.array([P.base[(hh, period)][a] for a, i in ev])
        ok = ~np.isnan(v)
        out[f"n{hh}"] = int(ok.sum())
        if ok.sum():
            ex = v[ok] - b[ok]
            out[f"ret{hh}_med"] = float(np.expm1(np.median(v[ok])))
            out[f"ret{hh}_mean"] = float(np.expm1(v[ok].mean()))
            out[f"exc{hh}_mean"] = float(ex.mean())   # mean excess log-return vs same-asset all-days
            out[f"hit{hh}"] = float((v[ok] > 0).mean())
    for hh in (30, 60):
        m = np.array([P.mae[hh][a, i] for a, i in ev]); m = m[~np.isnan(m)]
        if len(m):
            out[f"mae{hh}_med"] = float(np.median(m)); out[f"mae{hh}_p10"] = float(np.percentile(m, 10))
    # recovery within 60d (close >= entry)
    rec = []; days = []
    for a, i in ev:
        if i + 60 >= P.D: continue
        w = P.c[a, i+1:i+61] >= P.c[a, i]
        rec.append(bool(w.any()))
        if w.any(): days.append(int(np.argmax(w)) + 1)
    if rec: out["recover60"] = float(np.mean(rec)); out["recover_days_med"] = float(np.median(days)) if days else None
    # timing
    d2l = []; prem = []
    for a, i in ev:
        d, p_, okf = swing_stats(P, a, i)
        if okf: d2l.append(d); prem.append(p_)
    if d2l:
        d2l = np.array(d2l)
        out["days_to_low_med"] = float(np.median(d2l)); out["frac_low_ahead"] = float((d2l > 0).mean())
        out["frac_low_already"] = float((d2l < 0).mean()); out["frac_low_today"] = float((d2l == 0).mean())
        out["premium_over_low_med"] = float(np.median(prem))
        out["dd_after_med_days_when_ahead"] = float(np.median(d2l[d2l > 0])) if (d2l > 0).any() else None
    return out

def month_boot_ci(P, events, period, h=30, B=2000, seed=1):
    """cluster-bootstrap (by calendar month) 95% CI of mean excess log return."""
    mask = {"tune": P.tune, "oos": P.oos, "all": P.tune | P.oos}[period]
    rows = []
    for a, i in events:
        if not mask[i]: continue
        v = P.fwd[h][a, i]
        if np.isnan(v): continue
        t = time.gmtime(int(P.days[i])); rows.append((t.tm_year*12 + t.tm_mon, v - P.base[(h, period)][a]))
    if len(rows) < 3: return None
    months = {}
    for m, v in rows: months.setdefault(m, []).append(v)
    keys = list(months); rng = np.random.default_rng(seed); means = []
    for _ in range(B):
        pick = rng.choice(len(keys), len(keys))
        vals = np.concatenate([months[keys[k]] for k in pick]); means.append(vals.mean())
    allv = np.concatenate([months[k] for k in keys])
    return float(allv.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)), len(allv), len(keys)
