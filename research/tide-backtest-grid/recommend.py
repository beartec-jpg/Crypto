#!/usr/bin/env python3
"""Head-to-head of the repo preset against small, explainable changes to it (not grid-picked): trend filter, cooldown, Pull, and a
robust-IS-selected alternative. Reports IS/OOS, per-year, per-symbol OOS, stop-rate, cost stress, plus a 'repeat stop-outs' metric
(consecutive stopped trades on the same symbol within 24 bars of the previous exit = Scott's 'enters candle after candle and stops out').
  python3 recommend.py --tf 4h
"""
import argparse, os, sys, csv
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import engine as E, grid as G

OOS0 = 1704067200  # 2024-01-01 UTC, seconds (matches the data files)

def cands(tf):
    P = dict(G.PRESET[tf]); out = {"preset (repo default)": P}
    def add(name, **kw): c = dict(P); c.update(kw); out[name] = c
    for L, n in ((34, 16), (55, 16), (89, 16), (144, 16), (55, 8)): add(f"+TS{L}/{n} (tide-EMA{L} rising over {n} bars)", trend_kind="TS", trend_L=L, trend_n=n)
    for cd in (6, 24): add(f"+cooldown {cd} bars", cd=cd)
    add("+rearm0 (one entry per swing)", rearm=0)
    add("+RSI+ only (Tide out +)", rsip=1)
    add("+TP100/10 (block entry in price downtrend)", trend_kind="TP", trend_L=100, trend_n=10)
    add("+guards (peak after entry, hold 3)", x_after=1, x_hold=3)
    for arm, tr in ((0.01, None), (0.02, None), (0.03, None), (0.01, 0.01), (0.02, 0.015), (0.03, 0.02)):
        add(f"+Protect: at +{100*arm:.0f}% stop->breakeven" + (f", trail {100*tr:.1f}% below high" if tr else ""), prot_arm=arm, prot_trail=tr)
    pulls = [("peak X20 Y25 n6 ps8", dict(pull_kind="peak", pull_mode="exit", pull_X=20, pull_Y=25, pull_n=6, pull_ps=8)),
             ("peak X20 Y35 n6 ps3", dict(pull_kind="peak", pull_mode="exit", pull_X=20, pull_Y=35, pull_n=6, pull_ps=3)),
             ("peak X40 Y35 n6 ps3", dict(pull_kind="peak", pull_mode="exit", pull_X=40, pull_Y=35, pull_n=6, pull_ps=3)),
             ("peak X30 Y20 n4 ps3", dict(pull_kind="peak", pull_mode="exit", pull_X=30, pull_Y=20, pull_n=4, pull_ps=3)),
             ("peak-be X40 Y35 n6 ps3", dict(pull_kind="peak", pull_mode="be", pull_X=40, pull_Y=35, pull_n=6, pull_ps=3)),
             ("cross X30 <10 ps3", dict(pull_kind="cross", pull_mode="exit", pull_X=30, pull_Z=10, pull_ps=3)),
             ("xema X40 3<13", dict(pull_kind="xema", pull_mode="exit", pull_X=40, pull_pf=3, pull_pslow=13))]
    for nm, kw in pulls: add(f"+Pull {nm}", **kw)
    for L in (55, 89):
        add(f"+TS{L}/16 +Pull peak X20 Y25 n6 ps8", trend_kind="TS", trend_L=L, trend_n=16, **pulls[0][1])
    if tf == "4h":
        R = dict(e_ema=5, e_n=21, e_below=-40, stop_kind="atr", stop_val=1.5, x_ema=3, x_n=8, x_min=20, x_after=1, x_hold=0)
        add("ALT robust-IS: ema5 N21 <-40 atr1.5 / Tide in ema3 N8 min20 after1", **R)
        add("ALT +cd24 +TS55/16", cd=24, trend_kind="TS", trend_L=55, trend_n=16, **R)
        add("ALT +cd24 +TS55/16 +Pull peak X20 Y25 n6 ps8", cd=24, trend_kind="TS", trend_L=55, trend_n=16, **pulls[0][1], **R)
        # neighbours of the alt entry (is the plateau wide?)
        for e, n, b in ((3, 21, -40), (8, 21, -40), (5, 13, -40), (5, 34, -40), (5, 21, -30), (5, 21, -50)):
            R2 = dict(R); R2.update(e_ema=e, e_n=n, e_below=b)
            add(f"ALT-neighbour ema{e} N{n} <{b} (+cd24 +TS55/16)", cd=24, trend_kind="TS", trend_L=55, trend_n=16, **R2)
    else:
        add("ALT: ema21 N8 <-40 atr1.0 stop", stop_kind="atr", stop_val=1.0)
        add("ALT: preset + 2% stop", stop_kind="pct", stop_val=0.02)
        add("ALT: ema21 N8 <-40 + Tide-in ema8 N5", x_n=5)
        add("ALT: ema21 N8 <-40 + Tide-in ema8 N13", x_n=13)
        add("ALT: ema13 N8 <-40", e_ema=13); add("ALT: ema34 N8 <-40", e_ema=34)
        add("ALT: ema21 N5 <-40", e_n=5); add("ALT: ema21 N13 <-40", e_n=13)
        add("ALT: ema21 N8 <-30", e_below=-30); add("ALT: ema21 N8 <-50", e_below=-50)
    return out

def repeat_stops(S_all, cfg, tf):
    """Count stop-outs that follow a previous stop-out on the same symbol within 24 bars (OOS)."""
    n_rep = 0; n_stop = 0
    for name, S in S_all.items():
        tr = E.simulate(S, cfg); prev_stop_exit = None
        for x in tr:                                  # x = (confirm_i, fill_i, exit_i, ret, why_code)
            if S.t[x[0]] < OOS0: prev_stop_exit = None; continue
            stopped = (x[4] in (1, 4))
            if stopped:
                n_stop += 1
                if prev_stop_exit is not None and x[1] - prev_stop_exit <= 24: n_rep += 1
            prev_stop_exit = x[2] if stopped else None
    return n_rep, n_stop

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tf", required=True); a = ap.parse_args()
    tf = a.tf; G.SYMS = G.load(tf); S_all = G.SYMS
    rows = []; sym_rows = []
    for name, cfg in cands(tf).items():
        cfg = dict(cfg); cfg["tf"] = tf
        row = E.evaluate(S_all, cfg)
        r = dict(candidate=name)
        for k in ("is_n", "is_avg", "is_pf", "oos_n", "oos_wr", "oos_avg", "oos_pf", "oos_tot", "oos_dd", "oos_stop"): r[k] = row[k]
        for y in range(2019, 2027):
            n = row[f"y{y}_n"]; r[f"y{y}_avg"] = round(100 * row[f"y{y}_sum"] / n, 2) if n else None; r[f"y{y}_n"] = n
        hi = E.evaluate(S_all, cfg, cost=0.0020, stop_extra=0.0015); r["oos_avg_stress"] = hi["oos_avg"]; r["oos_pf_stress"] = hi["oos_pf"]
        r["oos_repeat_stops"], r["oos_stops"] = repeat_stops(S_all, cfg, tf)
        rows.append(r)
        for sn, S in S_all.items():
            q = E.evaluate({sn: S}, cfg); sym_rows.append(dict(candidate=name, symbol=sn, oos_n=q["oos_n"], oos_avg=q["oos_avg"], oos_pf=q["oos_pf"], oos_stop=q["oos_stop"]))
        print(f"{name:70s} IS n{r['is_n']:4d} {r['is_avg']:+.2f}% pf{r['is_pf']:.2f} | OOS n{r['oos_n']:4d} wr{r['oos_wr']:.0f}% {r['oos_avg']:+.2f}% pf{r['oos_pf']:.2f} dd{r['oos_dd']:.0f} stop{r['oos_stop']:.0f}% rep{r['oos_repeat_stops']}/{r['oos_stops']} stress{r['oos_avg_stress']:+.2f}", flush=True)
    os.makedirs(G.OUT, exist_ok=True)
    for fn, rr in ((f"recommend_{tf}.csv", rows), (f"recommend_by_symbol_{tf}.csv", sym_rows)):
        with open(os.path.join(G.OUT, fn), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rr[0].keys())); w.writeheader(); w.writerows(rr)
    # per-symbol positive count for the preset
if __name__ == "__main__": main()
