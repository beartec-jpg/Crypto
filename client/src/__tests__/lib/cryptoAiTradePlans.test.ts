import { describe, expect, it } from 'vitest';

import {
  collectWatchLevels,
  formatTargetWithPercent,
  formatTargetsWithPercent,
  getHtfRelationshipBadgeVariant,
  getHtfRelationshipLabel,
  getOverallSummary,
  isPendingTradeIdea,
  targetMovePercent,
  type MultiTFInsights,
} from '@/lib/cryptoAiTradePlans';

describe('cryptoAiTradePlans', () => {
  it('detects pending trade plans from trigger details', () => {
    expect(isPendingTradeIdea({ triggerZone: '1.0800-1.0850 demand FVG' })).toBe(true);
    expect(isPendingTradeIdea({ triggerCondition: 'Wait for price to tap the zone and bounce' })).toBe(true);
    expect(isPendingTradeIdea({ entry: 1.08, stopLoss: 1.05 })).toBe(false);
  });

  it('computes target percent moves for long and short', () => {
    expect(targetMovePercent(100, 110, 'LONG')).toBeCloseTo(10, 5);
    expect(targetMovePercent(100, 90, 'SHORT')).toBeCloseTo(10, 5);
    expect(formatTargetWithPercent(100, 105, 'LONG')).toBe('105 (+5.00%)');
    expect(formatTargetsWithPercent(100, [110, 120], 'LONG')).toBe('110 (+10.00%) / 120 (+20.00%)');
  });

  it('collects deduplicated watch levels with preferred timeframe order', () => {
    const insights: MultiTFInsights = {
      overallSummary: 'Wait for price to retest demand.',
      '1d': {
        summary: 'Bearish HTF context',
        bias: 'BEARISH',
        keyLevels: ['1.1800 supply', '1.0500 swing low'],
      },
      '1h': {
        summary: 'Higher-low forming locally',
        bias: 'BULLISH',
        keyLevels: ['1.0800-1.0850 demand FVG', '1.1800 supply'],
      },
    };

    expect(collectWatchLevels(insights, ['1h', '1d'])).toEqual([
      '1.0800-1.0850 demand FVG',
      '1.1800 supply',
      '1.0500 swing low',
    ]);
  });

  it('returns readable HTF relationship labels and badge variants', () => {
    expect(getHtfRelationshipLabel('with-trend')).toBe('With-trend');
    expect(getHtfRelationshipLabel('counter-trend')).toBe('Counter-trend');
    expect(getHtfRelationshipBadgeVariant('with-trend')).toBe('default');
    expect(getHtfRelationshipBadgeVariant('counter-trend')).toBe('secondary');
  });

  it('reads the overall deep-dive summary safely', () => {
    expect(getOverallSummary({ overallSummary: 'Map the next pullback long into supply.' })).toBe(
      'Map the next pullback long into supply.',
    );
    expect(getOverallSummary(null)).toBe('');
  });
});
