// client/src/components/Wallet/PortfolioSummary.tsx
// Portfolio overview with total value, 24h change, mini chart, and top/bottom movers

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ChainBalance } from '@/lib/balanceService';
import type { Token } from '@/lib/tokenService';

interface PortfolioSummaryProps {
  chainBalances: ChainBalance[];
  tokens: Token[];
  hideBalances: boolean;
}

// Simple sparkline component
function MiniSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 40;
  const width = 100;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? '#10b981' : '#ef4444'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PortfolioSummary({
  chainBalances,
  tokens,
  hideBalances,
}: PortfolioSummaryProps) {
  // Calculate total portfolio value
  const totalValue = chainBalances.reduce((sum, chain) => sum + (chain.usdValue || 0), 0) +
    tokens.reduce((sum, token) => sum + (token.usdValue || 0), 0);

  // Calculate weighted 24h change
  const calculatePortfolioChange = () => {
    let totalWeightedChange = 0;
    let totalWeight = 0;

    chainBalances.forEach(chain => {
      if (chain.usdValue && chain.priceChange24h !== undefined) {
        totalWeightedChange += chain.usdValue * chain.priceChange24h;
        totalWeight += chain.usdValue;
      }
    });

    tokens.forEach(token => {
      if (token.usdValue && token.priceChange24h !== undefined) {
        totalWeightedChange += token.usdValue * token.priceChange24h;
        totalWeight += token.usdValue;
      }
    });

    return totalWeight > 0 ? totalWeightedChange / totalWeight : 0;
  };

  const portfolioChange24h = calculatePortfolioChange();
  const isPositive = portfolioChange24h >= 0;

  // Find top and bottom movers
  const allAssets = [
    ...chainBalances.map(chain => ({
      symbol: chain.chain.toUpperCase(),
      name: chain.chain,
      priceChange24h: chain.priceChange24h || 0,
      usdValue: chain.usdValue || 0,
      isNative: true,
    })),
    ...tokens.filter(t => !t.isNative && t.usdValue && t.usdValue > 0).map(token => ({
      symbol: token.symbol,
      name: token.name,
      priceChange24h: token.priceChange24h || 0,
      usdValue: token.usdValue || 0,
      isNative: false,
    })),
  ].filter(asset => asset.usdValue > 0);

  const sortedByChange = [...allAssets].sort((a, b) => b.priceChange24h - a.priceChange24h);
  const topMover = sortedByChange[0];
  const bottomMover = sortedByChange[sortedByChange.length - 1];

  // Generate fake sparkline data based on current change (in real app, fetch historical data)
  const generateSparklineData = (change: number) => {
    const points = 12;
    const data: number[] = [];
    let current = 100;
    
    for (let i = 0; i < points; i++) {
      // Simulate movement towards final change
      const progress = i / (points - 1);
      const targetChange = change * progress;
      const noise = (Math.random() - 0.5) * Math.abs(change) * 0.3;
      current = 100 + targetChange + noise;
      data.push(current);
    }
    
    // Ensure last point reflects actual change
    data[points - 1] = 100 + change;
    return data;
  };

  const sparklineData = generateSparklineData(portfolioChange24h);

  const formatUsd = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 mb-6 border border-gray-700">
      {/* Main Portfolio Value */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-400 mb-1">Total Portfolio Value</p>
          <div className="flex items-baseline gap-3">
            <h2 className="text-4xl font-bold">
              {hideBalances ? '••••••' : formatUsd(totalValue)}
            </h2>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
              isPositive 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {isPositive ? '+' : ''}{portfolioChange24h.toFixed(2)}%
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">24h change</p>
        </div>

        {/* Mini Chart */}
        <div className="flex-shrink-0">
          <MiniSparkline data={sparklineData} isPositive={isPositive} />
        </div>
      </div>

      {/* Top/Bottom Movers */}
      {allAssets.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
          {/* Top Mover - Show best performer even if negative */}
          {topMover && (
            <div className={`flex items-center justify-between p-3 rounded-xl ${
              topMover.priceChange24h >= 0 
                ? 'bg-emerald-500/10 border border-emerald-500/20' 
                : 'bg-gray-700/30 border border-gray-600/20'
            }`}>
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-5 h-5 ${
                  topMover.priceChange24h >= 0 ? 'text-emerald-400' : 'text-gray-400'
                }`} />
                <div>
                  <p className="text-xs text-gray-400">
                    {topMover.priceChange24h >= 0 ? 'Top Performer' : 'Best Performer'}
                  </p>
                  <p className={`font-semibold ${
                    topMover.priceChange24h >= 0 ? 'text-emerald-400' : 'text-gray-300'
                  }`}>
                    {topMover.symbol}
                  </p>
                </div>
              </div>
              <span className={`font-mono font-medium ${
                topMover.priceChange24h >= 0 ? 'text-emerald-400' : 'text-gray-400'
              }`}>
                {topMover.priceChange24h >= 0 ? '+' : ''}{topMover.priceChange24h.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Bottom Mover */}
          {bottomMover && bottomMover.priceChange24h < 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-xs text-gray-400">Lowest Performer</p>
                  <p className="font-semibold text-red-400">{bottomMover.symbol}</p>
                </div>
              </div>
              <span className="text-red-400 font-mono font-medium">
                {bottomMover.priceChange24h.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Neutral state if no significant movers */}
          {(!topMover || topMover.priceChange24h <= 0) && (!bottomMover || bottomMover.priceChange24h >= 0) && (
            <div className="col-span-2 flex items-center justify-center p-3 rounded-xl bg-gray-700/30 border border-gray-600/30">
              <Minus className="w-4 h-4 text-gray-500 mr-2" />
              <span className="text-gray-500 text-sm">No significant movers today</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
