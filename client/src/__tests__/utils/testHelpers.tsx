import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CandleData } from '@/hooks/useChartScales'
import type { TrendlineData, HorizontalLineData, ChannelData } from '@/types/drawing'

/**
 * Create a QueryClient for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Render component with providers (QueryClient, etc.)
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  }
}

/**
 * Create mock candle data for testing
 */
export function createMockCandles(count: number = 10): CandleData[] {
  const baseTime = new Date('2024-01-01').getTime()
  const candles: CandleData[] = []
  
  for (let i = 0; i < count; i++) {
    const open = 100 + Math.random() * 10
    const close = open + (Math.random() - 0.5) * 5
    const high = Math.max(open, close) + Math.random() * 2
    const low = Math.min(open, close) - Math.random() * 2
    
    candles.push({
      time: baseTime + i * 60000, // 1 minute intervals
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000,
    })
  }
  
  return candles
}

/**
 * Create mock trendline data for testing
 */
export function createMockTrendline(overrides?: Partial<TrendlineData>): TrendlineData {
  return {
    id: `trendline-${Date.now()}`,
    p1: { time: Date.now(), price: 100 },
    p2: { time: Date.now() + 3600000, price: 110 },
    color: '#3b82f6',
    opacity: 1,
    lineStyle: 'solid',
    thickness: 2,
    extendLeft: false,
    extendRight: false,
    ...overrides,
  }
}

/**
 * Create mock horizontal line data for testing
 */
export function createMockHorizontal(overrides?: Partial<HorizontalLineData>): HorizontalLineData {
  return {
    id: `horizontal-${Date.now()}`,
    price: 100,
    color: '#facc15',
    opacity: 1,
    lineStyle: 'solid',
    thickness: 2,
    ...overrides,
  }
}

/**
 * Create mock channel data for testing
 */
export function createMockChannel(overrides?: Partial<ChannelData>): ChannelData {
  return {
    id: `channel-${Date.now()}`,
    p1: { time: Date.now(), price: 100 },
    p2: { time: Date.now() + 3600000, price: 110 },
    width: 10,
    color: '#22c55e',
    opacity: 0.3,
    lineStyle: 'solid',
    thickness: 2,
    internalLines: [],
    internalLineStyle: 'dashed',
    internalLineColor: '#22c55e',
    showExternalLines: true,
    ...overrides,
  }
}

/**
 * Mock D3 for unit tests (if needed)
 */
export function mockD3() {
  // Basic mock for D3 functionality
  return {
    scaleTime: () => ({
      domain: () => ({ range: () => ({ invert: (x: number) => new Date(x) }) }),
      range: () => ({ domain: () => ({}) }),
    }),
    scaleLinear: () => ({
      domain: () => ({ range: () => ({ nice: () => ({ invert: (y: number) => y }) }) }),
      range: () => ({ domain: () => ({}) }),
    }),
  }
}

/**
 * Wait for Suspense to resolve (for lazy-loaded components)
 */
export async function waitForLoad(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate a unique ID for testing
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
