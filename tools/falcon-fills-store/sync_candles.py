#!/usr/bin/env python3
# Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
"""Enrich fills with explorer *canonical* block times, build OHLCV, push ingest.

Time provenance (Falcon-faucet-wallet `src/lib/explorer-api/node.ts` + `mappers.ts`):
  - observed_at = Date.now() when the explorer API first remembered the tip
    (indexer observation). Retention: "recent tips observed by this API instance".
  - sealed_at   = node `tip_sealed_at_ms` else `last_pack_at_ms` when > 0 (nullable).

OHLCV uses sealed_at only. observed_at is stored for diagnostics and must never
silently become candle time. Falcon Cloud `fpl_status` currently exposes neither
tip_sealed_at_ms nor last_pack_at_ms, so sealed_at is typically null and candles
remain unavailable until a legitimate seal/pack wall time appears.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

from candle_lib import (
    CANONICAL_OHLCV_SOURCE,
    OBSERVATION_ONLY_SOURCE,
    TimedFill,
    build_candles,
    coverage_gaps,
    resolve_observation_unix,
    resolve_ohlcv_block_unix,
)

DEFAULT_DB = "/var/lib/falcon-fills-store/fills.sqlite"
EXPLORER_BLOCKS = os.environ.get(
    "FALCON_EXPLORER_BLOCKS_URL",
    "https://falcon-fpl.com/api/v1/explorer/blocks?limit=50",
)
INGEST_URL = os.environ.get(
    "FALCON_BRAIN_INGEST_URL",
    "https://www.beartec.uk/api/crypto/falcon/ingest",
)
MARKETS = {
    "BTC4": {"pair": "BTC4-FPL", "base_decimals": 8, "price_scale": 100_000_000},
    "USDC": {"pair": "USDC-FPL", "base_decimals": 6, "price_scale": 1_000_000},
}
TIMEFRAMES = ("1m", "5m", "15m", "1h")

TIME_SOURCE_NOTE = (
    "OHLCV uses explorer.sealed_at only (node tip_sealed_at_ms|last_pack_at_ms). "
    "explorer.observed_at is indexer Date.now() at tip-remember and is NOT used for candles."
)


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db), timeout=60)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS block_times (
          height INTEGER PRIMARY KEY,
          hash TEXT,
          sealed_at TEXT,
          observed_at TEXT,
          block_unix INTEGER,
          time_source TEXT NOT NULL,
          recorded_at TEXT NOT NULL
        );
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(fills)").fetchall()}
    if "dup_seq" not in cols:
        conn.execute("ALTER TABLE fills ADD COLUMN dup_seq INTEGER NOT NULL DEFAULT 0")
    if "block_time_source" not in cols:
        conn.execute("ALTER TABLE fills ADD COLUMN block_time_source TEXT")
    if "time_status" not in cols:
        conn.execute("ALTER TABLE fills ADD COLUMN time_status TEXT NOT NULL DEFAULT 'untimed'")
    conn.execute("DROP INDEX IF EXISTS fills_natural_uid")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS fills_natural_uid ON fills (
          height, asset, side, price, base, quote, taker, maker,
          ifnull(taker_order, -1),
          ifnull(maker_order, -1),
          dup_seq
        )
        """
    )
    # Demote any rows previously timed from observation alone.
    conn.execute(
        """
        UPDATE block_times
        SET block_unix=NULL,
            time_source=?
        WHERE time_source != ? OR (sealed_at IS NULL AND block_unix IS NOT NULL)
        """,
        (OBSERVATION_ONLY_SOURCE, CANONICAL_OHLCV_SOURCE),
    )
    conn.execute(
        """
        UPDATE fills
        SET block_time_unix=NULL,
            block_time_source=NULL,
            time_status='untimed'
        WHERE time_status='timed'
          AND (block_time_source IS NULL OR block_time_source != ?)
        """,
        (CANONICAL_OHLCV_SOURCE,),
    )
    conn.commit()


def fetch_explorer_blocks() -> list[dict]:
    req = urllib.request.Request(EXPLORER_BLOCKS, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())
    items = data.get("items") if isinstance(data, dict) else data
    return list(items or [])


def upsert_block_times(conn: sqlite3.Connection, items: list[dict]) -> dict:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    stored = 0
    canonical = 0
    observation_only = 0
    for b in items:
        height = int(b["height"])
        sealed = b.get("sealed_at")
        observed = b.get("observed_at")
        unix, src = resolve_ohlcv_block_unix(sealed if isinstance(sealed, str) else None)
        if unix is None:
            # Persist observation for diagnostics; do not set block_unix for OHLCV.
            _ou, _ = resolve_observation_unix(observed if isinstance(observed, str) else None)
            src = OBSERVATION_ONLY_SOURCE
            observation_only += 1
        else:
            canonical += 1
        conn.execute(
            """
            INSERT INTO block_times(height, hash, sealed_at, observed_at, block_unix, time_source, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(height) DO UPDATE SET
              hash=excluded.hash,
              sealed_at=COALESCE(excluded.sealed_at, block_times.sealed_at),
              observed_at=COALESCE(excluded.observed_at, block_times.observed_at),
              block_unix=CASE
                WHEN excluded.time_source=? THEN excluded.block_unix
                WHEN block_times.time_source=? THEN block_times.block_unix
                ELSE NULL
              END,
              time_source=CASE
                WHEN excluded.time_source=? THEN excluded.time_source
                WHEN block_times.time_source=? THEN block_times.time_source
                ELSE excluded.time_source
              END
            """,
            (
                height,
                b.get("hash"),
                sealed,
                observed,
                unix,  # may be None for observation-only
                src,
                now,
                CANONICAL_OHLCV_SOURCE,
                CANONICAL_OHLCV_SOURCE,
                CANONICAL_OHLCV_SOURCE,
                CANONICAL_OHLCV_SOURCE,
            ),
        )
        stored += 1
    conn.commit()
    return {
        "stored": stored,
        "canonical_sealed": canonical,
        "observation_only": observation_only,
    }


def enrich_fills(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        """
        SELECT f.id, f.height, bt.block_unix, bt.time_source
        FROM fills f
        JOIN block_times bt ON bt.height = f.height
        WHERE bt.time_source = ?
          AND bt.block_unix IS NOT NULL
          AND (f.block_time_unix IS NULL OR f.time_status != 'timed'
               OR ifnull(f.block_time_source,'') != ?)
        """,
        (CANONICAL_OHLCV_SOURCE, CANONICAL_OHLCV_SOURCE),
    ).fetchall()
    for r in rows:
        conn.execute(
            """
            UPDATE fills
            SET block_time_unix=?, block_time_source=?, time_status='timed'
            WHERE id=?
            """,
            (r["block_unix"], r["time_source"], r["id"]),
        )
    conn.commit()
    return {"enriched": len(rows)}


def load_timed_fills(conn: sqlite3.Connection, asset: str) -> list[TimedFill]:
    m = MARKETS[asset]
    scale = m["price_scale"]
    bdec = m["base_decimals"]
    rows = conn.execute(
        """
        SELECT height, price, base, side, block_time_unix, block_time_source,
               taker, maker, taker_order, maker_order, ifnull(dup_seq,0) AS dup_seq
        FROM fills
        WHERE asset=? AND time_status='timed' AND block_time_unix IS NOT NULL
          AND block_time_source=?
        ORDER BY block_time_unix ASC, height ASC, dup_seq ASC
        """,
        (asset, CANONICAL_OHLCV_SOURCE),
    ).fetchall()
    out: list[TimedFill] = []
    for r in rows:
        price = int(r["price"]) / scale
        base_units = int(r["base"]) / (10**bdec)
        nat = (
            r["height"],
            asset,
            r["side"],
            r["price"],
            r["base"],
            r["taker"],
            r["maker"],
            r["taker_order"],
            r["maker_order"],
        )
        out.append(
            TimedFill(
                height=int(r["height"]),
                price=price,
                base_units=base_units,
                side=str(r["side"]),
                unix=int(r["block_time_unix"]),
                time_source=CANONICAL_OHLCV_SOURCE,
                natural_key=nat,
                dup_seq=int(r["dup_seq"] or 0),
            )
        )
    return out


def push_candles(pair: str, timeframe: str, candles: list[dict], coverage: dict, token: str) -> dict:
    body = json.dumps(
        {"pair": pair, "timeframe": timeframe, "candles": candles, "coverage": coverage}
    ).encode()
    req = urllib.request.Request(
        INGEST_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {"ok": True, "status": resp.status, "body": json.loads(resp.read().decode())}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()[:200]
        return {"ok": False, "status": e.code, "error": raw}
    except Exception as e:
        return {"ok": False, "status": None, "error": f"{type(e).__name__}:{e}"}


def main() -> int:
    db = Path(os.environ.get("FALCON_FILLS_DB", DEFAULT_DB))
    token = os.environ.get("FALCON_BRAIN_INGEST_TOKEN", "").strip()
    conn = connect(db)
    migrate(conn)
    summary: dict = {"blocks": {}, "enriched": 0, "pushes": []}
    try:
        items = fetch_explorer_blocks()
        summary["blocks"] = upsert_block_times(conn, items)
        summary["enriched"] = enrich_fills(conn)["enriched"]
        tip_stats = conn.execute(
            """
            SELECT
              SUM(CASE WHEN time_source=? THEN 1 ELSE 0 END) AS canonical,
              SUM(CASE WHEN time_source=? THEN 1 ELSE 0 END) AS observation_only,
              COUNT(*) AS total
            FROM block_times
            """,
            (CANONICAL_OHLCV_SOURCE, OBSERVATION_ONLY_SOURCE),
        ).fetchone()
        for asset, meta in MARKETS.items():
            timed = load_timed_fills(conn, asset)
            untimed = conn.execute(
                "SELECT COUNT(*) c FROM fills WHERE asset=? AND time_status!='timed'",
                (asset,),
            ).fetchone()["c"]
            time_quality = "canonical_sealed" if timed else "unavailable"
            for tf in TIMEFRAMES:
                candles = build_candles(timed, tf)
                gaps = coverage_gaps(candles, tf)
                coverage = {
                    "pair": meta["pair"],
                    "timedFills": len(timed),
                    "untimedFills": int(untimed),
                    "firstTimedHeight": timed[0].height if timed else None,
                    "lastTimedHeight": timed[-1].height if timed else None,
                    "firstTime": candles[0]["time"] if candles else None,
                    "lastTime": candles[-1]["time"] if candles else None,
                    "gaps": gaps,
                    "ringLimitNote": "RPC fpl_fills returns at most RECENT_FILLS=200; not full history",
                    "timeSource": TIME_SOURCE_NOTE,
                    "timeQuality": time_quality,
                    "canonicalTipsStored": int(tip_stats["canonical"] or 0),
                    "observationOnlyTipsStored": int(tip_stats["observation_only"] or 0),
                    "emptyReasonHint": None
                    if candles
                    else (
                        "no_canonical_block_time"
                        if int(tip_stats["canonical"] or 0) == 0
                        else "no_timed_candles_yet"
                    ),
                }
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS candle_export_meta (
                      pair TEXT NOT NULL,
                      timeframe TEXT NOT NULL,
                      meta_json TEXT NOT NULL,
                      candle_count INTEGER NOT NULL,
                      updated_at TEXT NOT NULL,
                      PRIMARY KEY(pair, timeframe)
                    )
                    """
                )
                from datetime import datetime, timezone

                now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                conn.execute(
                    """
                    INSERT INTO candle_export_meta(pair, timeframe, meta_json, candle_count, updated_at)
                    VALUES (?,?,?,?,?)
                    ON CONFLICT(pair, timeframe) DO UPDATE SET
                      meta_json=excluded.meta_json, candle_count=excluded.candle_count, updated_at=excluded.updated_at
                    """,
                    (meta["pair"], tf, json.dumps(coverage), len(candles), now),
                )
                conn.commit()
                if not token:
                    summary["pushes"].append(
                        {"pair": meta["pair"], "tf": tf, "skipped": "no_token", "candles": len(candles)}
                    )
                    continue
                result = push_candles(meta["pair"], tf, candles, coverage, token)
                summary["pushes"].append(
                    {"pair": meta["pair"], "tf": tf, "candles": len(candles), "timeQuality": time_quality, **result}
                )
    finally:
        conn.close()
    print(json.dumps(summary, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
