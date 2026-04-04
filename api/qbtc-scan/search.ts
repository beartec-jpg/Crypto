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
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

    const isAddress = /^(qbtct1|qbtc1)/i.test(q);
    const isBlockHeight = /^\d+$/.test(q);
    const isHex64 = /^[a-fA-F0-9]{64}$/.test(q);

    if (isAddress) {
      let utxoSet: any = null;
      try {
        utxoSet = await rpcCall('scantxoutset', ['start', [`addr(${q})`]]);
      } catch {
        utxoSet = null;
      }

      return res.json({
        type: 'address',
        query: q,
        result: {
          address: q,
          balance: utxoSet?.total_amount ?? null,
          unspents: utxoSet?.unspents ?? [],
          txCount: utxoSet?.unspents?.length ?? 0,
          note: utxoSet ? undefined : 'Address scan limited: node may not support scantxoutset.',
        },
      });
    }

    if (isBlockHeight) {
      const height = Number(q);
      const hash = await rpcCall('getblockhash', [height]);
      const block = await rpcCall('getblock', [hash, 2]);
      return res.json({ type: 'block', query: q, result: block });
    }

    if (isHex64) {
      try {
        const block = await rpcCall('getblock', [q, 2]);
        return res.json({ type: 'block', query: q, result: block });
      } catch {
        // Not a block hash, try tx.
      }

      const tx = await rpcCall('getrawtransaction', [q, true]);
      return res.json({ type: 'transaction', query: q, result: tx });
    }

    return res.status(400).json({
      error: 'Unsupported query. Use QBTC address, block height, block hash, or txid.',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'QBTC scan search failed' });
  }
}
