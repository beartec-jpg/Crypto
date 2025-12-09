import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, and } from 'drizzle-orm';

// Import schema directly to avoid path resolution issues
import { cryptoUsers, cryptoSubscriptions, elliottWaveLabels } from '../../../shared/schema';

// Create a new database connection for each request (serverless-compatible)
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  return { client, db: drizzle(client) };
}

// Initialize Clerk client
const clerkClient = createClerkClient({ 
  secretKey: process.env.CLERK_SECRET_KEY 
});

// Helper to get or create crypto user and get their subscription
async function getUserWithSubscription(db: ReturnType<typeof drizzle>, clerkUserId: string, email?: string) {
  // First try to find existing user by Clerk user ID (the correct way)
  let user = await db.select().from(cryptoUsers).where(eq(cryptoUsers.id, clerkUserId)).limit(1);
  
  // Fallback: try by email if not found by ID
  if (user.length === 0 && email) {
    user = await db.select().from(cryptoUsers).where(eq(cryptoUsers.email, email)).limit(1);
  }
  
  if (user.length === 0 && email) {
    // Create new user with Clerk user ID
    user = await db.insert(cryptoUsers).values({
      id: clerkUserId,
      email: email,
    }).returning();
  }
  
  if (user.length === 0) {
    return null;
  }
  
  // Get subscription using the user's ID
  const sub = await db.select().from(cryptoSubscriptions).where(eq(cryptoSubscriptions.userId, user[0].id)).limit(1);
  
  return {
    user: user[0],
    subscription: sub[0] || null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Create database connection for this request
  const { client, db } = getDb();
  
  try {
    // Connect to database
    await client.connect();
    
    // Authenticate user with Clerk
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    let clerkUserId: string;
    let userEmail = '';
    
    try {
      // Verify the session token
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = payload.sub;
      
      // Get user email from Clerk
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      userEmail = clerkUser.emailAddresses?.[0]?.emailAddress || '';
    } catch (e) {
      console.error('Auth verification failed:', e);
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found' });
    }

    // Get or create crypto user
    const userWithSub = await getUserWithSubscription(db, clerkUserId, userEmail);
    if (!userWithSub) {
      return res.status(500).json({ error: 'Failed to get user' });
    }
    
    const { user, subscription } = userWithSub;
    
    // Check if user has Elliott Wave access (elite tier or addon)
    const hasAccess = subscription?.tier === 'elite' || subscription?.hasElliottAddon;
    if (!hasAccess) {
      return res.status(403).json({ error: 'Elliott Wave features require Elite tier or Elliott Wave add-on' });
    }

    if (req.method === 'GET') {
      const { symbol, timeframe } = req.query;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'Symbol and timeframe are required' });
      }
      
      // Fetch labels from database
      const labels = await db.select().from(elliottWaveLabels).where(
        and(
          eq(elliottWaveLabels.userId, user.id),
          eq(elliottWaveLabels.symbol, symbol as string),
          eq(elliottWaveLabels.timeframe, timeframe as string)
        )
      );
      
      // Map field names for frontend compatibility
      const mappedLabels = labels.map(label => ({
        ...label,
        isComplete: label.isConfirmed,
        fibonacciMode: label.fibMode,
      }));
      
      return res.json(mappedLabels);
    }
    
    if (req.method === 'POST') {
      const { symbol, timeframe, degree, patternType, points, isComplete, fibonacciMode, validationResult, metadata } = req.body;
      
      if (!symbol || !timeframe || !degree || !patternType || !points) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Create new label - map field names to match schema
      const newLabel = await db.insert(elliottWaveLabels).values({
        userId: user.id,
        symbol,
        timeframe,
        degree,
        patternType,
        points,
        fibMode: fibonacciMode || 'measured',
        validationStatus: validationResult?.isValid !== false ? 'valid' : 'warning',
        validationErrors: validationResult?.errors || [],
        isAutoGenerated: false,
        isConfirmed: isComplete ?? false,
        metadata: metadata || null,
      }).returning();
      
      // Return with mapped field names for frontend compatibility
      const result = {
        ...newLabel[0],
        isComplete: newLabel[0].isConfirmed,
        fibonacciMode: newLabel[0].fibMode,
      };
      
      return res.json(result);
    }
    
    if (req.method === 'PATCH') {
      // Extract ID from URL path
      const urlParts = req.url?.split('/') || [];
      const id = urlParts[urlParts.length - 1]?.split('?')[0];
      
      if (!id) {
        return res.status(400).json({ error: 'Label ID required' });
      }
      
      // Verify ownership
      const existing = await db.select().from(elliottWaveLabels).where(eq(elliottWaveLabels.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Label not found' });
      }
      if (existing[0].userId !== user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Update label - map field names
      const { points, fibonacciMode, validationResult, isComplete, ...rest } = req.body;
      const updateData: any = { ...rest, updatedAt: new Date() };
      if (points !== undefined) updateData.points = points;
      if (fibonacciMode !== undefined) updateData.fibMode = fibonacciMode;
      if (isComplete !== undefined) updateData.isConfirmed = isComplete;
      if (validationResult !== undefined) {
        updateData.validationStatus = validationResult?.isValid !== false ? 'valid' : 'warning';
        updateData.validationErrors = validationResult?.errors || [];
      }
      
      const updated = await db.update(elliottWaveLabels)
        .set(updateData)
        .where(eq(elliottWaveLabels.id, id))
        .returning();
      
      return res.json(updated[0]);
    }
    
    if (req.method === 'DELETE') {
      // Extract ID from URL path
      const urlParts = req.url?.split('/') || [];
      const id = urlParts[urlParts.length - 1]?.split('?')[0];
      
      if (!id) {
        return res.status(400).json({ error: 'Label ID required' });
      }
      
      // Verify ownership
      const existing = await db.select().from(elliottWaveLabels).where(eq(elliottWaveLabels.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Label not found' });
      }
      if (existing[0].userId !== user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Delete label
      await db.delete(elliottWaveLabels).where(eq(elliottWaveLabels.id, id));
      
      return res.json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('Error with Elliott Wave labels:', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Always close the database connection
    try {
      await client.end();
    } catch (e) {
      console.error('Error closing db connection:', e);
    }
  }
}
