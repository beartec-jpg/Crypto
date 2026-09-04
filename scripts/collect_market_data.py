#!/usr/bin/env python3
"""
Local market-data warehouse so scans/sims do not keep hitting APIs.

Stores on the box (default $CRYPTO_DATA_DIR or ./data/market):
  market.sqlite  — klines, open interest, funding

Sources:
  Binance spot klines  (no key)
  Coinglass v4 OI + funding  (CG_API_KEY in env or secrets.env)

Rate limit Coinglass at ~50/min (plan is 80/min). Incremental: resume from max(t).

  python3 collect_market_data.py status
  python3 collect_market_data.py backfill
  python3 collect_market_data.py update
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CG_BASE = "https://open-api-v4.coinglass.com"
BINANCE = "https://api.binance.com/api/v3/klines"
DEFAULT_SYMBOLS = "XRPUSDT,BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,DOGEUSDT"
INTERVAL_MS = {
    "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000,
    "4h": 14_400_000, "8h": 28_800_000, "1d": 86_400_000,
}


def data_dir() -> Path:
    p = Path(os.environ.get("CRYPTO_DATA_DIR", str(Path.home() / "crypto-data")))
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_secrets():
    envp = data_dir() / "secrets.env"
    if envp.exists():
        for line in envp.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def cg_key() -> str:
    k = os.environ.get("CG_API_KEY", "").strip()
    if not k:
        sys.exit("CG_API_KEY missing. Put it in $CRYPTO_DATA_DIR/secrets.env")
    return k


def db_path() -> Path:
    return data_dir() / "market.sqlite"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS klines (
            symbol TEXT NOT NULL,
            interval TEXT NOT NULL,
            t INTEGER NOT NULL,
            o REAL, h REAL, l REAL, c REAL, v REAL, tb REAL,
            PRIMARY KEY (symbol, interval, t)
        );
        CREATE TABLE IF NOT EXISTS oi (
            exchange TEXT NOT NULL,
            symbol TEXT NOT NULL,
            interval TEXT NOT NULL,
            t INTEGER NOT NULL,
            open REAL, high REAL, low REAL, close REAL,
            PRIMARY KEY (exchange, symbol, interval, t)
        );
        CREATE TABLE IF NOT EXISTS funding (
            exchange TEXT NOT NULL,
            symbol TEXT NOT NULL,
            interval TEXT NOT NULL,
            t INTEGER NOT NULL,
            open REAL, high REAL, low REAL, close REAL,
            PRIMARY KEY (exchange, symbol, interval, t)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """
    )
    return conn


def max_t(conn, table, where: dict) -> int | None:
    cols = " AND ".join(f"{k}=?" for k in where)
    q = f"SELECT MAX(t) FROM {table} WHERE {cols}"
    row = conn.execute(q, tuple(where.values())).fetchone()
    return row[0] if row and row[0] else None


def min_t(conn, table, where: dict) -> int | None:
    cols = " AND ".join(f"{k}=?" for k in where)
    q = f"SELECT MIN(t) FROM {table} WHERE {cols}"
    row = conn.execute(q, tuple(where.values())).fetchone()
    return row[0] if row and row[0] else None


def count_rows(conn, table, where: dict) -> int:
    cols = " AND ".join(f"{k}=?" for k in where)
    q = f"SELECT COUNT(*) FROM {table} WHERE {cols}"
    return conn.execute(q, tuple(where.values())).fetchone()[0]


def fmt_t(ts: int | None) -> str:
    if not ts:
        return "—"
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


class RateLimit:
    def __init__(self, per_min=50):
        self.min_dt = 60.0 / per_min
        self.last = 0.0

    def wait(self):
        now = time.monotonic()
        gap = self.min_dt - (now - self.last)
        if gap > 0:
            time.sleep(gap)
        self.last = time.monotonic()


CG_RL = RateLimit(50)


def http_json(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        raise RuntimeError(f"HTTP {e.code} {url[:80]} {body}") from e


def cg_get(path, params):
    CG_RL.wait()
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{CG_BASE}{path}?{qs}"
    body, hdr = http_json(url, {"accept": "application/json", "CG-API-KEY": cg_key()})
    if str(body.get("code")) not in ("0", "success", ""):
        raise RuntimeError(f"Coinglass {body.get('code')} {body.get('msg')} {path}")
    return body.get("data") or [], hdr


def binance_klines(symbol, interval, start_ms, end_ms, limit=1000):
    qs = urllib.parse.urlencode({
        "symbol": symbol, "interval": interval,
        "startTime": start_ms, "endTime": end_ms, "limit": limit,
    })
    rows, _ = http_json(f"{BINANCE}?{qs}")
    out = []
    for k in rows:
        out.append((
            symbol, interval, int(k[0]) // 1000,
            float(k[1]), float(k[2]), float(k[3]), float(k[4]),
            float(k[5]), float(k[9]),
        ))
    return out


def upsert_klines(conn, rows):
    conn.executemany(
        "INSERT OR REPLACE INTO klines(symbol,interval,t,o,h,l,c,v,tb) VALUES(?,?,?,?,?,?,?,?,?)",
        rows,
    )


def upsert_ohlc(conn, table, rows):
    conn.executemany(
        f"INSERT OR REPLACE INTO {table}(exchange,symbol,interval,t,open,high,low,close) VALUES(?,?,?,?,?,?,?,?)",
        rows,
    )


def collect_binance_klines(conn, symbols, intervals, start_ms, end_ms):
    for interval in intervals:
        for sym in symbols:
            cur = start_ms
            existing = max_t(conn, "klines", {"symbol": sym, "interval": interval})
            if existing and existing * 1000 > cur:
                cur = existing * 1000 + 1
            n = 0
            print(f"  klines {sym} {interval} from {fmt_t(cur//1000)}...", flush=True)
            while cur < end_ms:
                try:
                    batch = binance_klines(sym, interval, cur, end_ms)
                except Exception as e:
                    print(f"    retry {e}", flush=True)
                    time.sleep(2)
                    batch = binance_klines(sym, interval, cur, end_ms)
                if not batch:
                    break
                upsert_klines(conn, batch)
                n += len(batch)
                cur = batch[-1][2] * 1000 + 1
                if len(batch) < 1000:
                    break
                time.sleep(0.12)
            conn.commit()
            print(f"    +{n}  total {count_rows(conn,'klines',{'symbol':sym,'interval':interval})}", flush=True)


def parse_earliest_ms(msg: str) -> int | None:
    # "the earliest allowed start_time is 1772779843000"
    if not msg:
        return None
    digits = "".join(ch if ch.isdigit() else " " for ch in msg).split()
    longs = [int(x) for x in digits if len(x) >= 12]
    return max(longs) if longs else None


def collect_cg_ohlc(conn, table, path, symbols, interval, exchange, start_ms, end_ms):
    step = INTERVAL_MS[interval]
    for sym in symbols:
        cur = start_ms
        existing = max_t(conn, table, {"exchange": exchange, "symbol": sym, "interval": interval})
        if existing and existing * 1000 > cur:
            cur = existing * 1000 + step
        n = 0
        print(f"  {table} {sym} {interval} from {fmt_t(cur//1000)}...", flush=True)
        while cur < end_ms:
            params = {
                "exchange": exchange, "symbol": sym, "interval": interval,
                "limit": 1000, "start_time": cur, "end_time": end_ms,
            }
            try:
                data, _ = cg_get(path, params)
            except RuntimeError as e:
                msg = str(e)
                if "earliest allowed" in msg.lower() or "Invalid time range" in msg:
                    earliest = parse_earliest_ms(msg)
                    if earliest and earliest > cur:
                        print(f"    clamp start → {fmt_t(earliest//1000)}", flush=True)
                        cur = earliest
                        continue
                print(f"    skip {sym} {interval}: {e}", flush=True)
                break
            if not data:
                break
            rows = []
            for d in data:
                t = int(d["time"]) // 1000
                rows.append((
                    exchange, sym, interval, t,
                    float(d.get("open") or 0), float(d.get("high") or 0),
                    float(d.get("low") or 0), float(d.get("close") or 0),
                ))
            upsert_ohlc(conn, table, rows)
            n += len(rows)
            last_ms = int(data[-1]["time"])
            nxt = last_ms + step
            if nxt <= cur:
                break
            cur = nxt
            if len(data) < 1000:
                break
        conn.commit()
        print(f"    +{n}  total {count_rows(conn, table, {'exchange':exchange,'symbol':sym,'interval':interval})}", flush=True)


def cmd_backfill(args):
    load_secrets()
    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    end_ms = int(time.time() * 1000)
    start_ms = int(datetime(2019, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    conn = connect()
    print(f"data dir {data_dir()}", flush=True)
    print("Binance klines 1h,4h...", flush=True)
    collect_binance_klines(conn, symbols, ["1h", "4h"], start_ms, end_ms)
    print("Coinglass OI 1d / 4h / 1h...", flush=True)
    collect_cg_ohlc(conn, "oi", "/api/futures/open-interest/history",
                    symbols, "1d", "Binance", start_ms, end_ms)
    collect_cg_ohlc(conn, "oi", "/api/futures/open-interest/history",
                    symbols, "4h", "Binance", start_ms, end_ms)
    collect_cg_ohlc(conn, "oi", "/api/futures/open-interest/history",
                    symbols, "1h", "Binance", start_ms, end_ms)
    print("Coinglass funding 8h...", flush=True)
    collect_cg_ohlc(conn, "funding", "/api/futures/funding-rate/history",
                    symbols, "8h", "Binance", start_ms, end_ms)
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('last_backfill',?)", (str(int(time.time())),))
    conn.commit()
    conn.close()
    print("done", flush=True)


def cmd_update(args):
    # same as backfill but starts from max(t) already in each series
    cmd_backfill(args)


def cmd_status(_args):
    load_secrets()
    p = db_path()
    if not p.exists():
        print(f"no db at {p}")
        return
    conn = connect()
    print(f"db {p}  {p.stat().st_size/1e6:.1f} MB")
    for table in ("klines", "oi", "funding"):
        rows = conn.execute(
            f"SELECT symbol, interval, COUNT(*), MIN(t), MAX(t) FROM {table} GROUP BY 1,2 ORDER BY 1,2"
        ).fetchall()
        extra = "exchange," if table != "klines" else ""
        if table != "klines":
            rows = conn.execute(
                f"SELECT symbol, interval, COUNT(*), MIN(t), MAX(t) FROM {table} GROUP BY 1,2 ORDER BY 1,2"
            ).fetchall()
        print(f"\n== {table} ==")
        print(f"{'series':<16} {'n':>7} {'from':<18} {'to':<18}")
        for sym, iv, n, a, b in rows:
            print(f"{sym+' '+iv:<16} {n:7d} {fmt_t(a):<18} {fmt_t(b):<18}")
    conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["backfill", "update", "status"])
    ap.add_argument("--symbols", default=DEFAULT_SYMBOLS)
    args = ap.parse_args()
    if args.cmd == "status":
        cmd_status(args)
    elif args.cmd in ("backfill", "update"):
        cmd_backfill(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED", type(e).__name__, e, file=sys.stderr)
        raise
