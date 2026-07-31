import http from 'node:http';
import type pg from 'pg';
import {
  createTrade,
  listTrades,
  getPerformance,
  processAllActive,
  processTradeAtPrice,
  postWeeklyReport,
  buildWeeklyReport,
} from './store.js';
import { fetchPrices, setPriceOverride, clearPriceOverrides } from './prices.js';

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
  const webhookUrl = () => process.env.DISCORD_WEBHOOK_URL || undefined;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (req.method === 'OPTIONS') {
        return json(res, 200, { ok: true });
      }

      if (path === '/health' || path === '/api/health') {
        const active = await listTrades(pool, { activeOnly: true, limit: 500 });
        return json(res, 200, {
          ok: true,
          service: 'trade-tracker',
          activeTrades: active.length,
          time: new Date().toISOString(),
        });
      }

      // Public read endpoints
      if (req.method === 'GET' && (path === '/api/trades' || path === '/trades')) {
        const activeOnly = url.searchParams.get('active') === '1';
        const rows = await listTrades(pool, {
          activeOnly,
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
            confluenceSignals: t.confluenceSignals || t.confluence_signals,
            reasoning: t.reasoning,
            riskRewardRatio: t.riskRewardRatio ?? t.risk_reward_ratio,
            meta: t.meta,
          });
          created.push(row);
        }
        return json(res, 201, { created, count: created.length });
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
        const events = await processTradeAtPrice(pool, r.rows[0], price, webhookUrl());
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
