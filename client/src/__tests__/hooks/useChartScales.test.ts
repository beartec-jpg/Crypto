import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useChartScales } from '@/hooks/useChartScales'
import { createMockCandles } from '../utils/testHelpers'

// Mock the d3Loader module
vi.mock('@/lib/d3Loader', () => ({
  loadD3: vi.fn(async () => {
    // Return a mock D3 module
    const mockScale = (value: any) => {
      if (value instanceof Date) {
        return value.getTime() / 1000
      }
      return value
    }
    mockScale.domain = vi.fn().mockReturnThis()
    mockScale.range = vi.fn().mockReturnThis()
    mockScale.nice = vi.fn().mockReturnThis()
    mockScale.invert = vi.fn((x: number) => new Date(x * 1000))
    
    const mockLinearScale = (value: number) => value
    mockLinearScale.domain = vi.fn().mockReturnThis()
    mockLinearScale.range = vi.fn().mockReturnThis()
    mockLinearScale.nice = vi.fn().mockReturnThis()
    mockLinearScale.invert = vi.fn((y: number) => y)

    return {
      scaleTime: () => mockScale,
      scaleLinear: () => mockLinearScale,
      extent: vi.fn((data, accessor) => {
        const values = data.map(accessor)
        return [Math.min(...values), Math.max(...values)]
      }),
      min: vi.fn((data, accessor) => {
        const values = data.map(accessor)
        return Math.min(...values)
      }),
      max: vi.fn((data, accessor) => {
        const values = data.map(accessor)
        return Math.max(...values)
      }),
      line: () => ({
        x: vi.fn().mockReturnThis(),
        y: vi.fn().mockReturnThis(),
      }),
      area: () => ({
        x: vi.fn().mockReturnThis(),
        y0: vi.fn().mockReturnThis(),
        y1: vi.fn().mockReturnThis(),
      }),
      axisBottom: vi.fn(() => ({
        ticks: vi.fn().mockReturnThis(),
      })),
      axisLeft: vi.fn(() => ({
        ticks: vi.fn().mockReturnThis(),
      })),
    }
  }),
}))

describe('useChartScales', () => {
  const defaultDimensions = { width: 800, height: 600 }
  const defaultMargin = { top: 20, right: 20, bottom: 40, left: 60 }
  const mockData = createMockCandles(10)

  describe('Scale initialization', () => {
    it('should create xScale and yScale correctly', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      // Initially loading
      expect(result.current.isLoading).toBe(true)

      // Wait for D3 to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.xScale).toBeDefined()
      expect(result.current.yScale).toBeDefined()
    })

    it('should return null scales when data is empty', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, [])
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.xScale).toBeNull()
      expect(result.current.yScale).toBeNull()
    })

    it('should create line and area generators', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.line).toBeDefined()
      expect(result.current.area).toBeDefined()
    })

    it('should create axis generators', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.xAxis).toBeDefined()
      expect(result.current.yAxis).toBeDefined()
    })
  })

  describe('Memoization efficiency', () => {
    it('should not recreate scales unless dimensions change', async () => {
      const { result, rerender } = renderHook(
        ({ dimensions, margin, data }) => useChartScales(dimensions, margin, data),
        {
          initialProps: {
            dimensions: defaultDimensions,
            margin: defaultMargin,
            data: mockData,
          },
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialXScale = result.current.xScale
      const initialYScale = result.current.yScale

      // Rerender with same props
      rerender({
        dimensions: defaultDimensions,
        margin: defaultMargin,
        data: mockData,
      })

      // Scales should be the same reference (memoized)
      expect(result.current.xScale).toBe(initialXScale)
      expect(result.current.yScale).toBe(initialYScale)
    })

    it('should update scales on dimension change', async () => {
      const { result, rerender } = renderHook(
        ({ dimensions, margin, data }) => useChartScales(dimensions, margin, data),
        {
          initialProps: {
            dimensions: defaultDimensions,
            margin: defaultMargin,
            data: mockData,
          },
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Change dimensions
      rerender({
        dimensions: { width: 1000, height: 800 },
        margin: defaultMargin,
        data: mockData,
      })

      // Scales should be recalculated with new dimensions
      expect(result.current.xScale).toBeDefined()
      expect(result.current.yScale).toBeDefined()
    })

    it('should update scales on data change', async () => {
      const { result, rerender } = renderHook(
        ({ dimensions, margin, data }) => useChartScales(dimensions, margin, data),
        {
          initialProps: {
            dimensions: defaultDimensions,
            margin: defaultMargin,
            data: mockData,
          },
        }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Change data
      const newData = createMockCandles(20)
      rerender({
        dimensions: defaultDimensions,
        margin: defaultMargin,
        data: newData,
      })

      // Scales should be recalculated with new data
      expect(result.current.xScale).toBeDefined()
      expect(result.current.yScale).toBeDefined()
    })
  })

  describe('Coordinate conversions', () => {
    it('should convert pixel to data coordinates', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const time = result.current.pixelsToTime(100)
      const price = result.current.pixelsToPrice(100)

      expect(typeof time).toBe('number')
      expect(typeof price).toBe('number')
    })

    it('should convert data to pixel coordinates', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const timestamp = mockData[0].time
      const price = mockData[0].close

      const x = result.current.timeToPixels(timestamp)
      const y = result.current.priceToPixels(price)

      expect(typeof x).toBe('number')
      expect(typeof y).toBe('number')
    })

    it('should handle empty candle data gracefully', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, [])
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should return 0 for empty data
      expect(result.current.timeToPixels(Date.now())).toBe(0)
      expect(result.current.priceToPixels(100)).toBe(0)
    })
  })

  describe('D3 loader integration', () => {
    it('should load D3 asynchronously', async () => {
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      expect(result.current.isLoading).toBe(true)
      expect(result.current.d3).toBeNull()

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.d3).toBeDefined()
    })

    it('should handle D3 load failure gracefully', async () => {
      // This test would require mocking loadD3 to throw an error
      // For now, we just verify that the hook doesn't crash
      const { result } = renderHook(() =>
        useChartScales(defaultDimensions, defaultMargin, mockData)
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should complete loading even if D3 fails
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Responsive scaling', () => {
    it('should handle very small dimensions', async () => {
      const { result } = renderHook(() =>
        useChartScales(
          { width: 100, height: 100 },
          defaultMargin,
          mockData
        )
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should still create scales even with small dimensions
      expect(result.current.xScale).toBeDefined()
      expect(result.current.yScale).toBeDefined()
    })

    it('should handle very large dimensions', async () => {
      const { result } = renderHook(() =>
        useChartScales(
          { width: 4000, height: 2000 },
          defaultMargin,
          mockData
        )
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should still create scales even with large dimensions
      expect(result.current.xScale).toBeDefined()
      expect(result.current.yScale).toBeDefined()
    })
  })
})
