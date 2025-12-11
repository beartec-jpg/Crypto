import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';

interface PriceData {
  symbol: string;
  price: number;
}

async function fetchPrices(symbols: string[]): Promise<PriceData[]> {
  const prices: PriceData[] = [];
  
  for (const symbol of symbols) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      
      if (data.price) {
        prices.push({
          symbol,
          price: parseFloat(data.price)
        });
      }
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
    }
  }
  
  return prices;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (optional security)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    console.log('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    // Get all horizontal line drawings with active alerts that haven't triggered
    const activeAlerts = await sql`
      SELECT * FROM chart_drawings 
      WHERE drawing_type = 'horizontal' 
      AND (style->>'alertActive')::boolean = true 
      AND ((style->>'alertTriggered')::boolean IS NULL OR (style->>'alertTriggered')::boolean = false)
    `;

    if (activeAlerts.length === 0) {
      console.log('No active horizontal line alerts to check');
      return res.status(200).json({ message: 'No alerts to check', checked: 0 });
    }

    console.log(`Checking ${activeAlerts.length} horizontal line alerts...`);

    // Get unique symbols
    const symbolSet = new Set(activeAlerts.map((d: any) => d.symbol));
    const symbols = Array.from(symbolSet) as string[];

    // Fetch current prices
    const prices = await fetchPrices(symbols);

    let alertsSent = 0;

    for (const drawing of activeAlerts) {
      const currentPrice = prices.find(p => p.symbol === drawing.symbol)?.price;
      if (!currentPrice) {
        console.log(`No price found for ${drawing.symbol}`);
        continue;
      }

      const linePrice = drawing.coordinates?.points?.[0]?.price;
      if (!linePrice) {
        console.log(`No line price found for drawing ${drawing.id}`);
        continue;
      }

      const currentStyle = drawing.style || {};
      const lastCheckedPrice = currentStyle.lastCheckedPrice;
      const lineName = currentStyle.label || 'H-Line';

      console.log(`🔍 H-Line: ${drawing.symbol} | Line: ${linePrice} | Current: ${currentPrice} | Last: ${lastCheckedPrice}`);

      // Check if price crossed the line
      let crossed = false;
      if (lastCheckedPrice !== null && lastCheckedPrice !== undefined && Number.isFinite(lastCheckedPrice)) {
        if (lastCheckedPrice < linePrice && currentPrice >= linePrice) {
          crossed = true;
          console.log(`📈 Cross UP detected: ${lastCheckedPrice} → ${currentPrice}`);
        }
        if (lastCheckedPrice > linePrice && currentPrice <= linePrice) {
          crossed = true;
          console.log(`📉 Cross DOWN detected: ${lastCheckedPrice} → ${currentPrice}`);
        }
      }

      if (crossed) {
        console.log(`✅ Alert triggered for ${lineName} at ${linePrice}`);
        
        // Send push notification
        await sendPushNotification(sql, drawing.user_id, {
          title: `📈 Price Crossing: ${drawing.symbol}`,
          body: `Price crossing '${lineName}' at $${linePrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
          tag: `hline-${drawing.id}`,
        });

        alertsSent++;

        // Mark as triggered
        await sql`
          UPDATE chart_drawings 
          SET style = ${JSON.stringify({
            ...currentStyle,
            alertTriggered: true,
            lastCheckedPrice: currentPrice,
          })},
          updated_at = NOW()
          WHERE id = ${drawing.id}
        `;
      } else {
        // Update last checked price
        await sql`
          UPDATE chart_drawings 
          SET style = ${JSON.stringify({
            ...currentStyle,
            lastCheckedPrice: currentPrice,
          })}
          WHERE id = ${drawing.id}
        `;
      }
    }

    return res.status(200).json({ 
      message: 'Alerts checked', 
      checked: activeAlerts.length,
      alertsSent 
    });
  } catch (error: any) {
    console.error('Error checking alerts:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendPushNotification(
  sql: any, 
  userId: string, 
  notification: { title: string; body: string; tag: string }
) {
  try {
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    const privateKey = process.env.PRIVATE_VAPID_KEY;

    if (!publicKey || !privateKey) {
      console.log('VAPID keys not configured');
      return;
    }

    webpush.setVapidDetails('mailto:support@beartec.uk', publicKey, privateKey);

    // Get user's push subscriptions
    const subscriptions = await sql`
      SELECT * FROM push_subscriptions WHERE user_id = ${userId}
    `;

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      icon: '/icon.png',
      badge: '/badge.png',
    });

    for (const sub of subscriptions) {
      try {
        const parsedSub = typeof sub.subscription === 'string' 
          ? JSON.parse(sub.subscription) 
          : sub.subscription;

        await webpush.sendNotification(parsedSub, payload);
        console.log(`✅ Push sent to subscription ${sub.id}`);
      } catch (error: any) {
        console.error(`Failed to send push to ${sub.id}:`, error.message);
        // If subscription is invalid, we could delete it here
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`Deleting invalid subscription ${sub.id}`);
          await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`;
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}
