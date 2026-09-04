#!/usr/bin/env python3
"""
Causal walk-forward of the Swoop spot book: BUY then SELL-to-flatten.

At bar t the engine only uses candles[0..t] (pivots confirmed with
swing bars on the right, so last known high is at t-swing). Same rules
as the live HUD. Fast-forwards years of Binance history, one series at
a time.

Fill = close of the signal bar (what the indicator sees).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

SWING = 16
LOOKBACK = 500
MAX_CANDLES = 100_000
FEE = 0.0004  # 4 bps each way, reported separately


def fetch_klines(symbol: str, interval: str, start_ms: int, end_ms: int) -> list[dict]:
    out: list[dict] = []
    cursor = start_ms
    while cursor < end_ms and len(out) < MAX_CANDLES:
        qs = urllib.parse.urlencode({
            "symbol": symbol,
            "interval": interval,
            "startTime": cursor,
            "endTime": end_ms,
            "limit": 1000,
        })
        url = f"https://api.binance.com/api/v3/klines?{qs}"
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                rows = json.loads(resp.read().decode())
        except Exception as e:
            print(f"  fetch retry {symbol} {interval}: {e}", flush=True)
            time.sleep(2)
            with urllib.request.urlopen(url, timeout=30) as resp:
                rows = json.loads(resp.read().decode())
        if not rows:
            break
        for k in rows:
            out.append({
                "t": int(k[0]) // 1000,
                "o": float(k[1]),
                "h": float(k[2]),
                "l": float(k[3]),
                "c": float(k[4]),
                "v": float(k[5]),
                "tb": float(k[9]),
            })
        cursor = int(rows[-1][0]) + 1
        if len(rows) < 1000:
            break
        time.sleep(0.12)
    return out


def fmt_t(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def isnum(x) -> bool:
    return x is not None and x == x


def mean(xs):
    xs = [x for x in xs if isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def swings(cs, n):
    pts = []
    last = len(cs) - 1
    for i in range(n, last - n + 1):
        hi, lo = cs[i]["h"], cs[i]["l"]
        is_h = True
        is_l = True
        for j in range(i - n, i + n + 1):
            if j == i:
                continue
            if cs[j]["h"] > hi:
                is_h = False
            if cs[j]["l"] < lo:
                is_l = False
            if not is_h and not is_l:
                break
        if is_h and not is_l:
            pts.append((i, "h", hi))
        elif is_l and not is_h:
            pts.append((i, "l", lo))
    return pts


def collapse(pts):
    zz = []
    for p in pts:
        if not zz:
            zz.append(p)
            continue
        if p[1] == zz[-1][1]:
            more = p[2] >= zz[-1][2] if p[1] == "h" else p[2] <= zz[-1][2]
            if more:
                zz[-1] = p
            continue
        zz.append(p)
    return zz


def lower_highs(highs):
    if len(highs) < 2:
        return []
    peak = max(range(len(highs)), key=lambda i: highs[i][1])
    seq = [highs[peak]]
    for i in range(peak + 1, len(highs)):
        if highs[i][1] < seq[-1][1]:
            seq.append(highs[i])
    return seq if len(seq) >= 2 else []


def lower_lows(lows, after):
    pool = [x for x in lows if x[0] > after]
    if not pool:
        return []
    seq = [pool[0]]
    for p in pool[1:]:
        if p[1] < seq[-1][1]:
            seq.append(p)
    return seq if len(seq) >= 2 else pool[:1]


def higher_lows(lows, after):
    pool = [x for x in lows if x[0] > after]
    if len(pool) < 2:
        return []
    trough = min(range(len(pool)), key=lambda i: pool[i][1])
    seq = [pool[trough]]
    for p in pool[trough + 1 :]:
        if p[1] > seq[-1][1]:
            seq.append(p)
    return seq if len(seq) >= 2 else []


def segs(run):
    out = []
    for a, b in zip(run, run[1:]):
        bars = b[0] - a[0]
        if bars <= 0:
            continue
        out.append({
            "ai": a[0], "bi": b[0], "ap": a[1], "bp": b[1],
            "slope": (b[1] - a[1]) / bars, "bars": bars,
        })
    return out


def decelerating(ss):
    if len(ss) < 2 or ss[0]["slope"] >= 0:
        return False
    flat = sum(1 for i in range(1, len(ss)) if ss[i]["slope"] > ss[i - 1]["slope"])
    return flat >= math.ceil((len(ss) - 1) / 2)


def mostly_flat(pts, max_rel=0.01):
    if len(pts) < 2:
        return False
    n = 0
    for a, b in zip(pts, pts[1:]):
        if abs(b[1] - a[1]) / max(abs(a[1]), 1e-12) <= max_rel:
            n += 1
    return n / (len(pts) - 1) >= 0.75


def classify(lh, ll, hl, top):
    if len(lh) < 2:
        return "none"
    dump = (lh[0][1] - lh[-1][1]) / max(abs(lh[0][1]), 1e-12)
    curved = decelerating(top)
    if dump < 0.03 and mostly_flat(lh) and (mostly_flat(hl) or mostly_flat(ll) or (not hl and not ll)):
        return "channel"
    if dump >= 0.03 and curved:
        return "swoop"
    if len(hl) >= 2 and dump < 0.12:
        return "equal_compression"
    if len(ll) >= 2:
        return "down_compression"
    if len(hl) >= 2:
        return "equal_compression"
    return "swoop" if dump >= 0.03 else "down_compression"


def rsi14(closes):
    n = len(closes)
    out = [float("nan")] * n
    if n <= 14:
        return out
    g = l = 0.0
    for i in range(1, 15):
        d = closes[i] - closes[i - 1]
        g += max(d, 0)
        l += max(-d, 0)
    g /= 14
    l /= 14
    out[14] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(15, n):
        d = closes[i] - closes[i - 1]
        g = (g * 13 + max(d, 0)) / 14
        l = (l * 13 + max(-d, 0)) / 14
        out[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def wilder(xs, p):
    out = [float("nan")] * len(xs)
    if len(xs) < p:
        return out
    s = sum(xs[:p]) / p
    out[p - 1] = s
    for i in range(p, len(xs)):
        s = (s * (p - 1) + xs[i]) / p
        out[i] = s
    return out


def atr_series(cs, p=14):
    tr = [cs[0]["h"] - cs[0]["l"]]
    for i in range(1, len(cs)):
        tr.append(max(
            cs[i]["h"] - cs[i]["l"],
            abs(cs[i]["h"] - cs[i - 1]["c"]),
            abs(cs[i]["l"] - cs[i - 1]["c"]),
        ))
    return wilder(tr, p)


def mfi_series(cs, p=14):
    tp = [(c["h"] + c["l"] + c["c"]) / 3 for c in cs]
    rmf = [0.0] * len(cs)
    for i in range(1, len(cs)):
        if tp[i] > tp[i - 1]:
            rmf[i] = tp[i] * cs[i]["v"]
        elif tp[i] < tp[i - 1]:
            rmf[i] = -tp[i] * cs[i]["v"]
    out = [float("nan")] * len(cs)
    for i in range(p, len(cs)):
        pos = sum(x for x in rmf[i - p + 1 : i + 1] if x > 0)
        neg = -sum(x for x in rmf[i - p + 1 : i + 1] if x < 0)
        out[i] = 100 if neg == 0 else 100 - 100 / (1 + pos / neg)
    return out


def stoch_at(cs, i, period=14):
    if i < period - 1:
        return float("nan")
    hh = max(c["h"] for c in cs[i - period + 1 : i + 1])
    ll = min(c["l"] for c in cs[i - period + 1 : i + 1])
    if not (hh > ll):
        return 50.0
    return 100.0 * (cs[i]["c"] - ll) / (hh - ll)


def cvd_series(cs):
    acc = 0.0
    out = []
    for c in cs:
        acc += 2 * c["tb"] - c["v"]
        out.append(acc)
    return out


def loc(c):
    rng = c["h"] - c["l"]
    return 0.5 if rng <= 0 else (c["c"] - c["l"]) / rng


def gap_read(cs, seg, prev, rsi, cvd):
    lo, hi = seg["ai"], seg["bi"]
    vol = up = rng = 0.0
    for i in range(lo, hi + 1):
        c = cs[i]
        v = c["v"]
        vol += v
        if c["c"] >= c["o"]:
            up += v
        rng += c["h"] - c["l"]
    px = (seg["bp"] - seg["ap"]) / seg["ap"] if seg["ap"] else 0.0
    cvd_ch = cvd[hi] - cvd[lo]
    rsi_d = None
    rsi_end = rsi[hi] if hi < len(rsi) and isnum(rsi[hi]) else None
    if lo < len(rsi) and hi < len(rsi) and isnum(rsi[lo]) and isnum(rsi[hi]):
        rsi_d = rsi[hi] - rsi[lo]
    vol_ratio = (vol / prev["vol"]) if prev and prev["vol"] > 0 else None
    rng_avg = rng / max(1, hi - lo + 1)
    rng_ratio = (rng_avg / prev["rng"]) if prev and prev["rng"] > 0 else None
    flat = prev is not None and abs(seg["slope"]) + 1e-12 < abs(prev["slope"])
    up_share = up / vol if vol > 0 else 0.5
    stoch_end = stoch_at(cs, hi)
    flags = []
    score = 0
    px_dn = px <= 0.001
    px_flat = abs(px) <= 0.0035
    cvd_up = cvd_ch > 0
    cvd_dn = cvd_ch < 0
    if rsi_d is not None and px < -0.001 and rsi_d > 1:
        flags.append("rsi_div")
        score += 26
    elif rsi_d is not None and px_dn and rsi_d > -0.5:
        flags.append("rsi_hold")
        score += 16
    if vol_ratio is not None and vol_ratio < 0.85 and px_dn:
        flags.append("vol_dry")
        score += 18
    if rng_ratio is not None and rng_ratio < 0.85:
        flags.append("range_shrink")
        score += 14
    if flat:
        flags.append("flattening")
        score += 12
    if px_flat:
        flags.append("equal_high")
        score += 18
    if px_dn and cvd_up:
        flags.append("cvd_vs_price")
        score += 12
    bullish = any(f in flags for f in ("rsi_div", "rsi_hold", "vol_dry", "range_shrink", "equal_high"))
    if px_dn and cvd_dn and up_share < 0.45 and not bullish:
        score = min(score, 24)
    if rsi_end is not None and rsi_end <= 50:
        flags.append("oversold")
    if isnum(stoch_end) and stoch_end <= 20:
        flags.append("stoch_os")
    st = "neutral"
    if "equal_high" in flags and bullish:
        st = "coil"
    elif "rsi_div" in flags:
        st = "divergence"
    elif "cvd_vs_price" in flags:
        st = "absorption"
    elif "vol_dry" in flags and px_dn:
        st = "test"
    elif flat and "range_shrink" in flags:
        st = "coil"
    elif px_dn and cvd_dn and not bullish:
        st = "markdown"
    elif bullish:
        st = "coil"
    return {
        "st": st, "sc": score, "flags": flags, "vol": vol, "rng": rng_avg,
        "slope": seg["slope"],
        "rsi_end": rsi_end, "stoch_end": stoch_end if isnum(stoch_end) else None,
    }


def find_selling_climax(cs, t, last_h_i, ind):
    lo = max(1, min(last_h_i, t - 48))
    found = None
    rsi, mfi, atr = ind["rsi"], ind["mfi"], ind["atr"]
    for i in range(lo, t + 1):
        lo8 = min(cs[j]["l"] for j in range(max(0, i - 7), i + 1))
        if cs[i]["l"] > lo8 * 1.002:
            continue
        rng = (cs[i]["h"] - cs[i]["l"]) / atr[i] if isnum(atr[i]) and atr[i] > 0 else 0.0
        vols = sorted(cs[j]["v"] for j in range(max(0, i - 20), i) if cs[j]["v"] > 0)
        med = vols[len(vols) // 2] if vols else 0.0
        volx = cs[i]["v"] / med if med > 0 else 0.0
        dr = (rsi[i] - rsi[i - 1]) if isnum(rsi[i]) and isnum(rsi[i - 1]) else 0.0
        dm = (mfi[i] - mfi[i - 1]) if isnum(mfi[i]) and isnum(mfi[i - 1]) else 0.0
        if rng >= 2.5 and volx >= 2 and (dr <= -8 or dm <= -10):
            found = i
    return found


def detect_buy(pattern, lh, tops, last_close, cs, t, ind):
    if pattern in ("none", "channel") or len(lh) < 2 or not tops:
        return None
    last_h, prev_h = lh[-1][1], lh[-2][1]
    flags = set()
    for g in tops[-3:]:
        flags.update(g["flags"])
    last_g = tops[-1]
    last_flags = set(last_g["flags"])
    broken = last_close > last_h * 1.001
    tells = []
    if "rsi_div" in flags or "rsi_hold" in flags:
        tells.append("RSI vs LH")
    if "vol_dry" in flags:
        tells.append("vol dry")
    if "range_shrink" in flags:
        tells.append("squeeze")
    equal = "equal_high" in flags or abs(last_h - prev_h) / max(abs(prev_h), 1e-12) <= 0.004
    if equal or "flattening" in flags:
        tells.append("LH flat")
    last_squeeze = "range_shrink" in last_flags or last_g["st"] == "test"
    last_md = last_g["st"] == "markdown"
    core = len(tells) >= 2 and ("rsi_div" in flags or "rsi_hold" in flags or "vol_dry" in flags)
    completing = (not last_md) and core and last_squeeze
    rsi_os = last_g["rsi_end"] is not None and last_g["rsi_end"] <= 50
    stoch_os = last_g["stoch_end"] is not None and last_g["stoch_end"] <= 20
    dumping = last_h < prev_h * 0.997
    oversold = dumping and (rsi_os or stoch_os)
    if completing:
        return {"armed": True, "triggered": broken, "px": last_h, "reason": " + ".join(tells),
                "path": "completing", "stop": last_h, "lh_i": lh[-1][0]}
    cap = find_selling_climax(cs, t, lh[-1][0], ind)
    if cap is not None:
        reclaimed = last_close > cs[cap]["h"] * 1.001
        return {"armed": True, "triggered": reclaimed, "px": cs[cap]["h"], "reason": "climax reclaim",
                "path": "climax", "stop": cs[cap]["l"], "lh_i": cap}
    if oversold:
        return {"armed": True, "triggered": broken, "px": last_h, "reason": "oversold reclaim",
                "path": "oversold", "stop": last_h, "lh_i": lh[-1][0]}
    return {"armed": False, "triggered": False, "px": last_h, "reason": last_g["st"],
            "path": None, "stop": last_h, "lh_i": lh[-1][0]}


def detect_exit(cs, t, entry_i, stop_px, ind):
    c = cs[t]
    if c["c"] < stop_px * 0.999:
        return {"triggered": True, "kind": "fail", "reason": "close < stop", "px": c["c"]}
    if t < 24:
        return {"triggered": False, "kind": None, "reason": "wait", "px": stop_px}

    rsi, mfi, atr = ind["rsi"], ind["mfi"], ind["atr"]
    d_rsi = (rsi[t] - rsi[t - 1]) if isnum(rsi[t]) and isnum(rsi[t - 1]) else 0.0
    d_mfi = (mfi[t] - mfi[t - 1]) if isnum(mfi[t]) and isnum(mfi[t - 1]) else 0.0
    rng_atr = (c["h"] - c["l"]) / atr[t] if isnum(atr[t]) and atr[t] > 0 else 0.0
    vols = sorted(cs[j]["v"] for j in range(max(0, t - 20), t) if cs[j]["v"] > 0)
    med = vols[len(vols) // 2] if vols else 0.0
    vol_x = c["v"] / med if med > 0 else 0.0
    loc_now = loc(c)
    climax = rng_atr >= 2.5 and vol_x >= 2
    osc_death = d_rsi <= -8 or d_mfi <= -10
    cont = loc_now >= 0.8 and d_rsi > 0 and d_mfi > 0
    if climax and osc_death and not cont:
        tells = ["climax"]
        if d_rsi <= -8:
            tells.append(f"RSI {d_rsi:.0f}")
        if d_mfi <= -10:
            tells.append(f"MFI {d_mfi:.0f}")
        return {"triggered": True, "kind": "exhaustion", "reason": " + ".join(tells), "px": c["h"]}

    prev = t - 1
    run = cs[entry_i]["h"]
    for j in range(entry_i, prev):
        if cs[j]["h"] > run:
            run = cs[j]["h"]
    peak = cs[prev]
    is_new = peak["h"] >= run * 0.999
    atr_p = atr[prev]
    rng_p = (peak["h"] - peak["l"]) / atr_p if isnum(atr_p) and atr_p > 0 else 0.0
    vols_p = sorted(cs[j]["v"] for j in range(max(0, prev - 20), prev) if cs[j]["v"] > 0)
    med_p = vols_p[len(vols_p) // 2] if vols_p else 0.0
    vol_p = peak["v"] / med_p if med_p > 0 else 0.0
    weak = rng_p < 2 and vol_p < 2.2
    lo = max(0, prev - 24)
    rsi_max_i = lo
    rsi_max = -1e9
    mfi_max = -1e9
    for j in range(lo, prev + 1):
        if isnum(rsi[j]) and rsi[j] >= rsi_max:
            rsi_max, rsi_max_i = rsi[j], j
        if isnum(mfi[j]) and mfi[j] >= mfi_max:
            mfi_max = mfi[j]
    lagged = isnum(rsi[prev]) and rsi[prev] >= 70 and (
        rsi_max_i <= prev - 6 or (isnum(mfi[prev]) and mfi[prev] < mfi_max - 3)
    )
    failed_hold = c["h"] < peak["h"] * 0.9995 and loc_now <= 0.35 and (d_rsi <= -4 or d_mfi <= -4)
    if is_new and weak and lagged and failed_hold:
        return {"triggered": True, "kind": "quiet", "reason": "quiet top", "px": c["c"]}
    return {"triggered": False, "kind": None, "reason": "wait", "px": stop_px}


def structure_at(cs, t, swing, rsi, cvd, all_highs, all_lows):
    """Confirmed-only view at bar t: pivots with t >= index + swing."""
    lo = max(0, t - LOOKBACK)
    highs = [(i, p) for i, p in all_highs if lo <= i <= t - swing]
    lows = [(i, p) for i, p in all_lows if lo <= i <= t - swing]
    lh = lower_highs(highs)
    if len(lh) < 2:
        return None
    ll = lower_lows(lows, lh[0][0])
    hl = higher_lows(lows, lh[0][0])
    top = segs(lh)
    if not top:
        return None
    pattern = classify(lh, ll, hl, top)
    tops = []
    prev = None
    for s in top:
        g = gap_read(cs, s, prev, rsi, cvd)
        tops.append(g)
        prev = g
    last_h = lh[-1]
    last_top = top[-1]
    upper = last_h[1] + last_top["slope"] * (t - last_h[0])
    released = cs[t]["c"] > upper * 1.001 and last_top["slope"] <= 0
    return {
        "lh": lh,
        "pattern": pattern,
        "tops": tops,
        "released": released,
        "last_h": last_h,
    }


def simulate(cs, swing):
    n = len(cs)
    closes = [c["c"] for c in cs]
    rsi = rsi14(closes)
    mfi = mfi_series(cs)
    atr = atr_series(cs)
    cvd = cvd_series(cs)
    ind = {"rsi": rsi, "mfi": mfi, "atr": atr}
    pts = collapse(swings(cs, swing))
    all_highs = [(i, p) for i, k, p in pts if k == "h"]
    all_lows = [(i, p) for i, k, p in pts if k == "l"]
    trades = []
    pos = None
    start = swing * 2 + 20
    cache = None
    cache_key = None
    for t in range(start, n):
        if pos is not None:
            if cs[t]["h"] > pos["peak"]:
                pos["peak"] = cs[t]["h"]
            x = detect_exit(cs, t, pos["entry_i"], pos["stop_px"], ind)
            if x["triggered"]:
                px0, px1 = pos["entry_px"], cs[t]["c"]
                trades.append({
                    "entry_t": pos["entry_t"],
                    "exit_t": cs[t]["t"],
                    "entry": px0,
                    "exit": px1,
                    "ret": px1 / px0 - 1,
                    "ret_fee": (px1 / px0) * (1 - FEE) / (1 + FEE) - 1,
                    "mfe": pos["peak"] / px0 - 1,
                    "giveback": (pos["peak"] - px1) / pos["peak"] if pos["peak"] else 0,
                    "bars": t - pos["entry_i"],
                    "path": pos["path"],
                    "buy": pos["reason"],
                    "sell": x["reason"],
                    "kind": x["kind"],
                    "pattern": pos["pattern"],
                    "lh": pos["lh_px"],
                })
                pos = None
            continue
        # Confirmed pivot set only changes when t-swing is a pivot index.
        key = t - swing
        if cache is None or cache_key != key:
            cache = structure_at(cs, t, swing, rsi, cvd, all_highs, all_lows)
            cache_key = key
        if not cache:
            continue
        # Release/close vs last LH must use this bar's close.
        last_h = cache["last_h"]
        last_top_slope = (cache["lh"][-1][1] - cache["lh"][-2][1]) / max(1, cache["lh"][-1][0] - cache["lh"][-2][0])
        upper = last_h[1] + last_top_slope * (t - last_h[0])
        released = cs[t]["c"] > upper * 1.001 and last_top_slope <= 0
        b = detect_buy(cache["pattern"], cache["lh"], cache["tops"], cs[t]["c"], cs, t, ind)
        if b and b["triggered"]:
            pos = {
                "entry_i": t,
                "entry_t": cs[t]["t"],
                "entry_px": cs[t]["c"],
                "lh_i": b["lh_i"],
                "lh_px": last_h[1],
                "stop_px": b["stop"],
                "path": b["path"],
                "reason": b["reason"],
                "pattern": cache["pattern"],
                "peak": cs[t]["h"],
            }
    return trades


def summarize(rows):
    if not rows:
        print("no trades")
        return
    rets = [r["ret"] for r in rows]
    fees = [r["ret_fee"] for r in rows]
    wins = [r for r in rets if r > 0]
    print(f"\n========== {len(rows)} TRADES (spot long, flatten on SELL) ==========")
    print(f"win {len(wins)/len(rows):.1%}  avg {mean(rets):.2%}  med {sorted(rets)[len(rets)//2]:.2%}  "
          f"avg w/fee {mean(fees):.2%}  avg MFE {mean(r['mfe'] for r in rows):.2%}  "
          f"avg giveback {mean(r['giveback'] for r in rows):.2%}  avg hold {mean(r['bars'] for r in rows):.0f} bars")
    eq = 1.0
    peak = 1.0
    dd = 0.0
    for r in rets:
        eq *= 1 + r
        if eq > peak:
            peak = eq
        dd = min(dd, eq / peak - 1)
    print(f"compound {eq-1:.1%}  max DD {dd:.1%}")

    print(f"\n{'exit':<14} {'n':>5} {'win':>6} {'avg':>8} {'med':>8} {'mfe':>8}")
    by = defaultdict(list)
    for r in rows:
        by[r["kind"]].append(r)
    for k, rs in sorted(by.items(), key=lambda kv: -len(kv[1])):
        rr = [x["ret"] for x in rs]
        print(f"{k:<14} {len(rs):5d} {sum(1 for x in rr if x>0)/len(rr):6.1%} {mean(rr):8.2%} "
              f"{sorted(rr)[len(rr)//2]:8.2%} {mean(x['mfe'] for x in rs):8.2%}")

    print(f"\n{'path':<14} {'n':>5} {'win':>6} {'avg':>8}")
    by = defaultdict(list)
    for r in rows:
        by[r["path"] or "—"].append(r)
    for k, rs in sorted(by.items(), key=lambda kv: -len(kv[1])):
        rr = [x["ret"] for x in rs]
        print(f"{k:<14} {len(rs):5d} {sum(1 for x in rr if x>0)/len(rr):6.1%} {mean(rr):8.2%}")

    print(f"\n{'tf/sym':<18} {'n':>5} {'win':>6} {'avg':>8} {'compound':>10}")
    by = defaultdict(list)
    for r in rows:
        by[(r["tf"], r["sym"])].append(r)
    for k in sorted(by):
        rs = by[k]
        rr = [x["ret"] for x in rs]
        eq = 1.0
        for x in rr:
            eq *= 1 + x
        print(f"{k[1]+' '+k[0]:<18} {len(rs):5d} {sum(1 for x in rr if x>0)/len(rr):6.1%} {mean(rr):8.2%} {eq-1:10.1%}")

    print("\n========== BEST / WORST ==========")
    top = sorted(rows, key=lambda r: r["ret"], reverse=True)
    print("best:")
    for r in top[:8]:
        print(f"  {r['sym']:<8} {r['tf']:<3} {fmt_t(r['entry_t'])} {r['entry']:.5g} → {fmt_t(r['exit_t'])} "
              f"{r['exit']:.5g} {r['ret']:+.1%}  {r['kind']:<11} {r['buy'][:28]}")
    print("worst:")
    for r in top[-6:]:
        print(f"  {r['sym']:<8} {r['tf']:<3} {fmt_t(r['entry_t'])} {r['entry']:.5g} → {fmt_t(r['exit_t'])} "
              f"{r['exit']:.5g} {r['ret']:+.1%}  {r['kind']:<11} {r['sell'][:28]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="XRPUSDT,BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT")
    ap.add_argument("--intervals", default="1h,4h")
    ap.add_argument("--start", default="2018-01-01")
    ap.add_argument("--end", default="2026-09-02")
    ap.add_argument("--swing", type=int, default=SWING)
    ap.add_argument("--out", default="/tmp/swoop_live_sim.jsonl")
    args = ap.parse_args()
    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    intervals = [s.strip() for s in args.intervals.split(",") if s.strip()]
    start = int(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc).timestamp() * 1000)
    print(
        f"LIVE sim (causal) symbols={symbols} tfs={intervals} swing={args.swing} "
        f"lookback={LOOKBACK} {args.start} → {args.end}",
        flush=True,
    )
    all_t = []
    for interval in intervals:
        for sym in symbols:
            print(f"fetch {sym} {interval}...", flush=True)
            cs = fetch_klines(sym, interval, start, end)
            if len(cs) < 400:
                print(f"  skip n={len(cs)}")
                continue
            print(f"  {len(cs)} candles {fmt_t(cs[0]['t'])} → {fmt_t(cs[-1]['t'])}  walk...", flush=True)
            t0 = time.time()
            trades = simulate(cs, args.swing)
            dt = time.time() - t0
            for tr in trades:
                tr["sym"] = sym
                tr["tf"] = interval
            print(f"  {len(trades)} trades in {dt:.1f}s", flush=True)
            all_t.extend(trades)
            del cs
    summarize(all_t)
    with open(args.out, "w") as f:
        for r in all_t:
            f.write(json.dumps(r) + "\n")
    print(f"\nwrote {len(all_t)} trades → {args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
