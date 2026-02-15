import { describe, it, expect, vi } from 'vitest';
import { findDrawingsNearClick, type Drawing } from '../../lib/drawingHitDetection';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

// Mock chart and series
const createMockChart = () => {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time, // Simple 1:1 mapping for testing
    }),
  } as unknown as IChartApi;
};

const createMockSeries = () => {
  return {
    priceToCoordinate: (price: number) => price, // Simple 1:1 mapping for testing
  } as unknown as ISeriesApi<'Candlestick'>;
};

describe('drawingHitDetection', () => {
  const chart = createMockChart();
  const series = createMockSeries();

  describe('Trendline with extensions', () => {
    it('should detect click on main trendline segment', () => {
      const drawing: Drawing = {
        id: 'tl1',
        type: 'trendline',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click near the middle of the line
      const hits = findDrawingsNearClick(150, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('tl1');
    });

    it('should detect click on extended right portion', () => {
      const drawing: Drawing = {
        id: 'tl2',
        type: 'trendline',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: { extendRight: true },
      };

      // Click beyond the right endpoint
      const hits = findDrawingsNearClick(300, 300, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('tl2');
    });

    it('should detect click on extended left portion', () => {
      const drawing: Drawing = {
        id: 'tl3',
        type: 'trendline',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: { extendLeft: true },
      };

      // Click before the left endpoint
      const hits = findDrawingsNearClick(50, 50, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('tl3');
    });

    it('should not detect click on non-extended portion', () => {
      const drawing: Drawing = {
        id: 'tl4',
        type: 'trendline',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: { extendRight: false, extendLeft: false },
      };

      // Click far beyond the endpoints
      const hits = findDrawingsNearClick(300, 300, [drawing], chart, series);
      expect(hits).toHaveLength(0);
    });
  });

  describe('Horizontal line', () => {
    it('should detect click anywhere along horizontal line', () => {
      const drawing: Drawing = {
        id: 'h1',
        type: 'horizontal',
        points: [{ time: 100, price: 150 }],
        style: {},
      };

      // Click far from the anchor point but at the same price level
      const hits = findDrawingsNearClick(500, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('h1');
    });

    it('should not detect click far from horizontal line', () => {
      const drawing: Drawing = {
        id: 'h2',
        type: 'horizontal',
        points: [{ time: 100, price: 150 }],
        style: {},
      };

      // Click more than CLICK_RADIUS (20) pixels away vertically
      const hits = findDrawingsNearClick(500, 180, [drawing], chart, series);
      expect(hits).toHaveLength(0);
    });
  });

  describe('Fibonacci Retracement levels', () => {
    it('should detect click on any visible fib level', () => {
      const drawing: Drawing = {
        id: 'fib1',
        type: 'fib_retracement',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click at 50% level (price 150)
      const hits = findDrawingsNearClick(150, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('fib1');
    });

    it('should detect click on 0% level', () => {
      const drawing: Drawing = {
        id: 'fib3',
        type: 'fib_retracement',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click at 0% level (end price = 200)
      const hits = findDrawingsNearClick(150, 200, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('fib3');
    });

    it('should not detect click far from all fib levels', () => {
      const drawing: Drawing = {
        id: 'fib4',
        type: 'fib_retracement',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Fib levels range from 0% (200) to 161.8% (38.2)
      // Click far from any fib level (> CLICK_RADIUS=20 away from lowest level at ~38)
      const hits = findDrawingsNearClick(150, 0, [drawing], chart, series);
      expect(hits).toHaveLength(0);
    });
  });

  describe('Trend-based Fibonacci', () => {
    it('should detect click on trend fib extension level', () => {
      const drawing: Drawing = {
        id: 'tfib1',
        type: 'trend_fib',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
          { time: 300, price: 180 },
        ],
        style: {},
      };

      // Click at 100% level (price 180 + 100 = 280)
      const hits = findDrawingsNearClick(350, 280, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('tfib1');
    });

    it('should not detect click far from all trend fib levels', () => {
      const drawing: Drawing = {
        id: 'tfib2',
        type: 'trend_fib',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
          { time: 300, price: 180 },
        ],
        style: {},
      };

      // Click far from any trend fib level
      const hits = findDrawingsNearClick(350, 50, [drawing], chart, series);
      expect(hits).toHaveLength(0);
    });
  });

  describe('Channel', () => {
    it('should detect click on top boundary', () => {
      const drawing: Drawing = {
        id: 'ch1',
        type: 'channel',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click at top boundary (price 200)
      const hits = findDrawingsNearClick(250, 200, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('ch1');
    });

    it('should detect click on bottom boundary', () => {
      const drawing: Drawing = {
        id: 'ch2',
        type: 'channel',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click at bottom boundary (price 100)
      const hits = findDrawingsNearClick(250, 100, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('ch2');
    });

    it('should detect click on 50% internal marker', () => {
      const drawing: Drawing = {
        id: 'ch3',
        type: 'channel',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click at 50% level (price 150)
      const hits = findDrawingsNearClick(250, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('ch3');
    });

    it('should not detect click on hidden internal marker', () => {
      const drawing: Drawing = {
        id: 'ch4',
        type: 'channel',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: { hiddenLevels: [0.5] }, // Hide 50% marker
      };

      // Click at 50% level should not detect the hidden marker
      const hits = findDrawingsNearClick(250, 150, [drawing], chart, series);
      // Should still detect top (200) or bottom (100) boundaries but not 50% (150)
      // Since we're clicking at Y=150 and boundaries are at Y=100 and Y=200,
      // the distance to boundaries should be 50 pixels, which is > CLICK_RADIUS (20)
      // So we should get no hits at all
      expect(hits).toHaveLength(0);
    });
  });

  describe('Multiple overlapping drawings', () => {
    it('should return all hits sorted by distance', () => {
      const drawings: Drawing[] = [
        {
          id: 'tl1',
          type: 'trendline',
          points: [
            { time: 100, price: 100 },
            { time: 200, price: 200 },
          ],
          style: {},
        },
        {
          id: 'h1',
          type: 'horizontal',
          points: [{ time: 100, price: 150 }],
          style: {},
        },
      ];

      // Click at position that's near both
      const hits = findDrawingsNearClick(150, 150, drawings, chart, series);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      // Should be sorted by distance (closest first)
      if (hits.length > 1) {
        expect(hits[0].distance).toBeLessThanOrEqual(hits[1].distance);
      }
    });
  });

  describe('Rectangle', () => {
    it('should detect click inside rectangle', () => {
      const drawing: Drawing = {
        id: 'rect1',
        type: 'rectangle',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click inside rectangle
      const hits = findDrawingsNearClick(150, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('rect1');
      expect(hits[0].distance).toBe(0);
    });

    it('should detect click near rectangle edge', () => {
      const drawing: Drawing = {
        id: 'rect2',
        type: 'rectangle',
        points: [
          { time: 100, price: 100 },
          { time: 200, price: 200 },
        ],
        style: {},
      };

      // Click just outside rectangle edge (within CLICK_RADIUS)
      const hits = findDrawingsNearClick(205, 150, [drawing], chart, series);
      expect(hits).toHaveLength(1);
      expect(hits[0].drawingId).toBe('rect2');
    });
  });
});
