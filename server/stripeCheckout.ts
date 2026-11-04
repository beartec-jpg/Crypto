// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
// Stripe Checkout Service for Crypto Subscriptions
import { getUncachableStripeClient } from './stripeClient';
import { getPinnedPriceId, tierFromSubscription } from '../shared/stripeTiers';
import { cryptoSubscriptionService } from './cryptoSubscriptionService';
import { db } from './db';
import { cryptoUsers, cryptoSubscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Product metadata types
type TierType = 'free' | 'beginner' | 'intermediate' | 'pro' | 'elite';

// Get or create Stripe customer for a crypto user
async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const stripe = await getUncachableStripeClient();
  
  // Check if user already has a Stripe customer ID
  const [user] = await db.select().from(cryptoUsers).where(eq(cryptoUsers.id, userId));
  
  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  
  // Create new customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  
  // Save customer ID
  await db.update(cryptoUsers)
    .set({ stripeCustomerId: customer.id })
    .where(eq(cryptoUsers.id, userId));
  
  return customer.id;
}

// Pinned price id for a tier (STRIPE_PRICE_CORE / _PRO / _ELITE). See shared/stripeTiers.ts.
async function getPriceIdForTier(tier: string): Promise<string | null> {
  const priceId = getPinnedPriceId(tier);
  if (!priceId) {
    console.error(`No pinned Stripe price configured for tier: ${tier}`);
  }
  return priceId;
}

// Create checkout session for base tier subscription
export async function createTierCheckoutSession(
  userId: string,
  email: string,
  tier: TierType,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const stripe = await getUncachableStripeClient();
    const customerId = await getOrCreateCustomer(userId, email);
    
    const priceId = await getPriceIdForTier(tier);
    if (!priceId) {
      return { url: null, error: `No price found for tier: ${tier}` };
    }
    
    // Check if user already has a subscription
    const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
    
    // If user has existing subscription, use portal to change
    if (subscription.stripeSubscriptionId && subscription.tier !== 'free') {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: successUrl,
      });
      return { url: portal.url };
    }
    
    // Create new checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        tier,
        type: 'base_tier',
      },
      subscription_data: {
        metadata: {
          userId,
          tier,
          type: 'base_tier',
        },
      },
    });
    
    return { url: session.url };
  } catch (error: any) {
    console.error('Error creating tier checkout:', error);
    return { url: null, error: error.message };
  }
}

// Create customer portal session for managing subscription
export async function createPortalSession(
  userId: string,
  email: string,
  returnUrl: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const stripe = await getUncachableStripeClient();
    const customerId = await getOrCreateCustomer(userId, email);
    
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    return { url: portal.url };
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    return { url: null, error: error.message };
  }
}

// Handle Stripe webhook events for subscription updates
export async function handleSubscriptionWebhook(event: any): Promise<void> {
  const subscription = event.data.object;
  const userId = subscription.metadata?.userId;
  
  if (!userId) {
    console.log('⚠️ Webhook: No userId in subscription metadata');
    return;
  }
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const type = session.metadata?.type;
      const tier = session.metadata?.tier;
      const subId = session.subscription;
      
      if (type === 'base_tier' && tier) {
        await cryptoSubscriptionService.updateSubscriptionTier(userId, tier as TierType, subId);
        console.log(`✅ Updated user ${userId} to tier: ${tier}`);
      }
      break;
    }
    
    case 'customer.subscription.updated': {
      const tier = tierFromSubscription(subscription);
      
      if (tier) {
        await cryptoSubscriptionService.updateSubscriptionTier(userId, tier as TierType, subscription.id);
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      // Reset to free tier
      await db.update(cryptoSubscriptions)
        .set({
          tier: 'free',
          stripeSubscriptionId: null,
          subscriptionStatus: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(cryptoSubscriptions.userId, userId));
      console.log(`⚠️ Subscription canceled for user ${userId}`);
      break;
    }
  }
}
