/**
 * Tests for adaptive timeframe utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTimeframeMetrics,
  determineOptimalTimeframe,
  shouldSwitchTimeframe,
  getTimeframeRatio,
  formatTimeframe,
  getTimeframeDuration,
  calculateTimeframeCandleCount,
  isValidTimeframe
} from '@/lib/timeframeUtils';
import type { TimeframeInterval } from '@/types/timeframes';

describe('timeframeUtils', () => {
  describe('calculateTimeframeMetrics', () => {
    it('should calculate metrics correctly', () => {
      const metrics = calculateTimeframeMetrics(100, 1000, 1);
      expect(metrics.visibleCandles).toBe(100);
      expect(metrics.candleWidth).toBe(10);
      expect(metrics.chartWidth).toBe(1000);
      expect(metrics.zoomScale).toBe(1);
    });

    it('should handle zero candles', () => {
      const metrics = calculateTimeframeMetrics(0, 1000, 1);
      expect(metrics.candleWidth).toBe(0);
    });
  });

  describe('determineOptimalTimeframe', () => {
    it('should suggest larger timeframe when candles are too small', () => {
      const metrics = calculateTimeframeMetrics(200, 1000, 1); // 5px per candle
      const optimal = determineOptimalTimeframe(metrics, '1h');
      // Should suggest 4h or larger since candles are small
      expect(['4h', '1d']).toContain(optimal);
    });

    it('should suggest smaller timeframe when candles are too large', () => {
      const metrics = calculateTimeframeMetrics(20, 1000, 1); // 50px per candle
      const optimal = determineOptimalTimeframe(metrics, '1h');
      // Should suggest 15m or smaller since candles are large
      expect(['15m', '5m', '1m']).toContain(optimal);
    });

    it('should keep current timeframe when optimal', () => {
      const metrics = calculateTimeframeMetrics(80, 1000, 1); // ~12.5px per candle
      const optimal = determineOptimalTimeframe(metrics, '1h');
      expect(optimal).toBe('1h');
    });
  });

  describe('getTimeframeRatio', () => {
    it('should calculate correct ratios', () => {
      expect(getTimeframeRatio('1m', '5m')).toBe(5);
      expect(getTimeframeRatio('15m', '1h')).toBe(4);
      expect(getTimeframeRatio('1h', '4h')).toBe(4);
      expect(getTimeframeRatio('4h', '1d')).toBe(6);
    });

    it('should handle same timeframe', () => {
      expect(getTimeframeRatio('1h', '1h')).toBe(1);
    });
  });

  describe('shouldSwitchTimeframe', () => {
    it('should return false when on suggested timeframe', () => {
      const metrics = calculateTimeframeMetrics(80, 1000, 1);
      expect(shouldSwitchTimeframe('1h', '1h', metrics)).toBe(false);
    });

    it('should return true when candles are too small', () => {
      const metrics = calculateTimeframeMetrics(300, 1000, 1); // ~3.3px per candle
      expect(shouldSwitchTimeframe('1h', '4h', metrics)).toBe(true);
    });

    it('should return true when candles are too large', () => {
      const metrics = calculateTimeframeMetrics(30, 1000, 1); // ~33px per candle
      expect(shouldSwitchTimeframe('1h', '15m', metrics)).toBe(true);
    });
  });

  describe('formatTimeframe', () => {
    it('should format timeframes correctly', () => {
      expect(formatTimeframe('1m')).toBe('1 Minute');
      expect(formatTimeframe('5m')).toBe('5 Minutes');
      expect(formatTimeframe('15m')).toBe('15 Minutes');
      expect(formatTimeframe('1h')).toBe('1 Hour');
      expect(formatTimeframe('4h')).toBe('4 Hours');
      expect(formatTimeframe('1d')).toBe('1 Day');
    });
  });

  describe('getTimeframeDuration', () => {
    it('should return correct durations in milliseconds', () => {
      expect(getTimeframeDuration('1m')).toBe(60 * 1000);
      expect(getTimeframeDuration('5m')).toBe(5 * 60 * 1000);
      expect(getTimeframeDuration('15m')).toBe(15 * 60 * 1000);
      expect(getTimeframeDuration('1h')).toBe(60 * 60 * 1000);
      expect(getTimeframeDuration('4h')).toBe(4 * 60 * 60 * 1000);
      expect(getTimeframeDuration('1d')).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('calculateTimeframeCandleCount', () => {
    it('should calculate correct candle counts', () => {
      expect(calculateTimeframeCandleCount(100, '1m', '5m')).toBe(20);
      expect(calculateTimeframeCandleCount(100, '15m', '1h')).toBe(25);
      expect(calculateTimeframeCandleCount(100, '1h', '4h')).toBe(25);
    });

    it('should round up partial candles', () => {
      expect(calculateTimeframeCandleCount(103, '1m', '5m')).toBe(21);
    });
  });

  describe('isValidTimeframe', () => {
    it('should validate correct timeframes', () => {
      expect(isValidTimeframe('1m')).toBe(true);
      expect(isValidTimeframe('5m')).toBe(true);
      expect(isValidTimeframe('15m')).toBe(true);
      expect(isValidTimeframe('1h')).toBe(true);
      expect(isValidTimeframe('4h')).toBe(true);
      expect(isValidTimeframe('1d')).toBe(true);
    });

    it('should reject invalid timeframes', () => {
      expect(isValidTimeframe('2h')).toBe(false);
      expect(isValidTimeframe('1w')).toBe(false);
      expect(isValidTimeframe('invalid')).toBe(false);
    });
  });
});
