// client/src/components/wallet/WalletDashboard.tsx
// Dashboard showing balances, recent transactions, and quick actions

import { useState, useEffect } from 'react';
import { useBalance, useBlockNumber } from 'wagmi';
import { formatEther } from 'viem';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Clock } from 'lucide-react';

interface Transaction {
  hash: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  to: string;
  from: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  // Placeholder for future AI categorization via xAI API
  category?: string;
}

interface WalletDashboardProps {
  address: `0x${string}` | undefined;
  balance: ReturnType<typeof useBalance>['data'];
  hideBalances: boolean;
  selectedChain: 'ethereum' | 'solana';
}

export default function WalletDashboard({
  address,
  balance,
  hideBalances,
  selectedChain,
}: WalletDashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);

  const { data: blockNumber } = useBlockNumber({ watch: true });

  // Simulated balance for Solana (in production, use @solana/web3.js)
  const solanaBalance = '2.5';

  // Fetch transactions (placeholder - integrate with Covalent/Moralis API)
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!address) return;
      setIsLoading(true);

      try {
        // In production, call Covalent or Moralis API here
        // const response = await fetch(`https://api.covalenthq.com/v1/eth-sepolia/address/${address}/transactions_v2/?key=${API_KEY}`);
        
        // Simulated transactions for demo
        const mockTxs: Transaction[] = [
          {
            hash: '0x1234...5678',
            type: 'receive',
            amount: '0.5',
            token: 'ETH',
            to: address,
            from: '0xabcd...efgh',
            timestamp: new Date(Date.now() - 3600000),
            status: 'confirmed',
            // TODO: Auto-categorize using xAI API
            // category: await categorizeTransaction(tx)
          },
          {
            hash: '0x8765...4321',
            type: 'send',
            amount: '0.1',
            token: 'ETH',
            to: '0x9876...5432',
            from: address,
            timestamp: new Date(Date.now() - 7200000),
            status: 'confirmed',
          },
        ];

        // Cache locally for offline access (PWA support)
        localStorage.setItem(`txs_${address}`, JSON.stringify(mockTxs));
        setTransactions(mockTxs);
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
        // Try loading from cache
        const cached = localStorage.getItem(`txs_${address}`);
        if (cached) {
          setTransactions(JSON.parse(cached));
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [address, blockNumber]);

  // Subscribe to pending transactions (optimistic UI)
  useEffect(() => {
    const storedPending = localStorage.getItem(`pending_txs_${address}`);
    if (storedPending) {
      setPendingTxs(JSON.parse(storedPending));
    }
  }, [address]);

  const formatBalance = (value: string) => {
    if (hideBalances) return '••••••';
    return parseFloat(value).toFixed(4);
  };

  const currentBalance = selectedChain === 'ethereum' 
    ? balance ? formatEther(balance.value) : '0'
    : solanaBalance;

  const currentSymbol = selectedChain === 'ethereum' ? 'ETH' : 'SOL';

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-emerald-900/50 to-cyan-900/50 rounded-2xl p-6 border border-emerald-700/30">
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-400">Total Balance</span>
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">
            {formatBalance(currentBalance)}
          </span>
          <span className="text-xl text-gray-400">{currentSymbol}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-emerald-400 text-sm">
          <TrendingUp className="w-4 h-4" />
          <span>+2.5% (24h)</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900/50 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-1">Network</p>
          <p className="font-medium">
            {selectedChain === 'ethereum' ? 'Sepolia Testnet' : 'Solana Devnet'}
          </p>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-1">Block</p>
          <p className="font-medium font-mono">
            {blockNumber?.toString() || '—'}
          </p>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-1">Security</p>
          <p className="font-medium text-emerald-400">Quantum-Ready</p>
        </div>
      </div>

      {/* Pending Transactions (Optimistic UI) */}
      {pendingTxs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            Pending Transactions
          </h3>
          {pendingTxs.map((tx) => (
            <div
              key={tx.hash}
              className="flex items-center justify-between p-4 rounded-xl bg-amber-900/20 border border-amber-700/30 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-medium">Sending {tx.amount} {tx.token}</p>
                  <p className="text-sm text-gray-400">To: {tx.to.slice(0, 10)}...</p>
                </div>
              </div>
              <span className="text-amber-400 text-sm">Confirming...</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Transactions */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium">Recent Transactions</h3>
        
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-700/50 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No transactions yet</p>
            <p className="text-sm mt-1">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.hash}
                className="flex items-center justify-between p-4 rounded-xl bg-gray-900/50 hover:bg-gray-900/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'receive'
                        ? 'bg-emerald-600/20'
                        : 'bg-red-600/20'
                    }`}
                  >
                    {tx.type === 'receive' ? (
                      <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {tx.type === 'receive' ? 'Received' : 'Sent'} {tx.amount} {tx.token}
                    </p>
                    <p className="text-sm text-gray-400">
                      {tx.type === 'receive'
                        ? `From: ${tx.from.slice(0, 10)}...`
                        : `To: ${tx.to.slice(0, 10)}...`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-medium ${
                      tx.type === 'receive' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {tx.type === 'receive' ? '+' : '-'}
                    {hideBalances ? '••••' : tx.amount} {tx.token}
                  </p>
                  <p className="text-sm text-gray-400">
                    {tx.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
