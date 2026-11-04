#!/usr/bin/env python3
"""Post-processing of the grid: OOS tables, paired feature effects, expanding walk-forward, cost sensitivity.
  python3 analyze.py --tf 1h   (writes results/*.csv and results/report_<tf>.md)"""
import argparse, csv, itertools, math, os, pickle, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import grid as G, engine as E

OUT = G.OUT
def stage_rows(tf, s):
    p = os.path.join(OUT, f"{tf}_stage{s}.pkl")
    if not os.path.exists(p): return []
    with open(p, "rb") as f: return pickle.load(f)

def desc(r):
    if r["ent"] == "div": e = f"TideOut ema{r['e_ema']} N{r['e_n']} <{r['e_below']}"
    else: e = f"{r['ent']}({r.get('a1')},{r.get('a2')},{r.get('a3')},{r.get('a4')})"
    s = f"stop {r['stop_kind']}{r['stop_val']}"
    xk = r.get("x_kind") or "tidein"
    if xk == "tidein": x = f"TideIn ema{r.get('x_ema')} N{r.get('x_n')} min{r.get('x_min')} after{r.get('x_after')} hold{r.get('x_hold')}"
    elif xk == "zero": x = "exit score<0"
    else: x = f"exit ema{r.get('x_f')}x{r.get('x_s')}"
    if r.get("dist"): x += f" +Distro(near{r.get('d_near')},tape{r.get('d_tape')},min{r.get('d_min')})"
    f = []
    if r.get("cd"): f.append(f"cd{r['cd']}")
    if r.get("rearm") is not None: f.append(f"rearm{r['rearm']}")
    if r.get("trend_kind"): f.append(f"{r['trend_kind']}{r['trend_L']}/{r['trend_n']}")
    if r.get("rsip"): f.append("RSI+")
    if r.get("absc"): f.append(f"absorb{r['absc']}")
    pl = ""
    if r.get("pull_kind"):
        k = r["pull_kind"]
        if k == "peak": pl = f"Pull[{r['pull_mode']} peak>={r['pull_X']} drop>={r['pull_Y']}/{r['pull_n']}b ema{r['pull_ps']}]"
        elif k == "cross": pl = f"Pull[{r['pull_mode']} peak>={r['pull_X']} then <{r['pull_Z']} ema{r['pull_ps']}]"
        else: pl = f"Pull[{r['pull_mode']} peak>={r['pull_X']} ema{r['pull_pf']}<ema{r['pull_pslow']}]"
    return " | ".join(x for x in [e, s, x, ",".join(f), pl] if x)

def fmt(r):
    return (f"IS n{r['is_n']} wr{r['is_wr']:.0f}% avg{r['is_avg']:+.2f}% pf{r['is_pf']:.2f} t{r['is_t']:.1f} rs{r['is_rs']:+.2f} || "
            f"OOS n{r['oos_n']} wr{r['oos_wr']:.0f}% avg{r['oos_avg']:+.2f}% pf{r['oos_pf']:.2f} tot{r['oos_tot']:+.0f}% dd{r['oos_dd']:.0f}% stop{r['oos_stop']:.0f}%")

def md_table(head, rows):
    return "\n".join(["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(str(x) for x in r) + " |" for r in rows])

def tstat(x):
    x = np.array(x, float)
    if len(x) < 3 or x.std(ddof=1) == 0: return 0.0
    return float(x.mean() / (x.std(ddof=1) / math.sqrt(len(x))))

# ───────── paired effects ─────────
FEAT = {
    "trend": ["trend_kind", "trend_L", "trend_n"], "cooldown": ["cd"], "rearm": ["rearm"], "rsi+": ["rsip"], "absorb-confirm": ["absc"],
    "pull": ["pull_kind", "pull_mode", "pull_X", "pull_Y", "pull_n", "pull_ps", "pull_Z", "pull_pf", "pull_pslow"], "distro-exit": ["dist", "d_near", "d_tape", "d_min"],
}
def pair_effects(rows, feat, label_fn, min_oos_n=15):
    cols = FEAT[feat]
    allc = [c for c in G.CFG_KEYS if c not in cols and c != "base"]
    key = lambda r, drop: tuple(str(r.get(c)) for c in allc)
    base = {}
    for r in rows:
        if all(r.get(c) in (None, 0, "") for c in cols): base[key(r, cols)] = r
    res = {}
    for r in rows:
        if all(r.get(c) in (None, 0, "") for c in cols): continue
        b = base.get(key(r, cols))
        if b is None or b["oos_n"] < min_oos_n or r["oos_n"] < 3: continue
        lab = label_fn(r)
        res.setdefault(lab, []).append((b, r))
    return res

def summarize_pairs(res):
    out = []
    for lab, prs in sorted(res.items()):
        d_is = [r["is_avg"] - b["is_avg"] for b, r in prs]; d_oos = [r["oos_avg"] - b["oos_avg"] for b, r in prs]
        d_tot = [r["oos_tot"] - b["oos_tot"] for b, r in prs]; d_dd = [r["oos_dd"] - b["oos_dd"] for b, r in prs]
        d_stop = [r["oos_stop"] - b["oos_stop"] for b, r in prs]; d_wr = [r["oos_wr"] - b["oos_wr"] for b, r in prs]
        # cluster by base: mean delta per base, then t across bases
        byb = {}
        for (b, r), d in zip(prs, d_oos): byb.setdefault(b["base"] if b.get("base") else id(b), []).append(d)
        bm = [np.mean(v) for v in byb.values()]
        out.append(dict(effect=lab, pairs=len(prs), bases=len(byb), d_is_avg=np.mean(d_is), d_oos_avg=np.mean(d_oos), pct_oos_better=100 * np.mean(np.array(d_oos) > 0),
                        t_across_bases=tstat(bm), d_oos_tot=np.mean(d_tot), d_oos_dd=np.mean(d_dd), d_oos_stop=np.mean(d_stop), d_oos_wr=np.mean(d_wr),
                        trades_ratio=np.mean([r["oos_n"] / max(b["oos_n"], 1) for b, r in prs])))
    return out

def write(path, rows):
    if not rows: return
    cols = list(rows[0].keys())
    with open(path, "w", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows: w.writerow([("%.4g" % r[c]) if isinstance(r[c], (float, np.floating)) else r[c] for c in cols])

def wf(pool, tf, folds=(2024, 2025, 2026)):
    """Expanding walk-forward: choose on years < Y (t-stat, min trades), score on year Y, stitch."""
    res = []
    for Y in folds:
        best = None
        for r in pool:
            n = sum(r[f"y{y}_n"] for y in range(2019, Y)); 
            if n < G.MIN_N[tf] * 0.8: continue
            s = sum(r[f"y{y}_sum"] for y in range(2019, Y)); mu = s / n
            gp = sum(r[f"y{y}_gp"] for y in range(2019, Y)); gl = sum(r[f"y{y}_gl"] for y in range(2019, Y))
            if mu <= 0 or gp / max(gl, 1e-9) < 1.05: continue
            t = G.rscore_years(r, range(2019, Y), G.MINY[tf])
            if best is None or t > best[0]: best = (t, r)
        if best:
            r = best[1]; res.append((Y, r, r[f"y{Y}_n"], r[f"y{Y}_sum"], r[f"y{Y}_gp"], r[f"y{Y}_gl"], r[f"y{Y}_stop"]))
    return res

def wf_summary(res):
    n = sum(x[2] for x in res); s = sum(x[3] for x in res); gp = sum(x[4] for x in res); gl = sum(x[5] for x in res); st = sum(x[6] for x in res)
    return dict(n=int(n), avg=100 * s / n if n else 0, pf=gp / gl if gl else 0, stop=100 * st / n if n else 0)

def preset_row(rows, tf):
    P = G.PRESET[tf]
    for r in rows:
        if all(r.get(k) == v for k, v in P.items()) and not r.get("pull_kind") and not r.get("dist") and not r.get("cd") and r.get("rearm") is None and not r.get("trend_kind") and not r.get("rsip") and not r.get("absc"):
            return r
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tf", required=True); ap.add_argument("--no-sim", action="store_true")
    a = ap.parse_args(); tf = a.tf
    S = {s: stage_rows(tf, s) for s in ("1", "2", "3", "4", "5", "5b", "6")}
    rep = [f"# Tide Zone grid analysis — {tf}\n"]
    allrows = [r for s in ("2", "3", "4", "5", "5b") for r in S[s]]
    rep.append(f"Configs evaluated: " + ", ".join(f"stage {s}: {len(v)}" for s, v in S.items() if v) + f" (total {sum(len(v) for v in S.values())}).\n")
    pre = preset_row(S["2"] + S["1"], tf)
    if pre: rep.append(f"## Repo preset baseline ({tf})\n`{desc(pre)}`\n\n{fmt(pre)}\n")
    # top by IS t overall and per stage family
    def top(rows, k=12):
        el = G.eligible(rows, tf)
        return sorted(el, key=lambda r: -r["is_rs"])[:k]
    for name, rows in [("all stages", allrows), ("stage 1 (entry+stop, preset exit)", S["1"]), ("stage 2 (exit grid)", S["2"]), ("stage 3 (entry filters)", S["3"]), ("stage 4 (Pull)", S["4"]), ("stage 5/5b (alt entries)", S["5"] + S["5b"])]:
        t = top(rows)
        if not t: continue
        rep.append(f"## Top by in-sample consistency score (rs = mean yearly avg - 0.5 std, 2019-2023) — {name}\n(selection uses <2024 only; OOS columns are untouched holdout)\n")
        rep.append(md_table(["#", "config", "result"], [(i + 1, desc(r), fmt(r)) for i, r in enumerate(t)]) + "\n")
        write(os.path.join(OUT, f"top_{tf}_{name.split()[0]}{name.split()[1] if name.startswith('stage') else ''}.csv".replace("/", "_")), [dict(desc=desc(r), **{k: r[k] for k in G.CORE}) for r in t])
    # entry-parameter robustness heat table (stage 1)
    s1 = [r for r in S["1"] if r["is_n"] >= G.MIN_N[tf] // 2]
    if s1:
        heat = {}
        for r in s1: heat.setdefault((r["e_ema"], r["e_n"]), []).append(r)
        rows_ = []
        for (p, n), v in sorted(heat.items()):
            rows_.append(dict(e_ema=p, e_n=n, cfgs=len(v), is_avg=np.mean([x["is_avg"] for x in v]), oos_avg=np.mean([x["oos_avg"] for x in v]), oos_pf=np.mean([x["oos_pf"] for x in v]), oos_n=np.mean([x["oos_n"] for x in v])))
        write(os.path.join(OUT, f"entry_heat_{tf}.csv"), rows_)
        best = sorted(rows_, key=lambda r: -r["is_avg"])[:8]
        rep.append("## Entry EMA/pivot plateau (avg over below-score and stops; stage 1)\n" + md_table(["EMA", "N", "cfgs", "IS avg %", "OOS avg %", "OOS PF", "OOS n"], [(r["e_ema"], r["e_n"], r["cfgs"], f"{r['is_avg']:.2f}", f"{r['oos_avg']:.2f}", f"{r['oos_pf']:.2f}", f"{r['oos_n']:.0f}") for r in best]) + "\n")
    # paired feature effects
    feats = []
    for feat, src, lab in [("trend", S["3"], lambda r: f"trend {r['trend_kind']}"), ("trend", S["3"], lambda r: f"trend {r['trend_kind']}{r['trend_L']}/{r['trend_n']}"),
                           ("cooldown", S["3"], lambda r: f"cooldown {r['cd']}"), ("rearm", S["3"], lambda r: f"rearm {r['rearm']}"),
                           ("rsi+", S["3"], lambda r: "RSI+ only"), ("absorb-confirm", S["3"], lambda r: f"absorb<={r['absc']}"),
                           ("distro-exit", S["2"], lambda r: f"distro near{r['d_near']} tape{r['d_tape']} min{r['d_min']}"),
                           ("pull", S["4"], lambda r: f"pull {r['pull_kind']}/{r['pull_mode']}")]:
        sm = summarize_pairs(pair_effects(src, feat, lab))
        for d in sm: d["panel"] = "grid-top-bases"; feats.append(d)
    for feat, lab in [("pull", lambda r: f"pull {r['pull_kind']}/{r['pull_mode']}"), ("pull", lambda r: "pull ANY"), ("pull", lambda r: f"pullv {r['pull_kind']}/{r['pull_mode']}/{r['pull_X']}/{r.get('pull_Y') or r.get('pull_Z') or r.get('pull_pslow')}"),
                      ("trend", lambda r: f"trend {r['trend_kind']}{r['trend_L']}/{r['trend_n']}"), ("trend", lambda r: "trend ANY"), ("cooldown", lambda r: f"cooldown {r['cd']}"), ("rearm", lambda r: f"rearm {r['rearm']}")]:
        sm = summarize_pairs(pair_effects(S["6"], feat, lab))
        for d in sm: d["panel"] = "random-bases"; feats.append(d)
    write(os.path.join(OUT, f"feature_effects_{tf}.csv"), feats)
    for panel in ("random-bases", "grid-top-bases"):
        sel = [d for d in feats if d["panel"] == panel and ("ANY" in d["effect"] or d["effect"].count("/") < 2 or panel == "grid-top-bases") and not d["effect"].startswith("pullv")]
        if not sel: continue
        rep.append(f"## Paired feature effects ({panel}): variant minus its own base, OOS (2024+)\n" + md_table(
            ["effect", "pairs", "bases", "dIS avg%", "dOOS avg%", "% pairs OOS better", "t (across bases)", "dOOS tot%", "dOOS maxDD pp", "dOOS stop-rate pp", "trades x"],
            [(d["effect"], d["pairs"], d["bases"], f"{d['d_is_avg']:+.3f}", f"{d['d_oos_avg']:+.3f}", f"{d['pct_oos_better']:.0f}", f"{d['t_across_bases']:+.1f}", f"{d['d_oos_tot']:+.1f}", f"{d['d_oos_dd']:+.1f}", f"{d['d_oos_stop']:+.1f}", f"{d['trades_ratio']:.2f}") for d in sel]) + "\n")
    pv = sorted([d for d in feats if d["panel"] == "random-bases" and d["effect"].startswith("pullv")], key=lambda d: -d["d_is_avg"])
    if pv:
        rep.append("## Individual Pull variants on random bases, ranked by IN-sample gain (shows whether it carries to OOS)\n" + md_table(["variant (kind/mode/X/Y|Z|slow)", "bases", "dIS avg%", "dOOS avg%", "% OOS better", "t"], [(d["effect"][6:], d["bases"], f"{d['d_is_avg']:+.3f}", f"{d['d_oos_avg']:+.3f}", f"{d['pct_oos_better']:.0f}", f"{d['t_across_bases']:+.1f}") for d in pv[:12]]) + "\n")
    # selected-on-IS: per base best pull by IS t vs base OOS (stage 4)
    if S["4"]:
        bybase = {}
        for r in S["4"]: bybase.setdefault(r["base"], []).append(r)
        rows_ = []
        for b, v in bybase.items():
            base = [r for r in v if not r.get("pull_kind")]
            pulls = [r for r in v if r.get("pull_kind") and r["is_n"] >= G.MIN_N[tf] * 0.6]
            if not base or not pulls: continue
            bp = max(pulls, key=lambda r: r["is_rs"]); b0 = base[0]
            rows_.append(dict(base=b, cfg=desc(b0), base_is_t=b0["is_rs"], pull_is_t=bp["is_rs"], base_oos_avg=b0["oos_avg"], pull_oos_avg=bp["oos_avg"], base_oos_pf=b0["oos_pf"], pull_oos_pf=bp["oos_pf"], base_oos_stop=b0["oos_stop"], pull_oos_stop=bp["oos_stop"], base_oos_dd=b0["oos_dd"], pull_oos_dd=bp["oos_dd"], pull=desc(bp).split("|")[-1].strip()))
        write(os.path.join(OUT, f"pull_selected_{tf}.csv"), rows_)
        if rows_:
            w = sum(r["pull_oos_avg"] > r["base_oos_avg"] for r in rows_)
            rep.append(f"## Pull picked on IS (best IS t-stat per base), judged on OOS — {len(rows_)} bases\nOOS avg/trade better with Pull in {w}/{len(rows_)} bases; mean OOS avg {np.mean([r['base_oos_avg'] for r in rows_]):+.3f}% -> {np.mean([r['pull_oos_avg'] for r in rows_]):+.3f}%; OOS stop-rate {np.mean([r['base_oos_stop'] for r in rows_]):.1f}% -> {np.mean([r['pull_oos_stop'] for r in rows_]):.1f}%; OOS maxDD {np.mean([r['base_oos_dd'] for r in rows_]):.1f}% -> {np.mean([r['pull_oos_dd'] for r in rows_]):.1f}%.\n")
    # walk-forward
    wfrows = []
    for name, pool in [("exits only (stage2)", S["2"]), ("+entry filters (stage3)", S["3"]), ("+Pull (stage4)", S["4"]), ("alt entries (5/5b)", S["5"] + S["5b"]), ("all", allrows)]:
        pool = [r for r in pool if True]
        if not pool: continue
        res = wf(pool, tf); sm = wf_summary(res) if res else None
        if sm: wfrows.append((name, sm, res))
    pr = pre
    if pr and wfrows:
        ps = [(Y, pr, pr[f"y{Y}_n"], pr[f"y{Y}_sum"], pr[f"y{Y}_gp"], pr[f"y{Y}_gl"], pr[f"y{Y}_stop"]) for Y in (2024, 2025, 2026)]
        wfrows.insert(0, ("repo preset (fixed)", wf_summary(ps), ps))
    if wfrows:
        rep.append("## Expanding walk-forward (choose on years < Y by consistency score, trade year Y; folds 2024, 2025, 2026 YTD)\n" + md_table(["selector pool", "OOS trades", "avg %/trade", "PF", "stop %"], [(n, s["n"], f"{s['avg']:+.3f}", f"{s['pf']:.2f}", f"{s['stop']:.0f}") for n, s, _ in wfrows]) + "\n")
        for n, s, res in wfrows[1:]:
            rep.append(f"* {n}: " + "; ".join(f"{Y}: `{desc(r)}` -> n{nn:.0f} avg{(100*sm/nn if nn else 0):+.2f}%" for Y, r, nn, sm, *_ in res))
        rep.append("")
        write(os.path.join(OUT, f"walkforward_{tf}.csv"), [dict(pool=n, **s) for n, s, _ in wfrows])
    # cost sensitivity + XRP trades for the preset and the best IS config of stage 4/3
    if not a.no_sim:
        G.SYMS = G.load(tf)
        cands = []
        if pre: cands.append(("repo preset", pre))
        for nm, rows in (("best IS stage3 (filters)", S["3"]), ("best IS stage4 (Pull)", S["4"]), ("best IS overall", allrows)):
            t = top(rows, 1)
            if t: cands.append((nm, t[0]))
        rows_ = []
        for nm, r in cands:
            cfg = G.base_of(r)
            for lab, c, se in [("zero cost", 0.0, 0.0), ("4bp/side (repo research)", 0.0004, 0.0), ("base 9.5bp+5bp stop", E.COST_SIDE, E.STOP_EXTRA), ("20bp/side + 15bp stop", 0.002, 0.0015)]:
                x = E.evaluate(G.SYMS, cfg, c, se)
                rows_.append(dict(candidate=nm, cost=lab, desc=desc(r), is_n=x["is_n"], is_avg=x["is_avg"], oos_n=x["oos_n"], oos_avg=x["oos_avg"], oos_pf=x["oos_pf"], oos_tot=x["oos_tot"], oos_dd=x["oos_dd"]))
        write(os.path.join(OUT, f"cost_sensitivity_{tf}.csv"), rows_)
        rep.append("## Cost sensitivity (OOS)\n" + md_table(["candidate", "cost", "OOS n", "avg %/trade", "PF", "tot %", "maxDD %"], [(r["candidate"], r["cost"], r["oos_n"], f"{r['oos_avg']:+.2f}", f"{r['oos_pf']:.2f}", f"{r['oos_tot']:+.0f}", f"{r['oos_dd']:.0f}") for r in rows_]) + "\n")
        # XRP last 150 days trade list
        xr = G.SYMS["XRPUSDT"]; cutoff = int(xr.t[-1]) - 150 * 86400; xt = []
        import datetime as dt
        for nm, r in cands:
            row, trs = E.evaluate({"XRPUSDT": xr}, G.base_of(r), want_trades=True)
            for (e, fill, jx, g, why) in trs["XRPUSDT"]:
                if xr.t[fill] >= cutoff:
                    xt.append(dict(candidate=nm, entry_utc=dt.datetime.fromtimestamp(int(xr.t[fill]), dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), exit_utc=dt.datetime.fromtimestamp(int(xr.t[jx]), dt.timezone.utc).strftime("%Y-%m-%d %H:%M"), gross_pct=100 * g, net_pct=100 * (g - 2 * E.COST_SIDE - (E.STOP_EXTRA if why in (1, 4) else 0)), exit=E.WHY[why], bars=jx - fill))
        write(os.path.join(OUT, f"xrp_trades_last150d_{tf}.csv"), xt)
    open(os.path.join(OUT, f"report_{tf}.md"), "w").write("\n".join(rep))
    print("\n".join(rep))

if __name__ == "__main__":
    main()
