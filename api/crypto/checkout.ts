// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
// Vercel serverless function for Stripe checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Verify user authentication from Clerk token
async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  try {
    // Get authorization header
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
    
    // Verify the session token
    const payload = await verifyToken(token, {
      secretKey,
    });

    if (!payload?.sub) {
      return null;
    }

    // Get user details from Clerk
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    const email = user.emailAddresses[0]?.emailAddress || '';

    return { userId: payload.sub, email };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

// Simple Stripe client using environment variable
async function getStripeClient() {
  const Stripe = (await import('stripe')).default;
  
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });
}

// Get the site URL for redirects
function getSiteUrl(req: VercelRequest): string {
  // Priority: SITE_URL env var > request origin > fallback
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }
  
  const origin = req.headers.origin;
  if (origin) {
    return origin;
  }
  
  // Fallback for Replit dev environment
  const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  
  return 'https://beartec.uk';
}

// Database connection for Vercel
async function getDb() {
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication before DB connection
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { userId, email } = auth;
  const { tier, type, action } = req.body;

  let pool: any = null;

  try {
    const stripe = await getStripeClient();
    pool = await getDb();

    // Get or create Stripe customer
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM crypto_users WHERE id = $1',
      [userId]
    );

    let customerId = userResult.rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;

      await pool.query(
        'UPDATE crypto_users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      );
    }

    // Determine base URL for redirects
    const baseUrl = getSiteUrl(req);
    const successUrl = `${baseUrl}/cryptosubscribe?success=true`;
    const cancelUrl = `${baseUrl}/cryptosubscribe?canceled=true`;

    // Map tier names to product names
    const tierToProductName: Record<string, string> = {
      'beginner': 'Beginner membership',
      'intermediate': 'Intermediate membership',
      'pro': 'Pro membership',
      'elite': 'Elite membership',
    };

    // Handle different checkout types
    if (type === 'base_tier' && tier) {
      const productName = tierToProductName[tier];
      if (!productName) {
        return res.status(400).json({ error: `Invalid tier: ${tier}` });
      }

      // Search by product name instead of metadata
      const products = await stripe.products.list({ active: true, limit: 100 });
      const product = products.data.find(p => p.name === productName);

      if (!product) {
        return res.status(400).json({ error: `No product found for tier: ${tier}` });
      }

      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      if (prices.data.length === 0) {
        return res.status(400).json({ error: `No price found for tier: ${tier}` });
      }

      const priceId = prices.data[0].id;

      // Check if user already has a subscription
      const subResult = await pool.query(
        'SELECT stripe_subscription_id, tier FROM crypto_subscriptions WHERE user_id = $1',
        [userId]
      );

      const existingSub = subResult.rows[0];

      if (existingSub?.stripe_subscription_id && existingSub.tier !== 'free') {
        // UPGRADE/DOWNGRADE: Update existing subscription with proration
        try {
          // Get the current subscription to find the base tier item
         const subscription = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id, {
  expand: ['items.data.price'],  // ✅
});
          
          // Find the current base tier item
          const baseTierItem = subscription.items.data.find((item: any) => {
            const productName = (item.price?.product as any)?.name || '';
            return ['Beginner membership', 'Intermediate membership', 'Pro membership', 'Elite membership'].includes(productName);
          });
          
          if (!baseTierItem) {
            // No base tier found, create checkout for new subscription
            const session = await stripe.checkout.sessions.create({
              customer: customerId,
              mode: 'subscription',
              line_items: [{ price: priceId, quantity: 1 }],
              success_url: successUrl,
              cancel_url: cancelUrl,
              metadata: { userId, tier, type: 'base_tier' },
              subscription_data: {
                metadata: { userId, tier, type: 'base_tier' },
              },
            });
            return res.json({ url: session.url });
          }
          
          // Update the subscription item to the new price (with immediate billing)
          await stripe.subscriptions.update(existingSub.stripe_subscription_id, {
            items: [{
              id: baseTierItem.id,
              price: priceId,
            }],
            proration_behavior: 'always_invoice', // Create and pay invoice immediately
            payment_behavior: 'error_if_incomplete', // Fail if payment can't be collected
            metadata: { userId, tier, type: 'base_tier' },
          });
          
          // Update database
          await pool.query(
            `UPDATE crypto_subscriptions 
             SET tier = $1, updated_at = NOW()
             WHERE user_id = $2`,
            [tier, userId]
          );
          
          console.log(`✅ Upgraded user ${userId} from ${existingSub.tier} to ${tier}`);
          return res.json({ 
            success: true, 
            upgraded: true,
            message: `Successfully upgraded to ${tier.charAt(0).toUpperCase() + tier.slice(1)}! Proration applied.`,
            url: successUrl 
          });
        } catch (upgradeError: any) {
          console.error('Subscription upgrade error:', upgradeError);
          // Fallback to portal if upgrade fails
          const portal = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: successUrl,
          });
          return res.json({ url: portal.url });
        }
      }

      // Create new checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { userId, tier, type: 'base_tier' },
        subscription_data: {
          metadata: { userId, tier, type: 'base_tier' },
        },
      });

      return res.json({ url: session.url });
    }

    if (type === 'portal') {
      // Create customer portal session
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: successUrl,
      });

      return res.json({ url: portal.url });
    }

    return res.status(400).json({ error: 'Invalid checkout type' });

  } catch (error: any) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    // Always close the database connection
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        console.error('Error closing pool:', e);
      }
    }
  }
}
