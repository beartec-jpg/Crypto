import http from 'node:http';
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
        return json(res, 200, {
          ok: true,
          service: 'trade-tracker',
          activeTrades: active.length,
          time: new Date().toISOString(),
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
