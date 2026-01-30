/**
 * Pivot (peaks and troughs) detection utilities
 * Extracted from CryptoIndicators.tsx
 */

/**
 * Find peaks and troughs in price data using lookback period
 */
export const findPeaksAndTroughs = (data: number[], lookback: number = 5): { peaks: number[]; troughs: number[] } => {
  const peaks: number[] = [];
  const troughs: number[] = [];
  
  for (let i = lookback; i < data.length - lookback; i++) {
    const slice = data.slice(i - lookback, i + lookback + 1);
    const maxVal = Math.max(...slice);
    const minVal = Math.min(...slice);
    
    if (data[i] === maxVal && slice.filter(v => v === maxVal).length === 1) {
      peaks.push(i);
    }
    if (data[i] === minVal && slice.filter(v => v === minVal).length === 1) {
      troughs.push(i);
    }
  }
  
  return { peaks, troughs };
};
