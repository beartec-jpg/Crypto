/**
 * Smart Money Concepts (SMC) type definitions
 * Extracted from CryptoIndicators.tsx for reusability
 */

export interface FVG {
  time: number;
  lower: number;
  upper: number;
  type: 'bullish' | 'bearish';
  volumeScore?: number;
  deltaScore?: number;
  isHighValue?: boolean;
}

export interface FootprintData {
  time: number;
  bidVol: number[];
  askVol: number[];
  prices: number[];
  delta: number;
}

export interface BOS {
  swingTime: number;
  swingPrice: number;
  breakTime: number;
  breakIndex: number;
  type: 'bullish' | 'bearish';
  isLiquidityGrab?: boolean;
  sweptLevel?: 'high' | 'low'; // Track which level was swept for reversals
}

export interface CHoCH {
  swingTime: number;
  swingPrice: number;
  breakTime: number;
  breakIndex: number;
  type: 'bullish' | 'bearish';
  isLiquidityGrab?: boolean;
  sweptLevel?: 'high' | 'low'; // Track which level was swept for reversals
}
