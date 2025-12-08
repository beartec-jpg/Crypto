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

    // Handle different checkout types
    if (type === 'base_tier' && tier) {
      // Get price ID for the tier
      const products = await stripe.products.search({
        query: `metadata['tier']:'${tier}'`,
      });

      if (products.data.length === 0) {
        return res.status(400).json({ error: `No product found for tier: ${tier}` });
      }

      const prices = await stripe.prices.list({
        product: products.data[0].id,
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
        // Use customer portal to manage existing subscription
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: successUrl,
        });
        return res.json({ url: portal.url });
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

    if (type === 'elliott_addon') {
      // Get Elliott addon price
      const products = await stripe.products.search({
        query: `metadata['tier']:'elliott_addon'`,
      });

      if (products.data.length === 0) {
        return res.status(400).json({ error: 'Elliott Wave add-on product not found' });
      }

      const prices = await stripe.prices.list({
        product: products.data[0].id,
        active: true,
      });

      if (prices.data.length === 0) {
        return res.status(400).json({ error: 'Elliott Wave add-on price not found' });
      }

      const priceId = prices.data[0].id;

      // Check if user already has Elliott addon
      const subResult = await pool.query(
        'SELECT has_elliott_addon, stripe_subscription_id FROM crypto_subscriptions WHERE user_id = $1',
        [userId]
      );

      const existingSub = subResult.rows[0];

      if (existingSub?.has_elliott_addon) {
        return res.status(400).json({ error: 'Already subscribed to Elliott Wave add-on' });
      }

      // If user has existing subscription, add Elliott as additional item
      if (existingSub?.stripe_subscription_id) {
        const subscriptionItem = await stripe.subscriptionItems.create({
          subscription: existingSub.stripe_subscription_id,
          price: priceId,
          metadata: { userId, type: 'elliott_addon' },
        });

        // Update database
        await pool.query(
          `UPDATE crypto_subscriptions 
           SET has_elliott_addon = true, elliott_stripe_item_id = $1, updated_at = NOW()
           WHERE user_id = $2`,
          [subscriptionItem.id, userId]
        );

        return res.json({ url: successUrl, added: true });
      }

      // Create new checkout session for Elliott only
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { userId, type: 'elliott_addon' },
        subscription_data: {
          metadata: { userId, type: 'elliott_addon' },
        },
      });

      return res.json({ url: session.url });
    }

    if (type === 'cancel_elliott' || action === 'cancel_elliott') {
      // Cancel Elliott addon
      const subResult = await pool.query(
        'SELECT elliott_stripe_item_id FROM crypto_subscriptions WHERE user_id = $1',
        [userId]
      );

      const elliottItemId = subResult.rows[0]?.elliott_stripe_item_id;

      if (elliottItemId) {
        await stripe.subscriptionItems.del(elliottItemId);
      }

      await pool.query(
        `UPDATE crypto_subscriptions 
         SET has_elliott_addon = false, elliott_stripe_item_id = NULL, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      return res.json({ success: true, message: 'Elliott Wave add-on canceled' });
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
