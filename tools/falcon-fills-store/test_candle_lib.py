#!/usr/bin/env python3
import unittest
from candle_lib import (
    CANONICAL_OHLCV_SOURCE,
    OBSERVATION_ONLY_SOURCE,
    TimedFill,
    assign_dup_seq,
    bucket_start,
    build_candles,
    coverage_gaps,
    parse_iso_to_unix,
    resolve_block_unix,
    resolve_observation_unix,
    resolve_ohlcv_block_unix,
)


class TestTimestamps(unittest.TestCase):
    def test_parse_iso(self):
        from datetime import datetime, timezone
        expected = int(datetime(2026, 11, 6, 1, 0, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual(parse_iso_to_unix("2026-11-06T01:00:00Z"), expected)

    def test_ohlcv_uses_sealed_only(self):
        from datetime import datetime, timezone
        expected = int(datetime(2026, 11, 6, 1, 0, 0, tzinfo=timezone.utc).timestamp())
        u, src = resolve_ohlcv_block_unix("2026-11-06T01:00:00Z")
        self.assertEqual(src, CANONICAL_OHLCV_SOURCE)
        self.assertEqual(u, expected)

    def test_observed_ignored_for_ohlcv(self):
        u, src = resolve_ohlcv_block_unix(None)
        self.assertIsNone(u)
        self.assertIsNone(src)
        # Compat wrapper must also ignore observed_at
        u2, src2 = resolve_block_unix(None, "2026-11-06T01:00:00Z")
        self.assertIsNone(u2)
        self.assertIsNone(src2)

    def test_observation_helper_separate(self):
        u, src = resolve_observation_unix("2026-11-06T01:00:00Z")
        self.assertEqual(src, OBSERVATION_ONLY_SOURCE)
        self.assertIsNotNone(u)

    def test_no_invent(self):
        u, src = resolve_block_unix(None, None)
        self.assertIsNone(u)
        self.assertIsNone(src)


class TestDupSeq(unittest.TestCase):
    def test_multiplicity(self):
        fills = [{"a": 1}, {"a": 1}, {"a": 2}, {"a": 1}]
        out = assign_dup_seq(fills, lambda f: f["a"])
        self.assertEqual([s for _, s in out], [0, 1, 0, 2])


class TestCandles(unittest.TestCase):
    def test_bucket_boundary(self):
        self.assertEqual(bucket_start(100, "1m"), 60)
        self.assertEqual(bucket_start(120, "1m"), 120)

    def test_ohlcv_order_requires_canonical_source(self):
        fills = [
            TimedFill(1, 10.0, 1.0, "buy", 120, CANONICAL_OHLCV_SOURCE, (1,), 0),
            TimedFill(2, 12.0, 2.0, "sell", 130, CANONICAL_OHLCV_SOURCE, (2,), 0),
            TimedFill(3, 11.0, 1.5, "buy", 140, CANONICAL_OHLCV_SOURCE, (3,), 0),
        ]
        c = build_candles(fills, "1m")
        self.assertEqual(len(c), 1)
        self.assertEqual(c[0]["time"], 120)
        self.assertEqual(c[0]["open"], 10.0)
        self.assertEqual(c[0]["high"], 12.0)
        self.assertEqual(c[0]["low"], 10.0)
        self.assertEqual(c[0]["close"], 11.0)
        self.assertEqual(c[0]["volume"], 4.5)
        self.assertEqual(c[0]["fillCount"], 3)

    def test_observation_source_excluded_from_candles(self):
        fills = [
            TimedFill(1, 10.0, 1.0, "buy", 120, OBSERVATION_ONLY_SOURCE, (1,), 0),
            TimedFill(2, 12.0, 2.0, "sell", 130, OBSERVATION_ONLY_SOURCE, (2,), 0),
        ]
        self.assertEqual(build_candles(fills, "1m"), [])

    def test_empty_gap(self):
        fills = [
            TimedFill(1, 1.0, 1.0, "buy", 0, CANONICAL_OHLCV_SOURCE, (1,), 0),
            TimedFill(2, 2.0, 1.0, "buy", 180, CANONICAL_OHLCV_SOURCE, (2,), 0),
        ]
        c = build_candles(fills, "1m")
        gaps = coverage_gaps(c, "1m")
        self.assertTrue(any(g["fromTime"] == 60 for g in gaps))

    def test_untimed_excluded(self):
        c = build_candles([], "5m")
        self.assertEqual(c, [])


if __name__ == "__main__":
    unittest.main()
