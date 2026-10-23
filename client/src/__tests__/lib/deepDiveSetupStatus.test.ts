import { describe, expect, it } from 'vitest';
import {
  annotateSetupStatus,
  classifySetupStatus,
  DEEP_DIVE_SETUP_STATUS_RULES,
  distanceFromPrice,
  parseZoneRange,
} from '../../../../api/_lib/deepDiveSetupStatus';

describe('deep dive setup status', () => {
  it('parses zone ranges', () => {
    expect(parseZoneRange('2.40-2.45 demand FVG')).toEqual([2.4, 2.45]);
    expect(parseZoneRange('1,200 to 1,150 OB')).toEqual([1150, 1200]);
    expect(parseZoneRange('no numbers')).toBeNull();
  });

  it('active only when price is inside the entry zone', () => {
    expect(classifySetupStatus({ entryZone: '2.40-2.45', entry: 2.42 }, 2.43)).toBe('active');
    expect(classifySetupStatus({ entryZone: '2.40-2.45', entry: 2.42 }, 2.6)).toBe('pending');
  });

  it('overrides a model claim of active when price is far away', () => {
    expect(classifySetupStatus({ setupStatus: 'active', entryZone: '2.40-2.45', entry: 2.42 }, 2.7)).toBe('pending');
  });

  it('falls back to entry tolerance and is pending without a price', () => {
    expect(classifySetupStatus({ entry: 100 }, 100.1)).toBe('active');
    expect(classifySetupStatus({ entry: 100 }, 102)).toBe('pending');
    expect(classifySetupStatus({ entry: 100, entryZone: '99-101' }, 0)).toBe('pending');
  });

  it('computes distance from current price', () => {
    expect(distanceFromPrice({ entry: 95 }, 100)).toEqual({ price: -5, percent: -5 });
    expect(distanceFromPrice({ entry: 'x' }, 100)).toBeNull();
  });

  it('annotates trades and keeps gate fields untouched', () => {
    const [t] = annotateSetupStatus([{ entry: 90, stopLoss: 85, entryZone: '89-91', riskRewardRatio: 2.5, confluenceSignals: ['a', 'b'] }], 100);
    expect(t.setupStatus).toBe('pending');
    expect(t.distanceFromPrice).toEqual({ price: -10, percent: -10 });
    expect(t.riskRewardRatio).toBe(2.5);
    expect(t.invalidation).toContain('85');
  });

  it('prompt rules say tagging now is not required', () => {
    expect(DEEP_DIVE_SETUP_STATUS_RULES).toMatch(/does NOT need to be tagging/);
    expect(DEEP_DIVE_SETUP_STATUS_RULES).toMatch(/R\/R and confluence/);
  });
});
