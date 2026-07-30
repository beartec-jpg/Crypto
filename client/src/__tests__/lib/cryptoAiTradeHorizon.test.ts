import { describe, expect, it } from 'vitest';

import {
  buildCryptoAiHorizonPromptBlock,
  encodeCryptoAiDeepDiveMode,
  getCryptoAiTradeHorizon,
  isCryptoAiTradeHorizon,
} from '@shared/cryptoAiConfig';

describe('crypto AI trade horizon', () => {
  it('accepts known horizons and rejects unknown', () => {
    expect(isCryptoAiTradeHorizon('swing')).toBe(true);
    expect(isCryptoAiTradeHorizon('scalp')).toBe(true);
    expect(isCryptoAiTradeHorizon('daytrade')).toBe(false);
    expect(isCryptoAiTradeHorizon(null)).toBe(false);
  });

  it('falls back to intraday for invalid ids', () => {
    expect(getCryptoAiTradeHorizon('nope').id).toBe('intraday');
    expect(getCryptoAiTradeHorizon('swing').label).toBe('Swing');
  });

  it('encodes deep-dive cache mode with horizon so styles do not collide', () => {
    expect(encodeCryptoAiDeepDiveMode('smc', 'swing')).toBe('smc:swing');
    expect(encodeCryptoAiDeepDiveMode('indicator', 'position')).toBe('indicator:position');
  });

  it('builds prompt block that scales structure to HTF on swing/position', () => {
    const swing = buildCryptoAiHorizonPromptBlock('swing', '1d', '15m');
    expect(swing).toContain('SWING');
    expect(swing).toContain('HIGHER-timeframe');
    expect(swing).toContain('1d/15m');

    const scalp = buildCryptoAiHorizonPromptBlock('scalp', '1d', '15m');
    expect(scalp).toContain('LOWER-timeframe');
  });
});
