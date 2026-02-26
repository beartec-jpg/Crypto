import { useMemo } from 'react';
import type { Candle } from '@/types/candle';
import type { VolumeProfileData, VolumeProfileRow, VolumeProfileSettings } from '@/types/volumeProfile';

export function useVolumeProfileCalculation(
  candles: Candle[],
  visibleRange: { from: number; to: number } | null,
  settings: VolumeProfileSettings
): VolumeProfileData | null {
  return useMemo(() => {
    if (!settings.enabled || !visibleRange || candles.length === 0) {
      return null;
    }

    // Filter visible candles
    const visibleCandles = candles.filter(
      c => c.time >= visibleRange.from && c.time <= visibleRange.to
    );

    if (visibleCandles.length === 0) return null;

    // Find price range
    const minPrice = Math.min(...visibleCandles.map(c => c.low));
    const maxPrice = Math.max(...visibleCandles.map(c => c.high));
    const priceRange = maxPrice - minPrice;
    if (priceRange === 0) return null;

    const priceStep = priceRange / settings.rowCount;

    // Initialize rows
    const rows: VolumeProfileRow[] = Array.from({ length: settings.rowCount }, (_, i) => ({
      price: minPrice + i * priceStep,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      delta: 0,
    }));

    // Accumulate volume at each price level
    for (const candle of visibleCandles) {
      const candleRange = candle.high - candle.low;
      if (candleRange === 0) continue;

      const startRow = Math.max(0, Math.floor((candle.low - minPrice) / priceStep));
      const endRow = Math.min(settings.rowCount - 1, Math.floor((candle.high - minPrice) / priceStep));

      for (let i = startRow; i <= endRow; i++) {
        const rowPrice = rows[i].price;
        const rowTop = rowPrice + priceStep;
        const overlap = Math.min(rowTop, candle.high) - Math.max(rowPrice, candle.low);
        const weight = overlap / candleRange;

        const volumeAtRow = candle.volume * weight;
        rows[i].volume += volumeAtRow;

        if (candle.close >= candle.open) {
          rows[i].buyVolume += volumeAtRow;
        } else {
          rows[i].sellVolume += volumeAtRow;
        }
      }
    }

    // Calculate deltas
    rows.forEach(row => {
      row.delta = row.buyVolume - row.sellVolume;
    });

    // Find POC (highest volume row)
    const pocRow = rows.reduce((max, row) => (row.volume > max.volume ? row : max), rows[0]);
    const poc = pocRow.price;

    // Calculate Value Area (target % of total volume)
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    const targetVA = totalVolume * (settings.valueAreaPercent / 100);

    const pocIndex = rows.indexOf(pocRow);
    let vaVolume = rows[pocIndex].volume;
    let vaLow = pocIndex;
    let vaHigh = pocIndex;

    while (vaVolume < targetVA && (vaLow > 0 || vaHigh < rows.length - 1)) {
      const lowVolume = vaLow > 0 ? rows[vaLow - 1].volume : 0;
      const highVolume = vaHigh < rows.length - 1 ? rows[vaHigh + 1].volume : 0;

      if (lowVolume >= highVolume) {
        vaLow--;
        vaVolume += lowVolume;
      } else {
        vaHigh++;
        vaVolume += highVolume;
      }
    }

    return {
      rows,
      poc,
      vahPrice: rows[vaHigh].price,
      valPrice: rows[vaLow].price,
      totalVolume,
    };
  }, [candles, visibleRange, settings]);
}
