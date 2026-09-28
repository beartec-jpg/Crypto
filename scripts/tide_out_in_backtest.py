#!/usr/bin/env python3
"""
Tide OUT / Tide IN research.

Mirrors live findTideDivZones (client/src/lib/indicators/tideZone.ts):
  zigzag N on price wicks and on Tide-score EMA, then
  DIV (tide out) = price lower-low vs EMA higher-low, EMA troughs below belowScore.

Causal event time = second pivot index + N (the live chart paints the pivot
bars; a trade cannot fire until the fractal confirms).

Tide IN is the inverse, used only as an exit after a tide-out long — never
as a standalone short.

Train < 2024-01-01, holdout 2024+. Six coins. Fee 4 bps/side.
"""
from __future__ import annotations

import itertools
import json
import math
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tide_zone_1h_refine as tz  # noqa: E402

DATA = Path(os.environ.get("CRYPTO_DATA_DIR", str(Path.home() / "crypto-data")))
DB = DATA / "market.sqlite"
OUT = DATA / "holistic"
SPLIT = tz.SPLIT
FEE = 0.0004
SYMBOLS = tz.SYMBOLS
INTERVALS = ("15m", "1h", "4h")
HORIZONS = {
    "15m": ((16, "4h"), (48, "12h"), (96, "24h")),
    "1h": ((6, "6h"), (12, "12h"), (24, "24h")),
    "4h": ((3, "12h"), (6, "24h"), (12, "48h")),
}
MAX_HOLD = {"15m": 96, "1h": 48, "4h": 18}  # 24h / 48h / 72h
STOP_PCT = 0.02

# Live defaults
DEFAULT_OUT = dict(emaPeriod=8, confirmBars=5, belowScore=-10, minGap=0, emaSep=0.0, priceLlPct=0.0)

OUT_EMA = (5, 8, 13, 21)
OUT_N = (3, 5, 8, 13)
OUT_BELOW = (0, -10, -20, -30, -40)
# Second-stage filters (live stores these but currently does not apply them)
FILT_GAP = (0, 8, 16)
FILT_SEP = (0.0, 4.0, 8.0)
FILT_LL = (0.0, 0.003, 0.01)

IN_EMA = (5, 8, 13)
IN_N = (3, 5, 8)
IN_ABOVE = (0, 10, 20)


def isnum(x):
    return tz.isnum(x)


def mean(xs):
    xs = [x for x in xs if isnum(x)]
    return sum(xs) / len(xs) if xs else float("nan")


def med(xs):
    xs = sorted(x for x in xs if isnum(x))
    return xs[len(xs) // 2] if xs else float("nan")


def pct(xs, p):
    xs = sorted(x for x in xs if isnum(x))
    if not xs:
        return float("nan")
    i = min(len(xs) - 1, max(0, int(round((p / 100) * (len(xs) - 1)))))
    return xs[i]


def winrate(xs):
    xs = [x for x in xs if isnum(x)]
    return 100.0 * sum(1 for x in xs if x > 0) / len(xs) if xs else float("nan")


def era_of(t):
    return "hold" if t >= SPLIT else "train"


def ema_of(xs, p):
    out = [float("nan")] * len(xs)
    seed = next((i for i, v in enumerate(xs) if isnum(v)), None)
    if seed is None:
        return out
    if p <= 0:
        return [xs[i] if isnum(xs[i]) else float("nan") for i in range(len(xs))]
    k = 2 / (p + 1)
    prev = xs[seed]
    out[seed] = prev
    for i in range(seed + 1, len(xs)):
        v = xs[i] if isnum(xs[i]) else prev
        prev = v * k + prev * (1 - k)
        out[i] = prev
    return out


def zigzag_values(times, values, n):
    """Fractal zigzag of length N, collapse to alternating extrema. Matches TS."""
    length = max(2, int(round(n)))
    m = len(values)
    if m < length * 2 + 1:
        return []
    raw = []
    for i in range(length, m - length):
        v = values[i]
        if not isnum(v):
            continue
        is_high = True
        is_low = True
        for j in range(i - length, i + length + 1):
            if j == i:
                continue
            x = values[j]
            if not isnum(x):
                is_high = is_low = False
                break
            if x > v:
                is_high = False
            if x < v:
                is_low = False
        if is_high == is_low:
            continue
        raw.append({"index": i, "time": times[i], "value": v, "type": "high" if is_high else "low"})
    zz = []
    for s in raw:
        if not zz:
            zz.append(s)
            continue
        last = zz[-1]
        if s["type"] == last["type"]:
            more = s["value"] >= last["value"] if s["type"] == "high" else s["value"] <= last["value"]
            if more:
                zz[-1] = s
            continue
        zz.append(s)
    return zz


_zz_price_cache = {}
_zz_val_cache = {}


def zigzag_price(cs, n):
    length = max(2, int(round(n)))
    m = len(cs)
    if m < length * 2 + 1:
        return []
    raw = []
    for i in range(length, m - length):
        hi = cs[i]["h"]
        lo = cs[i]["l"]
        is_high = True
        is_low = True
        for j in range(i - length, i + length + 1):
            if j == i:
                continue
            if cs[j]["h"] > hi:
                is_high = False
            if cs[j]["l"] < lo:
                is_low = False
        if is_high == is_low:
            continue
        raw.append({
            "index": i,
            "time": cs[i]["t"],
            "value": hi if is_high else lo,
            "type": "high" if is_high else "low",
        })
    zz = []
    for s in raw:
        if not zz:
            zz.append(s)
            continue
        last = zz[-1]
        if s["type"] == last["type"]:
            more = s["value"] >= last["value"] if s["type"] == "high" else s["value"] <= last["value"]
            if more:
                zz[-1] = s
            continue
        zz.append(s)
    return zz


def zigzag_price_cached(cs, n):
    key = (id(cs), int(n))
    hit = _zz_price_cache.get(key)
    if hit is None:
        hit = zigzag_price(cs, n)
        _zz_price_cache[key] = hit
    return hit


def zigzag_values_cached(times, values, n):
    key = (id(values), int(n))
    hit = _zz_val_cache.get(key)
    if hit is None:
        hit = zigzag_values(times, values, n)
        _zz_val_cache[key] = hit
    return hit


def nearest(pivots, t, max_dt):
    best = None
    best_d = float("inf")
    for p in pivots:
        d = abs(p["time"] - t)
        if d < best_d:
            best_d = d
            best = p
    if best is not None and best_d <= max_dt:
        return best
    return None


def find_divs(cs, ema, n, below_score, min_gap=0, ema_sep=0.0, price_ll_pct=0.0):
    """Regular bull DIV. Returns list of events with causal confirm_i."""
    n = max(2, int(round(n)))
    price_lows = [z for z in zigzag_price_cached(cs, n) if z["type"] == "low"]
    times = [c["t"] for c in cs]
    ema_lows = [z for z in zigzag_values_cached(times, ema, n) if z["type"] == "low"]
    if len(price_lows) < 2 or len(ema_lows) < 2:
        return []
    bar = cs[1]["t"] - cs[0]["t"]
    max_dt = bar * n * 2
    out = []
    m = len(cs)
    for k in range(1, len(price_lows)):
        a = price_lows[k - 1]
        b = price_lows[k]
        if min_gap and (b["index"] - a["index"]) < min_gap:
            continue
        if price_ll_pct > 0 and not (b["value"] <= a["value"] * (1 - price_ll_pct)):
            continue
        if not (b["value"] < a["value"]):
            continue
        e1 = nearest(ema_lows, a["time"], max_dt)
        e2 = nearest(ema_lows, b["time"], max_dt)
        if not e1 or not e2 or e2["time"] <= e1["time"]:
            continue
        if below_score < 0:
            if e1["value"] >= below_score or e2["value"] >= below_score:
                continue
        if not (e2["value"] > e1["value"]):
            continue
        if ema_sep > 0 and (e2["value"] - e1["value"]) < ema_sep:
            continue
        confirm = max(b["index"], e2["index"]) + n
        if confirm >= m - 1:
            continue
        out.append({
            "kind": "div",
            "confirm_i": confirm,
            "pivot_i": b["index"],
            "t1": a["time"],
            "t2": b["time"],
            "price1": a["value"],
            "price2": b["value"],
            "ema1": e1["value"],
            "ema2": e2["value"],
        })
    return out


def find_bear_divs(cs, ema, n, above_score, min_gap=0, ema_sep=0.0, price_hh_pct=0.0):
    """Regular bear DIV (price HH, EMA LH). Exit-only."""
    n = max(2, int(round(n)))
    price_highs = [z for z in zigzag_price_cached(cs, n) if z["type"] == "high"]
    times = [c["t"] for c in cs]
    ema_highs = [z for z in zigzag_values_cached(times, ema, n) if z["type"] == "high"]
    if len(price_highs) < 2 or len(ema_highs) < 2:
        return []
    bar = cs[1]["t"] - cs[0]["t"]
    max_dt = bar * n * 2
    out = []
    m = len(cs)
    for k in range(1, len(price_highs)):
        a = price_highs[k - 1]
        b = price_highs[k]
        if min_gap and (b["index"] - a["index"]) < min_gap:
            continue
        if price_hh_pct > 0 and not (b["value"] >= a["value"] * (1 + price_hh_pct)):
            continue
        if not (b["value"] > a["value"]):
            continue
        e1 = nearest(ema_highs, a["time"], max_dt)
        e2 = nearest(ema_highs, b["time"], max_dt)
        if not e1 or not e2 or e2["time"] <= e1["time"]:
            continue
        if above_score > 0:
            if e1["value"] <= above_score or e2["value"] <= above_score:
                continue
        if not (e2["value"] < e1["value"]):
            continue
        if ema_sep > 0 and (e1["value"] - e2["value"]) < ema_sep:
            continue
        confirm = max(b["index"], e2["index"]) + n
        if confirm >= m - 1:
            continue
        out.append({
            "kind": "bear_div",
            "confirm_i": confirm,
            "pivot_i": b["index"],
            "t1": a["time"],
            "t2": b["time"],
            "price1": a["value"],
            "price2": b["value"],
            "ema1": e1["value"],
            "ema2": e2["value"],
        })
    return out


def find_pivot_highs(cs, n):
    n = max(2, int(round(n)))
    highs = [z for z in zigzag_price_cached(cs, n) if z["type"] == "high"]
    m = len(cs)
    out = []
    for h in highs:
        confirm = h["index"] + n
        if confirm >= m - 1:
            continue
        out.append({"kind": "pivot_high", "confirm_i": confirm, "pivot_i": h["index"], "price": h["value"]})
    return out


def find_ema_peaks(ema, times, n, above_score=0):
    n = max(2, int(round(n)))
    highs = [z for z in zigzag_values_cached(times, ema, n) if z["type"] == "high"]
    m = len(ema)
    out = []
    for h in highs:
        if above_score > 0 and h["value"] <= above_score:
            continue
        confirm = h["index"] + n
        if confirm >= m - 1:
            continue
        out.append({"kind": "ema_peak", "confirm_i": confirm, "pivot_i": h["index"], "ema": h["value"]})
    return out


def find_absorb(cs, ema, n):
    """Price LL/flat, EMA rising across the two price lows. Matches live absorb."""
    n = max(2, int(round(n)))
    price_lows = [z for z in zigzag_price_cached(cs, n) if z["type"] == "low"]
    m = len(cs)
    out = []
    for k in range(1, len(price_lows)):
        a = price_lows[k - 1]
        b = price_lows[k]
        if b["value"] > a["value"]:
            continue
        e1 = ema[a["index"]]
        e2 = ema[b["index"]]
        if not isnum(e1) or not isnum(e2) or not (e2 > e1):
            continue
        confirm = b["index"] + n
        if confirm >= m - 1:
            continue
        out.append({
            "kind": "absorb",
            "confirm_i": confirm,
            "pivot_i": b["index"],
            "price1": a["value"],
            "price2": b["value"],
            "ema1": e1,
            "ema2": e2,
        })
    return out


def load_k(conn, sym, interval):
    rows = conn.execute(
        "SELECT t,o,h,l,c,v FROM klines WHERE symbol=? AND interval=? ORDER BY t",
        (sym, interval),
    ).fetchall()
    return [{"t": t, "o": o, "h": h, "l": l, "c": c, "v": v} for t, o, h, l, c, v in rows]


def fwd_close(cs, i, h):
    if i + h >= len(cs):
        return float("nan")
    return cs[i + h]["c"] / cs[i]["c"] - 1


def path_stats(cs, confirm_i, horizon):
    """Next-open fill, then MAE/MFE over `horizon` bars. No fees."""
    fill_i = confirm_i + 1
    if fill_i >= len(cs) or fill_i + 1 >= len(cs):
        return None
    entry = cs[fill_i]["o"]
    end = min(len(cs) - 1, fill_i + horizon)
    mae = 0.0
    mfe = 0.0
    mfe_bar = 0
    still_low = True
    pivot_low = cs[confirm_i]["l"]
    for j in range(fill_i, end + 1):
        dn = cs[j]["l"] / entry - 1
        up = cs[j]["h"] / entry - 1
        if dn < mae:
            mae = dn
        if up > mfe:
            mfe = up
            mfe_bar = j - fill_i
        if cs[j]["l"] < pivot_low:
            still_low = False
    ret = cs[end]["c"] / entry - 1
    return {
        "ret": ret,
        "mae": mae,
        "mfe": mfe,
        "mfe_bar": mfe_bar,
        "held_low": still_low,
        "entry": entry,
        "fill_i": fill_i,
    }


def pack_fwd(events, cs, horizons, split=SPLIT):
    """events: list of confirm_i."""
    out = {}
    for h, tag in horizons:
        by = {"all": [], "train": [], "hold": [], "mae_hold": [], "mfe_hold": [], "held_hold": []}
        for ev in events:
            i = ev["confirm_i"]
            st = path_stats(cs, i, h)
            if not st:
                continue
            era = era_of(cs[i]["t"])
            by["all"].append(st["ret"])
            by[era].append(st["ret"])
            if era == "hold":
                by["mae_hold"].append(st["mae"])
                by["mfe_hold"].append(st["mfe"])
                by["held_hold"].append(1.0 if st["held_low"] else 0.0)
        out[tag] = by
    return out


def summarize_fwd(by):
    return {
        "n_all": len(by["all"]),
        "n_train": len(by["train"]),
        "n_hold": len(by["hold"]),
        "mean_all": mean(by["all"]),
        "mean_train": mean(by["train"]),
        "mean_hold": mean(by["hold"]),
        "med_hold": med(by["hold"]),
        "wr_hold": winrate(by["hold"]),
        "wr_train": winrate(by["train"]),
        "mae_hold": med(by["mae_hold"]),
        "mfe_hold": med(by["mfe_hold"]),
        "held_hold": 100.0 * mean(by["held_hold"]) if by["held_hold"] else float("nan"),
    }


def cfg_key(cfg):
    return (
        f"ema{cfg['emaPeriod']}_n{cfg['confirmBars']}_below{cfg['belowScore']}"
        f"_gap{cfg.get('minGap', 0)}_sep{cfg.get('emaSep', 0):g}_ll{cfg.get('priceLlPct', 0):g}"
    )


def simulate_longs(cs, entries, exits, interval, use_stop=True, use_2r=False):
    """
    entries/exits: sorted unique confirm indices.
    Fill next open. Optional 2% stop. Optional 2R. Time MAX_HOLD.
    One position. Tide-in exits are signal exits (close at that bar's close
    if the exit confirmed this bar — fill next open of the exit bar to stay causal:
    exit confirm at i, flatten at i+1 open).
    """
    hold = MAX_HOLD[interval]
    n = len(cs)
    entry_set = set(entries)
    exit_set = set(exits)
    trades = []
    pos = None  # (entry_px, stop, tp, fill_i, sig_i)
    pending_entry = None
    pending_exit = False
    for i in range(80, n):
        c = cs[i]
        if pending_entry is not None and pos is None:
            sig_i = pending_entry
            pending_entry = None
            if i == sig_i + 1:
                entry = c["o"]
                stop = entry * (1 - STOP_PCT) if use_stop else None
                if stop is not None and c["o"] <= stop:
                    trades.append({
                        "t": cs[sig_i]["t"], "ret": -STOP_PCT - 2 * FEE, "why": "gap_sl",
                        "bars": 0, "side": "long",
                    })
                else:
                    risk = entry - stop if stop is not None else entry * STOP_PCT
                    tp = entry + 2 * risk if use_2r else None
                    pos = (entry, stop, tp, i, sig_i)
        if pending_exit and pos is not None:
            pending_exit = False
            entry, stop, tp, fill_i, sig_i = pos
            px = c["o"]
            ret = px / entry - 1 - 2 * FEE
            trades.append({
                "t": cs[sig_i]["t"], "ret": ret, "why": "tide_in",
                "bars": i - fill_i, "side": "long",
            })
            pos = None
        if pos is not None:
            entry, stop, tp, fill_i, sig_i = pos
            why = px = None
            if stop is not None and c["l"] <= stop:
                px, why = stop, "sl"
            elif tp is not None and c["h"] >= tp:
                px, why = tp, "tp"
            elif i - fill_i >= hold:
                px, why = c["c"], "time"
            if px is not None:
                ret = px / entry - 1 - 2 * FEE
                trades.append({
                    "t": cs[sig_i]["t"], "ret": ret, "why": why,
                    "bars": i - fill_i, "side": "long",
                })
                pos = None
                pending_exit = False
        if pos is None and pending_entry is None and i in entry_set:
            pending_entry = i
        elif pos is not None and not pending_exit and i in exit_set and i > pos[4]:
            pending_exit = True
    return trades


def book_stats(trades):
    if not trades:
        return {"n": 0}
    def pack(ts):
        if not ts:
            return {"n": 0}
        rets = [t["ret"] for t in ts]
        wins = [r for r in rets if r > 0]
        loss = [r for r in rets if r <= 0]
        gp, gl = sum(wins), -sum(loss)
        eq = 1.0
        peak = 1.0
        dd = 0.0
        for r in rets:
            eq *= 1 + r
            peak = max(peak, eq)
            dd = min(dd, eq / peak - 1)
        why = defaultdict(int)
        for t in ts:
            why[t["why"]] += 1
        bars = [t["bars"] for t in ts if "bars" in t]
        return {
            "n": len(ts),
            "wr": 100.0 * len(wins) / len(ts),
            "mean": 100.0 * sum(rets) / len(ts),
            "med": 100.0 * med(rets),
            "pf": (gp / gl) if gl > 1e-12 else (99.0 if gp > 0 else 0.0),
            "eq": eq,
            "dd": 100.0 * dd,
            "bars": mean(bars) if bars else float("nan"),
            "why": dict(why),
        }
    pre = [t for t in trades if t["t"] < SPLIT]
    post = [t for t in trades if t["t"] >= SPLIT]
    return {"all": pack(trades), "train": pack(pre), "hold": pack(post)}


def fmt_pack(p):
    if not p or not p.get("n"):
        return "n=0"
    return (
        f"n={p['n']:5d} wr={p['wr']:5.1f}% mean={p['mean']:+7.3f}% med={p['med']:+7.3f}% "
        f"pf={p['pf']:5.2f} eq={p['eq']:6.2f} dd={p['dd']:6.1f}% bars={p.get('bars', float('nan')):5.1f}"
    )


def fmt_fwd(s):
    return (
        f"nH={s['n_hold']:4d} hold={100 * s['mean_hold']:+6.3f}% wr={s['wr_hold']:5.1f}% "
        f"med={100 * s['med_hold']:+6.3f}% mae={100 * s['mae_hold']:+6.3f}% mfe={100 * s['mfe_hold']:+6.3f}% "
        f"heldLow={s['held_hold']:5.1f}%  train={100 * s['mean_train']:+6.3f}% wrT={s['wr_train']:5.1f}% nT={s['n_train']}"
    )


def score_cfg(s):
    """Higher is better. Require same-sign train/hold and enough hold n."""
    if s["n_hold"] < 30 or s["n_train"] < 30:
        return -1e9
    if not (isnum(s["mean_hold"]) and isnum(s["mean_train"])):
        return -1e9
    if s["mean_train"] < 0 or s["mean_hold"] < 0:
        return -1e9
    # reward hold mean, hold winrate, held-low rate; light n bonus
    return (
        100.0 * s["mean_hold"]
        + 0.04 * (s["wr_hold"] - 50)
        + 0.02 * (s["held_hold"] - 50)
        + 0.15 * math.log(s["n_hold"])
        + 40.0 * min(s["mean_train"], s["mean_hold"])  # stability
    )


def _build_one(args):
    db, sym, interval = args
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    cs = load_k(conn, sym, interval)
    conn.close()
    print(f"  load {sym} {interval} bars={len(cs)}", flush=True)
    if len(cs) < 400:
        return interval, sym, None
    score, tide, energy, tape = tz.tide_series(cs)
    emas = {p: ema_of(score, p) for p in sorted(set(OUT_EMA + IN_EMA + (0,)))}
    return interval, sym, {
        "cs": cs,
        "score": score,
        "tide": tide,
        "energy": energy,
        "tape": tape,
        "emas": emas,
    }


def load_universe(conn):
    from multiprocessing import Pool, cpu_count
    jobs = [(str(DB), sym, interval) for interval in INTERVALS for sym in SYMBOLS]
    uni = {interval: {} for interval in INTERVALS}
    nworkers = min(6, cpu_count() or 1, len(jobs))
    print(f"feature workers={nworkers} jobs={len(jobs)}", flush=True)
    with Pool(nworkers) as pool:
        for interval, sym, bundle in pool.imap_unordered(_build_one, jobs):
            if bundle is None:
                continue
            uni[interval][sym] = bundle
            print(f"  ready {sym} {interval}", flush=True)
    return uni


def collect_events(bundle, cfg, kind="div"):
    cs = bundle["cs"]
    ema = bundle["emas"][cfg["emaPeriod"]]
    if kind == "div":
        return find_divs(
            cs, ema, cfg["confirmBars"], cfg["belowScore"],
            min_gap=cfg.get("minGap", 0),
            ema_sep=cfg.get("emaSep", 0.0),
            price_ll_pct=cfg.get("priceLlPct", 0.0),
        )
    if kind == "absorb":
        return find_absorb(cs, ema, cfg["confirmBars"])
    return []


def collect_exits(bundle, spec):
    """spec: {mode, emaPeriod, confirmBars, aboveScore}"""
    cs = bundle["cs"]
    mode = spec["mode"]
    n = spec["confirmBars"]
    if mode == "pivot_high":
        return find_pivot_highs(cs, n)
    ema = bundle["emas"][spec["emaPeriod"]]
    if mode == "bear_div":
        return find_bear_divs(cs, ema, n, spec["aboveScore"])
    if mode == "ema_peak":
        times = [c["t"] for c in cs]
        return find_ema_peaks(ema, times, n, spec["aboveScore"])
    if mode == "zero_down":
        score = bundle["score"]
        out = []
        for i in range(1, len(score)):
            if isnum(score[i]) and isnum(score[i - 1]) and score[i - 1] > 0 >= score[i]:
                out.append({"kind": "zero_down", "confirm_i": i})
        return out
    return []


def sweep_bottoms(uni, lines):
    results = {}  # interval -> list of {cfg, mid_stats, by_h}
    for interval in INTERVALS:
        horizons = HORIZONS[interval]
        mid_tag = horizons[1][1]
        rows = []
        grid = []
        for ema, n, below in itertools.product(OUT_EMA, OUT_N, OUT_BELOW):
            grid.append(dict(emaPeriod=ema, confirmBars=n, belowScore=below, minGap=0, emaSep=0.0, priceLlPct=0.0))
        grid.append(dict(DEFAULT_OUT))
        # unique
        seen = set()
        uniq = []
        for g in grid:
            k = cfg_key(g)
            if k in seen:
                continue
            seen.add(k)
            uniq.append(g)

        print(f"\nBOTTOM SWEEP {interval} configs={len(uniq)}", flush=True)
        for cfg in uniq:
            pooled = {tag: {"all": [], "train": [], "hold": [], "mae_hold": [], "mfe_hold": [], "held_hold": []} for _, tag in horizons}
            n_ev = 0
            for sym, bundle in uni[interval].items():
                evs = collect_events(bundle, cfg, "div")
                n_ev += len(evs)
                packed = pack_fwd(evs, bundle["cs"], horizons)
                for _, tag in horizons:
                    for bucket in pooled[tag]:
                        pooled[tag][bucket].extend(packed[tag][bucket])
            mid = summarize_fwd(pooled[mid_tag])
            by_h = {tag: summarize_fwd(pooled[tag]) for _, tag in horizons}
            rows.append({"cfg": cfg, "key": cfg_key(cfg), "mid": mid, "by_h": by_h, "n_ev": n_ev})
            print(f"  {cfg_key(cfg):40} n={n_ev:4d} {fmt_fwd(mid)}", flush=True)

        rows.sort(key=lambda r: score_cfg(r["mid"]), reverse=True)
        results[interval] = rows

        lines.append(f"\n======== {interval} TIDE-OUT DIV (bottom) @ {mid_tag} ========")
        lines.append("event = second zigzag low confirmed N bars later. next-open fill. no stop/fee here.")
        lines.append(f"default {cfg_key(DEFAULT_OUT)}")
        # default row
        drow = next((r for r in rows if r["key"] == cfg_key(DEFAULT_OUT)), None)
        if drow:
            lines.append("DEFAULT  " + fmt_fwd(drow["mid"]))
        lines.append("\nTop 12 by hold-stable score:")
        for r in rows[:12]:
            lines.append(f"  {r['key']:40} {fmt_fwd(r['mid'])}")
        # also show best by hold mean among n_hold>=50
        by_mean = [r for r in rows if r["mid"]["n_hold"] >= 50]
        by_mean.sort(key=lambda r: r["mid"]["mean_hold"], reverse=True)
        lines.append("\nTop 8 by hold mean (n_hold>=50):")
        for r in by_mean[:8]:
            lines.append(f"  {r['key']:40} {fmt_fwd(r['mid'])}")
        by_held = [r for r in rows if r["mid"]["n_hold"] >= 40]
        by_held.sort(key=lambda r: r["mid"]["held_hold"], reverse=True)
        lines.append("\nTop 8 by held-the-low rate (n_hold>=40):")
        for r in by_held[:8]:
            lines.append(f"  {r['key']:40} {fmt_fwd(r['mid'])}")

    return results


def refine_filters(uni, bottom_rows, lines):
    """Re-enable minGap / emaSep / priceLlPct on the best few configs per TF."""
    refined = {}
    for interval in INTERVALS:
        horizons = HORIZONS[interval]
        mid_tag = horizons[1][1]
        seeds = [r["cfg"] for r in bottom_rows[interval][:6]]
        # always include default
        seeds.append(dict(DEFAULT_OUT))
        rows = []
        seen = set()
        print(f"\nFILTER REFINE {interval}", flush=True)
        for seed in seeds:
            for gap, sep, ll in itertools.product(FILT_GAP, FILT_SEP, FILT_LL):
                cfg = dict(seed)
                cfg["minGap"] = gap
                cfg["emaSep"] = sep
                cfg["priceLlPct"] = ll
                k = cfg_key(cfg)
                if k in seen:
                    continue
                seen.add(k)
                pooled = {tag: {"all": [], "train": [], "hold": [], "mae_hold": [], "mfe_hold": [], "held_hold": []} for _, tag in horizons}
                n_ev = 0
                for bundle in uni[interval].values():
                    evs = collect_events(bundle, cfg, "div")
                    n_ev += len(evs)
                    packed = pack_fwd(evs, bundle["cs"], horizons)
                    for _, tag in horizons:
                        for bucket in pooled[tag]:
                            pooled[tag][bucket].extend(packed[tag][bucket])
                mid = summarize_fwd(pooled[mid_tag])
                rows.append({"cfg": cfg, "key": k, "mid": mid, "n_ev": n_ev})
        rows.sort(key=lambda r: score_cfg(r["mid"]), reverse=True)
        refined[interval] = rows
        lines.append(f"\n======== {interval} FILTERS (minGap / emaSep / priceLlPct) @ {mid_tag} ========")
        for r in rows[:10]:
            lines.append(f"  {r['key']:55} {fmt_fwd(r['mid'])}")
    return refined


def pair_out_in(uni, out_cfgs, lines):
    """Trade: tide-out long, flatten on tide-in. Compare exit modes."""
    books = {}
    for interval in INTERVALS:
        horizons = HORIZONS[interval]
        mid_h = horizons[1][0]
        cfgs = out_cfgs[interval]
        in_specs = [{"mode": "zero_down", "emaPeriod": 8, "confirmBars": 5, "aboveScore": 0, "label": "zero_down"}]
        in_specs.append({"mode": "time", "emaPeriod": 8, "confirmBars": 5, "aboveScore": 0, "label": "time_only"})
        for n in IN_N:
            in_specs.append({"mode": "pivot_high", "emaPeriod": 8, "confirmBars": n, "aboveScore": 0, "label": f"pivotH_n{n}"})
        for ema, n, above in itertools.product(IN_EMA, IN_N, IN_ABOVE):
            in_specs.append({
                "mode": "bear_div", "emaPeriod": ema, "confirmBars": n, "aboveScore": above,
                "label": f"bear_ema{ema}_n{n}_ab{above}",
            })
        for ema, n, above in itertools.product((8, 13), (5, 8), (0, 10)):
            in_specs.append({
                "mode": "ema_peak", "emaPeriod": ema, "confirmBars": n, "aboveScore": above,
                "label": f"emaPeak_ema{ema}_n{n}_ab{above}",
            })

        print(f"\nOUT×IN {interval} out={len(cfgs)} in={len(in_specs)}", flush=True)
        interval_rows = []
        for ocfg in cfgs:
            okey = cfg_key(ocfg)
            # precompute entries per symbol
            entries = {}
            for sym, bundle in uni[interval].items():
                entries[sym] = [e["confirm_i"] for e in collect_events(bundle, ocfg, "div")]
            for spec in in_specs:
                all_tr = []
                for sym, bundle in uni[interval].items():
                    cs = bundle["cs"]
                    if spec["mode"] == "time":
                        ex = []
                    else:
                        ex = [e["confirm_i"] for e in collect_exits(bundle, spec)]
                    tr = simulate_longs(cs, entries[sym], ex, interval, use_stop=True, use_2r=False)
                    all_tr.extend(tr)
                st = book_stats(all_tr)
                interval_rows.append({
                    "out": okey,
                    "inn": spec["label"],
                    "mode": spec["mode"],
                    "stats": st,
                })
                h = st.get("hold") or {}
                if h.get("n"):
                    print(f"  {okey[:28]:28} × {spec['label']:28} HOLD {fmt_pack(h)}", flush=True)
        interval_rows.sort(
            key=lambda r: (
                (r["stats"].get("hold") or {}).get("mean", -9),
                (r["stats"].get("hold") or {}).get("pf", 0),
            ),
            reverse=True,
        )
        books[interval] = interval_rows

        lines.append(f"\n======== {interval} TIDE-OUT → TIDE-IN TRADES ========")
        lines.append(f"fill next open, stop {STOP_PCT:.0%}, max hold {MAX_HOLD[interval]} bars, fee {FEE}/side, no shorting")
        lines.append("Top 15 HOLD mean:")
        shown = 0
        for r in interval_rows:
            h = r["stats"].get("hold") or {}
            t = r["stats"].get("train") or {}
            if not h.get("n") or h["n"] < 20:
                continue
            lines.append(f"  OUT {r['out']}")
            lines.append(f"    IN  {r['inn']:28} HOLD {fmt_pack(h)}")
            lines.append(f"    {'':32}TRAIN {fmt_pack(t)}  why={h.get('why')}")
            shown += 1
            if shown >= 15:
                break

        # per-mode best
        lines.append("\nBest HOLD per exit mode (n>=20):")
        for mode in ("bear_div", "pivot_high", "ema_peak", "zero_down", "time"):
            cand = [
                r for r in interval_rows
                if r["mode"] == mode and (r["stats"].get("hold") or {}).get("n", 0) >= 20
            ]
            if not cand:
                continue
            cand.sort(key=lambda r: (r["stats"]["hold"]["mean"], r["stats"]["hold"]["pf"]), reverse=True)
            r = cand[0]
            lines.append(f"  {mode:12} OUT {r['out']} IN {r['inn']}")
            lines.append(f"             HOLD {fmt_pack(r['stats']['hold'])}")
            lines.append(f"             TRAIN {fmt_pack(r['stats']['train'])}")

        # default out × a few ins
        lines.append("\nDefault OUT (ema8 n5 below-10) vs exits:")
        for r in interval_rows:
            if r["out"] != cfg_key(DEFAULT_OUT):
                continue
            if r["inn"] in ("zero_down", "time_only", "pivotH_n3", "pivotH_n5", "pivotH_n8",
                            "bear_ema8_n5_ab10", "bear_ema8_n3_ab0", "emaPeak_ema8_n5_ab10"):
                h = r["stats"].get("hold") or {}
                t = r["stats"].get("train") or {}
                lines.append(f"  IN {r['inn']:28} HOLD {fmt_pack(h)}")
                lines.append(f"  {'':32}TRAIN {fmt_pack(t)}")

    return books


def pick_out_cfgs(bottom_rows, refined):
    """A handful of OUT configs per TF for the pairing stage."""
    picked = {}
    for interval in INTERVALS:
        chosen = []
        seen = set()
        def add(cfg):
            k = cfg_key(cfg)
            if k in seen:
                return
            seen.add(k)
            chosen.append(cfg)
        add(dict(DEFAULT_OUT))
        for r in bottom_rows[interval][:4]:
            add(r["cfg"])
        # best filtered
        for r in refined[interval][:3]:
            add(r["cfg"])
        # a looser and a stricter typical
        add(dict(emaPeriod=5, confirmBars=8, belowScore=-10, minGap=0, emaSep=0.0, priceLlPct=0.0))
        add(dict(emaPeriod=8, confirmBars=13, belowScore=-20, minGap=0, emaSep=0.0, priceLlPct=0.0))
        picked[interval] = chosen
    return picked


def coin_breakdown(uni, cfg, interval, lines):
    horizons = HORIZONS[interval]
    mid_tag = horizons[1][1]
    lines.append(f"\n-- {interval} coin split  {cfg_key(cfg)} @ {mid_tag} --")
    for sym, bundle in uni[interval].items():
        evs = collect_events(bundle, cfg, "div")
        packed = pack_fwd(evs, bundle["cs"], horizons)
        s = summarize_fwd(packed[mid_tag])
        lines.append(f"  {sym:10} {fmt_fwd(s)}")


def absorb_baseline(uni, lines):
    lines.append("\n======== ABSORB baseline (live zigzag absorb, default N/EMA) ========")
    cfg = dict(DEFAULT_OUT)
    for interval in INTERVALS:
        horizons = HORIZONS[interval]
        mid_tag = horizons[1][1]
        pooled = {tag: {"all": [], "train": [], "hold": [], "mae_hold": [], "mfe_hold": [], "held_hold": []} for _, tag in horizons}
        for bundle in uni[interval].values():
            evs = collect_events(bundle, cfg, "absorb")
            packed = pack_fwd(evs, bundle["cs"], horizons)
            for _, tag in horizons:
                for bucket in pooled[tag]:
                    pooled[tag][bucket].extend(packed[tag][bucket])
        s = summarize_fwd(pooled[mid_tag])
        lines.append(f"  {interval} absorb {fmt_fwd(s)}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if not DB.exists():
        raise SystemExit(f"no db at {DB} — run collect_klines_only.py first")
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    print("loading universe + tide series...", flush=True)
    uni = load_universe(conn)
    conn.close()

    lines = [
        "TIDE OUT / TIDE IN BACKTEST",
        "Live detector: zigzag N on price wicks + Tide EMA, bull DIV = price LL vs EMA HL.",
        "Causal confirm = second pivot + N. Fill next open.",
        f"Coins {','.join(SYMBOLS)}  split {datetime.fromtimestamp(SPLIT, tz=timezone.utc).date()}",
        "Tide IN is an exit after a long, never a short.",
        "",
        "Live adjustable params (Tide prints modal + stored extras):",
        "  emaPeriod (Hist EMA)     default 8   pane + zigzag on this EMA",
        "  confirmBars (Zigzag N)   default 5   N bars either side, price and EMA",
        "  belowScore               default -10 both EMA troughs must be under this (0 = off)",
        "  keep                     default 8   display only, not in this scan",
        "  minGap / emaSep / priceLlPct  stored, currently unused in live findTideDivZones",
        "  showDiv / showAbsorb / colors  display",
        "",
    ]

    absorb_baseline(uni, lines)
    bottom = sweep_bottoms(uni, lines)
    refined = refine_filters(uni, bottom, lines)

    # coin split on default + best per TF
    for interval in INTERVALS:
        coin_breakdown(uni, DEFAULT_OUT, interval, lines)
        if bottom[interval]:
            coin_breakdown(uni, bottom[interval][0]["cfg"], interval, lines)

    out_cfgs = pick_out_cfgs(bottom, refined)
    books = pair_out_in(uni, out_cfgs, lines)

    # compact recommendation
    lines.append("\n======== RECOMMENDATIONS ========")
    for interval in INTERVALS:
        mid_tag = HORIZONS[interval][1][1]
        best = bottom[interval][0] if bottom[interval] else None
        lines.append(f"\n{interval} bottom (tide out) @ {mid_tag}:")
        if best:
            lines.append(f"  best stable: {best['key']}")
            lines.append(f"  {fmt_fwd(best['mid'])}")
        if refined[interval]:
            lines.append(f"  best with filters: {refined[interval][0]['key']}")
            lines.append(f"  {fmt_fwd(refined[interval][0]['mid'])}")
        # best paired trade with train also green
        good = []
        for r in books[interval]:
            h = r["stats"].get("hold") or {}
            t = r["stats"].get("train") or {}
            if h.get("n", 0) >= 20 and t.get("n", 0) >= 20 and h.get("mean", -1) > 0 and t.get("mean", -1) > 0:
                good.append(r)
        good.sort(key=lambda r: r["stats"]["hold"]["mean"], reverse=True)
        lines.append("  best tide-out→tide-in (train+hold mean>0, nH>=20):")
        for r in good[:5]:
            lines.append(f"    OUT {r['out']}  IN {r['inn']}")
            lines.append(f"      HOLD {fmt_pack(r['stats']['hold'])}")
            lines.append(f"      TRAIN {fmt_pack(r['stats']['train'])}")

    text = "\n".join(lines) + "\n"
    outp = OUT / "tide_out_in_backtest.txt"
    outp.write_text(text)
    docs = Path("/home/droid/Crypto/docs/tide_out_in_backtest.txt")
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
