import { describe, it, expect } from 'vitest';
import {
  PAID_TIER_CONFIG, PRODUCT_NAME_TO_TIER, getPinnedPriceId, isBaseTierItem, normalizePaidTier,
  tierFromPriceId, tierFromSubscription, tierFromSubscriptionItem,
} from '../../../../shared/stripeTiers';
import { AI_USAGE_TIERS, blendedTokenCostGbp } from '../../../../shared/aiUsageTiers';
import { DEFAULT_USD_GBP_RATE, usdGbpRate, usdToGbp, usdToPence } from '../../../../shared/currency';

const env = { STRIPE_PRICE_CORE: 'price_core_test', STRIPE_PRICE_PRO: 'price_pro_test', STRIPE_PRICE_ELITE: 'price_elite_test' };

describe('tier config matches the pricing page (Free / Core £15 / Pro £30 / Elite £50, GBP)', () => {
  it('paid tiers', () => {
    expect(Object.values(PAID_TIER_CONFIG).map(c => [c.name, c.amountPence, c.currency, c.interval])).toEqual([
      ['Core', 1500, 'gbp', 'month'], ['Pro', 3000, 'gbp', 'month'], ['Elite', 5000, 'gbp', 'month'],
    ]);
  });
  it('agrees with shared/aiUsageTiers', () => {
    for (const c of Object.values(PAID_TIER_CONFIG)) {
      expect(AI_USAGE_TIERS[c.tier].name).toBe(c.name);
      expect(AI_USAGE_TIERS[c.tier].monthlyPrice * 100).toBe(c.amountPence);
      expect(AI_USAGE_TIERS[c.tier].priceLabel).toBe(`£${c.amountPence / 100}/mo`);
    }
    expect(AI_USAGE_TIERS.free.monthlyPrice).toBe(0);
    expect(AI_USAGE_TIERS.beginner.monthlyPrice).toBe(0);
  });
  it('no Beginner/Free product is sold', () => {
    expect(normalizePaidTier('beginner')).toBeNull();
    expect(normalizePaidTier('free')).toBeNull();
    expect(PRODUCT_NAME_TO_TIER['Beginner']).toBe('free');
  });
});

describe('pinned prices', () => {
  it('reads env vars per tier, accepts public names', () => {
    expect(getPinnedPriceId('intermediate', env)).toBe('price_core_test');
    expect(getPinnedPriceId('core', env)).toBe('price_core_test');
    expect(getPinnedPriceId('pro', env)).toBe('price_pro_test');
    expect(getPinnedPriceId('elite', env)).toBe('price_elite_test');
  });
  it('returns null when missing or malformed (no fallback to product price)', () => {
    expect(getPinnedPriceId('pro', {})).toBeNull();
    expect(getPinnedPriceId('pro', { STRIPE_PRICE_PRO: 'prod_abc' })).toBeNull();
    expect(getPinnedPriceId('beginner', env)).toBeNull();
  });
  it('reverse maps price id → tier', () => {
    expect(tierFromPriceId('price_elite_test', env)).toBe('elite');
    expect(tierFromPriceId('price_other', env)).toBeNull();
  });
});

describe('webhook tier mapping', () => {
  const sub = (items: any[], metadata: any = {}) => ({ metadata, items: { data: items } });
  it('maps by pinned price id even with unexpanded product and stale metadata', () => {
    for (const [priceId, tier] of [['price_core_test', 'intermediate'], ['price_pro_test', 'pro'], ['price_elite_test', 'elite']]) {
      expect(tierFromSubscription(sub([{ price: { id: priceId, product: 'prod_x' } }], { tier: 'intermediate' }), env)).toBe(tier);
    }
  });
  it('falls back to price metadata, then current and legacy product names', () => {
    expect(tierFromSubscriptionItem({ price: { id: 'p', metadata: { tier: 'pro' } } }, {})).toBe('pro');
    expect(tierFromSubscriptionItem({ price: { id: 'p', product: { name: 'Core' } } }, {})).toBe('intermediate');
    expect(tierFromSubscriptionItem({ price: { id: 'p', product: { name: 'Elite membership' } } }, {})).toBe('elite');
    expect(tierFromSubscriptionItem({ price: { id: 'p', product: { name: 'Intermediate membership' } } }, {})).toBe('intermediate');
  });
  it('falls back to subscription metadata and normalises core', () => {
    expect(tierFromSubscription(sub([], { tier: 'core' }), {})).toBe('intermediate');
    expect(tierFromSubscription(sub([{ price: { id: 'x' } }]), {})).toBeNull();
  });
  it('picks the highest tier across items', () => {
    expect(tierFromSubscription(sub([{ price: { id: 'price_core_test' } }, { price: { id: 'price_elite_test' } }]), env)).toBe('elite');
  });
  it('identifies base tier items, not legacy Beginner', () => {
    expect(isBaseTierItem({ price: { id: 'price_pro_test' } }, env)).toBe(true);
    expect(isBaseTierItem({ price: { id: 'p', product: { name: 'Beginner' } } }, {})).toBe(false);
  });
});

describe('currency: USD AI costs vs GBP prices', () => {
  it('uses configurable USD_GBP_RATE', () => {
    expect(usdGbpRate({})).toBe(DEFAULT_USD_GBP_RATE);
    expect(usdGbpRate({ USD_GBP_RATE: '0.8' })).toBe(0.8);
    expect(usdGbpRate({ USD_GBP_RATE: 'nope' })).toBe(DEFAULT_USD_GBP_RATE);
    expect(usdToGbp(10, 0.8)).toBeCloseTo(8);
    expect(usdToPence(1, 0.79)).toBe(79);
  });
  it('token allowances stay within ~50% COGS of GBP price', () => {
    for (const c of Object.values(PAID_TIER_CONFIG)) {
      const cogsPence = AI_USAGE_TIERS[c.tier].tokens * blendedTokenCostGbp(DEFAULT_USD_GBP_RATE) * 100;
      expect(cogsPence).toBeLessThanOrEqual(c.amountPence * 0.5);
    }
  });
});
