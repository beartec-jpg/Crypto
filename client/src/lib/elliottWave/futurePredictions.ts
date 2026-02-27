import { calcRetracementLevels, type FibLevel } from '@/lib/elliottWave/fibCalculator';

const getCanonicalWavePosition = (label: string): string | null => {
  const pos1 = ['1', '(1)', 'I', '(I)', 'i', '(i)'];
  const pos2 = ['2', '(2)', 'II', '(II)', 'ii', '(ii)'];
  const pos3 = ['3', '(3)', 'III', '(III)', 'iii', '(iii)'];
  const pos4 = ['4', '(4)', 'IV', '(IV)', 'iv', '(iv)'];
  const pos5 = ['5', '(5)', 'V', '(V)', 'v', '(v)'];
  const posA = ['A', '(A)', 'a', '(a)'];
  const posB = ['B', '(B)', 'b', '(b)'];
  const posC = ['C', '(C)', 'c', '(c)'];

  if (pos1.includes(label)) return '1';
  if (pos2.includes(label)) return '2';
  if (pos3.includes(label)) return '3';
  if (pos4.includes(label)) return '4';
  if (pos5.includes(label)) return '5';
  if (posA.includes(label)) return 'A';
  if (posB.includes(label)) return 'B';
  if (posC.includes(label)) return 'C';
  return null;
};

export const calculateFuturePredictions = (
  wave: { points: { price: number; time?: number }[]; style?: { waveLabel?: string; waveType?: string } },
  candleInterval: number = 3600,
): FibLevel[] => {
  const waveLabel = wave.style?.waveLabel;
  const waveType = wave.style?.waveType ?? 'impulse';
  const points = wave.points;
  if (!waveLabel || points.length < 2) return [];

  const canonicalPos = getCanonicalWavePosition(waveLabel);
  if (!canonicalPos) return [];

  const startPrice = points[0].price;
  const endPrice = points[points.length - 1].price;
  const lastPoint = points[points.length - 1];
  const lastTime = typeof lastPoint.time === 'number' ? lastPoint.time : undefined;
  const endTime = lastTime !== undefined ? lastTime + 4 * candleInterval : undefined;
  const lineRange = lastTime !== undefined ? { startTime: lastTime, endTime } : {};

  if (canonicalPos === '2') {
    const refLen = Math.abs(endPrice - startPrice);
    const direction = endPrice < startPrice ? 1 : -1;
    const w3Ratios = ['leading_diagonal', 'ending_diagonal'].includes(waveType)
      ? [0.618, 0.786, 1.0]
      : [1.618, 2.0, 2.618];
    return w3Ratios.map(ratio => ({
      ratio,
      price: endPrice + direction * refLen * ratio,
      label: `W3 ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  if (canonicalPos === '3') {
    const levels = calcRetracementLevels(startPrice, endPrice, [0.236, 0.382, 0.5, 0.618]);
    return levels.map(level => ({ ...level, label: `W4: ${(level.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  if (canonicalPos === '4') {
    const refLen = Math.abs(endPrice - startPrice);
    const direction = endPrice < startPrice ? 1 : -1;
    const w5Ratios = ['leading_diagonal', 'ending_diagonal'].includes(waveType)
      ? [0.618, 1.0]
      : [0.618, 1.0, 1.618];
    return w5Ratios.map(ratio => ({
      ratio,
      price: endPrice + direction * refLen * ratio,
      label: `W5 ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  if (canonicalPos === '5') {
    const levels = calcRetracementLevels(startPrice, endPrice, [0.382, 0.5, 0.618, 1.0]);
    return levels.map(level => ({ ...level, label: `WA: ${(level.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  if (canonicalPos === 'A') {
    const isFlatType = waveType === 'flat';
    const bRatios = isFlatType ? [0.9, 1.0, 1.382] : [0.382, 0.5, 0.618, 0.786];
    const levels = calcRetracementLevels(startPrice, endPrice, bRatios);
    return levels.map(level => ({ ...level, label: `WB: ${(level.ratio * 100).toFixed(1)}%`, ...lineRange }));
  }

  if (canonicalPos === 'B') {
    const refLen = Math.abs(endPrice - startPrice);
    const correctionDirection = endPrice > startPrice ? -1 : 1;
    const cRatios = waveType === 'flat' ? [0.618, 1.0, 1.618] : [1.0, 1.272, 1.618];
    return cRatios.map(ratio => ({
      ratio,
      price: endPrice + correctionDirection * refLen * ratio,
      label: `WC: ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#fb923c',
      ...lineRange,
    }));
  }

  if (canonicalPos === 'C') {
    const totalCorrLen = Math.abs(endPrice - points[0].price);
    const direction = endPrice < points[0].price ? 1 : -1;
    const impulseRatios = [0.618, 1.0, 1.618];
    return impulseRatios.map(ratio => ({
      ratio,
      price: endPrice + direction * totalCorrLen * ratio,
      label: `W1 ${(ratio * 100).toFixed(1)}%`,
      isRetrace: false,
      color: '#22c55e',
      ...lineRange,
    }));
  }

  return [];
};
