#!/usr/bin/env python3
import unittest
from candle_lib import (
    assign_dup_seq,
    bucket_start,
    build_candles,
    coverage_gaps,
    parse_iso_to_unix,
    resolve_block_unix,
    TimedFill,
)


class TestTimestamps(unittest.TestCase):
    def test_parse_iso(self):
        from datetime import datetime, timezone
        expected = int(datetime(2026, 11, 6, 1, 0, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual(parse_iso_to_unix("2026-11-06T01:00:00Z"), expected)

    def test_prefer_sealed(self):
        from datetime import datetime, timezone
        expected = int(datetime(2026, 11, 6, 1, 0, 0, tzinfo=timezone.utc).timestamp())
        u, src = resolve_block_unix("2026-11-06T01:00:00Z", "2026-11-06T02:00:00Z")
        self.assertEqual(src, "explorer.sealed_at")
        self.assertEqual(u, expected)

    def test_observed_fallback(self):
        u, src = resolve_block_unix(None, "2026-11-06T01:00:00Z")
        self.assertEqual(src, "explorer.observed_at")

    def test_no_invent(self):
        u, src = resolve_block_unix(None, None)
        self.assertIsNone(u)
        self.assertIsNone(src)


class TestDupSeq(unittest.TestCase):
    def test_multiplicity(self):
        fills = [
            {"a": 1},
            {"a": 1},
            {"a": 2},
            {"a": 1},
        ]
        out = assign_dup_seq(fills, lambda f: f["a"])
        self.assertEqual([s for _, s in out], [0, 1, 0, 2])


class TestCandles(unittest.TestCase):
    def test_bucket_boundary(self):
        self.assertEqual(bucket_start(100, "1m"), 60)
        self.assertEqual(bucket_start(120, "1m"), 120)

    def test_ohlcv_order(self):
        fills = [
            TimedFill(1, 10.0, 1.0, "buy", 120, "explorer.observed_at", (1,), 0),
            TimedFill(2, 12.0, 2.0, "sell", 130, "explorer.observed_at", (2,), 0),
            TimedFill(3, 11.0, 1.5, "buy", 140, "explorer.observed_at", (3,), 0),
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

    def test_empty_gap(self):
        fills = [
            TimedFill(1, 1.0, 1.0, "buy", 0, "s", (1,), 0),
            TimedFill(2, 2.0, 1.0, "buy", 180, "s", (2,), 0),
        ]
        c = build_candles(fills, "1m")
        gaps = coverage_gaps(c, "1m")
        self.assertTrue(any(g["fromTime"] == 60 for g in gaps))

    def test_untimed_excluded(self):
        # builder only accepts TimedFill — untimed never enter
        c = build_candles([], "5m")
        self.assertEqual(c, [])


if __name__ == "__main__":
    unittest.main()
