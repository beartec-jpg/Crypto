import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Crosshair, ChevronDown } from 'lucide-react';

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
  // For mobile "push" behavior - track touch start position
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const crosshairStartRef = useRef<{ x: number; y: number } | null>(null);
  
  // Drawing tool state
  type DrawingTool = 'trendline' | 'horizontal' | 'channel' | 'fibretracement' | 'trendfib' | 'label' | 'impulse' | 'abc' | 'wxy' | 'abcde' | 'wxyxz' | null;
  const [activeTool, setActiveTool] = useState<DrawingTool>(null);
  
  // Indicator states - Trend Tools
  const [showEMA, setShowEMA] = useState(false);
  const [showSMA, setShowSMA] = useState(false);
  const [showSupertrend, setShowSupertrend] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [showBollingerBands, setShowBollingerBands] = useState(false);
  
  // Indicator states - SMC
  const [showBOS, setShowBOS] = useState(false);
  const [showCHoCH, setShowCHoCH] = useState(false);
  const [showFVG, setShowFVG] = useState(false);
  const [showOrderBlocks, setShowOrderBlocks] = useState(false);
  const [showSwingPivots, setShowSwingPivots] = useState(false);
  
  // Indicator states - VWAP
  const [showVWAPSession, setShowVWAPSession] = useState(false);
  const [showVWAPDaily, setShowVWAPDaily] = useState(false);
  const [showVWAPWeekly, setShowVWAPWeekly] = useState(false);
  const [showVWAPBands, setShowVWAPBands] = useState(false);
  
  // Indicator states - Oscillators
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showMFI, setShowMFI] = useState(false);
  const [showADX, setShowADX] = useState(false);
  
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
  
  // Fetch candle data - use backend proxy for reliable data (up to 5000+ candles)
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    try {
      // Use backend proxy which handles CORS and can fetch more data
      // First batch - most recent 1000
      const url1 = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
      const response1 = await fetch(url1);
      if (!response1.ok) throw new Error('Failed to fetch data');
      const data1 = await response1.json();
      
      let allData = [...data1];
      console.log(`📊 Batch 1: ${data1.length} candles`);
      
      // Fetch additional batches for more history
      const batchCount = 5; // Total 5 batches = up to 5000 candles
      let lastEndTime = data1.length > 0 ? data1[0][0] - 1 : null;
      
      for (let i = 2; i <= batchCount && lastEndTime; i++) {
        const url = `/api/binance/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${lastEndTime}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            console.log(`📊 Batch ${i}: ${data.length} candles`);
            allData = [...data, ...allData];
            lastEndTime = data[0][0] - 1;
          } else {
            break; // No more data available
          }
        } else {
          break;
        }
      }
      
      console.log(`✅ Total candles loaded: ${allData.length}`);
      
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
          
          // Update current price line and label
          const lastCandle = candles[candles.length - 1];
          if (lastCandle) {
            const priceLineColor = lastCandle.close >= lastCandle.open ? '#22c55e' : '#ef4444';
            g.select('.current-price-line')
              .attr('y1', newYScale(lastCandle.close))
              .attr('y2', newYScale(lastCandle.close));
            g.select('.current-price-rect')
              .attr('y', newYScale(lastCandle.close) - 10);
            g.select('.current-price-text')
              .attr('y', newYScale(lastCandle.close) + 4);
          }
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
        .attr('class', 'current-price-rect')
        .attr('x', innerWidth + 2)
        .attr('y', yScale(lastCandle.close) - 10)
        .attr('width', 70)
        .attr('height', 20)
        .attr('fill', priceLineColor)
        .attr('rx', 3);
      
      g.append('text')
        .attr('class', 'current-price-text')
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
            
            {/* Top indicator dropdowns */}
            <div className="absolute top-2 left-14 flex gap-2 z-20">
              {/* Trend Tools Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-trend">
                    Trend <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">EMA</Label>
                      <Switch checked={showEMA} onCheckedChange={setShowEMA} data-testid="switch-ema" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">SMA</Label>
                      <Switch checked={showSMA} onCheckedChange={setShowSMA} data-testid="switch-sma" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Supertrend</Label>
                      <Switch checked={showSupertrend} onCheckedChange={setShowSupertrend} data-testid="switch-supertrend" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Ichimoku</Label>
                      <Switch checked={showIchimoku} onCheckedChange={setShowIchimoku} data-testid="switch-ichimoku" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Bollinger Bands</Label>
                      <Switch checked={showBollingerBands} onCheckedChange={setShowBollingerBands} data-testid="switch-bb" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* SMC Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-smc">
                    SMC <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">BOS</Label>
                      <Switch checked={showBOS} onCheckedChange={setShowBOS} data-testid="switch-bos" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">CHoCH</Label>
                      <Switch checked={showCHoCH} onCheckedChange={setShowCHoCH} data-testid="switch-choch" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">FVG</Label>
                      <Switch checked={showFVG} onCheckedChange={setShowFVG} data-testid="switch-fvg" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Order Blocks</Label>
                      <Switch checked={showOrderBlocks} onCheckedChange={setShowOrderBlocks} data-testid="switch-ob" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Swing Pivots</Label>
                      <Switch checked={showSwingPivots} onCheckedChange={setShowSwingPivots} data-testid="switch-pivots" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* VWAP Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-vwap">
                    VWAP <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Session VWAP</Label>
                      <Switch checked={showVWAPSession} onCheckedChange={setShowVWAPSession} data-testid="switch-vwap-session" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Daily VWAP</Label>
                      <Switch checked={showVWAPDaily} onCheckedChange={setShowVWAPDaily} data-testid="switch-vwap-daily" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">Weekly VWAP</Label>
                      <Switch checked={showVWAPWeekly} onCheckedChange={setShowVWAPWeekly} data-testid="switch-vwap-weekly" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">VWAP Bands</Label>
                      <Switch checked={showVWAPBands} onCheckedChange={setShowVWAPBands} data-testid="switch-vwap-bands" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Oscillators Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/90 text-gray-300 hover:bg-slate-700 text-sm font-medium transition-all" data-testid="dropdown-osc">
                    OSC <ChevronDown className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-slate-900 border-slate-700" align="start">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">RSI</Label>
                      <Switch checked={showRSI} onCheckedChange={setShowRSI} data-testid="switch-rsi" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">MACD</Label>
                      <Switch checked={showMACD} onCheckedChange={setShowMACD} data-testid="switch-macd" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">MFI</Label>
                      <Switch checked={showMFI} onCheckedChange={setShowMFI} data-testid="switch-mfi" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-white cursor-pointer">ADX</Label>
                      <Switch checked={showADX} onCheckedChange={setShowADX} data-testid="switch-adx" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Left toolbar - drawing tools */}
            <div className="absolute top-2 left-2 flex flex-col gap-1 z-20 bg-slate-900/80 rounded-lg p-1">
              {/* Crosshair toggle button */}
              <button
                onClick={() => {
                  setCrosshairMode(prev => !prev);
                  if (crosshairMode) setCrosshairPos(null);
                  setActiveTool(null);
                }}
                className={`p-2 rounded transition-all ${
                  crosshairMode 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Crosshair"
                data-testid="btn-crosshair"
              >
                <Crosshair className="w-5 h-5" />
              </button>
              
              <div className="h-px bg-slate-600 my-1" />
              
              {/* Trend Line */}
              <button
                onClick={() => setActiveTool(activeTool === 'trendline' ? null : 'trendline')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'trendline' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Trend Line"
                data-testid="btn-trendline"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="17" x2="17" y2="3" />
                </svg>
              </button>
              
              {/* Horizontal Line */}
              <button
                onClick={() => setActiveTool(activeTool === 'horizontal' ? null : 'horizontal')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'horizontal' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Horizontal Line"
                data-testid="btn-horizontal"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="2" y1="10" x2="18" y2="10" />
                </svg>
              </button>
              
              {/* Channel */}
              <button
                onClick={() => setActiveTool(activeTool === 'channel' ? null : 'channel')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'channel' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Channel"
                data-testid="btn-channel"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="14" x2="18" y2="6" />
                  <line x1="2" y1="18" x2="18" y2="10" strokeDasharray="2,2" />
                </svg>
              </button>
              
              {/* Fib Retracement */}
              <button
                onClick={() => setActiveTool(activeTool === 'fibretracement' ? null : 'fibretracement')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'fibretracement' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Fib Retracement"
                data-testid="btn-fibretracement"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="2" y1="3" x2="18" y2="3" />
                  <line x1="2" y1="7" x2="18" y2="7" strokeOpacity="0.7" />
                  <line x1="2" y1="10" x2="18" y2="10" strokeOpacity="0.5" />
                  <line x1="2" y1="13" x2="18" y2="13" strokeOpacity="0.7" />
                  <line x1="2" y1="17" x2="18" y2="17" />
                </svg>
              </button>
              
              {/* Trend-based Fib */}
              <button
                onClick={() => setActiveTool(activeTool === 'trendfib' ? null : 'trendfib')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'trendfib' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Trend-based Fib"
                data-testid="btn-trendfib"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="17" x2="10" y2="3" strokeWidth="2" />
                  <line x1="10" y1="3" x2="17" y2="12" strokeWidth="2" />
                  <line x1="3" y1="8" x2="17" y2="8" strokeOpacity="0.5" strokeDasharray="2,1" />
                  <line x1="3" y1="12" x2="17" y2="12" strokeOpacity="0.5" strokeDasharray="2,1" />
                </svg>
              </button>
              
              {/* Label/Text */}
              <button
                onClick={() => setActiveTool(activeTool === 'label' ? null : 'label')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'label' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Label/Text"
                data-testid="btn-label"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="3" y="15" fontSize="12" fontWeight="bold">T</text>
                </svg>
              </button>
              
              <div className="h-px bg-slate-600 my-1" />
              
              {/* Impulse (12345) */}
              <button
                onClick={() => setActiveTool(activeTool === 'impulse' ? null : 'impulse')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'impulse' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="Impulse (12345)"
                data-testid="btn-impulse"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="2,16 5,10 7,12 12,3 15,8 18,4" strokeLinejoin="round" />
                  <circle cx="5" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="3" r="1.5" fill="currentColor" />
                </svg>
              </button>
              
              {/* ABC */}
              <button
                onClick={() => setActiveTool(activeTool === 'abc' ? null : 'abc')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'abc' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="ABC Correction"
                data-testid="btn-abc"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="2,5 10,15 18,3" strokeLinejoin="round" />
                  <text x="1" y="4" fontSize="5" fill="currentColor" stroke="none">A</text>
                  <text x="8" y="18" fontSize="5" fill="currentColor" stroke="none">B</text>
                  <text x="15" y="4" fontSize="5" fill="currentColor" stroke="none">C</text>
                </svg>
              </button>
              
              {/* WXY */}
              <button
                onClick={() => setActiveTool(activeTool === 'wxy' ? null : 'wxy')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'wxy' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="WXY"
                data-testid="btn-wxy"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="1" y="14" fontSize="7" fontWeight="bold">WXY</text>
                </svg>
              </button>
              
              {/* ABCDE */}
              <button
                onClick={() => setActiveTool(activeTool === 'abcde' ? null : 'abcde')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'abcde' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="ABCDE Triangle"
                data-testid="btn-abcde"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="10,2 2,16 18,16" strokeLinejoin="round" />
                  <line x1="4" y1="12" x2="16" y2="12" strokeOpacity="0.5" />
                </svg>
              </button>
              
              {/* WXYXZ */}
              <button
                onClick={() => setActiveTool(activeTool === 'wxyxz' ? null : 'wxyxz')}
                className={`p-2 rounded transition-all ${
                  activeTool === 'wxyxz' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-slate-700'
                }`}
                title="WXYXZ"
                data-testid="btn-wxyxz"
              >
                <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                  <text x="0" y="8" fontSize="5" fontWeight="bold">WXY</text>
                  <text x="3" y="15" fontSize="5" fontWeight="bold">XZ</text>
                </svg>
              </button>
            </div>
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
              onTouchStart={(e) => {
                if (crosshairMode && e.touches[0]) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Store where the touch started
                  touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                  // Store where crosshair currently is (or center if not set)
                  crosshairStartRef.current = crosshairPos || { 
                    x: dimensions.width / 2, 
                    y: dimensions.height / 2 
                  };
                  // If no crosshair yet, initialize at center
                  if (!crosshairPos) {
                    setCrosshairPos({ x: dimensions.width / 2, y: dimensions.height / 2 });
                  }
                }
              }}
              onTouchMove={(e) => {
                if (crosshairMode && e.touches[0] && touchStartRef.current && crosshairStartRef.current) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Calculate how much the finger moved
                  const deltaX = (touch.clientX - rect.left) - touchStartRef.current.x;
                  const deltaY = (touch.clientY - rect.top) - touchStartRef.current.y;
                  // Move crosshair by that delta from its starting position
                  const newX = Math.max(margin.left, Math.min(dimensions.width - margin.right, crosshairStartRef.current.x + deltaX));
                  const newY = Math.max(margin.top, Math.min(dimensions.height - margin.bottom, crosshairStartRef.current.y + deltaY));
                  setCrosshairPos({ x: newX, y: newY });
                }
              }}
              onTouchEnd={() => {
                // Clear touch tracking on end
                touchStartRef.current = null;
                crosshairStartRef.current = null;
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
                  {/* Crosshair active indicator - positioned below dropdowns */}
                  <div className="absolute top-14 left-14 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                    Crosshair Mode (click button to exit)
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
