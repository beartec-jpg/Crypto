// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * AI usage tiers — charts/indicators are free with an email signup.
 * Paid plans only buy AI page tokens + nominated tickers.
 *
 * Currency: plan prices are GBP. The AI provider bills in USD, so model costs
 * are kept in USD (as billed) and converted with USD_GBP_RATE (shared/currency.ts,
 * default 0.79 GBP per USD) wherever they are compared with prices.
 *
 * Cost model (Grok 4.6, typical desk payloads), USD as billed → GBP @ 0.79:
 *   General overview ≈ $0.02  ≈ £0.016  (no thinking, short JSON)
 *   Deep dive        ≈ $0.12–0.18 ≈ £0.09–0.14 (thinking on)
 *   Blended token    ≈ $0.09  ≈ £0.07   (mix of general + deep, retries, cache misses)
 *
 * Prices (GBP) target ≤ ~50% COGS:
 *   Core  £15 →  80 tokens ≈ £5.70 COGS
 *   Pro   £30 → 160 tokens ≈ £11.40 COGS
 *   Elite £50 → 270 tokens ≈ £19.20 COGS
 *
 * Each general analysis OR deep dive spends 1 token.
 */

export type AiUsageTierId = 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite';

export const AI_READING_TOKEN_COST = 1;

/** Blended model cost per token, in USD as billed by the provider. */
export const BLENDED_TOKEN_COST_USD = 0.09;

/** Blended cost per token in GBP at the given USD→GBP rate. */
export function blendedTokenCostGbp(usdGbpRate: number): number {
  return BLENDED_TOKEN_COST_USD * usdGbpRate;
}

export interface AiUsageTier {
  id: AiUsageTierId;
  name: string;
  /** Monthly price in GBP (pounds). */
  monthlyPrice: number;
  priceLabel: string;
  tokens: number;
  tickerSlots: number;
  pairReads: number;
}

export const AI_USAGE_TIERS: Record<AiUsageTierId, AiUsageTier> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    priceLabel: 'Free',
    tokens: 0,
    tickerSlots: 0,
    pairReads: 0,
  },
  beginner: {
    id: 'beginner',
    name: 'Free',
    monthlyPrice: 0,
    priceLabel: 'Free',
    tokens: 0,
    tickerSlots: 0,
    pairReads: 0,
  },
  intermediate: {
    id: 'intermediate',
    name: 'Core',
    monthlyPrice: 15,
    priceLabel: '£15/mo',
    tokens: 80,
    tickerSlots: 1,
    pairReads: 40,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 30,
    priceLabel: '£30/mo',
    tokens: 160,
    tickerSlots: 3,
    pairReads: 80,
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 50,
    priceLabel: '£50/mo',
    tokens: 270,
    tickerSlots: 5,
    pairReads: 135,
  },
};

export const MONTHLY_AI_CREDITS: Record<string, number> = {
  free: 0,
  beginner: 0,
  intermediate: AI_USAGE_TIERS.intermediate.tokens,
  pro: AI_USAGE_TIERS.pro.tokens,
  elite: AI_USAGE_TIERS.elite.tokens,
};

export const AI_TICKER_SLOTS: Record<string, number> = {
  free: 0,
  beginner: 0,
  intermediate: AI_USAGE_TIERS.intermediate.tickerSlots,
  pro: AI_USAGE_TIERS.pro.tickerSlots,
  elite: AI_USAGE_TIERS.elite.tickerSlots,
};

export function getAiUsageTier(tier?: string | null): AiUsageTier {
  const key = (tier || 'free') as AiUsageTierId;
  return AI_USAGE_TIERS[key] || AI_USAGE_TIERS.free;
}

export function getMonthlyAiTokens(tier?: string | null): number {
  return getAiUsageTier(tier).tokens;
}

export function getTickerSlotCap(tier?: string | null): number {
  return getAiUsageTier(tier).tickerSlots;
}

export function getAiTierDisplayName(tier?: string | null): string {
  return getAiUsageTier(tier).name;
}
