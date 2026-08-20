import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import {
  createTrade,
  listTrades,
  cancelTrades,
  getPerformance,
  processAllActive,
  processTradeAtPrice,
  postWeeklyReport,
  buildWeeklyReport,
} from './store.js';
import { fetchPrices, setPriceOverride, clearPriceOverrides } from './prices.js';
import { resolveWebhookForSymbol } from './discord.js';
import {
  loadBlofinConfig,
  mapDeskSymbolToInstId,
  probeAccount,
  getInstrument,
  getAvailableMarginForTrade,
  planSize,
  finalizeSize,
} from './blofin.js';
import { describeSizingExample } from './execution.js';
import { deskTradeSources, loadDeskBots, loadDeskConfig } from './desk/analyst.js';
import { forceDeskRun, getDeskSchedulerStatus } from './desk/scheduler.js';
import { fetchBars } from './desk/marketStructure.js';
import {
  createDeskToolExecutor,
  buildDeskToolDefinitions,
} from './desk/tools.js';

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tracker-Key',
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorize(req: http.IncomingMessage): boolean {
  const key = process.env.TRACKER_API_KEY;
  if (!key) return true; // open if unset (local/e2e); set key in prod
  const hdr = req.headers['x-tracker-key'] || req.headers.authorization;
  if (!hdr) return false;
  const val = Array.isArray(hdr) ? hdr[0] : hdr;
  if (val === key) return true;
  if (val === `Bearer ${key}`) return true;
  return false;
}

export function createServer(pool: pg.Pool) {
  const webhookUrl = (symbol?: string) =>
    resolveWebhookForSymbol(symbol) || process.env.DISCORD_WEBHOOK_URL || undefined;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (req.method === 'OPTIONS') {
        return json(res, 200, { ok: true });
      }

      if (path === '/health' || path === '/api/health') {
        const active = await listTrades(pool, { activeOnly: true, limit: 500 });
        const bcfg = loadBlofinConfig();
        const dcfg = loadDeskConfig();
        return json(res, 200, {
          ok: true,
          service: 'trade-tracker',
          activeTrades: active.length,
          time: new Date().toISOString(),
          desk: getDeskSchedulerStatus(),
          deskConfig: {
            enabled: dcfg.enabled,
            symbols: dcfg.symbols,
            ltf: dcfg.ltf,
            htf: dcfg.htf,
            hasXaiKey: Boolean(dcfg.apiKey),
          },
          blofin: {
            configured: bcfg.configured,
            live: bcfg.live,
            marginFraction: bcfg.marginFraction,
            fallbackMarginUsdt: bcfg.defaultMarginUsdt,
            leverage: bcfg.maxLeverage,
            symbolMap: bcfg.symbolMap,
          },
        });
      }

      // Standalone desk dashboard (open-port UI)
      if (req.method === 'GET' && (path === '/' || path === '/desk' || path === '/index.html')) {
        return serveDashboard(res);
      }

      if (req.method === 'GET' && (path === '/api/desk/status' || path === '/desk/status')) {
        const bcfg = loadBlofinConfig();
        return json(res, 200, {
          scheduler: getDeskSchedulerStatus(),
          blofin: { live: bcfg.live, configured: bcfg.configured, marginFraction: bcfg.marginFraction },
          time: new Date().toISOString(),
        });
      }

      // Scalp desk bots only — never mix Discord / sim / manual into this dashboard
      const SCALP_SOURCES = deskTradeSources();

      // OHLCV for dashboard chart
      if (req.method === 'GET' && (path === '/api/desk/candles' || path === '/desk/candles')) {
        const dcfg = loadDeskConfig();
        const symbol = (url.searchParams.get('symbol') || dcfg.symbols[0] || 'BTCUSDT').toUpperCase();
        const tf = (url.searchParams.get('tf') || dcfg.ltf || '15m').toLowerCase();
        const limit = Math.min(500, Math.max(50, Number(url.searchParams.get('limit') || 200)));
        try {
          const bars = await fetchBars(symbol, tf, limit);
          const candles = bars.map((b) => ({
            time: b.time as number,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          }));
          return json(res, 200, { symbol, tf, candles });
        } catch (e: any) {
          return json(res, 502, { error: e?.message || 'candles failed' });
        }
      }

      // Manual tool probe (same tools Grok can call)
      if (req.method === 'GET' && (path === '/api/desk/tools' || path === '/desk/tools')) {
        const dcfg = loadDeskConfig();
        const defs = buildDeskToolDefinitions(dcfg.ltf, dcfg.htf);
        return json(res, 200, {
          tools: defs.map((d: any) => ({
            name: d.function.name,
            description: d.function.description,
            parameters: d.function.parameters,
          })),
          ltf: dcfg.ltf,
          htf: dcfg.htf,
          symbols: dcfg.symbols,
        });
      }

      if (req.method === 'GET' && (path === '/api/desk/tool' || path === '/desk/tool')) {
        const dcfg = loadDeskConfig();
        const name = String(url.searchParams.get('name') || '');
        const symbol = (url.searchParams.get('symbol') || dcfg.symbols[0] || 'BTCUSDT').toUpperCase();
        const tf = (url.searchParams.get('tf') || dcfg.ltf || '15m').toLowerCase();
        const n = Number(url.searchParams.get('n') || 20);
        if (!name) return json(res, 400, { error: 'name required' });
        try {
          const allowedTf = new Set([dcfg.ltf, dcfg.htf, tf]);
          const barsByTf: Record<string, Awaited<ReturnType<typeof fetchBars>>> = {};
          for (const t of [dcfg.ltf, dcfg.htf]) {
            if (!barsByTf[t]) barsByTf[t] = await fetchBars(symbol, t, 300);
          }
          if (tf && !barsByTf[tf] && allowedTf.has(tf)) {
            barsByTf[tf] = await fetchBars(symbol, tf, 300);
          }
          const openBook = await listTrades(pool, {
            activeOnly: true,
            symbol,
            sources: SCALP_SOURCES,
            limit: 50,
          });
          const exec = createDeskToolExecutor({
            symbol,
            ltf: dcfg.ltf,
            htf: dcfg.htf,
            barsByTf,
            openBook,
          });
          const t0 = Date.now();
          const data = await exec(name, { tf, n });
          return json(res, 200, { name, symbol, tf, ms: Date.now() - t0, data });
        } catch (e: any) {
          return json(res, 502, { error: e?.message || 'tool failed', name, symbol, tf });
        }
      }

      if (req.method === 'GET' && (path === '/api/desk/book' || path === '/desk/book')) {
        const rows = await listTrades(pool, {
          activeOnly: true,
          limit: 200,
          sources: SCALP_SOURCES,
        });
        return json(res, 200, { trades: rows, count: rows.length, sources: SCALP_SOURCES });
      }

      // Dashboard bundle: bot stats + trading stats + last/previous analysis (no raw dumps)
      if (req.method === 'GET' && (path === '/api/desk/dashboard' || path === '/desk/dashboard')) {
        const bots = loadDeskBots();
        const dcfg = bots[0] || loadDeskConfig();
        const allSymbols = [
          ...new Set(bots.flatMap((b) => b.symbols)),
        ];
        const bcfg = loadBlofinConfig();
        const sched = getDeskSchedulerStatus();
        const active = await listTrades(pool, {
          activeOnly: true,
          limit: 200,
          sources: SCALP_SOURCES,
        });
        const perf = await getPerformance(pool, undefined, { sources: SCALP_SOURCES });
        const byStatus: Record<string, number> = {};
        for (const t of active) {
          const s = String((t as any).status || 'unknown');
          byStatus[s] = (byStatus[s] || 0) + 1;
        }
        // latest run overall
        const latestQ = await pool.query(
          `SELECT id, symbol, started_at, finished_at, model, tool_trace, best_trades, open_reviews, tokens, insights, error
           FROM desk_analysis_runs
           ORDER BY started_at DESC
           LIMIT 1`,
        );
        const latest = latestQ.rows[0] || null;
        // previous = second-most-recent overall (or per same symbol if exists)
        let previous = null;
        if (latest) {
          const prevQ = await pool.query(
            `SELECT id, symbol, started_at, finished_at, model, tool_trace, best_trades, tokens, insights, error
             FROM desk_analysis_runs
             WHERE id <> $1
             ORDER BY started_at DESC
             LIMIT 1`,
            [latest.id],
          );
          previous = prevQ.rows[0] || null;
        }
        // Latest analysis per symbol + per desk bot (dual XRP bots share symbol)
        const recentRunsQ = await pool.query(
          `SELECT id, symbol, started_at, finished_at, model, tool_trace, best_trades, open_reviews, tokens, insights, error
           FROM desk_analysis_runs
           ORDER BY started_at DESC
           LIMIT 40`,
        );
        const analysisBySymbol: Record<string, unknown> = {};
        const analysisByBot: Record<string, unknown> = {};
        for (const row of recentRunsQ.rows) {
          const sym = String(row.symbol).toUpperCase();
          if (!analysisBySymbol[sym]) analysisBySymbol[sym] = row;
          const insights =
            row.insights && typeof row.insights === 'object' ? (row.insights as any) : {};
          const tokens = row.tokens && typeof row.tokens === 'object' ? (row.tokens as any) : {};
          const botId = String(insights._deskBot || insights.deskBot || tokens.botId || '');
          if (botId && !analysisByBot[botId]) analysisByBot[botId] = row;
        }
        // Keep more history with multi-bot (4 per symbol)
        await pool.query(`
          DELETE FROM desk_analysis_runs a
          WHERE a.ctid IN (
            SELECT ctid FROM (
              SELECT ctid, row_number() OVER (
                PARTITION BY symbol, COALESCE(bot_id, '') ORDER BY started_at DESC
              ) AS rn
              FROM desk_analysis_runs
            ) x WHERE rn > 2
          )`);

        return json(res, 200, {
          time: new Date().toISOString(),
          bot: {
            deskEnabled: dcfg.enabled,
            symbols: allSymbols.length ? allSymbols : dcfg.symbols,
            ltf: dcfg.ltf,
            htf: dcfg.htf,
            mode: dcfg.mode,
            intervalMs: dcfg.intervalMs,
            hasXaiKey: Boolean(dcfg.apiKey),
            analysing: sched.running,
            lastCycleAt: sched.lastCycleAt,
            bots: sched.bots,
            blofinLive: bcfg.live,
            blofinConfigured: bcfg.configured,
            marginFraction: bcfg.marginFraction,
            leverage: bcfg.maxLeverage,
          },
          trading: {
            scope: 'scalp_desk_bots',
            sources: SCALP_SOURCES,
            activeSetups: active.length,
            byStatus,
            closedTrades: perf.totalTrades,
            wins: perf.wins,
            losses: perf.losses,
            scratches: perf.scratches,
            winRate: perf.winRate,
            netR: perf.netR,
            avgR: perf.avgR,
            expectancyR: perf.expectancyR,
            profitFactor: perf.profitFactor,
            maxDrawdownR: perf.maxDrawdownR,
            bestTradeR: perf.bestTradeR,
            worstTradeR: perf.worstTradeR,
          },
          openBook: active,
          lastAnalysis: latest,
          previousAnalysis: previous,
          analysisBySymbol,
          analysisByBot,
        });
      }

      if (req.method === 'GET' && (path === '/api/desk/runs' || path === '/desk/runs')) {
        const r = await pool.query(
          `SELECT id, symbol, started_at, finished_at, model, tool_trace, best_trades, open_reviews, tokens, insights, error, created_at
           FROM desk_analysis_runs
           ORDER BY started_at DESC
           LIMIT 4`,
        );
        return json(res, 200, { runs: r.rows });
      }

      // Blofin connectivity + sizing probe (auth required when key set)
      if (req.method === 'GET' && (path === '/api/blofin/status' || path === '/blofin/status')) {
        if (!authorize(req)) return json(res, 401, { error: 'Unauthorized' });
        const probe = await probeAccount();
        const cfg = loadBlofinConfig();
        const samples: Record<string, unknown> = {};
        for (const desk of ['BTCUSDT', 'XRPUSDT', 'XRPUSD']) {
          const instId = mapDeskSymbolToInstId(desk, cfg);
          const inst = await getInstrument(instId).catch(() => null);
          if (!inst) {
            samples[desk] = { instId, error: 'instrument not found' };
            continue;
          }
          const px = desk.startsWith('BTC') ? 95000 : 1.03;
          const avail = await getAvailableMarginForTrade(inst, px, cfg.marginFraction).catch((e: Error) => ({
            note: e.message,
            marginUsdt: 0,
            available: 0,
            currency: '?',
          }));
          const plan = finalizeSize(inst, planSize(inst, px, avail.marginUsdt || 0, cfg.maxLeverage));
          samples[desk] = {
            instId,
            contractType: inst.contractType,
            settleCurrency: inst.settleCurrency,
            contractValue: inst.contractValue,
            minSize: inst.minSize,
            lotSize: inst.lotSize,
            examplePrice: px,
            availableMargin: avail,
            plan,
          };
        }
        return json(res, 200, {
          probe,
          config: {
            live: cfg.live,
            marginFraction: cfg.marginFraction,
            fallbackMarginUsdt: cfg.defaultMarginUsdt,
            leverage: cfg.maxLeverage,
            marginMode: cfg.marginMode,
            symbolMap: cfg.symbolMap,
          },
          sizing: describeSizingExample(),
          samples,
        });
      }

      // Public read endpoints
      if (req.method === 'GET' && (path === '/api/trades' || path === '/trades')) {
        const activeOnly = url.searchParams.get('active') === '1';
        const rows = await listTrades(pool, {
          activeOnly,
          symbol: url.searchParams.get('symbol') || undefined,
          limit: Number(url.searchParams.get('limit') || 100),
          status: url.searchParams.get('status') || undefined,
        });
        return json(res, 200, { trades: rows });
      }

      if (req.method === 'GET' && (path === '/api/performance' || path === '/performance')) {
        const days = url.searchParams.get('days');
        const since = days ? new Date(Date.now() - Number(days) * 86400000) : undefined;
        const stats = await getPerformance(pool, since);
        const all = await getPerformance(pool);
        return json(res, 200, { period: stats, allTime: all, since: since?.toISOString() || null });
      }

      if (req.method === 'GET' && (path === '/api/weekly-preview' || path === '/weekly-preview')) {
        const report = await buildWeeklyReport(pool);
        return json(res, 200, report);
      }

      // Mutating endpoints require API key when configured
      if (!authorize(req)) {
        return json(res, 401, { error: 'Unauthorized' });
      }

      if (req.method === 'POST' && (path === '/api/desk/run' || path === '/desk/run')) {
        const botId = url.searchParams.get('bot') || undefined;
        const result = await forceDeskRun(pool, botId);
        return json(res, result.ok ? 200 : 409, result);
      }

      if (req.method === 'POST' && (path === '/api/trades' || path === '/trades')) {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const tradesIn = Array.isArray(body.trades) ? body.trades : [body];
        const created = [];
        for (const t of tradesIn) {
          const dir = String(t.direction || '').toUpperCase();
          if (dir !== 'LONG' && dir !== 'SHORT') {
            throw new Error(`Invalid direction: ${t.direction}`);
          }
          const row = await createTrade(pool, {
            userId: t.userId || body.userId,
            source: t.source || body.source || 'api',
            symbol: t.symbol,
            direction: dir,
            grade: t.grade,
            entry: Number(t.entry),
            stopLoss: Number(t.stopLoss ?? t.stop_loss),
            targets: Array.isArray(t.targets)
              ? t.targets.map(Number)
              : [Number(t.tp1), Number(t.tp2)].filter((n) => Number.isFinite(n)),
            entryConfirmType: t.entryConfirmType ?? t.entry_confirm_type ?? 'reclaim',
            entryConfirmLevel:
              t.entryConfirmLevel ?? t.entry_confirm_level ?? t.entry ?? null,
            entryConfirmRationale:
              t.entryConfirmRationale ?? t.entry_confirm_rationale ?? null,
            stopLiftTrigger:
              t.stopLiftTrigger ?? t.stop_lift_trigger ?? t.breakEvenTrigger ?? null,
            stopLiftTo: t.stopLiftTo ?? t.stop_lift_to ?? t.breakEvenPrice ?? null,
            stopLiftRationale:
              t.stopLiftRationale ?? t.stop_lift_rationale ?? t.slLiftRationale ?? null,
            confluenceSignals: t.confluenceSignals || t.confluence_signals,
            reasoning: t.reasoning,
            riskRewardRatio: t.riskRewardRatio ?? t.risk_reward_ratio,
            meta: t.meta,
          });
          created.push(row);
        }
        return json(res, 201, { created, count: created.length });
      }

      // Cancel open ideas (desk re-validation keep|cancel)
      if (req.method === 'POST' && (path === '/api/trades/cancel' || path === '/trades/cancel')) {
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        const ids = Array.isArray(body.ids)
          ? body.ids
          : body.id
            ? [body.id]
            : [];
        if (!ids.length) return json(res, 400, { error: 'ids required' });
        const result = await cancelTrades(pool, {
          ids: ids.map(String),
          reason: body.reason || 'desk_review_cancel',
        });
        // Optional Discord notice for each cancel
        if (result.cancelled.length) {
          const { postDiscordWebhook } = await import('./discord.js');
          for (const t of result.cancelled.slice(0, 5)) {
            const hook = webhookUrl(String(t.symbol));
            if (!hook) continue;
            await postDiscordWebhook({
              webhookUrl: hook,
              embeds: [
                {
                  title: `${t.symbol} · CANCELLED · ${t.direction}`,
                  description:
                    (body.reason || 'Desk review cancelled this setup') +
                    (t.reasoning ? `\n\n_Was:_ ${String(t.reasoning).slice(0, 200)}` : ''),
                  color: 0x64748b,
                  fields: [
                    { name: 'Entry', value: String(t.entry), inline: true },
                    { name: 'Was status', value: String(body.previousStatus || 'active'), inline: true },
                    { name: 'Id', value: String(t.id).slice(0, 8), inline: true },
                  ],
                  footer: { text: 'AI trade tracker · setup removed from book' },
                  timestamp: new Date().toISOString(),
                },
              ],
            });
          }
        }
        return json(res, 200, {
          ok: true,
          cancelled: result.cancelled.length,
          skipped: result.skipped,
          trades: result.cancelled,
        });
      }

      if (req.method === 'POST' && (path === '/api/tick' || path === '/tick')) {
        // Force one process cycle (or with overrides)
        const raw = await readBody(req);
        const body = raw ? JSON.parse(raw) : {};
        if (body.prices && typeof body.prices === 'object') {
          for (const [sym, px] of Object.entries(body.prices)) {
            setPriceOverride(String(sym), Number(px));
          }
        }
        const active = await listTrades(pool, { activeOnly: true, limit: 500 });
        const symbols = active.map((r) => String(r.symbol));
        const fetched = await fetchPrices(symbols);
        const map = new Map(fetched.map((p) => [p.symbol, p.price]));
        // Per-trade webhooks resolved inside notifyEvent by symbol
        const result = await processAllActive(pool, map, webhookUrl());
        if (body.clearOverrides) clearPriceOverrides();
        return json(res, 200, result);
      }

      if (req.method === 'POST' && (path === '/api/sim-price' || path === '/sim-price')) {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        if (body.symbol && body.price != null) {
          setPriceOverride(String(body.symbol), Number(body.price));
        }
        if (body.clear) clearPriceOverrides();
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && (path === '/api/weekly' || path === '/weekly')) {
        const result = await postWeeklyReport(pool, webhookUrl());
        return json(res, 200, result);
      }

      if (req.method === 'POST' && path.startsWith('/api/trades/') && path.endsWith('/process')) {
        const id = path.split('/')[3];
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const r = await pool.query(`SELECT * FROM tracker_trades WHERE id = $1`, [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not found' });
        const price = Number(body.price);
        if (!Number.isFinite(price)) return json(res, 400, { error: 'price required' });
        const events = await processTradeAtPrice(
          pool,
          r.rows[0],
          price,
          webhookUrl(String(r.rows[0].symbol)),
        );
        const updated = await pool.query(`SELECT * FROM tracker_trades WHERE id = $1`, [id]);
        return json(res, 200, { events, trade: updated.rows[0] });
      }

      return json(res, 404, { error: 'not found', path });
    } catch (err: any) {
      console.error('[http]', err);
      return json(res, 500, { error: err?.message || 'server error' });
    }
  });
}

function serveDashboard(res: http.ServerResponse): void {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // dist/src/server.js → public at package root public/desk.html
  const candidates = [
    path.join(__dirname, '../../public/desk.html'),
    path.join(__dirname, '../public/desk.html'),
    path.join(process.cwd(), 'public/desk.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const html = fs.readFileSync(p, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      });
      res.end(html);
      return;
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body style="font-family:sans-serif;background:#0b1220;color:#e2e8f0;padding:2rem">
    <h1>Scalp desk</h1>
    <p>public/desk.html missing — API still works.</p>
    <ul>
      <li><a href="/api/health" style="color:#7dd3fc">/api/health</a></li>
      <li><a href="/api/desk/status" style="color:#7dd3fc">/api/desk/status</a></li>
      <li><a href="/api/desk/book" style="color:#7dd3fc">/api/desk/book</a></li>
      <li><a href="/api/desk/runs" style="color:#7dd3fc">/api/desk/runs</a></li>
    </ul>
  </body></html>`);
}
