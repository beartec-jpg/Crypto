#!/usr/bin/env python3
"""Staged Tide Zone backtest grid (coarse -> refine; every evaluated config is logged).

  python3 grid.py --tf 1h --stage 1 --workers 20 [--limit N]
Stages (selection between stages uses IN-SAMPLE (<2024) t-stat only; OOS is never used to choose):
  1  entry (EMA, pivot N, below-score) x stop            (exit = repo preset)
  2  exit family on the top stage-1 bases                (Tide in grid incl. #596 guards, zero-cross, EMA cross, +distribution)
  3  entry filters on the top stage-2 bases              (cooldown / one-per-swing re-arm / trend EMA / RSI+ / absorption confirm)
  4  Pull exit on the top stage-3 bases
  5  alternative entry families (slope, cross, absorb) x stop x exit, then Pull on the best
  6  feature-effect panel: Pull / trend / cooldown / re-arm applied to RANDOM stage-1 bases (unbiased paired test)
"""
import argparse, csv, gzip, itertools, os, pickle, random, sys, time
import numpy as np
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as E

SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"]
OUT = os.path.join(HERE, "results")
MIN_N = {"1h": 150, "4h": 70}
MINY = {"1h": 8, "4h": 5}          # minimum trades in a year for that year to count in the consistency score       # minimum in-sample trades to be eligible for selection
PRESET = {
    "4h": dict(ent="div", e_ema=8, e_n=3, e_below=-20, stop_kind="atr", stop_val=0.5, x_kind="tidein", x_ema=8, x_n=5, x_min=0, x_after=0, x_hold=0),
    "1h": dict(ent="div", e_ema=21, e_n=8, e_below=-40, stop_kind="pct", stop_val=0.005, x_kind="tidein", x_ema=8, x_n=8, x_min=0, x_after=0, x_hold=0),
}
SYMS = {}

def load(tf):
    d = os.path.join(HERE, "data"); out = {}
    for s in SYMBOLS:
        z = np.load(os.path.join(d, f"{s}_{tf}.npz"))
        out[s] = E.Sym(s, tf, {k: z[k] for k in "tohlcv"})
    return out

def rscore_years(r, years, min_trades):
    """Consistency score over a set of years: mean of yearly avg %/trade minus half their std (years with < min_trades are ignored; need >=3 years)."""
    v = [100 * r[f"y{y}_sum"] / r[f"y{y}_n"] for y in years if r[f"y{y}_n"] >= min_trades]
    if len(v) < 3: return -99.0
    v = np.array(v)
    return float(v.mean() - 0.5 * v.std())

def work(cfg):
    row = E.evaluate(SYMS, cfg)
    r = dict(cfg); r.update(row)
    r["is_rs"] = rscore_years(r, range(2019, 2024), MINY[cfg.get("tf", "1h")])
    return r

def run(cfgs, tf, stage, workers, tag=None):
    global SYMS
    name = tag or f"{tf}_stage{stage}"
    t0 = time.time()
    # group by entry so each worker reuses cached fractals
    cfgs = sorted(cfgs, key=lambda c: (str(c.get("ent")), str(c.get("e_ema")), str(c.get("e_n")), str(c.get("e_below")), str(c.get("a1")), str(c.get("a2")), str(c.get("a3")), str(c.get("a4"))))
    for c in cfgs: c["tf"] = tf; c["stage"] = stage
    rows = []
    with Pool(workers) as p:
        for i, r in enumerate(p.imap(work, cfgs, chunksize=16)):
            rows.append(r)
            if (i + 1) % 2000 == 0: print(f"  {name}: {i+1}/{len(cfgs)} {time.time()-t0:.0f}s", flush=True)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + ".pkl"), "wb") as f: pickle.dump(rows, f)
    write_csv(rows, os.path.join(OUT, name + ".csv.gz"))
    print(f"{name}: {len(rows)} configs in {time.time()-t0:.0f}s", flush=True)
    return rows

CORE = ["is_n", "is_wr", "is_avg", "is_pf", "is_tot", "is_dd", "is_ddw", "is_stop", "is_t", "is_rs", "is_bars",
        "oos_n", "oos_wr", "oos_avg", "oos_pf", "oos_tot", "oos_dd", "oos_ddw", "oos_stop", "oos_t", "oos_bars", "oos_sympos", "oos_symn"]
PARAMS = ["tf", "stage", "ent", "e_ema", "e_n", "e_below", "a1", "a2", "a3", "a4", "stop_kind", "stop_val",
          "x_kind", "x_ema", "x_n", "x_min", "x_after", "x_hold", "x_f", "x_s", "dist", "d_near", "d_tape", "d_min",
          "pull_kind", "pull_mode", "pull_X", "pull_Y", "pull_n", "pull_ps", "pull_Z", "pull_pf", "pull_pslow",
          "cd", "rearm", "trend_kind", "trend_L", "trend_n", "rsip", "absc", "maxhold", "base"]

def write_csv(rows, path):
    ycols = [k for k in rows[0] if k.startswith("y") and k[1:5].isdigit()] if rows else []
    cols = PARAMS + CORE + ycols
    with gzip.open(path, "wt", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows:
            w.writerow([("%.4g" % r[c]) if isinstance(r.get(c), float) else r.get(c, "") if r.get(c) is not None else "" for c in cols])

def eligible(rows, tf, key="is_rs"):
    return [r for r in rows if r["is_n"] >= MIN_N[tf] and r["is_avg"] > 0 and r["is_pf"] > 1.05]

def top_diverse(rows, tf, k, group_keys, per_group=2, key="is_rs"):
    out = []; cnt = {}
    for r in sorted(eligible(rows, tf), key=lambda r: -r[key]):
        g = tuple(r.get(x) for x in group_keys)
        if cnt.get(g, 0) >= per_group: continue
        cnt[g] = cnt.get(g, 0) + 1; out.append(r)
        if len(out) >= k: break
    return out

CFG_KEYS = [k for k in PARAMS if k not in ("tf", "stage")]
def base_of(r, drop=()):
    return {k: r[k] for k in CFG_KEYS if r.get(k) is not None and k not in drop}

def load_stage(tf, stage):
    with open(os.path.join(OUT, f"{tf}_stage{stage}.pkl"), "rb") as f: return pickle.load(f)

# ───────── generators ─────────
def gen1(tf):
    stops = [("atr", .5), ("atr", 1.0), ("atr", 1.5), ("pct", .005), ("pct", .01), ("pct", .02)]
    for p, n, b, (sk, sv) in itertools.product([3, 5, 8, 13, 21, 34, 55, 89], [2, 3, 4, 5, 8, 13, 21], [0, -10, -20, -30, -40, -50, -60], stops):
        c = dict(PRESET[tf]); c.update(e_ema=p, e_n=n, e_below=b, stop_kind=sk, stop_val=sv); yield c

def gen2(base):
    for xe, xn, xm, xa, xh in itertools.product([3, 5, 8, 13, 21], [2, 3, 5, 8, 13], [None, -20, 0, 20, 40], [0, 1], [0, 3, 6, 12]):
        c = dict(base); c.update(x_kind="tidein", x_ema=xe, x_n=xn, x_min=xm, x_after=xa, x_hold=xh); yield c
    c = dict(base); c.update(x_kind="zero"); yield c
    for f, s in itertools.product([3, 5, 8, 13], [13, 21, 34, 55, 89]):
        if f < s:
            c = dict(base); c.update(x_kind="xdown", x_f=f, x_s=s); yield c
    # distribution tell as an extra exit on top of the best-known Tide in (preset-like) exit
    for near, tape, mn in itertools.product([0.003, 0.006], [0, 1], [0, 30]):
        c = dict(base); c.update(dist=1, d_near=near, d_tape=tape, d_min=mn); yield c

def gen3(base):
    trends = [(None, None, None)] + [("TP", L, nb) for L in (50, 100, 200) for nb in (5, 10, 20)] + [("TS", L, nb) for L in (34, 55, 89, 144) for nb in (3, 8, 16)]
    for cd, ra, (tk, tL, tn), rsip, absc in itertools.product([0, 3, 6, 12, 24], [None, 0, 20, 40], trends, [0, 1], [0, 12, 36]):
        c = dict(base); c.update(cd=cd or None, rearm=ra, trend_kind=tk, trend_L=tL, trend_n=tn, rsip=rsip or None, absc=absc or None); yield c

def pull_variants(full=True):
    v = []
    if full:
        for X, Y, n, ps in itertools.product([10, 20, 30, 40, 50, 60], [8, 12, 16, 20, 25, 30, 40], [2, 3, 4, 6, 8, 12], [1, 3, 8]):
            v.append(dict(pull_kind="peak", pull_mode="exit", pull_X=X, pull_Y=Y, pull_n=n, pull_ps=ps))
        for X, Z, ps in itertools.product([20, 30, 40, 50, 60], [20, 10, 0, -10, -20], [3, 8]):
            if Z < X: v.append(dict(pull_kind="cross", pull_mode="exit", pull_X=X, pull_Z=Z, pull_ps=ps))
        for X, pf, sl in itertools.product([20, 30, 40, 50], [1, 3, 5], [8, 13, 21, 34]):
            if pf < sl: v.append(dict(pull_kind="xema", pull_mode="exit", pull_X=X, pull_pf=pf, pull_pslow=sl))
        for X, Y, n in itertools.product([20, 40], [12, 20, 30], [3, 6]):
            v.append(dict(pull_kind="peak", pull_mode="be", pull_X=X, pull_Y=Y, pull_n=n, pull_ps=3))
    else:
        for X, Y, n in itertools.product([20, 40], [10, 20, 35], [4, 8]):
            v.append(dict(pull_kind="peak", pull_mode="exit", pull_X=X, pull_Y=Y, pull_n=n, pull_ps=3))
        for X, Z in itertools.product([30, 50], [10, 0, -10]):
            v.append(dict(pull_kind="cross", pull_mode="exit", pull_X=X, pull_Z=Z, pull_ps=5))
        for X, sl in itertools.product([30, 50], [8, 13]):
            v.append(dict(pull_kind="xema", pull_mode="exit", pull_X=X, pull_pf=3, pull_pslow=sl))
        for Y in (20, 35):
            v.append(dict(pull_kind="peak", pull_mode="be", pull_X=40, pull_Y=Y, pull_n=6, pull_ps=3))
    return v

def gen_alt(tf):
    stops = [("atr", 1.0), ("pct", .01), ("pct", .02)]
    exits = [dict(x_kind="tidein", x_ema=8, x_n=5 if tf == "4h" else 8, x_min=0, x_after=0, x_hold=0), dict(x_kind="zero"), dict(x_kind="xdown", x_f=8, x_s=21)]
    ents = []
    for L, nb, bl, dr in itertools.product([13, 21, 34, 55, 89, 144], [3, 5, 10, 20], [0, -20], [0, 1]):
        ents.append(dict(ent="slope", a1=L, a2=nb, a3=bl, a4=dr))
    for f, s, bl, dr in itertools.product([3, 5, 8, 13, 21], [13, 21, 34, 55, 100], [0, -20, -40], [0, 1]):
        if f < s: ents.append(dict(ent="cross", a1=f, a2=s, a3=bl, a4=dr))
    for bl in (0, -20, -40): ents.append(dict(ent="absorb", a1=None, a2=None, a3=bl, a4=None))
    for en, (sk, sv), ex in itertools.product(ents, stops, exits):
        c = dict(en); c.update(stop_kind=sk, stop_val=sv); c.update(ex); yield c

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", required=True); ap.add_argument("--stage", required=True)
    ap.add_argument("--workers", type=int, default=16); ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--topk", type=int, default=0)
    a = ap.parse_args(); tf = a.tf
    global SYMS
    t0 = time.time(); SYMS = load(tf); print(f"loaded {tf} in {time.time()-t0:.0f}s", flush=True)
    st = a.stage
    if st == "1":
        cfgs = list(gen1(tf))
        run(cfgs[:a.limit] if a.limit else cfgs, tf, 1, a.workers)
    elif st == "2":
        rows = load_stage(tf, 1)
        bases = top_diverse(rows, tf, a.topk or 60, ["e_ema", "e_n", "e_below"], per_group=1)
        cfgs = []
        for b in bases:
            bb = base_of(b); bb["base"] = f"s1:{b.get('e_ema')}/{b.get('e_n')}/{b.get('e_below')}/{b.get('stop_kind')}{b.get('stop_val')}"
            for c in gen2(bb): cfgs.append(c)
        # always include the repo preset as a base
        pb = dict(PRESET[tf]); pb["base"] = "preset"
        cfgs += list(gen2(pb))
        run(cfgs[:a.limit] if a.limit else cfgs, tf, 2, a.workers)
    elif st == "3":
        rows = load_stage(tf, 2)
        bases = top_diverse(rows, tf, a.topk or 40, ["e_ema", "e_n", "e_below", "stop_kind", "stop_val"], per_group=2)
        cfgs = []
        for b in bases:
            bb = base_of(b); bb["base"] = f"s2:{b['e_ema']}/{b['e_n']}/{b['e_below']}/{b['stop_kind']}{b['stop_val']}/{b['x_kind']}{b.get('x_ema')}{b.get('x_n')}"
            cfgs += list(gen3(bb))
        run(cfgs[:a.limit] if a.limit else cfgs, tf, 3, a.workers)
    elif st == "4":
        rows = load_stage(tf, 3)
        bases = top_diverse(rows, tf, a.topk or 30, ["e_ema", "e_n", "e_below", "stop_kind", "stop_val", "x_kind", "x_ema", "x_n"], per_group=2)
        cfgs = []
        for i, b in enumerate(bases):
            bb = base_of(b); bb["base"] = f"s3:{i}"
            for pv in pull_variants(True):
                c = dict(bb); c.update(pv); cfgs.append(c)
            cfgs.append(dict(bb, base=f"s3:{i}"))   # the base itself (no pull) for pairing
        run(cfgs[:a.limit] if a.limit else cfgs, tf, 4, a.workers)
    elif st == "5":
        rows = run(list(gen_alt(tf)), tf, 5, a.workers)
        best = top_diverse(rows, tf, a.topk or 10, ["ent", "a1", "a2", "a3", "a4"], per_group=1)
        cfgs = []
        for i, b in enumerate(best):
            bb = base_of(b); bb["base"] = f"s5:{i}"
            for pv in pull_variants(False):
                c = dict(bb); c.update(pv); cfgs.append(c)
        if cfgs: run(cfgs, tf, "5b", a.workers)
    elif st == "6":
        rows = [r for r in load_stage(tf, 1) if r["is_n"] >= MIN_N[tf]]
        rnd = random.Random(7); rnd.shuffle(rows)
        cfgs = []
        trends = [("TP", L, nb) for L in (50, 100, 200) for nb in (10, 20)] + [("TS", L, nb) for L in (34, 55, 89) for nb in (8, 16)]
        for i, b in enumerate(rows[:150]):
            bb = base_of(b); bb["base"] = f"s6:{i}"
            cfgs.append(dict(bb))
            for pv in pull_variants(False):
                c = dict(bb); c.update(pv); cfgs.append(c)
            for tk, tL, tn in trends:
                c = dict(bb); c.update(trend_kind=tk, trend_L=tL, trend_n=tn); cfgs.append(c)
            for cd in (3, 6, 12, 24):
                c = dict(bb); c.update(cd=cd); cfgs.append(c)
            for ra in (0, 20, 40):
                c = dict(bb); c.update(rearm=ra); cfgs.append(c)
        run(cfgs[:a.limit] if a.limit else cfgs, tf, 6, a.workers)

if __name__ == "__main__":
    main()
