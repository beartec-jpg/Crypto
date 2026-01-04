import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Crosshair } from 'lucide-react';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function CryptoSandbox() {
  const { isAdmin, isLoading: authLoading } = useCryptoAuth();
  const [, setLocation] = useLocation();
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Scales refs for zoom/pan
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // Crosshair state - toggle mode instead of long press (conflicts with D3 zoom)
  const [crosshairMode, setCrosshairMode] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  
  // Margins for the chart
  const margin = { top: 20, right: 80, bottom: 40, left: 20 };
  
  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      setLocation('/crypto/account');
    }
  }, [authLoading, isAdmin, setLocation]);
  
  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Fetch candle data - up to 2997 candles (3 batches of 999)
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    try {
      // First batch - most recent 999 (using main Binance API for more history)
      const url1 = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=999`;
      const response1 = await fetch(url1);
      if (!response1.ok) throw new Error('Failed to fetch data');
      const data1 = await response1.json();
      
      let allData = [...data1];
      
      // Second batch - 999 before that
      if (data1.length > 0) {
        const endTime2 = data1[0][0] - 1;
        const url2 = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=999&endTime=${endTime2}`;
        const response2 = await fetch(url2);
        if (response2.ok) {
          const data2 = await response2.json();
          allData = [...data2, ...allData];
          
          // Third batch - another 999
          if (data2.length > 0) {
            const endTime3 = data2[0][0] - 1;
            const url3 = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=999&endTime=${endTime3}`;
            const response3 = await fetch(url3);
            if (response3.ok) {
              const data3 = await response3.json();
              allData = [...data3, ...allData];
            }
          }
        }
      }
      
      const formattedCandles: CandleData[] = allData.map((k: any) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
      
      setCandles(formattedCandles);
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);
  
  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);
  
  // Render D3 chart
  useEffect(() => {
    if (!svgRef.current || candles.length === 0 || dimensions.width === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const width = dimensions.width;
    const height = dimensions.height;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create main group with margins
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create clip path for chart area
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'chart-clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);
    
    // Time extent
    const timeExtent = d3.extent(candles, d => d.time) as [number, number];
    const priceExtent = [
      d3.min(candles, d => d.low) as number * 0.999,
      d3.max(candles, d => d.high) as number * 1.001
    ];
    
    // X Scale (time)
    const xScale = d3.scaleTime()
      .domain([new Date(timeExtent[0]), new Date(timeExtent[1])])
      .range([0, innerWidth]);
    xScaleRef.current = xScale;
    
    // Y Scale (price) - right side
    const yScale = d3.scaleLinear()
      .domain(priceExtent)
      .range([innerHeight, 0])
      .nice();
    yScaleRef.current = yScale;
    
    // Background
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', '#0f172a');
    
    // Grid lines
    g.append('g')
      .attr('class', 'grid-y')
      .selectAll('line')
      .data(yScale.ticks(10))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1);
    
    // Candles group with clip path
    const candlesGroup = g.append('g')
      .attr('class', 'candles')
      .attr('clip-path', 'url(#chart-clip)');
    
    // Draw candles
    const drawCandles = (xS: d3.ScaleTime<number, number>, yS: d3.ScaleLinear<number, number>) => {
      candlesGroup.selectAll('*').remove();
      
      const visibleTimeRange = xS.domain();
      const visibleCandles = candles.filter(d => {
        const date = new Date(d.time);
        return date >= visibleTimeRange[0] && date <= visibleTimeRange[1];
      });
      
      const dynamicCandleWidth = Math.max(1, Math.min(20, (innerWidth / visibleCandles.length) * 0.8));
      
      // Wicks
      candlesGroup.selectAll('.wick')
        .data(visibleCandles)
        .enter()
        .append('line')
        .attr('class', 'wick')
        .attr('x1', d => xS(new Date(d.time)))
        .attr('x2', d => xS(new Date(d.time)))
        .attr('y1', d => yS(d.high))
        .attr('y2', d => yS(d.low))
        .attr('stroke', d => d.close >= d.open ? '#22c55e' : '#ef4444')
        .attr('stroke-width', 1);
      
      // Bodies
      candlesGroup.selectAll('.body')
        .data(visibleCandles)
        .enter()
        .append('rect')
        .attr('class', 'body')
        .attr('x', d => xS(new Date(d.time)) - dynamicCandleWidth / 2)
        .attr('y', d => yS(Math.max(d.open, d.close)))
        .attr('width', dynamicCandleWidth)
        .attr('height', d => Math.max(1, Math.abs(yS(d.open) - yS(d.close))))
        .attr('fill', d => d.close >= d.open ? '#22c55e' : '#ef4444');
    };
    
    drawCandles(xScale, yScale);
    
    // X Axis (bottom)
    const xAxisGroup = g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => {
        const date = d as Date;
        // Show date and time for better readability
        if (interval === '1d' || interval === '4h') {
          return d3.timeFormat('%b %d')(date);
        }
        return d3.timeFormat('%b %d %H:%M')(date);
      }))
      .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#475569'))
      .call(g => g.select('.domain').attr('stroke', '#475569'));
    
    // Y Axis (right side - price scale)
    const yAxisGroup = g.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).ticks(10).tickFormat(d => {
        const price = d as number;
        return price >= 1000 ? d3.format(',.0f')(price) : d3.format('.4f')(price);
      }))
      .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
      .call(g => g.selectAll('line').attr('stroke', '#475569'))
      .call(g => g.select('.domain').attr('stroke', '#475569'));
    
    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([[-100, 0], [width + 100, height]])
      .on('zoom', (event) => {
        const transform = event.transform;
        
        // Update x scale based on zoom
        const newXScale = transform.rescaleX(xScale);
        xScaleRef.current = newXScale;
        
        // Recalculate y scale based on visible candles
        const visibleTimeRange = newXScale.domain();
        const visibleCandles = candles.filter(d => {
          const date = new Date(d.time);
          return date >= visibleTimeRange[0] && date <= visibleTimeRange[1];
        });
        
        if (visibleCandles.length > 0) {
          const newPriceExtent = [
            d3.min(visibleCandles, d => d.low) as number * 0.999,
            d3.max(visibleCandles, d => d.high) as number * 1.001
          ];
          
          const newYScale = d3.scaleLinear()
            .domain(newPriceExtent)
            .range([innerHeight, 0])
            .nice();
          yScaleRef.current = newYScale;
          
          // Update axes
          xAxisGroup.call(d3.axisBottom(newXScale).ticks(8).tickFormat(d => {
            const date = d as Date;
            if (interval === '1d' || interval === '4h') {
              return d3.timeFormat('%b %d')(date);
            }
            return d3.timeFormat('%b %d %H:%M')(date);
          }))
          .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#475569'))
          .call(g => g.select('.domain').attr('stroke', '#475569'));
          
          yAxisGroup.call(d3.axisRight(newYScale).ticks(10).tickFormat(d => {
            const price = d as number;
            return price >= 1000 ? d3.format(',.0f')(price) : d3.format('.4f')(price);
          }))
          .call(g => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '11px'))
          .call(g => g.selectAll('line').attr('stroke', '#475569'))
          .call(g => g.select('.domain').attr('stroke', '#475569'));
          
          // Redraw candles
          drawCandles(newXScale, newYScale);
          
          // Update grid lines
          g.select('.grid-y').selectAll('line').remove();
          g.select('.grid-y')
            .selectAll('line')
            .data(newYScale.ticks(10))
            .enter()
            .append('line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', d => newYScale(d))
            .attr('y2', d => newYScale(d))
            .attr('stroke', '#1e293b')
            .attr('stroke-width', 1);
        }
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    
    // Current price line
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      const priceLineColor = lastCandle.close >= lastCandle.open ? '#22c55e' : '#ef4444';
      
      // Dashed horizontal line at current price
      g.append('line')
        .attr('class', 'current-price-line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(lastCandle.close))
        .attr('y2', yScale(lastCandle.close))
        .attr('stroke', priceLineColor)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.7);
      
      // Price label on right
      g.append('rect')
        .attr('x', innerWidth + 2)
        .attr('y', yScale(lastCandle.close) - 10)
        .attr('width', 70)
        .attr('height', 20)
        .attr('fill', priceLineColor)
        .attr('rx', 3);
      
      g.append('text')
        .attr('x', innerWidth + 37)
        .attr('y', yScale(lastCandle.close) + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .text(lastCandle.close >= 1000 ? d3.format(',.2f')(lastCandle.close) : d3.format('.4f')(lastCandle.close));
    }
    
  }, [candles, dimensions, margin.left, margin.right, margin.top, margin.bottom, interval]);
  
  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  
  // Non-admin users shouldn't see this page
  if (!isAdmin) {
    return null;
  }
  
  return (
    <div className="h-screen bg-slate-900 text-white overflow-hidden flex flex-col">
      {/* Header Controls */}
      <div className="p-4 border-b border-slate-700 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-blue-400">Sandbox Chart</h1>
        
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-600" data-testid="select-symbol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYMBOLS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={interval} onValueChange={setInterval}>
          <SelectTrigger className="w-24 bg-slate-800 border-slate-600" data-testid="select-interval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map(i => (
              <SelectItem key={i} value={i}>{i}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button 
          onClick={fetchCandles} 
          variant="outline" 
          className="bg-slate-800 border-slate-600 hover:bg-slate-700"
          data-testid="btn-refresh"
        >
          Refresh
        </Button>
        
        <Button 
          onClick={() => {
            setCrosshairMode(prev => !prev);
            if (crosshairMode) setCrosshairPos(null);
          }} 
          variant="outline" 
          className={`${crosshairMode ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 border-slate-600 hover:bg-slate-700'}`}
          data-testid="btn-crosshair"
        >
          <Crosshair className="w-4 h-4 mr-2" />
          Crosshair
        </Button>
        
        <div className="ml-auto text-sm text-slate-400">
          {candles.length} candles loaded
        </div>
      </div>
      
      {/* Chart Container */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 overflow-hidden"
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="relative w-full h-full">
            <svg 
              ref={svgRef} 
              width={dimensions.width} 
              height={dimensions.height}
              style={{ display: 'block' }}
              data-testid="sandbox-chart"
            />
            {/* Crosshair overlay - only captures events when crosshair mode enabled */}
            <div 
              className="absolute inset-0"
              style={{ pointerEvents: crosshairMode ? 'auto' : 'none' }}
              onMouseMove={(e) => {
                if (crosshairMode) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCrosshairPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
              }}
              onTouchMove={(e) => {
                if (crosshairMode && e.touches[0]) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCrosshairPos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
                }
              }}
              onTouchStart={(e) => {
                if (crosshairMode && e.touches[0]) {
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCrosshairPos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
                }
              }}
            >
              {/* Crosshair lines */}
              {crosshairMode && crosshairPos && (
                <>
                  {/* Vertical line */}
                  <div 
                    className="absolute top-0 bottom-0 w-px bg-gray-400 pointer-events-none"
                    style={{ left: crosshairPos.x }}
                  />
                  {/* Horizontal line */}
                  <div 
                    className="absolute left-0 right-0 h-px bg-gray-400 pointer-events-none"
                    style={{ top: crosshairPos.y }}
                  />
                  {/* Price label */}
                  {yScaleRef.current && crosshairPos.y > margin.top && crosshairPos.y < dimensions.height - margin.bottom && (
                    <div 
                      className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none"
                      style={{ 
                        right: 4, 
                        top: crosshairPos.y - 10,
                      }}
                    >
                      {(() => {
                        const price = yScaleRef.current?.invert(crosshairPos.y - margin.top);
                        return price ? (price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toFixed(4)) : '';
                      })()}
                    </div>
                  )}
                  {/* Time label */}
                  {xScaleRef.current && crosshairPos.x > margin.left && crosshairPos.x < dimensions.width - margin.right && (
                    <div 
                      className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none"
                      style={{ 
                        left: crosshairPos.x - 40, 
                        bottom: 4,
                      }}
                    >
                      {(() => {
                        const date = xScaleRef.current?.invert(crosshairPos.x - margin.left);
                        return date ? d3.timeFormat('%b %d %H:%M')(date) : '';
                      })()}
                    </div>
                  )}
                  {/* Crosshair active indicator */}
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none">
                    Crosshair Mode (use button to exit)
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
