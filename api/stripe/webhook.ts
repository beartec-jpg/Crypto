// Vercel serverless function for Stripe webhooks
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple Stripe client using environment variable
async function getStripeClient() {
  const Stripe = (await import('stripe')).default;
  
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  return {
    stripe: new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    }),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  };
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
    const { stripe, webhookSecret } = await getStripeClient();
    const pool = await getDb();

    // Get raw body for signature verification
    const signature = req.headers['stripe-signature'];
    
    let event;
    
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          webhookSecret
        );
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        await pool.end();
        return res.status(400).json({ error: 'Webhook signature verification failed' });
      }
    } else {
      // In development, parse body directly
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    console.log(`📩 Stripe webhook: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const type = session.metadata?.type;
        const tier = session.metadata?.tier;
        const subscriptionId = session.subscription;

        if (!userId) {
          console.log('⚠️ No userId in session metadata');
          break;
        }

        if (type === 'base_tier' && tier) {
          // Update user's base tier
          await pool.query(
            `UPDATE crypto_subscriptions 
             SET tier = $1, stripe_subscription_id = $2, subscription_status = 'active', updated_at = NOW()
             WHERE user_id = $3`,
            [tier, subscriptionId, userId]
          );
          console.log(`✅ Updated user ${userId} to tier: ${tier}`);
        } else if (type === 'elliott_addon') {
          // Get subscription item ID for Elliott
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId as string);
          const elliottItem = stripeSub.items.data.find((item: any) => 
            item.price.metadata?.tier === 'elliott_addon'
          );

          await pool.query(
            `UPDATE crypto_subscriptions 
             SET has_elliott_addon = true, elliott_stripe_item_id = $1, 
                 stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW()
             WHERE user_id = $3`,
            [elliottItem?.id, subscriptionId, userId]
          );
          console.log(`✅ Added Elliott Wave addon for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (!userId) break;

        const tier = subscription.metadata?.tier;
        const items = subscription.items.data;

        // Check for Elliott addon
        const elliottItem = items.find((item: any) => 
          item.price.metadata?.tier === 'elliott_addon'
        );

        await pool.query(
          `UPDATE crypto_subscriptions 
           SET tier = COALESCE($1, tier), 
               has_elliott_addon = $2,
               elliott_stripe_item_id = $3,
               subscription_status = $4,
               updated_at = NOW()
           WHERE user_id = $5`,
          [
            tier || null,
            !!elliottItem,
            elliottItem?.id || null,
            subscription.status,
            userId
          ]
        );
        console.log(`✅ Updated subscription for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (!userId) break;

        // Reset to free tier
        await pool.query(
          `UPDATE crypto_subscriptions 
           SET tier = 'free', has_elliott_addon = false, 
               stripe_subscription_id = NULL, elliott_stripe_item_id = NULL,
               subscription_status = 'canceled', updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
        console.log(`⚠️ Subscription canceled for user ${userId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Find user by customer ID and mark as past_due
        await pool.query(
          `UPDATE crypto_subscriptions cs
           SET subscription_status = 'past_due', updated_at = NOW()
           FROM crypto_users cu
           WHERE cu.id = cs.user_id AND cu.stripe_customer_id = $1`,
          [customerId]
        );
        console.log(`⚠️ Payment failed for customer ${customerId}`);
        break;
      }
    }

    await pool.end();
    return res.json({ received: true });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Disable body parsing for webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
