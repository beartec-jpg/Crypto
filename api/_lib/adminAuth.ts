import type { VercelRequest } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';

/** Same admin rule as api/crypto/admin-ai-usage.ts and server requireAdminAuth. */
export const ADMIN_EMAIL = 'beartec@beartec.uk';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email === ADMIN_EMAIL || email.endsWith('@beartec.uk');
}

/** Verify the Clerk Bearer token and return the user's primary email, or null. */
export async function verifyAuthEmail(req: VercelRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return null;
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(payload.sub);
    return user.emailAddresses[0]?.emailAddress || null;
  } catch {
    return null;
  }
}

export async function isAdminRequest(req: VercelRequest): Promise<boolean> {
  return isAdminEmail(await verifyAuthEmail(req));
}
