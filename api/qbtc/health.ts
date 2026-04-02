import type { VercelRequest, VercelResponse } from '@vercel/node';

type QbtcNetwork = 'testnet' | 'mainnet';

function parseNetwork(raw: unknown): QbtcNetwork {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function resolveRpcConfig(network: QbtcNetwork) {
  if (network === 'mainnet') {
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

  return {
    rpcUrl: process.env.QBTC_RPC_URL || '',
    rpcUser: process.env.QBTC_RPC_USER || '',
    rpcPass: process.env.QBTC_RPC_PASSWORD || '',
  };
}

async function rpcCall(method: string, params: any[], network: QbtcNetwork) {
  const { rpcUrl, rpcUser, rpcPass } = resolveRpcConfig(network);
  if (!rpcUrl) {
    throw new Error('QBTC_RPC_URL is not configured.');
  }

  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();
  if (data?.error) {
    const error = new Error(data.error.message || 'QBTC RPC error');
    (error as any).code = data.error.code;
    throw error;
  }

  return data?.result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const network = parseNetwork(req.query.network);
    const info = await rpcCall('getblockchaininfo', [], network);

    return res.status(200).json({
      ok: true,
      selectedNetwork: network,
      mainnetActive: network === 'mainnet',
      chain: info?.chain || null,
      blocks: info?.blocks ?? null,
      headers: info?.headers ?? null,
      verificationProgress: info?.verificationprogress ?? null,
      dagmode: info?.dagmode ?? null,
      pqc: info?.pqc ?? null,
    });
  } catch (error: any) {
    if (error?.code === 'MAINNET_NOT_ACTIVE') {
      return res.status(503).json({
        ok: false,
        selectedNetwork: 'mainnet',
        mainnetActive: false,
        error: error.message,
      });
    }

    return res.status(502).json({
      ok: false,
      error: error?.message || 'Failed to reach QBTC RPC node',
    });
  }
}
