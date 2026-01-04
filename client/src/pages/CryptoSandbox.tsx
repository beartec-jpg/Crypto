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
  
  // Trendline specific state
  type TrendlineMode = 'magnet' | 'free' | null;
  type LineStyle = 'solid' | 'dashed' | 'dotted';
  interface TrendlineData {
    id: string;
    p1: { time: number; price: number };
    p2: { time: number; price: number };
    color: string;
    opacity: number;
    lineStyle: LineStyle;
    thickness: number;
    extendLeft: boolean;
    extendRight: boolean;
    label?: { text: string; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' };
  }
  const [trendlineMode, setTrendlineMode] = useState<TrendlineMode>(null);
  const [showTrendlineModeSelector, setShowTrendlineModeSelector] = useState(false);
  const [trendlinePoints, setTrendlinePoints] = useState<{ x: number; y: number; time: number; price: number }[]>([]);
  const [drawnTrendlines, setDrawnTrendlines] = useState<TrendlineData[]>([]);
  const [magnetPulse, setMagnetPulse] = useState<{ x: number; y: number } | null>(null);
  const MAGNET_RADIUS = 30; // pixels
  // Zoom counter to trigger re-renders for trendlines during zoom/pan
  const [zoomVersion, setZoomVersion] = useState(0);
  
  // Trendline selection and menu state
  const [selectedTrendline, setSelectedTrendline] = useState<string | null>(null);
  const [trendlineMenuPos, setTrendlineMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'color' | 'extend' | 'label' | null>(null);
  const [movingTrendline, setMovingTrendline] = useState<string | null>(null);
  
  // Move mode state
  const [moveMode, setMoveMode] = useState(false);
  const [movingPoint, setMovingPoint] = useState<{ lineId: string; point: 'p1' | 'p2' } | null>(null);
  const [moveModePopup, setMoveModePopup] = useState<{ x: number; y: number; lineId: string; point: 'p1' | 'p2' } | null>(null);
  const [moveMethod, setMoveMethod] = useState<'magnet' | 'free'>('magnet');
  
  // Color palette for trendlines
  const TRENDLINE_COLORS = ['#facc15', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#ffffff'];
  
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
  
  // Magnet snap logic - find high/low within circle radius
  const findMagnetPoint = useCallback((clickX: number, clickY: number): { x: number; y: number; time: number; price: number } | null => {
    if (!xScaleRef.current || !yScaleRef.current || candles.length === 0) return null;
    
    const xScale = xScaleRef.current;
    const yScale = yScaleRef.current;
    
    // Find candles whose x position is within the radius
    const candidateCandles: { candle: CandleData; distance: number }[] = [];
    
    for (const candle of candles) {
      const candleX = xScale(new Date(candle.time)) + margin.left;
      const distanceX = Math.abs(candleX - clickX);
      
      if (distanceX <= MAGNET_RADIUS) {
        // Check if high or low is within vertical radius
        const highY = yScale(candle.high) + margin.top;
        const lowY = yScale(candle.low) + margin.top;
        
        const distHigh = Math.sqrt(distanceX * distanceX + Math.pow(highY - clickY, 2));
        const distLow = Math.sqrt(distanceX * distanceX + Math.pow(lowY - clickY, 2));
        
        if (distHigh <= MAGNET_RADIUS || distLow <= MAGNET_RADIUS) {
          candidateCandles.push({ candle, distance: Math.min(distHigh, distLow) });
        }
      }
    }
    
    if (candidateCandles.length === 0) return null;
    
    // Determine if click is above or below candles (use average midpoint of candidates)
    const avgMid = candidateCandles.reduce((sum, c) => {
      const midY = yScale((c.candle.high + c.candle.low) / 2) + margin.top;
      return sum + midY;
    }, 0) / candidateCandles.length;
    
    const selectHigh = clickY < avgMid; // Above mid = select highs, below = select lows
    
    // Find the best point
    let bestCandle: CandleData | null = null;
    let bestPrice = selectHigh ? -Infinity : Infinity;
    
    for (const { candle } of candidateCandles) {
      if (selectHigh && candle.high > bestPrice) {
        bestPrice = candle.high;
        bestCandle = candle;
      } else if (!selectHigh && candle.low < bestPrice) {
        bestPrice = candle.low;
        bestCandle = candle;
      }
    }
    
    if (!bestCandle) return null;
    
    const finalX = xScale(new Date(bestCandle.time)) + margin.left;
    const finalY = yScale(bestPrice) + margin.top;
    
    return { x: finalX, y: finalY, time: bestCandle.time, price: bestPrice };
  }, [candles, margin.left, margin.top, MAGNET_RADIUS]);
  
  // Handle trendline point placement
  const handleTrendlineClick = useCallback((clickX: number, clickY: number) => {
    if (!trendlineMode || !xScaleRef.current || !yScaleRef.current) return;
    
    let point: { x: number; y: number; time: number; price: number } | null = null;
    
    if (trendlineMode === 'magnet') {
      // Show pulse animation
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
      
      point = findMagnetPoint(clickX, clickY);
      if (!point) return; // No candles in radius, don't place point
    } else {
      // Free mode - place anywhere
      const xScale = xScaleRef.current;
      const yScale = yScaleRef.current;
      const time = xScale.invert(clickX - margin.left).getTime();
      const price = yScale.invert(clickY - margin.top);
      point = { x: clickX, y: clickY, time, price };
    }
    
    if (trendlinePoints.length === 0) {
      // First point
      setTrendlinePoints([point]);
    } else {
      // Second point - complete the trendline with full properties
      const newTrendline: TrendlineData = {
        id: `tl-${Date.now()}`,
        p1: { time: trendlinePoints[0].time, price: trendlinePoints[0].price },
        p2: { time: point!.time, price: point!.price },
        color: '#facc15',
        opacity: 1,
        lineStyle: 'solid',
        thickness: 2,
        extendLeft: false,
        extendRight: false,
      };
      setDrawnTrendlines(prev => [...prev, newTrendline]);
      setTrendlinePoints([]);
      // Keep tool active for drawing more lines
    }
  }, [trendlineMode, trendlinePoints, findMagnetPoint, margin.left, margin.top]);
  
  // Handle click on trendline to select it
  const handleTrendlineSelect = useCallback((lineId: string, clickX: number, clickY: number) => {
    setSelectedTrendline(lineId);
    // Calculate menu position with edge detection
    let menuX = clickX + 10;
    let menuY = clickY;
    const menuHeight = 200; // Approximate menu height
    const menuWidth = 40;
    
    // Keep menu within chart bounds
    if (menuX + menuWidth > dimensions.width - margin.right) {
      menuX = clickX - menuWidth - 10;
    }
    if (menuY + menuHeight > dimensions.height - margin.bottom) {
      menuY = dimensions.height - margin.bottom - menuHeight;
    }
    if (menuY < margin.top) {
      menuY = margin.top;
    }
    
    setTrendlineMenuPos({ x: menuX, y: menuY });
    setActiveSubmenu(null);
  }, [dimensions, margin]);
  
  // Delete selected trendline
  const deleteTrendline = useCallback(() => {
    if (selectedTrendline) {
      setDrawnTrendlines(prev => prev.filter(l => l.id !== selectedTrendline));
      setSelectedTrendline(null);
      setTrendlineMenuPos(null);
      setActiveSubmenu(null);
    }
  }, [selectedTrendline]);
  
  // Update trendline property
  const updateTrendline = useCallback((id: string, updates: Partial<TrendlineData>) => {
    setDrawnTrendlines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);
  
  // Close trendline menu when clicking elsewhere
  const closeTrendlineMenu = useCallback(() => {
    setSelectedTrendline(null);
    setTrendlineMenuPos(null);
    setActiveSubmenu(null);
    setMovingTrendline(null);
    setMoveMode(false);
    setMovingPoint(null);
    setMoveModePopup(null);
  }, []);
  
  // Activate move mode
  const activateMoveMode = useCallback((lineId: string) => {
    setMoveMode(true);
    setMovingTrendline(lineId);
    setSelectedTrendline(lineId);
    setTrendlineMenuPos(null);
    setActiveSubmenu(null);
  }, []);
  
  // Handle clicking an endpoint in move mode
  const handleEndpointClick = useCallback((lineId: string, point: 'p1' | 'p2', clickX: number, clickY: number) => {
    if (!moveMode) return;
    setMoveModePopup({ x: clickX, y: clickY, lineId, point });
  }, [moveMode]);
  
  // Start moving the point after selecting mode
  const startMovingPoint = useCallback((method: 'magnet' | 'free') => {
    if (!moveModePopup) return;
    setMoveMethod(method);
    setMovingPoint({ lineId: moveModePopup.lineId, point: moveModePopup.point });
    setMoveModePopup(null);
  }, [moveModePopup]);
  
  // Place the moving point at new location
  const placeMovingPoint = useCallback((clickX: number, clickY: number) => {
    if (!movingPoint || !xScaleRef.current || !yScaleRef.current) return;
    
    let newPoint: { time: number; price: number } | null = null;
    
    if (moveMethod === 'magnet') {
      const magnetResult = findMagnetPoint(clickX, clickY);
      if (!magnetResult) {
        // Show pulse but don't place if no candle in range
        setMagnetPulse({ x: clickX, y: clickY });
        setTimeout(() => setMagnetPulse(null), 400);
        return;
      }
      newPoint = { time: magnetResult.time, price: magnetResult.price };
      setMagnetPulse({ x: clickX, y: clickY });
      setTimeout(() => setMagnetPulse(null), 400);
    } else {
      // Free mode
      const time = xScaleRef.current.invert(clickX - margin.left).getTime();
      const price = yScaleRef.current.invert(clickY - margin.top);
      newPoint = { time, price };
    }
    
    // Update the trendline
    setDrawnTrendlines(prev => prev.map(l => {
      if (l.id === movingPoint.lineId) {
        return {
          ...l,
          [movingPoint.point]: newPoint
        };
      }
      return l;
    }));
    
    // Exit move mode
    setMovingPoint(null);
    setMoveMode(false);
    setMovingTrendline(null);
    setSelectedTrendline(null);
  }, [movingPoint, moveMethod, findMagnetPoint, margin.left, margin.top]);
  
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
          
          // Trigger React re-render for trendlines
          setZoomVersion(v => v + 1);
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
              
              {/* Trend Line with Mode Selector */}
              <Popover open={showTrendlineModeSelector} onOpenChange={(open) => {
                // Only allow opening if not already in trendline mode
                if (open && activeTool === 'trendline') return;
                setShowTrendlineModeSelector(open);
              }}>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => {
                      if (activeTool === 'trendline') {
                        // Deactivate tool - prevent popover from opening
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveTool(null);
                        setTrendlineMode(null);
                        setTrendlinePoints([]);
                        setShowTrendlineModeSelector(false);
                      } else {
                        // Show mode selector
                        setShowTrendlineModeSelector(true);
                      }
                    }}
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
                </PopoverTrigger>
                <PopoverContent side="right" className="w-32 p-2 bg-slate-800 border-slate-700">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setTrendlineMode('magnet');
                        setActiveTool('trendline');
                        setShowTrendlineModeSelector(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-700 text-white text-sm"
                      data-testid="btn-trendline-magnet"
                    >
                      <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="10" cy="10" r="6" />
                        <circle cx="10" cy="10" r="2" fill="currentColor" />
                      </svg>
                      Magnet
                    </button>
                    <button
                      onClick={() => {
                        setTrendlineMode('free');
                        setActiveTool('trendline');
                        setShowTrendlineModeSelector(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-700 text-white text-sm"
                      data-testid="btn-trendline-free"
                    >
                      <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="3" y1="17" x2="17" y2="3" />
                        <circle cx="17" cy="3" r="2" fill="currentColor" />
                      </svg>
                      Free
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              
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
            
            {/* Trendline drawing overlay */}
            {activeTool === 'trendline' && trendlineMode && (
              <div 
                className="absolute inset-0 cursor-crosshair"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = crosshairMode && crosshairPos ? crosshairPos.x : e.clientX - rect.left;
                  const clickY = crosshairMode && crosshairPos ? crosshairPos.y : e.clientY - rect.top;
                  handleTrendlineClick(clickX, clickY);
                }}
                onTouchEnd={(e) => {
                  if (crosshairMode && crosshairPos) {
                    e.preventDefault();
                    handleTrendlineClick(crosshairPos.x, crosshairPos.y);
                  }
                }}
              >
                {/* Magnet pulse animation */}
                {magnetPulse && (
                  <div 
                    className="absolute pointer-events-none"
                    style={{ 
                      left: magnetPulse.x - MAGNET_RADIUS, 
                      top: magnetPulse.y - MAGNET_RADIUS,
                      width: MAGNET_RADIUS * 2,
                      height: MAGNET_RADIUS * 2,
                    }}
                  >
                    <div 
                      className="w-full h-full rounded-full border-2 border-white animate-ping"
                      style={{ animationDuration: '0.4s' }}
                    />
                  </div>
                )}
                
                {/* First point marker */}
                {trendlinePoints.length === 1 && (
                  <div 
                    className="absolute w-3 h-3 bg-yellow-400 rounded-full pointer-events-none"
                    style={{ 
                      left: trendlinePoints[0].x - 6, 
                      top: trendlinePoints[0].y - 6,
                    }}
                  />
                )}
                
                {/* Preview line from first point to crosshair/cursor */}
                {trendlinePoints.length === 1 && crosshairMode && crosshairPos && (
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    <line 
                      x1={trendlinePoints[0].x}
                      y1={trendlinePoints[0].y}
                      x2={crosshairPos.x}
                      y2={crosshairPos.y}
                      stroke="#facc15"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                  </svg>
                )}
                
                {/* Mode indicator */}
                <div className="absolute top-14 left-14 bg-yellow-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                  Trendline: {trendlineMode === 'magnet' ? 'Magnet' : 'Free'} Mode
                  {trendlinePoints.length === 1 && ' - Click for 2nd point'}
                </div>
              </div>
            )}
            
            {/* Render drawn trendlines - clickable with selection */}
            {/* zoomVersion ensures re-render on zoom/pan */}
            <svg 
              className="absolute inset-0 overflow-visible" 
              data-zoom={zoomVersion}
              style={{ pointerEvents: activeTool === 'trendline' ? 'none' : 'auto' }}
              onClick={(e) => {
                // Click on empty space closes menu
                if (e.target === e.currentTarget) {
                  closeTrendlineMenu();
                }
              }}
            >
              {drawnTrendlines.map((line) => {
                if (!xScaleRef.current || !yScaleRef.current) return null;
                let x1 = xScaleRef.current(new Date(line.p1.time)) + margin.left;
                let y1 = yScaleRef.current(line.p1.price) + margin.top;
                let x2 = xScaleRef.current(new Date(line.p2.time)) + margin.left;
                let y2 = yScaleRef.current(line.p2.price) + margin.top;
                
                // Calculate extended line coordinates
                const dx = x2 - x1;
                const dy = y2 - y1;
                const extendAmount = 2000; // pixels to extend
                let extX1 = x1, extY1 = y1, extX2 = x2, extY2 = y2;
                if (line.extendLeft && dx !== 0) {
                  const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
                  extX1 = x1 - dx * ratio;
                  extY1 = y1 - dy * ratio;
                }
                if (line.extendRight && dx !== 0) {
                  const ratio = extendAmount / Math.sqrt(dx * dx + dy * dy);
                  extX2 = x2 + dx * ratio;
                  extY2 = y2 + dy * ratio;
                }
                
                const isSelected = selectedTrendline === line.id;
                const strokeDash = line.lineStyle === 'dashed' ? '8,4' : line.lineStyle === 'dotted' ? '2,4' : 'none';
                
                return (
                  <g key={line.id}>
                    {/* Extended line parts - matches main line style exactly */}
                    {line.extendLeft && (
                      <line 
                        x1={extX1} y1={extY1} x2={x1} y2={y1}
                        stroke={line.color}
                        strokeWidth={line.thickness || 2}
                        strokeOpacity={line.opacity}
                        strokeDasharray={strokeDash}
                      />
                    )}
                    {line.extendRight && (
                      <line 
                        x1={x2} y1={y2} x2={extX2} y2={extY2}
                        stroke={line.color}
                        strokeWidth={line.thickness || 2}
                        strokeOpacity={line.opacity}
                        strokeDasharray={strokeDash}
                      />
                    )}
                    
                    {/* Main line - clickable with invisible wider hit area */}
                    <line 
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTrendlineSelect(line.id, e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left || 0), e.clientY - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().top || 0));
                      }}
                    />
                    <line 
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={line.color}
                      strokeWidth={line.thickness || 2}
                      strokeOpacity={line.opacity}
                      strokeDasharray={strokeDash}
                      style={{ pointerEvents: 'none' }}
                    />
                    
                    {/* Endpoint circles - clickable in move mode, visible when selected or in move mode */}
                    {(isSelected || (moveMode && movingTrendline === line.id)) && (
                      <>
                        <circle 
                          cx={x1} cy={y1} r={moveMode ? 8 : 5} 
                          fill={line.color} stroke="white" strokeWidth="2"
                          style={{ cursor: moveMode ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            if (moveMode) {
                              e.stopPropagation();
                              const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                              handleEndpointClick(line.id, 'p1', e.clientX - (rect?.left || 0), e.clientY - (rect?.top || 0));
                            }
                          }}
                        />
                        <circle 
                          cx={x2} cy={y2} r={moveMode ? 8 : 5} 
                          fill={line.color} stroke="white" strokeWidth="2"
                          style={{ cursor: moveMode ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            if (moveMode) {
                              e.stopPropagation();
                              const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                              handleEndpointClick(line.id, 'p2', e.clientX - (rect?.left || 0), e.clientY - (rect?.top || 0));
                            }
                          }}
                        />
                      </>
                    )}
                    
                    {/* Label if set */}
                    {line.label && (
                      <text
                        x={line.label.position.includes('left') ? x1 : x2}
                        y={line.label.position.includes('top') 
                          ? (line.label.position.includes('left') ? y1 : y2) - 10 
                          : (line.label.position.includes('left') ? y1 : y2) + 20}
                        fill={line.color}
                        fontSize="12"
                        textAnchor="middle"
                      >
                        {line.label.text}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            
            {/* Trendline action menu */}
            {trendlineMenuPos && selectedTrendline && (
              <div 
                className="absolute flex flex-col gap-1 bg-slate-800 border border-slate-600 rounded p-1 z-50"
                style={{ left: trendlineMenuPos.x, top: trendlineMenuPos.y }}
              >
                {/* Move */}
                <button
                  onClick={() => activateMoveMode(selectedTrendline)}
                  className="p-2 hover:bg-slate-700 rounded text-white"
                  title="Move"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 2v16M2 10h16M10 2l-3 3M10 2l3 3M10 18l-3-3M10 18l3-3M2 10l3-3M2 10l3 3M18 10l-3-3M18 10l-3 3" />
                  </svg>
                </button>
                
                {/* Delete */}
                <button
                  onClick={deleteTrendline}
                  className="p-2 hover:bg-slate-700 rounded text-red-400"
                  title="Delete"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h12M6 6v10a2 2 0 002 2h4a2 2 0 002-2V6M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                  </svg>
                </button>
                
                {/* Colour */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'color' ? null : 'color')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'color' ? 'bg-slate-600' : ''}`}
                  title="Colour"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="10" cy="10" r="7" />
                    <circle cx="10" cy="10" r="3" fill="currentColor" />
                  </svg>
                </button>
                
                {/* Extend */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'extend' ? null : 'extend')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'extend' ? 'bg-slate-600' : ''}`}
                  title="Extend"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10h12M16 10l-4-4M16 10l-4 4" />
                  </svg>
                </button>
                
                {/* Label */}
                <button
                  onClick={() => setActiveSubmenu(activeSubmenu === 'label' ? null : 'label')}
                  className={`p-2 hover:bg-slate-700 rounded text-white ${activeSubmenu === 'label' ? 'bg-slate-600' : ''}`}
                  title="Label"
                >
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                    <text x="5" y="15" fontSize="14" fontWeight="bold">T</text>
                  </svg>
                </button>
              </div>
            )}
            
            {/* Submenu for Color */}
            {activeSubmenu === 'color' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 150 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 160;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="text-xs text-gray-400 mb-2">Colors</div>
                  <div className="flex flex-wrap gap-1 mb-3 w-32">
                    {TRENDLINE_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => updateTrendline(selectedTrendline, { color })}
                        className={`w-6 h-6 rounded border-2 ${selectedLine?.color === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-1">Opacity</div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={selectedLine?.opacity || 1}
                    onChange={(e) => updateTrendline(selectedTrendline, { opacity: parseFloat(e.target.value) })}
                    className="w-full mb-3"
                  />
                  
                  <div className="text-xs text-gray-400 mb-1">Line Style</div>
                  <div className="flex gap-1 mb-3">
                    {(['solid', 'dashed', 'dotted'] as LineStyle[]).map(style => (
                      <button
                        key={style}
                        onClick={() => updateTrendline(selectedTrendline, { lineStyle: style })}
                        className={`px-2 py-1 text-xs rounded ${selectedLine?.lineStyle === style ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-1">Thickness</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(t => (
                      <button
                        key={t}
                        onClick={() => updateTrendline(selectedTrendline, { thickness: t })}
                        className={`w-8 h-6 flex items-center justify-center rounded ${(selectedLine?.thickness || 2) === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                      >
                        <div style={{ width: 16, height: t, backgroundColor: 'currentColor', borderRadius: 1 }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            
            {/* Submenu for Extend */}
            {activeSubmenu === 'extend' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 100 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 110;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLine?.extendLeft || false}
                        onChange={(e) => updateTrendline(selectedTrendline, { extendLeft: e.target.checked })}
                        className="w-4 h-4"
                      />
                      Extend Left
                    </label>
                    <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLine?.extendRight || false}
                        onChange={(e) => updateTrendline(selectedTrendline, { extendRight: e.target.checked })}
                        className="w-4 h-4"
                      />
                      Extend Right
                    </label>
                  </div>
                </div>
              );
            })()}
            
            {/* Submenu for Label */}
            {activeSubmenu === 'label' && trendlineMenuPos && selectedTrendline && (() => {
              const selectedLine = drawnTrendlines.find(l => l.id === selectedTrendline);
              const submenuX = trendlineMenuPos.x + 50 < dimensions.width - 160 ? trendlineMenuPos.x + 50 : trendlineMenuPos.x - 170;
              return (
                <div 
                  className="absolute bg-slate-800 border border-slate-600 rounded p-2 z-50 w-40"
                  style={{ left: submenuX, top: trendlineMenuPos.y }}
                >
                  <div className="text-xs text-gray-400 mb-1">Text</div>
                  <input
                    type="text"
                    placeholder="Label text..."
                    value={selectedLine?.label?.text || ''}
                    onChange={(e) => updateTrendline(selectedTrendline, { 
                      label: { 
                        text: e.target.value, 
                        position: selectedLine?.label?.position || 'top-right' 
                      } 
                    })}
                    className="w-full bg-slate-700 text-white px-2 py-1 rounded text-sm mb-2"
                  />
                  
                  <div className="text-xs text-gray-400 mb-1">Position</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(pos => (
                      <button
                        key={pos}
                        onClick={() => updateTrendline(selectedTrendline, { 
                          label: { 
                            text: selectedLine?.label?.text || '', 
                            position: pos 
                          } 
                        })}
                        className={`px-1 py-1 text-xs rounded ${selectedLine?.label?.position === pos ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                      >
                        {pos.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                  
                  {selectedLine?.label?.text && (
                    <button
                      onClick={() => {
                        const { label, ...rest } = drawnTrendlines.find(l => l.id === selectedTrendline) || {};
                        if (rest.id) setDrawnTrendlines(prev => prev.map(l => l.id === selectedTrendline ? { ...l, label: undefined } : l));
                      }}
                      className="w-full mt-2 px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      Remove Label
                    </button>
                  )}
                </div>
              );
            })()}
            
            {/* Move mode indicator */}
            {moveMode && !movingPoint && (
              <div className="absolute top-14 left-14 bg-blue-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Move Mode - Click an endpoint circle to move it
              </div>
            )}
            
            {/* Moving point indicator */}
            {movingPoint && (
              <div className="absolute top-14 left-14 bg-green-600 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
                Click to place point ({moveMethod === 'magnet' ? 'Magnet' : 'Free'} mode)
              </div>
            )}
            
            {/* Magnet/Free popup when clicking endpoint in move mode */}
            {moveModePopup && (
              <div 
                className="absolute bg-slate-800 border border-slate-600 rounded p-1 z-50 flex gap-1"
                style={{ left: moveModePopup.x + 10, top: moveModePopup.y - 15 }}
              >
                <button
                  onClick={() => startMovingPoint('magnet')}
                  className="px-3 py-1 text-sm rounded bg-yellow-600 hover:bg-yellow-500 text-white"
                >
                  Magnet
                </button>
                <button
                  onClick={() => startMovingPoint('free')}
                  className="px-3 py-1 text-sm rounded bg-slate-600 hover:bg-slate-500 text-white"
                >
                  Free
                </button>
              </div>
            )}
            
            {/* Click overlay for placing moved point */}
            {movingPoint && (
              <div 
                className="absolute inset-0 cursor-crosshair z-20"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  placeMovingPoint(e.clientX - rect.left, e.clientY - rect.top);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
