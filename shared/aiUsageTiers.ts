/**
 * AI usage tiers — charts/indicators are free with an email signup.
 * Paid plans only buy AI page tokens + nominated tickers.
 *
 * Cost model (Grok 4.6, typical desk payloads):
 *   General overview ≈ $0.02   (no thinking, short JSON)
 *   Deep dive        ≈ $0.12–0.18 (thinking on)
 *   Blended token    ≈ $0.09   (mix of general + deep, retries, cache misses)
 *
 * Price is set for ~50% gross margin:
 *   Core $15 → ~$7.50 COGS → 80 tokens
 *   Pro  $30 → ~$15 COGS  → 160 tokens
 *   Elite $50 → ~$25 COGS → 270 tokens
 *
 * Each general analysis OR deep dive spends 1 token.
 */

export type AiUsageTierId = 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite';

export const AI_READING_TOKEN_COST = 1;

export interface AiUsageTier {
  id: AiUsageTierId;
  name: string;
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
