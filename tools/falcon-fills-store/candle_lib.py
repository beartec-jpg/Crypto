#!/usr/bin/env python3
# Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
"""OHLCV from timed Falcon fills + explorer block-time helpers.

Provenance (Falcon-faucet-wallet explorer-api):
  observed_at = Date.now() when the explorer API instance first remembered the tip
                (indexer observation / arrival). NOT a chain header timestamp.
  sealed_at   = node status tip_sealed_at_ms, else last_pack_at_ms, when > 0
                (nullable). Closest public seal/pack wall time the explorer exposes.

OHLCV bucketing uses sealed_at only. observed_at may be stored for diagnostics
but must never silently drive candle times.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

INTERVAL_SEC = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}

# Only this source may drive OHLCV / time_status=timed.
CANONICAL_OHLCV_SOURCE = "explorer.sealed_at"
OBSERVATION_ONLY_SOURCE = "explorer.observed_at"


def parse_iso_to_unix(iso: str | None) -> int | None:
    if not iso:
        return None
    s = iso.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def resolve_ohlcv_block_unix(sealed_at: str | None) -> tuple[int | None, str | None]:
    """Canonical OHLCV time: explorer sealed_at only. Never observed_at."""
    u = parse_iso_to_unix(sealed_at)
    if u is not None:
        return u, CANONICAL_OHLCV_SOURCE
    return None, None


def resolve_observation_unix(observed_at: str | None) -> tuple[int | None, str | None]:
    """Indexer observation time (diagnostics only — not for OHLCV)."""
    u = parse_iso_to_unix(observed_at)
    if u is not None:
        return u, OBSERVATION_ONLY_SOURCE
    return None, None


def resolve_block_unix(sealed_at: str | None, observed_at: str | None) -> tuple[int | None, str | None]:
    """Backward-compatible name: OHLCV resolution = sealed_at only.

    observed_at is intentionally ignored for return values (kept in signature so
    callers that still pass it do not accidentally regain observation timing).
    """
    _ = observed_at
    return resolve_ohlcv_block_unix(sealed_at)


def bucket_start(unix_sec: int, interval: str) -> int:
    step = INTERVAL_SEC[interval]
    return unix_sec - (unix_sec % step)


@dataclass(frozen=True)
class TimedFill:
    height: int
    price: float  # FPL per whole base
    base_units: float  # whole base
    side: str
    unix: int
    time_source: str
    natural_key: tuple
    dup_seq: int


def assign_dup_seq(fills: list[dict[str, Any]], key_fn) -> list[tuple[dict[str, Any], int]]:
    """Preserve multiplicity: identical natural keys in one batch get dup_seq 0..n-1."""
    counts: dict[Any, int] = {}
    out: list[tuple[dict[str, Any], int]] = []
    for f in fills:
        k = key_fn(f)
        seq = counts.get(k, 0)
        counts[k] = seq + 1
        out.append((f, seq))
    return out


def build_candles(fills: Iterable[TimedFill], interval: str) -> list[dict[str, Any]]:
    if interval not in INTERVAL_SEC:
        raise ValueError(f"unsupported interval {interval}")
    # Refuse observation-timed fills even if a caller mis-tags them.
    safe = [f for f in fills if f.time_source == CANONICAL_OHLCV_SOURCE]
    buckets: dict[int, list[TimedFill]] = {}
    for f in safe:
        b = bucket_start(f.unix, interval)
        buckets.setdefault(b, []).append(f)
    candles: list[dict[str, Any]] = []
    for t in sorted(buckets):
        xs = sorted(buckets[t], key=lambda f: (f.unix, f.height, f.dup_seq))
        o = xs[0].price
        c = xs[-1].price
        h = max(x.price for x in xs)
        l = min(x.price for x in xs)
        vol = sum(x.base_units for x in xs)
        candles.append(
            {
                "time": t,
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": vol,
                "fillCount": len(xs),
            }
        )
    return candles


def coverage_gaps(candles: list[dict[str, Any]], interval: str) -> list[dict[str, Any]]:
    """Report missing buckets between first and last candle (empty states)."""
    if len(candles) < 2:
        return []
    step = INTERVAL_SEC[interval]
    gaps = []
    times = [c["time"] for c in candles]
    for a, b in zip(times, times[1:]):
        expect = a + step
        if b > expect:
            gaps.append({"fromTime": expect, "toTime": b - step, "reason": "no_timed_fills_in_bucket"})
    return gaps
