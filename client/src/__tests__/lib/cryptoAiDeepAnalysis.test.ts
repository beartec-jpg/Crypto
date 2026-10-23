import { describe, expect, it } from 'vitest';
import { buildDeepDiveAnalysisSections } from '@/lib/cryptoAiDeepAnalysis';
import { normaliseMarketAnalysis, nearMissReason, toNearMissSetup } from '../../../../api/_lib/deepDiveAnalysis';

// Shape of the live no-trade job result from 23 Oct (bestTrades empty).
const liveNoTrade = {
  success: true,
  bestTrades: [],
  multiTFInsights: {
    '1d': { bias: 'NEUTRAL', summary: 'Neutral bias inside the range.', keyLevels: ['80819-81770 OB'] },
    '1h': { bias: 'NEUTRAL', summary: 'Price near upper range boundary.', keyLevels: ['81208-81760 OB'] },
    overallSummary: 'No high-quality entry zone right now.',
  },
};

describe('buildDeepDiveAnalysisSections', () => {
  it('renders per-timeframe analysis for an old no-trade result (no marketAnalysis)', () => {
    const sections = buildDeepDiveAnalysisSections(liveNoTrade, '1d', '1h');
    expect(sections.map((s) => s.title)).toEqual(['1d read (NEUTRAL)', '1h read (NEUTRAL)']);
    expect(sections[0].lines[0]).toContain('Neutral bias');
  });

  it('renders full marketAnalysis, scenarios and rejected setups when no trade', () => {
    const sections = buildDeepDiveAnalysisSections({
      ...liveNoTrade,
      marketAnalysis: {
        structure: 'Range-bound.',
        liquidity: 'Sell-side below 80800.',
        momentum: 'RSI oversold.',
        scenarios: [{ direction: 'BULLISH', trigger: 'reclaim 81760', target: '82600', invalidation: '81200' }],
        whatWouldCreateSetup: 'A sweep of 81208 then reclaim.',
      },
      nearMissSetups: [{ direction: 'LONG', entryZone: '81208-81760', reason: 'R/R 1.20 below 2 to TP1' }],
    }, '1d', '1h');
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('Structure');
    expect(titles).toContain('Scenarios');
    expect(titles).toContain('What would create a setup');
    expect(titles).toContain('Setups considered but rejected');
    expect(sections.find((s) => s.title === 'Scenarios')!.lines[0]).toBe('BULLISH: Trigger: reclaim 81760 · Target: 82600 · Invalid: 81200');
  });

  it('returns nothing for a missing result', () => {
    expect(buildDeepDiveAnalysisSections(null, '1d', '1h')).toEqual([]);
  });
});

describe('server deep-dive analysis helpers', () => {
  it('normalises marketAnalysis and drops empty objects', () => {
    expect(normaliseMarketAnalysis(null)).toBeNull();
    expect(normaliseMarketAnalysis({ structure: '  ', scenarios: [{}] })).toBeNull();
    const ma = normaliseMarketAnalysis({ structure: ' Range ', scenarios: [{ direction: 'BEARISH', trigger: 'lose 81200' }, 'x'] });
    expect(ma?.structure).toBe('Range');
    expect(ma?.scenarios).toEqual([{ direction: 'BEARISH', trigger: 'lose 81200', target: '', invalidation: '' }]);
  });

  it('explains why a proposed trade was rejected', () => {
    expect(nearMissReason(2.5, 3, 2, 3)).toBeNull();
    expect(nearMissReason(1.2, 2, 2, 3)).toBe('R/R 1.20 below 2 to TP1; 2 confluence (needs 3)');
    expect(nearMissReason(NaN, 3, 2, 3)).toBe('R/R 0.00 below 2 to TP1');
    expect(toNearMissSetup({ direction: 'LONG', triggerZone: '81208-81760', confluenceCount: 2 }, 1.234, 'r'))
      .toEqual({ direction: 'LONG', entryZone: '81208-81760', riskRewardRatio: 1.23, confluenceCount: 2, reason: 'r' });
  });
});
