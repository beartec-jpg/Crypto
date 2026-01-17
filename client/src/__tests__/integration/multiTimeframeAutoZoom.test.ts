/**
 * Integration tests for multi-timeframe auto-zoom feature
 * Tests the complete workflow of auto-switching timeframes based on zoom level
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTimeframeMetrics, determineOptimalTimeframe, shouldSwitchTimeframe } from '@/lib/timeframeUtils';
import type { TimeframeInterval, TimeframeMetrics } from '@/types/timeframes';

describe('Multi-Timeframe Auto-Zoom', () => {
  describe('Candle Width Calculations', () => {
    it('should calculate correct candle width for given visible candles', () => {
      const metrics = calculateTimeframeMetrics(100, 1000, 1);
      
      expect(metrics.visibleCandles).toBe(100);
      expect(metrics.candleWidth).toBe(10); // 1000px / 100 candles
      expect(metrics.chartWidth).toBe(1000);
      expect(metrics.zoomScale).toBe(1);
    });

    it('should handle very narrow candles (< 1.5px)', () => {
      const metrics = calculateTimeframeMetrics(1000, 1000, 1);
      
      expect(metrics.candleWidth).toBe(1); // Below minimum threshold
    });

    it('should handle very wide candles (> 8px)', () => {
      const metrics = calculateTimeframeMetrics(50, 1000, 1);
      
      expect(metrics.candleWidth).toBe(20); // Above switch-down threshold
    });
  });

  describe('Timeframe Switching Logic with Hysteresis', () => {
    it('should suggest larger timeframe when candles reach 1px (zoom out)', () => {
      // Simulate zooming out: many candles = small width
      const metrics: TimeframeMetrics = {
        visibleCandles: 1000,
        candleWidth: 1.0, // At switch threshold
        chartWidth: 1000,
        zoomScale: 0.5
      };

      const suggested = determineOptimalTimeframe(metrics, '1h');
      expect(suggested).toBe('4h'); // Should step UP to next larger timeframe
    });

    it('should suggest smaller timeframe when candles reach 8px (zoom in)', () => {
      // Simulate zooming in: few candles = large width
      const metrics: TimeframeMetrics = {
        visibleCandles: 50,
        candleWidth: 8.5, // Above switch-down threshold
        chartWidth: 1000,
        zoomScale: 2
      };

      const suggested = determineOptimalTimeframe(metrics, '4h');
      expect(suggested).toBe('1h'); // Should step DOWN to next smaller timeframe
    });

    it('should NOT switch when width is between 1px and 8px (hysteresis)', () => {
      // Candles at 5px - within acceptable range
      const metrics: TimeframeMetrics = {
        visibleCandles: 200,
        candleWidth: 5.0,
        chartWidth: 1000,
        zoomScale: 1
      };

      const suggested = determineOptimalTimeframe(metrics, '1h');
      expect(suggested).toBe('1h'); // Stay on current timeframe
    });

    it('should prevent flickering between timeframes', () => {
      const currentTimeframe: TimeframeInterval = '1h';
      
      // At 1.5px - just switched up to 4h
      const metrics1: TimeframeMetrics = {
        visibleCandles: 666,
        candleWidth: 1.5,
        chartWidth: 1000,
        zoomScale: 0.7
      };
      
      // Should NOT immediately switch back down
      const suggested1 = determineOptimalTimeframe(metrics1, '4h');
      expect(suggested1).toBe('4h'); // Hysteresis prevents switch back

      // Need to reach 8px before switching down
      const metrics2: TimeframeMetrics = {
        visibleCandles: 125,
        candleWidth: 8.0,
        chartWidth: 1000,
        zoomScale: 1.5
      };
      
      const suggested2 = determineOptimalTimeframe(metrics2, '4h');
      expect(suggested2).toBe('1h'); // Now can switch down
    });
  });

  describe('Switch Decision Logic', () => {
    it('should decide to switch when candles are at 1px', () => {
      const metrics: TimeframeMetrics = {
        visibleCandles: 1000,
        candleWidth: 1.0,
        chartWidth: 1000,
        zoomScale: 0.5
      };

      const shouldSwitch = shouldSwitchTimeframe('1h', '4h', metrics);
      expect(shouldSwitch).toBe(true);
    });

    it('should NOT switch when current and suggested are the same', () => {
      const metrics: TimeframeMetrics = {
        visibleCandles: 100,
        candleWidth: 10,
        chartWidth: 1000,
        zoomScale: 1
      };

      const shouldSwitch = shouldSwitchTimeframe('1h', '1h', metrics);
      expect(shouldSwitch).toBe(false);
    });

    it('should switch when candles are too wide (10px)', () => {
      const metrics: TimeframeMetrics = {
        visibleCandles: 50,
        candleWidth: 10.0,
        chartWidth: 1000,
        zoomScale: 2
      };

      const shouldSwitch = shouldSwitchTimeframe('4h', '1h', metrics);
      expect(shouldSwitch).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should stay on 1d when already at largest timeframe', () => {
      const metrics: TimeframeMetrics = {
        visibleCandles: 2000,
        candleWidth: 0.5, // Very small
        chartWidth: 1000,
        zoomScale: 0.1
      };

      const suggested = determineOptimalTimeframe(metrics, '1d');
      expect(suggested).toBe('1d'); // Cannot go larger
    });

    it('should stay on 15m when already at smallest timeframe', () => {
      const metrics: TimeframeMetrics = {
        visibleCandles: 20,
        candleWidth: 25, // Very large
        chartWidth: 1000,
        zoomScale: 5
      };

      const suggested = determineOptimalTimeframe(metrics, '15m');
      expect(suggested).toBe('15m'); // Cannot go smaller
    });

    it('should handle zero visible candles gracefully', () => {
      const metrics = calculateTimeframeMetrics(0, 1000, 1);
      
      expect(metrics.candleWidth).toBe(0);
      expect(metrics.visibleCandles).toBe(0);
    });
  });

  describe('Timeframe Progression', () => {
    it('should progress through timeframes step-by-step when zooming out', () => {
      let currentTf: TimeframeInterval = '15m';
      
      // Start with comfortable width
      let metrics: TimeframeMetrics = {
        visibleCandles: 100,
        candleWidth: 10,
        chartWidth: 1000,
        zoomScale: 1
      };
      expect(determineOptimalTimeframe(metrics, currentTf)).toBe('15m');

      // Zoom out to trigger first switch
      metrics = { ...metrics, visibleCandles: 1000, candleWidth: 1.0 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('1h'); // 15m → 1h

      // Continue zooming out
      metrics = { ...metrics, visibleCandles: 2000, candleWidth: 0.5 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('4h'); // 1h → 4h

      // Continue zooming out
      metrics = { ...metrics, visibleCandles: 4000, candleWidth: 0.25 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('1d'); // 4h → 1d

      // Cannot zoom out further
      metrics = { ...metrics, visibleCandles: 8000, candleWidth: 0.125 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('1d'); // Stay at 1d
    });

    it('should progress through timeframes step-by-step when zooming in', () => {
      let currentTf: TimeframeInterval = '1d';
      
      // Start zoomed out
      let metrics: TimeframeMetrics = {
        visibleCandles: 100,
        candleWidth: 5.0, // Between thresholds - stable
        chartWidth: 1000,
        zoomScale: 1
      };
      expect(determineOptimalTimeframe(metrics, currentTf)).toBe('1d');

      // Zoom in to trigger first switch (need > 8px)
      metrics = { ...metrics, visibleCandles: 50, candleWidth: 10 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('4h'); // 1d → 4h

      // Continue zooming in (but not enough to trigger switch due to hysteresis)
      metrics = { ...metrics, visibleCandles: 100, candleWidth: 5 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('4h'); // Stay at 4h (hysteresis)

      // Zoom in more (> 8px)
      metrics = { ...metrics, visibleCandles: 50, candleWidth: 10 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('1h'); // 4h → 1h

      // Continue zooming in (> 8px)
      metrics = { ...metrics, visibleCandles: 25, candleWidth: 15 };
      currentTf = determineOptimalTimeframe(metrics, currentTf);
      expect(currentTf).toBe('15m'); // 1h → 15m
    });
  });

  describe('Minimum Width Enforcement', () => {
    it('should never allow candles below 1.5px without switching', () => {
      const testScenarios = [
        { candles: 1000, width: 1.0, currentTf: '15m' as TimeframeInterval },
        { candles: 2000, width: 0.5, currentTf: '1h' as TimeframeInterval },
        { candles: 4000, width: 0.25, currentTf: '4h' as TimeframeInterval },
      ];

      testScenarios.forEach(({ candles, width, currentTf }) => {
        const metrics: TimeframeMetrics = {
          visibleCandles: candles,
          candleWidth: width,
          chartWidth: 1000,
          zoomScale: 0.5
        };

        const suggested = determineOptimalTimeframe(metrics, currentTf);
        expect(suggested).not.toBe(currentTf); // Should suggest a switch
      });
    });
  });
});
