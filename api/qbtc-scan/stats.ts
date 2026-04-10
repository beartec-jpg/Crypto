import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rpcCall as rpcCallFailover } from '../../lib/rpcFailover';

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
    const [blockchainInfo, mempoolInfo, netHashPs, networkInfo, connectionCount, uptimeResult, chainTxStats] = await Promise.all([
      rpcCall('getblockchaininfo'),
      rpcCall('getmempoolinfo'),
      rpcCall('getnetworkhashps'),
      rpcCall('getnetworkinfo').catch(() => null),
      rpcCall('getconnectioncount').catch(() => null),
      rpcCall('uptime').catch(() => null),
      rpcCall('getchaintxstats', [50]).catch(() => null),
    ]);

    // Derive per-block averages from getchaintxstats window
    const windowBlocks: number = chainTxStats?.window_block_count ?? 0;
    const avgTxsPerBlock: number | null =
      windowBlocks > 0 && chainTxStats?.window_tx_count != null
        ? chainTxStats.window_tx_count / windowBlocks
        : null;
    const avgBlockTime: number | null =
      windowBlocks > 0 && chainTxStats?.window_interval != null
        ? chainTxStats.window_interval / windowBlocks
        : null;

    // Best-effort average fee from most recent block
    let avgFee: number | null = null;
    try {
      if (blockchainInfo?.blocks > 0) {
        const blockStats = await rpcCall('getblockstats', [blockchainInfo.blocks, ['avgfee']]);
        avgFee = blockStats?.avgfee ?? null;
      }
    } catch {
      // Non-critical
    }

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

    // Get latest block timestamp for activity detection
    let lastBlockTime: number | null = null;
    try {
      if (blockchainInfo?.bestblockhash) {
        const tipBlock = await rpcCall('getblock', [blockchainInfo.bestblockhash, 1]);
        lastBlockTime = tipBlock?.time ?? null;
      }
    } catch {
      // Non-critical
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
      lastBlockTime,

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

      // Per-block averages (derived from getchaintxstats window)
      avgTxsPerBlock,
      avgBlockTime,
      avgFee,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch QBTC scan stats' });
  }
}
