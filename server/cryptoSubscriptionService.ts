import { db } from "./db";
import { cryptoSubscriptions, cryptoUsers, cryptoAiAnalyses } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Base tiers (Elliott Wave is a separate add-on, not a tier)
type BaseTier = "free" | "beginner" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<BaseTier, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  pro: 3,
  elite: 4,
};

// Monthly AI Trade credits per tier — reduced to reflect Grok 4 extended-thinking cost
const MONTHLY_AI_CREDITS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 100,
  pro: 200,
  elite: 300,
};

// Monthly Elliott Wave AI credits (separate from trade AI)
const MONTHLY_ELLIOTT_AI_CREDITS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 0, // Needs Elliott add-on
  pro: 0, // Needs Elliott add-on
  elite: 150, // Elite includes Elliott AI
};

// Elliott add-on gives 50 monthly Elliott AI credits
const ELLIOTT_ADDON_CREDITS = 50;
const AI_TICKER_SLOTS: Record<BaseTier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 1,
  pro: 3,
  elite: 5,
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
    canUseElliottAI: hasElliottAddon || tier === "elite", // Elliott add-on OR Elite tier
    canUsePushNotifications: tierLevel >= TIER_HIERARCHY.pro,
    isElite: tier === "elite",
    monthlyAiCredits: MONTHLY_AI_CREDITS[tier],
    monthlyElliottCredits: (tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasElliottAddon ? ELLIOTT_ADDON_CREDITS : 0),
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
          tickerSlots: AI_TICKER_SLOTS.free,
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

  async useAICredit(userId: string): Promise<{ success: boolean; remaining: number; limit: number }> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const limit = MONTHLY_AI_CREDITS[tier];

    // No AI access for free/beginner
    if (limit === 0) {
      return { success: false, remaining: 0, limit: 0 };
    }

    // Check monthly reset first
    await this.resetMonthlyCredits(userId);
    
    // Re-fetch after potential reset
    const updatedSub = await this.getUserSubscription(userId);
    const credits = updatedSub.aiCredits || 0;
    
    if (credits <= 0) {
      return { success: false, remaining: 0, limit };
    }

    await db
      .update(cryptoSubscriptions)
      .set({
        aiCredits: credits - 1,
        updatedAt: new Date(),
      })
      .where(eq(cryptoSubscriptions.userId, userId));

    return { success: true, remaining: credits - 1, limit };
  }

  async useElliottAICredit(userId: string): Promise<{ success: boolean; remaining: number; limit: number }> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const hasAddon = subscription.hasElliottAddon || false;
    
    // Calculate Elliott AI limit (Elite + addon credits are additive)
    const limit = (tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasAddon ? ELLIOTT_ADDON_CREDITS : 0);

    // No Elliott AI access
    if (limit === 0) {
      return { success: false, remaining: 0, limit: 0 };
    }

    // Check monthly reset first
    await this.resetElliottMonthlyCredits(userId);
    
    // Re-fetch after potential reset
    const updatedSub = await this.getUserSubscription(userId);
    const credits = updatedSub.elliottAiCredits || 0;
    
    if (credits <= 0) {
      return { success: false, remaining: 0, limit };
    }

    await db
      .update(cryptoSubscriptions)
      .set({
        elliottAiCredits: credits - 1,
        updatedAt: new Date(),
      })
      .where(eq(cryptoSubscriptions.userId, userId));

    return { success: true, remaining: credits - 1, limit };
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

  async resetElliottMonthlyCredits(userId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const hasAddon = subscription.hasElliottAddon || false;
    
    // Calculate Elliott credit limit (Elite + addon credits are additive)
    const creditsToSet = (tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasAddon ? ELLIOTT_ADDON_CREDITS : 0);
    
    if (creditsToSet === 0) return;

    const now = new Date();
    const lastReset = subscription.elliottAiCreditsResetAt;

    if (!lastReset) {
      await db
        .update(cryptoSubscriptions)
        .set({
          elliottAiCredits: creditsToSet,
          elliottAiCreditsResetAt: now,
          updatedAt: now,
        })
        .where(eq(cryptoSubscriptions.userId, userId));
      return;
    }

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    if (lastReset < oneMonthAgo) {
      await db
        .update(cryptoSubscriptions)
        .set({
          elliottAiCredits: creditsToSet,
          elliottAiCreditsResetAt: now,
          updatedAt: now,
        })
        .where(eq(cryptoSubscriptions.userId, userId));
    }
  }

  async updateSubscriptionTier(
    userId: string,
    tier: BaseTier,
    stripeSubscriptionId: string
  ): Promise<void> {
    // Check if user already has the Elliott add-on for combined credits
    const subscription = await this.getUserSubscription(userId);
    const hasAddon = subscription.hasElliottAddon || false;
    
    const newCredits = MONTHLY_AI_CREDITS[tier];
    // Combined Elliott credits: tier credits + addon credits (if user has addon)
    const tierElliottCredits = tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0;
    const newElliottCredits = tierElliottCredits + (hasAddon ? ELLIOTT_ADDON_CREDITS : 0);
    const now = new Date();

    await db
      .update(cryptoSubscriptions)
      .set({
        tier,
        stripeSubscriptionId,
        tickerSlots: AI_TICKER_SLOTS[tier],
        aiCredits: newCredits,
        aiCreditsResetAt: now,
        elliottAiCredits: newElliottCredits,
        elliottAiCreditsResetAt: newElliottCredits > 0 ? now : null,
        subscriptionStatus: "active",
        updatedAt: now,
      })
      .where(eq(cryptoSubscriptions.userId, userId));
  }

  async toggleElliottAddon(
    userId: string,
    enabled: boolean,
    elliottStripeItemId?: string
  ): Promise<void> {
    const now = new Date();
    // Get current subscription to check tier for proper credit calculation
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const eliteCredits = tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0;
    
    // Calculate new credit total: Elite tier credits + addon credits (if enabled)
    const newCredits = eliteCredits + (enabled ? ELLIOTT_ADDON_CREDITS : 0);
    
    await db
      .update(cryptoSubscriptions)
      .set({
        hasElliottAddon: enabled,
        elliottStripeItemId: enabled ? elliottStripeItemId : null,
        elliottAiCredits: newCredits,
        elliottAiCreditsResetAt: newCredits > 0 ? now : null,
        updatedAt: now,
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
      aiCredits: subscription.aiCredits || 0,
      aiCreditsLimit: MONTHLY_AI_CREDITS[tier],
      elliottAiCredits: subscription.elliottAiCredits || 0,
      elliottAiCreditsLimit: (tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasElliottAddon ? ELLIOTT_ADDON_CREDITS : 0),
      status: subscription.subscriptionStatus,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      elliottStripeItemId: subscription.elliottStripeItemId,
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

  // Get current monthly usage status
  async getMonthlyUsageStatus(userId: string): Promise<{ aiCredits: number; aiLimit: number; elliottCredits: number; elliottLimit: number }> {
    await this.resetMonthlyCredits(userId);
    await this.resetElliottMonthlyCredits(userId);
    
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    const hasAddon = subscription.hasElliottAddon || false;
    
    return {
      aiCredits: subscription.aiCredits || 0,
      aiLimit: MONTHLY_AI_CREDITS[tier],
      elliottCredits: subscription.elliottAiCredits || 0,
      elliottLimit: (tier === "elite" ? MONTHLY_ELLIOTT_AI_CREDITS[tier] : 0) + (hasAddon ? ELLIOTT_ADDON_CREDITS : 0),
    };
  }

  // Save or update AI analysis for user/symbol/interval
  async saveAiAnalysis(
    userId: string,
    symbol: string,
    interval: string,
    alerts: any[],
    marketInsights: any,
    orderflowData: any
  ): Promise<void> {
    const existing = await db
      .select()
      .from(cryptoAiAnalyses)
      .where(
        and(
          eq(cryptoAiAnalyses.userId, userId),
          eq(cryptoAiAnalyses.symbol, symbol),
          eq(cryptoAiAnalyses.interval, interval)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(cryptoAiAnalyses)
        .set({
          alerts,
          marketInsights,
          orderflowData,
          updatedAt: new Date(),
        })
        .where(eq(cryptoAiAnalyses.id, existing[0].id));
    } else {
      await db.insert(cryptoAiAnalyses).values({
        userId,
        symbol,
        interval,
        alerts,
        marketInsights,
        orderflowData,
      });
    }
  }

  // Get cached AI analysis for user/symbol/interval
  async getCachedAnalysis(
    userId: string,
    symbol: string,
    interval: string
  ): Promise<{ alerts: any[]; marketInsights: any; indicatorData: any; updatedAt: Date | null } | null> {
    const [analysis] = await db
      .select()
      .from(cryptoAiAnalyses)
      .where(
        and(
          eq(cryptoAiAnalyses.userId, userId),
          eq(cryptoAiAnalyses.symbol, symbol),
          eq(cryptoAiAnalyses.interval, interval)
        )
      )
      .limit(1);

    if (!analysis) return null;

    return {
      alerts: analysis.alerts as any[] || [],
      marketInsights: analysis.marketInsights,
      indicatorData: analysis.orderflowData, // orderflowData column now stores indicatorData
      updatedAt: analysis.updatedAt,
    };
  }

  // Save cached Multi-TF analysis
  async saveCachedMultiTFAnalysis(
    userId: string,
    symbol: string,
    multiTFInsights: any,
    tradeAlerts: any[],
    confluence: string
  ): Promise<void> {
    const existing = await db
      .select()
      .from(cryptoAiAnalyses)
      .where(
        and(
          eq(cryptoAiAnalyses.userId, userId),
          eq(cryptoAiAnalyses.symbol, symbol),
          eq(cryptoAiAnalyses.interval, 'multi-tf')
        )
      )
      .limit(1);

    const analysisData = { multiTFInsights, tradeAlerts, confluence };

    if (existing.length > 0) {
      await db
        .update(cryptoAiAnalyses)
        .set({
          alerts: tradeAlerts,
          marketInsights: analysisData,
          updatedAt: new Date(),
        })
        .where(eq(cryptoAiAnalyses.id, existing[0].id));
    } else {
      await db.insert(cryptoAiAnalyses).values({
        userId,
        symbol,
        interval: 'multi-tf',
        alerts: tradeAlerts,
        marketInsights: analysisData,
      });
    }
  }

  // Get cached Multi-TF analysis
  async getCachedMultiTFAnalysis(
    userId: string,
    symbol: string
  ): Promise<{ multiTFInsights: any; tradeAlerts: any[]; confluence: string; updatedAt: Date | null } | null> {
    const [analysis] = await db
      .select()
      .from(cryptoAiAnalyses)
      .where(
        and(
          eq(cryptoAiAnalyses.userId, userId),
          eq(cryptoAiAnalyses.symbol, symbol),
          eq(cryptoAiAnalyses.interval, 'multi-tf')
        )
      )
      .limit(1);

    if (!analysis) return null;

    const data = analysis.marketInsights as any || {};
    return {
      multiTFInsights: data.multiTFInsights || null,
      tradeAlerts: data.tradeAlerts || [],
      confluence: data.confluence || '',
      updatedAt: analysis.updatedAt,
    };
  }
}

export const cryptoSubscriptionService = new CryptoSubscriptionService();
