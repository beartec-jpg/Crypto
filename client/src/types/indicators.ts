/**
 * Indicator-related type definitions
 * Extracted from CryptoSandbox.tsx for reusability and maintainability
 */

export interface IndicatorState {
  ema: boolean;
  sma: boolean;
  supertrend: boolean;
  ichimoku: boolean;
  bollingerBands: boolean;
  bos: boolean;
  choch: boolean;
  fvg: boolean;
  orderBlocks: boolean;
  swingPivots: boolean;
  vwapSession: boolean;
  vwapDaily: boolean;
  vwapWeekly: boolean;
  vwapBands: boolean;
  rsi: boolean;
  macd: boolean;
  mfi: boolean;
  adx: boolean;
}
