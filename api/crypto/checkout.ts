// Vercel serverless function for Stripe checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inline Stripe client for Vercel (can't import from server/)
async function getStripeClient() {
  const Stripe = (await import('stripe')).default;
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Replit token not found');
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.secret) {
    throw new Error('Stripe connection not found');
  }

  return new Stripe(connectionSettings.settings.secret, {
    apiVersion: '2023-10-16',
  });
}

// Database connection for Vercel
async function getDb() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email, tier, type, action } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'userId and email required' });
    }

    const stripe = await getStripeClient();
    const pool = await getDb();

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
    const baseUrl = req.headers.origin || 
      (process.env.REPLIT_DEPLOYMENT === '1' 
        ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0]}`
        : `https://${process.env.REPLIT_DEV_DOMAIN}`);

    const successUrl = `${baseUrl}/cryptosubscribe?success=true`;
    const cancelUrl = `${baseUrl}/cryptosubscribe?canceled=true`;

    // Handle different checkout types
    if (type === 'base_tier' && tier) {
      // Get price ID for the tier
      const products = await stripe.products.search({
        query: `metadata['tier']:'${tier}'`,
      });

      if (products.data.length === 0) {
        await pool.end();
        return res.status(400).json({ error: `No product found for tier: ${tier}` });
      }

      const prices = await stripe.prices.list({
        product: products.data[0].id,
        active: true,
      });

      if (prices.data.length === 0) {
        await pool.end();
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
        await pool.end();
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

      await pool.end();
      return res.json({ url: session.url });
    }

    if (type === 'elliott_addon') {
      // Get Elliott addon price
      const products = await stripe.products.search({
        query: `metadata['tier']:'elliott_addon'`,
      });

      if (products.data.length === 0) {
        await pool.end();
        return res.status(400).json({ error: 'Elliott Wave add-on product not found' });
      }

      const prices = await stripe.prices.list({
        product: products.data[0].id,
        active: true,
      });

      if (prices.data.length === 0) {
        await pool.end();
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
        await pool.end();
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

        await pool.end();
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

      await pool.end();
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

      await pool.end();
      return res.json({ success: true, message: 'Elliott Wave add-on canceled' });
    }

    if (type === 'portal') {
      // Create customer portal session
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: successUrl,
      });

      await pool.end();
      return res.json({ url: portal.url });
    }

    await pool.end();
    return res.status(400).json({ error: 'Invalid checkout type' });

  } catch (error: any) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message });
  }
}
