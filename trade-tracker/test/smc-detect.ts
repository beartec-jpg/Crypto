/**
 * Deterministic SMC detection: IDs stable, close-through mitigation, wick tests.
 */
import assert from 'node:assert/strict';
import type { Bar } from '../src/desk/marketStructure.js';
import {
  bosChochState,
  detectFvgZones,
  detectStructureEvents,
  detectSwingPoints,
  makeZoneId,
  zoneMitigatedByClose,
  zoneWickTested,
} from '../src/desk/smc/detect.js';

function bar(t: number, o: number, h: number, l: number, c: number): Bar {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1 };
}

console.log('=== smc detect ===');

// Bullish FVG: A high 10, C low 12 → gap 10–12. ATR ~2 so width 2 > 0.5.
const fvgBars: Bar[] = [
  bar(1, 9.5, 10, 8, 9),
  bar(2, 9, 11, 7.5, 10.5),
  bar(3, 11, 13, 12, 12.5),
];
const atrVal = 2;
const fvgs = detectFvgZones(fvgBars, atrVal);
const bull = fvgs.filter((z) => z.direction === 'bullish');
assert.equal(bull.length, 1, 'one bullish FVG');
assert.equal(bull[0].low, 10);
assert.equal(bull[0].high, 12);
assert.ok(bull[0].originSwing <= 8);
const id1 = makeZoneId({
  symbol: 'XRPUSDT',
  timeframe: '15m',
  kind: bull[0].kind,
  direction: bull[0].direction,
  createdAtBar: bull[0].createdAtBar,
  low: bull[0].low,
  high: bull[0].high,
  originSwing: bull[0].originSwing,
});
const id2 = makeZoneId({
  symbol: 'XRPUSDT',
  timeframe: '15m',
  kind: bull[0].kind,
  direction: bull[0].direction,
  createdAtBar: bull[0].createdAtBar,
  low: bull[0].low,
  high: bull[0].high,
  originSwing: bull[0].originSwing,
});
assert.equal(id1, id2, 'zone id is stable');
console.log('A PASS FVG detect + stable id', id1);

assert.equal(zoneMitigatedByClose('bullish', 10, 12, 10.5), false, 'close inside is not mitigated');
assert.equal(zoneMitigatedByClose('bullish', 10, 12, 9.9), true, 'close below low is mitigated');
assert.equal(zoneMitigatedByClose('bearish', 10, 12, 12.1), true, 'close above high is mitigated');
assert.equal(
  zoneWickTested('bullish', 10, 12, { high: 11, low: 10.2, close: 10.8 }),
  true,
  'wick overlap without close-through is a test',
);
assert.equal(
  zoneWickTested('bullish', 10, 12, { high: 11, low: 9.5, close: 9.8 }),
  false,
  'close-through is not a test',
);
console.log('B PASS close-through mitigation vs wick test');

// Tiny gap skipped
const tiny = detectFvgZones(
  [bar(1, 1, 1.001, 1, 1), bar(2, 1, 1.002, 1, 1.002), bar(3, 1.002, 1.003, 1.0015, 1.002)],
  1,
);
assert.equal(tiny.length, 0, 'sub-0.25 ATR FVG dropped');
console.log('C PASS min FVG width filter');

const swingBars: Bar[] = [];
for (let i = 0; i < 30; i++) {
  const base = 100 + Math.sin(i / 3) * 5;
  swingBars.push(bar(i * 60, base, base + 2, base - 2, base + (i % 2 ? 1 : -1)));
}
const swings = detectSwingPoints(swingBars, 3);
assert.ok(swings.length >= 2, 'swings found');
const st = bosChochState(swingBars, 3);
assert.ok(['none', 'bullish', 'bearish'].includes(st.bos));
assert.ok(['none', 'bullish', 'bearish'].includes(st.choch));
const evs = detectStructureEvents(swingBars, 3);
assert.ok(Array.isArray(evs));
console.log('D PASS swings/BOS/CHoCH', { swings: swings.length, events: evs.length, ...st });

console.log('\n✅ SMC DETECT PASSED');
