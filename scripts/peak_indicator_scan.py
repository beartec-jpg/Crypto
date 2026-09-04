#!/usr/bin/env python3
"""
Find significant swing peaks, then score indicator setups running into them.

A peak is a confirmed n-bar high that is the highest print in a prominence
window and then actually dumps (forward drawdown). Event-based: one row
per clustered peak, not every bar.

Do not hammer a busy box — niced, one series at a time.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

SWING = 16
MAX_CANDLES = 25000

PROMINENCE = {"15m": 96, "1h": 72, "4h": 42}  # bars the high must dominate
DROP = {"15m": 0.03, "1h": 0.035, "4h": 0.05}
FWD = {"15m": 64, "1h": 48, "4h": 30}


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
            with urllib.request.urlopen(url, timeout=25) as resp:
                rows = json.loads(resp.read().decode())
        except Exception as e:
            print(f"  fetch retry {symbol} {interval}: {e}", flush=True)
            time.sleep(1.5)
            with urllib.request.urlopen(url, timeout=25) as resp:
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


def pct(xs, pred):
    xs = list(xs)
    if not xs:
        return float("nan")
    return sum(1 for x in xs if pred(x)) / len(xs)


def loc(c) -> float:
    rng = c["h"] - c["l"]
    return 0.5 if rng <= 0 else (c["c"] - c["l"]) / rng


def ema(xs, p):
    if not xs:
        return []
    k = 2 / (p + 1)
    out = [xs[0]]
    for x in xs[1:]:
        out.append(x * k + out[-1] * (1 - k))
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


def rsi(closes, p=14):
    n = len(closes)
    out = [float("nan")] * n
    if n <= p:
        return out
    g = l = 0.0
    for i in range(1, p + 1):
        d = closes[i] - closes[i - 1]
        g += max(d, 0)
        l += max(-d, 0)
    g /= p
    l /= p
    out[p] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    for i in range(p + 1, n):
        d = closes[i] - closes[i - 1]
        g = (g * (p - 1) + max(d, 0)) / p
        l = (l * (p - 1) + max(-d, 0)) / p
        out[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return out


def atr(cs, p=14):
    tr = [cs[0]["h"] - cs[0]["l"]]
    for i in range(1, len(cs)):
        tr.append(max(
            cs[i]["h"] - cs[i]["l"],
            abs(cs[i]["h"] - cs[i - 1]["c"]),
            abs(cs[i]["l"] - cs[i - 1]["c"]),
        ))
    return wilder(tr, p)


def di_lines(cs, p=14):
    n = len(cs)
    pdm = [0.0] * n
    mdm = [0.0] * n
    tr = [cs[0]["h"] - cs[0]["l"]]
    for i in range(1, n):
        up = cs[i]["h"] - cs[i - 1]["h"]
        dn = cs[i - 1]["l"] - cs[i]["l"]
        pdm[i] = up if up > dn and up > 0 else 0.0
        mdm[i] = dn if dn > up and dn > 0 else 0.0
        tr.append(max(
            cs[i]["h"] - cs[i]["l"],
            abs(cs[i]["h"] - cs[i - 1]["c"]),
            abs(cs[i]["l"] - cs[i - 1]["c"]),
        ))
    str_ = wilder(tr, p)
    sp = wilder(pdm, p)
    sm = wilder(mdm, p)
    pdi = [float("nan")] * n
    mdi = [float("nan")] * n
    for i in range(n):
        if not isnum(str_[i]) or str_[i] == 0:
            continue
        pdi[i] = 100 * sp[i] / str_[i]
        mdi[i] = 100 * sm[i] / str_[i]
    return pdi, mdi


def stoch_k(cs, period=14):
    out = [float("nan")] * len(cs)
    for i in range(period - 1, len(cs)):
        hh = max(c["h"] for c in cs[i - period + 1 : i + 1])
        ll = min(c["l"] for c in cs[i - period + 1 : i + 1])
        out[i] = 50.0 if not (hh > ll) else 100.0 * (cs[i]["c"] - ll) / (hh - ll)
    return out


def mfi(cs, p=14):
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


def cvd(cs):
    acc = 0.0
    out = []
    for c in cs:
        acc += 2 * c["tb"] - c["v"]
        out.append(acc)
    return out


def obv(cs):
    o = [0.0]
    for i in range(1, len(cs)):
        if cs[i]["c"] > cs[i - 1]["c"]:
            o.append(o[-1] + cs[i]["v"])
        elif cs[i]["c"] < cs[i - 1]["c"]:
            o.append(o[-1] - cs[i]["v"])
        else:
            o.append(o[-1])
    return o


def bb_width(closes, p=20, k=2):
    out = [float("nan")] * len(closes)
    for i in range(p - 1, len(closes)):
        w = closes[i - p + 1 : i + 1]
        m = sum(w) / p
        sd = math.sqrt(sum((x - m) ** 2 for x in w) / p)
        out[i] = (2 * k * sd) / m if m else 0.0
    return out


def swings(cs, n):
    pts = []
    last = len(cs) - 1
    for i in range(n, last - n + 1):
        hi = cs[i]["h"]
        lo = cs[i]["l"]
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


def indicators(cs):
    closes = [c["c"] for c in cs]
    e12, e26 = ema(closes, 12), ema(closes, 26)
    macd = [a - b for a, b in zip(e12, e26)]
    hist = [m - s for m, s in zip(macd, ema(macd, 9))]
    pdi, mdi = di_lines(cs, 14)
    return {
        "rsi": rsi(closes, 14),
        "stoch": stoch_k(cs, 14),
        "mfi": mfi(cs, 14),
        "hist": hist,
        "atr": atr(cs, 14),
        "bbw": bb_width(closes, 20),
        "cvd": cvd(cs),
        "obv": obv(cs),
        "pdi": pdi,
        "mdi": mdi,
        "ema20": ema(closes, 20),
        "ema50": ema(closes, 50),
    }


def find_peaks(cs, interval: str, swing: int) -> list[int]:
    prom = PROMINENCE.get(interval, 72)
    drop = DROP.get(interval, 0.035)
    fwd = FWD.get(interval, 48)
    highs = [(i, p) for i, k, p in swings(cs, swing) if k == "h"]
    raw = []
    n = len(cs)
    for i, px in highs:
        lo = max(0, i - prom)
        if any(cs[j]["h"] > px + 1e-12 for j in range(lo, i)):
            continue
        hi = min(n - 1, i + fwd)
        if hi <= i:
            continue
        trough = min(c["l"] for c in cs[i : hi + 1])
        dd = (px - trough) / px if px else 0.0
        if dd >= drop:
            raw.append(i)
    # cluster: keep the highest high in each prominence/2 window
    gap = max(8, prom // 2)
    raw.sort()
    kept: list[int] = []
    for i in raw:
        if not kept:
            kept.append(i)
            continue
        if i - kept[-1] < gap:
            if cs[i]["h"] >= cs[kept[-1]]["h"]:
                kept[-1] = i
        else:
            kept.append(i)
    return kept


def prev_high(highs: list[tuple[int, float]], peak_i: int):
    prior = [(i, p) for i, p in highs if i < peak_i]
    return prior[-1] if prior else None


def argmax_num(series, lo, hi):
    best = lo
    best_v = -1e18
    for i in range(lo, hi + 1):
        v = series[i]
        if isnum(v) and v >= best_v:
            best_v = v
            best = i
    return best


def setup_at(cs, ind, peak_i, highs8, highs16, interval: str):
    c = cs[peak_i]
    atr = ind["atr"][peak_i]
    med_vol = 0.0
    w = [cs[j]["v"] for j in range(max(0, peak_i - 20), peak_i)]
    if w:
        w.sort()
        med_vol = w[len(w) // 2]
    rng = c["h"] - c["l"]
    bb_now = ind["bbw"][peak_i]
    bb_prev = ind["bbw"][peak_i - 24] if peak_i >= 24 else float("nan")
    atr_now = 100 * atr / c["c"] if isnum(atr) and c["c"] else float("nan")
    atr_prev = (
        100 * ind["atr"][peak_i - 24] / cs[peak_i - 24]["c"]
        if peak_i >= 24 and isnum(ind["atr"][peak_i - 24])
        else float("nan")
    )
    prev = prev_high(highs8, peak_i) or prev_high(highs16, peak_i)
    rsi_d = mfi_d = hist_d = cvd_d = None
    dpx = None
    if prev:
        pj, _ = prev
        dpx = (c["h"] - cs[pj]["h"]) / cs[pj]["h"] if cs[pj]["h"] else None
        if isnum(ind["rsi"][peak_i]) and isnum(ind["rsi"][pj]):
            rsi_d = ind["rsi"][peak_i] - ind["rsi"][pj]
        if isnum(ind["mfi"][peak_i]) and isnum(ind["mfi"][pj]):
            mfi_d = ind["mfi"][peak_i] - ind["mfi"][pj]
        if isnum(ind["hist"][peak_i]) and isnum(ind["hist"][pj]):
            hist_d = ind["hist"][peak_i] - ind["hist"][pj]
        cvd_d = ind["cvd"][peak_i] - ind["cvd"][pj]

    look = max(0, peak_i - 48)
    rsi_lead = peak_i - argmax_num(ind["rsi"], look, peak_i)
    macd_lead = peak_i - argmax_num(ind["hist"], look, peak_i)

    flags = []
    rsi_v = ind["rsi"][peak_i]
    st_v = ind["stoch"][peak_i]
    mf_v = ind["mfi"][peak_i]
    if isnum(rsi_v) and rsi_v >= 80:
        flags.append("rsi80")
    elif isnum(rsi_v) and rsi_v >= 70:
        flags.append("rsi70")
    if isnum(st_v) and st_v >= 80:
        flags.append("stoch80")
    if isnum(mf_v) and mf_v >= 80:
        flags.append("mfi80")
    hh = dpx is not None and dpx > 0.002
    if hh and rsi_d is not None and rsi_d < -0.5:
        flags.append("rsi_div")
    if hh and mfi_d is not None and mfi_d < -1:
        flags.append("mfi_div")
    if hh and hist_d is not None and hist_d < 0:
        flags.append("macd_div")
    if hh and cvd_d is not None and cvd_d < 0:
        flags.append("cvd_div")
    if rsi_lead >= 6:
        flags.append("rsi_lead")
    if macd_lead >= 6:
        flags.append("macd_lead")
    vol_x = (c["v"] / med_vol) if med_vol > 0 else float("nan")
    rng_atr = (rng / atr) if isnum(atr) and atr > 0 else float("nan")
    if isnum(vol_x) and vol_x >= 2.5:
        flags.append("vol_climax")
    if isnum(rng_atr) and rng_atr >= 2.5:
        flags.append("range_climax")
    if loc(c) <= 0.40:
        flags.append("reject")
    if isnum(bb_now) and isnum(bb_prev) and bb_prev > 0 and bb_now / bb_prev >= 1.5:
        flags.append("bb_expand")
    if isnum(atr_now) and isnum(atr_prev) and atr_prev > 0 and atr_now / atr_prev >= 1.4:
        flags.append("atr_expand")
    ema20 = ind["ema20"][peak_i]
    if isnum(ema20) and ema20 > 0 and (c["c"] / ema20 - 1) >= 0.03:
        flags.append("stretch_ema20")
    pdi, mdi = ind["pdi"][peak_i], ind["mdi"][peak_i]
    if isnum(pdi) and isnum(mdi) and pdi < mdi:
        flags.append("di_bear")

    # family buckets
    osc_div = any(f in flags for f in ("rsi_div", "mfi_div", "macd_div"))
    climax = "vol_climax" in flags or "range_climax" in flags
    expand = "bb_expand" in flags or "atr_expand" in flags
    if osc_div and climax:
        family = "div+climax"
    elif osc_div and expand:
        family = "div+expand"
    elif climax:
        family = "climax"
    elif osc_div:
        family = "div"
    elif expand:
        family = "expand"
    else:
        family = "none"

    fwd = FWD.get(interval, 48)
    hi = min(len(cs) - 1, peak_i + fwd)
    trough = min(c["l"] for c in cs[peak_i : hi + 1])
    dd = (c["h"] - trough) / c["h"] if c["h"] else 0.0
    close_n = cs[hi]["c"] / c["c"] - 1 if c["c"] else 0.0

    return {
        "t": c["t"],
        "px": c["h"],
        "close": c["c"],
        "loc": loc(c),
        "rsi": rsi_v,
        "stoch": st_v,
        "mfi": mf_v,
        "macdh": ind["hist"][peak_i],
        "atrpct": atr_now,
        "bbw": bb_now,
        "vol_x": vol_x,
        "rng_atr": rng_atr,
        "rsi_d": rsi_d,
        "mfi_d": mfi_d,
        "hist_d": hist_d,
        "dpx": dpx,
        "rsi_lead": rsi_lead,
        "macd_lead": macd_lead,
        "ema20_pct": (c["c"] / ema20 - 1) if isnum(ema20) and ema20 else None,
        "flags": flags,
        "family": family,
        "dd": dd,
        "fwd_c": close_n,
        "n_flags": len(flags),
        "osc_div": osc_div,
        "climax": climax,
        "expand": expand,
    }


def scan_series(symbol: str, interval: str, cs: list[dict], swing: int) -> list[dict]:
    if len(cs) < swing * 6 + 80:
        return []
    ind = indicators(cs)
    highs8 = [(i, p) for i, k, p in swings(cs, 8) if k == "h"]
    highs16 = [(i, p) for i, k, p in swings(cs, 16) if k == "h"]
    peaks = find_peaks(cs, interval, swing)
    peak_set = set(peaks)
    out = []
    for i in peaks:
        rec = setup_at(cs, ind, i, highs8, highs16, interval)
        rec["sym"] = symbol
        rec["tf"] = interval
        rec["i"] = i
        rec["significant"] = True
        out.append(rec)
    # Control: other 16-bar highs that did not qualify as significant dumps.
    for i, _px in highs16:
        if i in peak_set:
            continue
        if i < 50 or i > len(cs) - 10:
            continue
        rec = setup_at(cs, ind, i, highs8, highs16, interval)
        rec["sym"] = symbol
        rec["tf"] = interval
        rec["i"] = i
        rec["significant"] = False
        out.append(rec)
    return out


def summarize(events: list[dict]):
    sig = [e for e in events if e.get("significant", True)]
    ctrl = [e for e in events if not e.get("significant", True)]
    print(f"\n========== CONTROL: significant dump vs other 16-bar highs ==========")
    print(f"significant {len(sig)}   other highs {len(ctrl)}")
    flags = [
        "rsi80", "rsi70", "stoch80", "mfi80",
        "rsi_div", "mfi_div", "macd_div", "cvd_div",
        "rsi_lead", "macd_lead",
        "vol_climax", "range_climax", "reject",
        "bb_expand", "atr_expand", "stretch_ema20",
    ]
    print(f"{'flag':<16} {'sig':>6} {'other':>7} {'lift':>6}")
    for f in flags:
        a = pct(sig, lambda e, f=f: f in e["flags"])
        b = pct(ctrl, lambda e, f=f: f in e["flags"]) if ctrl else float("nan")
        lift = (a / b) if b and b == b and b > 0 else float("nan")
        print(f"{f:<16} {a:6.0%} {b:7.0%} {lift:6.2f}x")
    print(
        f"{'osc_div':<16} {pct(sig, lambda e: e['osc_div']):6.0%} "
        f"{pct(ctrl, lambda e: e['osc_div']):7.0%}"
    )
    print(
        f"{'climax':<16} {pct(sig, lambda e: e['climax']):6.0%} "
        f"{pct(ctrl, lambda e: e['climax']):7.0%}"
    )
    print(
        f"{'expand':<16} {pct(sig, lambda e: e['expand']):6.0%} "
        f"{pct(ctrl, lambda e: e['expand']):7.0%}"
    )

    events = sig
    print(f"\n========== {len(events)} SIGNIFICANT PEAKS ==========")
    print(f"{'tf':<6} {'n':>5} {'avg dd':>8} {'med dd':>8} {'avg rsi':>8} {'div%':>6} {'climax%':>8} {'expand%':>8}")
    by_tf = defaultdict(list)
    for e in events:
        by_tf[e["tf"]].append(e)
    for tf in sorted(by_tf):
        rs = by_tf[tf]
        dds = sorted(e["dd"] for e in rs)
        med = dds[len(dds) // 2]
        print(
            f"{tf:<6} {len(rs):5d} {mean(e['dd'] for e in rs):8.1%} {med:8.1%} "
            f"{mean(e['rsi'] for e in rs):8.1f} "
            f"{pct(rs, lambda e: e['osc_div']):6.0%} "
            f"{pct(rs, lambda e: e['climax']):8.0%} "
            f"{pct(rs, lambda e: e['expand']):8.0%}"
        )

    print("\n========== TELL RATES AT THE PEAK ==========")
    flags = [
        "rsi80", "rsi70", "stoch80", "mfi80",
        "rsi_div", "mfi_div", "macd_div", "cvd_div",
        "rsi_lead", "macd_lead",
        "vol_climax", "range_climax", "reject",
        "bb_expand", "atr_expand", "stretch_ema20", "di_bear",
    ]
    print(f"{'flag':<16} {'all':>6} {'big dd':>8} {'small dd':>9} {'1h':>6} {'4h':>6}")
    big = [e for e in events if e["dd"] >= 0.08]
    small = [e for e in events if e["dd"] < 0.05]
    h1 = [e for e in events if e["tf"] == "1h"]
    h4 = [e for e in events if e["tf"] == "4h"]
    for f in flags:
        def r(rs, f=f):
            return pct(rs, lambda e: f in e["flags"])
        print(f"{f:<16} {r(events):6.0%} {r(big):8.0%} {r(small):9.0%} {r(h1):6.0%} {r(h4):6.0%}")

    print("\n========== FAMILY vs FORWARD DUMP ==========")
    print(f"{'family':<14} {'n':>5} {'avg dd':>8} {'med dd':>8} {'dd>=8%':>8} {'avg rsi':>8} {'avg volx':>8}")
    by_f = defaultdict(list)
    for e in events:
        by_f[e["family"]].append(e)
    for fam in ("div+climax", "div+expand", "climax", "div", "expand", "none"):
        rs = by_f.get(fam, [])
        if not rs:
            print(f"{fam:<14} {0:5d}")
            continue
        dds = sorted(e["dd"] for e in rs)
        print(
            f"{fam:<14} {len(rs):5d} {mean(e['dd'] for e in rs):8.1%} {dds[len(dds)//2]:8.1%} "
            f"{pct(rs, lambda e: e['dd']>=0.08):8.0%} {mean(e['rsi'] for e in rs):8.1f} "
            f"{mean(e['vol_x'] for e in rs):8.2f}"
        )

    print("\n========== CONFLUENCE COUNT (n flags) ==========")
    print(f"{'n flags':>8} {'n':>5} {'avg dd':>8} {'dd>=8%':>8}")
    by_n = defaultdict(list)
    for e in events:
        k = min(e["n_flags"], 8)
        by_n[k].append(e)
    for k in range(0, 9):
        rs = by_n.get(k, [])
        if not rs:
            continue
        print(f"{k:8d} {len(rs):5d} {mean(e['dd'] for e in rs):8.1%} {pct(rs, lambda e: e['dd']>=0.08):8.0%}")

    print("\n========== 1h ONLY: combos ==========")
    h1 = [e for e in events if e["tf"] == "1h"]
    combos = [
        ("rsi_div", lambda e: "rsi_div" in e["flags"]),
        ("mfi_div", lambda e: "mfi_div" in e["flags"]),
        ("cvd_div", lambda e: "cvd_div" in e["flags"]),
        ("rsi_lead", lambda e: "rsi_lead" in e["flags"]),
        ("vol_climax", lambda e: "vol_climax" in e["flags"]),
        ("range_climax", lambda e: "range_climax" in e["flags"]),
        ("bb_expand", lambda e: "bb_expand" in e["flags"]),
        ("reject close", lambda e: "reject" in e["flags"]),
        ("div+climax", lambda e: e["osc_div"] and e["climax"]),
        ("div+expand", lambda e: e["osc_div"] and e["expand"]),
        ("div+climax+expand", lambda e: e["osc_div"] and e["climax"] and e["expand"]),
        ("rsi80+vol_climax", lambda e: "rsi80" in e["flags"] and "vol_climax" in e["flags"]),
        ("rsi_div+mfi_div", lambda e: "rsi_div" in e["flags"] and "mfi_div" in e["flags"]),
        ("rsi_div+bb_expand", lambda e: "rsi_div" in e["flags"] and "bb_expand" in e["flags"]),
        ("climax+reject", lambda e: e["climax"] and "reject" in e["flags"]),
        ("no osc / no climax", lambda e: (not e["osc_div"]) and (not e["climax"])),
    ]
    print(f"{'combo':<22} {'n':>5} {'avg dd':>8} {'med dd':>8} {'dd>=8%':>8} {'avg rsi':>8}")
    for name, pred in combos:
        rs = [e for e in h1 if pred(e)]
        if len(rs) < 5:
            print(f"{name:<22} {len(rs):5d}  (n small)")
            continue
        dds = sorted(e["dd"] for e in rs)
        print(
            f"{name:<22} {len(rs):5d} {mean(e['dd'] for e in rs):8.1%} {dds[len(dds)//2]:8.1%} "
            f"{pct(rs, lambda e: e['dd']>=0.08):8.0%} {mean(e['rsi'] for e in rs):8.1f}"
        )

    print("\n========== BIGGEST DUMPS (dd) ==========")
    top = sorted(events, key=lambda e: e["dd"], reverse=True)[:18]
    print(
        f"  {'sym':<10} {'tf':<4} {'time':<17} {'high':>10} {'dd':>7} {'rsi':>6} "
        f"{'family':<12} flags"
    )
    for e in top:
        print(
            f"  {e['sym']:<10} {e['tf']:<4} {fmt_t(e['t']):<17} {e['px']:10.5g} "
            f"{e['dd']:7.1%} {e['rsi'] if isnum(e['rsi']) else float('nan'):6.1f} "
            f"{e['family']:<12} {','.join(e['flags'][:7]) or '—'}"
        )

    print("\n========== XRP 1h peaks (sanity vs 15 Jun / 4 Jul / 22 Aug) ==========")
    xr = [e for e in events if e["sym"] == "XRPUSDT" and e["tf"] == "1h"]
    xr.sort(key=lambda e: e["t"])
    for e in xr:
        print(
            f"  {fmt_t(e['t'])} H={e['px']:.4f} dd={e['dd']:.1%} rsi={e['rsi']:.1f} "
            f"{e['family']:<12} {','.join(e['flags'])}"
        )

    print("\n========== FLAG COUNTS ==========")
    c = Counter()
    for e in events:
        c.update(e["flags"])
    for k, n in c.most_common():
        print(f"  {k:<16} {n:4d}  {n/len(events):.0%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="XRPUSDT,BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT")
    ap.add_argument("--intervals", default="15m,1h,4h")
    ap.add_argument("--start", default="2026-01-01")
    ap.add_argument("--end", default="2026-09-02")
    ap.add_argument("--swing", type=int, default=SWING)
    ap.add_argument("--out", default="/tmp/peak_indicator_scan.jsonl")
    args = ap.parse_args()

    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    intervals = [s.strip() for s in args.intervals.split(",") if s.strip()]
    start = int(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc).timestamp() * 1000)
    print(
        f"peak scan symbols={symbols} tfs={intervals} swing={args.swing} "
        f"{args.start} → {args.end}",
        flush=True,
    )

    all_e: list[dict] = []
    for interval in intervals:
        for sym in symbols:
            print(f"fetch {sym} {interval}...", flush=True)
            cs = fetch_klines(sym, interval, start, end)
            if not cs:
                print("  no candles")
                continue
            print(f"  {len(cs)} candles {fmt_t(cs[0]['t'])} → {fmt_t(cs[-1]['t'])}", flush=True)
            ev = scan_series(sym, interval, cs, args.swing)
            print(f"  peaks {len(ev)}", flush=True)
            all_e.extend(ev)
            del cs

    summarize(all_e)
    with open(args.out, "w") as f:
        for e in all_e:
            f.write(json.dumps(e) + "\n")
    print(f"\nwrote {len(all_e)} peaks → {args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
