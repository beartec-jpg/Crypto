import type { Bar } from './marketStructure.js';
import {
  indicatorsPayload,
  priceContext,
  recentCandlesPayload,
  smcPayload,
  volumeProfilePayload,
} from './marketStructure.js';
import { getInstitutional } from './institutional.js';

export interface DeskToolContext {
  symbol: string;
  ltf: string;
  htf: string;
  barsByTf: Record<string, Bar[]>;
  openBook: unknown[];
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
        description: 'FVGs, order blocks, BOS/CHoCH, swing highs/lows for a timeframe.',
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
      case 'getSmcStructures':
        return smcPayload(bars(tf), tf);
      case 'getVolumeProfile':
        return volumeProfilePayload(bars(tf), tf);
      case 'getRecentCandles':
        return recentCandlesPayload(bars(tf), tf, Number(args.n || 20));
      case 'getInstitutional':
        return getInstitutional(ctx.symbol);
      case 'getOpenBook':
        return { symbol: ctx.symbol, trades: ctx.openBook };
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}
