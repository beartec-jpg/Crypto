/**
 * Blofin REST client (futures/SWAP).
 *
 * Auth: HMAC-SHA256 hex → Base64 over path+METHOD+timestamp+nonce+body
 * Size is always in **contracts** (see instrument minSize/lotSize/contractValue).
 *
 * Live trading is gated by BLOFIN_LIVE=1. Without it, write methods dry-run.
 */

import crypto from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// Prefer IPv4 so a single whitelist entry (5.78.142.246) works on dual-stack hosts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older node */
}

export type BlofinPositionSide = 'net' | 'long' | 'short';
export type BlofinMarginMode = 'cross' | 'isolated';

export interface BlofinInstrument {
  instId: string;
  instType: string;
  baseCurrency: string;
  quoteCurrency: string;
  contractValue: number;
  minSize: number;
  lotSize: number;
  tickSize: number;
  maxLeverage: number;
  contractType: 'linear' | 'inverse' | string;
  settleCurrency: string;
  state: string;
}

export interface SizePlan {
  instId: string;
  contracts: number;
  contractsStr: string;
  notionalUsdt: number;
  marginUsdt: number;
  leverage: number;
  price: number;
  contractValue: number;
  contractType: string;
  baseUnits: number;
  note: string;
}

export interface BlofinConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  live: boolean;
  /**
   * Fraction of free available margin to risk as isolated/cross margin for a new trade.
   * e.g. 0.5 = 50% of available. Preferred over fixed defaultMarginUsdt when > 0.
   */
  marginFraction: number;
  /** Fallback fixed margin (USDT-equivalent) when fraction is 0 or balance fetch fails. */
  defaultMarginUsdt: number;
  maxLeverage: number;
  marginMode: BlofinMarginMode;
  /**
   * Required when the API key was created as “Connect to Third-Party Application”.
   * System/API-only keys must omit this (sending one yields 152011).
   */
  brokerId: string;
  /** deskSymbol → blofin instId, e.g. BTCUSDT:BTC-USDT */
  symbolMap: Record<string, string>;
  configured: boolean;
}

export interface AvailableMargin {
  currency: string;
  available: number;
  equity: number;
  /** USD-equivalent margin to feed planSize (for coin-margined, available × price). */
  marginUsdt: number;
  productType: string;
  note: string;
}

export interface BlofinResponse<T = unknown> {
  code: string;
  msg: string;
  data: T;
  httpStatus: number;
  dryRun?: boolean;
}

let instrumentCache: { at: number; byId: Map<string, BlofinInstrument> } | null = null;
const INSTRUMENT_TTL_MS = 15 * 60_000;

export function loadBlofinConfig(): BlofinConfig {
  const apiKey = (process.env.BLOFIN_API_KEY || '').trim();
  const apiSecret = (process.env.BLOFIN_API_SECRET || '').trim();
  const passphrase = (process.env.BLOFIN_API_PASSPHRASE || '').trim();
  const mapRaw = process.env.BLOFIN_SYMBOL_MAP || 'BTCUSDT:BTC-USDT,XRPUSDT:XRP-USDT';
  const symbolMap: Record<string, string> = {};
  for (const part of mapRaw.split(',')) {
    const [k, v] = part.split(':').map((s) => s.trim());
    if (k && v) symbolMap[k.toUpperCase()] = v;
  }
  // Aliases for inverse product if user maps desk-style names
  if (!symbolMap.XRPUSD && symbolMap.XRPUSDT) {
    // leave optional — user can set XRPUSDT:XRP-USD or XRPUSD:XRP-USD
  }
  return {
    baseUrl: (process.env.BLOFIN_BASE_URL || 'https://openapi.blofin.com').replace(/\/$/, ''),
    apiKey,
    apiSecret,
    passphrase,
    live: String(process.env.BLOFIN_LIVE || '0') === '1',
    marginFraction: clampFraction(process.env.BLOFIN_MARGIN_FRACTION ?? '0.5'),
    defaultMarginUsdt: Math.max(0, Number(process.env.BLOFIN_DEFAULT_MARGIN_USDT || 10) || 10),
    maxLeverage: Math.max(1, Number(process.env.BLOFIN_MAX_LEVERAGE || 3) || 3),
    marginMode: (process.env.BLOFIN_MARGIN_MODE || 'cross').toLowerCase() === 'isolated'
      ? 'isolated'
      : 'cross',
    // BloFin MCP API keys require the official MCP broker id (same as blofin-mcp package).
    // Set BLOFIN_BROKER_ID=none for pure Transaction/API keys that reject brokerId (152011).
    brokerId: resolveBrokerId(),
    symbolMap,
    configured: Boolean(apiKey && apiSecret && passphrase),
  };
}

function clampFraction(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

/** Official BloFin MCP broker id from https://github.com/blofin/blofin-mcp */
export const BLOFIN_MCP_BROKER_ID = 'dd3511977f23cc87';

function resolveBrokerId(): string {
  const raw = (process.env.BLOFIN_BROKER_ID || '').trim();
  if (raw.toLowerCase() === 'none' || raw === '-') return '';
  if (raw) return raw;
  // Default: MCP broker (keys created as “BloFin MCP API”)
  return BLOFIN_MCP_BROKER_ID;
}

/** Attach brokerId when configured (MCP / broker-bound keys require it on trade endpoints). */
export function withBrokerId<T extends Record<string, unknown>>(body: T): T & { brokerId?: string } {
  const bid = loadBlofinConfig().brokerId;
  if (!bid) return body;
  return { ...body, brokerId: bid };
}

export function mapDeskSymbolToInstId(deskSymbol: string, cfg = loadBlofinConfig()): string {
  const s = deskSymbol.toUpperCase().replace(/[-_/]/g, '');
  if (cfg.symbolMap[s]) return cfg.symbolMap[s];
  // XRPUSDT → XRP-USDT, BTCUSD → BTC-USD
  const m = s.match(/^([A-Z]+)(USDT|USDC|USD)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return deskSymbol.includes('-') ? deskSymbol : `${deskSymbol}-USDT`;
}

function sign(
  secret: string,
  method: string,
  pathWithQuery: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const prehash = `${pathWithQuery}${method.toUpperCase()}${timestamp}${nonce}${body}`;
  const hex = crypto.createHmac('sha256', secret).update(prehash).digest('hex');
  return Buffer.from(hex, 'utf8').toString('base64');
}

/** Low-level HTTPS with IPv4 preference (Node fetch may still pick v6 on some hosts). */
function rawRequest(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method,
        headers,
        family: 4, // force IPv4 for whitelist
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Blofin request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

export async function blofinRequest<T = unknown>(
  method: string,
  pathWithQuery: string,
  bodyObj?: Record<string, unknown> | null,
  opts?: { forceLive?: boolean },
): Promise<BlofinResponse<T>> {
  const cfg = loadBlofinConfig();
  if (!cfg.configured) {
    return {
      code: 'not_configured',
      msg: 'BLOFIN_API_KEY/SECRET/PASSPHRASE not set',
      data: null as T,
      httpStatus: 0,
    };
  }

  const isWrite = method.toUpperCase() !== 'GET';
  if (isWrite && !cfg.live && !opts?.forceLive) {
    console.log(`[blofin:dry-run] ${method} ${pathWithQuery}`, bodyObj || '');
    return {
      code: '0',
      msg: 'dry-run',
      data: { dryRun: true, method, path: pathWithQuery, body: bodyObj } as T,
      httpStatus: 200,
      dryRun: true,
    };
  }

  const body = bodyObj != null ? JSON.stringify(bodyObj) : '';
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const signature = sign(cfg.apiSecret, method, pathWithQuery, ts, nonce, body);

  const headers: Record<string, string> = {
    'ACCESS-KEY': cfg.apiKey,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': ts,
    'ACCESS-NONCE': nonce,
    'ACCESS-PASSPHRASE': cfg.passphrase,
    'Content-Type': 'application/json',
  };
  if (body) headers['Content-Length'] = String(Buffer.byteLength(body));

  const { status, text } = await rawRequest(cfg.baseUrl + pathWithQuery, method, headers, body || undefined);
  let parsed: { code?: string; msg?: string; data?: T } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      code: 'parse_error',
      msg: text.slice(0, 300),
      data: null as T,
      httpStatus: status,
    };
  }
  return {
    code: String(parsed.code ?? status),
    msg: String(parsed.msg ?? ''),
    data: (parsed.data as T) ?? (null as T),
    httpStatus: status,
  };
}

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function getInstruments(force = false): Promise<Map<string, BlofinInstrument>> {
  if (!force && instrumentCache && Date.now() - instrumentCache.at < INSTRUMENT_TTL_MS) {
    return instrumentCache.byId;
  }
  // Public endpoint — no auth required, but we still use raw GET
  const cfg = loadBlofinConfig();
  const { status, text } = await rawRequest(
    `${cfg.baseUrl}/api/v1/market/instruments?instType=SWAP`,
    'GET',
    { Accept: 'application/json' },
  );
  if (status !== 200) throw new Error(`instruments HTTP ${status}`);
  const parsed = JSON.parse(text) as { code: string; data: Record<string, string>[] };
  const byId = new Map<string, BlofinInstrument>();
  for (const row of parsed.data || []) {
    byId.set(row.instId, {
      instId: row.instId,
      instType: row.instType,
      baseCurrency: row.baseCurrency,
      quoteCurrency: row.quoteCurrency,
      contractValue: num(row.contractValue),
      minSize: num(row.minSize),
      lotSize: num(row.lotSize, 1),
      tickSize: num(row.tickSize),
      maxLeverage: num(row.maxLeverage, 1),
      contractType: row.contractType,
      settleCurrency: row.settleCurrency,
      state: row.state,
    });
  }
  instrumentCache = { at: Date.now(), byId };
  return byId;
}

export async function getInstrument(instId: string): Promise<BlofinInstrument | null> {
  const map = await getInstruments();
  return map.get(instId) || null;
}

export function formatContractSize(size: number, lotSize: number): string {
  if (!(size > 0) || !(lotSize > 0)) return '0';
  // Round down to lot multiple
  const steps = Math.floor(size / lotSize + 1e-12);
  const rounded = steps * lotSize;
  const decimals = lotDecimals(lotSize);
  return rounded.toFixed(decimals);
}

function lotDecimals(lotSize: number): number {
  const s = String(lotSize);
  if (s.includes('e') || s.includes('E')) {
    // e.g. 1e-2
    const n = Math.max(0, -Math.floor(Math.log10(lotSize)));
    return Math.min(n, 8);
  }
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(s.length - i - 1, 8);
}

/**
 * Convert margin USDT + leverage into exchange contract size.
 * Linear (USDT/USDC): notional = margin * lev; contracts = notional / (contractValue * price)
 * Inverse (USD coin-margined): each contract ≈ contractValue quote USD; contracts = notional / contractValue
 */
export function planSize(
  inst: BlofinInstrument,
  price: number,
  marginUsdt: number,
  leverage: number,
): SizePlan {
  const lev = Math.min(Math.max(1, leverage), inst.maxLeverage || leverage);
  const margin = Math.max(0, marginUsdt);
  const notional = margin * lev;
  let contracts = 0;
  let baseUnits = 0;
  let note = '';

  if (inst.contractType === 'inverse') {
    // contractValue is typically 1 USD (or similar) per contract
    contracts = notional / Math.max(inst.contractValue, 1e-12);
    baseUnits = contracts * inst.contractValue / Math.max(price, 1e-12);
    note = `inverse: ${notional.toFixed(2)} USD notional → contracts≈notional/cv; settle ${inst.settleCurrency}`;
  } else {
    // linear: contractValue in base currency per contract
    const notionalPerContract = inst.contractValue * price;
    contracts = notional / Math.max(notionalPerContract, 1e-12);
    baseUnits = contracts * inst.contractValue;
    note = `linear: ${notional.toFixed(2)} USDT notional / (${inst.contractValue} ${inst.baseCurrency}×$${price})`;
  }

  const contractsStr = formatContractSize(contracts, inst.lotSize);
  const finalContracts = Number(contractsStr);
  if (finalContracts < inst.minSize) {
    note += ` · below minSize ${inst.minSize} (got ${contractsStr}) — will use min if affordable`;
  }

  return {
    instId: inst.instId,
    contracts: finalContracts >= inst.minSize ? finalContracts : 0,
    contractsStr: finalContracts >= inst.minSize ? contractsStr : formatContractSize(inst.minSize, inst.lotSize),
    notionalUsdt: notional,
    marginUsdt: margin,
    leverage: lev,
    price,
    contractValue: inst.contractValue,
    contractType: inst.contractType,
    baseUnits,
    note,
  };
}

/** Prefer planned size; if under min, bump to minSize when notional allows ~1 min contract. */
export function finalizeSize(inst: BlofinInstrument, plan: SizePlan): SizePlan {
  if (plan.contracts >= inst.minSize) return plan;
  const minStr = formatContractSize(inst.minSize, inst.lotSize);
  const minN = Number(minStr);
  // Only auto-bump if min notional is within 2× intended notional (avoid huge jumps)
  const minNotional =
    inst.contractType === 'inverse'
      ? minN * inst.contractValue
      : minN * inst.contractValue * plan.price;
  if (minNotional <= plan.notionalUsdt * 2.5 || plan.notionalUsdt >= minNotional * 0.5) {
    return {
      ...plan,
      contracts: minN,
      contractsStr: minStr,
      note: plan.note + ` · bumped to minSize ${minStr}`,
    };
  }
  return { ...plan, contracts: 0, contractsStr: '0', note: plan.note + ' · size too small' };
}

export async function getBalance(productType?: 'USDT-FUTURES' | 'COIN-FUTURES'): Promise<BlofinResponse> {
  const q = productType ? `?productType=${productType}` : '';
  return blofinRequest('GET', `/api/v1/account/balance${q}`);
}

function parseBalanceDetails(
  data: unknown,
): Array<{ currency: string; available: number; equity: number }> {
  const root = data as {
    details?: Array<Record<string, unknown>>;
  } | null;
  const details = root?.details;
  if (!Array.isArray(details)) return [];
  return details.map((d) => ({
    currency: String(d.currency || '').toUpperCase(),
    available: Math.max(
      0,
      num(d.availableEquity ?? d.available ?? d.equity ?? 0),
    ),
    equity: Math.max(0, num(d.equity ?? d.balance ?? 0)),
  }));
}

/**
 * Free margin for a new trade on this instrument, then apply marginFraction (default 50%).
 * Linear USDT/USDC → USDT-FUTURES available.
 * Inverse coin-margined → COIN-FUTURES settle currency (e.g. XRP), converted to USD via price.
 */
export async function getAvailableMarginForTrade(
  inst: BlofinInstrument,
  price: number,
  fraction?: number,
): Promise<AvailableMargin> {
  const cfg = loadBlofinConfig();
  const frac = fraction != null ? clampFraction(String(fraction)) : cfg.marginFraction;
  const settle = (inst.settleCurrency || inst.quoteCurrency || 'USDT').toUpperCase();
  const isInverse = inst.contractType === 'inverse' || (settle !== 'USDT' && settle !== 'USDC');
  const productType: 'USDT-FUTURES' | 'COIN-FUTURES' = isInverse ? 'COIN-FUTURES' : 'USDT-FUTURES';

  const bal = await getBalance(productType);
  if (bal.code !== '0') {
    const fallback = cfg.defaultMarginUsdt;
    return {
      currency: settle,
      available: 0,
      equity: 0,
      marginUsdt: fallback * (frac > 0 ? frac : 1),
      productType,
      note: `balance fetch failed (${bal.code} ${bal.msg}); fallback margin≈$${fallback}`,
    };
  }

  const rows = parseBalanceDetails(bal.data);
  const want = isInverse ? settle : settle === 'USDC' ? 'USDC' : 'USDT';
  let row = rows.find((r) => r.currency === want);
  if (!row && !isInverse) {
    row = rows.find((r) => r.currency === 'USDT' || r.currency === 'USDC');
  }
  if (!row) {
    row = rows[0] || { currency: want, available: 0, equity: 0 };
  }

  const available = row.available;
  const useFrac = frac > 0 ? frac : 1;
  const slice = available * useFrac;

  let marginUsdt: number;
  if (isInverse) {
    // Coin margin → USD-equivalent for planSize
    marginUsdt = slice * Math.max(price, 1e-12);
  } else {
    marginUsdt = slice;
  }

  // Dust / empty free margin — do not silently fall back to a fixed size
  if (marginUsdt < 0.5 && available < 1) {
    return {
      currency: row.currency,
      available,
      equity: row.equity,
      marginUsdt: 0,
      productType,
      note:
        `available ${available.toFixed(6)} ${row.currency} × ${(useFrac * 100).toFixed(0)}% → ` +
        `$${marginUsdt.toFixed(4)} (too low for new ${inst.instId}; free USDT/coin or reduce other positions)`,
    };
  }

  return {
    currency: row.currency,
    available,
    equity: row.equity,
    marginUsdt,
    productType,
    note:
      `${(useFrac * 100).toFixed(0)}% of available ${available.toFixed(4)} ${row.currency}` +
      (isInverse ? ` ≈ $${marginUsdt.toFixed(2)} @ ${price}` : ` = $${marginUsdt.toFixed(2)}`) +
      ` (${productType})`,
  };
}

export async function getPositions(instId?: string): Promise<BlofinResponse<Record<string, unknown>[]>> {
  const q = instId ? `?instId=${encodeURIComponent(instId)}` : '';
  return blofinRequest('GET', `/api/v1/account/positions${q}`);
}

export async function getPositionMode(): Promise<BlofinResponse<{ positionMode?: string }>> {
  return blofinRequest('GET', '/api/v1/account/position-mode');
}

export async function setLeverage(params: {
  instId: string;
  leverage: number | string;
  marginMode: BlofinMarginMode;
  positionSide?: BlofinPositionSide;
}): Promise<BlofinResponse> {
  const body: Record<string, unknown> = {
    instId: params.instId,
    leverage: String(params.leverage),
    marginMode: params.marginMode,
  };
  if (params.positionSide) body.positionSide = params.positionSide;
  return blofinRequest('POST', '/api/v1/account/set-leverage', withBrokerId(body));
}

export async function placeOrder(params: {
  instId: string;
  marginMode: BlofinMarginMode;
  positionSide: BlofinPositionSide;
  side: 'buy' | 'sell';
  size: string;
  orderType?: 'market' | 'limit' | 'ioc' | 'fok' | 'post_only';
  price?: string;
  reduceOnly?: boolean;
  clientOrderId?: string;
  slTriggerPrice?: string;
  slOrderPrice?: string;
  tpTriggerPrice?: string;
  tpOrderPrice?: string;
}): Promise<BlofinResponse> {
  const body: Record<string, unknown> = {
    instId: params.instId,
    marginMode: params.marginMode,
    positionSide: params.positionSide,
    side: params.side,
    orderType: params.orderType || 'market',
    size: params.size,
  };
  if (params.orderType === 'limit' || params.orderType === 'post_only' || params.orderType === 'ioc' || params.orderType === 'fok') {
    body.price = params.price;
  } else if (params.price != null) {
    body.price = params.price;
  }
  if (params.reduceOnly) body.reduceOnly = 'true';
  if (params.clientOrderId) body.clientOrderId = params.clientOrderId.slice(0, 32);
  if (params.slTriggerPrice) {
    body.slTriggerPrice = params.slTriggerPrice;
    body.slOrderPrice = params.slOrderPrice ?? '-1';
    body.slTriggerPriceType = 'last';
  }
  if (params.tpTriggerPrice) {
    body.tpTriggerPrice = params.tpTriggerPrice;
    body.tpOrderPrice = params.tpOrderPrice ?? '-1';
    body.tpTriggerPriceType = 'last';
  }
  return blofinRequest('POST', '/api/v1/trade/order', withBrokerId(body));
}

export async function placeTpsl(params: {
  instId: string;
  marginMode: BlofinMarginMode;
  positionSide: BlofinPositionSide;
  side: 'buy' | 'sell';
  size: string;
  slTriggerPrice?: string;
  tpTriggerPrice?: string;
  reduceOnly?: boolean;
  clientOrderId?: string;
}): Promise<BlofinResponse> {
  const body: Record<string, unknown> = {
    instId: params.instId,
    marginMode: params.marginMode,
    positionSide: params.positionSide,
    side: params.side,
    size: params.size,
    reduceOnly: params.reduceOnly === false ? 'false' : 'true',
  };
  if (params.slTriggerPrice) {
    body.slTriggerPrice = params.slTriggerPrice;
    body.slOrderPrice = '-1';
    body.slTriggerPriceType = 'last';
  }
  if (params.tpTriggerPrice) {
    body.tpTriggerPrice = params.tpTriggerPrice;
    body.tpOrderPrice = '-1';
    body.tpTriggerPriceType = 'last';
  }
  if (params.clientOrderId) body.clientOrderId = params.clientOrderId.slice(0, 32);
  return blofinRequest('POST', '/api/v1/trade/order-tpsl', withBrokerId(body));
}

export async function closePosition(params: {
  instId: string;
  marginMode: BlofinMarginMode;
  positionSide: BlofinPositionSide;
  clientOrderId?: string;
}): Promise<BlofinResponse> {
  const body: Record<string, unknown> = {
    instId: params.instId,
    marginMode: params.marginMode,
    positionSide: params.positionSide,
  };
  if (params.clientOrderId) body.clientOrderId = params.clientOrderId.slice(0, 32);
  return blofinRequest('POST', '/api/v1/trade/close-position', withBrokerId(body));
}

export function positionSideFor(
  direction: 'LONG' | 'SHORT',
  mode: 'net' | 'long_short' | string,
): BlofinPositionSide {
  if (mode === 'net' || mode === 'net_mode') return 'net';
  return direction === 'LONG' ? 'long' : 'short';
}

export function openSide(direction: 'LONG' | 'SHORT'): 'buy' | 'sell' {
  return direction === 'LONG' ? 'buy' : 'sell';
}

export function closeSide(direction: 'LONG' | 'SHORT'): 'buy' | 'sell' {
  return direction === 'LONG' ? 'sell' : 'buy';
}

export async function probeAccount(): Promise<{
  ok: boolean;
  live: boolean;
  configured: boolean;
  balanceCode?: string;
  balanceMsg?: string;
  positionsCode?: string;
  positions?: unknown;
  ipHint?: string;
}> {
  const cfg = loadBlofinConfig();
  if (!cfg.configured) {
    return { ok: false, live: cfg.live, configured: false };
  }
  const bal = await getBalance();
  const pos = await getPositions();
  const ipBlocked = bal.code === '152406' || pos.code === '152406' || /IP/i.test(bal.msg + pos.msg);
  return {
    ok: bal.code === '0',
    live: cfg.live,
    configured: true,
    balanceCode: bal.code,
    balanceMsg: bal.msg,
    positionsCode: pos.code,
    positions: pos.code === '0' ? pos.data : undefined,
    ipHint: ipBlocked
      ? 'Whitelist bot host IPv4 5.78.142.246 (and optionally IPv6) on the Blofin API key'
      : undefined,
  };
}
