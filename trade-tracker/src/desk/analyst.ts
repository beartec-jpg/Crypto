/**
 * Tool-driven LTF scalp analyst → tracker book.
 */

import type pg from 'pg';
import { createTrade, cancelTrades, listTrades } from '../store.js';
import { fetchBars } from './marketStructure.js';
import { buildDeskToolDefinitions, createDeskToolExecutor } from './tools.js';
import { extractTextContent, runXaiToolLoop } from './xaiToolLoop.js';

export interface DeskConfig {
  enabled: boolean;
  /** Bot id, e.g. xrp_struct / xrp_scalp — also used as trade source when set. */
  id: string;
  /** tracker_trades.source for this bot (defaults to id or scalp_desk). */
  source: string;
  symbols: string[];
  ltf: string;
  htf: string;
  mode: string;
  minRr: number;
  minConfluence: number;
  maxSetups: number;
  maxToolIters: number;
  intervalMs: number;
  apiKey: string;
  /** Human label for prompts / meta */
  label: string;
}

function sharedDeskFields(): Pick<
  DeskConfig,
  'enabled' | 'mode' | 'minRr' | 'minConfluence' | 'maxSetups' | 'maxToolIters' | 'apiKey'
> {
  return {
    enabled: String(process.env.DESK_ENABLED || '0') === '1',
    mode: (process.env.DESK_MODE || 'smc').toLowerCase(),
    minRr: Number(process.env.DESK_MIN_RR || 1.3),
    minConfluence: Number(process.env.DESK_MIN_CONFLUENCE || 2),
    maxSetups: Number(process.env.DESK_MAX_SETUPS_PER_RUN || 2),
    maxToolIters: Number(process.env.DESK_MAX_TOOL_ITERS || 8),
    apiKey: (process.env.XAI_API_KEY || '').trim(),
  };
}

/**
 * Single-bot legacy config (DESK_SYMBOLS / LTF / HTF / INTERVAL).
 */
export function loadDeskConfig(): DeskConfig {
  const shared = sharedDeskFields();
  const id = (process.env.DESK_ID || 'scalp_desk').trim();
  return {
    ...shared,
    id,
    source: (process.env.DESK_SOURCE || id || 'scalp_desk').trim(),
    symbols: (process.env.DESK_SYMBOLS || 'XRPUSDT')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    ltf: (process.env.DESK_LTF || '15m').toLowerCase(),
    htf: (process.env.DESK_HTF || '1h').toLowerCase(),
    // Default 6 hours — frequent re-runs were cancelling good pending setups
    intervalMs: Number(process.env.DESK_ANALYSIS_INTERVAL_MS || 21_600_000),
    label: process.env.DESK_LABEL || `${process.env.DESK_HTF || '1h'}/${process.env.DESK_LTF || '15m'}`,
  };
}

/**
 * Multi-bot: DESK_BOTS=id|symbols|htf|ltf|intervalMs[,...]
 * Example:
 *   xrp_struct|XRPUSDT|4h|15m|28800000,xrp_scalp|XRPUSDT|1h|5m|7200000
 * Falls back to single loadDeskConfig() when DESK_BOTS unset.
 */
export function loadDeskBots(): DeskConfig[] {
  const raw = (process.env.DESK_BOTS || '').trim();
  const shared = sharedDeskFields();
  if (!raw) return [loadDeskConfig()];

  const bots: DeskConfig[] = [];
  for (const part of raw.split(',')) {
    const bit = part.trim();
    if (!bit) continue;
    const [id, symbols, htf, ltf, intervalMs] = bit.split('|').map((s) => s.trim());
    if (!id || !symbols || !htf || !ltf) {
      console.warn(`[desk] skip malformed DESK_BOTS entry: ${bit}`);
      continue;
    }
    const ms = Number(intervalMs || 21_600_000);
    bots.push({
      ...shared,
      id,
      source: id,
      symbols: symbols
        .split('+')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      htf: htf.toLowerCase(),
      ltf: ltf.toLowerCase(),
      intervalMs: Number.isFinite(ms) && ms >= 60_000 ? ms : 21_600_000,
      label: `${htf}/${ltf}`,
    });
  }
  return bots.length ? bots : [loadDeskConfig()];
}

/** All trade sources used by desk bots (for dashboard stats). */
export function deskTradeSources(): string[] {
  const fromEnv = (process.env.DESK_STATS_SOURCES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const bots = loadDeskBots();
  const set = new Set(bots.map((b) => b.source));
  set.add('scalp_desk'); // legacy
  return [...set];
}

export interface AnalysisRunResult {
  symbol: string;
  ok: boolean;
  model?: string;
  toolTrace?: unknown[];
  iterations?: number;
  bestTrades: any[];
  openTradeReviews: any[];
  cancelled: number;
  created: number;
  error?: string;
  tokens?: { input: number; output: number };
  estimatedCost?: number;
  multiTFInsights?: any;
}

function parseJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const GRADE_RANK: Record<string, number> = {
  'A+': 4,
  A: 3,
  B: 2,
  C: 1,
};

/**
 * Drop near-duplicate setups (same direction, entries too close / overlapping risk).
 * Keeps higher grade → higher R:R → more confluence.
 * Stops the model returning two supply-zone shorts that are the same idea.
 */
function dedupeOverlappingSetups(
  trades: any[],
  maxKeep: number,
  entryTolPct = 0.0015, // 0.15%
): any[] {
  const sorted = [...trades].sort((a, b) => {
    const ga = GRADE_RANK[String(a.grade || 'C').toUpperCase()] ?? 0;
    const gb = GRADE_RANK[String(b.grade || 'C').toUpperCase()] ?? 0;
    if (gb !== ga) return gb - ga;
    if ((b._rr || 0) !== (a._rr || 0)) return (b._rr || 0) - (a._rr || 0);
    return (b._conf || 0) - (a._conf || 0);
  });

  const kept: any[] = [];
  for (const t of sorted) {
    const entry = Number(t.entry);
    const sl = Number(t.stopLoss);
    const dir = String(t.direction);
    const tol = Math.abs(entry) * entryTolPct;
    const overlaps = kept.some((k) => {
      if (String(k.direction) !== dir) return false;
      const ke = Number(k.entry);
      const ks = Number(k.stopLoss);
      // entries very close
      if (Math.abs(ke - entry) <= tol) return true;
      // risk zones overlap (same supply/demand pocket)
      const aLo = Math.min(entry, sl);
      const aHi = Math.max(entry, sl);
      const bLo = Math.min(ke, ks);
      const bHi = Math.max(ke, ks);
      return aLo <= bHi && bLo <= aHi;
    });
    if (!overlaps) kept.push(t);
    if (kept.length >= maxKeep) break;
  }
  return kept;
}

async function insertRun(
  pool: pg.Pool,
  row: {
    symbol: string;
    model: string | null;
    toolTrace: unknown;
    bestTrades: unknown;
    openReviews: unknown;
    tokens: unknown;
    insights: unknown;
    error: string | null;
    startedAt: Date;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO desk_analysis_runs
      (symbol, started_at, finished_at, model, tool_trace, best_trades, open_reviews, tokens, insights, error)
     VALUES ($1,$2,NOW(),$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9)`,
    [
      row.symbol,
      row.startedAt.toISOString(),
      row.model,
      JSON.stringify(row.toolTrace ?? []),
      JSON.stringify(row.bestTrades ?? []),
      JSON.stringify(row.openReviews ?? []),
      JSON.stringify(row.tokens ?? {}),
      JSON.stringify(row.insights ?? null),
      row.error,
    ],
  );
  // Keep only the latest run + one previous per symbol (dashboard "previous analysis")
  await pool.query(
    `DELETE FROM desk_analysis_runs
     WHERE symbol = $1
       AND id NOT IN (
         SELECT id FROM desk_analysis_runs
         WHERE symbol = $1
         ORDER BY started_at DESC
         LIMIT 2
       )`,
    [row.symbol],
  );
}

export async function runSymbolAnalysis(
  pool: pg.Pool,
  symbol: string,
  cfg = loadDeskConfig(),
): Promise<AnalysisRunResult> {
  const startedAt = new Date();
  if (!cfg.apiKey) {
    const r = {
      symbol,
      ok: false,
      bestTrades: [],
      openTradeReviews: [],
      cancelled: 0,
      created: 0,
      error: 'XAI_API_KEY not set',
    };
    await insertRun(pool, {
      symbol,
      model: null,
      toolTrace: [],
      bestTrades: [],
      openReviews: [],
      tokens: {},
      insights: null,
      error: r.error,
      startedAt,
    }).catch(() => {});
    return r;
  }

  try {
    // Only this bot's open trades — never cancel/review another bot's book
    const openRows = await listTrades(pool, {
      activeOnly: true,
      symbol,
      limit: 50,
      source: cfg.source,
    });
    const openBook = openRows.map((t: any) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      entry: Number(t.entry),
      stop: Number(t.original_stop ?? t.current_stop),
      targets: t.targets,
      grade: t.grade,
      source: t.source,
    }));

    const [ltfBars, htfBars] = await Promise.all([
      fetchBars(symbol, cfg.ltf, 300),
      fetchBars(symbol, cfg.htf, 300),
    ]);
    const price = ltfBars[ltfBars.length - 1]?.close ?? 0;

    const tools = buildDeskToolDefinitions(cfg.ltf, cfg.htf);
    const executeTool = createDeskToolExecutor({
      symbol,
      ltf: cfg.ltf,
      htf: cfg.htf,
      barsByTf: { [cfg.ltf]: ltfBars, [cfg.htf]: htfBars },
      openBook,
    });

    const preferred =
      cfg.mode === 'indicator'
        ? 'getIndicators, getVolumeProfile, getSmcStructures'
        : 'getSmcStructures, getVolumeProfile, getIndicators, getRecentCandles';

    const holdHint =
      cfg.ltf === '5m' || cfg.ltf === '3m' || cfg.ltf === '1m'
        ? 'expected hold minutes–2h'
        : cfg.ltf === '15m'
          ? 'expected hold 30m–6h'
          : 'expected hold hours–1 day';

    const system = `You are an elite SMC desk analyst for crypto perpetual futures (bot=${cfg.id}).
Horizon: ${cfg.label} (${holdHint}). Stops and targets from LOWER timeframe structure only (${cfg.ltf}).
Higher TF (${cfg.htf}) is bias/context / POI only — fetch via tools when needed.
Mode: ${cfg.mode}.

RULES:
- Use tools for ALL factual levels. Do NOT invent prices not present in tool results.
- Call at least one tool on ${cfg.htf} and one on ${cfg.ltf} before final answer.
- Prefer tools: ${preferred}. Also use getInstitutional when positioning matters.
- ENTRY must be at a concrete zone (FVG/OB/level), never blind market mid-range.
- entryConfirmType usually "reclaim" with entryConfirmLevel (LONG reclaim above; SHORT below).
- stopLiftTrigger + stopLiftTo mandatory before TP1.
- Min R:R to TP1 ≥ ${cfg.minRr}. Min confluence signals ≥ ${cfg.minConfluence}.
- OPEN BOOK: return openTradeReviews keep|cancel ONLY for ids listed (this bot only). Prefer cancel if stale/invalid.
- Return at most ${cfg.maxSetups} bestTrades. Empty array OK if no quality setup.
- Do NOT return two trades that are the same idea (same direction with entries within ~0.15% or overlapping stop zones). Pick the single best zone.
- Only return TWO trades when they are a true sequence: e.g. one counter-trend pullback then a separate with-trend continuation with clearly different entries (not two adjacent FVGs of the same short).
- TP prices must be full market prices (e.g. 1.0025), never rounded integers like 1.
- Respond with ONLY valid JSON (no markdown).`;

    const user = `Symbol: ${symbol}
Last ${cfg.ltf} price: ${price}
Bot: ${cfg.id} · Pair: HTF=${cfg.htf} LTF=${cfg.ltf} · ${cfg.label} · mode=${cfg.mode}

OPEN BOOK this bot only (${openBook.length}):
${openBook.length ? JSON.stringify(openBook, null, 0) : '(empty)'}

Return JSON:
{
  "openTradeReviews": [{ "id": "uuid", "action": "keep|cancel", "reason": "..." }],
  "multiTFInsights": {
    "${cfg.htf}": { "summary": "...", "bias": "BULLISH|BEARISH|NEUTRAL", "keyLevels": [] },
    "${cfg.ltf}": { "summary": "...", "bias": "BULLISH|BEARISH|NEUTRAL", "keyLevels": [] },
    "overallSummary": "..."
  },
  "bestTrades": [{
    "grade": "A+|A|B|C",
    "direction": "LONG|SHORT",
    "entry": "number",
    "entryConfirmType": "reclaim",
    "entryConfirmLevel": "number",
    "entryConfirmRationale": "...",
    "stopLoss": "number",
    "slRationale": "...",
    "stopLiftTrigger": "number",
    "stopLiftTo": "number",
    "stopLiftRationale": "...",
    "targets": ["tp1", "tp2"],
    "confluenceSignals": ["..."],
    "riskRewardRatio": 1.5,
    "reasoning": "..."
  }]
}`;

    const loop = await runXaiToolLoop({
      apiKey: cfg.apiKey,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools,
      executeTool,
      maxIterations: cfg.maxToolIters,
      temperature: 0.35,
      maxTokens: 12_000,
    });

    const text = extractTextContent(loop.message);
    const parsed = parseJson(text) || {};
    const openTradeReviews = Array.isArray(parsed.openTradeReviews) ? parsed.openTradeReviews : [];
    const rawTrades = Array.isArray(parsed.bestTrades) ? parsed.bestTrades : [];

    // Gate + create first so we know if we have replacements
    const live = String(process.env.BLOFIN_LIVE || '0') === '1';
    const minGradeOk = (g: string) => {
      if (!live) return true;
      const u = g.toUpperCase();
      return u.startsWith('A') || u === 'B' || u.startsWith('B');
    };

    const scored = rawTrades
      .map((t: any) => {
        const entry = num(t.entry);
        const sl = num(t.stopLoss);
        const tp1 = num(Array.isArray(t.targets) ? t.targets[0] : t.tp1);
        const dir = String(t.direction || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp1 - entry);
        const rr = risk > 0 ? reward / risk : 0;
        const conf = Array.isArray(t.confluenceSignals) ? t.confluenceSignals.length : 0;
        const pricesOk =
          entry > 0 &&
          sl > 0 &&
          tp1 > 0 &&
          ((dir === 'LONG' && sl < entry && tp1 > entry) ||
            (dir === 'SHORT' && sl > entry && tp1 < entry));
        return { ...t, direction: dir, entry, stopLoss: sl, _rr: rr, _conf: conf, _ok: pricesOk };
      })
      .filter(
        (t: any) =>
          t._ok &&
          t._rr >= cfg.minRr &&
          t._conf >= cfg.minConfluence &&
          minGradeOk(String(t.grade || 'C')) &&
          // reject nonsense TPs (e.g. 1.0 on XRP when entry is 1.00x)
          Math.abs(num(Array.isArray(t.targets) ? t.targets[0] : t.tp1) - t.entry) >
            Math.abs(t.entry) * 0.00005,
      );

    const gated = dedupeOverlappingSetups(scored, cfg.maxSetups);
    if (scored.length > gated.length) {
      console.log(
        `[desk] ${symbol}: deduped setups ${scored.length} → ${gated.length} (overlapping same-direction zones)`,
      );
    }

    // Cancel reviews — protect open/armed book from wipeouts
    // - never cancel entry_hit / tp1_hit (live positions)
    // - only cancel pending/entry_armed
    // - if model wants cancels but produced zero new setups, skip cancels (avoid empty book)
    let cancelled = 0;
    const cancelableIds = new Set(
      openBook
        .filter((t: any) => ['pending', 'entry_armed'].includes(String(t.status)))
        .map((t: any) => String(t.id)),
    );
    let toCancel = openTradeReviews
      .filter((r: any) => String(r.action || '').toLowerCase() === 'cancel' && r.id)
      .map((r: any) => String(r.id))
      .filter((id: string) => cancelableIds.has(id));

    if (toCancel.length && gated.length === 0) {
      console.log(
        `[desk] ${symbol}: skip ${toCancel.length} cancel(s) — no replacement setups (keep open book)`,
      );
      toCancel = [];
    }
    if (toCancel.length) {
      const cr = await cancelTrades(pool, {
        ids: toCancel,
        reason: 'desk scalp cancel',
      });
      cancelled = Array.isArray(cr?.cancelled) ? cr.cancelled.length : toCancel.length;
    }

    let created = 0;
    for (const t of gated) {
      const targets = (Array.isArray(t.targets) ? t.targets : [])
        .map((x: unknown) => num(x))
        .filter((n: number) => n > 0);
      if (targets.length < 1) targets.push(num(t.targets?.[0]));
      try {
        await createTrade(pool, {
          source: cfg.source,
          symbol,
          direction: t.direction,
          grade: String(t.grade || 'B'),
          entry: t.entry,
          stopLoss: t.stopLoss,
          targets: targets.length ? targets : [t.entry],
          entryConfirmType: t.entryConfirmType || 'reclaim',
          entryConfirmLevel: num(t.entryConfirmLevel) || t.entry,
          entryConfirmRationale: t.entryConfirmRationale || null,
          stopLiftTrigger: num(t.stopLiftTrigger) || null,
          stopLiftTo: num(t.stopLiftTo) || null,
          stopLiftRationale: t.stopLiftRationale || null,
          confluenceSignals: Array.isArray(t.confluenceSignals) ? t.confluenceSignals.map(String) : [],
          reasoning: t.reasoning || null,
          riskRewardRatio: t._rr,
          meta: {
            desk: {
              botId: cfg.id,
              horizon: cfg.label,
              mode: cfg.mode,
              ltf: cfg.ltf,
              htf: cfg.htf,
              model: loop.model,
              toolTrace: loop.toolTrace,
            },
          },
        });
        created++;
      } catch (e: any) {
        console.warn(`[desk] createTrade skip ${symbol}:`, e?.message || e);
      }
    }

    const tokens = {
      input: loop.usage.prompt_tokens,
      output: loop.usage.completion_tokens,
    };
    const estimatedCost =
      (tokens.input / 1_000_000) * 2 + (tokens.output / 1_000_000) * 10;

    const insights = {
      ...(parsed.multiTFInsights || {}),
      _deskBot: cfg.id,
      _htf: cfg.htf,
      _ltf: cfg.ltf,
    };
    await insertRun(pool, {
      symbol,
      model: loop.model,
      toolTrace: loop.toolTrace,
      bestTrades: gated,
      openReviews: openTradeReviews,
      tokens: {
        ...tokens,
        estimatedCost,
        iterations: loop.iterations,
        botId: cfg.id,
      },
      insights,
      error: null,
      startedAt,
    });

    return {
      symbol,
      ok: true,
      model: loop.model,
      toolTrace: loop.toolTrace,
      iterations: loop.iterations,
      bestTrades: gated,
      openTradeReviews,
      cancelled,
      created,
      tokens,
      estimatedCost,
      multiTFInsights: insights,
    };
  } catch (err: any) {
    const error = err?.message || String(err);
    console.error(`[desk] analysis failed ${symbol}:`, error);
    await insertRun(pool, {
      symbol,
      model: null,
      toolTrace: [],
      bestTrades: [],
      openReviews: [],
      tokens: {},
      insights: null,
      error,
      startedAt,
    }).catch(() => {});
    return {
      symbol,
      ok: false,
      bestTrades: [],
      openTradeReviews: [],
      cancelled: 0,
      created: 0,
      error,
    };
  }
}

export async function runDeskCycle(pool: pg.Pool, cfg = loadDeskConfig()): Promise<AnalysisRunResult[]> {
  if (!cfg.enabled) {
    console.log(`[desk:${cfg.id}] DESK_ENABLED=0 — skip`);
    return [];
  }
  const out: AnalysisRunResult[] = [];
  for (const symbol of cfg.symbols) {
    console.log(`[desk:${cfg.id}] analysing ${symbol} (${cfg.htf}/${cfg.ltf})…`);
    const r = await runSymbolAnalysis(pool, symbol, cfg);
    console.log(
      `[desk:${cfg.id}] ${symbol} ok=${r.ok} created=${r.created} cancelled=${r.cancelled} tools=${r.toolTrace?.length ?? 0} err=${r.error || ''}`,
    );
    out.push(r);
  }
  return out;
}
