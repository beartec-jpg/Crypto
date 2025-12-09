// Vercel serverless function for Stripe webhooks
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Disable body parsing to get raw body for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body as buffer
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

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
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;
  const pool = new (Pool as any)({ connectionString: process.env.DATABASE_URL });
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
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];
    
    let event;
    
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature as string,
          webhookSecret
        );
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        await pool.end();
        return res.status(400).json({ error: 'Webhook signature verification failed' });
      }
    } else {
      // In development, parse body directly
      event = JSON.parse(rawBody.toString());
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
          // Ensure crypto_users row exists first
          await pool.query(
            `INSERT INTO crypto_users (id, email) VALUES ($1, $2)
             ON CONFLICT (id) DO NOTHING`,
            [userId, session.customer_email || `${userId}@stripe.checkout`]
          );
          
          // Upsert subscription - create if not exists, update if exists
          await pool.query(
            `INSERT INTO crypto_subscriptions (user_id, tier, stripe_subscription_id, subscription_status)
             VALUES ($1, $2, $3, 'active')
             ON CONFLICT (user_id) DO UPDATE SET
               tier = $2,
               stripe_subscription_id = $3,
               subscription_status = 'active',
               updated_at = NOW()`,
            [userId, tier, subscriptionId]
          );
          console.log(`✅ Updated user ${userId} to tier: ${tier}`);
        } else if (type === 'elliott_addon') {
          // Get subscription item ID for Elliott by product name
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId as string, {
            expand: ['items.data.price.product'],
          });
          const elliottItem = stripeSub.items.data.find((item: any) => {
            const productName = (item.price?.product as any)?.name || '';
            return productName.toLowerCase().includes('elliot') || productName.toLowerCase().includes('elliott');
          });

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
        let userId = subscription.metadata?.userId;
        const customerId = subscription.customer;

        // If no userId in subscription metadata, look up by stripe_subscription_id
        if (!userId && subscription.id) {
          const lookup = await pool.query(
            `SELECT user_id FROM crypto_subscriptions WHERE stripe_subscription_id = $1`,
            [subscription.id]
          );
          if (lookup.rows.length > 0) {
            userId = lookup.rows[0].user_id;
          }
        }

        if (!userId) {
          console.log('⚠️ No userId found for subscription update, customer:', customerId);
          break;
        }

        // Map product names to tier values
        const productNameToTier: Record<string, string> = {
          'Beginner membership': 'beginner',
          'Intermediate membership': 'intermediate',
          'Pro membership': 'pro',
          'Elite membership': 'elite',
        };

        // Get tier from subscription metadata first, then from product names
        const items = subscription.items?.data || [];
        let tier = subscription.metadata?.tier;
        let elliottItem: any = null;
        
        // If no tier in subscription metadata, check product names
        if (!tier) {
          for (const item of items) {
            const productName = item.price?.product?.name || item.plan?.product?.name;
            
            // Check if this is Elliott Wave
            if (productName && (productName.toLowerCase().includes('elliot') || productName.toLowerCase().includes('elliott'))) {
              elliottItem = item;
              continue;
            }
            
            // Check for tier products
            if (productName && productNameToTier[productName]) {
              tier = productNameToTier[productName];
            }
          }
        }
        
        // Also check for Elliott if not found yet
        if (!elliottItem) {
          elliottItem = items.find((item: any) => {
            const productName = item.price?.product?.name || item.plan?.product?.name || '';
            return productName.toLowerCase().includes('elliot') || productName.toLowerCase().includes('elliott');
          });
        }

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
        console.log(`✅ Updated subscription for user ${userId}, status: ${subscription.status}`);
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
