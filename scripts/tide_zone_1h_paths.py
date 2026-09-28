#!/usr/bin/env python3
"""
1h Tide Zone path study (no 2% scalp stop).

Same entries: score crosses +40. Compare:
  A) exit when score next crosses 0
  B) exit when score next crosses -40
  C) hold 12 / 24 bars

Also: after fade-green (had +40, then cross 0) what does the NEXT 12/24h do?
After absorb (0-cross up, price still falling, tape up).
After bounce (low tide, high energy).
"""
from __future__ import annotations

import importlib.util
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

here = Path("/home/falcon/crypto-data/tide_zone_1h_refine.py")
spec = importlib.util.spec_from_file_location("tz", str(here))
tz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tz)

OUT = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "holistic"


def mean(xs):
    xs = [x for x in xs if tz.isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def med(xs):
    xs = sorted(x for x in xs if tz.isnum(x))
    if not xs:
        return float("nan")
    return xs[len(xs) // 2]


def pct_pos(xs):
    xs = [x for x in xs if tz.isnum(x)]
    return 100 * sum(1 for x in xs if x > 0) / len(xs) if xs else float("nan")


def fwd(cs, i, h):
    if i + h >= len(cs):
        return float("nan")
    return cs[i + h]["c"] / cs[i]["c"] - 1


def until_score(cs, score, i, pred, maxh=72):
    """Return (bars, ret) at first bar j>i where pred(score[j]), else None."""
    n = len(cs)
    for j in range(i + 1, min(n, i + 1 + maxh)):
        if tz.isnum(score[j]) and pred(score[j]):
            return j - i, cs[j]["c"] / cs[i]["c"] - 1
    return None


def bucket(t):
    return "hold" if t >= tz.SPLIT else "train"


def add(store, key, era, val):
    if tz.isnum(val):
        store[key][era].append(val)
        store[key]["all"].append(val)


def show(title, xs):
    if not xs:
        return f"{title}: n=0"
    return (
        f"{title}: n={len(xs):5d}  mean={100*mean(xs):+6.3f}%  med={100*med(xs):+6.3f}%  "
        f"win={pct_pos(xs):5.1f}%"
    )


def main():
    conn = tz.sqlite3.connect(f"file:{tz.DB}?mode=ro", uri=True)
    store = defaultdict(lambda: defaultdict(list))
    paired = defaultdict(list)  # 0-exit minus -40-exit on same long

    for sym in tz.SYMBOLS:
        cs = tz.load_k(conn, sym)
        print(f"{sym} {len(cs)}", flush=True)
        score, tide, energy, tape = tz.tide_series(cs)
        n = len(cs)
        seen40 = False
        for i in range(1, n - 25):
            s, p = score[i], score[i - 1]
            if not tz.isnum(s) or not tz.isnum(p):
                continue
            era = bucket(cs[i]["t"])
            falling = cs[i]["c"] < cs[i - 1]["c"] and (i < 4 or cs[i]["c"] < cs[i - 4]["c"])
            tape_up = tz.isnum(tape[i]) and tz.isnum(tape[i - 1]) and tape[i] > tape[i - 1]

            if p < 40 <= s:
                r12, r24 = fwd(cs, i, 12), fwd(cs, i, 24)
                add(store, "entry+40 12h", era, r12)
                add(store, "entry+40 24h", era, r24)
                z = until_score(cs, score, i, lambda v: v <= 0, 72)
                m = until_score(cs, score, i, lambda v: v <= -40, 72)
                if z:
                    add(store, "entry+40 exit@0", era, z[1])
                    add(store, "entry+40 exit@0 bars", era, z[0])
                if m:
                    add(store, "entry+40 exit@-40", era, m[1])
                    add(store, "entry+40 exit@-40 bars", era, m[0])
                if z and m:
                    paired[era].append(z[1] - m[1])
                    paired["all"].append(z[1] - m[1])

            if s >= 40:
                seen40 = True
            fade = seen40 and p >= 0 > s
            if fade:
                seen40 = False
                add(store, "fade0 then 12h", era, fwd(cs, i, 12))
                add(store, "fade0 then 24h", era, fwd(cs, i, 24))
                # short path: next 12h inverse
            if s < 0:
                seen40 = False

            if p < 0 <= s and falling and tape_up:
                add(store, "absorb then 12h", era, fwd(cs, i, 12))
                add(store, "absorb then 24h", era, fwd(cs, i, 24))

            if (
                tz.isnum(tide[i])
                and tz.isnum(energy[i])
                and tide[i] < 0.45
                and energy[i] > 0.65
                and s > 15 >= p
            ):
                add(store, "bounce then 12h", era, fwd(cs, i, 12))
                add(store, "bounce then 24h", era, fwd(cs, i, 24))

            if p > 0 >= s:
                add(store, "any 0-cross down 12h", era, fwd(cs, i, 12))
                add(store, "any 0-cross down 24h", era, fwd(cs, i, 24))

    keys = [
        "entry+40 12h",
        "entry+40 24h",
        "entry+40 exit@0",
        "entry+40 exit@-40",
        "fade0 then 12h",
        "fade0 then 24h",
        "absorb then 12h",
        "absorb then 24h",
        "bounce then 12h",
        "bounce then 24h",
        "any 0-cross down 12h",
        "any 0-cross down 24h",
    ]
    lines = [
        "TIDE ZONE 1h PATH STUDY  (no stop — same bar close → later close)",
        "Positive mean after +40 = longs work. Negative after fade0 = shorts/exits work.",
        "",
    ]
    for k in keys:
        lines.append(f"-- {k} --")
        for era in ("all", "train", "hold"):
            lines.append("  " + show(era, store[k][era]))
        lines.append("")

    lines.append("-- paired: (exit@0 ret) minus (exit@-40 ret) on SAME +40 longs --")
    lines.append("  positive => exiting at 0 beat waiting for -40")
    for era in ("all", "train", "hold"):
        xs = paired[era]
        lines.append("  " + show(era, xs))
        if xs:
            lines.append(f"       share exit@0 better: {100*sum(1 for x in xs if x>0)/len(xs):.1f}%")
    lines.append("")

    report = "\n".join(lines) + "\n"
    (OUT / "tide_zone_1h_paths.txt").write_text(report)
    print(report, flush=True)
    print("WROTE", OUT / "tide_zone_1h_paths.txt", flush=True)


if __name__ == "__main__":
    main()
