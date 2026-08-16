/**
 * Entry confirmation: reclaim required; straight-through → invalid (0R).
 */
import assert from 'node:assert/strict';
import { getPool, migrate, closePool } from '../src/db.js';
import { createTrade, processTradeAtPrice } from '../src/store.js';

const USER = 'e2e-entry-confirm';

async function main() {
  console.log('=== Entry confirm E2E ===');
  await migrate();
  const pool = getPool();
  await pool.query(`DELETE FROM tracker_trades WHERE user_id = $1`, [USER]);

  // LONG reclaim: entry 100, confirm 100, SL 90, TP 120/130
  const good = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'CONFUSDT',
    direction: 'LONG',
    grade: 'A',
    entry: 100,
    stopLoss: 90,
    targets: [120, 130],
    entryConfirmType: 'reclaim',
    entryConfirmLevel: 100,
    entryConfirmRationale: 'tag demand then reclaim 100',
    stopLiftTrigger: 110,
    stopLiftTo: 100,
  });

  let row = good;
  // Spike into zone
  let ev = await processTradeAtPrice(pool, row, 99);
  assert.ok(ev.some((e) => e.type === 'entry_armed'), 'should arm not open');
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [good.id])).rows[0];
  assert.equal(row.status, 'entry_armed');
  console.log('A PASS zone tag → entry_armed (not open)');

  // Reclaim
  ev = await processTradeAtPrice(pool, row, 100.5);
  assert.ok(ev.some((e) => e.type === 'entry_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [good.id])).rows[0];
  assert.equal(row.status, 'entry_hit');
  console.log('B PASS reclaim → OPENED');

  // Straight-through path
  const bad = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'THRUUSDT',
    direction: 'LONG',
    grade: 'B',
    entry: 100,
    stopLoss: 90,
    targets: [120, 130],
    entryConfirmType: 'reclaim',
    entryConfirmLevel: 100,
  });
  row = bad;
  await processTradeAtPrice(pool, row, 99);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [bad.id])).rows[0];
  assert.equal(row.status, 'entry_armed');
  // Fall through the posted hint SL — that is the sweep, stay armed
  ev = await processTradeAtPrice(pool, row, 90);
  assert.ok(!ev.some((e) => e.type === 'entry_invalid'), 'hint SL must not kill the idea');
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [bad.id])).rows[0];
  assert.equal(row.status, 'entry_armed');
  console.log('C PASS wick through hint SL → still armed (sweep)');

  // Reclaim after sweep → OPEN with SL at the wick
  ev = await processTradeAtPrice(pool, row, 100.5, undefined, { high: 100.5, low: 90 });
  assert.ok(ev.some((e) => e.type === 'entry_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [bad.id])).rows[0];
  assert.equal(row.status, 'entry_hit');
  const sweepSl = parseFloat(row.original_stop);
  assert.ok(sweepSl < 90.1, `sweep SL should sit at/under 90, got ${sweepSl}`);
  console.log('C2 PASS reclaim after sweep → OPEN SL', sweepSl);

  // Thesis-dead: sweep way beyond 3× hint risk without reclaim
  const dead = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'DEADUSDT',
    direction: 'LONG',
    grade: 'B',
    entry: 100,
    stopLoss: 90,
    targets: [120, 130],
    entryConfirmType: 'reclaim',
    entryConfirmLevel: 100,
  });
  await processTradeAtPrice(pool, dead, 99);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [dead.id])).rows[0];
  ev = await processTradeAtPrice(pool, row, 60);
  assert.ok(ev.some((e) => e.type === 'entry_invalid'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [dead.id])).rows[0];
  assert.equal(row.status, 'entry_invalid');
  assert.equal(parseFloat(row.realized_r), 0);
  console.log('C3 PASS oversized sweep → entry_invalid 0R');

  // Touch mode still opens immediately
  const touch = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'TOUCHUSDT',
    direction: 'SHORT',
    grade: 'A',
    entry: 100,
    stopLoss: 110,
    targets: [90, 80],
    entryConfirmType: 'touch',
  });
  ev = await processTradeAtPrice(pool, touch, 101);
  assert.ok(ev.some((e) => e.type === 'entry_hit'));
  console.log('D PASS touch mode still opens on tag');

  console.log('\n✅ ENTRY CONFIRM E2E PASSED');
  await closePool();
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
