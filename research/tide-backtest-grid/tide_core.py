"""Tide Zone core for the backtest grid.

Faithful numpy port of the repo's research/live detector:
  - score:   client/src/lib/indicators/tideZone.ts  (calculateTideZone)   == scripts/tide_zone_1h_refine.py::tide_series
  - signals: client/src/lib/indicators/tideSignals.ts == scripts/tide_live_core.py (causal_divs / causal_ema_peaks)
Parity against the repo fixtures is checked in test_parity.py.
"""
import math
from bisect import bisect_left
from collections import defaultdict
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv

HTF_SEC = 4 * 3600
PCT_WIN = 200
TAPE_WIN = 12
SWING = 16
NEAR_PIVOT = 0.003
WARMUP = 400                       # bars hidden on the live chart (TIDE_WARMUP_BARS)
SPLIT = 1704067200                 # 2024-01-01 UTC : in-sample < SPLIT <= out-of-sample
NAN = float("nan")

# ───────────────────────── indicators ─────────────────────────

def ema_seed0(x, p):
    """ema() in tideZone.ts: seeded at x[0]."""
    k = 2.0 / (p + 1)
    o = np.empty(len(x)); prev = x[0]; o[0] = prev
    for i in range(1, len(x)):
        prev = x[i] * k + prev * (1 - k); o[i] = prev
    return o

def ema_carry(x, p):
    """ema_of / emaCarry: seed at first finite, NaN gaps carry the previous value."""
    n = len(x); out = np.full(n, NAN)
    fin = np.isfinite(x)
    if not fin.any():
        return out
    s = int(np.argmax(fin))
    if p <= 0:
        return np.where(fin, x, NAN)
    k = 2.0 / (p + 1); prev = x[s]; out[s] = prev
    xl = x.tolist(); ol = out.tolist()
    for i in range(s + 1, n):
        v = xl[i]
        if v != v: v = prev
        prev = v * k + prev * (1 - k); ol[i] = prev
    return np.array(ol)

def rsi_wilder(c, p=14):
    n = len(c); out = np.full(n, NAN)
    if n <= p: return out
    d = np.diff(c)
    g = np.maximum(d, 0); l = np.maximum(-d, 0)
    ag = g[:p].sum() / p; al = l[:p].sum() / p
    out[p] = 100 if al == 0 else 100 - 100 / (1 + ag / al)
    gl = g.tolist(); ll = l.tolist(); ol = out.tolist()
    for i in range(p + 1, n):
        ag = (ag * (p - 1) + gl[i - 1]) / p; al = (al * (p - 1) + ll[i - 1]) / p
        ol[i] = 100 if al == 0 else 100 - 100 / (1 + ag / al)
    return np.array(ol)

def rpct(x, win):
    """rolling percentile rank (<=), NaN-skipping, min count max(20, win//4) — tideZone.ts rollingPct."""
    n = len(x); out = np.full(n, NAN)
    pad = np.concatenate([np.full(win - 1, NAN), x])
    W = swv(pad, win)
    with np.errstate(invalid="ignore"):
        valid = ~np.isnan(W)
        cnt = valid.sum(1)
        le = (W <= x[:, None]).sum(1)
    ok = (cnt >= max(20, win // 4)) & np.isfinite(x)
    out[ok] = le[ok] / cnt[ok]
    return out

def atr_research(h, l, c, p=14):
    """tide_zone_1h_refine.atr (used for the score's energy term): tr[0]=h-l, seed mean of first p TRs."""
    n = len(c)
    tr = np.empty(n); tr[0] = h[0] - l[0]
    pc = c[:-1]
    tr[1:] = np.maximum.reduce([h[1:] - l[1:], np.abs(h[1:] - pc), np.abs(l[1:] - pc)])
    out = np.full(n, NAN); s = tr[:p].sum() / p; out[p - 1] = s
    trl = tr.tolist(); ol = out.tolist()
    for i in range(p, n):
        s = (s * (p - 1) + trl[i]) / p; ol[i] = s
    return np.array(ol)

def atr_stop(h, l, c, n=14):
    """atr_series / atrWilder: seeded on TR[1..n] (used for stops)."""
    m = len(c); out = np.full(m, NAN)
    if m < n + 1: return out
    tr = np.zeros(m)
    pc = c[:-1]
    tr[1:] = np.maximum.reduce([h[1:] - l[1:], np.abs(h[1:] - pc), np.abs(l[1:] - pc)])
    s = tr[1:n + 1].sum() / n; out[n] = s
    trl = tr.tolist(); ol = out.tolist()
    for i in range(n + 1, m):
        s = (s * (n - 1) + trl[i]) / n; ol[i] = s
    return np.array(ol)

def bb_width(c, p=20):
    n = len(c); out = np.full(n, NAN)
    if n < p: return out
    W = swv(c, p)
    m = W.mean(1); sd = W.std(1)
    with np.errstate(divide="ignore", invalid="ignore"):
        out[p - 1:] = np.where(m != 0, 4 * sd / m, 0.0)
    return out

def tide_series(t, o, h, l, c, v):
    """Returns (score, tide, energy, tape) on the chart bars. t in seconds."""
    n = len(t)
    bar = int(t[1] - t[0]); factor = max(1, round(HTF_SEC / bar)); bucket = factor * bar
    key = (t // bucket) * bucket
    chg = np.flatnonzero(np.concatenate([[True], key[1:] != key[:-1]]))
    ends = np.concatenate([chg[1:], [n]]) - 1
    htf_t = t[ends]                       # htf bar is "known" on its last sub-bar
    htf_c = c[ends]                       # close of the last sub-bar
    hr = rsi_wilder(htf_c, 14); he = ema_seed0(htf_c, 50)
    hrp = rpct(hr, 80)
    with np.errstate(divide="ignore", invalid="ignore"):
        hd = np.where(he != 0, htf_c / he - 1, NAN)
    hdp = rpct(hd, 80)
    a = atr_research(h, l, c, 14)
    with np.errstate(divide="ignore", invalid="ignore"):
        ap = np.where(np.isfinite(a) & (c != 0), a / c, NAN)
    eA = rpct(ap, PCT_WIN); eB = rpct(bb_width(c, 20), PCT_WIN)
    sgn = np.zeros(n); sgn[1:] = np.sign(c[1:] - c[:-1])
    signed = sgn * v
    cs_s = np.concatenate([[0], np.cumsum(signed)]); cs_v = np.concatenate([[0], np.cumsum(v)])
    slope = np.full(n, NAN)
    idx = np.arange(TAPE_WIN, n)
    num = cs_s[idx + 1] - cs_s[idx + 1 - TAPE_WIN]; den = cs_v[idx + 1] - cs_v[idx + 1 - TAPE_WIN]
    slope[idx] = np.where(den != 0, num / np.where(den != 0, den, 1), 0.0)
    tape = rpct(slope, 100)
    # map HTF (last htf bar with time <= t)
    j = np.searchsorted(htf_t, t, side="right") - 1
    ok = j >= 0
    h1 = np.full(n, NAN); h2 = np.full(n, NAN)
    h1[ok] = hrp[j[ok]]; h2[ok] = hdp[j[ok]]
    td = 0.6 * h1 + 0.4 * h2
    en = 0.5 * eA + 0.5 * eB
    raw = 0.55 * (2 * td - 1) + 0.35 * (2 * en - 1) * (1 - td) + 0.25 * (2 * tape - 1)
    score = 100 * np.tanh(raw)
    bad = ~(np.isfinite(td) & np.isfinite(en) & np.isfinite(tape))
    score[bad] = NAN; td[bad] = NAN; en[bad] = NAN; tp = tape.copy(); tp[bad] = NAN
    return score, td, en, tp

# ───────────────────────── fractals / zigzag / detectors ─────────────────────────

def price_fractals(h, l, n):
    """Wick fractals with the 5-Sep tie fix. Returns list[(i, 'H'|'L', value)] (same as raw_price_fractals)."""
    m = len(h)
    if m < 2 * n + 1: return []
    WH = swv(h, 2 * n + 1); WL = swv(l, 2 * n + 1)
    hi = WH[:, n]; lo = WL[:, n]
    ih = WH.max(1) == hi; il = WL.min(1) == lo
    ht = (WH == hi[:, None]).sum(1) > 1; lt = (WL == lo[:, None]).sum(1) > 1
    both = ih & il
    ih = np.where(both & (~lt) & ht, False, ih)
    il = np.where(both & (~ht) & lt, False, il)
    sel = np.flatnonzero(ih != il)
    return [(int(i + n), "H" if ih[i] else "L", float(hi[i] if ih[i] else lo[i])) for i in sel]

def value_fractals(x, n):
    m = len(x)
    if m < 2 * n + 1: return []
    W = swv(x, 2 * n + 1); ctr = W[:, n]
    with np.errstate(invalid="ignore"):
        fin = np.isfinite(W).all(1)
        ih = fin & (W.max(1) == ctr)
        il = fin & (W.min(1) == ctr)
    sel = np.flatnonzero(ih != il)
    return [(int(i + n), "H" if ih[i] else "L", float(ctr[i])) for i in sel]

def _push(zz, s):
    if zz and zz[-1][1] == s[1]:
        more = s[2] >= zz[-1][2] if s[1] == "H" else s[2] <= zz[-1][2]
        if more:
            zz[-1] = s; return True
        return False
    zz.append(s); return True

def causal_divs(t, pfr, efr, n, below):
    """Bullish Tide-out divergence, emitted once at the first visible bar (== tide_live_core.causal_divs).
    pfr: price fractals, efr: fractals of the smoothing EMA. Returns [(confirm_i, pivot_i, pivot_low, pivot1_i)]."""
    by = defaultdict(list)
    for p in pfr: by[p[0] + n].append((0, p))
    for p in efr: by[p[0] + n].append((1, p))
    zp, ze = [], []
    bar = int(t[1] - t[0]); max_dt = bar * n * 2
    seen = set(); ev = []; m = len(t)
    for i in sorted(by):
        for k, p in by[i]:
            _push(zp if k == 0 else ze, p)
        piv = [z for z in zp[-8:] if z[1] == "L"][-3:]
        if len(piv) < 2: continue
        ep = [z for z in ze[-16:] if z[1] == "L"]
        if len(ep) < 2: continue
        for k in range(1, len(piv)):
            a, b = piv[k - 1], piv[k]
            key = (a[0], b[0])
            if key in seen or not (b[2] < a[2]): continue
            def near(ti):
                best = None; bd = 1 << 60
                for e in ep:
                    d = abs(int(t[e[0]]) - ti)
                    if d < bd: bd, best = d, e
                return best if best is not None and bd <= max_dt else None
            e1 = near(int(t[a[0]])); e2 = near(int(t[b[0]]))
            if not e1 or not e2 or e2[0] <= e1[0]: continue
            if below < 0 and (e1[2] >= below or e2[2] >= below): continue
            if not (e2[2] > e1[2]): continue
            seen.add(key)
            if i >= m - 1: continue
            ev.append((i, b[0], b[2], a[0]))
    return ev

def ema_peaks(efr, n, m):
    """Confirmed peaks of the exit EMA (zigzag high becoming the tail): [(confirm_i, value, peak_i)] (== causal_ema_peaks, above=0)."""
    zz = []; out = []
    for p in efr:
        if not _push(zz, p): continue
        i = p[0] + n
        if p[1] == "H" and i < m - 1:
            out.append((i, p[2], p[0]))
    return out

def cross_down_bars(a, b):
    """bars i where a crosses below b: a[i-1] > b[i-1] and a[i] <= b[i]."""
    with np.errstate(invalid="ignore"):
        x = (a[:-1] > b[:-1]) & (a[1:] <= b[1:])
    return (np.flatnonzero(x) + 1).tolist()

def cross_up_bars(a, b):
    with np.errstate(invalid="ignore"):
        x = (a[:-1] < b[:-1]) & (a[1:] >= b[1:])
    return (np.flatnonzero(x) + 1).tolist()
