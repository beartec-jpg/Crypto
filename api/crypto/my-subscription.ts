import type { VercelRequest, VercelResponse } from '@vercel/node';

// Tier hierarchy for capability checks
const TIER_HIERARCHY: Record<string, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  elliotician: 3,
  pro: 4,
  elite: 5,
};

function getTierCapabilities(tier: string) {
  const tierLevel = TIER_HIERARCHY[tier] || 0;
  return {
    tier,
    canViewElliott: true, // Everyone can VIEW the page
    canUseElliott: tierLevel >= TIER_HIERARCHY.elliotician, // Elliotician+ can USE features
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

  // For now, return free tier for unauthenticated users
  // TODO: Integrate with Clerk to get actual user subscription from database
  const tier = 'free';
  const capabilities = getTierCapabilities(tier);

  return res.status(200).json({
    id: 'sub-' + Date.now(),
    userId: 'anonymous',
    tier,
    subscriptionStatus: 'active',
    aiCreditsRemaining: 0,
    ...capabilities,
  });
}
