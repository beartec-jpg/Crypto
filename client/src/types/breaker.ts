/**
 * Breaker Block type definitions.
 * A breaker is created when a candle passes completely through an OB zone in one move
 * and confirmation candles stay outside. The breaker has opposite polarity to the source OB.
 */

export interface Breaker {
  id: string;
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  time: number;
  conversionTime: number;
  conversionIndex: number;
  conversionPrice: number;
  sourceOBId: string;
  mitigated: boolean;
  mitigationTime?: number;
  age: number;
}

export interface BreakerSettings {
  enabled: boolean;
  showBullish: boolean;
  showBearish: boolean;
  showMitigated: boolean;
  bullishColor: string;
  bearishColor: string;
  mitigatedColor: string;
  zoneOpacity: number;
  extendRight: boolean;
  maxAge: number;
}

export const DEFAULT_BREAKER_SETTINGS: BreakerSettings = {
  enabled: true,
  showBullish: true,
  showBearish: true,
  showMitigated: false,
  bullishColor: '#26a69a',
  bearishColor: '#ef5350',
  mitigatedColor: '#666666',
  zoneOpacity: 0.15,
  extendRight: true,
  maxAge: 500,
};
