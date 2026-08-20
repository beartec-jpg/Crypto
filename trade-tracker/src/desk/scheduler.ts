import type pg from 'pg';
import {
  loadDeskBots,
  loadDeskConfig,
  runDeskCycle,
  type DeskConfig,
} from './analyst.js';

type BotRuntime = {
  cfg: DeskConfig;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  bootTimer: ReturnType<typeof setTimeout> | null;
  lastCycleAt: string | null;
  lastResults: unknown;
};

const runtimes = new Map<string, BotRuntime>();

export function getDeskSchedulerStatus() {
  const bots = loadDeskBots();
  const list = bots.map((cfg) => {
    const rt = runtimes.get(cfg.id);
    return {
      id: cfg.id,
      source: cfg.source,
      symbols: cfg.symbols,
      ltf: cfg.ltf,
      htf: cfg.htf,
      label: cfg.label,
      intervalMs: cfg.intervalMs,
      running: rt?.running ?? false,
      lastCycleAt: rt?.lastCycleAt ?? null,
    };
  });
  const anyRunning = list.some((b) => b.running);
  const primary = list[0];
  return {
    enabled: bots[0]?.enabled ?? false,
    /** @deprecated single-bot shape — prefer `bots` */
    symbols: primary?.symbols ?? [],
    ltf: primary?.ltf,
    htf: primary?.htf,
    intervalMs: primary?.intervalMs,
    running: anyRunning,
    lastCycleAt: primary ? runtimes.get(primary.id)?.lastCycleAt ?? null : null,
    lastResults: primary ? runtimes.get(primary.id)?.lastResults ?? null : null,
    hasXaiKey: Boolean(loadDeskConfig().apiKey),
    bots: list,
  };
}

async function recentlyAnalysed(
  pool: pg.Pool,
  symbols: string[],
  withinMin: number,
  botId?: string,
): Promise<boolean> {
  if (!symbols.length) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM desk_analysis_runs
       WHERE symbol = ANY($1::text[])
         AND created_at > NOW() - ($2::int * INTERVAL '1 minute')
         AND ($3::text IS NULL OR bot_id = $3 OR (bot_id IS NULL AND COALESCE(insights->>'_deskBot','') = $3))
       LIMIT 1`,
      [symbols, Math.max(1, Math.floor(withinMin)), botId || null],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function tickBot(pool: pg.Pool, rt: BotRuntime): Promise<void> {
  if (rt.running) {
    console.log(`[desk:${rt.cfg.id}] previous cycle still running — skip`);
    return;
  }
  if (!rt.cfg.enabled) return;
  rt.running = true;
  try {
    rt.lastResults = await runDeskCycle(pool, rt.cfg);
    rt.lastCycleAt = new Date().toISOString();
  } catch (e: any) {
    console.error(`[desk:${rt.cfg.id}] cycle error`, e?.message || e);
  } finally {
    rt.running = false;
  }
}

export function startDeskScheduler(pool: pg.Pool): void {
  const bots = loadDeskBots();
  if (!bots.length || !bots[0].enabled) {
    console.log('[desk] scheduler not started (DESK_ENABLED=0 or no bots)');
    return;
  }

  // Clear any previous (hot-reload safety)
  stopDeskScheduler();

  const runOnBoot = String(process.env.DESK_RUN_ON_BOOT ?? '0') === '1';
  const skipIfRecentMin = Number(process.env.DESK_BOOT_SKIP_IF_RECENT_MIN || 45);

  for (const cfg of bots) {
    const rt: BotRuntime = {
      cfg,
      running: false,
      timer: null,
      bootTimer: null,
      lastCycleAt: null,
      lastResults: null,
    };
    runtimes.set(cfg.id, rt);

    const perDay = (24 * 3600_000) / cfg.intervalMs;
    console.log(
      `[desk:${cfg.id}] ON ${cfg.symbols.join('+')} ${cfg.htf}/${cfg.ltf} every ${cfg.intervalMs}ms (~${perDay.toFixed(1)}/day) source=${cfg.source}`,
    );

    rt.timer = setInterval(() => void tickBot(pool, rt), cfg.intervalMs);

    if (runOnBoot) {
      rt.bootTimer = setTimeout(() => {
        void (async () => {
          const recent = await recentlyAnalysed(pool, cfg.symbols, skipIfRecentMin, cfg.id);
          if (recent) {
            console.log(
              `[desk:${cfg.id}] skip boot run — analysis within last ${skipIfRecentMin}m (avoids flip on restart)`,
            );
            return;
          }
          await tickBot(pool, rt);
        })();
      }, 30_000);
    } else {
      console.log(`[desk:${cfg.id}] boot run disabled (DESK_RUN_ON_BOOT=0) — next at interval`);
    }
  }
}

export function stopDeskScheduler(): void {
  for (const rt of runtimes.values()) {
    if (rt.timer) clearInterval(rt.timer);
    if (rt.bootTimer) clearTimeout(rt.bootTimer);
  }
  runtimes.clear();
}

export async function forceDeskRun(pool: pg.Pool, botId?: string) {
  const bots = loadDeskBots().filter((b) => !botId || b.id === botId);
  if (!bots.length) return { ok: false, error: botId ? `unknown bot ${botId}` : 'no bots' };

  const results: unknown[] = [];
  for (const cfg of bots) {
    let rt = runtimes.get(cfg.id);
    if (!rt) {
      rt = {
        cfg,
        running: false,
        timer: null,
        bootTimer: null,
        lastCycleAt: null,
        lastResults: null,
      };
      runtimes.set(cfg.id, rt);
    }
    if (rt.running) {
      results.push({ bot: cfg.id, ok: false, error: 'cycle already running' });
      continue;
    }
    await tickBot(pool, rt);
    results.push({ bot: cfg.id, ok: true, lastCycleAt: rt.lastCycleAt, results: rt.lastResults });
  }
  return { ok: true, results };
}
