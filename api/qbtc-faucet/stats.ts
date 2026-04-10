import type { VercelRequest, VercelResponse } from '@vercel/node';

async function rpcCall(method: string, params: any[] = []) {
  const { rpcCall: rpcCallFailover } = await import('../_lib/rpcFailover.js');
  const { result } = await rpcCallFailover(method, params);
  return result;
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