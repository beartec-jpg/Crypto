"""Generate Python->TS parity fixtures for Tide v2 (live-accurate detector) on real BTC bars.

Usage: CRYPTO_DATA_DIR=~/crypto-data python3 scripts/tide_v2_parity_fixture.py
Writes client/src/__tests__/lib/fixtures/tide_btc_{4h,1h}.json (read by tideSignals.test.ts)."""
import json, os, sqlite3, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tide_zone_1h_refine as tz, tide_out_in_backtest as bt, tide_live_core as T

DB = os.path.join(os.environ.get("CRYPTO_DATA_DIR", os.path.expanduser("~/crypto-data")), "market.sqlite")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "src", "__tests__", "lib", "fixtures")
PRESETS = {
    "4h": dict(emaPeriod=8, pivotN=3, belowScore=-20, exitEmaPeriod=8, exitPivotN=5, stop=dict(kind="atr", mult=0.5)),
    "1h": dict(emaPeriod=21, pivotN=8, belowScore=-40, exitEmaPeriod=8, exitPivotN=8, stop=dict(kind="pct", pct=0.005)),
}

ALT = {"4h": dict(emaPeriod=8, pivotN=5, belowScore=-10), "1h": dict(emaPeriod=21, pivotN=8, belowScore=-10)}

def r(x, d=8):
    return None if x is None or x != x else round(x, d)

def lifecycle(cs, ev, peaks, atr14, stop):
    m = len(cs); out = []
    for e in ev:
        ci, pl = e["confirm_i"], e["price2"]
        fill = ci + 1
        entry = cs[fill]["o"] if fill < m else None
        if stop["kind"] == "atr":
            a = atr14[ci]
            if not T.isnum(a):
                a = entry * 0.01 if entry is not None else 0.0
            sp = pl - stop["mult"] * a
        else:
            sp = pl * (1 - stop["pct"])
        if entry is not None and sp >= entry:
            sp = min(pl, entry * 0.995)
        x = next((p for p in peaks if p >= fill), None)
        outcome, exit_i = "open", None
        for j in range(fill, m):
            if x is not None and j == x + 1:
                outcome, exit_i = "tide_in", j; break
            if cs[j]["l"] <= sp:
                outcome, exit_i = "stop", j; break
        if outcome == "open" and x is not None and x <= m - 1:
            outcome = "tide_in"  # exit signal printed, fills next open (not loaded yet)
        out.append({"confirmTime": cs[ci]["t"], "entryPrice": entry, "stop": r(sp, 10), "outcome": outcome,
                    "exitTime": cs[exit_i]["t"] if exit_i is not None else None,
                    "tideInTime": cs[x]["t"] if (x is not None and outcome == "tide_in") else None})
    return out

def build(interval, end_t, count, name):
    p = PRESETS[interval]
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = con.execute("SELECT t,o,h,l,c,v FROM klines WHERE symbol='BTCUSDT' AND interval=? AND t<=? ORDER BY t DESC LIMIT ?", (interval, end_t, count)).fetchall()[::-1]
    cs = [{"t": t, "o": o, "h": h, "l": l, "c": c, "v": v} for t, o, h, l, c, v in rows]
    m = len(cs)
    score, *_ = tz.tide_series(cs)
    eo = bt.ema_of(score, p["emaPeriod"]); ei = bt.ema_of(score, p["exitEmaPeriod"])
    ev = T.causal_divs(cs, eo, p["pivotN"], p["belowScore"])
    peaks = T.causal_ema_peaks(ei, p["exitPivotN"], 0)
    R = tz.rsi([c["c"] for c in cs], 14)
    atr14 = T.atr_series(cs, 14)
    sigs = []
    for e in ev:
        w = [R[j] for j in range(e["pivot_i"], e["confirm_i"] + 1) if T.isnum(R[j])]
        mr = min(w) if w else None
        sigs.append({"confirmTime": cs[e["confirm_i"]]["t"], "pivotTime": cs[e["pivot_i"]]["t"], "pivotPrice": e["price2"],
                     "pivot1Time": cs[e["pivot1_i"]]["t"], "pivot1Price": e["price1"], "minRsi": r(mr, 6), "rsiPlus": bool(mr is not None and mr < 30)})
    # EMA values at the two EMA lows are not exported by causal_divs; signals are compared on bars/prices/flags.
    trades = lifecycle(cs, ev, peaks, atr14, p["stop"])
    alt_p = ALT[interval]
    alt_ev = T.causal_divs(cs, bt.ema_of(score, alt_p["emaPeriod"]), alt_p["pivotN"], alt_p["belowScore"])
    alt = {"params": alt_p, "signals": [{"confirmTime": cs[e["confirm_i"]]["t"], "pivotTime": cs[e["pivot_i"]]["t"], "pivot1Time": cs[e["pivot1_i"]]["t"]} for e in alt_ev]}
    fx = {"symbol": "BTCUSDT", "interval": interval, "preset": p, "source": "beartec-brain market.sqlite (Binance USDT-M perp klines)",
          "candles": [[c["t"], c["o"], c["h"], c["l"], c["c"], c["v"]] for c in cs],
          "score": [r(x) for x in score], "emaOut": [r(x) for x in eo], "emaIn": [r(x) for x in ei],
          "signals": sigs, "alt": alt, "peaks": [cs[i]["t"] for i in peaks], "trades": trades}
    json.dump(fx, open(os.path.join(OUT_DIR, name), "w"), separators=(",", ":"))
    first = next(i for i, x in enumerate(score) if x == x)
    print(name, "bars", m, "first score idx", first, "signals", len(sigs), "rsi+", sum(s["rsiPlus"] for s in sigs),
          "alt", len(alt_ev), "peaks", len(peaks), "outcomes", {k: sum(t["outcome"] == k for t in trades) for k in ("open", "tide_in", "stop")})

if __name__ == "__main__":
  import datetime as D
  e4 = int(D.datetime(2024, 9, 17, 8, tzinfo=D.timezone.utc).timestamp())
  e1 = int(D.datetime(2024, 1, 22, 3, tzinfo=D.timezone.utc).timestamp())
  build("4h", e4, int(sys.argv[1]) if len(sys.argv) > 1 else 1000, "tide_btc_4h.json")
  build("1h", e1, int(sys.argv[2]) if len(sys.argv) > 2 else 1500, "tide_btc_1h.json")
