import type { VercelRequest, VercelResponse } from '@vercel/node';

function resolveRpcConfig() {
  return {
    rpcUrl: process.env.QBTC_RPC_URL || '',
    rpcUser: process.env.QBTC_RPC_USER || '',
    rpcPass: process.env.QBTC_RPC_PASSWORD || '',
  };
}

async function rpcCall(method: string, params: any[] = []) {
  const { rpcUrl, rpcUser, rpcPass } = resolveRpcConfig();
  if (!rpcUrl) throw new Error('QBTC_RPC_URL is not configured.');

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();
  if (data?.error) throw new Error(data.error.message || 'QBTC RPC error');
  return data?.result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [blockchainInfo, mempoolInfo, netHashPs] = await Promise.all([
      rpcCall('getblockchaininfo'),
      rpcCall('getmempoolinfo'),
      rpcCall('getnetworkhashps'),
    ]);

    return res.json({
      selectedNetwork: 'testnet',
      mainnetActive: false,
      network: blockchainInfo?.chain || 'qbtc-testnet',
      blocks: blockchainInfo?.blocks ?? null,
      headers: blockchainInfo?.headers ?? null,
      difficulty: blockchainInfo?.difficulty ?? null,
      verificationProgress: blockchainInfo?.verificationprogress ?? null,
      mempoolTx: mempoolInfo?.size ?? 0,
      mempoolBytes: mempoolInfo?.bytes ?? 0,
      networkHashPs: netHashPs ?? 0,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch QBTC scan stats' });
  }
}
