import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Svix-signed webhook (used by Clerk). Signed content is
 * `${svix-id}.${svix-timestamp}.${body}`, HMAC-SHA256 with the base64 part of
 * the `whsec_...` secret. Header `svix-signature` holds space-separated
 * `v1,<base64>` entries; any match passes.
 */
export function verifySvixSignature(opts: {
  secret: string;
  id: string | undefined;
  timestamp: string | undefined;
  signatureHeader: string | undefined;
  body: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signatureHeader, body } = opts;
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    let given: Buffer;
    try { given = Buffer.from(sig, 'base64'); } catch { continue; }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export function signSvixForTest(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}
