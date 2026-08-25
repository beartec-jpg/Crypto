import type pg from 'pg';
import type { Bar } from './marketStructure.js';
import {
  indicatorsPayload,
  priceContext,
  recentCandlesPayload,
  smcPayload,
  volumeProfilePayload,
} from './marketStructure.js';
import { getInstitutional } from './institutional.js';
import { readSmcSnapshot, readStructureSince, readZoneHistory } from './smc/snapshot.js';

export interface DeskToolContext {
  symbol: string;
  ltf: string;
  htf: string;
  barsByTf: Record<string, Bar[]>;
  openBook: unknown[];
  pool?: pg.Pool;
}

export function buildDeskToolDefinitions(ltf: string, htf: string) {
  const tfEnum = [ltf, htf];
  return [
    {
      type: 'function',
      function: {
        name: 'getPriceContext',
        description: 'Last price, ATR and recent range for a timeframe.',
        parameters: {
          type: 'object',
          properties: { tf: { type: 'string', enum: tfEnum } },
          required: ['tf'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getIndicators',
        description: 'RSI, MACD hist, Stoch, ATR, EMAs for a timeframe.',
        parameters: {
          type: 'object',
          properties: { tf: { type: 'string', enum: tfEnum } },
          required: ['tf'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getSmcStructures',
        description:
          'Live SMC map for a TF: stable zone ids, originSwing SL, tests (wick without close-through), mitigated (close through), BOS/CHoCH history. Default SL is originSwing, not the FVG edge.',
        parameters: {
          type: 'object',
          properties: { tf: { type: 'string', enum: tfEnum } },
          required: ['tf'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getVolumeProfile',
        description: 'POC / VAH / VAL volume profile for a timeframe.',
        parameters: {
          type: 'object',
          properties: { tf: { type: 'string', enum: tfEnum } },
          required: ['tf'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getRecentCandles',
        description: 'Last N OHLC candles for micro structure / reclaim levels.',
        parameters: {
          type: 'object',
          properties: {
            tf: { type: 'string', enum: tfEnum },
            n: { type: 'integer', minimum: 5, maximum: 50 },
          },
          required: ['tf'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getInstitutional',
        description: 'Open interest, funding rate (Coinalyze/Coinglass/Binance).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getOpenBook',
        description: 'Active tracker setups for this symbol (keep/cancel candidates).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getZoneHistory',
        description: 'Lifecycle of one SMC zone by stable id (created / tested / mitigated).',
        parameters: {
          type: 'object',
          properties: { zone_id: { type: 'string' } },
          required: ['zone_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getStructureSince',
        description: 'BOS/CHoCH events on a TF since a unix bar timestamp.',
        parameters: {
          type: 'object',
          properties: {
            tf: { type: 'string', enum: tfEnum },
            since: { type: 'number', description: 'unix seconds' },
          },
          required: ['tf', 'since'],
        },
      },
    },
  ];
}

export function createDeskToolExecutor(ctx: DeskToolContext) {
  const allowed = new Set([ctx.ltf, ctx.htf]);
  const bars = (tf: string) => {
    if (!allowed.has(tf)) throw new Error(`tf must be ${ctx.ltf} or ${ctx.htf}`);
    const b = ctx.barsByTf[tf];
    if (!b?.length) throw new Error(`no bars for ${tf}`);
    return b;
  };

  return async (name: string, args: Record<string, unknown>) => {
    const tf = String(args.tf || ctx.ltf);
    switch (name) {
      case 'getPriceContext':
        return priceContext(bars(tf), tf);
      case 'getIndicators':
        return indicatorsPayload(bars(tf), tf);
      case 'getSmcStructures': {
        if (ctx.pool) {
          try {
            const live = await readSmcSnapshot(ctx.pool, ctx.symbol, tf);
            if (live) return live;
          } catch (e: any) {
            console.warn('[smc] live snapshot failed, falling back to klines:', e?.message || e);
          }
        }
        return { ...smcPayload(bars(tf), tf), source: 'on_the_fly' };
      }
      case 'getVolumeProfile':
        return volumeProfilePayload(bars(tf), tf);
      case 'getRecentCandles':
        return recentCandlesPayload(bars(tf), tf, Number(args.n || 20));
      case 'getInstitutional':
        return getInstitutional(ctx.symbol);
      case 'getOpenBook':
        return { symbol: ctx.symbol, trades: ctx.openBook };
      case 'getZoneHistory': {
        const id = String(args.zone_id || args.zoneId || '');
        if (!id) return { error: 'zone_id required' };
        if (!ctx.pool) return { error: 'structure store not available' };
        return readZoneHistory(ctx.pool, id);
      }
      case 'getStructureSince': {
        if (!ctx.pool) return { error: 'structure store not available' };
        return readStructureSince(ctx.pool, ctx.symbol, tf, Number(args.since || 0));
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}
