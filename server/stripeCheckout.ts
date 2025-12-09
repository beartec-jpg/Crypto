// Stripe Checkout Service for Crypto Subscriptions
import { getUncachableStripeClient } from './stripeClient';
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

// Get price ID for a tier from Stripe
async function getPriceIdForTier(tier: string): Promise<string | null> {
  const stripe = await getUncachableStripeClient();
  
  // Search for products with matching tier metadata
  const products = await stripe.products.search({
    query: `metadata['tier']:'${tier}'`,
  });
  
  if (products.data.length === 0) {
    console.error(`No Stripe product found for tier: ${tier}`);
    return null;
  }
  
  // Get active price for this product
  const prices = await stripe.prices.list({
    product: products.data[0].id,
    active: true,
  });
  
  if (prices.data.length === 0) {
    console.error(`No active price found for tier: ${tier}`);
    return null;
  }
  
  return prices.data[0].id;
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

// Create checkout session for Elliott Wave add-on
export async function createElliottAddonCheckoutSession(
  userId: string,
  email: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const stripe = await getUncachableStripeClient();
    const customerId = await getOrCreateCustomer(userId, email);
    
    const priceId = await getPriceIdForTier('elliott_addon');
    if (!priceId) {
      return { url: null, error: 'Elliott Wave add-on price not found' };
    }
    
    // Check if user already has Elliott addon
    const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
    if (subscription.hasElliottAddon) {
      return { url: null, error: 'Already subscribed to Elliott Wave add-on' };
    }
    
    // If user has existing subscription, add Elliott as additional item
    if (subscription.stripeSubscriptionId) {
      // First check if Elliott is already on the Stripe subscription
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
        expand: ['items.data'],
      });
      
      const existingElliottItem = stripeSub.items.data.find(
        (item: any) => item.price.id === priceId
      );
      
      if (existingElliottItem) {
        // Elliott already exists on Stripe subscription - just sync database
        await cryptoSubscriptionService.toggleElliottAddon(userId, true);
        return { url: successUrl };
      }
      
      // Add Elliott addon to existing subscription
      await stripe.subscriptionItems.create({
        subscription: subscription.stripeSubscriptionId,
        price: priceId,
        metadata: {
          userId,
          type: 'elliott_addon',
        },
      });
      
      // Update database
      await cryptoSubscriptionService.toggleElliottAddon(userId, true);
      
      return { url: successUrl };
    }
    
    // Create new checkout session for Elliott only
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        type: 'elliott_addon',
      },
      subscription_data: {
        metadata: {
          userId,
          type: 'elliott_addon',
        },
      },
    });
    
    return { url: session.url };
  } catch (error: any) {
    console.error('Error creating Elliott checkout:', error);
    return { url: null, error: error.message };
  }
}

// Cancel Elliott Wave add-on
export async function cancelElliottAddon(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getUncachableStripeClient();
    const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
    
    if (!subscription.hasElliottAddon) {
      return { success: false, error: 'Not subscribed to Elliott Wave add-on' };
    }
    
    if (!subscription.elliottStripeItemId) {
      // Just update database if no Stripe item
      await cryptoSubscriptionService.toggleElliottAddon(userId, false);
      return { success: true };
    }
    
    // Cancel the Elliott subscription item
    await stripe.subscriptionItems.del(subscription.elliottStripeItemId);
    
    // Update database
    await cryptoSubscriptionService.toggleElliottAddon(userId, false);
    
    return { success: true };
  } catch (error: any) {
    console.error('Error canceling Elliott addon:', error);
    return { success: false, error: error.message };
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
      } else if (type === 'elliott_addon') {
        // Get subscription item ID for Elliott
        const stripeSub = await (await getUncachableStripeClient()).subscriptions.retrieve(subId);
        const elliottItem = stripeSub.items.data.find(item => 
          item.price.metadata?.tier === 'elliott_addon'
        );
        await cryptoSubscriptionService.toggleElliottAddon(userId, true, elliottItem?.id);
        console.log(`✅ Added Elliott Wave addon for user ${userId}`);
      }
      break;
    }
    
    case 'customer.subscription.updated': {
      const items = subscription.items.data;
      const tier = subscription.metadata?.tier;
      
      if (tier) {
        await cryptoSubscriptionService.updateSubscriptionTier(userId, tier as TierType, subscription.id);
      }
      
      // Check for Elliott addon
      const elliottItem = items.find((item: any) => 
        item.price.metadata?.tier === 'elliott_addon'
      );
      
      if (elliottItem) {
        await cryptoSubscriptionService.toggleElliottAddon(userId, true, elliottItem.id);
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      // Reset to free tier
      await db.update(cryptoSubscriptions)
        .set({
          tier: 'free',
          hasElliottAddon: false,
          stripeSubscriptionId: null,
          elliottStripeItemId: null,
          subscriptionStatus: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(cryptoSubscriptions.userId, userId));
      console.log(`⚠️ Subscription canceled for user ${userId}`);
      break;
    }
  }
}
