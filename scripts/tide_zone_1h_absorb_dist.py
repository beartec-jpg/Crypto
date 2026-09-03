#!/usr/bin/env python3
"""
1h absorption vs distribution path study.

Absorption:  histogram rising, price down or flat (and near a local low).
Distribution: histogram falling, price up or flat (and near a local high).

No 2% stop. Forward close-to-close 6/12/24h. Train <2024, hold 2024+.
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
NEAR = 0.003  # 0.3% of a 16-bar pivot
FLAT = 0.001  # |ret| < 0.1% counts flat


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


def main():
    conn = tz.sqlite3.connect(f"file:{tz.DB}?mode=ro", uri=True)
    store = defaultdict(lambda: defaultdict(list))

    for sym in tz.SYMBOLS:
        cs = tz.load_k(conn, sym)
        print(f"{sym} {len(cs)}", flush=True)
        score, tide, energy, tape = tz.tide_series(cs)
        n = len(cs)
        for i in range(SWING, n - 25):
            s, p = score[i], score[i - 1]
            if not tz.isnum(s) or not tz.isnum(p):
                continue
            ds = s - p
            px = cs[i]["c"]
            ret1 = px / cs[i - 1]["c"] - 1
            ret3 = px / cs[i - 3]["c"] - 1 if i >= 3 else ret1
            lo16 = min(c["l"] for c in cs[i - SWING + 1 : i + 1])
            hi16 = max(c["h"] for c in cs[i - SWING + 1 : i + 1])
            near_lo = px <= lo16 * (1 + NEAR)
            near_hi = px >= hi16 * (1 - NEAR)
            px_down = ret1 < 0
            px_up = ret1 > 0
            px_flat = abs(ret1) < FLAT
            px_downish = ret1 <= 0 or ret3 <= 0
            px_upish = ret1 >= 0 or ret3 >= 0
            score_up = ds > 0
            score_dn = ds < 0
            score_up2 = i >= 2 and tz.isnum(score[i - 2]) and s > score[i - 2]
            score_dn2 = i >= 2 and tz.isnum(score[i - 2]) and s < score[i - 2]
            tape_up = tz.isnum(tape[i]) and tz.isnum(tape[i - 1]) and tape[i] > tape[i - 1]
            tape_dn = tz.isnum(tape[i]) and tz.isnum(tape[i - 1]) and tape[i] < tape[i - 1]
            cross_up = p < 0 <= s
            cross_dn = p > 0 >= s
            era = era_of(cs[i]["t"])

            events = {
                "A score↑ px↓": score_up and px_down,
                "A score↑ px↓/flat": score_up and (px_down or px_flat),
                "A score↑ 2bar px↓ish": score_up2 and px_downish,
                "A near-low + score↑": near_lo and score_up,
                "A near-low + score↑ + tape↑": near_lo and score_up and tape_up,
                "A 0-cross + px↓ + tape↑": cross_up and px_down and tape_up,
                "D score↓ px↑": score_dn and px_up,
                "D score↓ px↑/flat": score_dn and (px_up or px_flat),
                "D score↓ 2bar px↑ish": score_dn2 and px_upish,
                "D near-high + score↓": near_hi and score_dn,
                "D near-high + score↓ + tape↓": near_hi and score_dn and tape_dn,
                "D 0-cross + px↑ + tape↓": cross_dn and px_up and tape_dn,
            }
            for name, hit in events.items():
                if not hit:
                    continue
                for h, tag in ((6, "6h"), (12, "12h"), (24, "24h")):
                    store[f"{name} {tag}"][era].append(fwd(cs, i, h))
                    store[f"{name} {tag}"]["all"].append(fwd(cs, i, h))

    names = [
        "A score↑ px↓",
        "A score↑ px↓/flat",
        "A score↑ 2bar px↓ish",
        "A near-low + score↑",
        "A near-low + score↑ + tape↑",
        "A 0-cross + px↓ + tape↑",
        "D score↓ px↑",
        "D score↓ px↑/flat",
        "D score↓ 2bar px↑ish",
        "D near-high + score↓",
        "D near-high + score↓ + tape↓",
        "D 0-cross + px↑ + tape↓",
    ]
    lines = [
        "TIDE ZONE 1h ABSORB vs DISTRIBUTE",
        "A = absorption (hist up, price not). D = distribution (hist down, price not).",
        "Forward close-to-close. Holdout = 2024+.",
        "",
    ]
    for name in names:
        lines.append(f"== {name} ==")
        for h in ("6h", "12h", "24h"):
            k = f"{name} {h}"
            lines.append(f"  [{h}]")
            for era in ("all", "train", "hold"):
                lines.append("    " + show(era, store[k][era]))
        lines.append("")

    report = "\n".join(lines) + "\n"
    (OUT / "tide_zone_1h_absorb_dist.txt").write_text(report)
    print(report, flush=True)
    print("WROTE", OUT / "tide_zone_1h_absorb_dist.txt", flush=True)


if __name__ == "__main__":
    main()
