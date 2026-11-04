"""Build markdown tables from results/part1_*.json and results/part2_*.json -> results/tables.md"""
import json, sys, numpy as np
def f(x, pct=True, d=1):
    if x is None or (isinstance(x, float) and np.isnan(x)): return "–"
    return f"{100*x:.{d}f}%" if pct else f"{x:.{d}f}"
L = []
def add(s=""): L.append(s)
for which in ("wide", "narrow"):
    d = json.load(open(f"results/part1_{which}.json"))
    add(f"## Part 1 ({which} USDT.D proxy)")
    hc = d["headline_cfg"]; add(f"Headline (pre-declared): osc={hc['osc']} k={hc['k']} N={hc['N']}d X={hc['X']}")
    add(); add("| set | period | n | clusters | exc30 | exc60 | hit30 | misfire(MAE30≤-10%) | good | med days→swing low | % low already behind | premium over low |")
    add("|---|---|---|---|---|---|---|---|---|---|---|---|")
    base = d["baseline"]
    for per in ("tune", "oos"):
        add(f"| all days (baseline) | {per} | {base[per]['n30']} | – | 0 | 0 | {f(base[per]['hit30'])} | {f(base[per]['misfire_rate'])} | – | – | – | – |")
        s = d["plain"][per]
        add(f"| raw Bottom | {per} | {s['n']} | {s['n_clusters']} | {f(s.get('exc30_mean'))} | {f(s.get('exc60_mean'))} | {f(s.get('hit30'))} | {f(s.get('misfire_rate'))} | {f(s.get('good_rate'))} | {f(s.get('days_to_low_med'),False,0)} | {f(s.get('frac_low_already'))} | {f(s.get('premium_over_low_med'))} |")
        H = d["headline"][per]
        for k, lab in (("zone_start", "zone-opening Bottom"), ("zone_nodiv", "Bottom, zone ended with NO div"), ("zone_div", "Bottom, zone later got a div (look-ahead)"), ("x1", "x1 (at div confirm)"), ("x2", "x2"), ("x3", "x3"), ("div_outside_zone", "div outside any zone (control)")):
            s = H[k]
            if not s.get("n"): add(f"| {lab} | {per} | 0 | | | | | | | | | |"); continue
            add(f"| {lab} | {per} | {s['n']} | {s.get('n_clusters')} | {f(s.get('exc30_mean'))} | {f(s.get('exc60_mean'))} | {f(s.get('hit30'))} | {f(s.get('misfire_rate'))} | {f(s.get('good_rate'))} | {f(s.get('days_to_low_med'),False,0)} | {f(s.get('frac_low_already'))} | {f(s.get('premium_over_low_med'))} |")
        add(f"| zones / with ≥1 div / ladder | {per} | {H['n_zones']} | {f(H['zones_with_div_frac'],True,0)} | {H['ladder_counts']} | | | | | | | |")
    add(); add("Bootstrap (calendar-month cluster) 95% CI of mean excess fwd-30d log return, headline cfg: [mean, lo, hi, n, months]")
    for k, v in d["headline_ci"].items():
        add(f"- {k}: tune {None if not v['tune'] else [round(x,3) for x in v['tune']]}, oos {None if not v['oos'] else [round(x,3) for x in v['oos']]}")
    # grid aggregate for x1 (rsi osc)
    add(); add("### Grid aggregate (96 configs), actionable x1 (confirmation bar) vs raw Bottom")
    add("| osc | k | N | X | tune x1 n | tune x1 exc30 | tune x1 mis | oos x1 n | oos x1 exc30 | oos x1 mis | oos x2+ n |"); add("|---|---|---|---|---|---|---|---|---|---|---|")
    rows = []
    for c in d["grid"]:
        t = c["res"]["tune"]["x1"]; o = c["res"]["oos"]["x1"]
        o2 = (c["res"]["oos"]["x2"].get("n") or 0) + (c["res"]["oos"]["x3"].get("n") or 0) + (c["res"]["oos"]["x4plus"].get("n") or 0)
        rows.append((c, t, o, o2))
    for c, t, o, o2 in rows:
        if c["osc"] == "rsi":
            add(f"| {c['osc']} | {c['k']} | {c['N']} | {c['X']} | {t.get('n')} | {f(t.get('exc30_mean'))} | {f(t.get('misfire_rate'))} | {o.get('n')} | {f(o.get('exc30_mean'))} | {f(o.get('misfire_rate'))} | {o2} |")
    for osc in ("rsi", "score"):
        te = [t["exc30_mean"] for c, t, o, _ in rows if c["osc"] == osc and t.get("exc30_mean") is not None]
        oe = [o["exc30_mean"] for c, t, o, _ in rows if c["osc"] == osc and o.get("exc30_mean") is not None]
        tm = [t["misfire_rate"] for c, t, o, _ in rows if c["osc"] == osc and t.get("misfire_rate") is not None]
        om = [o["misfire_rate"] for c, t, o, _ in rows if c["osc"] == osc and o.get("misfire_rate") is not None]
        add(f"- osc={osc}: across configs median x1 exc30 tune {f(np.median(te))} (share>0 {f(np.mean(np.array(te)>0),True,0)}), OOS {f(np.median(oe))} (share>0 {f(np.mean(np.array(oe)>0),True,0)}); median misfire tune {f(np.median(tm),True,0)}, OOS {f(np.median(om),True,0)}")
    add(); add("XRP zones 2026: " + json.dumps(d["xrp_zones_2026"])); add()

for which in ("wide", "narrow"):
    d = json.load(open(f"results/part2_{which}.json"))
    add(f"## Part 2 ({which} USDT.D proxy)")
    for tf in ("1D", "1W"):
        R = d["tf"][tf]; df = R["default"]
        add(f"### {tf}  (bars {R['bars']}; min events tune/oos {d['nmin'][tf]})")
        add(f"Default settings: Bottom n={df['tb_n']}/{df['ob_n']} (tune/OOS) exc30 {f(df['tb_q'])}/{f(df['ob_q'])} misfire {f(df['tb_mis'],True,0)}/{f(df['ob_mis'],True,0)} | Top n={df['tt_n']}/{df['ot_n']} quality(-exc30) {f(df['tt_q'])}/{f(df['ot_q'])} top-misfire(rises≥10%) {f(df['tt_mis'],True,0)}/{f(df['ot_mis'],True,0)}")
        add(); add("η² (share of variance in call quality explained by the parameter), LHS 20k configs (5 quantile bins) | factorial 3^9=19,683")
        add("| param | Bottom Q tune | Bottom Q OOS | Top Q tune | Top Q OOS | #Bottom events | #Top events | factorial B-tune | factorial B-OOS | factorial T-tune | factorial T-OOS |"); add("|---|---|---|---|---|---|---|---|---|---|---|")
        s = R["sensitivity"]
        for k in s["lhs"]["bottom_tune"]:
            fa = lambda key: s["factorial"][key].get(k)
            fe = lambda x: "–" if x is None else f"{x:.3f}"
            add(f"| {k} | {fe(s['lhs']['bottom_tune'][k])} | {fe(s['lhs']['bottom_oos'][k])} | {fe(s['lhs']['top_tune'][k])} | {fe(s['lhs']['top_oos'][k])} | {fe(s['lhs']['bottom_nevents'][k])} | {fe(s['lhs']['top_nevents'][k])} | {fe(fa('bottom_tune'))} | {fe(fa('bottom_oos'))} | {fe(fa('top_tune'))} | {fe(fa('top_oos'))} |")
        add(); add("Tune→OOS persistence (rank corr of config quality; selection-effect check)")
        for k, v in R["persistence"].items():
            add(f"- {k}: ρ={v['rank_corr_tune_oos'] if v['rank_corr_tune_oos'] is None else round(v['rank_corr_tune_oos'],2)}, n_cfg={v['n_cfg']}, all-cfg mean Q tune {f(v.get('all_tune_q'))} / OOS {f(v.get('all_oos_q'))}; tune-top-1% Q tune {f(v.get('top1pct_tune_q'))} → OOS {f(v.get('top1pct_oos_q'))}; P(tune>0 ⇒ OOS>0) {f(v.get('pos_tune_stays_pos_oos'),True,0)}")
        add()
    add()
open("results/tables.md", "w").write("\n".join(L))
print("\n".join(L)[:200])
