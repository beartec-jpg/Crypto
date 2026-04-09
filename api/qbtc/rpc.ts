import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpcCall as rpcCallFailover } from './rpcFailover';

type QbtcNetwork = 'testnet' | 'mainnet';

const ALLOWED_METHODS = new Set([
  'scantxoutset',
  'getblockcount',
  'getblockchaininfo',
  'getrawtransaction',
  'sendrawtransaction',
  'getblock',
  'getblockhash',
  'gettxout',
  'getrawmempool',
]);

function parseNetwork(raw: unknown): QbtcNetwork {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function resolveMainnetConfig() {
  const active = process.env.QBTC_MAINNET_ACTIVE === 'true';
  if (!active) {
    const error = new Error('QBTC mainnet is not active yet. Switch to testnet.');
    (error as any).code = 'MAINNET_NOT_ACTIVE';
    throw error;
  }

  const rpcUrl = process.env.QBTC_MAINNET_RPC_URL || '';
  const rpcUser = process.env.QBTC_MAINNET_RPC_USER || '';
  const rpcPass = process.env.QBTC_MAINNET_RPC_PASSWORD || '';

  if (!rpcUrl) {
    const error = new Error('QBTC_MAINNET_RPC_URL is not configured.');
    (error as any).code = 'MAINNET_NOT_ACTIVE';
    throw error;
  }

  return { rpcUrl, rpcUser, rpcPass };
}

async function rpcCallMainnet(method: string, params: any[]): Promise<any> {
  const { rpcUrl, rpcUser, rpcPass } = resolveMainnetConfig();

  const payload = { jsonrpc: '2.0', id: Date.now(), method, params };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json() as any;
  if (data?.error) {
    const error = new Error(data.error.message || 'QBTC RPC error');
    (error as any).code = data.error.code;
    throw error;
  }

  return data?.result;
}

async function rpcCall(method: string, params: any[], network: QbtcNetwork): Promise<any> {
  if (network === 'mainnet') {
    return rpcCallMainnet(method, params);
  }
  const { result } = await rpcCallFailover(method, params);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { method, params = [], network: rawNetwork } = req.body || {};

  if (!method || typeof method !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid method' });
  }

  if (!ALLOWED_METHODS.has(method)) {
    return res.status(403).json({ error: `Method '${method}' is not allowed` });
  }

  const network = parseNetwork(rawNetwork);

  try {
    const result = await rpcCall(method, Array.isArray(params) ? params : [], network);
    return res.status(200).json({ result, error: null });
  } catch (error: any) {
    if (error?.code === 'MAINNET_NOT_ACTIVE') {
      return res.status(503).json({ result: null, error: { message: error.message, code: error.code } });
    }
    return res.status(502).json({ result: null, error: { message: error?.message || 'RPC call failed' } });
  }
}
