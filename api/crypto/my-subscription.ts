import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Base tiers (Elliott Wave is a separate add-on)
type BaseTier = "free" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<BaseTier, number> = {
  free: 0,
  intermediate: 1,
  pro: 2,
  elite: 3,
};

function getCapabilities(tier: BaseTier, hasElliottAddon: boolean) {
  const tierLevel = TIER_HIERARCHY[tier] || 0;
  return {
    tier,
    hasElliottAddon,
    canViewElliott: true,
    canUseElliott: hasElliottAddon || tier === "elite",
    canUseAI: tierLevel >= TIER_HIERARCHY.intermediate,
    hasUnlimitedAI: tier === "pro" || tier === "elite",
    canUsePushNotifications: tierLevel >= TIER_HIERARCHY.pro,
    isElite: tier === "elite",
  };
}

// Verify user authentication from Clerk token
async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      console.error('CLERK_SECRET_KEY not set');
      return null;
    }
    
    const payload = await verifyToken(token, { secretKey });

    if (!payload?.sub) {
      return null;
    }

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    const email = user.emailAddresses[0]?.emailAddress || '';

    return { userId: payload.sub, email };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

// Database connection
async function getDb() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Try to authenticate user
  const auth = await verifyAuth(req);
  
  // If not authenticated, return free tier
  if (!auth) {
    const capabilities = getCapabilities('free', false);
    return res.status(200).json({
      id: null,
      userId: 'anonymous',
      subscriptionStatus: 'none',
      aiCredits: 0,
      stripeSubscriptionId: null,
      elliottStripeItemId: null,
      ...capabilities,
    });
  }

  const { userId, email } = auth;
  let pool: any = null;

  try {
    pool = await getDb();

    // Ensure user exists in crypto_users table
    await pool.query(`
      INSERT INTO crypto_users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [userId, email]);

    // Get or create subscription
    let result = await pool.query(`
      SELECT * FROM crypto_subscriptions WHERE user_id = $1
    `, [userId]);

    let subscription = result.rows[0];

    if (!subscription) {
      // Create free subscription for new user
      const insertResult = await pool.query(`
        INSERT INTO crypto_subscriptions (
          id, user_id, tier, has_elliott_addon, subscription_status,
          ai_credits, ai_credits_reset_at, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, 'free', false, 'active',
          0, NOW(), NOW(), NOW()
        )
        RETURNING *
      `, [userId]);
      subscription = insertResult.rows[0];
    }

    const tier = (subscription.tier || 'free') as BaseTier;
    const hasElliottAddon = subscription.has_elliott_addon || false;
    const capabilities = getCapabilities(tier, hasElliottAddon);

    return res.status(200).json({
      id: subscription.id,
      userId: subscription.user_id,
      subscriptionStatus: subscription.subscription_status || 'active',
      aiCredits: subscription.ai_credits || 0,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      elliottStripeItemId: subscription.elliott_stripe_item_id,
      ...capabilities,
    });

  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    
    // Fallback to free tier on error
    const capabilities = getCapabilities('free', false);
    return res.status(200).json({
      id: null,
      userId: auth.userId,
      subscriptionStatus: 'active',
      aiCredits: 0,
      stripeSubscriptionId: null,
      elliottStripeItemId: null,
      ...capabilities,
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
