/**
 * Thin RPC proxy wrapper — all calls go through the existing /api/qbtc/rpc endpoint.
 */

export interface RpcResult {
  result: unknown;
  error?: { code: number; message: string };
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch('/api/qbtc/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = (await response.json()) as RpcResult;
  if (data.error) {
    throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
  }
  return data.result;
}

export interface UtxoEntry {
  txid: string;
  vout: number;
  amount: number;   // in BTC/qBTC units
  height: number;
}

/**
 * Get UTXOs for a qBTC address using scantxoutset.
 * Returns array of UTXOs and total balance in qBTC.
 */
export async function getBalance(
  address: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<{ balance: number; utxos: UtxoEntry[] }> {
  const descriptor = `addr(${address})`;
  const result = (await rpcCall('scantxoutset', ['start', [descriptor]])) as {
    total_amount?: number;
    unspents?: Array<{ txid: string; vout: number; amount: number; height: number }>;
  };

  const utxos: UtxoEntry[] = (result.unspents ?? []).map(u => ({
    txid: u.txid,
    vout: u.vout,
    amount: u.amount,
    height: u.height,
  }));

  return { balance: result.total_amount ?? 0, utxos };
}

/**
 * Broadcast a signed raw transaction.
 */
export async function broadcastTransaction(rawTxHex: string): Promise<string> {
  const txid = await rpcCall('sendrawtransaction', [rawTxHex]) as string;
  return txid;
}

/**
 * Get the current estimated fee rate (sat/vbyte).
 */
export async function estimateFeeRate(targetBlocks = 6): Promise<number> {
  try {
    const result = (await rpcCall('estimatesmartfee', [targetBlocks])) as {
      feerate?: number;
    };
    if (result.feerate) {
      // feerate is in BTC/kB, convert to sat/vbyte
      return Math.ceil(result.feerate * 1e8 / 1000);
    }
  } catch {
    // ignore; fall through to default
  }
  return 5; // default 5 sat/vbyte
}
