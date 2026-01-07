import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { loadD3 } from '@/lib/d3Loader';
import type * as d3Types from 'd3';

/**
 * CandleData interface - matches the structure used in CryptoSandbox
 */
export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Margin configuration for chart rendering
 */
export interface MarginConfig {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Custom hook for managing D3 scales, generators, and coordinate transformations
 * 
 * Centralizes all scale-related logic from CryptoSandbox component:
 * - Scale creation and memoization
 * - Axis generators
 * - Line and area generators
 * - Coordinate conversion utilities
 * 
 * Now with lazy D3 loading to reduce initial bundle size
 * 
 * @param dimensions - Chart dimensions (width and height)
 * @param margin - Chart margins for axis spacing
 * @param data - Candle data array
 * @param zoomScale - Optional zoom scale factor (not currently used, reserved for future)
 * @param panOffset - Optional pan offset (not currently used, reserved for future)
 * @returns Object containing scales, generators, refs, and utility functions
 */
export function useChartScales(
  dimensions: { width: number; height: number },
  margin: MarginConfig,
  data: CandleData[],
  _zoomScale: number = 1,
  _panOffset: number = 0
) {
  // D3 loading state
  const [d3, setD3] = useState<typeof d3Types | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load D3 dynamically
  useEffect(() => {
    loadD3().then((d3Module) => {
      setD3(d3Module);
      setIsLoading(false);
    }).catch((error) => {
      console.error('Failed to load D3:', error);
      setIsLoading(false);
    });
  }, []);

  // Calculate inner dimensions
  const innerWidth = dimensions.width - margin.left - margin.right;
  const innerHeight = dimensions.height - margin.top - margin.bottom;

  // X scale (time) - memoized
  const xScale = useMemo(() => {
    if (!d3 || !data.length) {
      return null;
    }
    
    const timeExtent = d3.extent(data, (d: CandleData) => d.time) as [number, number];
    return d3.scaleTime()
      .domain([new Date(timeExtent[0]), new Date(timeExtent[1])])
      .range([0, innerWidth]);
  }, [d3, data, innerWidth]);

  // Y scale (price) - memoized
  const yScale = useMemo(() => {
    if (!d3 || !data.length) {
      return null;
    }
    
    const priceExtent = [
      d3.min(data, (d: CandleData) => d.low) as number * 0.999,
      d3.max(data, (d: CandleData) => d.high) as number * 1.001
    ];
    
    return d3.scaleLinear()
      .domain(priceExtent)
      .range([innerHeight, 0])
      .nice();
  }, [d3, data, innerHeight]);

  // Line generator (uses scales)
  const line = useMemo(() => {
    if (!d3 || !xScale || !yScale) {
      return null;
    }
    
    return d3.line<CandleData>()
      .x((d: CandleData) => xScale(new Date(d.time)))
      .y((d: CandleData) => yScale(d.close));
  }, [d3, xScale, yScale]);

  // Area generator (uses scales)
  const area = useMemo(() => {
    if (!d3 || !xScale || !yScale) {
      return null;
    }
    
    return d3.area<CandleData>()
      .x((d: CandleData) => xScale(new Date(d.time)))
      .y0(innerHeight)
      .y1((d: CandleData) => yScale(d.close));
  }, [d3, xScale, yScale, innerHeight]);

  // X Axis generator
  const xAxis = useMemo(() => {
    if (!d3 || !xScale) {
      return null;
    }
    return d3.axisBottom(xScale).ticks(10);
  }, [d3, xScale]);

  // Y Axis generator
  const yAxis = useMemo(() => {
    if (!d3 || !yScale) {
      return null;
    }
    return d3.axisLeft(yScale).ticks(8);
  }, [d3, yScale]);

  // Scale refs for D3 selections
  const xScaleRef = useRef<d3Types.ScaleTime<number, number> | null>(null);
  const yScaleRef = useRef<d3Types.ScaleLinear<number, number> | null>(null);

  // Update refs when scales change
  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
  }, [xScale, yScale]);

  // Utility functions for coordinate conversions - memoized
  const timeToPixels = useCallback((time: number) => {
    if (!xScale) return 0;
    return xScale(new Date(time));
  }, [xScale]);

  const priceToPixels = useCallback((price: number) => {
    if (!yScale) return 0;
    return yScale(price);
  }, [yScale]);

  const pixelsToTime = useCallback((pixels: number) => {
    if (!xScale) return 0;
    return xScale.invert(pixels).getTime();
  }, [xScale]);

  const pixelsToPrice = useCallback((pixels: number) => {
    if (!yScale) return 0;
    return yScale.invert(pixels);
  }, [yScale]);

  // Return all scales, generators, refs, and utilities
  return {
    // Loading state
    isLoading,
    d3,
    
    // Core scales
    xScale,
    yScale,
    
    // Scale refs for D3 selections
    xScaleRef,
    yScaleRef,
    
    // Generators
    line,
    area,
    xAxis,
    yAxis,
    
    // Utility functions
    timeToPixels,
    priceToPixels,
    pixelsToTime,
    pixelsToPrice,
  };
}
