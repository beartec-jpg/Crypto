import { db } from "./db";
import { cryptoSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";

type Tier = "free" | "beginner" | "intermediate" | "pro" | "elite";

const TIER_HIERARCHY: Record<Tier, number> = {
  free: 0,
  beginner: 1,
  intermediate: 2,
  pro: 3,
  elite: 4,
};

const MONTHLY_AI_CREDITS: Record<Tier, number> = {
  free: 0,
  beginner: 0,
  intermediate: 50,
  pro: -1, // -1 means unlimited
  elite: -1,
};

export class CryptoSubscriptionService {
  async getUserSubscription(userId: string) {
    console.log(`🔍 getUserSubscription called for userId: ${userId}`);
    
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

  async checkTierAccess(userId: string, requiredTier: Tier): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const userTierLevel = TIER_HIERARCHY[subscription.tier as Tier] || 0;
    const requiredTierLevel = TIER_HIERARCHY[requiredTier];

    return userTierLevel >= requiredTierLevel;
  }

  async useAICredit(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as Tier;

    if (tier === "pro" || tier === "elite") {
      return true;
    }

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
    const tier = subscription.tier as Tier;

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
    tier: Tier,
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

  async getSubscriptionStats(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription.tier as Tier;

    return {
      tier: subscription.tier,
      aiCredits: subscription.aiCredits,
      hasUnlimitedCredits: tier === "pro" || tier === "elite",
      status: subscription.subscriptionStatus,
      autoRefreshInterval: subscription.autoRefreshInterval,
      selectedTickers: subscription.selectedTickers || [],
      alertGrades: subscription.alertGrades || ["A+", "A"],
    };
  }
}

export const cryptoSubscriptionService = new CryptoSubscriptionService();
