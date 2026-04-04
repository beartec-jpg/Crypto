import type { VercelRequest, VercelResponse } from '@vercel/node';

async function rpcCall(method: string, params: any[] = []) {
  const rpcUrl = process.env.QBTC_RPC_URL || '';
  const rpcUser = process.env.QBTC_RPC_USER || '';
  const rpcPass = process.env.QBTC_RPC_PASSWORD || '';
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
