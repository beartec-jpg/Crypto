#!/usr/bin/env python3
"""
Significant swing bottoms (no Swoop) + indicator / funding / OI tells.

A bottom is a confirmed n-bar low that is the lowest print in a prominence
window and then actually rallies. Control = other 16-bar lows that did not.

Funding: full Binance USDT-M history (8h prints, from listing).
OI: Binance only keeps ~30d of openInterestHist — attached where present.
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
MAX_CANDLES = 100_000
PROMINENCE = {"15m": 96, "1h": 72, "4h": 42}
RALLY = {"15m": 0.03, "1h": 0.035, "4h": 0.05}
FWD = {"15m": 64, "1h": 48, "4h": 30}


def http_json(url, timeout=25):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def fetch_klines(symbol, interval, start_ms, end_ms):
    out, cursor = [], start_ms
    while cursor < end_ms and len(out) < MAX_CANDLES:
        qs = urllib.parse.urlencode({
            "symbol": symbol, "interval": interval,
            "startTime": cursor, "endTime": end_ms, "limit": 1000,
        })
        url = f"https://api.binance.com/api/v3/klines?{qs}"
        try:
            rows = http_json(url)
        except Exception as e:
            print(f"  kline retry {symbol} {interval}: {e}", flush=True)
            time.sleep(1.5)
            rows = http_json(url)
        if not rows:
            break
        for k in rows:
            out.append({
                "t": int(k[0]) // 1000, "o": float(k[1]), "h": float(k[2]),
                "l": float(k[3]), "c": float(k[4]), "v": float(k[5]), "tb": float(k[9]),
            })
        cursor = int(rows[-1][0]) + 1
        if len(rows) < 1000:
            break
        time.sleep(0.1)
    return out


def fetch_funding(symbol):
    """USDT-M funding, 8h, paginate from listing."""
    out, cursor = [], 1569888000000  # 2019-10-01
    end = int(time.time() * 1000)
    while cursor < end:
        qs = urllib.parse.urlencode({
            "symbol": symbol, "startTime": cursor, "limit": 1000,
        })
        try:
            rows = http_json(f"https://fapi.binance.com/fapi/v1/fundingRate?{qs}")
        except Exception as e:
            print(f"  fund retry {symbol}: {e}", flush=True)
            time.sleep(1)
            try:
                rows = http_json(f"https://fapi.binance.com/fapi/v1/fundingRate?{qs}")
            except Exception:
                break
        if not rows:
            break
        for r in rows:
            out.append((int(r["fundingTime"]) // 1000, float(r["fundingRate"])))
        nxt = int(rows[-1]["fundingTime"]) + 1
        if nxt <= cursor:
            break
        cursor = nxt
        if len(rows) < 1000:
            break
        time.sleep(0.08)
    return out


def fetch_oi(symbol, period="1h"):
    qs = urllib.parse.urlencode({"symbol": symbol, "period": period, "limit": 500})
    try:
        rows = http_json(f"https://fapi.binance.com/futures/data/openInterestHist?{qs}")
    except Exception as e:
        print(f"  oi skip {symbol}: {e}", flush=True)
        return []
    out = []
    for r in rows:
        out.append((int(r["timestamp"]) // 1000, float(r["sumOpenInterest"])))
    return out


def last_le(series, t):
    """Last (ts, val) with ts <= t. series sorted by ts."""
    if not series:
        return None
    lo, hi = 0, len(series) - 1
    ans = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if series[mid][0] <= t:
            ans = series[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return ans


def fmt_t(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def isnum(x):
    return x is not None and x == x


def mean(xs):
    xs = [x for x in xs if isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def pct(xs, pred):
    xs = list(xs)
    return sum(1 for x in xs if pred(x)) / len(xs) if xs else float("nan")


def loc(c):
    rng = c["h"] - c["l"]
    return 0.5 if rng <= 0 else (c["c"] - c["l"]) / rng


def ema(xs, p):
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
        tr.append(max(cs[i]["h"] - cs[i]["l"], abs(cs[i]["h"] - cs[i - 1]["c"]), abs(cs[i]["l"] - cs[i - 1]["c"])))
    return wilder(tr, p)


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


def indicators(cs):
    closes = [c["c"] for c in cs]
    e12, e26 = ema(closes, 12), ema(closes, 26)
    macd = [a - b for a, b in zip(e12, e26)]
    hist = [m - s for m, s in zip(macd, ema(macd, 9))]
    return {
        "rsi": rsi(closes, 14),
        "stoch": stoch_k(cs, 14),
        "mfi": mfi(cs, 14),
        "hist": hist,
        "atr": atr(cs, 14),
        "bbw": bb_width(closes, 20),
        "cvd": cvd(cs),
        "ema20": ema(closes, 20),
        "ema50": ema(closes, 50),
    }


def find_bottoms(cs, interval, swing):
    prom = PROMINENCE.get(interval, 72)
    rally = RALLY.get(interval, 0.035)
    fwd = FWD.get(interval, 48)
    lows = [(i, p) for i, k, p in swings(cs, swing) if k == "l"]
    raw = []
    n = len(cs)
    for i, px in lows:
        lo = max(0, i - prom)
        if any(cs[j]["l"] < px - 1e-12 for j in range(lo, i)):
            continue
        hi = min(n - 1, i + fwd)
        if hi <= i:
            continue
        peak = max(c["h"] for c in cs[i : hi + 1])
        up = (peak - px) / px if px else 0.0
        if up >= rally:
            raw.append(i)
    gap = max(8, prom // 2)
    raw.sort()
    kept = []
    for i in raw:
        if not kept:
            kept.append(i)
            continue
        if i - kept[-1] < gap:
            if cs[i]["l"] <= cs[kept[-1]]["l"]:
                kept[-1] = i
        else:
            kept.append(i)
    return kept


def prev_low(lows, i):
    prior = [(j, p) for j, p in lows if j < i]
    return prior[-1] if prior else None


def argmin_num(series, lo, hi):
    best, best_v = lo, 1e18
    for i in range(lo, hi + 1):
        v = series[i]
        if isnum(v) and v <= best_v:
            best_v, best = v, i
    return best


def setup_at(cs, ind, bot_i, lows8, lows16, interval, funding, oi):
    c = cs[bot_i]
    atr = ind["atr"][bot_i]
    w = [cs[j]["v"] for j in range(max(0, bot_i - 20), bot_i)]
    med_vol = sorted(w)[len(w) // 2] if w else 0.0
    rng = c["h"] - c["l"]
    bb_now = ind["bbw"][bot_i]
    bb_prev = ind["bbw"][bot_i - 24] if bot_i >= 24 else float("nan")
    atr_now = 100 * atr / c["c"] if isnum(atr) and c["c"] else float("nan")
    atr_prev = (
        100 * ind["atr"][bot_i - 24] / cs[bot_i - 24]["c"]
        if bot_i >= 24 and isnum(ind["atr"][bot_i - 24]) else float("nan")
    )
    prev = prev_low(lows8, bot_i) or prev_low(lows16, bot_i)
    rsi_d = mfi_d = hist_d = cvd_d = dpx = None
    if prev:
        pj, _ = prev
        dpx = (c["l"] - cs[pj]["l"]) / cs[pj]["l"] if cs[pj]["l"] else None
        if isnum(ind["rsi"][bot_i]) and isnum(ind["rsi"][pj]):
            rsi_d = ind["rsi"][bot_i] - ind["rsi"][pj]
        if isnum(ind["mfi"][bot_i]) and isnum(ind["mfi"][pj]):
            mfi_d = ind["mfi"][bot_i] - ind["mfi"][pj]
        if isnum(ind["hist"][bot_i]) and isnum(ind["hist"][pj]):
            hist_d = ind["hist"][bot_i] - ind["hist"][pj]
        cvd_d = ind["cvd"][bot_i] - ind["cvd"][pj]

    look = max(0, bot_i - 48)
    rsi_lead = bot_i - argmin_num(ind["rsi"], look, bot_i)
    d_rsi = (ind["rsi"][bot_i] - ind["rsi"][bot_i - 1]) if bot_i and isnum(ind["rsi"][bot_i]) and isnum(ind["rsi"][bot_i - 1]) else 0.0
    d_mfi = (ind["mfi"][bot_i] - ind["mfi"][bot_i - 1]) if bot_i and isnum(ind["mfi"][bot_i]) and isnum(ind["mfi"][bot_i - 1]) else 0.0

    vol_x = (c["v"] / med_vol) if med_vol > 0 else float("nan")
    rng_atr = (rng / atr) if isnum(atr) and atr > 0 else float("nan")
    loc_v = loc(c)
    rsi_v, st_v, mf_v = ind["rsi"][bot_i], ind["stoch"][bot_i], ind["mfi"][bot_i]
    ema20 = ind["ema20"][bot_i]
    ema50 = ind["ema50"][bot_i]

    flags = []
    if isnum(rsi_v) and rsi_v <= 20:
        flags.append("rsi20")
    elif isnum(rsi_v) and rsi_v <= 30:
        flags.append("rsi30")
    if isnum(st_v) and st_v <= 20:
        flags.append("stoch20")
    if isnum(mf_v) and mf_v <= 20:
        flags.append("mfi20")
    ll = dpx is not None and dpx < -0.002
    if ll and rsi_d is not None and rsi_d > 0.5:
        flags.append("rsi_div")  # LL in price, higher RSI
    if ll and mfi_d is not None and mfi_d > 1:
        flags.append("mfi_div")
    if ll and hist_d is not None and hist_d > 0:
        flags.append("macd_div")
    if ll and cvd_d is not None and cvd_d > 0:
        flags.append("cvd_div")
    if rsi_lead >= 6:
        flags.append("rsi_lead")
    if isnum(vol_x) and vol_x >= 2.5:
        flags.append("vol_climax")
    if isnum(rng_atr) and rng_atr >= 2.5:
        flags.append("range_climax")
    if loc_v >= 0.60:
        flags.append("reject")  # closed off the low
    if isnum(bb_now) and isnum(bb_prev) and bb_prev > 0 and bb_now / bb_prev >= 1.5:
        flags.append("bb_expand")
    if isnum(atr_now) and isnum(atr_prev) and atr_prev > 0 and atr_now / atr_prev >= 1.4:
        flags.append("atr_expand")
    if isnum(ema20) and ema20 > 0 and (c["c"] / ema20 - 1) <= -0.03:
        flags.append("stretch_ema20")
    osc_death = d_rsi <= -8 or d_mfi <= -10
    if osc_death:
        flags.append("osc_death")
    climax = "vol_climax" in flags or "range_climax" in flags
    if climax and osc_death:
        flags.append("cap_bar")  # capitulation bar (mirror of sell climax)

    # funding
    fund = last_le(funding, c["t"])
    fund_prev = last_le(funding, c["t"] - 24 * 3600) if funding else None
    fund_r = fund[1] if fund else float("nan")
    fund_d = (fund[1] - fund_prev[1]) if fund and fund_prev else float("nan")
    if isnum(fund_r) and fund_r < 0:
        flags.append("fund_neg")
    if isnum(fund_r) and fund_r <= -0.0001:
        flags.append("fund_very_neg")
    if isnum(fund_d) and fund_d > 0:
        flags.append("fund_rising")  # less short-crowded / flipping up

    # OI (short history)
    oi_now = last_le(oi, c["t"])
    oi_prev = last_le(oi, c["t"] - 24 * 3600) if oi else None
    oi_ch = None
    if oi_now and oi_prev and oi_prev[1] > 0:
        oi_ch = oi_now[1] / oi_prev[1] - 1
        if oi_ch < -0.03:
            flags.append("oi_flush")
        if oi_ch > 0.03:
            flags.append("oi_build")

    osc_div = any(f in flags for f in ("rsi_div", "mfi_div", "macd_div"))
    expand = "bb_expand" in flags or "atr_expand" in flags
    if "cap_bar" in flags:
        family = "cap_bar"
    elif osc_div and climax:
        family = "div+climax"
    elif climax:
        family = "climax"
    elif osc_div:
        family = "div"
    elif expand:
        family = "expand"
    else:
        family = "none"

    fwd = FWD.get(interval, 48)
    hi = min(len(cs) - 1, bot_i + fwd)
    peak = max(x["h"] for x in cs[bot_i : hi + 1])
    up = peak / c["l"] - 1 if c["l"] else 0.0
    close_n = cs[hi]["c"] / c["c"] - 1 if c["c"] else 0.0

    return {
        "t": c["t"], "px": c["l"], "close": c["c"], "loc": loc_v,
        "rsi": rsi_v, "stoch": st_v, "mfi": mf_v, "macdh": ind["hist"][bot_i],
        "atrpct": atr_now, "bbw": bb_now, "vol_x": vol_x, "rng_atr": rng_atr,
        "rsi_d": rsi_d, "mfi_d": mfi_d, "d_rsi": d_rsi, "d_mfi": d_mfi,
        "dpx": dpx, "rsi_lead": rsi_lead,
        "ema20_pct": (c["c"] / ema20 - 1) if isnum(ema20) and ema20 else None,
        "ema50_pct": (c["c"] / ema50 - 1) if isnum(ema50) and ema50 else None,
        "fund": fund_r, "fund_d": fund_d,
        "oi_ch": oi_ch,
        "flags": flags, "family": family,
        "up": up, "fwd_c": close_n, "n_flags": len(flags),
        "osc_div": osc_div, "climax": climax, "expand": expand,
        "has_fund": isnum(fund_r), "has_oi": oi_ch is not None,
    }


def summarize(events):
    sig = [e for e in events if e.get("significant", True)]
    ctrl = [e for e in events if not e.get("significant", True)]
    print(f"\n========== CONTROL: significant rally vs other 16-bar lows ==========")
    print(f"significant {len(sig)}   other lows {len(ctrl)}")
    flags = [
        "rsi20", "rsi30", "stoch20", "mfi20",
        "rsi_div", "mfi_div", "macd_div", "cvd_div",
        "rsi_lead", "osc_death", "vol_climax", "range_climax", "cap_bar",
        "reject", "bb_expand", "atr_expand", "stretch_ema20",
        "fund_neg", "fund_very_neg", "fund_rising", "oi_flush", "oi_build",
    ]
    print(f"{'flag':<16} {'sig':>6} {'other':>7} {'lift':>6}")
    for f in flags:
        a = pct(sig, lambda e, f=f: f in e["flags"])
        b = pct(ctrl, lambda e, f=f: f in e["flags"]) if ctrl else float("nan")
        lift = (a / b) if isnum(b) and b > 0 else float("nan")
        print(f"{f:<16} {a:6.0%} {b:7.0%} {lift:6.2f}x")
    print(f"{'osc_div':<16} {pct(sig, lambda e: e['osc_div']):6.0%} {pct(ctrl, lambda e: e['osc_div']):7.0%}")
    print(f"{'climax':<16} {pct(sig, lambda e: e['climax']):6.0%} {pct(ctrl, lambda e: e['climax']):7.0%}")

    funded = [e for e in sig if e["has_fund"]]
    print(f"\nfunding coverage on significant bottoms: {len(funded)}/{len(sig)}")
    if funded:
        print(f"  mean funding sig {mean(e['fund'] for e in funded):.5f}  "
              f"ctrl {mean(e['fund'] for e in ctrl if e['has_fund']):.5f}")
        print(f"  fund_neg sig {pct(funded, lambda e: 'fund_neg' in e['flags']):.0%}  "
              f"ctrl {pct([e for e in ctrl if e['has_fund']], lambda e: 'fund_neg' in e['flags']):.0%}")
        print(f"  fund_very_neg sig {pct(funded, lambda e: 'fund_very_neg' in e['flags']):.0%}  "
              f"ctrl {pct([e for e in ctrl if e['has_fund']], lambda e: 'fund_very_neg' in e['flags']):.0%}")
        print(f"  fund_rising sig {pct(funded, lambda e: 'fund_rising' in e['flags']):.0%}  "
              f"ctrl {pct([e for e in ctrl if e['has_fund']], lambda e: 'fund_rising' in e['flags']):.0%}")
    oi_s = [e for e in sig if e["has_oi"]]
    oi_c = [e for e in ctrl if e["has_oi"]]
    print(f"OI coverage (Binance ~30d only): sig {len(oi_s)}  ctrl {len(oi_c)}")
    if oi_s and oi_c:
        print(f"  mean 24h OI ch sig {mean(e['oi_ch'] for e in oi_s):.2%}  ctrl {mean(e['oi_ch'] for e in oi_c):.2%}")
        print(f"  oi_flush sig {pct(oi_s, lambda e: 'oi_flush' in e['flags']):.0%}  ctrl {pct(oi_c, lambda e: 'oi_flush' in e['flags']):.0%}")

    events = sig
    print(f"\n========== {len(events)} SIGNIFICANT BOTTOMS ==========")
    print(f"{'tf':<6} {'n':>5} {'avg up':>8} {'med up':>8} {'avg rsi':>8} {'div%':>6} {'clim%':>7} {'cap%':>6}")
    by_tf = defaultdict(list)
    for e in events:
        by_tf[e["tf"]].append(e)
    for tf in sorted(by_tf):
        rs = by_tf[tf]
        ups = sorted(e["up"] for e in rs)
        print(
            f"{tf:<6} {len(rs):5d} {mean(e['up'] for e in rs):8.1%} {ups[len(ups)//2]:8.1%} "
            f"{mean(e['rsi'] for e in rs):8.1f} {pct(rs, lambda e: e['osc_div']):6.0%} "
            f"{pct(rs, lambda e: e['climax']):7.0%} {pct(rs, lambda e: 'cap_bar' in e['flags']):6.0%}"
        )

    print("\n========== FAMILY vs FORWARD RALLY ==========")
    print(f"{'family':<14} {'n':>5} {'avg up':>8} {'med up':>8} {'up>=8%':>8} {'avg rsi':>8}")
    by_f = defaultdict(list)
    for e in events:
        by_f[e["family"]].append(e)
    for fam in ("cap_bar", "div+climax", "climax", "div", "expand", "none"):
        rs = by_f.get(fam, [])
        if not rs:
            print(f"{fam:<14} {0:5d}")
            continue
        ups = sorted(e["up"] for e in rs)
        print(
            f"{fam:<14} {len(rs):5d} {mean(e['up'] for e in rs):8.1%} {ups[len(ups)//2]:8.1%} "
            f"{pct(rs, lambda e: e['up']>=0.08):8.0%} {mean(e['rsi'] for e in rs):8.1f}"
        )

    print("\n========== 1h COMBOS (n, % that are significant among all 16-bar lows) ==========")
    # already split sig vs ctrl; report sig rates for combos among 1h sig
    h1 = [e for e in events if e["tf"] == "1h"]
    combos = [
        ("rsi_div", lambda e: "rsi_div" in e["flags"]),
        ("vol_climax", lambda e: "vol_climax" in e["flags"]),
        ("range_climax", lambda e: "range_climax" in e["flags"]),
        ("reject close", lambda e: "reject" in e["flags"]),
        ("cap_bar", lambda e: "cap_bar" in e["flags"]),
        ("cap+reject", lambda e: "cap_bar" in e["flags"] and "reject" in e["flags"]),
        ("rsi_div+reject", lambda e: "rsi_div" in e["flags"] and "reject" in e["flags"]),
        ("fund_neg", lambda e: "fund_neg" in e["flags"]),
        ("fund_very_neg", lambda e: "fund_very_neg" in e["flags"]),
        ("fund_rising", lambda e: "fund_rising" in e["flags"]),
        ("cap+fund_neg", lambda e: "cap_bar" in e["flags"] and "fund_neg" in e["flags"]),
        ("rsi30+reject", lambda e: ("rsi30" in e["flags"] or "rsi20" in e["flags"]) and "reject" in e["flags"]),
        ("stretch+reject", lambda e: "stretch_ema20" in e["flags"] and "reject" in e["flags"]),
    ]
    print(f"{'combo':<22} {'n':>5} {'avg up':>8} {'up>=8%':>8} {'rsi':>6} {'fund':>9}")
    for name, pred in combos:
        rs = [e for e in h1 if pred(e)]
        if len(rs) < 8:
            print(f"{name:<22} {len(rs):5d}  (n small)")
            continue
        print(
            f"{name:<22} {len(rs):5d} {mean(e['up'] for e in rs):8.2%} {pct(rs, lambda e: e['up']>=0.08):8.0%} "
            f"{mean(e['rsi'] for e in rs):6.1f} {mean(e['fund'] for e in rs):9.5f}"
        )

    print("\n========== BIGGEST RALLIES ==========")
    top = sorted(events, key=lambda e: e["up"], reverse=True)[:15]
    print(f"  {'sym':<10} {'tf':<4} {'time':<17} {'low':>10} {'up':>7} {'rsi':>6} {'family':<12} flags")
    for e in top:
        print(
            f"  {e['sym']:<10} {e['tf']:<4} {fmt_t(e['t']):<17} {e['px']:10.5g} {e['up']:7.1%} "
            f"{e['rsi'] if isnum(e['rsi']) else float('nan'):6.1f} {e['family']:<12} {','.join(e['flags'][:6]) or '—'}"
        )

    print("\n========== vs PEAK/SELL NOTES ==========")
    print("Peaks (distribution): rsi80, stretch ema20, rsi_div vs HH, range climax, bb expand.")
    print("Bottoms (this scan): look at cap_bar / reject / rsi_div vs LL / fund_neg / oi_flush lift.")


def scan_series(symbol, interval, cs, swing, funding, oi):
    if len(cs) < swing * 6 + 80:
        return []
    ind = indicators(cs)
    lows8 = [(i, p) for i, k, p in swings(cs, 8) if k == "l"]
    lows16 = [(i, p) for i, k, p in swings(cs, 16) if k == "l"]
    bots = find_bottoms(cs, interval, swing)
    bot_set = set(bots)
    out = []
    for i in bots:
        rec = setup_at(cs, ind, i, lows8, lows16, interval, funding, oi)
        rec["sym"] = symbol
        rec["tf"] = interval
        rec["i"] = i
        rec["significant"] = True
        out.append(rec)
    for i, _px in lows16:
        if i in bot_set or i < 50 or i > len(cs) - 10:
            continue
        rec = setup_at(cs, ind, i, lows8, lows16, interval, funding, oi)
        rec["sym"] = symbol
        rec["tf"] = interval
        rec["i"] = i
        rec["significant"] = False
        out.append(rec)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="XRPUSDT,BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT")
    ap.add_argument("--intervals", default="1h,4h")
    ap.add_argument("--start", default="2019-01-01")
    ap.add_argument("--end", default="2026-09-02")
    ap.add_argument("--swing", type=int, default=SWING)
    ap.add_argument("--out", default="/tmp/bottom_indicator_scan.jsonl")
    args = ap.parse_args()
    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    intervals = [s.strip() for s in args.intervals.split(",") if s.strip()]
    start = int(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc).timestamp() * 1000)
    print(f"bottom scan (no swoop) {symbols} {intervals} swing={args.swing} {args.start}→{args.end}", flush=True)

    funds, ois = {}, {}
    for sym in symbols:
        print(f"funding {sym}...", flush=True)
        funds[sym] = fetch_funding(sym)
        print(f"  {len(funds[sym])} prints", flush=True)
        print(f"oi {sym}...", flush=True)
        ois[sym] = fetch_oi(sym, "1h")
        print(f"  {len(ois[sym])} hours (recent only)", flush=True)

    all_e = []
    for interval in intervals:
        for sym in symbols:
            print(f"klines {sym} {interval}...", flush=True)
            cs = fetch_klines(sym, interval, start, end)
            if len(cs) < 400:
                print(f"  skip n={len(cs)}")
                continue
            print(f"  {len(cs)} {fmt_t(cs[0]['t'])} → {fmt_t(cs[-1]['t'])}", flush=True)
            ev = scan_series(sym, interval, cs, args.swing, funds.get(sym, []), ois.get(sym, []))
            print(f"  events {len(ev)} sig {sum(1 for e in ev if e['significant'])}", flush=True)
            all_e.extend(ev)
            del cs

    summarize(all_e)
    with open(args.out, "w") as f:
        for e in all_e:
            f.write(json.dumps(e) + "\n")
    print(f"\nwrote {len(all_e)} rows → {args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
