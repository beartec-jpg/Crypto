import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpcCallPinned } from '../qbtc/rpcFailover';

const CLAIM_AMOUNT = 0.5;
const RATE_LIMIT_MS = 60 * 60 * 1000;
const claims = new Map<string, number>();

function isValidAddress(address: string): boolean {
  return /^qbtct1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38,}$/.test(address.toLowerCase());
}

function getClientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff)) return xff[0];
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { address } = req.body || {};

    if (!address || typeof address !== 'string' || !isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid QBTC testnet address. Expected qbtct1... format.',
      });
    }

    const clientIp = getClientIp(req);
    const now = Date.now();
    const lastClaimAt = claims.get(clientIp) || 0;
    const nextClaimAt = lastClaimAt + RATE_LIMIT_MS;

    if (now < nextClaimAt) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. You can claim once per hour.',
        nextClaimAt,
      });
    }

    const faucetWallet = process.env.QBTC_FAUCET_WALLET || 'miner';
    // sendtoaddress is a write operation — always route to the faucet node (S1).
    // QBTC_FAUCET_NODE should be set to the URL of the node that holds the faucet wallet.
    const faucetNodeUrl = process.env.QBTC_FAUCET_NODE || undefined;

    const { result: txid } = await rpcCallPinned(
      faucetNodeUrl,
      'sendtoaddress',
      [address, CLAIM_AMOUNT],
      faucetWallet,
    );
    claims.set(clientIp, now);

    return res.json({
      success: true,
      txid,
      amount: CLAIM_AMOUNT,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Faucet request failed',
    });
  }
}