#!/usr/bin/env python3
"""Klines-only warehouse fill (no Coinglass). Reuses collect_market_data."""
from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collect_market_data as cmd

SYMBOLS = [s.strip() for s in cmd.DEFAULT_SYMBOLS.split(",")]
INTERVALS = ["15m", "1h", "4h"]


def main():
    end_ms = int(time.time() * 1000)
    start_ms = int(datetime(2019, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    conn = cmd.connect()
    print(f"data dir {cmd.data_dir()}", flush=True)
    print("Binance klines 15m,1h,4h...", flush=True)
    cmd.collect_binance_klines(conn, SYMBOLS, INTERVALS, start_ms, end_ms)
    conn.execute(
        "INSERT OR REPLACE INTO meta(key,value) VALUES('last_klines',?)",
        (str(int(time.time())),),
    )
    conn.commit()
    conn.close()
    print("done", flush=True)


if __name__ == "__main__":
    main()
