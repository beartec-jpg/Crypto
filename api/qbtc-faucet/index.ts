import type { VercelRequest, VercelResponse } from '@vercel/node';

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

async function rpcCall(method: string, params: any[] = [], wallet = '') {
  const rpcUrl = process.env.QBTC_RPC_URL || '';
  const rpcUser = process.env.QBTC_RPC_USER || '';
  const rpcPass = process.env.QBTC_RPC_PASSWORD || '';
  if (!rpcUrl) throw new Error('QBTC_RPC_URL is not configured.');

  const url = wallet ? `${rpcUrl.replace(/\/$/, '')}/wallet/${wallet}` : rpcUrl;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();
  if (data?.error) throw new Error(data.error.message || 'QBTC RPC error');
  return data?.result;
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

    const txid = await rpcCall('sendtoaddress', [address, CLAIM_AMOUNT], faucetWallet);
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