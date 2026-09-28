#!/usr/bin/env python3
"""
Absorption vs distribution on 15m and 4h (1h already done).

Same event defs as the 1h study. Forward horizons in clock hours.
"""
from __future__ import annotations

import importlib.util
import os
from collections import defaultdict
from pathlib import Path

here = Path("/home/falcon/crypto-data/tide_zone_1h_refine.py")
spec = importlib.util.spec_from_file_location("tz", str(here))
tz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tz)

OUT = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "holistic"
SWING = 16
NEAR = 0.003
FLAT = 0.001

# clock-hour horizons → bars
TF = {
    "15m": {"hours": (6, 12, 24), "bars": (24, 48, 96)},
    "4h": {"hours": (12, 24, 48), "bars": (3, 6, 12)},
}


def mean(xs):
    xs = [x for x in xs if tz.isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def med(xs):
    xs = sorted(x for x in xs if tz.isnum(x))
    return xs[len(xs) // 2] if xs else float("nan")


def win(xs):
    xs = [x for x in xs if tz.isnum(x)]
    return 100 * sum(1 for x in xs if x > 0) / len(xs) if xs else float("nan")


def fwd(cs, i, h):
    if i + h >= len(cs):
        return float("nan")
    return cs[i + h]["c"] / cs[i]["c"] - 1


def era_of(t):
    return "hold" if t >= tz.SPLIT else "train"


def show(title, xs):
    if not xs:
        return f"{title}: n=0"
    return f"{title}: n={len(xs):5d}  mean={100*mean(xs):+6.3f}%  med={100*med(xs):+6.3f}%  win={win(xs):5.1f}%"


def load_k(conn, sym, interval):
    rows = conn.execute(
        "SELECT t,o,h,l,c,v FROM klines WHERE symbol=? AND interval=? ORDER BY t",
        (sym, interval),
    ).fetchall()
    return [{"t": t, "o": o, "h": h, "l": l, "c": c, "v": v} for t, o, h, l, c, v in rows]


def run_tf(conn, interval, hours, bars):
    store = defaultdict(lambda: defaultdict(list))
    maxh = max(bars)
    for sym in tz.SYMBOLS:
        cs = load_k(conn, sym, interval)
        print(f"  {sym} {interval} {len(cs)}", flush=True)
        if len(cs) < 400:
            continue
        score, tide, energy, tape = tz.tide_series(cs)
        n = len(cs)
        for i in range(SWING, n - maxh - 1):
            s, p = score[i], score[i - 1]
            if not tz.isnum(s) or not tz.isnum(p):
                continue
            ds = s - p
            px = cs[i]["c"]
            ret1 = px / cs[i - 1]["c"] - 1
            lo16 = min(c["l"] for c in cs[i - SWING + 1 : i + 1])
            hi16 = max(c["h"] for c in cs[i - SWING + 1 : i + 1])
            near_lo = px <= lo16 * (1 + NEAR)
            near_hi = px >= hi16 * (1 - NEAR)
            px_down = ret1 < 0
            px_up = ret1 > 0
            px_flat = abs(ret1) < FLAT
            tape_up = tz.isnum(tape[i]) and tz.isnum(tape[i - 1]) and tape[i] > tape[i - 1]
            tape_dn = tz.isnum(tape[i]) and tz.isnum(tape[i - 1]) and tape[i] < tape[i - 1]
            cross_up = p < 0 <= s
            cross_dn = p > 0 >= s
            era = era_of(cs[i]["t"])
            events = {
                "A score↑ px↓": ds > 0 and px_down,
                "A 0-cross + px↓ + tape↑": cross_up and px_down and tape_up,
                "A near-low + score↑ + tape↑": near_lo and ds > 0 and tape_up,
                "D score↓ px↑": ds < 0 and px_up,
                "D 0-cross + px↑ + tape↓": cross_dn and px_up and tape_dn,
                "D near-high + score↓ + tape↓": near_hi and ds < 0 and tape_dn,
            }
            for name, hit in events.items():
                if not hit:
                    continue
                for h, tag in zip(bars, hours):
                    store[f"{name} {tag}h"][era].append(fwd(cs, i, h))
                    store[f"{name} {tag}h"]["all"].append(fwd(cs, i, h))
    return store


def dump(lines, interval, hours, store):
    names = [
        "A score↑ px↓",
        "A 0-cross + px↓ + tape↑",
        "A near-low + score↑ + tape↑",
        "D score↓ px↑",
        "D 0-cross + px↑ + tape↓",
        "D near-high + score↓ + tape↓",
    ]
    lines.append("=" * 72)
    lines.append(f"{interval}")
    lines.append("=" * 72)
    for name in names:
        lines.append(f"== {name} ==")
        for h in hours:
            k = f"{name} {h}h"
            lines.append(f"  [{h}h]")
            for era in ("all", "train", "hold"):
                lines.append("    " + show(era, store[k][era]))
        lines.append("")


def main():
    conn = tz.sqlite3.connect(f"file:{tz.DB}?mode=ro", uri=True)
    lines = [
        "TIDE ZONE ABSORB vs DISTRIBUTE  — 15m and 4h",
        "A = hist up, price not. D = hist down, price not. Holdout 2024+.",
        "",
    ]
    for interval, cfg in TF.items():
        print(f"=== {interval} ===", flush=True)
        store = run_tf(conn, interval, cfg["hours"], cfg["bars"])
        dump(lines, interval, cfg["hours"], store)
    report = "\n".join(lines) + "\n"
    (OUT / "tide_zone_tf_absorb_dist.txt").write_text(report)
    print(report, flush=True)
    print("WROTE", OUT / "tide_zone_tf_absorb_dist.txt", flush=True)


if __name__ == "__main__":
    main()
