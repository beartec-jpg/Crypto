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

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (_req.method === 'OPTIONS') return res.status(200).end();
  if (_req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [blockHeight, blockchainInfo, pqcInfo] = await Promise.all([
      rpcCall('getblockcount'),
      rpcCall('getblockchaininfo'),
      rpcCall('getpqcinfo').catch(() => null),
    ]);

    return res.status(200).json({
      network: blockchainInfo?.chain || 'qbtc-testnet',
      blockHeight,
      difficulty: blockchainInfo?.difficulty ?? null,
      pqc: pqcInfo
        ? {
            enabled: pqcInfo.pqc_enabled ?? false,
            mode: pqcInfo.pqc_mode ?? 'unknown',
            algorithm: pqcInfo.pqc_algorithm ?? 'ML-DSA-44',
          }
        : { enabled: true, mode: 'hybrid', algorithm: 'ML-DSA-44' },
      dag: {
        ghostdagK: 18,
        blockTargetSeconds: 1,
        mergeSetSize: null,
        parentCount: null,
      },
    });
  } catch (error: any) {
    return res.status(200).json({
      network: 'qbtc-testnet',
      blockHeight: null,
      difficulty: null,
      pqc: { enabled: true, mode: 'hybrid', algorithm: 'ML-DSA-44' },
      dag: { ghostdagK: 18, blockTargetSeconds: 1, mergeSetSize: null, parentCount: null },
      warning: error?.message || 'Unable to fetch QBTC faucet stats',
    });
  }
}