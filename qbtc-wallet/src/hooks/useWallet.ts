import { useState, useEffect, useCallback } from 'react';
import { getBalance, type UtxoEntry } from '../lib/rpc';

export function useWallet(address: string | null, network: 'testnet' | 'mainnet' = 'testnet') {
  const [balance, setBalance] = useState<number>(0);
  const [utxos, setUtxos] = useState<UtxoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getBalance(address, network);
      setBalance(result.balance);
      setUtxos(result.utxos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  }, [address, network]);

  useEffect(() => {
    refresh();
    // Poll every 30 seconds
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { balance, utxos, loading, error, refresh };
}
