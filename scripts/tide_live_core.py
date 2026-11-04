"""Live-accurate (point-in-time, non-repainting) Tide detectors + fast event-driven sim.
Mirrors client/src/lib/indicators/tideZone.ts incl. the 5 Sep wick-tie fix."""
import math
from collections import defaultdict

SPLIT = 1704067200  # 2024-01-01
FEE = 0.0004
MAX_HOLD = {"15m": 96, "1h": 48, "4h": 18}

def isnum(x):
    return x is not None and x == x

def raw_price_fractals(cs, n, tie_fix=True):
    m = len(cs); out = []
    H = [c["h"] for c in cs]; Lo = [c["l"] for c in cs]
    for i in range(n, m - n):
        hi, lo = H[i], Lo[i]
        ih = il = True; ht = lt = False
        for j in range(i - n, i + n + 1):
            if j == i: continue
            if H[j] > hi: ih = False
            elif H[j] == hi: ht = True
            if Lo[j] < lo: il = False
            elif Lo[j] == lo: lt = True
        if tie_fix and ih and il:
            if not lt and ht: ih = False
            elif not ht and lt: il = False
        if ih == il: continue
        out.append((i, "high" if ih else "low", hi if ih else lo))
    return out

def raw_value_fractals(v, n):
    m = len(v); out = []
    for i in range(n, m - n):
        x = v[i]
        if not isnum(x): continue
        ih = il = True
        for j in range(i - n, i + n + 1):
            if j == i: continue
            y = v[j]
            if not isnum(y): ih = il = False; break
            if y > x: ih = False
            if y < x: il = False
        if ih == il: continue
        out.append((i, "high" if ih else "low", x))
    return out

def _push(zz, s):
    """collapse into alternating zigzag; returns True if s became the tail."""
    if zz and zz[-1][1] == s[1]:
        more = s[2] >= zz[-1][2] if s[1] == "high" else s[2] <= zz[-1][2]
        if more:
            zz[-1] = s; return True
        return False
    zz.append(s); return True

def causal_divs(cs, ema, n, below, bear=False, above=0, tie_fix=True):
    """Emit each DIV once, at the first bar it is visible on a live chart.
    bull: price LL vs EMA HL, both EMA lows < below (if below<0).
    bear: price HH vs EMA LH, both EMA highs > above (if above>0)."""
    t = [c["t"] for c in cs]
    rp = raw_price_fractals(cs, n, tie_fix)
    re_ = raw_value_fractals(ema, n)
    by = defaultdict(list)
    for p in rp: by[p[0] + n].append(("p", p))
    for p in re_: by[p[0] + n].append(("e", p))
    zp, ze = [], []
    bar = t[1] - t[0]; max_dt = bar * n * 2
    want = "high" if bear else "low"
    seen = set(); ev = []
    m = len(cs)
    for i in sorted(by):
        for k, p in by[i]:
            _push(zp if k == "p" else ze, p)
        piv = [z for z in zp[-8:] if z[1] == want][-3:]
        ep = [z for z in ze[-16:] if z[1] == want]
        for k in range(1, len(piv)):
            a, b = piv[k - 1], piv[k]
            key = (a[0], b[0])
            if key in seen: continue
            if bear:
                if not (b[2] > a[2]): continue
            else:
                if not (b[2] < a[2]): continue
            def near(ti):
                best = None; bd = 1e18
                for e in ep:
                    d = abs(t[e[0]] - ti)
                    if d < bd: bd, best = d, e
                return best if best is not None and bd <= max_dt else None
            e1 = near(t[a[0]]); e2 = near(t[b[0]])
            if not e1 or not e2 or e2[0] <= e1[0]: continue
            if bear:
                if above > 0 and (e1[2] <= above or e2[2] <= above): continue
                if not (e2[2] < e1[2]): continue
            else:
                if below < 0 and (e1[2] >= below or e2[2] >= below): continue
                if not (e2[2] > e1[2]): continue
            seen.add(key)
            if i >= m - 1: continue
            ev.append({"confirm_i": i, "pivot_i": b[0], "price2": b[2], "pivot1_i": a[0], "price1": a[2]})
    return ev

def causal_ema_peaks(ema, n, above=0):
    zz = []; out = []
    m = len(ema)
    for p in raw_value_fractals(ema, n):
        if not _push(zz, p): continue
        i = p[0] + n
        if p[1] == "high" and (above <= 0 or p[2] > above) and i < m - 1:
            out.append(i)
    return out

def zero_down(score):
    return [i for i in range(1, len(score)) if isnum(score[i]) and isnum(score[i-1]) and score[i-1] > 0 >= score[i]]

def atr_series(cs, n=14):
    out = [float("nan")] * len(cs)
    if len(cs) < n + 1: return out
    trs = [0.0] * len(cs)
    for i in range(1, len(cs)):
        h, l, pc = cs[i]["h"], cs[i]["l"], cs[i-1]["c"]
        trs[i] = max(h - l, abs(h - pc), abs(l - pc))
    s = sum(trs[1:n+1]); out[n] = s / n
    for i in range(n + 1, len(cs)):
        out[i] = (out[i-1] * (n - 1) + trs[i]) / n
    return out

def sim(cs, entries, exits_sorted, atr, stop, tp, gate, max_hold, start=80):
    """Event-driven equivalent of tide_rr_pf_search.simulate_rr_fast.
    entries: dict confirm_i -> (pivot_i, pivot_low). exits_sorted: sorted list of exit signal bars."""
    import bisect
    n = len(cs); trades = []
    keys = sorted(k for k in entries if k >= start)
    tnext = start
    kind = stop["kind"]
    for e in keys:
        if e < tnext: continue
        fill = e + 1
        if fill >= n: break
        pivot_i, pivot_low = entries[e]
        entry = cs[fill]["o"]
        a = atr[e] if isnum(atr[e]) else entry * 0.01
        if kind == "struct_atr": sp = pivot_low - stop["atr_mult"] * a
        elif kind == "struct_pct": sp = pivot_low * (1 - stop["pct"])
        else: sp = entry * (1 - stop["pct"])
        if sp >= entry: sp = min(pivot_low, entry * 0.995)
        risk = entry - sp
        if risk <= 0 or (gate > 0 and (1.5 * a) / risk < gate):
            tnext = fill; continue
        tpx = entry + tp["R"] * risk if (tp["kind"] == "tide_or_R" and tp["R"] > 0) else None
        xi = bisect.bisect_left(exits_sorted, fill)
        x = exits_sorted[xi] if xi < len(exits_sorted) else None
        closed = False
        j = fill
        while j < n:
            c = cs[j]
            if x is not None and j == x + 1:
                px, why = c["o"], "tide_in"
            elif c["l"] <= sp: px, why = sp, "sl"
            elif tpx is not None and c["h"] >= tpx: px, why = tpx, "tp"
            elif j - fill >= max_hold: px, why = c["c"], "time"
            else:
                j += 1; continue
            trades.append({"t": cs[e]["t"], "ret": px / entry - 1 - 2 * FEE, "why": why,
                           "bars": j - fill, "R": (px - entry) / risk, "i": e, "exit_i": j})
            closed = True
            break
        if not closed: break
        tnext = j
    return trades

def stats(trs):
    if not trs: return {"n": 0}
    rets = [t["ret"] for t in trs]
    wins = [r for r in rets if r > 0]; gl = -sum(r for r in rets if r <= 0); gp = sum(wins)
    eq = pk = 1.0; dd = 0.0
    for t in sorted(trs, key=lambda t: t["t"]):
        eq *= 1 + t["ret"]; pk = max(pk, eq); dd = min(dd, eq / pk - 1)
    why = defaultdict(int)
    for t in trs: why[t["why"]] += 1
    return {"n": len(trs), "wr": 100 * len(wins) / len(trs), "mean": 100 * sum(rets) / len(trs),
            "pf": gp / gl if gl > 1e-12 else (99.0 if gp > 0 else 0.0), "dd": 100 * dd, "eq": eq,
            "why": dict(why)}

def split_stats(trs):
    return {"train": stats([t for t in trs if t["t"] < SPLIT]), "hold": stats([t for t in trs if t["t"] >= SPLIT])}
