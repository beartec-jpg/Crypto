import { db } from "./db";
import { cryptoSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";

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
}

export const cryptoSubscriptionService = new CryptoSubscriptionService();
