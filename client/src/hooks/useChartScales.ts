import { useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';

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
  // Calculate inner dimensions
  const innerWidth = dimensions.width - margin.left - margin.right;
  const innerHeight = dimensions.height - margin.top - margin.bottom;

  // X scale (time) - memoized
  const xScale = useMemo(() => {
    if (!data.length) {
      // Return empty scale with default range
      return d3.scaleTime()
        .domain([new Date(0), new Date(1)])
        .range([0, innerWidth]);
    }
    
    const timeExtent = d3.extent(data, (d: CandleData) => d.time) as [number, number];
    return d3.scaleTime()
      .domain([new Date(timeExtent[0]), new Date(timeExtent[1])])
      .range([0, innerWidth]);
  }, [data, innerWidth]);

  // Y scale (price) - memoized
  const yScale = useMemo(() => {
    if (!data.length) {
      // Return empty scale with default range
      return d3.scaleLinear()
        .domain([0, 100])
        .range([innerHeight, 0]);
    }
    
    const priceExtent = [
      d3.min(data, (d: CandleData) => d.low) as number * 0.999,
      d3.max(data, (d: CandleData) => d.high) as number * 1.001
    ];
    
    return d3.scaleLinear()
      .domain(priceExtent)
      .range([innerHeight, 0])
      .nice();
  }, [data, innerHeight]);

  // Line generator (uses scales)
  const line = useMemo(() => {
    return d3.line<CandleData>()
      .x((d: CandleData) => xScale(new Date(d.time)))
      .y((d: CandleData) => yScale(d.close));
  }, [xScale, yScale]);

  // Area generator (uses scales)
  const area = useMemo(() => {
    return d3.area<CandleData>()
      .x((d: CandleData) => xScale(new Date(d.time)))
      .y0(innerHeight)
      .y1((d: CandleData) => yScale(d.close));
  }, [xScale, yScale, innerHeight]);

  // X Axis generator
  const xAxis = useMemo(() => {
    return d3.axisBottom(xScale).ticks(10);
  }, [xScale]);

  // Y Axis generator
  const yAxis = useMemo(() => {
    return d3.axisLeft(yScale).ticks(8);
  }, [yScale]);

  // Scale refs for D3 selections
  const xScaleRef = useRef(xScale);
  const yScaleRef = useRef(yScale);

  // Update refs when scales change
  useEffect(() => {
    xScaleRef.current = xScale;
    yScaleRef.current = yScale;
  }, [xScale, yScale]);

  // Utility functions for coordinate conversions
  const timeToPixels = (time: number) => xScale(new Date(time));
  const priceToPixels = (price: number) => yScale(price);
  const pixelsToTime = (pixels: number) => xScale.invert(pixels).getTime();
  const pixelsToPrice = (pixels: number) => yScale.invert(pixels);

  // Return all scales, generators, refs, and utilities
  return {
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
