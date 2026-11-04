// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Single source of truth for Stripe-billed tiers.
 *
 * Pricing page (client/src/pages/CryptoSubscribe.tsx) is canonical:
 *   Free (no Stripe product) · Core £15/mo · Pro £30/mo · Elite £50/mo, GBP.
 *
 * Internal tier ids stay as stored in crypto_subscriptions.tier:
 *   free | intermediate (= Core) | pro | elite.  'beginner' is a legacy id that
 *   the app treats as Free and is never sold.
 *
 * Checkout pins the exact Stripe price via env vars (STRIPE_PRICE_CORE, ...),
 * so changing a product's active price in the dashboard can't silently change
 * what customers are charged.
 */

export type PaidTierId = 'intermediate' | 'pro' | 'elite';

export interface PaidTierConfig {
  tier: PaidTierId;
  /** Display + Stripe product name. */
  name: 'Core' | 'Pro' | 'Elite';
  /** Env var holding the pinned Stripe price id. */
  priceEnvVar: 'STRIPE_PRICE_CORE' | 'STRIPE_PRICE_PRO' | 'STRIPE_PRICE_ELITE';
  /** Monthly price in pence (GBP). */
  amountPence: number;
  currency: 'gbp';
  interval: 'month';
  description: string;
}

export const PAID_TIER_CONFIG: Record<PaidTierId, PaidTierConfig> = {
  intermediate: {
    tier: 'intermediate', name: 'Core', priceEnvVar: 'STRIPE_PRICE_CORE', amountPence: 1500,
    currency: 'gbp', interval: 'month',
    description: '80 AI tokens per month for 1 nominated ticker. Charts stay free.',
  },
  pro: {
    tier: 'pro', name: 'Pro', priceEnvVar: 'STRIPE_PRICE_PRO', amountPence: 3000,
    currency: 'gbp', interval: 'month',
    description: '160 AI tokens per month for 3 nominated tickers',
  },
  elite: {
    tier: 'elite', name: 'Elite', priceEnvVar: 'STRIPE_PRICE_ELITE', amountPence: 5000,
    currency: 'gbp', interval: 'month',
    description: '270 AI tokens per month for 5 nominated tickers',
  },
};

export const PAID_TIER_IDS = Object.keys(PAID_TIER_CONFIG) as PaidTierId[];

/** Accepts internal ids and the public names ('core', 'Core'). */
export function normalizePaidTier(tier: unknown): PaidTierId | null {
  if (typeof tier !== 'string') return null;
  const t = tier.trim().toLowerCase();
  if (t === 'core' || t === 'intermediate') return 'intermediate';
  if (t === 'pro') return 'pro';
  if (t === 'elite') return 'elite';
  return null;
}

/**
 * Stripe product name → tier. Current names plus legacy names so existing
 * subscriptions keep mapping. Legacy 'Beginner*' maps to free (app treats it as free).
 */
export const PRODUCT_NAME_TO_TIER: Record<string, string> = {
  'Core': 'intermediate',
  'Pro': 'pro',
  'Elite': 'elite',
  'Intermediate membership': 'intermediate',
  'Pro membership': 'pro',
  'Elite membership': 'elite',
  'Beginner': 'free',
  'Beginner membership': 'free',
};

type Env = Record<string, string | undefined>;
const defaultEnv = (): Env => (typeof process !== 'undefined' && process.env ? process.env : {});

/** Pinned price id for a paid tier, or null if not configured. */
export function getPinnedPriceId(tier: unknown, env: Env = defaultEnv()): string | null {
  const t = normalizePaidTier(tier);
  if (!t) return null;
  const v = env[PAID_TIER_CONFIG[t].priceEnvVar]?.trim();
  return v && v.startsWith('price_') ? v : null;
}

/** Reverse lookup: pinned price id → tier. */
export function tierFromPriceId(priceId: unknown, env: Env = defaultEnv()): PaidTierId | null {
  if (typeof priceId !== 'string' || !priceId) return null;
  for (const t of PAID_TIER_IDS) {
    if (getPinnedPriceId(t, env) === priceId) return t;
  }
  return null;
}

/**
 * Resolve the tier for one subscription item. Order: pinned price id →
 * price/product metadata.tier → product name (current + legacy).
 */
export function tierFromSubscriptionItem(item: any, env: Env = defaultEnv()): string | null {
  const price = item?.price ?? item?.plan;
  const byId = tierFromPriceId(price?.id, env);
  if (byId) return byId;
  const meta = normalizePaidTier(price?.metadata?.tier) ?? normalizePaidTier(price?.product?.metadata?.tier);
  if (meta) return meta;
  const name = price?.product?.name;
  if (typeof name === 'string' && PRODUCT_NAME_TO_TIER[name]) return PRODUCT_NAME_TO_TIER[name];
  return null;
}

const RANK: Record<string, number> = { free: 0, beginner: 0, intermediate: 2, pro: 3, elite: 4 };

/** Highest tier across a subscription's items, falling back to metadata.tier. */
export function tierFromSubscription(sub: any, env: Env = defaultEnv()): string | null {
  let best: string | null = null;
  for (const item of sub?.items?.data ?? []) {
    const t = tierFromSubscriptionItem(item, env);
    if (t && (best === null || (RANK[t] ?? 0) > (RANK[best] ?? 0))) best = t;
  }
  if (best) return best;
  const meta = sub?.metadata?.tier;
  if (typeof meta === 'string' && meta) return normalizePaidTier(meta) ?? meta;
  return null;
}

/** True if a subscription item is one of our base tier products. */
export function isBaseTierItem(item: any, env: Env = defaultEnv()): boolean {
  const t = tierFromSubscriptionItem(item, env);
  return t !== null && t !== 'free';
}
