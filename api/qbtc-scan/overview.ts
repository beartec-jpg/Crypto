import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpcCall as rpcCallFailover } from '../_lib/rpcFailover.js';

async function rpcCall(method: string, params: any[] = []) {
  const { result } = await rpcCallFailover(method, params);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const blockCount = await rpcCall('getblockcount');

    const latestHeights = Array.from({ length: 10 }, (_, i) => blockCount - i).filter((h) => h >= 0);
    const latestBlocks = await Promise.all(
      latestHeights.map(async (height) => {
        const hash = await rpcCall('getblockhash', [height]);
        const block = await rpcCall('getblock', [hash, 2]);
        return {
          height,
          hash,
          time: block?.time,
          txCount: Array.isArray(block?.tx) ? block.tx.length : 0,
          size: block?.size,
          weight: block?.weight,
          difficulty: block?.difficulty,
        };
      })
    );

    let mempoolTxids: string[] = [];
    try {
      const mp = await rpcCall('getrawmempool', [false]);
      if (Array.isArray(mp)) mempoolTxids = mp.slice(0, 20);
    } catch {
      mempoolTxids = [];
    }

    return res.json({
      selectedNetwork: 'testnet',
      mainnetActive: false,
      latestBlocks,
      latestMempoolTxids: mempoolTxids,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch QBTC overview' });
  }
}
