import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

// Simple auth verification function
async function verifyAuth(req: VercelRequest): Promise<{ id: string; email: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?. startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token, {
      jwtKey: process.env.CLERK_JWT_VERIFICATION_KEY! ,
    });

    if (!payload. sub) return null;

    return {
      id: payload.sub,
      email: payload.email as string || payload.sub,
    };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res:  VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if this is development environment (no auth required)
  const isDevelopment = process.env.NODE_ENV !== 'production' || 
                       req.headers.host?. includes('localhost') ||
                       req.headers.host?.includes('replit');

  let userId: string;
  let userEmail: string;

  if (isDevelopment) {
    // For development, use a default user
    userId = 'dev-user';
    userEmail = 'dev@example.com';
  } else {
    // For production, require authentication
    const auth = await verifyAuth(req);
    if (!auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    userId = auth.id;
    userEmail = auth.email;
  }

  try {
    console.log(`🚀 Bootstrapping user: ${userEmail} (${userId})`);

    // For now, return a simple success response
    // You can integrate with your crypto subscription service later
    console.log(`✅ User bootstrapped: ${userEmail} - tier: free`);
    
    return res.json({ 
      success: true, 
      message: 'Account ready',
      tier: 'free',
      userId: userId
    });
  } catch (error: any) {
    console.error('❌ Error bootstrapping user:', error);
    res.status(500).json({ error: error.message });
  }
}
