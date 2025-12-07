import type { VercelRequest, VercelResponse } from '@vercel/node';

// Base tiers (Elliott Wave is a separate add-on)
type BaseTier = "free" | "beginner" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<BaseTier, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  pro: 3,
  elite: 4,
};

function getCapabilities(tier: BaseTier, hasElliottAddon: boolean) {
  const tierLevel = TIER_HIERARCHY[tier] || 0;
  return {
    tier,
    hasElliottAddon,
    canViewElliott: true, // Everyone can VIEW the page
    canUseElliott: hasElliottAddon || tier === "elite", // Elliott add-on OR Elite tier
    canUseAI: tierLevel >= TIER_HIERARCHY.intermediate, // Intermediate+ for AI
    hasUnlimitedAI: tier === "pro" || tier === "elite",
    canUsePushNotifications: tierLevel >= TIER_HIERARCHY.pro,
    isElite: tier === "elite",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // For unauthenticated users, return free tier with no add-ons
  // TODO: Integrate with Clerk to get actual user subscription from database
  const tier: BaseTier = 'free';
  const hasElliottAddon = false;
  const capabilities = getCapabilities(tier, hasElliottAddon);

  return res.status(200).json({
    id: 'sub-' + Date.now(),
    userId: 'anonymous',
    tier,
    hasElliottAddon,
    subscriptionStatus: 'active',
    aiCreditsRemaining: 0,
    stripeSubscriptionId: null,
    elliottStripeItemId: null,
    ...capabilities,
  });
}
