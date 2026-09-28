#!/usr/bin/env python3
"""
Tide OUT → Tide IN RR / profit-factor search (multi-core).

Designed for beartec-brain (32 cores). No NVIDIA CUDA needed — this workload
is zigzag + trade sims; speedup is ProcessPoolExecutor over configs.

Tide OUT: bull DIV (best bottoms from prior sweep).
Tide IN:  indicator only — bear_div / ema_peak / zero_down.

Risk (not Tide IN):
  - structure stop under the OUT pivot low (ATR buffer)
  - optional fixed % stop
Targets:
  - Tide IN alone
  - Tide IN OR +R take-profit (1.5R / 2R / 3R)
  - optional min-R gate: skip if stop distance implies tiny R vs a horizon MFE proxy

Train < 2024-01-01, holdout 2024+. Fees 4 bps/side.
"""
from __future__ import annotations

import itertools
import math
import os
import sqlite3
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

DATA = Path(os.environ.get("CRYPTO_DATA_DIR", str(Path.home() / "crypto-data")))
os.environ["CRYPTO_DATA_DIR"] = str(DATA)
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tide_out_in_backtest as bt  # noqa: E402

DB = DATA / "market.sqlite"
bt.DB = DB
bt.DATA = DATA
OUTDIR = DATA / "holistic"
WORKERS = int(os.environ.get("TIDE_WORKERS", max(1, (os.cpu_count() or 4) - 2)))

# Focused OUT bottoms that already looked good (+ live default as control)
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

# Lean indicator Tide-IN grid (quality over combinatorial explosion)
IN_SPECS = []
IN_SPECS.append({"mode": "zero_down", "emaPeriod": 8, "confirmBars": 5, "aboveScore": 0, "label": "zero_down"})
for ema, n, ab in itertools.product((8, 13, 21), (3, 5, 8), (0, 10)):
    IN_SPECS.append({
        "mode": "bear_div", "emaPeriod": ema, "confirmBars": n, "aboveScore": ab,
        "label": f"bear_ema{ema}_n{n}_ab{ab}",
    })
for ema, n, ab in itertools.product((8, 13, 21), (5, 8), (0, 10)):
    IN_SPECS.append({
        "mode": "ema_peak", "emaPeriod": ema, "confirmBars": n, "aboveScore": ab,
        "label": f"emaPeak_ema{ema}_n{n}_ab{ab}",
    })

# Risk / RR variants
STOP_MODES = [
    {"kind": "struct_atr", "atr_mult": 0.25, "label": "struct_atr0.25"},
    {"kind": "struct_atr", "atr_mult": 0.5, "label": "struct_atr0.5"},
    {"kind": "struct_atr", "atr_mult": 1.0, "label": "struct_atr1"},
    {"kind": "struct_pct", "pct": 0.005, "label": "struct_buf0.5%"},
    {"kind": "struct_pct", "pct": 0.01, "label": "struct_buf1%"},
    {"kind": "fixed_pct", "pct": 0.015, "label": "fixed1.5%"},
    {"kind": "fixed_pct", "pct": 0.02, "label": "fixed2%"},
]
TP_MODES = [
    {"kind": "tide_only", "R": 0.0, "label": "tp_tide"},
    {"kind": "tide_or_R", "R": 1.5, "label": "tp_tide_or_1.5R"},
    {"kind": "tide_or_R", "R": 2.0, "label": "tp_tide_or_2R"},
    {"kind": "tide_or_R", "R": 3.0, "label": "tp_tide_or_3R"},
]
MIN_RR_GATES = (0.0, 1.5)  # skip entry if 1.5*ATR / risk < gate


def atr_series(cs, n=14):
    out = [float("nan")] * len(cs)
    if len(cs) < n + 1:
        return out
    trs = [0.0] * len(cs)
    for i in range(1, len(cs)):
        h, l, pc = cs[i]["h"], cs[i]["l"], cs[i - 1]["c"]
        trs[i] = max(h - l, abs(h - pc), abs(l - pc))
    s = sum(trs[1:n + 1])
    out[n] = s / n
    for i in range(n + 1, len(cs)):
        out[i] = (out[i - 1] * (n - 1) + trs[i]) / n
    return out


def simulate_rr(cs, entries, exits, atr, stop_mode, tp_mode, min_rr_gate, max_hold):
    """
    entries: list of (confirm_i, pivot_i, pivot_low)
    exits: set/list of confirm indices (Tide IN)
    """
    exit_set = set(exits)
    trades = []
    pending = None
    pending_exit = False
    pos = None
    n = len(cs)
    for i in range(80, n):
        c = cs[i]
        if pending is not None and pos is None:
            confirm_i, pivot_i, pivot_low = pending
            pending = None
            if i != confirm_i + 1:
                continue
            entry = c["o"]
            a = atr[confirm_i] if bt.isnum(atr[confirm_i]) else entry * 0.01
            kind = stop_mode["kind"]
            if kind == "struct_atr":
                stop = pivot_low - stop_mode["atr_mult"] * a
            elif kind == "struct_pct":
                stop = pivot_low * (1.0 - stop_mode["pct"])
            else:  # fixed_pct from entry
                stop = entry * (1.0 - stop_mode["pct"])
            if stop >= entry:
                stop = entry * 0.99  # pathological
            risk = entry - stop
            if risk <= 0:
                continue
            # min RR gate vs 1.5*ATR as a crude reachable move proxy
            if min_rr_gate > 0:
                reach = 1.5 * a
                if reach / risk < min_rr_gate:
                    continue
            tp = None
            if tp_mode["kind"] == "tide_or_R" and tp_mode["R"] > 0:
                tp = entry + tp_mode["R"] * risk
            pos = {
                "entry": entry, "stop": stop, "tp": tp, "fill_i": i,
                "sig_i": confirm_i, "risk": risk,
            }

        if pending_exit and pos is not None:
            pending_exit = False
            px = c["o"]
            ret = px / pos["entry"] - 1 - 2 * bt.FEE
            trades.append({
                "t": cs[pos["sig_i"]]["t"], "ret": ret, "why": "tide_in",
                "bars": i - pos["fill_i"], "R": (px - pos["entry"]) / pos["risk"],
            })
            pos = None

        if pos is not None:
            why = px = None
            if c["l"] <= pos["stop"]:
                px, why = pos["stop"], "sl"
            elif pos["tp"] is not None and c["h"] >= pos["tp"]:
                px, why = pos["tp"], "tp"
            elif i - pos["fill_i"] >= max_hold:
                px, why = c["c"], "time"
            if px is not None:
                ret = px / pos["entry"] - 1 - 2 * bt.FEE
                trades.append({
                    "t": cs[pos["sig_i"]]["t"], "ret": ret, "why": why,
                    "bars": i - pos["fill_i"], "R": (px - pos["entry"]) / pos["risk"],
                })
                pos = None
                pending_exit = False

        # queue next entry (one at a time)
        if pos is None and pending is None:
            # entries sorted; find any with confirm_i == i
            # use dict for O(1)
            pass

    return trades


def simulate_rr_fast(cs, entry_map, exit_set, atr, stop_mode, tp_mode, min_rr_gate, max_hold):
    """entry_map: confirm_i -> (pivot_i, pivot_low)"""
    trades = []
    pending = None
    pending_exit = False
    pos = None
    n = len(cs)
    for i in range(80, n):
        c = cs[i]
        if pending is not None and pos is None:
            confirm_i, pivot_i, pivot_low = pending
            pending = None
            if i == confirm_i + 1:
                entry = c["o"]
                a = atr[confirm_i] if bt.isnum(atr[confirm_i]) else entry * 0.01
                kind = stop_mode["kind"]
                if kind == "struct_atr":
                    stop = pivot_low - stop_mode["atr_mult"] * a
                elif kind == "struct_pct":
                    stop = pivot_low * (1.0 - stop_mode["pct"])
                else:
                    stop = entry * (1.0 - stop_mode["pct"])
                if stop >= entry:
                    stop = min(pivot_low, entry * 0.995)
                risk = entry - stop
                if risk > 0 and not (min_rr_gate > 0 and (1.5 * a) / risk < min_rr_gate):
                    tp = None
                    if tp_mode["kind"] == "tide_or_R" and tp_mode["R"] > 0:
                        tp = entry + tp_mode["R"] * risk
                    pos = {
                        "entry": entry, "stop": stop, "tp": tp, "fill_i": i,
                        "sig_i": confirm_i, "risk": risk,
                    }

        if pending_exit and pos is not None:
            pending_exit = False
            px = c["o"]
            ret = px / pos["entry"] - 1 - 2 * bt.FEE
            trades.append({
                "t": cs[pos["sig_i"]]["t"], "ret": ret, "why": "tide_in",
                "bars": i - pos["fill_i"], "R": (px - pos["entry"]) / pos["risk"],
            })
            pos = None

        if pos is not None:
            why = px = None
            if c["l"] <= pos["stop"]:
                px, why = pos["stop"], "sl"
            elif pos["tp"] is not None and c["h"] >= pos["tp"]:
                px, why = pos["tp"], "tp"
            elif i - pos["fill_i"] >= max_hold:
                px, why = c["c"], "time"
            if px is not None:
                ret = px / pos["entry"] - 1 - 2 * bt.FEE
                trades.append({
                    "t": cs[pos["sig_i"]]["t"], "ret": ret, "why": why,
                    "bars": i - pos["fill_i"], "R": (px - pos["entry"]) / pos["risk"],
                })
                pos = None
                pending_exit = False

        if pos is None and pending is None and i in entry_map:
            pivot_i, pivot_low = entry_map[i]
            pending = (i, pivot_i, pivot_low)
        elif pos is not None and not pending_exit and i in exit_set and i > pos["sig_i"]:
            pending_exit = True
    return trades


# ---------- worker-side globals (set by initializer) ----------
G = {}


def _init_worker(payload):
    """payload: {interval: {sym: {cs, atr, entries_by_outkey, exits_by_inlabel}}}"""
    G["data"] = payload


def _run_one(job):
    interval, out_key, in_label, stop_mode, tp_mode, min_rr = job
    data = G["data"][interval]
    all_tr = []
    for sym, blob in data.items():
        entries = blob["entries"].get(out_key) or {}
        exits = blob["exits"].get(in_label) or set()
        if not entries:
            continue
        tr = simulate_rr_fast(
            blob["cs"], entries, exits, blob["atr"],
            stop_mode, tp_mode, min_rr, bt.MAX_HOLD[interval],
        )
        all_tr.extend(tr)
    st = bt.book_stats(all_tr)
    # R stats on holdout
    hold = [t for t in all_tr if t["t"] >= bt.SPLIT]
    r_hold = [t.get("R") for t in hold if bt.isnum(t.get("R"))]
    st_hold = st.get("hold") or {}
    return {
        "interval": interval,
        "out": out_key,
        "inn": in_label,
        "stop": stop_mode["label"],
        "tp": tp_mode["label"],
        "min_rr": min_rr,
        "hold_n": st_hold.get("n", 0),
        "hold_wr": st_hold.get("wr", float("nan")),
        "hold_mean": st_hold.get("mean", float("nan")),
        "hold_pf": st_hold.get("pf", float("nan")),
        "hold_dd": st_hold.get("dd", float("nan")),
        "hold_eq": st_hold.get("eq", float("nan")),
        "hold_bars": st_hold.get("bars", float("nan")),
        "hold_why": st_hold.get("why", {}),
        "hold_avgR": bt.mean(r_hold),
        "train_n": (st.get("train") or {}).get("n", 0),
        "train_mean": (st.get("train") or {}).get("mean", float("nan")),
        "train_pf": (st.get("train") or {}).get("pf", float("nan")),
        "train_wr": (st.get("train") or {}).get("wr", float("nan")),
    }


def build_payload(uni):
    """Precompute entries/exits/atr once per symbol."""
    payload = {}
    for interval in bt.INTERVALS:
        payload[interval] = {}
        print(f"precompute {interval}...", flush=True)
        for sym, bundle in uni[interval].items():
            cs = bundle["cs"]
            atr = atr_series(cs, 14)
            entries = {}
            for cfg in BEST_OUT[interval]:
                key = bt.cfg_key(cfg)
                evs = bt.collect_events(bundle, cfg, "div")
                entries[key] = {
                    e["confirm_i"]: (e["pivot_i"], e["price2"])
                    for e in evs
                }
            exits = {}
            for spec in IN_SPECS:
                lab = spec["label"]
                if spec["mode"] == "zero_down":
                    xs = bt.collect_exits(bundle, spec)
                else:
                    xs = bt.collect_exits(bundle, spec)
                exits[lab] = {e["confirm_i"] for e in xs}
            payload[interval][sym] = {
                "cs": cs, "atr": atr, "entries": entries, "exits": exits,
            }
            print(f"  {sym} {interval} outs={len(entries)} inns={len(exits)}", flush=True)
    return payload


def jobs_for_interval(interval):
    jobs = []
    for cfg in BEST_OUT[interval]:
        ok = bt.cfg_key(cfg)
        for spec in IN_SPECS:
            for sm in STOP_MODES:
                for tp in TP_MODES:
                    for gate in MIN_RR_GATES:
                        jobs.append((interval, ok, spec["label"], sm, tp, gate))
    return jobs


def fmt_row(r):
    return (
        f"{r['interval']:3} OUT {r['out'][:28]:28} IN {r['inn'][:22]:22} "
        f"{r['stop']:14} {r['tp']:16} gate={r['min_rr']:3.1f} "
        f"H n={r['hold_n']:4d} wr={r['hold_wr']:5.1f}% mean={r['hold_mean']:+7.3f}% "
        f"pf={r['hold_pf']:5.2f} avgR={r['hold_avgR']:+5.2f} dd={r['hold_dd']:6.1f}% "
        f"T mean={r['train_mean']:+7.3f}% pf={r['train_pf']:5.2f} why={r['hold_why']}"
    )


def run_interval(uni, interval, results):
    """One TF at a time so worker payloads stay smaller (fork COW)."""
    import multiprocessing as mp
    jobs = jobs_for_interval(interval)
    payload = {interval: {}}
    print(f"precompute {interval} jobs={len(jobs)}...", flush=True)
    for sym, bundle in uni[interval].items():
        cs = bundle["cs"]
        atr = atr_series(cs, 14)
        entries = {}
        for cfg in BEST_OUT[interval]:
            key = bt.cfg_key(cfg)
            evs = bt.collect_events(bundle, cfg, "div")
            entries[key] = {e["confirm_i"]: (e["pivot_i"], e["price2"]) for e in evs}
        exits = {}
        for spec in IN_SPECS:
            xs = bt.collect_exits(bundle, spec)
            exits[spec["label"]] = {e["confirm_i"] for e in xs}
        payload[interval][sym] = {"cs": cs, "atr": atr, "entries": entries, "exits": exits}
        print(f"  {sym} entries={ {k: len(v) for k,v in entries.items()} }", flush=True)

    # Prefer fork so large arrays are COW, not pickled 30×
    try:
        mp.set_start_method("fork", force=True)
    except RuntimeError:
        pass

    done = 0
    with ProcessPoolExecutor(max_workers=WORKERS, initializer=_init_worker, initargs=(payload,)) as ex:
        futs = [ex.submit(_run_one, j) for j in jobs]
        for fut in as_completed(futs):
            results.append(fut.result())
            done += 1
            if done % 500 == 0 or done == len(jobs):
                print(f"  {interval} progress {done}/{len(jobs)}", flush=True)


def main():
    OUTDIR.mkdir(parents=True, exist_ok=True)
    if not DB.exists():
        raise SystemExit(f"missing {DB}")
    print(f"DB={DB} workers={WORKERS}", flush=True)
    print(f"IN_SPECS={len(IN_SPECS)} STOP={len(STOP_MODES)} TP={len(TP_MODES)} gates={len(MIN_RR_GATES)}", flush=True)
    total = sum(len(jobs_for_interval(iv)) for iv in bt.INTERVALS)
    print(f"total jobs={total}", flush=True)

    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    print("loading universe...", flush=True)
    uni = bt.load_universe(conn)
    conn.close()

    results = []
    for interval in bt.INTERVALS:
        run_interval(uni, interval, results)

    # rank: require train+hold PF>1 and mean>0, prefer hold PF then mean
    def ok(r):
        return (
            r["hold_n"] >= 25 and r["train_n"] >= 25
            and bt.isnum(r["hold_pf"]) and bt.isnum(r["train_pf"])
            and r["hold_pf"] >= 1.15 and r["train_pf"] >= 1.05
            and r["hold_mean"] > 0 and r["train_mean"] > 0
        )

    strong = [r for r in results if ok(r)]
    strong.sort(key=lambda r: (r["hold_pf"], r["hold_mean"], r["hold_avgR"]), reverse=True)

    soft = [
        r for r in results
        if r["hold_n"] >= 25 and r["train_n"] >= 25
        and bt.isnum(r["hold_pf"]) and r["hold_pf"] >= 1.05
        and r["hold_mean"] > 0 and r["train_mean"] > 0
    ]
    soft.sort(key=lambda r: (r["hold_pf"], r["hold_mean"]), reverse=True)

    lines = [
        "TIDE RR / PROFIT-FACTOR SEARCH",
        f"workers={WORKERS} jobs={len(results)}",
        "host=beartec-brain (32-core CPU; AMD iGPU — no CUDA path for this zigzag/sim workload)",
        "Tide IN = bear_div | ema_peak | zero_down (indicator only).",
        "Stops = structure under pivot (ATR/%) or fixed %. Targets = Tide IN and/or +R.",
        "min_rr gate skips entries where 1.5*ATR / risk < gate.",
        "",
        f"STRONG (+PF hold>=1.15 & train>=1.05, n>=25): {len(strong)}",
        f"SOFT   (+PF hold>=1.05 & train mean>0): {len(soft)}",
        "",
        "======== TOP 40 STRONG ========",
    ]
    for r in strong[:40]:
        lines.append(fmt_row(r))
    if not strong:
        lines.append("(none — showing soft top 40)")
        for r in soft[:40]:
            lines.append(fmt_row(r))

    lines.append("\n======== BEST PER TF (strong else soft) ========")
    for interval in bt.INTERVALS:
        pool = [r for r in strong if r["interval"] == interval] or [r for r in soft if r["interval"] == interval]
        lines.append(f"\n{interval}:")
        for r in pool[:8]:
            lines.append("  " + fmt_row(r))

    lines.append("\n======== BEST STOP / TP STYLE (avg of top hits) ========")
    from collections import defaultdict
    for label_key in ("stop", "tp", "inn"):
        bucket = defaultdict(list)
        src = strong or soft
        for r in src[:200] if src else []:
            bucket[r[label_key]].append(r["hold_pf"])
        ranked = sorted(bucket.items(), key=lambda kv: bt.mean(kv[1]), reverse=True)
        lines.append(f"\nby {label_key}:")
        for k, pfs in ranked[:12]:
            lines.append(f"  {k:28} mean_pf={bt.mean(pfs):.3f} n={len(pfs)}")

    text = "\n".join(lines) + "\n"
    outp = OUTDIR / "tide_rr_pf_search.txt"
    outp.write_text(text)
    # also dump jsonl of strong+soft top
    import json
    dump = OUTDIR / "tide_rr_pf_search.jsonl"
    with dump.open("w") as f:
        for r in (strong or soft)[:500]:
            f.write(json.dumps(r) + "\n")
    print(text)
    print(f"WROTE {outp}", flush=True)
    print(f"WROTE {dump}", flush=True)


if __name__ == "__main__":
    main()
