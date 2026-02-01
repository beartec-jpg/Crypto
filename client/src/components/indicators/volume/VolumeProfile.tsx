interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeProfileBin {
  price: number;
  volume: number;
}

interface VolumeProfileProps {
  candles: CandleData[];
  bins?: number;
  className?: string;
}

function calculateVolumeProfile(candles: CandleData[], bins: number): VolumeProfileBin[] {
  if (candles.length === 0) return [];

  // Find price range
  let minPrice = candles[0].low;
  let maxPrice = candles[0].high;
  
  for (const candle of candles) {
    if (candle.low < minPrice) minPrice = candle.low;
    if (candle.high > maxPrice) maxPrice = candle.high;
  }

  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / bins;

  // Initialize bins
  const profile: VolumeProfileBin[] = Array.from({ length: bins }, (_, i) => ({
    price: minPrice + (i + 0.5) * binSize,
    volume: 0,
  }));

  // Distribute volume to bins
  for (const candle of candles) {
    // Simple approach: assign entire candle volume to bin containing close price
    const binIndex = Math.min(
      Math.floor((candle.close - minPrice) / binSize),
      bins - 1
    );
    if (binIndex >= 0 && binIndex < bins) {
      profile[binIndex].volume += candle.volume;
    }
  }

  return profile;
}

export function VolumeProfile({ candles, bins = 50, className = '' }: VolumeProfileProps) {
  if (candles.length === 0) return null;

  const profile = calculateVolumeProfile(candles, bins);
  const poc = profile.reduce((max, bin) => 
    bin.volume > max.volume ? bin : max,
    profile[0]
  );

  // Calculate value area (70% of volume around POC)
  const totalVolume = profile.reduce((sum, bin) => sum + bin.volume, 0);
  const valueAreaVolume = totalVolume * 0.7;
  
  // Sort bins by volume to find value area
  const sortedByVolume = [...profile].sort((a, b) => b.volume - a.volume);
  let cumVolume = 0;
  const valueAreaPrices = new Set<number>();
  
  for (const bin of sortedByVolume) {
    cumVolume += bin.volume;
    valueAreaPrices.add(bin.price);
    if (cumVolume >= valueAreaVolume) break;
  }

  return (
    <div className={`absolute right-0 top-0 bottom-0 w-32 pointer-events-none ${className}`}>
      {profile.map((bin, idx) => {
        const widthPercent = poc.volume > 0 ? (bin.volume / poc.volume) * 100 : 0;
        const isPOC = bin.price === poc.price;
        const isValueArea = valueAreaPrices.has(bin.price);
        
        return (
          <div
            key={idx}
            className={`absolute right-0 transition-all ${
              isPOC 
                ? 'bg-cyan-500' 
                : isValueArea
                  ? 'bg-cyan-600'
                  : 'bg-gray-600'
            }`}
            style={{
              width: `${widthPercent}%`,
              height: `${100 / profile.length}%`,
              top: `${(idx / profile.length) * 100}%`,
              opacity: isPOC ? 0.8 : isValueArea ? 0.4 : 0.2,
            }}
            title={`Price: ${bin.price.toFixed(2)}, Volume: ${bin.volume.toFixed(0)}`}
          />
        );
      })}
    </div>
  );
}
