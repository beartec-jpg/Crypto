#!/usr/bin/env python3
"""
1h Tide Zone refine — causal, next-open fill.

Tests the user's read vs the printed ±40 zones:
  - enter at 0-cross vs +40
  - exit at 0-cross vs -40
  - absorption: score flips + while price is still falling
  - bounce: low tide + high energy

BTC/ETH/XRP/SOL/BNB/DOGE  1h  2019→now
Fee 4 bps/side. 2% stop (stop wins if SL and TP same bar). Hold 24 bars.
One position at a time.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DB = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "market.sqlite"
OUT = Path(os.environ.get("CRYPTO_DATA_DIR", "/home/falcon/crypto-data")) / "holistic"
FEE = 0.0004
STOP = 0.02
HAIR = 0.0015
HOLD = 24
HTF_SEC = 4 * 3600
SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT"]
SPLIT = int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp())


def isnum(x):
    return x is not None and x == x and not (isinstance(x, float) and math.isnan(x))


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


def atr(cs, p=14):
    tr = [cs[0]["h"] - cs[0]["l"]]
    for i in range(1, len(cs)):
        tr.append(max(cs[i]["h"] - cs[i]["l"], abs(cs[i]["h"] - cs[i - 1]["c"]), abs(cs[i]["l"] - cs[i - 1]["c"])))
    out = [float("nan")] * len(cs)
    s = sum(tr[:p]) / p
    out[p - 1] = s
    for i in range(p, len(cs)):
        s = (s * (p - 1) + tr[i]) / p
        out[i] = s
    return out


def bbw(closes, p=20):
    out = [float("nan")] * len(closes)
    for i in range(p - 1, len(closes)):
        w = closes[i - p + 1 : i + 1]
        m = sum(w) / p
        sd = math.sqrt(sum((x - m) ** 2 for x in w) / p)
        out[i] = (4 * sd) / m if m else 0.0
    return out


def rpct(xs, win):
    out = [float("nan")] * len(xs)
    for i, v in enumerate(xs):
        if not isnum(v):
            continue
        w = [x for x in xs[max(0, i - win + 1) : i + 1] if isnum(x)]
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


def tide_series(cs):
    n = len(cs)
    bar = cs[1]["t"] - cs[0]["t"]
    factor = max(1, round(HTF_SEC / bar))
    bucket = factor * bar
    htf = []
    cur = key = None
    for c in cs:
        k = (c["t"] // bucket) * bucket
        if cur is None or k != key:
            if cur:
                htf.append(cur)
            key = k
            cur = [c["t"], c["o"], c["h"], c["l"], c["c"]]
        else:
            cur[2] = max(cur[2], c["h"])
            cur[3] = min(cur[3], c["l"])
            cur[4] = c["c"]
            cur[0] = c["t"]
    if cur:
        htf.append(cur)
    hc = [x[4] for x in htf]
    hr, he = rsi(hc), ema(hc, 50)
    hrp = rpct(hr, 80)
    hd = [hc[i] / he[i] - 1 if he[i] else float("nan") for i in range(len(htf))]
    hdp = rpct(hd, 80)
    pack = [(htf[i][0], hrp[i], hdp[i]) for i in range(len(htf))]

    closes = [c["c"] for c in cs]
    a = atr(cs)
    ap = [a[i] / cs[i]["c"] if isnum(a[i]) and cs[i]["c"] else float("nan") for i in range(n)]
    eA, eB = rpct(ap, 200), rpct(bbw(closes), 200)
    signed = [0.0]
    for i in range(1, n):
        d = 0 if cs[i]["c"] == cs[i - 1]["c"] else (1 if cs[i]["c"] > cs[i - 1]["c"] else -1)
        signed.append(d * cs[i]["v"])
    slope = [float("nan")] * n
    for i in range(12, n):
        num = sum(signed[i - 11 : i + 1])
        den = sum(c["v"] for c in cs[i - 11 : i + 1])
        slope[i] = num / den if den else 0.0
    tape = rpct(slope, 100)

    score = [float("nan")] * n
    tide = [float("nan")] * n
    energy = [float("nan")] * n
    tap = [float("nan")] * n
    for i, c in enumerate(cs):
        h = last_le(pack, c["t"])
        if not h or not isnum(h[1]) or not isnum(h[2]):
            continue
        td = 0.6 * h[1] + 0.4 * h[2]
        en = 0.5 * eA[i] + 0.5 * eB[i] if isnum(eA[i]) and isnum(eB[i]) else float("nan")
        tp = tape[i]
        if not isnum(en) or not isnum(tp):
            continue
        raw = 0.55 * (2 * td - 1) + 0.35 * (2 * en - 1) * (1 - td) + 0.25 * (2 * tp - 1)
        score[i] = 100 * math.tanh(raw)
        tide[i] = td
        energy[i] = en
        tap[i] = tp
    return score, tide, energy, tap


def load_k(conn, sym):
    rows = conn.execute(
        "SELECT t,o,h,l,c,v FROM klines WHERE symbol=? AND interval='1h' ORDER BY t",
        (sym,),
    ).fetchall()
    return [{"t": t, "o": o, "h": h, "l": l, "c": c, "v": v} for t, o, h, l, c, v in rows]


def year_of(t):
    return datetime.fromtimestamp(t, tz=timezone.utc).year


def simulate(cs, long_sig, short_sig, exit_long, exit_short, use_2r=True):
    """Signals on bar i (close). Fill next open. Stop 2%. Optional 2R. Time HOLD."""
    trades = []
    pos = None  # (side, entry, stop, tp, ie)
    n = len(cs)
    pending = None
    for i in range(80, n):
        c = cs[i]
        if pending and pos is None:
            side, stop_px, sig_i = pending
            pending = None
            if i == sig_i + 1:
                entry = c["o"]
                if side == "long":
                    stop = entry * (1 - STOP)
                    gapped = c["o"] <= stop
                else:
                    stop = entry * (1 + STOP)
                    gapped = c["o"] >= stop
                if gapped:
                    ret = -STOP - 2 * FEE
                    trades.append({"t": c["t"], "year": year_of(c["t"]), "ret": ret, "why": "gap_sl", "side": side})
                else:
                    risk = abs(entry - stop)
                    tp = entry + 2 * risk if side == "long" else entry - 2 * risk
                    pos = (side, entry, stop, tp, i)
            # missed fill window — drop
        if pos is not None:
            side, entry, stop, tp, ie = pos
            if side == "long":
                hit_sl = c["l"] <= stop
                hit_tp = use_2r and c["h"] >= tp
            else:
                hit_sl = c["h"] >= stop
                hit_tp = use_2r and c["l"] <= tp
            px = why = None
            if hit_sl:
                px, why = stop, "sl"
            elif hit_tp:
                px, why = tp, "tp"
            elif (side == "long" and exit_long[i]) or (side == "short" and exit_short[i]):
                px, why = c["c"], "sig"
            elif i - ie >= HOLD:
                px, why = c["c"], "time"
            if px is not None:
                ret = (px / entry - 1) if side == "long" else (entry / px - 1)
                trades.append({"t": cs[ie]["t"], "year": year_of(cs[ie]["t"]), "ret": ret - 2 * FEE, "why": why, "side": side})
                pos = None
        if pos is None and pending is None:
            if long_sig[i]:
                pending = ("long", None, i)
            elif short_sig[i]:
                pending = ("short", None, i)
    return trades


def summarize(trades, label, split=SPLIT):
    if not trades:
        return {"book": label, "n": 0}
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
        return {
            "n": len(ts),
            "wr": 100 * len(wins) / len(ts),
            "mean": 100 * sum(rets) / len(ts),
            "pf": (gp / gl) if gl > 1e-12 else (99.0 if gp > 0 else 0.0),
            "eq": eq,
            "dd": 100 * dd,
            "why": dict(why),
        }
    pre = [t for t in trades if t["t"] < split]
    post = [t for t in trades if t["t"] >= split]
    by_year = defaultdict(list)
    for t in trades:
        by_year[t["year"]].append(t)
    years = {y: pack(by_year[y]) for y in sorted(by_year)}
    return {"book": label, "all": pack(trades), "train": pack(pre), "hold": pack(post), "years": years}


def fmt(p):
    if not p or not p.get("n"):
        return "n=0"
    return (
        f"n={p['n']:5d} wr={p['wr']:5.1f}% mean={p['mean']:+6.3f}% "
        f"pf={p['pf']:5.2f} eq={p['eq']:6.2f} dd={p['dd']:6.1f}%"
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    books = defaultdict(list)

    for sym in SYMBOLS:
        cs = load_k(conn, sym)
        print(f"features {sym} bars={len(cs)}", flush=True)
        score, tide, energy, tape = tide_series(cs)
        n = len(cs)
        z = [False] * n
        cross_up0 = [False] * n
        cross_dn0 = [False] * n
        cross_up40 = [False] * n
        cross_dn40 = [False] * n
        absorb = [False] * n
        bounce = [False] * n
        fade_green = [False] * n  # was >=40, now crossed below 0
        for i in range(1, n):
            s, p = score[i], score[i - 1]
            if not isnum(s) or not isnum(p):
                continue
            cross_up0[i] = p < 0 <= s
            cross_dn0[i] = p > 0 >= s
            cross_up40[i] = p < 40 <= s
            cross_dn40[i] = p > -40 >= s
            falling = cs[i]["c"] < cs[i - 1]["c"]
            if i >= 4:
                falling = falling and cs[i]["c"] < cs[i - 4]["c"]
            tape_up = isnum(tape[i]) and isnum(tape[i - 1]) and tape[i] > tape[i - 1]
            absorb[i] = cross_up0[i] and falling and tape_up
            bounce[i] = isnum(tide[i]) and isnum(energy[i]) and tide[i] < 0.45 and energy[i] > 0.65 and s > 15 and p <= 15
            fade_green[i] = False
        seen40 = False
        for i in range(1, n):
            s = score[i]
            if not isnum(s):
                continue
            if s >= 40:
                seen40 = True
            if seen40 and isnum(score[i - 1]) and score[i - 1] >= 0 > s:
                fade_green[i] = True
                seen40 = False
            if s < 0:
                seen40 = False
        stay_pos = [isnum(score[i]) and score[i] >= 0 for i in range(n)]
        stay_neg = [isnum(score[i]) and score[i] <= 0 for i in range(n)]
        in40 = [isnum(score[i]) and score[i] >= 40 for i in range(n)]
        in_m40 = [isnum(score[i]) and score[i] <= -40 for i in range(n)]

        variants = [
            ("L+40 / X-40", cross_up40, z, cross_dn40, z),
            ("L+40 / X0", cross_up40, z, cross_dn0, z),
            ("L0 / X0", cross_up0, z, cross_dn0, z),
            ("L0 / X-40", cross_up0, z, cross_dn40, z),
            ("absorb L0 / X0", absorb, z, cross_dn0, z),
            ("bounce / X0", bounce, z, cross_dn0, z),
            ("bounce / X-40", bounce, z, cross_dn40, z),
            ("2way 0/0", cross_up0, cross_dn0, cross_dn0, cross_up0),
            ("2way +40/-40", cross_up40, cross_dn40, cross_dn40, cross_up40),
            ("2way +40 enter / 0 exit", cross_up40, fade_green, cross_dn0, cross_up0),
            ("S fade-green@0 / cover@0", z, fade_green, z, cross_up0),
        ]

        for name, ls, ss, el, es in variants:
            tr = simulate(cs, ls, ss, el, es, use_2r=True)
            books[name].extend(tr)
            print(f"  {name:28} {sym} n={len(tr)}", flush=True)

    lines = ["TIDE ZONE 1h REFINE", f"fill=next open  stop={STOP:.0%}  hold={HOLD}  2R  fee={FEE}", f"holdout from 2024-01-01", ""]
    rows = []
    for name, tr in books.items():
        s = summarize(tr, name)
        rows.append(s)
        lines.append(f"== {name} ==")
        lines.append(f"  ALL   {fmt(s['all'])}")
        lines.append(f"  TRAIN {fmt(s['train'])}")
        lines.append(f"  HOLD  {fmt(s['hold'])}")
        ybits = []
        for y, p in s["years"].items():
            if p.get("n"):
                ybits.append(f"{y}:{p['pf']:.2f}/{p['n']}")
        lines.append("  years " + " ".join(ybits))
        if s["all"].get("why"):
            lines.append(f"  exits {s['all']['why']}")
        lines.append("")

    report = "\n".join(lines) + "\n"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "tide_zone_1h_refine.txt").write_text(report)
    (OUT / "tide_zone_1h_refine.json").write_text(json.dumps(rows, indent=2))
    print(report, flush=True)
    print("WROTE", OUT / "tide_zone_1h_refine.txt", flush=True)


if __name__ == "__main__":
    main()
