import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Base tiers (Elliott Wave is a separate add-on)
type BaseTier = "free" | "beginner" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<BaseTier, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  pro: 3,
  elite: 4,
};

const MONTHLY_AI_CREDITS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 200,
  pro: 400,
  elite: 500,
};

const MONTHLY_ELLIOTT_AI_CREDITS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 0,
  pro: 0,
  elite: 150,
};

const ELLIOTT_ADDON_CREDITS = 50;

function getCapabilities(tier: BaseTier, hasElliottAddon: boolean) {
  const tierLevel = TIER_HIERARCHY[tier] || 0;
  return {
    tier,
    hasElliottAddon,
    canViewElliott: true,
    canUseElliott: hasElliottAddon || tier === "elite",
    canUseAI: tierLevel >= TIER_HIERARCHY.intermediate,
    hasUnlimitedAI: false, // No tier has unlimited AI - all have monthly credits
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
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
  return pool;
}

// Get Stripe client
async function getStripeClient() {
  const Stripe = (await import('stripe')).default;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

// Sync ALL subscriptions from Stripe for a customer
// Returns null if sync fails (preserves existing DB values)
async function syncAllSubscriptionsFromStripe(customerId: string, userId: string, pool: any): Promise<{ tier: BaseTier; hasElliott: boolean } | null> {
  try {
    const stripe = await getStripeClient();
    if (!stripe || !customerId) {
      console.log(`⚠️ Cannot sync - no Stripe client or customer ID`);
      return null;
    }

    // Get ALL active subscriptions for this customer
   const allSubs = await stripe.subscriptions.list({
  customer: customerId,
  status: 'active',
  expand: ['data.items.data.price'],  // ✅
});

    console.log(`📋 Customer ${customerId} has ${allSubs.data.length} active subscriptions`);

    if (allSubs.data.length === 0) {
      console.log(`⚠️ No active subscriptions for customer`);
      return null; // Don't downgrade - preserve existing
    }

    // Map product names to tiers
    const tierMap: Record<string, BaseTier> = {
      'Beginner membership': 'beginner',
      'Intermediate membership': 'intermediate',
      'Pro membership': 'pro',
      'Elite membership': 'elite',
    };

    let bestTier: BaseTier = 'free';
    let hasElliott = false;
    let foundProducts: string[] = [];

    // Check ALL subscriptions and ALL items
    for (const sub of allSubs.data) {
      console.log(`  📦 Subscription ${sub.id} (${sub.status}):`);
      for (const item of sub.items.data) {
        const productName = (item.price?.product as any)?.name || '';
        console.log(`    - Product: "${productName}"`);
        foundProducts.push(productName);

        // Check for tier products
        if (tierMap[productName]) {
          const foundTier = tierMap[productName];
          if (TIER_HIERARCHY[foundTier] > TIER_HIERARCHY[bestTier]) {
            bestTier = foundTier;
          }
        }

        // Check for Elliott Wave (handles "Elliot" and "Elliott" spellings)
        if (productName.toLowerCase().includes('elliot')) {
          hasElliott = true;
          console.log(`    ✅ Found Elliott Wave!`);
        }
      }
    }

    // Only update if we found at least one known product
    if (bestTier !== 'free' || hasElliott) {
      await pool.query(`
        UPDATE crypto_subscriptions 
        SET tier = $1, has_elliott_addon = $2, updated_at = NOW()
        WHERE user_id = $3
      `, [bestTier, hasElliott, userId]);
      
      console.log(`✅ Synced: tier=${bestTier}, hasElliott=${hasElliott}`);
      return { tier: bestTier, hasElliott };
    } else {
      console.log(`⚠️ Found ${foundProducts.length} products but none matched: ${foundProducts.join(', ')}`);
      return null; // Preserve existing values
    }
  } catch (error) {
    console.error('Stripe sync error:', error);
    return null; // Preserve existing on error
  }
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
      monthlyUsage: {
        aiCredits: 0,
        aiLimit: 0,
        elliottCredits: 0,
        elliottLimit: 0,
      },
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

    // Get Stripe customer ID to sync from Stripe
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM crypto_users WHERE id = $1',
      [userId]
    );
    const stripeCustomerId = userResult.rows[0]?.stripe_customer_id;
    
    console.log(`🔍 User ${userId} (${email}): stripe_customer_id=${stripeCustomerId || 'NONE'}`);

    // Sync from Stripe if customer ID exists - this runs on EVERY request
    let tier: BaseTier;
    let hasElliottAddon: boolean;
    
    if (stripeCustomerId) {
      console.log(`🔄 Starting Stripe sync for customer ${stripeCustomerId}...`);
      const synced = await syncAllSubscriptionsFromStripe(stripeCustomerId, userId, pool);
      if (synced) {
        // Stripe sync successful - use synced values
        tier = synced.tier;
        hasElliottAddon = synced.hasElliott;
        console.log(`✅ Stripe sync complete: tier=${tier}, hasElliott=${hasElliottAddon}`);
      } else {
        // Sync failed or no products found - use existing DB values
        tier = (subscription.tier || 'free') as BaseTier;
        hasElliottAddon = subscription.has_elliott_addon || false;
        console.log(`⚠️ Stripe sync returned null, using DB: tier=${tier}, hasElliott=${hasElliottAddon}`);
      }
    } else {
      // No Stripe customer - use existing DB values
      tier = (subscription.tier || 'free') as BaseTier;
      hasElliottAddon = subscription.has_elliott_addon || false;
      console.log(`ℹ️ No Stripe customer, using DB: tier=${tier}, hasElliott=${hasElliottAddon}`);
    }
    
    const capabilities = getCapabilities(tier, hasElliottAddon);
    
    const aiLimit = MONTHLY_AI_CREDITS[tier] || 0;
    const aiCredits = subscription.ai_credits || 0;
    
    const elliottLimit = (tier === 'elite' ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasElliottAddon ? ELLIOTT_ADDON_CREDITS : 0);
    const elliottCredits = subscription.elliott_ai_credits || 0;

    return res.status(200).json({
      id: subscription.id,
      userId: subscription.user_id,
      subscriptionStatus: subscription.subscription_status || 'active',
      aiCredits: aiCredits,
      aiCreditsRemaining: aiCredits,
      aiCreditsLimit: aiLimit,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      elliottStripeItemId: subscription.elliott_stripe_item_id,
      monthlyUsage: {
        aiCredits: aiCredits,
        aiLimit: aiLimit,
        elliottCredits: elliottCredits,
        elliottLimit: elliottLimit,
      },
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
      monthlyUsage: {
        aiCredits: 0,
        aiLimit: 0,
        elliottCredits: 0,
        elliottLimit: 0,
      },
      ...capabilities,
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
