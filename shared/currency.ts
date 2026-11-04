// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Prices are GBP. AI provider costs are billed in USD (api_usage_log.estimated_cost
 * is USD). Convert with a configurable rate: env USD_GBP_RATE (GBP per 1 USD).
 */
export const DEFAULT_USD_GBP_RATE = 0.79;

export function usdGbpRate(env: Record<string, string | undefined> =
  (typeof process !== 'undefined' && process.env ? process.env : {})): number {
  const r = Number(env.USD_GBP_RATE);
  return Number.isFinite(r) && r > 0 ? r : DEFAULT_USD_GBP_RATE;
}

export function usdToGbp(usd: number, rate: number = usdGbpRate()): number {
  return Number.isFinite(usd) ? usd * rate : 0;
}

/** Convert USD to whole pence. */
export function usdToPence(usd: number, rate: number = usdGbpRate()): number {
  if (!Number.isFinite(usd)) return 0;
  return Math.round(usd * rate * 100);
}
