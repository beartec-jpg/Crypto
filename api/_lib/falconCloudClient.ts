// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Server-only Falcon Cloud RPC client (https://rpc.falcon-fpl.com).
 *
 * Auth: process.env.FALCON_CLOUD_API_KEY via Authorization Bearer.
 * Never import this module from client/browser code.
 *
 * Gateway methods (object params required):
 *   fpl_status {}
 *   fpl_orderBook { pair, levels? ≤200 }
 *   fpl_fills { pair?, account?, limit? ≤200 }  // newest-first recent window; no offset/cursor
 *   fpl_openOrders { account }
 *   fpl_getAccount { account }
 *   fpl_health { warnings? }
 *   GET /v1/usage
 *
 * Candle / OHLCV history is NOT provided by the gateway. Building chart candles
 * requires a separate fill-ingestion + persistence layer; do not invent candles
 * or fall back to Binance under a Falcon label.
 */

export const FALCON_CLOUD_RPC_URL = 'https://rpc.falcon-fpl.com/v1/rpc';
export const FALCON_CLOUD_USAGE_URL = 'https://rpc.falcon-fpl.com/v1/usage';

export const FALCON_CLOUD_ENV_KEY = 'FALCON_CLOUD_API_KEY';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CACHE_TTL_MS = 5_000;
const MAX_FILL_LIMIT = 200;
const MAX_BOOK_LEVELS = 200;

export type JsonRpcId = string | number;

export interface FalconFill {
  asset: string;
  base: number;
  height: number;
  maker: string;
  price: number;
  quote: number;
  side: string;
  taker: string;
  taker_order: number;
}

export interface FalconOrderBookLevel {
  price: number;
  amountBase: number;
  amountFpl: number;
  orders: number;
}

export interface FalconOrderOffer {
  id: number;
  pair: string;
  side: string;
  price: number;
  amount: number;
  amountBase: number;
  amountFpl: number;
  remaining: number;
  owner: string;
  escrow?: number;
  expiry_height?: number;
  placed_height?: number;
  seq?: number;
}

export interface FalconAmmSpot {
  pool_id?: string;
  reserveBase?: number;
  reserveFpl?: number;
  spot?: number;
}

export interface FalconOrderBook {
  pair: string;
  base: string;
  quote: string;
  price_scale?: string | number;
  price_unit?: string;
  bids: FalconOrderBookLevel[];
  asks: FalconOrderBookLevel[];
  bid_offers?: FalconOrderOffer[];
  ask_offers?: FalconOrderOffer[];
  amm?: FalconAmmSpot | null;
}

export interface FalconUsage {
  tier?: string;
  month?: string;
  monthly_quota?: number;
  units_used?: number;
  rps?: number;
  burst?: number;
  tx_submit_per_min?: number;
  key_id?: string;
}

export interface FalconStatusSummary {
  tip_height: number | null;
  best_peer_tip: number | null;
  network_id: number | null;
  amm_pools: number | null;
  chain_len: number | null;
  fetchedAt: string;
}

export class FalconCloudError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly retryAfterSec?: number;

  constructor(
    message: string,
    opts?: { status?: number; code?: number; retryAfterSec?: number },
  ) {
    super(message);
    this.name = 'FalconCloudError';
    this.status = opts?.status;
    this.code = opts?.code;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

type CacheEntry = { expiresAt: number; value: unknown };

const memoryCache = new Map<string, CacheEntry>();

export function hasFalconCloudApiKey(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env[FALCON_CLOUD_ENV_KEY];
  return typeof v === 'string' && v.trim().length > 0;
}

function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const v = env[FALCON_CLOUD_ENV_KEY];
  if (typeof v !== 'string' || !v.trim()) {
    throw new FalconCloudError(
      `${FALCON_CLOUD_ENV_KEY} is not configured (server-only)`,
      { status: 503, code: -32001 },
    );
  }
  return v.trim();
}

function cacheGet<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown, ttlMs: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Test helper — clears in-process cache. */
export function clearFalconCloudCache(): void {
  memoryCache.clear();
}

export function normalizePair(pair: string): string {
  const raw = String(pair || '').trim().toUpperCase();
  if (!raw) return 'BTC4-FPL';
  if (raw.endsWith('-FPL')) return raw;
  // Accept "BTC4" / "USDC" shorthand used by gateway demos
  return `${raw.replace(/-USD$/, '')}-FPL`;
}

export function clampLimit(limit: unknown, max = MAX_FILL_LIMIT, fallback = 50): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function clampLevels(levels: unknown, max = MAX_BOOK_LEVELS, fallback = 50): number {
  const n = Number(levels);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function summarizeStatus(raw: Record<string, unknown>): FalconStatusSummary {
  const tip =
    typeof raw.tip_height === 'number'
      ? raw.tip_height
      : typeof raw.height === 'number'
        ? raw.height
        : null;
  return {
    tip_height: tip,
    best_peer_tip: typeof raw.best_peer_tip === 'number' ? raw.best_peer_tip : null,
    network_id: typeof raw.network_id === 'number' ? raw.network_id : null,
    amm_pools: typeof raw.amm_pools === 'number' ? raw.amm_pools : null,
    chain_len: typeof raw.chain_len === 'number' ? raw.chain_len : null,
    fetchedAt: new Date().toISOString(),
  };
}

export function sanitizeUsage(raw: Record<string, unknown>): FalconUsage {
  // Never echo key material; key_id is opaque metadata from /v1/usage.
  return {
    tier: typeof raw.tier === 'string' ? raw.tier : undefined,
    month: typeof raw.month === 'string' ? raw.month : undefined,
    monthly_quota:
      typeof raw.monthly_quota === 'number' ? raw.monthly_quota : undefined,
    units_used: typeof raw.units_used === 'number' ? raw.units_used : undefined,
    rps: typeof raw.rps === 'number' ? raw.rps : undefined,
    burst: typeof raw.burst === 'number' ? raw.burst : undefined,
    tx_submit_per_min:
      typeof raw.tx_submit_per_min === 'number'
        ? raw.tx_submit_per_min
        : undefined,
    key_id: typeof raw.key_id === 'string' ? '<present>' : undefined,
  };
}

type FetchLike = typeof fetch;

export interface FalconCloudClientOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  rpcUrl?: string;
  usageUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

export class FalconCloudClient {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: FetchLike;
  private readonly rpcUrl: string;
  private readonly usageUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;

  constructor(opts: FalconCloudClientOptions = {}) {
    this.env = opts.env ?? process.env;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.rpcUrl = opts.rpcUrl ?? FALCON_CLOUD_RPC_URL;
    this.usageUrl = opts.usageUrl ?? FALCON_CLOUD_USAGE_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  configured(): boolean {
    return hasFalconCloudApiKey(this.env);
  }

  async rpc<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    id: JsonRpcId = 1,
  ): Promise<T> {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new FalconCloudError('JSON-RPC params must be an object', {
        code: -32602,
      });
    }

    const apiKey = requireApiKey(this.env);
    const cacheKey = `rpc:${method}:${stableStringify(params)}`;
    const cached = cacheGet<T>(cacheKey);
    if (cached !== undefined) return cached;

    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
      attempt += 1;
      const res = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '1');
        if (attempt >= maxAttempts) {
          throw new FalconCloudError('rate limited', {
            status: 429,
            code: -32005,
            retryAfterSec: retryAfter,
          });
        }
        await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
        continue;
      }

      if (res.status === 401) {
        throw new FalconCloudError('invalid or missing Falcon Cloud API key', {
          status: 401,
          code: -32001,
        });
      }

      if (!res.ok) {
        throw new FalconCloudError(`Falcon Cloud HTTP ${res.status}`, {
          status: res.status,
        });
      }

      const body = (await res.json()) as {
        result?: T;
        error?: { code?: number; message?: string };
      };
      if (body.error) {
        throw new FalconCloudError(
          body.error.message || 'Falcon Cloud RPC error',
          { code: body.error.code, status: 200 },
        );
      }
      const result = body.result as T;
      cacheSet(cacheKey, result, this.cacheTtlMs);
      return result;
    }

    throw new FalconCloudError('rate limited', { status: 429, code: -32005 });
  }

  async getUsage(): Promise<FalconUsage> {
    const apiKey = requireApiKey(this.env);
    const cacheKey = 'usage';
    const cached = cacheGet<FalconUsage>(cacheKey);
    if (cached) return cached;

    const res = await this.fetchImpl(this.usageUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 401) {
      throw new FalconCloudError('invalid or missing Falcon Cloud API key', {
        status: 401,
        code: -32001,
      });
    }
    if (!res.ok) {
      throw new FalconCloudError(`Falcon Cloud usage HTTP ${res.status}`, {
        status: res.status,
      });
    }
    const raw = (await res.json()) as Record<string, unknown>;
    const usage = sanitizeUsage(raw);
    cacheSet(cacheKey, usage, this.cacheTtlMs);
    return usage;
  }

  async getStatusSummary(): Promise<FalconStatusSummary> {
    const raw = await this.rpc<Record<string, unknown>>('fpl_status', {});
    return summarizeStatus(raw ?? {});
  }

  async getOrderBook(
    pair: string,
    levels?: number,
  ): Promise<FalconOrderBook> {
    const params: Record<string, unknown> = {
      pair: normalizePair(pair),
    };
    if (levels !== undefined) {
      params.levels = clampLevels(levels);
    }
    return this.rpc<FalconOrderBook>('fpl_orderBook', params);
  }

  /**
   * Recent fills only (newest first). Gateway accepts pair?, account?, limit? (≤200).
   * There is no supported offset/cursor pagination — historical candles need persistence.
   */
  async getFills(opts: {
    pair?: string;
    account?: string;
    limit?: number;
  } = {}): Promise<{ fills: FalconFill[] }> {
    const params: Record<string, unknown> = {
      limit: clampLimit(opts.limit, MAX_FILL_LIMIT, 50),
    };
    if (opts.pair) params.pair = normalizePair(opts.pair);
    if (opts.account) params.account = String(opts.account).trim();
    const result = await this.rpc<{ fills?: FalconFill[] }>('fpl_fills', params);
    return { fills: Array.isArray(result?.fills) ? result.fills : [] };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Shared singleton for serverless warm instances. */
let shared: FalconCloudClient | null = null;
export function getFalconCloudClient(): FalconCloudClient {
  if (!shared) shared = new FalconCloudClient();
  return shared;
}
