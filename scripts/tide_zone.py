#!/usr/bin/env python3
"""Print the latest Tide Zone score from the warehouse (mirrors tideZone.ts)."""
from __future__ import annotations

import math
import os
import sqlite3
import sys
from pathlib import Path

DB = Path(os.environ.get("CRYPTO_DATA_DIR", str(Path.home() / "crypto-data"))) / "market.sqlite"
HTF = 4 * 3600


def ema(xs, p):
    k = 2 / (p + 1)
    o = [xs[0]]
    for x in xs[1:]:
        o.append(x * k + o[-1] * (1 - k))
    return o


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


def rolling_pct(xs, win):
    out = [float("nan")] * len(xs)
    for i, v in enumerate(xs):
        if v != v:
            continue
        w = [x for x in xs[max(0, i - win + 1) : i + 1] if x == x]
        if len(w) < max(20, win // 4):
            continue
        out[i] = sum(1 for x in w if x <= v) / len(w)
    return out


def last_le(series, t):
    lo, hi, ans = 0, len(series) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        if series[mid][0] <= t:
            ans = series[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return ans


def main():
    sym = sys.argv[1] if len(sys.argv) > 1 else "BTCUSDT"
    tf = sys.argv[2] if len(sys.argv) > 2 else "15m"
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cs = list(conn.execute(
        "SELECT t,o,h,l,c,v FROM klines WHERE symbol=? AND interval=? ORDER BY t",
        (sym, tf),
    ))
    if len(cs) < 80:
        sys.exit("short series")
    bar = cs[1][0] - cs[0][0]
    factor = max(1, round(HTF / bar))
    bucket = factor * bar
    htf = []
    cur = None
    key = None
    for t, o, h, l, c, v in cs:
        k = (t // bucket) * bucket
        if cur is None or k != key:
            if cur:
                htf.append(cur)
            key = k
            cur = [t, o, h, l, c]
        else:
            cur[2] = max(cur[2], h)
            cur[3] = min(cur[3], l)
            cur[4] = c
            cur[0] = t
    if cur:
        htf.append(cur)
    htf_c = [x[4] for x in htf]
    hr = rsi(htf_c, 14)
    he = ema(htf_c, 50)
    hrp = rolling_pct(hr, 80)
    hd = [htf_c[i] / he[i] - 1 if he[i] else float("nan") for i in range(len(htf))]
    hdp = rolling_pct(hd, 80)
    pack = [(htf[i][0], hrp[i], hdp[i]) for i in range(len(htf))]

    # last bar only (full series energy would be slow-ish; do last 400)
    tail = cs[-400:]
    last = cs[-1]
    row = last_le(pack, last[0])
    tide_r, tide_e = (row[1], row[2]) if row else (float("nan"), float("nan"))
    tide = 0.6 * tide_r + 0.4 * tide_e if tide_r == tide_r and tide_e == tide_e else tide_r
    print(f"{sym} {tf} last={last[0]} close={last[4]}")
    print(f"  4h RSI pct={tide_r:.3f}  ema50 dist pct={tide_e:.3f}  tide={tide:.3f}")
    raw = 0.55 * (2 * tide - 1)
    score = 100 * math.tanh(raw)
    print(f"  tide-only score≈{score:.1f}  (energy/tape need the TS pane)")
    if tide >= 0.55:
        print("  zone: follow-buy lean")
    elif tide <= 0.40:
        print("  zone: sell / bounce-watch")
    else:
        print("  zone: neutral")


if __name__ == "__main__":
    main()
