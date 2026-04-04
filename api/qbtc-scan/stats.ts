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
    const [blockchainInfo, mempoolInfo, netHashPs, networkInfo, connectionCount, uptimeResult, chainTxStats] = await Promise.all([
      rpcCall('getblockchaininfo'),
      rpcCall('getmempoolinfo'),
      rpcCall('getnetworkhashps'),
      rpcCall('getnetworkinfo').catch(() => null),
      rpcCall('getconnectioncount').catch(() => null),
      rpcCall('uptime').catch(() => null),
      rpcCall('getchaintxstats', [50]).catch(() => null),
    ]);

    // gettxoutsetinfo can be slow — run separately with generous timeout
    let txOutSetInfo: any = null;
    try {
      txOutSetInfo = await rpcCall('gettxoutsetinfo');
    } catch {
      // Non-critical — return nulls for these fields
    }

    // Compute payments/sec from last 20 blocks (counts all vout entries)
    let paymentsPerSec: number | null = null;
    try {
      const height = blockchainInfo?.blocks;
      if (height && height >= 20) {
        const blockPromises = [];
        for (let i = 0; i < 20; i++) {
          blockPromises.push(
            rpcCall('getblockhash', [height - i])
              .then((hash: string) => rpcCall('getblock', [hash, 2]))
          );
        }
        const blocks = await Promise.all(blockPromises);

        let totalOutputs = 0;
        for (const block of blocks) {
          for (const tx of block.tx) {
            totalOutputs += tx.vout.length;
          }
        }

        const timeSpan = blocks[0].time - blocks[blocks.length - 1].time;
        if (timeSpan > 0) {
          paymentsPerSec = totalOutputs / timeSpan;
        }
      }
    } catch {
      // Fallback: estimate from txRate * avg outputs per tx
      if (chainTxStats?.txrate) {
        paymentsPerSec = chainTxStats.txrate * 3.5;
      }
    }

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

      // New: network health
      peers: connectionCount ?? null,
      uptime: uptimeResult ?? null,
      txCount: chainTxStats?.txcount ?? null,
      txRate: chainTxStats?.txrate ?? null,
      paymentsPerSec: paymentsPerSec,

      // New: chain info (from gettxoutsetinfo)
      circulatingSupply: txOutSetInfo?.total_amount ?? null,
      utxoCount: txOutSetInfo?.txouts ?? null,

      // New: protocol info (from getblockchaininfo)
      dagTips: blockchainInfo?.dag_tips ?? null,
      ghostdagK: blockchainInfo?.ghostdag_k ?? null,
      pqcActive: blockchainInfo?.pqc ?? null,
      dagMode: blockchainInfo?.dagmode ?? null,
      chainSizeBytes: blockchainInfo?.size_on_disk ?? null,
      chainwork: blockchainInfo?.chainwork ?? null,

      // New: node version (from getnetworkinfo)
      nodeVersion: networkInfo?.subversion ?? null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch QBTC scan stats' });
  }
}
