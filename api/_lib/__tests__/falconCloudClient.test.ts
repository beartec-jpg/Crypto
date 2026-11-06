import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FalconCloudClient,
  FalconCloudError,
  clearFalconCloudCache,
  clampLimit,
  clampLevels,
  hasFalconCloudApiKey,
  normalizePair,
  sanitizeUsage,
  summarizeStatus,
} from '../falconCloudClient';

afterEach(() => {
  clearFalconCloudCache();
  vi.unstubAllGlobals();
});

describe('falconCloud helpers', () => {
  it('detects key presence without reading the value in assertions', () => {
    expect(hasFalconCloudApiKey({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasFalconCloudApiKey({ FALCON_CLOUD_API_KEY: '' } as any)).toBe(false);
    expect(hasFalconCloudApiKey({ FALCON_CLOUD_API_KEY: '  ' } as any)).toBe(false);
    expect(hasFalconCloudApiKey({ FALCON_CLOUD_API_KEY: 'fplk_test' } as any)).toBe(true);
  });

  it('normalizes pair shorthand to *-FPL', () => {
    expect(normalizePair('btc4')).toBe('BTC4-FPL');
    expect(normalizePair('USDC-FPL')).toBe('USDC-FPL');
    expect(normalizePair('USDC')).toBe('USDC-FPL');
  });

  it('clamps limit and levels', () => {
    expect(clampLimit(999)).toBe(200);
    expect(clampLimit(-1)).toBe(50);
    expect(clampLevels(500)).toBe(200);
  });

  it('summarizes status without dumping accounts', () => {
    const s = summarizeStatus({
      tip_height: 100,
      best_peer_tip: 101,
      network_id: 2300,
      amm_pools: 5,
      chain_len: 100,
      accounts: { alice: { balance: 1 } },
    });
    expect(s.tip_height).toBe(100);
    expect(s.network_id).toBe(2300);
    expect(JSON.stringify(s)).not.toMatch(/alice/);
  });

  it('redacts usage key_id', () => {
    const u = sanitizeUsage({
      tier: 'free',
      key_id: 'k_secret',
      units_used: 0,
      monthly_quota: 300000,
    });
    expect(u.tier).toBe('free');
    expect(u.key_id).toBe('<present>');
    expect(JSON.stringify(u)).not.toMatch(/k_secret/);
  });
});

describe('FalconCloudClient rpc', () => {
  it('requires object params and sends Bearer auth from env', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-key-value');
      const body = JSON.parse(String(init?.body));
      expect(body.params).toEqual({ pair: 'BTC4-FPL', levels: 10 });
      expect(Array.isArray(body.params)).toBe(false);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            pair: 'BTC4-FPL',
            base: 'BTC4',
            quote: 'FPL',
            bids: [],
            asks: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const client = new FalconCloudClient({
      env: { FALCON_CLOUD_API_KEY: 'test-key-value' } as any,
      fetchImpl: fetchImpl as any,
      cacheTtlMs: 0,
    });

    const book = await client.getOrderBook('BTC4', 10);
    expect(book.pair).toBe('BTC4-FPL');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects when key missing', async () => {
    const client = new FalconCloudClient({
      env: {} as any,
      fetchImpl: vi.fn() as any,
    });
    await expect(client.getStatusSummary()).rejects.toBeInstanceOf(FalconCloudError);
  });

  it('maps fills recent-window result', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            fills: [
              {
                asset: 'BTC4',
                base: 1,
                height: 10,
                maker: 'amm:btc4-fpl',
                price: 100,
                quote: 1,
                side: 'buy',
                taker: 'mm01',
                taker_order: 1,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const client = new FalconCloudClient({
      env: { FALCON_CLOUD_API_KEY: 'k' } as any,
      fetchImpl: fetchImpl as any,
      cacheTtlMs: 60_000,
    });
    const a = await client.getFills({ limit: 5 });
    const b = await client.getFills({ limit: 5 });
    expect(a.fills).toHaveLength(1);
    expect(b.fills).toHaveLength(1);
    // second call served from cache
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('surfaces JSON-RPC errors', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Invalid params' },
        }),
        { status: 200 },
      ),
    );
    const client = new FalconCloudClient({
      env: { FALCON_CLOUD_API_KEY: 'k' } as any,
      fetchImpl: fetchImpl as any,
      cacheTtlMs: 0,
    });
    await expect(client.rpc('fpl_orderBook', { pair: 'X' })).rejects.toMatchObject({
      code: -32602,
    });
  });
});
