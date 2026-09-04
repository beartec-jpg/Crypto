#!/usr/bin/env python3
"""
Tide-histogram EMA peaks vs price — divergence hunt.

Research only. Does not change the oscillator.

Question: the EMA of Tide score makes cleaner peaks/troughs. Does
price↔EMA divergence add anything to absorb / stage-1 distro?

Causal: a pivot at bar p is confirmed at p+W (needs W bars after the
turn). Event time is the confirm bar. Train <2024-01-01, hold 2024+.

Methods
  - regular bull: price LL, EMA HL   (absorb-like)
  - regular bear: price HH, EMA LH   (distro-like)
  - hidden bull:  price HL, EMA LL
  - hidden bear:  price LH, EMA HH
  - raw-score pivots (no EMA) as a control
  - EMA 0-cross up + price down vs current absorb (score 0-cross)

Stack
  - bull div ∩ current absorb
  - bear div ∩ 16-bar high ∩ OI flush
"""
from __future__ import annotations

import importlib.util
import math
import os
import sqlite3
from collections import defaultdict
from pathlib import Path

here = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "tide_zone_1h_refine.py"
spec = importlib.util.spec_from_file_location("tz", str(here))
tz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tz)

OUT = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "holistic"
SYMBOLS = tz.SYMBOLS
SPLIT = tz.SPLIT
OI_FLUSH = -0.03
NEAR = 0.003
SWING = 16
EMA_PS = (5, 8, 13, 21, 34)
PIVOT_WS = (5, 8, 13)
MIN_EMA_SEP = 2.0  # score points; ignore tiny wiggles


def isnum(x):
    return tz.isnum(x)


def mean(xs):
    xs = [x for x in xs if isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def med(xs):
    xs = sorted(x for x in xs if isnum(x))
    return xs[len(xs) // 2] if xs else float("nan")


def winrate(xs):
    xs = [x for x in xs if isnum(x)]
    return 100 * sum(1 for x in xs if x > 0) / len(xs) if xs else float("nan")


def dump_rate(xs):
    xs = [x for x in xs if isnum(x)]
    return 100 * sum(1 for x in xs if x < 0) / len(xs) if xs else float("nan")


def ema_of(xs, p):
    out = [float("nan")] * len(xs)
    seed = next((i for i, v in enumerate(xs) if isnum(v)), None)
    if seed is None:
        return out
    k = 2 / (p + 1)
    prev = xs[seed]
    out[seed] = prev
    for i in range(seed + 1, len(xs)):
        v = xs[i] if isnum(xs[i]) else prev
        prev = v * k + prev * (1 - k)
        out[i] = prev
    return out


def confirmed_pivots(xs, w):
    """Return (peaks, troughs) as lists of (confirm_i, pivot_i). Causal at confirm_i."""
    peaks, troughs = [], []
    n = len(xs)
    if n < 2 * w + 2:
        return peaks, troughs
    for i in range(2 * w, n):
        p = i - w
        if not isnum(xs[p]):
            continue
        window = xs[p - w : p + w + 1]
        if any(not isnum(v) for v in window):
            continue
        mx, mn = max(window), min(window)
        # strict-ish: unique extremum at p
        if xs[p] == mx and xs[p] >= xs[p - 1] and xs[p] >= xs[p + 1] and window.count(mx) == 1:
            peaks.append((i, p))
        if xs[p] == mn and xs[p] <= xs[p - 1] and xs[p] <= xs[p + 1] and window.count(mn) == 1:
            troughs.append((i, p))
    return peaks, troughs


def last_le(series, t):
    return tz.last_le(series, t)


def load_k(conn, sym, interval):
    rows = conn.execute(
        "SELECT t,o,h,l,c,v FROM klines WHERE symbol=? AND interval=? ORDER BY t",
        (sym, interval),
    ).fetchall()
    return [{"t": t, "o": o, "h": h, "l": l, "c": c, "v": v} for t, o, h, l, c, v in rows]


def load_oi(conn, sym, interval):
    deriv = "4h" if interval == "4h" else "1h"
    try:
        return list(
            conn.execute(
                "SELECT t, close FROM oi WHERE exchange='Binance' AND symbol=? AND interval=? ORDER BY t",
                (sym, deriv),
            )
        )
    except sqlite3.OperationalError:
        return []


def oi_chg(oi, t):
    now = last_le(oi, t)
    prev = last_le(oi, t - 86400)
    if not now or not prev or not prev[1]:
        return None
    return now[1] / prev[1] - 1


def fwd(cs, i, h):
    if i + h >= len(cs):
        return float("nan")
    return cs[i + h]["c"] / cs[i]["c"] - 1


def era_of(t):
    return "hold" if t >= SPLIT else "train"


def add(store, key, era, val):
    if isnum(val):
        store[key][era].append(val)
        store[key]["all"].append(val)


def show(title, xs):
    if not xs:
        return f"{title}: n=0"
    return (
        f"{title}: n={len(xs):5d}  mean={100 * mean(xs):+6.3f}%  "
        f"med={100 * med(xs):+6.3f}%  win={winrate(xs):5.1f}%  dump={dump_rate(xs):5.1f}%"
    )


def classify_div(kind, p_now, p_prev, ema, cs):
    """kind in peaks|troughs. Return regular/hidden or None."""
    e0, e1 = ema[p_prev], ema[p_now]
    if not isnum(e0) or not isnum(e1):
        return None
    if abs(e1 - e0) < MIN_EMA_SEP:
        return None
    if kind == "peak":
        px0 = max(cs[j]["h"] for j in range(max(0, p_prev - 1), p_prev + 2))
        px1 = max(cs[j]["h"] for j in range(max(0, p_now - 1), min(len(cs), p_now + 2)))
        px_hh = px1 >= px0 * (1 + 0.0005)
        px_lh = px1 <= px0 * (1 - 0.0005)
        ema_lh = e1 < e0
        ema_hh = e1 > e0
        if px_hh and ema_lh:
            return "reg_bear"
        if px_lh and ema_hh:
            return "hid_bear"
    else:
        px0 = min(cs[j]["l"] for j in range(max(0, p_prev - 1), p_prev + 2))
        px1 = min(cs[j]["l"] for j in range(max(0, p_now - 1), min(len(cs), p_now + 2)))
        px_ll = px1 <= px0 * (1 - 0.0005)
        px_hl = px1 >= px0 * (1 + 0.0005)
        ema_hl = e1 > e0
        ema_ll = e1 < e0
        if px_ll and ema_hl:
            return "reg_bull"
        if px_hl and ema_ll:
            return "hid_bull"
    return None


def scan_interval(conn, interval, horizons, label_h):
    store = defaultdict(lambda: defaultdict(list))
    overlap = defaultdict(lambda: defaultdict(list))
    print(f"\n=== {interval} ===", flush=True)

    for sym in SYMBOLS:
        cs = load_k(conn, sym, interval)
        print(f"  {sym} {len(cs)}", flush=True)
        if len(cs) < 400:
            continue
        score, tide, energy, tape = tz.tide_series(cs)
        oi = load_oi(conn, sym, interval)
        n = len(cs)
        max_h = max(horizons)

        emas = {p: ema_of(score, p) for p in EMA_PS}
        emas[0] = list(score)  # raw score "EMA 0"

        # current absorb / distro flags (same rules as live)
        absorb = [False] * n
        distro = [False] * n
        at_high = [False] * n
        for i in range(SWING, n):
            if not isnum(score[i]) or not isnum(score[i - 1]):
                continue
            lo16 = min(c["l"] for c in cs[i - SWING + 1 : i + 1])
            hi16 = max(c["h"] for c in cs[i - SWING + 1 : i + 1])
            near_lo = cs[i]["c"] <= lo16 * (1 + NEAR)
            near_hi = cs[i]["c"] >= hi16 * (1 - NEAR)
            at_hi = cs[i]["h"] == hi16
            at_high[i] = at_hi
            px_dn_flat = cs[i]["c"] <= cs[i - 1]["c"]
            tape_up = isnum(tape[i]) and isnum(tape[i - 1]) and tape[i] > tape[i - 1]
            zero_up = score[i - 1] < 0 <= score[i]
            score_up = score[i] > score[i - 1]
            if px_dn_flat and tape_up and (zero_up or (score_up and near_lo)):
                absorb[i] = True
            oi_c = oi_chg(oi, cs[i]["t"])
            if at_hi and near_hi and oi_c is not None and oi_c <= OI_FLUSH:
                squeeze = isnum(tape[i]) and tape[i] > 0.65 and cs[i]["c"] > cs[i - 1]["c"]
                if not squeeze:
                    distro[i] = True

        # baselines
        for i in range(80, n - max_h):
            era = era_of(cs[i]["t"])
            for h, tag in zip(horizons, label_h):
                r = fwd(cs, i, h)
                add(store, f"CTRL all {tag}", era, r)
                if absorb[i]:
                    add(store, f"ABSORB live {tag}", era, r)
                if distro[i]:
                    add(store, f"DISTRO live {tag}", era, r)
                if at_high[i]:
                    add(store, f"CTRL 16h-high {tag}", era, r)
                if i > 0 and isnum(score[i]) and isnum(score[i - 1]) and isnum(tape[i]) and isnum(tape[i - 1]):
                    if score[i - 1] < 0 <= score[i] and cs[i]["c"] < cs[i - 1]["c"] and tape[i] > tape[i - 1]:
                        add(store, f"ABSORB 0-cross {tag}", era, r)

        # EMA 0-cross absorb (each period)
        for p, series in emas.items():
            tag_p = "raw" if p == 0 else f"ema{p}"
            for i in range(80, n - max_h):
                if not isnum(series[i]) or not isnum(series[i - 1]):
                    continue
                if not (series[i - 1] < 0 <= series[i]):
                    continue
                if cs[i]["c"] >= cs[i - 1]["c"]:
                    continue
                tape_up = isnum(tape[i]) and isnum(tape[i - 1]) and tape[i] > tape[i - 1]
                era = era_of(cs[i]["t"])
                for h, tag in zip(horizons, label_h):
                    r = fwd(cs, i, h)
                    add(store, f"0x {tag_p} px↓ {tag}", era, r)
                    if tape_up:
                        add(store, f"0x {tag_p} px↓ tape↑ {tag}", era, r)

        # Pivot divergences
        for p, series in emas.items():
            tag_p = "raw" if p == 0 else f"ema{p}"
            for w in PIVOT_WS:
                peaks, troughs = confirmed_pivots(series, w)
                last_peak = None
                for confirm_i, piv_i in peaks:
                    if last_peak is not None:
                        kind = classify_div("peak", piv_i, last_peak, series, cs)
                        if kind and confirm_i < n - max_h:
                            era = era_of(cs[confirm_i]["t"])
                            near_hi = cs[confirm_i]["c"] >= max(
                                c["h"] for c in cs[max(0, confirm_i - SWING + 1) : confirm_i + 1]
                            ) * (1 - NEAR)
                            for h, tag in zip(horizons, label_h):
                                r = fwd(cs, confirm_i, h)
                                add(store, f"{kind} {tag_p} w{w} {tag}", era, r)
                                if kind == "reg_bear" and distro[confirm_i]:
                                    add(overlap, f"reg_bear∩distro {tag_p} w{w} {tag}", era, r)
                                if kind == "reg_bear" and at_high[confirm_i]:
                                    add(overlap, f"reg_bear∩16high {tag_p} w{w} {tag}", era, r)
                                if kind == "reg_bear" and near_hi:
                                    oi_c = oi_chg(oi, cs[confirm_i]["t"])
                                    if oi_c is not None and oi_c <= OI_FLUSH:
                                        add(overlap, f"reg_bear∩OI {tag_p} w{w} {tag}", era, r)
                    last_peak = piv_i
                last_tr = None
                for confirm_i, piv_i in troughs:
                    if last_tr is not None:
                        kind = classify_div("trough", piv_i, last_tr, series, cs)
                        if kind and confirm_i < n - max_h:
                            era = era_of(cs[confirm_i]["t"])
                            for h, tag in zip(horizons, label_h):
                                r = fwd(cs, confirm_i, h)
                                add(store, f"{kind} {tag_p} w{w} {tag}", era, r)
                                if kind == "reg_bull" and absorb[confirm_i]:
                                    add(overlap, f"reg_bull∩absorb {tag_p} w{w} {tag}", era, r)
                    last_tr = piv_i

    return store, overlap


def dump_block(lines, store, keys, title):
    lines.append(f"\n== {title} ==")
    for key in keys:
        if key not in store:
            continue
        lines.append(f"-- {key}")
        for era in ("all", "train", "hold"):
            lines.append("   " + show(era, store[key][era]))


def rank_hold(store, needle, horizon_tag, want="mean_long"):
    rows = []
    for key, eras in store.items():
        if needle not in key or not key.endswith(horizon_tag):
            continue
        xs = eras["hold"]
        if len(xs) < 40:
            continue
        rows.append((key, len(xs), mean(xs), med(xs), winrate(xs), dump_rate(xs)))
    if want == "mean_long":
        rows.sort(key=lambda r: r[2], reverse=True)
    else:
        rows.sort(key=lambda r: r[5], reverse=True)
    return rows


def main():
    conn = sqlite3.connect(f"file:{tz.DB}?mode=ro", uri=True)
    lines = [
        "TIDE EMA DIVERGENCE vs ABSORB / DISTRO",
        "Causal pivots: confirm W bars after the EMA turn.",
        "Holdout = 2024+. Six coins. Research only.",
        "",
    ]

    jobs = [
        ("1h", (6, 12, 24), ("6h", "12h", "24h")),
        ("15m", (16, 48, 96), ("4h", "12h", "24h")),
    ]
    all_stores = {}
    for interval, hs, tags in jobs:
        store, overlap = scan_interval(conn, interval, hs, tags)
        all_stores[interval] = (store, overlap, tags)

        # live baselines
        base_keys = []
        for tag in tags:
            base_keys += [
                f"CTRL all {tag}",
                f"CTRL 16h-high {tag}",
                f"ABSORB live {tag}",
                f"ABSORB 0-cross {tag}",
                f"DISTRO live {tag}",
            ]
        dump_block(lines, store, base_keys, f"{interval} live absorb/distro vs control")

        # 0-cross EMA variants at mid horizon
        mid = tags[1]
        zx = sorted(
            [k for k in store if k.startswith("0x ") and k.endswith(mid)],
            key=lambda k: mean(store[k]["hold"]) if store[k]["hold"] else -9,
            reverse=True,
        )
        dump_block(lines, store, zx, f"{interval} 0-cross variants @ {mid} (sorted later by hold mean in rank)")

        lines.append(f"\n== {interval} HOLD {mid} rank: regular BULL (want +mean) ==")
        for row in rank_hold(store, "reg_bull", mid, "mean_long")[:12]:
            lines.append(
                f"  {row[0]}  n={row[1]:4d}  mean={100*row[2]:+6.3f}%  med={100*row[3]:+6.3f}%  "
                f"win={row[4]:5.1f}%  dump={row[5]:5.1f}%"
            )
        lines.append(f"\n== {interval} HOLD {mid} rank: regular BEAR (want dump) ==")
        for row in rank_hold(store, "reg_bear", mid, "dump")[:12]:
            lines.append(
                f"  {row[0]}  n={row[1]:4d}  mean={100*row[2]:+6.3f}%  med={100*row[3]:+6.3f}%  "
                f"win={row[4]:5.1f}%  dump={row[5]:5.1f}%"
            )
        lines.append(f"\n== {interval} HOLD {mid} rank: hidden BULL ==")
        for row in rank_hold(store, "hid_bull", mid, "mean_long")[:8]:
            lines.append(
                f"  {row[0]}  n={row[1]:4d}  mean={100*row[2]:+6.3f}%  med={100*row[3]:+6.3f}%  "
                f"win={row[4]:5.1f}%"
            )
        lines.append(f"\n== {interval} HOLD {mid} rank: hidden BEAR ==")
        for row in rank_hold(store, "hid_bear", mid, "dump")[:8]:
            lines.append(
                f"  {row[0]}  n={row[1]:4d}  mean={100*row[2]:+6.3f}%  dump={row[5]:5.1f}%"
            )

        ov_keys = sorted(k for k in overlap if k.endswith(mid))
        dump_block(lines, overlap, ov_keys, f"{interval} stacks @ {mid}")

        # print a compact comparison: best bull vs absorb, best bear vs distro
        lines.append(f"\n== {interval} compact vs live tells @ {mid} hold ==")
        for name in (f"ABSORB live {mid}", f"DISTRO live {mid}", f"CTRL all {mid}", f"CTRL 16h-high {mid}"):
            lines.append("  " + show(name, store[name]["hold"]))
        best_bull = rank_hold(store, "reg_bull", mid, "mean_long")
        best_bear = rank_hold(store, "reg_bear", mid, "dump")
        if best_bull:
            lines.append("  BEST bull " + show(best_bull[0][0], store[best_bull[0][0]]["hold"]))
            lines.append("  BEST bull TRAIN " + show(best_bull[0][0], store[best_bull[0][0]]["train"]))
        if best_bear:
            lines.append("  BEST bear " + show(best_bear[0][0], store[best_bear[0][0]]["hold"]))
            lines.append("  BEST bear TRAIN " + show(best_bear[0][0], store[best_bear[0][0]]["train"]))

    out = OUT / "tide_ema_divergence.txt"
    text = "\n".join(lines) + "\n"
    out.write_text(text)
    print(text)
    print(f"WROTE {out}", flush=True)


if __name__ == "__main__":
    main()
