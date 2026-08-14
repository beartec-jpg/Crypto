import { getPool, migrate, closePool } from './db.js';
import { createServer } from './server.js';
import { listTrades, processAllActive, postWeeklyReport } from './store.js';
import { fetchPrices } from './prices.js';
import { resolveWebhookForSymbol } from './discord.js';

const PORT = Number(process.env.PORT || 3101);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 15_000);
const WEEKLY_DOW = Number(process.env.WEEKLY_DOW ?? 0); // 0 = Sunday
const WEEKLY_HOUR_UTC = Number(process.env.WEEKLY_HOUR_UTC ?? 18);

async function pollOnce(pool: ReturnType<typeof getPool>) {
  // Fallback URL; per-trade channel resolved inside notifyEvent by symbol
  const webhook =
    resolveWebhookForSymbol('BTCUSDT') || process.env.DISCORD_WEBHOOK_URL || undefined;
  const active = await listTrades(pool, { activeOnly: true, limit: 500 });
  if (!active.length) {
    return { checked: 0, events: 0 };
  }
  const symbols = active.map((r) => String(r.symbol));
  const prices = await fetchPrices(symbols);
  const map = new Map(prices.map((p) => [p.symbol, p.price]));
  return processAllActive(pool, map, webhook);
}

function msUntilNextWeekly(): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    WEEKLY_HOUR_UTC,
    0,
    0,
    0,
  ));
  // advance to target DOW
  while (next.getUTCDay() !== WEEKLY_DOW || next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

let lastWeeklyKey = '';

async function maybeWeekly(pool: ReturnType<typeof getPool>) {
  const now = new Date();
  if (now.getUTCDay() !== WEEKLY_DOW) return;
  if (now.getUTCHours() !== WEEKLY_HOUR_UTC) return;
  const key = now.toISOString().slice(0, 13); // yyyy-mm-ddThh
  if (key === lastWeeklyKey) return;
  lastWeeklyKey = key;
  console.log('[weekly] posting Sunday report…');
  await postWeeklyReport(pool, process.env.DISCORD_WEBHOOK_URL || undefined);
}

async function main() {
  console.log('[tracker] starting…');
  const pool = getPool();
  await migrate();

  const server = createServer(pool);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[tracker] HTTP on :${PORT}`);
  });

  // Blofin boot summary (never print secrets)
  try {
    const { loadBlofinConfig } = await import('./blofin.js');
    const b = loadBlofinConfig();
    console.log(
      `[blofin] configured=${b.configured} live=${b.live} marginFraction=${b.marginFraction} fallbackMarginUsdt=${b.defaultMarginUsdt} lev=${b.maxLeverage} map=${JSON.stringify(b.symbolMap)}`,
    );
    if (b.configured && !b.live) {
      console.log('[blofin] BLOFIN_LIVE=0 → dry-run only (no real orders). Set BLOFIN_LIVE=1 to go live.');
    }
    if (b.configured && b.live) {
      console.log(`[blofin] LIVE — sizing ${(b.marginFraction * 100).toFixed(0)}% of available margin × ${b.maxLeverage}x`);
    }
  } catch (err: unknown) {
    console.warn('[blofin] config load failed', err);
  }

  console.log(`[tracker] poll every ${POLL_MS}ms; weekly DOW=${WEEKLY_DOW} hourUTC=${WEEKLY_HOUR_UTC}`);
  console.log(`[tracker] next weekly in ~${Math.round(msUntilNextWeekly() / 3600000)}h`);

  const tick = async () => {
    try {
      const r = await pollOnce(pool);
      if (r.events > 0) {
        console.log(`[poll] checked=${r.checked} events=${r.events}`);
      }
      await maybeWeekly(pool);
    } catch (err: any) {
      console.error('[poll] error', err?.message || err);
    }
  };

  await tick();
  const interval = setInterval(tick, POLL_MS);

  const shutdown = async (sig: string) => {
    console.log(`[tracker] ${sig} shutting down`);
    clearInterval(interval);
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[tracker] fatal', err);
  process.exit(1);
});
