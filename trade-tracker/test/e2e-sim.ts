/**
 * End-to-end simulation against a live tracker DB + engine.
 * Runs: full win (TP1+TP2), full loss, TP1 then BE, weekly stats.
 */
import assert from 'node:assert/strict';
import { getPool, migrate, closePool } from '../src/db.js';
import { createTrade, processTradeAtPrice, getPerformance, listTrades } from '../src/store.js';
import { rForFill, TP1_SIZE, RUNNER_SIZE } from '../src/engine.js';

const USER = 'e2e-sim';

function approx(actual: number, expected: number, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

async function wipeSim(pool: ReturnType<typeof getPool>) {
  await pool.query(`DELETE FROM tracker_trades WHERE user_id = $1 OR source = 'sim'`, [USER]);
}

async function main() {
  console.log('=== Trade tracker E2E sim ===');
  await migrate();
  const pool = getPool();
  await wipeSim(pool);

  // --- Scenario A: LONG full win (TP1 50% + TP2 50%) ---
  // entry 100, SL 90, risk=10, TP1=110 (+1R), TP2=120 (+2R)
  // realized = 0.5*1 + 0.5*2 = 1.5R
  const win = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'TESTWINUSDT',
    direction: 'LONG',
    grade: 'A',
    entry: 100,
    stopLoss: 90,
    targets: [110, 120],
    reasoning: 'e2e full win',
  });
  console.log('A create', win.id);

  let ev = await processTradeAtPrice(pool, win, 100); // entry
  assert.equal(ev[0]?.type, 'entry_hit');
  let row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [win.id])).rows[0];
  assert.equal(row.status, 'entry_hit');

  ev = await processTradeAtPrice(pool, row, 110); // TP1
  assert.ok(ev.some((e) => e.type === 'tp1_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [win.id])).rows[0];
  assert.equal(row.status, 'tp1_hit');
  assert.equal(Boolean(row.stop_to_be), true);
  approx(parseFloat(row.remaining_size), RUNNER_SIZE);
  approx(parseFloat(row.realized_r), rForFill('LONG', 100, 90, 110, TP1_SIZE));

  ev = await processTradeAtPrice(pool, row, 120); // TP2
  assert.ok(ev.some((e) => e.type === 'tp2_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [win.id])).rows[0];
  assert.equal(row.status, 'tp_hit');
  assert.equal(row.outcome, 'win');
  approx(parseFloat(row.realized_r), 1.5);
  console.log('A PASS full win 1.5R');

  // --- Scenario B: LONG full stop before TP ---
  const loss = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'TESTLOSSUSDT',
    direction: 'LONG',
    grade: 'B',
    entry: 100,
    stopLoss: 90,
    targets: [110, 120],
  });
  await processTradeAtPrice(pool, loss, 100);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [loss.id])).rows[0];
  ev = await processTradeAtPrice(pool, row, 90);
  assert.ok(ev.some((e) => e.type === 'sl_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [loss.id])).rows[0];
  assert.equal(row.status, 'sl_hit');
  assert.equal(row.outcome, 'loss');
  approx(parseFloat(row.realized_r), -1);
  console.log('B PASS full loss -1R');

  // --- Scenario C: TP1 then BE ---
  // 0.5R from TP1 + 0 on BE runner = +0.5R win
  const be = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'TESTBEUSDT',
    direction: 'LONG',
    grade: 'A',
    entry: 100,
    stopLoss: 90,
    targets: [110, 130],
  });
  await processTradeAtPrice(pool, be, 99.5); // entry (long hits <= entry)
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [be.id])).rows[0];
  await processTradeAtPrice(pool, row, 110);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [be.id])).rows[0];
  assert.equal(row.status, 'tp1_hit');
  ev = await processTradeAtPrice(pool, row, 100); // BE
  assert.ok(ev.some((e) => e.type === 'be_hit'));
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [be.id])).rows[0];
  assert.equal(row.status, 'be_hit');
  approx(parseFloat(row.realized_r), 0.5);
  assert.equal(row.outcome, 'win');
  console.log('C PASS TP1 then BE +0.5R');

  // --- Scenario D: SHORT full win ---
  const short = await createTrade(pool, {
    userId: USER,
    source: 'sim',
    symbol: 'TESTSHORTUSDT',
    direction: 'SHORT',
    grade: 'A+',
    entry: 100,
    stopLoss: 110,
    targets: [90, 80],
  });
  await processTradeAtPrice(pool, short, 100.5); // short entry >=
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [short.id])).rows[0];
  await processTradeAtPrice(pool, row, 90);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [short.id])).rows[0];
  await processTradeAtPrice(pool, row, 80);
  row = (await pool.query(`SELECT * FROM tracker_trades WHERE id=$1`, [short.id])).rows[0];
  assert.equal(row.status, 'tp_hit');
  approx(parseFloat(row.realized_r), 1.5);
  console.log('D PASS SHORT full win 1.5R');

  // --- Stats ---
  // Wins: A 1.5, C 0.5, D 1.5 → 3 wins; B -1 → 1 loss; net = 1.5+0.5+1.5-1 = 2.5
  const perf = await getPerformance(pool);
  assert.equal(perf.totalTrades, 4);
  assert.equal(perf.wins, 3);
  assert.equal(perf.losses, 1);
  approx(perf.netR, 2.5, 1e-4);
  assert.ok(perf.winRate != null && Math.abs(perf.winRate - 0.75) < 1e-9);
  assert.ok(perf.profitFactor != null && perf.profitFactor > 1);
  assert.ok(perf.maxDrawdownR >= 0);
  console.log('E PASS stats', {
    netR: perf.netR,
    winRate: perf.winRate,
    pf: perf.profitFactor,
    sharpe: perf.sharpe,
    sortino: perf.sortino,
    maxDD: perf.maxDrawdownR,
  });

  // Events recorded
  const evCount = await pool.query(
    `SELECT count(*)::int AS n FROM tracker_events e
     JOIN tracker_trades t ON t.id = e.trade_id WHERE t.user_id = $1`,
    [USER],
  );
  assert.ok(evCount.rows[0].n >= 10, 'expected event log rows');
  console.log('F PASS event log', evCount.rows[0].n);

  const active = await listTrades(pool, { activeOnly: true });
  const simActive = active.filter((r) => r.user_id === USER);
  assert.equal(simActive.length, 0);

  console.log('\n✅ ALL E2E SCENARIOS PASSED');
  await closePool();
}

main().catch((err) => {
  console.error('❌ E2E FAILED', err);
  process.exit(1);
});
