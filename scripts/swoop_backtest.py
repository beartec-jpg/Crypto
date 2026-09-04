#!/usr/bin/env python3
"""
Walk-forward Swoop / structure-book backtest.

Streams Binance klines (one symbol at a time), scores every confirmed
pivot gap, and measures forward returns. Memory-light: never holds more
than LOOKBACK candles in the detector.

Do not run this on a 1 GB box with several symbols at once.
"""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

LOOKBACK = 400
SWING = 16  # pivot length: 16 bars left/right
MIN_PIVOT_PCT = 0.0  # min pivot off
FWD = (1, 3, 7, 14, 42, 168)  # 1h bars: last is 1 week

def fetch_klines(symbol: str, interval: str, start_ms: int, end_ms: int) -> list[dict]:
    out: list[dict] = []
    cursor = start_ms
    while cursor < end_ms and len(out) < 5000:
        qs = urllib.parse.urlencode({
            "symbol": symbol,
            "interval": interval,
            "startTime": cursor,
            "endTime": end_ms,
            "limit": 1000,
        })
        url = f"https://api.binance.com/api/v3/klines?{qs}"
        with urllib.request.urlopen(url, timeout=20) as resp:
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
        is_h = all(cs[j]["h"] <= hi for j in range(i - n, i + n + 1) if j != i)
        is_l = all(cs[j]["l"] >= lo for j in range(i - n, i + n + 1) if j != i)
        if is_h and not is_l:
            pts.append((i, "h", hi))
        elif is_l and not is_h:
            pts.append((i, "l", lo))
    return pts


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
        out.append({"ai": a[0], "bi": b[0], "ap": a[1], "bp": b[1], "slope": (b[1] - a[1]) / bars, "bars": bars})
    return out


def decelerating(ss: list[dict]) -> bool:
    if len(ss) < 2 or ss[0]["slope"] >= 0:
        return False
    flat = sum(1 for i in range(1, len(ss)) if ss[i]["slope"] > ss[i - 1]["slope"])
    return flat >= math.ceil((len(ss) - 1) / 2)


def classify(lh, ll, hl, top):
    if len(lh) < 2:
        return "none"
    dump = (lh[0][1] - lh[-1][1]) / max(abs(lh[0][1]), 1e-12)
    curved = decelerating(top)
    def mostly_flat(pts):
        if len(pts) < 2:
            return False
        n = 0
        for a, b in zip(pts, pts[1:]):
            if abs(b[1] - a[1]) / max(abs(a[1]), 1e-12) <= 0.01:
                n += 1
        return n / (len(pts) - 1) >= 0.75
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
    bars = max(1, hi - lo)
    px = (seg["bp"] - seg["ap"]) / seg["ap"] if seg["ap"] else 0
    cvd_ch = cvd[hi] - cvd[lo]
    rsi_d = None
    if lo < len(rsi) and hi < len(rsi) and rsi[lo] == rsi[lo] and rsi[hi] == rsi[hi]:
        rsi_d = rsi[hi] - rsi[lo]
    vol_ratio = (vol / prev["vol"]) if prev and prev["vol"] > 0 else None
    rng_avg = rng / max(1, hi - lo + 1)
    rng_ratio = (rng_avg / prev["rng"]) if prev and prev["rng"] > 0 else None
    flat = prev is not None and abs(seg["slope"]) + 1e-12 < abs(prev["slope"])
    up_share = up / vol if vol > 0 else 0.5
    flags = []
    score = 0
    px_dn = px <= 0.001
    cvd_up = cvd_ch > 0
    cvd_dn = cvd_ch < 0
    if px_dn and cvd_up:
        flags.append("cvd_vs_price")
        score += 28
    if rsi_d is not None and px < -0.001 and rsi_d > 1:
        flags.append("rsi_div")
        score += 22
    if vol_ratio is not None and vol_ratio < 0.85 and px <= 0:
        flags.append("vol_dry")
        score += 14
    if up_share >= 0.55 and cvd_up:
        flags.append("up_bar_vol")
        score += 16
    if flat:
        flags.append("flattening")
        score += 12
    if rng_ratio is not None and rng_ratio < 0.85:
        flags.append("range_shrink")
        score += 8
    if px_dn and cvd_dn and up_share < 0.45:
        score = min(score, 24)
    score = max(0, min(100, score))
    st = "neutral"
    if up_share >= 0.55 and cvd_up and flat:
        st = "demand"
    elif "rsi_div" in flags or ("cvd_vs_price" in flags and rsi_d is not None and rsi_d > 0):
        st = "divergence"
    elif "cvd_vs_price" in flags or (abs(px) <= 0.004 and (vol_ratio is None or vol_ratio >= 1) and not cvd_dn):
        st = "absorption"
    elif "vol_dry" in flags and px_dn:
        st = "test"
    elif flat and "range_shrink" in flags:
        st = "coil"
    elif not px_dn and cvd_up:
        st = "demand"
    elif px_dn and cvd_dn:
        st = "markdown"
    return {"st": st, "sc": score, "flags": flags, "vol": vol, "rng": rng_avg, "slope": seg["slope"]}


def analyze_window(cs: list[dict]) -> dict | None:
    pts = swings(cs, SWING)
    highs = [(i, p) for i, k, p in pts if k == "h"]
    lows = [(i, p) for i, k, p in pts if k == "l"]
    lh = lower_highs(highs)
    if len(lh) < 2:
        return None
    ll = lower_lows(lows, lh[0][0])
    hl = higher_lows(lows, lh[0][0])
    top = segs(lh)
    bot_run = hl if len(hl) >= 2 else ll
    bot = segs(bot_run)
    pattern = classify(lh, ll, hl, top)
    closes = [c["c"] for c in cs]
    r = rsi14(closes)
    cvd = []
    acc = 0.0
    for c in cs:
        acc += bar_delta(c)
        cvd.append(acc)
    tops = []
    prev = None
    for s in top:
        g = gap_read(cs, s, prev, r, cvd)
        tops.append(g)
        prev = g
    bots = []
    prev = None
    for s in bot:
        g = gap_read(cs, s, prev, r, cvd)
        bots.append(g)
        prev = g
    last_h = lh[-1]
    last_top = top[-1] if top else None
    last_i = len(cs) - 1
    upper = last_h[1]
    if last_top:
        upper = last_h[1] + last_top["slope"] * (last_i - last_h[0])
    release = cs[-1]["c"] > upper * 1.001
    return {
        "pattern": pattern,
        "release": release,
        "n_top": len(top),
        "top": [g["st"] for g in tops],
        "top_sc": [g["sc"] for g in tops],
        "top_fl": [g["flags"] for g in tops],
        "bot": [g["st"] for g in bots],
        "bot_sc": [g["sc"] for g in bots],
        "last_top": tops[-1]["st"] if tops else None,
        "last_top_sc": tops[-1]["sc"] if tops else None,
        "last_bot": bots[-1]["st"] if bots else None,
        "seq3": ">".join(g["st"] for g in tops[-3:]),
    }


def fmt_t(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def summarize(rows: list[dict], key: str):
    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        k = r.get(key) or "none"
        buckets[k].append(r)
    print(f"\n=== grouped by {key} ===")
    print(f"{'bucket':<28} {'n':>5} {'win7':>6} {'med7':>8} {'avg7':>8} {'avg42':>8} {'avg1w':>8} {'rel%':>6}")
    for k, rs in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        n = len(rs)
        f7 = [r["f7"] for r in rs if r["f7"] is not None]
        f42 = [r["f42"] for r in rs if r["f42"] is not None]
        f168 = [r["f168"] for r in rs if r.get("f168") is not None]
        if not f7:
            continue
        f7s = sorted(f7)
        med = f7s[len(f7s) // 2]
        win = sum(1 for x in f7 if x > 0) / len(f7)
        rel = sum(1 for r in rs if r["release"]) / n
        avg = lambda xs: sum(xs) / len(xs) if xs else float("nan")
        print(f"{k:<28} {n:5d} {win:6.1%} {med:8.2%} {avg(f7):8.2%} {avg(f42):8.2%} {avg(f168):8.2%} {rel:6.1%}")


def run_symbol(symbol: str, interval: str, start_ms: int, end_ms: int) -> list[dict]:
    print(f"fetch {symbol} {interval}...", flush=True)
    cs = fetch_klines(symbol, interval, start_ms, end_ms)
    print(f"  {len(cs)} candles {fmt_t(cs[0]['t'])} → {fmt_t(cs[-1]['t'])}", flush=True)
    rows = []
    start = max(LOOKBACK, SWING * 2 + 8)
    last = len(cs) - max(FWD) - 1
    if last <= start:
        print("  not enough bars after lookback/forward")
        return []
    for i in range(start, last + 1):
        w = cs[i - LOOKBACK + 1 : i + 1]
        snap = analyze_window(w)
        if not snap:
            continue
        px = cs[i]["c"]
        rec = {
            "sym": symbol,
            "t": cs[i]["t"],
            "px": px,
            **snap,
            "f1": (cs[i + 1]["c"] / px - 1) if i + 1 < len(cs) else None,
            "f3": (cs[i + 3]["c"] / px - 1) if i + 3 < len(cs) else None,
            "f7": (cs[i + 7]["c"] / px - 1) if i + 7 < len(cs) else None,
            "f14": (cs[i + 14]["c"] / px - 1) if i + 14 < len(cs) else None,
            "f42": (cs[i + 42]["c"] / px - 1) if i + 42 < len(cs) else None,
            "f168": (cs[i + 168]["c"] / px - 1) if i + 168 < len(cs) else None,
        }
        rows.append(rec)
    return rows


def print_window(rows: list[dict], t0: int, t1: int):
    print(f"\n=== timeline {fmt_t(t0)} → {fmt_t(t1)} ===")
    print(f"{'time':<17} {'px':>10} {'pattern':<18} {'rel':<3} {'top seq':<40} {'bot last':<16} {'f7':>8} {'f14':>8}")
    for r in rows:
        if t0 <= r["t"] <= t1:
            print(
                f"{fmt_t(r['t']):<17} {r['px']:10.4f} {r['pattern']:<18} "
                f"{'Y' if r['release'] else '-':<3} {r['seq3']:<40} "
                f"{(r['last_bot'] or '-'):<16} "
                f"{(r['f7'] or 0):8.2%} {(r['f14'] or 0):8.2%}"
            )


def main():
    # 1h, pivot 16, min-pivot off. Cap at 3 symbols, sequential.
    start = int(datetime(2026, 4, 1, tzinfo=timezone.utc).timestamp() * 1000)
    end = int(datetime(2026, 9, 1, tzinfo=timezone.utc).timestamp() * 1000)
    symbols = ["XRPUSDT", "BTCUSDT", "ETHUSDT"]
    interval = "1h"
    print(f"config interval={interval} swing={SWING} lookback={LOOKBACK} minPivotPct={MIN_PIVOT_PCT}", flush=True)
    all_rows: list[dict] = []
    for sym in symbols:
        rows = run_symbol(sym, interval, start, end)
        all_rows.extend(rows)
        print(f"  snapshots {len(rows)}")

    summarize(all_rows, "pattern")
    summarize(all_rows, "last_top")
    summarize(all_rows, "seq3")
    summarize([r for r in all_rows if r["pattern"] == "swoop"], "last_top")
    summarize([r for r in all_rows if r["pattern"] == "swoop"], "seq3")

    swoop_then_rel = [r for r in all_rows if r["pattern"] == "swoop" and r["release"]]
    print(f"\nswoop+release bars: {len(swoop_then_rel)}")
    if swoop_then_rel:
        avg = lambda xs: sum(xs) / len(xs)
        print(f"  avg f7 {avg([r['f7'] for r in swoop_then_rel if r['f7'] is not None]):.2%}")
        print(f"  avg f14 {avg([r['f14'] for r in swoop_then_rel if r['f14'] is not None]):.2%}")
        print(f"  avg f42 {avg([r['f42'] for r in swoop_then_rel if r['f42'] is not None]):.2%}")

    # User window: 2 Aug – 19 Aug 2026
    t0 = int(datetime(2026, 8, 1, tzinfo=timezone.utc).timestamp())
    t1 = int(datetime(2026, 8, 20, tzinfo=timezone.utc).timestamp())
    print_window([r for r in all_rows if r["sym"] == "XRPUSDT"], t0, t1)

    outp = "/tmp/swoop_backtest_rows.jsonl"
    with open(outp, "w") as f:
        for r in all_rows:
            f.write(json.dumps(r) + "\n")
    print(f"\nwrote {len(all_rows)} rows → {outp}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
