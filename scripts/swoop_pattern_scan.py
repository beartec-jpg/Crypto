#!/usr/bin/env python3
"""
Find historic structure-book patterns and compare indicator tells
on the ones that break upward.

Patterns (same rules as the client book):
  swoop              curved decelerating LH dump
  equal_compression  triangle (LH + rising lows)
  down_compression   down wedge (LH + LL)
  channel            whole envelope sideways

Event-based: one row per newly confirmed last-LH, not every bar.
Break = first close after confirmation > last LH × 1.001.

Do not hammer a busy box — run niced, one series at a time.
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
BREAK_MULT = 1.001
MAX_CANDLES = 25000

LABEL = {
    "swoop": "swoop",
    "equal_compression": "triangle",
    "down_compression": "down_wedge",
    "channel": "channel",
}


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


def swings(cs: list[dict], n: int) -> list[tuple[int, str, float]]:
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


def collapse(pts: list[tuple[int, str, float]]) -> list[tuple[int, str, float]]:
    zz: list[tuple[int, str, float]] = []
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


def lower_highs(highs: list[tuple[int, float]]) -> list[tuple[int, float]]:
    if len(highs) < 2:
        return []
    peak = max(range(len(highs)), key=lambda i: highs[i][1])
    seq = [highs[peak]]
    for i in range(peak + 1, len(highs)):
        if highs[i][1] < seq[-1][1]:
            seq.append(highs[i])
    return seq if len(seq) >= 2 else []


def lower_lows(lows: list[tuple[int, float]], after: int) -> list[tuple[int, float]]:
    pool = [x for x in lows if x[0] > after]
    if not pool:
        return []
    seq = [pool[0]]
    for p in pool[1:]:
        if p[1] < seq[-1][1]:
            seq.append(p)
    return seq if len(seq) >= 2 else pool[:1]


def higher_lows(lows: list[tuple[int, float]], after: int) -> list[tuple[int, float]]:
    pool = [x for x in lows if x[0] > after]
    if len(pool) < 2:
        return []
    trough = min(range(len(pool)), key=lambda i: pool[i][1])
    seq = [pool[trough]]
    for p in pool[trough + 1 :]:
        if p[1] > seq[-1][1]:
            seq.append(p)
    return seq if len(seq) >= 2 else []


def segs(run: list[tuple[int, float]]) -> list[dict]:
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


def decelerating(ss: list[dict]) -> bool:
    if len(ss) < 2 or ss[0]["slope"] >= 0:
        return False
    flat = sum(1 for i in range(1, len(ss)) if ss[i]["slope"] > ss[i - 1]["slope"])
    return flat >= math.ceil((len(ss) - 1) / 2)


def mostly_flat(pts: list[tuple[int, float]], max_rel: float = 0.01) -> bool:
    if len(pts) < 2:
        return False
    n = 0
    for a, b in zip(pts, pts[1:]):
        if abs(b[1] - a[1]) / max(abs(a[1]), 1e-12) <= max_rel:
            n += 1
    return n / (len(pts) - 1) >= 0.75


def classify(lh, ll, hl, top) -> str:
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


def bar_delta(c):
    vol = c["v"]
    if vol <= 0:
        return 0.0
    tb = c.get("tb")
    if tb is not None:
        return 2 * tb - vol
    rng = c["h"] - c["l"]
    if rng <= 0:
        return vol if c["c"] >= c["o"] else -vol
    return vol * ((2 * (c["c"] - c["l"]) / rng) - 1)


def rsi14(closes):
    n = len(closes)
    out = [float("nan")] * n
    if n <= 14:
        return out
    gain = loss = 0.0
    for i in range(1, 15):
        d = closes[i] - closes[i - 1]
        gain += max(d, 0)
        loss += max(-d, 0)
    gain /= 14
    loss /= 14
    out[14] = 100 if loss == 0 else 100 - 100 / (1 + gain / loss)
    for i in range(15, n):
        d = closes[i] - closes[i - 1]
        gain = (gain * 13 + max(d, 0)) / 14
        loss = (loss * 13 + max(-d, 0)) / 14
        out[i] = 100 if loss == 0 else 100 - 100 / (1 + gain / loss)
    return out


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


def atr(cs, p=14):
    tr = [cs[0]["h"] - cs[0]["l"]]
    for i in range(1, len(cs)):
        tr.append(max(
            cs[i]["h"] - cs[i]["l"],
            abs(cs[i]["h"] - cs[i - 1]["c"]),
            abs(cs[i]["l"] - cs[i - 1]["c"]),
        ))
    return wilder(tr, p)


def adx(cs, p=14):
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
    dx = [float("nan")] * n
    for i in range(n):
        if str_[i] != str_[i] or not str_[i]:
            continue
        pdi = 100 * sp[i] / str_[i]
        mdi = 100 * sm[i] / str_[i]
        s = pdi + mdi
        dx[i] = 0 if s == 0 else 100 * abs(pdi - mdi) / s
    return wilder(dx, p)


def stoch_k(cs, i, period=14):
    if i < period - 1 or i >= len(cs):
        return float("nan")
    hh = max(c["h"] for c in cs[i - period + 1 : i + 1])
    ll = min(c["l"] for c in cs[i - period + 1 : i + 1])
    if not (hh > ll):
        return 50.0
    return 100.0 * (cs[i]["c"] - ll) / (hh - ll)


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


def bb_width(closes, p=20, k=2):
    out = [float("nan")] * len(closes)
    for i in range(p - 1, len(closes)):
        w = closes[i - p + 1 : i + 1]
        m = sum(w) / p
        sd = math.sqrt(sum((x - m) ** 2 for x in w) / p)
        out[i] = (2 * k * sd) / m if m else 0
    return out


def isnum(x):
    return x is not None and x == x


def gap_read(cs, seg, prev, rsi, cvd):
    lo, hi = seg["ai"], seg["bi"]
    vol = up = down = rng = 0.0
    for i in range(lo, hi + 1):
        c = cs[i]
        v = c["v"]
        vol += v
        if c["c"] >= c["o"]:
            up += v
        else:
            down += v
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
    stoch_end = stoch_k(cs, hi)

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
    if up_share >= 0.55 and cvd_up:
        flags.append("up_bar_vol")
        score += 10
    bullish = any(f in flags for f in ("rsi_div", "rsi_hold", "vol_dry", "range_shrink", "equal_high"))
    if px_dn and cvd_dn and up_share < 0.45 and not bullish:
        score = min(score, 24)
    score = max(0, min(100, score))
    if rsi_end is not None and rsi_end <= 50:
        flags.append("oversold")
    if isnum(stoch_end) and stoch_end <= 20:
        flags.append("stoch_os")

    st = "neutral"
    if "equal_high" in flags and bullish:
        st = "coil"
    elif up_share >= 0.55 and cvd_up and flat:
        st = "demand"
    elif "rsi_div" in flags:
        st = "divergence"
    elif "cvd_vs_price" in flags:
        st = "absorption"
    elif "vol_dry" in flags and px_dn:
        st = "test"
    elif flat and "range_shrink" in flags:
        st = "coil"
    elif not px_dn and cvd_up:
        st = "demand"
    elif px_dn and cvd_dn and not bullish:
        st = "markdown"
    elif bullish:
        st = "coil"

    return {
        "st": st,
        "sc": score,
        "flags": flags,
        "vol": vol,
        "rng": rng_avg,
        "slope": seg["slope"],
        "px": px,
        "rsi_d": rsi_d,
        "rsi_end": rsi_end,
        "stoch_end": stoch_end if isnum(stoch_end) else None,
        "vol_ratio": vol_ratio,
        "rng_ratio": rng_ratio,
        "cvd_ch": cvd_ch,
        "up_share": up_share,
    }


def buy_path(pattern: str, lh, last_gap: dict) -> str | None:
    if pattern in ("none", "channel"):
        return None
    if len(lh) < 2 or not last_gap:
        return None
    flags = set(last_gap["flags"])
    completing = []
    if "rsi_div" in flags or "rsi_hold" in flags:
        completing.append("RSI vs LH")
    if "vol_dry" in flags:
        completing.append("vol dry")
    if "range_shrink" in flags:
        completing.append("squeeze")
    last_h, prev_h = lh[-1][1], lh[-2][1]
    equal = "equal_high" in flags or abs(last_h - prev_h) / max(abs(prev_h), 1e-12) <= 0.004
    if equal or "flattening" in flags:
        completing.append("LH flat")
    last_squeeze = "range_shrink" in flags or last_gap["st"] == "test"
    last_markdown = last_gap["st"] == "markdown"
    if (
        not last_markdown
        and last_squeeze
        and len(completing) >= 2
        and ("rsi_div" in flags or "rsi_hold" in flags or "vol_dry" in flags)
    ):
        return "completing"
    rsi_os = last_gap["rsi_end"] is not None and last_gap["rsi_end"] <= 50
    stoch_os = last_gap["stoch_end"] is not None and last_gap["stoch_end"] <= 20
    dumping = last_h < prev_h * 0.997
    if dumping and (rsi_os or stoch_os):
        return "oversold"
    return None


def fwd_ret(cs, i, n):
    j = i + n
    if j >= len(cs) or cs[i]["c"] == 0:
        return None
    return cs[j]["c"] / cs[i]["c"] - 1


def peak_ret(cs, i, n):
    end = min(len(cs) - 1, i + n)
    if end <= i or cs[i]["c"] == 0:
        return None
    mx = max(c["h"] for c in cs[i + 1 : end + 1])
    return mx / cs[i]["c"] - 1


def fmt_t(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def mean(xs):
    xs = [x for x in xs if x is not None and x == x]
    return sum(xs) / len(xs) if xs else float("nan")


def pct(xs, pred):
    xs = list(xs)
    if not xs:
        return float("nan")
    return sum(1 for x in xs if pred(x)) / len(xs)


def scan_series(symbol: str, interval: str, cs: list[dict], swing: int) -> list[dict]:
    if len(cs) < swing * 4 + 50:
        return []
    pts = collapse(swings(cs, swing))
    all_highs = [(i, p) for i, k, p in pts if k == "h"]
    all_lows = [(i, p) for i, k, p in pts if k == "l"]
    if len(all_highs) < 2:
        return []

    closes = [c["c"] for c in cs]
    r = rsi14(closes)
    cvd = []
    acc = 0.0
    for c in cs:
        acc += bar_delta(c)
        cvd.append(acc)
    a = atr(cs, 14)
    ad = adx(cs, 14)
    mf = mfi(cs, 14)
    bbw = bb_width(closes, 20)
    e12, e26 = ema(closes, 12), ema(closes, 26)
    macd = [x - y for x, y in zip(e12, e26)]
    sig = ema(macd, 9)
    hist = [m - s for m, s in zip(macd, sig)]

    events = []
    for hi_n, (h_idx, h_px) in enumerate(all_highs):
        confirm = h_idx + swing
        if confirm >= len(cs) - 8:
            continue
        known_h = [h for h in all_highs if h[0] <= h_idx]
        known_l = [l for l in all_lows if l[0] + swing <= confirm]
        lh = lower_highs(known_h)
        if len(lh) < 2 or lh[-1][0] != h_idx:
            continue
        ll = lower_lows(known_l, lh[0][0])
        hl = higher_lows(known_l, lh[0][0])
        top = segs(lh)
        if not top:
            continue
        pattern = classify(lh, ll, hl, top)
        if pattern == "none":
            continue

        tops = []
        prev = None
        for s in top:
            g = gap_read(cs, s, prev, r, cvd)
            tops.append(g)
            prev = g
        last_g = tops[-1]
        dump = (lh[0][1] - lh[-1][1]) / max(abs(lh[0][1]), 1e-12)
        last_gap_bars = top[-1]["bars"]
        horizon = min(len(cs) - 1 - confirm, max(3 * last_gap_bars, 48), 250)
        break_i = None
        for k in range(confirm + 1, confirm + 1 + horizon):
            if cs[k]["c"] > h_px * BREAK_MULT:
                break_i = k
                break
        nxt = all_highs[hi_n + 1] if hi_n + 1 < len(all_highs) else None
        terminal = nxt is None or nxt[1] >= h_px

        path = buy_path(pattern, lh, last_g)
        flags = last_g["flags"]
        i = h_idx
        atrpct = (100 * a[i] / cs[i]["c"]) if isnum(a[i]) and cs[i]["c"] else float("nan")
        rec = {
            "sym": symbol,
            "tf": interval,
            "pattern": pattern,
            "label": LABEL.get(pattern, pattern),
            "n_lh": len(lh),
            "dump": dump,
            "lh_t": cs[i]["t"],
            "lh_px": h_px,
            "confirm_t": cs[confirm]["t"],
            "status": last_g["st"],
            "score": last_g["sc"],
            "flags": flags,
            "path": path,
            "rsi": last_g["rsi_end"],
            "rsi_d": last_g["rsi_d"],
            "stoch": last_g["stoch_end"],
            "vol_ratio": last_g["vol_ratio"],
            "rng_ratio": last_g["rng_ratio"],
            "cvd_ch": last_g["cvd_ch"],
            "up_share": last_g["up_share"],
            "atrpct": atrpct,
            "bbw": bbw[i] if i < len(bbw) else float("nan"),
            "macdh": hist[i] if i < len(hist) else float("nan"),
            "mfi": mf[i] if i < len(mf) else float("nan"),
            "adx": ad[i] if i < len(ad) else float("nan"),
            "broke": break_i is not None,
            "bars_to_break": (break_i - confirm) if break_i is not None else None,
            "break_t": cs[break_i]["t"] if break_i is not None else None,
            "break_px": cs[break_i]["c"] if break_i is not None else None,
            "terminal": terminal,
            "f7": fwd_ret(cs, break_i, 7) if break_i is not None else None,
            "f14": fwd_ret(cs, break_i, 14) if break_i is not None else None,
            "f42": fwd_ret(cs, break_i, 42) if break_i is not None else None,
            "peak14": peak_ret(cs, break_i, 14) if break_i is not None else None,
            "peak42": peak_ret(cs, break_i, 42) if break_i is not None else None,
        }
        events.append(rec)
    return events


def print_table(title: str, rows: list[dict], cols: list[tuple[str, int, str]]):
    print(f"\n=== {title} ===")
    hdr = "".join(f"{name:<{w}}" if align == "l" else f"{name:>{w}}" for name, w, align in cols)
    print(hdr)
    for r in rows:
        line = ""
        for name, w, align in cols:
            val = r.get(name, "")
            s = str(val)
            line += f"{s:<{w}}" if align == "l" else f"{s:>{w}}"
        print(line)


def summarize(events: list[dict]):
    by_pat = defaultdict(list)
    for e in events:
        by_pat[e["label"]].append(e)

    print("\n========== ALL CONFIRMED LAST-LH EVENTS ==========")
    print(f"{'pattern':<14} {'n':>5} {'broke':>7} {'brk%':>6} {'pathA':>6} {'pathB':>6} {'med_bars':>8}")
    order = ["swoop", "triangle", "down_wedge", "channel"]
    for lab in order:
        rs = by_pat.get(lab, [])
        if not rs:
            print(f"{lab:<14} {0:5d}")
            continue
        broke = [e for e in rs if e["broke"]]
        bars = sorted(e["bars_to_break"] for e in broke if e["bars_to_break"] is not None)
        med_b = bars[len(bars) // 2] if bars else None
        path_a = sum(1 for e in rs if e["path"] == "completing")
        path_b = sum(1 for e in rs if e["path"] == "oversold")
        print(
            f"{lab:<14} {len(rs):5d} {len(broke):7d} {len(broke)/len(rs):6.1%} "
            f"{path_a:6d} {path_b:6d} {str(med_b) if med_b is not None else '—':>8}"
        )

    print("\n========== UP-BREAKS: INDICATOR TELLS AT LAST LH ==========")
    print(
        f"{'pattern':<14} {'n':>4} {'rsi':>6} {'stoch':>6} {'rsiDiv':>7} {'rsiHld':>7} "
        f"{'volDry':>7} {'sqz':>6} {'LHflat':>7} {'os':>6} {'stOS':>6} "
        f"{'cvd↑':>6} {'win7':>6} {'avg7':>7} {'avg14':>7} {'pk14':>7}"
    )
    for lab in order:
        rs = [e for e in by_pat.get(lab, []) if e["broke"]]
        if not rs:
            continue

        def has(flag):
            return pct(rs, lambda e: flag in e["flags"])

        win7 = pct([e["f7"] for e in rs if e["f7"] is not None], lambda x: x > 0)
        print(
            f"{lab:<14} {len(rs):4d} "
            f"{mean(e['rsi'] for e in rs):6.1f} "
            f"{mean(e['stoch'] for e in rs):6.1f} "
            f"{has('rsi_div'):7.0%} {has('rsi_hold'):7.0%} {has('vol_dry'):7.0%} "
            f"{has('range_shrink'):6.0%} "
            f"{pct(rs, lambda e: 'equal_high' in e['flags'] or 'flattening' in e['flags']):7.0%} "
            f"{has('oversold'):6.0%} {has('stoch_os'):6.0%} "
            f"{pct(rs, lambda e: e['cvd_ch'] is not None and e['cvd_ch'] > 0):6.0%} "
            f"{win7:6.0%} {mean(e['f7'] for e in rs):7.2%} {mean(e['f14'] for e in rs):7.2%} "
            f"{mean(e['peak14'] for e in rs):7.2%}"
        )

    print("\n========== UP-BREAKS BY BUY PATH (ex-channel) ==========")
    print(f"{'path':<14} {'n':>4} {'win7':>6} {'avg7':>7} {'avg14':>7} {'pk14':>7} {'rsi':>6} {'volDry':>7} {'os':>6}")
    for path in ("completing", "oversold", None):
        rs = [e for e in events if e["broke"] and e["path"] == path and e["pattern"] != "channel"]
        name = path or "no-setup"
        if not rs:
            continue
        win7 = pct([e["f7"] for e in rs if e["f7"] is not None], lambda x: x > 0)
        print(
            f"{name:<14} {len(rs):4d} {win7:6.0%} {mean(e['f7'] for e in rs):7.2%} "
            f"{mean(e['f14'] for e in rs):7.2%} {mean(e['peak14'] for e in rs):7.2%} "
            f"{mean(e['rsi'] for e in rs):6.1f} "
            f"{pct(rs, lambda e: 'vol_dry' in e['flags']):7.0%} "
            f"{pct(rs, lambda e: 'oversold' in e['flags']):6.0%}"
        )

    print("\n========== UP-BREAKS BY TF ==========")
    print(f"{'tf':<6} {'pattern':<14} {'n':>4} {'win7':>6} {'avg7':>7} {'pk14':>7}")
    by_tf = defaultdict(list)
    for e in events:
        if e["broke"]:
            by_tf[(e["tf"], e["label"])].append(e)
    for key in sorted(by_tf):
        rs = by_tf[key]
        win7 = pct([e["f7"] for e in rs if e["f7"] is not None], lambda x: x > 0)
        print(f"{key[0]:<6} {key[1]:<14} {len(rs):4d} {win7:6.0%} {mean(e['f7'] for e in rs):7.2%} {mean(e['peak14'] for e in rs):7.2%}")

    print("\n========== BEST UP-BREAK EXAMPLES (peak 14-bar) ==========")
    for lab in order:
        rs = [e for e in by_pat.get(lab, []) if e["broke"] and e["peak14"] is not None]
        rs.sort(key=lambda e: e["peak14"], reverse=True)
        print(f"\n-- {lab} --")
        if not rs:
            print("  (none)")
            continue
        print(
            f"  {'sym':<10} {'tf':<4} {'LH time':<17} {'LH':>10} {'break':<17} "
            f"{'pk14':>7} {'f14':>7} {'path':<12} {'status':<12} tells"
        )
        for e in rs[:8]:
            tells = ",".join(e["flags"][:6]) or "—"
            print(
                f"  {e['sym']:<10} {e['tf']:<4} {fmt_t(e['lh_t']):<17} {e['lh_px']:10.5g} "
                f"{fmt_t(e['break_t']):<17} {e['peak14']:7.2%} "
                f"{(e['f14'] if e['f14'] is not None else float('nan')):7.2%} "
                f"{(e['path'] or '—'):<12} {e['status']:<12} {tells}"
            )

    print("\n========== ARMED SETUPS THAT DID BREAK vs DID NOT ==========")
    print(f"{'path':<14} {'broke n':>8} {'miss n':>8} {'hit%':>6} {'rsi hit':>8} {'rsi miss':>9}")
    for path in ("completing", "oversold"):
        armed = [e for e in events if e["path"] == path]
        hit = [e for e in armed if e["broke"]]
        miss = [e for e in armed if not e["broke"]]
        if not armed:
            continue
        print(
            f"{path:<14} {len(hit):8d} {len(miss):8d} {len(hit)/len(armed):6.1%} "
            f"{mean(e['rsi'] for e in hit):8.1f} {mean(e['rsi'] for e in miss):9.1f}"
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="XRPUSDT,BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT")
    ap.add_argument("--intervals", default="1h,4h")
    ap.add_argument("--start", default="2026-01-01")
    ap.add_argument("--end", default="2026-09-02")
    ap.add_argument("--swing", type=int, default=SWING)
    ap.add_argument("--out", default="/tmp/swoop_pattern_scan.jsonl")
    args = ap.parse_args()

    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    intervals = [s.strip() for s in args.intervals.split(",") if s.strip()]
    start = int(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc).timestamp() * 1000)

    print(
        f"scan symbols={symbols} tfs={intervals} swing={args.swing} "
        f"{args.start} → {args.end}",
        flush=True,
    )

    all_events: list[dict] = []
    for interval in intervals:
        for sym in symbols:
            print(f"fetch {sym} {interval}...", flush=True)
            cs = fetch_klines(sym, interval, start, end)
            if not cs:
                print("  no candles")
                continue
            print(f"  {len(cs)} candles {fmt_t(cs[0]['t'])} → {fmt_t(cs[-1]['t'])}", flush=True)
            ev = scan_series(sym, interval, cs, args.swing)
            print(f"  events {len(ev)}  broke {sum(1 for e in ev if e['broke'])}", flush=True)
            all_events.extend(ev)
            del cs

    summarize(all_events)
    with open(args.out, "w") as f:
        for e in all_events:
            f.write(json.dumps(e) + "\n")
    print(f"\nwrote {len(all_events)} events → {args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
