#!/usr/bin/env python3
"""
Tide OUT → Tide IN where Tide IN is indicator-only.

Tide IN (exit after a long, never a short):
  - bear_div:  price HH vs Tide-EMA LH  (mirror of live bull DIV)
  - ema_peak:  Tide-EMA zigzag high, optionally aboveScore
  - zero_down: Tide score crosses from + to ≤0
  - score_peak: raw Tide score zigzag high (no EMA), optionally aboveScore

NOT used as Tide IN:
  - fixed % price swings
  - naked price pivot highs
  - time stops as the signal (max-hold is only a safety valve)

Protective 2% stop remains risk management in the book, not the Tide IN tell.
Exit-reason counts show how often the indicator flattened vs the stop.

Uses best Tide OUT bottoms from the prior sweep. Train <2024, hold 2024+.
"""
from __future__ import annotations

import itertools
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import tide_out_in_backtest as bt  # noqa: E402

# Best stable OUT per TF from the completed bottom sweep (+ live default).
BEST_OUT = {
    "15m": [
        dict(emaPeriod=8, confirmBars=3, belowScore=-30, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=8, confirmBars=3, belowScore=-20, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=5, confirmBars=3, belowScore=-10, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(bt.DEFAULT_OUT),
    ],
    "1h": [
        dict(emaPeriod=21, confirmBars=8, belowScore=0, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=21, confirmBars=8, belowScore=-10, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=5, confirmBars=8, belowScore=-20, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=13, confirmBars=8, belowScore=0, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(bt.DEFAULT_OUT),
    ],
    "4h": [
        dict(emaPeriod=8, confirmBars=3, belowScore=-20, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=8, confirmBars=3, belowScore=-30, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=21, confirmBars=8, belowScore=0, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(emaPeriod=8, confirmBars=3, belowScore=-10, minGap=0, emaSep=0.0, priceLlPct=0.0),
        dict(bt.DEFAULT_OUT),
    ],
}

IN_EMA = (5, 8, 13, 21)
IN_N = (3, 5, 8, 13)
IN_ABOVE = (0, 10, 20, 40)  # 40 ≈ "was in up-tide"


def indicator_in_specs():
    specs = [
        {"mode": "zero_down", "emaPeriod": 8, "confirmBars": 5, "aboveScore": 0, "label": "zero_down"},
    ]
    for ema, n, above in itertools.product(IN_EMA, IN_N, IN_ABOVE):
        specs.append({
            "mode": "bear_div",
            "emaPeriod": ema,
            "confirmBars": n,
            "aboveScore": above,
            "label": f"bear_ema{ema}_n{n}_ab{above}",
        })
    for ema, n, above in itertools.product(IN_EMA, IN_N, IN_ABOVE):
        specs.append({
            "mode": "ema_peak",
            "emaPeriod": ema,
            "confirmBars": n,
            "aboveScore": above,
            "label": f"emaPeak_ema{ema}_n{n}_ab{above}",
        })
    # raw score peaks (emaPeriod 0 = raw in bt.emas)
    for n, above in itertools.product(IN_N, (0, 10, 20, 40)):
        specs.append({
            "mode": "ema_peak",
            "emaPeriod": 0,
            "confirmBars": n,
            "aboveScore": above,
            "label": f"scorePeak_n{n}_ab{above}",
        })
    return specs


def collect_indicator_exits(bundle, spec):
    """Indicator-only exits. No price-pivot / % swing modes."""
    mode = spec["mode"]
    if mode == "zero_down":
        return bt.collect_exits(bundle, spec)
    if mode == "bear_div":
        return bt.collect_exits(bundle, spec)
    if mode == "ema_peak":
        return bt.collect_exits(bundle, spec)
    return []


def run_pairs(uni, lines):
    specs = indicator_in_specs()
    books = {}
    for interval in bt.INTERVALS:
        cfgs = BEST_OUT[interval]
        print(f"\nINDICATOR OUT×IN {interval} out={len(cfgs)} in={len(specs)}", flush=True)
        lines.append(f"\n======== {interval} INDICATOR TIDE-IN ONLY ========")
        lines.append(
            "Tide IN = bear_div | ema_peak | scorePeak | zero_down. "
            "No price-% swing, no naked pivot high."
        )
        lines.append(
            f"Protective stop {bt.STOP_PCT:.0%} is risk only (why=sl). "
            f"Max hold {bt.MAX_HOLD[interval]} bars is safety (why=time). "
            f"Fee {bt.FEE}/side."
        )
        rows = []
        for ocfg in cfgs:
            okey = bt.cfg_key(ocfg)
            entries = {
                sym: [e["confirm_i"] for e in bt.collect_events(bundle, ocfg, "div")]
                for sym, bundle in uni[interval].items()
            }
            for spec in specs:
                all_tr = []
                for sym, bundle in uni[interval].items():
                    ex = [e["confirm_i"] for e in collect_indicator_exits(bundle, spec)]
                    tr = bt.simulate_longs(
                        bundle["cs"], entries[sym], ex, interval,
                        use_stop=True, use_2r=False,
                    )
                    all_tr.extend(tr)
                st = bt.book_stats(all_tr)
                rows.append({"out": okey, "inn": spec["label"], "mode": spec["mode"], "stats": st})
                h = st.get("hold") or {}
                if h.get("n"):
                    print(
                        f"  {okey[:30]:30} × {spec['label']:28} HOLD {bt.fmt_pack(h)} why={h.get('why')}",
                        flush=True,
                    )

        rows.sort(
            key=lambda r: (
                (r["stats"].get("hold") or {}).get("mean", -9),
                (r["stats"].get("hold") or {}).get("pf", 0),
            ),
            reverse=True,
        )
        books[interval] = rows

        lines.append("Top 20 HOLD (n>=20), train also shown:")
        shown = 0
        for r in rows:
            h = r["stats"].get("hold") or {}
            t = r["stats"].get("train") or {}
            if not h.get("n") or h["n"] < 20:
                continue
            lines.append(f"  OUT {r['out']}")
            lines.append(f"    IN  {r['inn']:30} HOLD  {bt.fmt_pack(h)}  why={h.get('why')}")
            lines.append(f"    {'':34}TRAIN {bt.fmt_pack(t)}")
            shown += 1
            if shown >= 20:
                break

        lines.append("\nBest HOLD per indicator mode (n>=20, prefer train mean>0):")
        for mode in ("bear_div", "ema_peak", "zero_down"):
            cand = [
                r for r in rows
                if r["mode"] == mode and (r["stats"].get("hold") or {}).get("n", 0) >= 20
            ]
            # scorePeak is also mode ema_peak with label prefix
            if mode == "ema_peak":
                pass
            if not cand:
                continue
            # prefer train+hold green
            def rank(r):
                h = r["stats"]["hold"]
                t = r["stats"].get("train") or {}
                train_ok = 1 if t.get("mean", -1) > 0 else 0
                return (train_ok, h["mean"], h.get("pf", 0))
            cand.sort(key=rank, reverse=True)
            # also split scorePeak vs emaPeak in reporting
            ema_cand = [r for r in cand if r["inn"].startswith("emaPeak")]
            score_cand = [r for r in cand if r["inn"].startswith("scorePeak")]
            zero_cand = [r for r in cand if r["mode"] == "zero_down"]
            bear_cand = [r for r in cand if r["mode"] == "bear_div"]
            groups = []
            if mode == "bear_div":
                groups = [("bear_div", bear_cand)]
            elif mode == "ema_peak":
                groups = [("ema_peak", ema_cand), ("score_peak", score_cand)]
            elif mode == "zero_down":
                groups = [("zero_down", zero_cand)]
            for name, group in groups:
                if not group:
                    continue
                group.sort(key=rank, reverse=True)
                r = group[0]
                lines.append(f"  {name:12} OUT {r['out']} IN {r['inn']}")
                lines.append(f"             HOLD  {bt.fmt_pack(r['stats']['hold'])} why={r['stats']['hold'].get('why')}")
                lines.append(f"             TRAIN {bt.fmt_pack(r['stats']['train'])}")

        # share of exits that were indicator vs stop
        lines.append("\nExit-reason mix on best stable pairs (hold mean>0, train mean>0, nH>=30):")
        stable = []
        for r in rows:
            h = r["stats"].get("hold") or {}
            t = r["stats"].get("train") or {}
            if h.get("n", 0) >= 30 and h.get("mean", -1) > 0 and t.get("mean", -1) > 0:
                stable.append(r)
        stable.sort(key=lambda r: r["stats"]["hold"]["mean"], reverse=True)
        for r in stable[:8]:
            why = r["stats"]["hold"].get("why") or {}
            n = r["stats"]["hold"]["n"]
            tide_in = why.get("tide_in", 0)
            lines.append(
                f"  {r['inn'][:28]:28} tide_in={100*tide_in/n:5.1f}%  sl={100*why.get('sl',0)/n:5.1f}%  "
                f"time={100*why.get('time',0)/n:5.1f}%  mean={r['stats']['hold']['mean']:+.3f}%"
            )

    return books


def main():
    bt.OUT.mkdir(parents=True, exist_ok=True)
    if not bt.DB.exists():
        raise SystemExit(f"no db at {bt.DB}")
    import sqlite3
    conn = sqlite3.connect(f"file:{bt.DB}?mode=ro", uri=True)
    print("loading universe (indicator Tide IN only)...", flush=True)
    uni = bt.load_universe(conn)
    conn.close()

    lines = [
        "TIDE IN — INDICATOR METRICS ONLY",
        "Tide OUT = bull DIV (price LL, Tide EMA HL) from prior bottom sweep winners.",
        "Tide IN  = bear DIV / Tide-EMA peak / raw score peak / score 0-cross down.",
        "No fixed % swing and no naked price pivot as Tide IN.",
        f"Coins {','.join(bt.SYMBOLS)}  holdout 2024+",
        "",
    ]
    books = run_pairs(uni, lines)

    lines.append("\n======== RECOMMENDATIONS ========")
    for interval in bt.INTERVALS:
        lines.append(f"\n{interval}:")
        rows = books[interval]
        good = []
        for r in rows:
            h = r["stats"].get("hold") or {}
            t = r["stats"].get("train") or {}
            if h.get("n", 0) >= 25 and t.get("n", 0) >= 25 and h.get("mean", -1) > 0 and t.get("mean", -1) > 0:
                good.append(r)
        good.sort(key=lambda r: r["stats"]["hold"]["mean"], reverse=True)
        if not good:
            lines.append("  no train+hold green pairs with n>=25")
            continue
        for r in good[:6]:
            why = r["stats"]["hold"].get("why")
            lines.append(f"  OUT {r['out']}")
            lines.append(f"    IN  {r['inn']}")
            lines.append(f"    HOLD  {bt.fmt_pack(r['stats']['hold'])}  why={why}")
            lines.append(f"    TRAIN {bt.fmt_pack(r['stats']['train'])}")

    text = "\n".join(lines) + "\n"
    outp = bt.OUT / "tide_in_indicator_only.txt"
    outp.write_text(text)
    docs = Path("/home/droid/Crypto/docs/tide_in_indicator_only.txt")
    try:
        docs.parent.mkdir(parents=True, exist_ok=True)
        docs.write_text(text)
        print(f"WROTE {docs}", flush=True)
    except OSError:
        pass
    print(text)
    print(f"WROTE {outp}", flush=True)


if __name__ == "__main__":
    main()
