// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import { db } from "./db";
import { cryptoSubscriptions, cryptoUsers, cryptoAiAnalyses } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { MONTHLY_AI_CREDITS, AI_TICKER_SLOTS } from '../shared/aiUsageTiers';

// Base tiers
type BaseTier = "free" | "beginner" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<BaseTier, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  pro: 3,
  elite: 4,
};

// Monthly Elliott Wave AI credits (separate from trade AI).
// Elliott Wave tools are available to every tier; Elite gets a larger AI allowance.
const MONTHLY_ELLIOTT_AI_CREDITS: Record<BaseTier, number> = {
  free: 50,
  beginner: 50,
  intermediate: 50,
  pro: 50,
  elite: 150,
};

function elliottCreditLimit(tier: BaseTier): number {
  return MONTHLY_ELLIOTT_AI_CREDITS[tier] ?? MONTHLY_ELLIOTT_AI_CREDITS.free;
}

// Feature capability flags computed from base tier
export function getCapabilities(tier: BaseTier) {
  const tierLevel = TIER_HIERARCHY[tier] || 0;
  return {
    tier,
    canViewElliott: true,
    canUseElliott: true, // Elliott Wave tools are open to everyone
    canUseAI: tierLevel >= TIER_HIERARCHY.intermediate, // Intermediate+ for AI
    canUseElliottAI: true,
    canUsePushNotifications: tierLevel >= TIER_HIERARCHY.pro,
    isElite: tier === "elite",
    monthlyAiCredits: MONTHLY_AI_CREDITS[tier],
    monthlyElliottCredits: elliottCreditLimit(tier),
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
    await this.getUserSubscription(userId);
    return true; // Elliott Wave tools are open to every tier
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
    const limit = elliottCreditLimit(tier);

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
    const creditsToSet = elliottCreditLimit(tier);
    
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
    const newCredits = MONTHLY_AI_CREDITS[tier];
    const newElliottCredits = elliottCreditLimit(tier);
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

  async getSubscriptionStats(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    return {
      tier: subscription.tier,
      aiCredits: subscription.aiCredits || 0,
      aiCreditsLimit: MONTHLY_AI_CREDITS[tier],
      elliottAiCredits: subscription.elliottAiCredits || 0,
      elliottAiCreditsLimit: elliottCreditLimit(tier),
      status: subscription.subscriptionStatus,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      selectedTickers: subscription.selectedTickers || [],
      alertGrades: subscription.alertGrades || ["A+", "A"],
    };
  }

  async getCapabilities(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    return getCapabilities(tier);
  }

  // Get current monthly usage status
  async getMonthlyUsageStatus(userId: string): Promise<{ aiCredits: number; aiLimit: number; elliottCredits: number; elliottLimit: number }> {
    await this.resetMonthlyCredits(userId);
    await this.resetElliottMonthlyCredits(userId);
    
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as BaseTier;
    return {
      aiCredits: subscription.aiCredits || 0,
      aiLimit: MONTHLY_AI_CREDITS[tier],
      elliottCredits: subscription.elliottAiCredits || 0,
      elliottLimit: elliottCreditLimit(tier),
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
