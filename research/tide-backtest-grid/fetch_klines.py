#!/usr/bin/env python3
"""Download public Binance spot klines (no API key) into data/<SYMBOL>_<tf>.npz.

Uses data-api.binance.vision (public market-data mirror). Only fully closed candles are kept.
Usage: python3 fetch_klines.py [--start 2019-01-01]
"""
import argparse, os, sys, time, json, urllib.request
import numpy as np
from datetime import datetime, timezone

SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"]
TFS = {"1h": 3600, "4h": 14400}
BASE = "https://data-api.binance.vision/api/v3/klines"

def get(url, tries=6):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa
            time.sleep(1.5 * (k + 1))
    raise RuntimeError("fetch failed " + url)

def fetch(sym, tf, start_ms):
    step = TFS[tf] * 1000
    now_ms = int(time.time() * 1000)
    rows = []
    t = start_ms
    while t < now_ms:
        d = get(f"{BASE}?symbol={sym}&interval={tf}&startTime={t}&limit=1000")
        if not d:
            break
        rows.extend(d)
        t = d[-1][0] + step
        if len(d) < 1000:
            break
        time.sleep(0.05)
    rows = [r for r in rows if r[6] < now_ms]  # closed candles only
    a = np.array([[r[0] // 1000, r[1], r[2], r[3], r[4], r[5]] for r in rows], dtype=float)
    # de-dup / sort
    _, idx = np.unique(a[:, 0], return_index=True)
    return a[idx]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2019-01-01")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    s_ms = int(datetime.fromisoformat(a.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    from concurrent.futures import ThreadPoolExecutor
    def job(a_):
        sym, tf = a_
        return sym, tf, fetch(sym, tf, s_ms)
    jobs = [(s_, tf_) for s_ in SYMBOLS for tf_ in TFS if not os.path.exists(os.path.join(a.out, f"{s_}_{tf_}.npz"))]
    with ThreadPoolExecutor(8) as ex:
        for sym, tf, arr in ex.map(job, jobs):
            np.savez_compressed(os.path.join(a.out, f"{sym}_{tf}.npz"), t=arr[:, 0].astype(np.int64), o=arr[:, 1], h=arr[:, 2], l=arr[:, 3], c=arr[:, 4], v=arr[:, 5])
            gaps = int((np.diff(arr[:, 0]) > TFS[tf]).sum())
            print(sym, tf, len(arr), datetime.fromtimestamp(arr[0, 0], timezone.utc).date(), "->", datetime.fromtimestamp(arr[-1, 0], timezone.utc).date(), "gaps", gaps, flush=True)
