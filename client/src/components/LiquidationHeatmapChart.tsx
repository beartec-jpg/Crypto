import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Loader2, AlertTriangle, Activity } from 'lucide-react';

interface GridData {
  symbol: string;
  grid: number[][];
  priceLine: Array<{time: number; price: number; high: number; low: number}>;
  predictedColumn: number[];
  orderbookColumn: number[];
  minPrice: number;
  maxPrice: number;
  maxVolume: number;
  numPriceBands: number;
  numTimeBuckets: number;
  timestamp: number;
}

interface LiquidationHeatmapChartProps {
  symbol: string;
  currentPrice?: number;
}

export function LiquidationHeatmapChart({ symbol, currentPrice }: LiquidationHeatmapChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [spikeDetected, setSpikeDetected] = useState(false);
  const [spikeInfo, setSpikeInfo] = useState<string>('');

  // Fetch grid data
  const { data: gridData, isLoading } = useQuery<GridData>({
    queryKey: [`/api/crypto/liquidations/grid?symbol=${symbol}`],
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    enabled: !!symbol
  });

  // Draw the heatmap
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !gridData) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use setTimeout to ensure container is fully rendered and has dimensions
    const drawHeatmap = () => {
      // Set canvas size to match container
      const rect = container.getBoundingClientRect();
      
      // If container has no dimensions yet, wait and try again
      if (rect.width === 0 || rect.height === 0) {
        setTimeout(drawHeatmap, 100);
        return;
      }
      
      canvas.width = rect.width;
      canvas.height = rect.height;

    const width = canvas.width;
    const height = canvas.height;

    // Layout constants
    const marginLeft = 5;
    const marginRight = 85; // Space for price labels on the right
    const marginTop = 35;
    const marginBottom = 50;
    const predictedColWidth = 65; // Wider for readable labels
    const orderbookColWidth = 65; // Wider for readable labels
    const predictedColGap = 12;
    const orderbookColGap = 12;

    // Main 30×30 grid gets full available width (minus both predicted columns space)
    const totalChartArea = width - marginLeft - marginRight;
    const chartWidth = totalChartArea - predictedColWidth - predictedColGap - orderbookColWidth - orderbookColGap;
    const chartHeight = height - marginTop - marginBottom;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const { grid, priceLine, minPrice, maxPrice, maxVolume, numPriceBands, numTimeBuckets } = gridData;

    // Calculate cell dimensions
    const cellWidth = chartWidth / numTimeBuckets;
    const cellHeight = chartHeight / numPriceBands;

    // Color function (blue → yellow → orange → red)
    const getColor = (volume: number, max: number): string => {
      if (max === 0 || volume === 0) return 'transparent';
      
      const normalized = volume / max;
      
      if (normalized > 0.8) return `rgba(255, 0, 0, ${0.6 + normalized * 0.4})`;       // Red
      if (normalized > 0.5) return `rgba(255, 102, 0, ${0.5 + normalized * 0.3})`;     // Orange
      if (normalized > 0.2) return `rgba(255, 255, 0, ${0.4 + normalized * 0.3})`;     // Yellow
      return `rgba(0, 255, 255, ${0.3 + normalized * 0.3})`;                           // Cyan
    };

    // Draw grid cells (bottom to top, left to right)
    for (let priceIdx = 0; priceIdx < numPriceBands; priceIdx++) {
      for (let timeIdx = 0; timeIdx < numTimeBuckets; timeIdx++) {
        const volume = grid[priceIdx][timeIdx];
        if (volume === 0) continue;

        const x = marginLeft + (timeIdx * cellWidth);
        // Flip Y axis: band 0 = bottom, band 29 = top
        const y = marginTop + ((numPriceBands - priceIdx - 1) * cellHeight);

        ctx.fillStyle = getColor(volume, maxVolume);
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }

    // Draw column 31: Predicted liquidation levels
    const column31X = marginLeft + chartWidth + predictedColGap;
    
    if (gridData.predictedColumn && gridData.predictedColumn.length > 0) {
      // Find max volume in predicted column
      const maxPredicted = Math.max(...gridData.predictedColumn);
      
      // Column separator line
      ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(column31X - predictedColGap / 2, marginTop);
      ctx.lineTo(column31X - predictedColGap / 2, marginTop + chartHeight);
      ctx.stroke();
      
      // Draw predicted liquidation boxes
      for (let priceIdx = 0; priceIdx < numPriceBands; priceIdx++) {
        const volume = gridData.predictedColumn[priceIdx];
        if (volume === 0) continue;

        const x = column31X;
        const y = marginTop + ((numPriceBands - priceIdx - 1) * cellHeight);

        ctx.fillStyle = getColor(volume, maxPredicted);
        ctx.fillRect(x, y, predictedColWidth, cellHeight);
        
        // Draw subtle border for predicted cells
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, predictedColWidth, cellHeight);
      }
      
      // Label for column 31 (at bottom)
      ctx.fillStyle = '#00c4b4';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PREDICTED', column31X + (predictedColWidth / 2), marginTop + chartHeight + 15);
      ctx.fillStyle = '#6B7280';
      ctx.font = '8px sans-serif';
      ctx.fillText('Future Zones', column31X + (predictedColWidth / 2), marginTop + chartHeight + 26);
    }

    // Draw column 32: Orderbook-based support/resistance levels
    const column32X = column31X + predictedColWidth + orderbookColGap;
    
    if (gridData.orderbookColumn && gridData.orderbookColumn.length > 0) {
      // Find max volume in orderbook column
      const maxOrderbook = Math.max(...gridData.orderbookColumn);
      
      // Always render the column (even if empty) to maintain visual consistency
      if (true) { // Always show column 32
        // Column separator line
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(column32X - orderbookColGap / 2, marginTop);
        ctx.lineTo(column32X - orderbookColGap / 2, marginTop + chartHeight);
        ctx.stroke();
        
        // Draw orderbook boxes with purple/magenta color scheme
        for (let priceIdx = 0; priceIdx < numPriceBands; priceIdx++) {
          const volume = gridData.orderbookColumn[priceIdx];
          if (volume === 0) continue;

          const x = column32X;
          const y = marginTop + ((numPriceBands - priceIdx - 1) * cellHeight);

          // Custom color for orderbook (purple/magenta theme)
          const normalized = volume / maxOrderbook;
          let color = 'transparent';
          if (normalized > 0.7) color = `rgba(255, 0, 255, ${0.6 + normalized * 0.4})`; // Magenta (strong)
          else if (normalized > 0.4) color = `rgba(200, 0, 255, ${0.5 + normalized * 0.3})`; // Purple
          else if (normalized > 0.1) color = `rgba(150, 0, 255, ${0.4 + normalized * 0.3})`; // Light purple
          else color = `rgba(100, 100, 255, ${0.3 + normalized * 0.3})`; // Blue tint

          ctx.fillStyle = color;
          ctx.fillRect(x, y, orderbookColWidth, cellHeight);
          
          // Draw subtle border for orderbook cells
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, orderbookColWidth, cellHeight);
        }
        
        // Label for column 32 (at bottom)
        ctx.fillStyle = '#c084fc'; // Purple
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ORDERBOOK', column32X + (orderbookColWidth / 2), marginTop + chartHeight + 15);
        ctx.fillStyle = '#6B7280';
        ctx.font = '8px sans-serif';
        ctx.fillText('Support/Resist', column32X + (orderbookColWidth / 2), marginTop + chartHeight + 26);
      }
    }

    // Draw price line overlay
    if (priceLine && priceLine.length > 0) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const priceRange = maxPrice - minPrice;

      priceLine.forEach((point, idx) => {
        // X position (centered in time bucket)
        const x = marginLeft + (idx * cellWidth) + (cellWidth / 2);
        
        // Y position (inverted: high price = low Y)
        const normalizedPrice = (point.price - minPrice) / priceRange;
        const y = marginTop + chartHeight - (normalizedPrice * chartHeight);

        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    }

    // Draw Y axis (price labels) and horizontal grid lines
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';

    const numYLabels = 15; // More price marks for better readability
    for (let i = 0; i <= numYLabels; i++) {
      const price = minPrice + (i / numYLabels) * (maxPrice - minPrice);
      const y = marginTop + chartHeight - (i / numYLabels) * chartHeight;
      
      // Price label (after both prediction columns)
      ctx.fillText(`$${price.toFixed(4)}`, column32X + orderbookColWidth + 8, y + 4);
      
      // Grid line extending across main grid AND both predicted columns
      ctx.strokeStyle = i === 0 || i === numYLabels ? '#4a5568' : '#2a2e39';
      ctx.lineWidth = i === 0 || i === numYLabels ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(column32X + orderbookColWidth, y);
      ctx.stroke();
    }
    
    // Draw outer border for professional look
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.strokeRect(marginLeft, marginTop, chartWidth + predictedColGap + predictedColWidth + orderbookColGap + orderbookColWidth, chartHeight);

    // Draw X axis (time labels)
    ctx.fillStyle = '#6B7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';

    const numXLabels = 6;
    for (let i = 0; i < numXLabels; i++) {
      const bucketIdx = Math.floor(i * (numTimeBuckets / (numXLabels - 1)));
      if (bucketIdx >= priceLine.length) continue;
      
      const point = priceLine[bucketIdx];
      const date = new Date(point.time * 1000);
      const label = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
      
      const x = marginLeft + (bucketIdx * cellWidth) + (cellWidth / 2);
      ctx.fillText(label, x, height - marginBottom + 15);
      
      // Grid line
      ctx.strokeStyle = '#2a2e39';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, marginTop + chartHeight);
      ctx.stroke();
    }

    // Draw title header (inside border area)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${gridData.symbol} Liquidation Heatmap`, marginLeft + 5, marginTop - 12);
    
    // Draw subtitle
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '9px sans-serif';
    ctx.fillText('30-day historical + predicted future liquidation zones', marginLeft + 5, marginTop - 2);

      console.log(`🔥 Heatmap drawn: ${numPriceBands}×${numTimeBuckets} grid, max volume: ${maxVolume.toFixed(2)}`);
    };
    
    // Start drawing (with retry logic if container isn't ready)
    drawHeatmap();
  }, [gridData]);

  return (
    <Card className="bg-[#1a1a1a] border-[#2a2e39] px-2 py-4 sm:px-3 sm:py-6">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm text-gray-400">
            Real-time data • Boxes plotted at exact liquidation prices {currentPrice ? `• Current: $${currentPrice.toFixed(4)}` : ''}
          </p>

          <div className="text-xs bg-[#00c4b4]/10 border border-[#00c4b4]/30 px-3 py-1.5 rounded-lg text-[#00c4b4]">
            4h intervals • 30d history + AI prediction
          </div>
        </div>
      </div>

      {/* Spike Alert */}
      {spikeDetected && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-600/50 rounded-lg animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-200">
              <span className="font-bold">🚨 LIQUIDATION SPIKE!</span> {spikeInfo}
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-[500px]">
          <Loader2 className="w-8 h-8 animate-spin text-[#00c4b4]" />
        </div>
      )}

      {!isLoading && gridData && (
        <>
          {/* Canvas */}
          <div ref={containerRef} className="relative w-full" style={{ height: '600px' }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              data-testid="liquidation-heatmap-canvas"
            />
          </div>

          {/* Legend */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#0e0e0e] rounded-lg">
              <div className="text-xs text-gray-400 mb-2 font-semibold">Liquidation Volume</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Low</span>
                <div className="flex-1 h-6 rounded" style={{
                  background: 'linear-gradient(to right, rgba(0,255,255,0.5), rgba(255,255,0,0.7), rgba(255,102,0,0.8), rgba(255,0,0,0.9))'
                }}></div>
                <span className="text-xs text-gray-500">High</span>
              </div>
            </div>

            <div className="p-4 bg-[#0e0e0e] rounded-lg">
              <div className="text-xs text-gray-400 mb-2 font-semibold">Orderbook Pressure</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Low</span>
                <div className="flex-1 h-6 rounded" style={{
                  background: 'linear-gradient(to right, rgba(100,100,255,0.4), rgba(150,0,255,0.5), rgba(200,0,255,0.7), rgba(255,0,255,0.9))'
                }}></div>
                <span className="text-xs text-gray-500">High</span>
              </div>
            </div>
          </div>
          
          {/* Additional Legend Items */}
          <div className="mt-2 p-4 bg-[#0e0e0e] rounded-lg">
            <div className="text-xs text-gray-400 mb-2 font-semibold">Chart Elements</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-yellow-500"></div>
                <span className="text-gray-300">Price Line (30-day)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{background: 'rgba(255,0,0,0.7)'}}></div>
                <span className="text-gray-300">High Liquidation Zone</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-4">
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Price Bands</div>
              <div className="text-lg font-bold text-purple-400">{gridData.numPriceBands}</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Time Buckets</div>
              <div className="text-lg font-bold text-blue-400">{gridData.numTimeBuckets}</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Max Volume</div>
              <div className="text-lg font-bold text-[#00c4b4]">${(gridData.maxVolume / 1e6).toFixed(2)}M</div>
            </div>
            <div className="bg-[#0e0e0e] p-3 rounded-lg">
              <div className="text-xs text-gray-400">Price Range</div>
              <div className="text-lg font-bold text-white">${gridData.minPrice.toFixed(2)} - ${gridData.maxPrice.toFixed(2)}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
