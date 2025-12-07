import { db } from "./db";
import { cryptoSubscriptions, cryptoUsers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// Base tiers (Elliott Wave is a separate add-on, not a tier)
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
  intermediate: 50,
  pro: -1, // -1 means unlimited
  elite: -1,
};

// Daily AI trade call limits per tier
const DAILY_AI_LIMITS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 3,
  pro: 7,
  elite: 11,
};

// Feature capability flags computed from base tier + add-ons
export function getCapabilities(tier: BaseTier, hasElliottAddon: boolean) {
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

export class CryptoSubscriptionService {
  async ensureUserExists(userId: string, email?: string) {
    // Check if user exists in crypto_users table
    const [existingUser] = await db
      .select()
      .from(cryptoUsers)
      .where(eq(cryptoUsers.id, userId))
      .limit(1);

    if (!existingUser) {
      // Create user in crypto_users table first
      await db
        .insert(cryptoUsers)
        .values({
          id: userId,
          email: email || `${userId}@open.access`,
        })
        .onConflictDoNothing();
      console.log(`✅ Created crypto_user: ${userId}`);
    }
  }

  async getUserSubscription(userId: string, email?: string) {
    console.log(`🔍 getUserSubscription called for userId: ${userId}`);
    
    // Ensure user exists first to satisfy foreign key constraint
    await this.ensureUserExists(userId, email);
    
    let [subscription] = await db
      .select()
      .from(cryptoSubscriptions)
      .where(eq(cryptoSubscriptions.userId, userId))
      .limit(1);

    console.log(`📊 Database returned subscription:`, JSON.stringify(subscription));

    if (!subscription) {
      console.log(`⚠️ No subscription found, creating new FREE tier for user ${userId}`);
      [subscription] = await db
        .insert(cryptoSubscriptions)
        .values({
          userId,
          tier: "free",
          aiCredits: 0,
          subscriptionStatus: "active",
        })
        .returning();
      console.log(`✅ Created new subscription:`, JSON.stringify(subscription));
    } else {
      console.log(`✅ Found existing subscription with tier: ${subscription.tier}`);
    }

    return subscription;
  }

  async checkTierAccess(userId: string, requiredTier: BaseTier): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const userTierLevel = TIER_HIERARCHY[subscription.tier as BaseTier] || 0;
    const requiredTierLevel = TIER_HIERARCHY[requiredTier];

    return userTierLevel >= requiredTierLevel;
  }

  async checkElliottAccess(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    // Can use Elliott if they have the add-on OR are Elite tier
    return subscription.hasElliottAddon || subscription.tier === "elite";
  }

  async useAICredit(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;

    // Pro and Elite have unlimited credits
    if (tier === "pro" || tier === "elite") {
      return true;
    }

    // Intermediate tier uses credit-based AI
    if (tier === "intermediate") {
      const credits = subscription.aiCredits || 0;
      if (credits <= 0) {
        return false;
      }

      await db
        .update(cryptoSubscriptions)
        .set({
          aiCredits: credits - 1,
          updatedAt: new Date(),
        })
        .where(eq(cryptoSubscriptions.userId, userId));

      return true;
    }

    return false;
  }

  async resetMonthlyCredits(userId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;

    const now = new Date();
    const lastReset = subscription.aiCreditsResetAt;

    if (!lastReset) {
      const creditsToSet = MONTHLY_AI_CREDITS[tier];
      if (creditsToSet >= 0) {
        await db
          .update(cryptoSubscriptions)
          .set({
            aiCredits: creditsToSet,
            aiCreditsResetAt: now,
            updatedAt: now,
          })
          .where(eq(cryptoSubscriptions.userId, userId));
      }
      return;
    }

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    if (lastReset < oneMonthAgo) {
      const creditsToSet = MONTHLY_AI_CREDITS[tier];
      if (creditsToSet >= 0) {
        await db
          .update(cryptoSubscriptions)
          .set({
            aiCredits: creditsToSet,
            aiCreditsResetAt: now,
            updatedAt: now,
          })
          .where(eq(cryptoSubscriptions.userId, userId));
      }
    }
  }

  async updateSubscriptionTier(
    userId: string,
    tier: BaseTier,
    stripeSubscriptionId: string
  ): Promise<void> {
    const newCredits = MONTHLY_AI_CREDITS[tier];

    await db
      .update(cryptoSubscriptions)
      .set({
        tier,
        stripeSubscriptionId,
        aiCredits: newCredits >= 0 ? newCredits : 0,
        aiCreditsResetAt: new Date(),
        subscriptionStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(cryptoSubscriptions.userId, userId));
  }

  async toggleElliottAddon(
    userId: string,
    enabled: boolean,
    elliottStripeItemId?: string
  ): Promise<void> {
    await db
      .update(cryptoSubscriptions)
      .set({
        hasElliottAddon: enabled,
        elliottStripeItemId: enabled ? elliottStripeItemId : null,
        updatedAt: new Date(),
      })
      .where(eq(cryptoSubscriptions.userId, userId));
  }

  async getSubscriptionStats(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const hasElliottAddon = subscription.hasElliottAddon || false;

    return {
      tier: subscription.tier,
      hasElliottAddon,
      aiCredits: subscription.aiCredits,
      hasUnlimitedCredits: tier === "pro" || tier === "elite",
      status: subscription.subscriptionStatus,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      elliottStripeItemId: subscription.elliottStripeItemId,
      autoRefreshInterval: subscription.autoRefreshInterval,
      selectedTickers: subscription.selectedTickers || [],
      alertGrades: subscription.alertGrades || ["A+", "A"],
    };
  }

  async getCapabilities(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const hasElliottAddon = subscription.hasElliottAddon || false;
    return getCapabilities(tier, hasElliottAddon);
  }

  // Check if user can make a daily AI trade call (and use it if allowed)
  // Uses fully atomic SQL to prevent all race conditions including midnight reset
  async checkAndUseDailyLimit(userId: string): Promise<{ allowed: boolean; used: number; limit: number; remainingToday: number }> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const limit = DAILY_AI_LIMITS[tier] || 0;
    
    if (limit === 0) {
      return { allowed: false, used: 0, limit: 0, remainingToday: 0 };
    }

    // Single atomic query that handles both:
    // 1. Midnight reset (if reset_at < today's midnight, treat usage as 0)
    // 2. Increment with limit check
    // Uses CASE expression to reset usage if new day, then increment if under limit
    const result = await db.execute(sql`
      UPDATE crypto_subscriptions 
      SET 
        daily_ai_usage = CASE 
          WHEN daily_ai_usage_reset_at IS NULL OR daily_ai_usage_reset_at < CURRENT_DATE 
          THEN 1
          WHEN COALESCE(daily_ai_usage, 0) < ${limit}
          THEN COALESCE(daily_ai_usage, 0) + 1
          ELSE daily_ai_usage
        END,
        daily_ai_usage_reset_at = NOW(),
        updated_at = NOW()
      WHERE user_id = ${userId} 
        AND (
          daily_ai_usage_reset_at IS NULL 
          OR daily_ai_usage_reset_at < CURRENT_DATE 
          OR COALESCE(daily_ai_usage, 0) < ${limit}
        )
      RETURNING daily_ai_usage
    `);
    
    // If no rows were updated, limit was already reached
    if (!result.rows || result.rows.length === 0) {
      return { allowed: false, used: limit, limit, remainingToday: 0 };
    }
    
    const newUsage = (result.rows[0] as any).daily_ai_usage as number;
    return { allowed: true, used: newUsage, limit, remainingToday: limit - newUsage };
  }

  // Get current daily usage without incrementing
  async getDailyUsageStatus(userId: string): Promise<{ used: number; limit: number; remainingToday: number }> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const limit = DAILY_AI_LIMITS[tier] || 0;
    
    if (limit === 0) {
      return { used: 0, limit: 0, remainingToday: 0 };
    }

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastReset = subscription.dailyAiUsageResetAt;
    
    // If last reset was before today, usage is effectively 0
    let currentUsage = subscription.dailyAiUsage || 0;
    if (!lastReset || lastReset < todayMidnight) {
      currentUsage = 0;
    }
    
    return { used: currentUsage, limit, remainingToday: limit - currentUsage };
  }
}

export const cryptoSubscriptionService = new CryptoSubscriptionService();
