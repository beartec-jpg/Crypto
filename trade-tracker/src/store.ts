import type pg from 'pg';
import {
  evaluateTick,
  rowToEngine,
  type EngineEvent,
  type EngineTrade,
} from './engine.js';
import { colorForEvent, postDiscordWebhook, type DiscordEmbed } from './discord.js';
import { computePerformance, formatStatsEmbedFields, type ClosedTradePoint } from './stats.js';

export interface CreateTradeInput {
  userId?: string;
  source?: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  grade?: string;
  entry: number;
  stopLoss: number;
  targets: number[];
  confluenceSignals?: string[];
  reasoning?: string | null;
  riskRewardRatio?: number | null;
  meta?: Record<string, unknown>;
}

export async function createTrade(pool: pg.Pool, input: CreateTradeInput) {
  const symbol = input.symbol.toUpperCase();
  const direction = input.direction.toUpperCase() as 'LONG' | 'SHORT';
  const entry = Number(input.entry);
  const stop = Number(input.stopLoss);
  const targets = (input.targets || []).map(Number).filter((n) => Number.isFinite(n));

  if (!symbol || !['LONG', 'SHORT'].includes(direction)) {
    throw new Error('Invalid symbol/direction');
  }
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !targets.length) {
    throw new Error('entry, stopLoss, and at least one target required');
  }
  if (direction === 'LONG' && !(stop < entry && targets[0] > entry)) {
    throw new Error('LONG requires stop < entry < tp1');
  }
  if (direction === 'SHORT' && !(stop > entry && targets[0] < entry)) {
    throw new Error('SHORT requires stop > entry > tp1');
  }

  // Dedupe active identical setup
  const existing = await pool.query(
    `SELECT * FROM tracker_trades
     WHERE user_id = $1 AND symbol = $2 AND direction = $3
       AND entry = $4 AND status IN ('pending','entry_hit','tp1_hit')
     LIMIT 1`,
    [input.userId || 'discord-desk', symbol, direction, entry],
  );
  if (existing.rows[0]) return existing.rows[0];

  const rr =
    input.riskRewardRatio ??
    Math.abs(targets[0] - entry) / Math.abs(entry - stop);

  const result = await pool.query(
    `INSERT INTO tracker_trades (
       user_id, source, symbol, direction, grade,
       entry, original_stop, current_stop, targets,
       confluence_signals, reasoning, risk_reward_ratio, meta, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
     RETURNING *`,
    [
      input.userId || 'discord-desk',
      input.source || 'discord_desk',
      symbol,
      direction,
      input.grade || 'B',
      entry,
      stop,
      stop,
      targets,
      input.confluenceSignals || [],
      input.reasoning || null,
      rr,
      JSON.stringify(input.meta || {}),
    ],
  );
  return result.rows[0];
}

export async function listTrades(
  pool: pg.Pool,
  opts: { status?: string; limit?: number; activeOnly?: boolean } = {},
) {
  const limit = Math.min(opts.limit || 100, 500);
  if (opts.activeOnly) {
    const r = await pool.query(
      `SELECT * FROM tracker_trades
       WHERE status IN ('pending','entry_hit','tp1_hit')
       ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  }
  if (opts.status) {
    const r = await pool.query(
      `SELECT * FROM tracker_trades WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
      [opts.status, limit],
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT * FROM tracker_trades ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function getClosedPoints(
  pool: pg.Pool,
  since?: Date,
): Promise<ClosedTradePoint[]> {
  const params: unknown[] = [];
  let sql = `SELECT realized_r, closed_at, outcome, symbol, grade, direction
             FROM tracker_trades
             WHERE closed_at IS NOT NULL AND status IN ('tp_hit','sl_hit','be_hit')`;
  if (since) {
    params.push(since.toISOString());
    sql += ` AND closed_at >= $1`;
  }
  sql += ' ORDER BY closed_at ASC';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    realizedR: parseFloat(String(row.realized_r)),
    closedAt: new Date(row.closed_at),
    outcome: row.outcome,
    symbol: row.symbol,
    grade: row.grade,
    direction: row.direction,
  }));
}

export async function getPerformance(pool: pg.Pool, since?: Date) {
  const points = await getClosedPoints(pool, since);
  return computePerformance(points);
}

async function insertEvent(
  pool: pg.Pool,
  tradeId: string,
  ev: EngineEvent,
): Promise<void> {
  await pool.query(
    `INSERT INTO tracker_events (trade_id, event_type, price, size_fraction, r_delta, realized_r_after, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tradeId, ev.type, ev.price, ev.sizeFraction, ev.rDelta, ev.realizedRAfter, ev.message],
  );
}

async function applyEvent(pool: pg.Pool, tradeId: string, ev: EngineEvent): Promise<void> {
  await insertEvent(pool, tradeId, ev);

  const sets: string[] = [
    'status = $2',
    'current_stop = $3',
    'remaining_size = $4',
    'tp1_closed_size = $5',
    'stop_to_be = $6',
    'realized_r = $7',
    'updated_at = NOW()',
    'last_price = $8',
    'last_checked_at = NOW()',
  ];
  const params: unknown[] = [
    tradeId,
    ev.newStatus,
    ev.newCurrentStop,
    ev.newRemainingSize,
    ev.newTp1ClosedSize,
    ev.newStopToBe,
    ev.realizedRAfter,
    ev.price,
  ];
  let i = 9;

  if (ev.type === 'entry_hit') {
    sets.push(`entry_hit_at = NOW()`);
  }
  if (ev.type === 'tp1_hit') {
    sets.push(`tp1_hit_at = NOW()`);
    sets.push(`tp_hit_level = 1`);
  }
  if (ev.type === 'tp2_hit') {
    sets.push(`tp_hit_at = NOW()`);
    sets.push(`tp_hit_level = 2`);
  }
  if (ev.type === 'sl_hit' || ev.type === 'be_hit') {
    sets.push(`sl_hit_at = NOW()`);
  }
  if (ev.closed) {
    sets.push(`closed_at = NOW()`);
    sets.push(`outcome = $${i++}`);
    params.push(ev.outcome);
  }

  await pool.query(
    `UPDATE tracker_trades SET ${sets.join(', ')} WHERE id = $1`,
    params,
  );
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtR(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}R`;
}

/** Planned R if full size hit this target (informational on entry only). */
function plannedR(trade: EngineTrade, target: number): string {
  const risk = Math.abs(trade.entry - trade.originalStop);
  if (risk <= 0) return '—';
  const move =
    trade.direction === 'LONG' ? target - trade.entry : trade.entry - target;
  return fmtR(move / risk);
}

export async function notifyEvent(
  webhookUrl: string | undefined,
  trade: EngineTrade,
  ev: EngineEvent,
): Promise<void> {
  if (!webhookUrl) {
    console.log(`[discord:skip] ${ev.message}`);
    return;
  }
  // skip pure stop_to_be if we already sent tp1 (avoid spam) — still send tp1 which mentions BE
  if (ev.type === 'stop_to_be') return;

  const titleType =
    ev.type === 'entry_hit'
      ? 'OPENED'
      : ev.type === 'tp1_hit'
        ? 'TP1 HIT'
        : ev.type === 'tp2_hit'
          ? 'TP2 HIT'
          : ev.type === 'sl_hit'
            ? 'STOP HIT'
            : ev.type === 'be_hit'
              ? 'BREAK-EVEN EXIT'
              : ev.type.replace(/_/g, ' ').toUpperCase();

  const embed: DiscordEmbed = {
    title: `${trade.symbol} · ${titleType} · ${trade.direction} (${trade.grade})`,
    description: ev.message,
    color: colorForEvent(ev.type),
    fields: [],
    footer: { text: 'AI trade tracker · Not financial advice' },
    timestamp: new Date().toISOString(),
  };

  // Entry: levels only — no R (nothing realized yet)
  if (ev.type === 'entry_hit') {
    const tp1 = trade.targets[0];
    const tp2 = trade.targets[1];
    embed.fields = [
      { name: 'Entry', value: fmtPx(trade.entry), inline: true },
      { name: 'Stop loss', value: fmtPx(trade.originalStop), inline: true },
      { name: 'Fill', value: fmtPx(ev.price), inline: true },
      {
        name: 'TP1 (close 50%)',
        value:
          tp1 != null
            ? `${fmtPx(tp1)} · plan ${plannedR(trade, tp1)} on full size`
            : '—',
        inline: true,
      },
      {
        name: 'TP2 (runner 50%)',
        value:
          tp2 != null
            ? `${fmtPx(tp2)} · plan ${plannedR(trade, tp2)} on full size`
            : '—',
        inline: true,
      },
      {
        name: 'Model',
        value: '50% @ TP1 → stop to BE · rest @ TP2 · R reported only on exits',
        inline: false,
      },
    ];
  } else {
    // After the fact: size closed + realized R only
    embed.fields = [
      { name: 'Fill', value: fmtPx(ev.price), inline: true },
      { name: 'Closed size', value: `${(ev.sizeFraction * 100).toFixed(0)}%`, inline: true },
      { name: 'This fill', value: fmtR(ev.rDelta), inline: true },
      { name: 'Trade total', value: fmtR(ev.realizedRAfter), inline: true },
    ];
    if (ev.type === 'tp1_hit') {
      embed.fields.push({
        name: 'Next',
        value: `Stop → BE @ ${fmtPx(trade.entry)} · runner 50% open`,
        inline: false,
      });
    }
    if (ev.closed) {
      embed.fields.push({
        name: 'Outcome',
        value: `${(ev.outcome || '—').toUpperCase()} · ${fmtR(ev.realizedRAfter)}`,
        inline: true,
      });
    }
  }

  const res = await postDiscordWebhook({ webhookUrl, embeds: [embed] });
  if (!res.ok) {
    console.error('[discord] failed', res.status, res.body.slice(0, 200));
  }
}

export async function processTradeAtPrice(
  pool: pg.Pool,
  row: Record<string, unknown>,
  price: number,
  webhookUrl?: string,
): Promise<EngineEvent[]> {
  const engine = rowToEngine(row);
  const events = evaluateTick(engine, price);
  if (!events.length) {
    await pool.query(
      `UPDATE tracker_trades SET last_price = $2, last_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [engine.id, price],
    );
    return [];
  }

  // Apply sequentially; re-read state mentally from event chain
  let working = { ...engine };
  for (const ev of events) {
    await applyEvent(pool, working.id, ev);
    await notifyEvent(webhookUrl, working, ev);
    working = {
      ...working,
      status: ev.newStatus,
      currentStop: ev.newCurrentStop,
      remainingSize: ev.newRemainingSize,
      tp1ClosedSize: ev.newTp1ClosedSize,
      stopToBe: ev.newStopToBe,
      realizedR: ev.realizedRAfter,
      outcome: ev.outcome,
    };
  }
  return events;
}

export async function processAllActive(
  pool: pg.Pool,
  prices: Map<string, number>,
  webhookUrl?: string,
): Promise<{ checked: number; events: number }> {
  const active = await listTrades(pool, { activeOnly: true, limit: 500 });
  let events = 0;
  for (const row of active) {
    const price = prices.get(String(row.symbol).toUpperCase());
    if (price == null) continue;
    const evs = await processTradeAtPrice(pool, row, price, webhookUrl);
    events += evs.length;
  }
  return { checked: active.length, events };
}

export async function buildWeeklyReport(pool: pg.Pool) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const week = await getPerformance(pool, weekAgo);
  const all = await getPerformance(pool);
  return { week, all, weekAgo, now: new Date() };
}

export async function postWeeklyReport(
  pool: pg.Pool,
  webhookUrl: string | undefined,
): Promise<{ ok: boolean; stats: Awaited<ReturnType<typeof buildWeeklyReport>> }> {
  const stats = await buildWeeklyReport(pool);
  const fieldsWeek = formatStatsEmbedFields(stats.week);
  const fieldsAll = formatStatsEmbedFields(stats.all);

  const embeds: DiscordEmbed[] = [
    {
      title: '📊 AI desk — weekly performance',
      description: `Closed trades from ${stats.weekAgo.toISOString().slice(0, 10)} → ${stats.now.toISOString().slice(0, 10)} (UTC)`,
      color: 0xa855f7,
      fields: fieldsWeek,
      footer: { text: 'Not financial advice · Paper levels / AI ideas only' },
      timestamp: stats.now.toISOString(),
    },
    {
      title: '📈 AI desk — all-time',
      color: 0x38bdf8,
      fields: fieldsAll,
      footer: { text: 'Sharpe/Sortino are per-trade and noisy on small samples' },
      timestamp: stats.now.toISOString(),
    },
  ];

  let discordOk = false;
  if (webhookUrl) {
    const res = await postDiscordWebhook({
      webhookUrl,
      content: '**Sunday desk recap** — AI tracked trade performance',
      embeds,
    });
    discordOk = res.ok;
    if (!res.ok) console.error('[weekly] discord failed', res.status, res.body.slice(0, 200));
  } else {
    console.log('[weekly] no webhook; report computed only', JSON.stringify({ week: stats.week, all: stats.all }).slice(0, 500));
  }

  await pool.query(
    `INSERT INTO tracker_weekly_reports (period_start, period_end, stats, discord_ok)
     VALUES ($1,$2,$3,$4)`,
    [stats.weekAgo.toISOString(), stats.now.toISOString(), JSON.stringify(stats), discordOk],
  );

  return { ok: discordOk || !webhookUrl, stats };
}
