// client/src/components/Wallet/WalletDashboard.tsx
// Dashboard showing balances, recent transactions, and quick actions

import { useState, useEffect } from 'react';
import { useBalance, useBlockNumber } from 'wagmi';
import { formatEther } from 'viem';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { 
  fetchAllBalances, 
  fetchChainBalance, 
  fetchPrices,
  getCachedBalances,
  type ChainBalance,
  type Chain 
} from '@/lib/balanceService';
import { 
  fetchChainTransactions, 
  getCachedTransactions,
  type Transaction 
} from '@/lib/transactionService';

interface WalletDashboardProps {
  address: `0x${string}` | undefined;
  balance: ReturnType<typeof useBalance>['data'];
  hideBalances: boolean;
  selectedChain: Chain;
  sovereignWallet?: any;
}

export default function WalletDashboard({
  address,
  balance,
  hideBalances,
  selectedChain,
  sovereignWallet,
}: WalletDashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [currentBalance, setCurrentBalance] = useState<ChainBalance | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: blockNumber } = useBlockNumber({ watch: true });

    // ✅ CLEANUP USEEFFECT GOES HERE - RIGHT AFTER STATE
  useEffect(() => {
    // Remove old cache keys
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('txs_') && !key.includes('cached')
    );
    
    keysToRemove.forEach(key => {
      console.log('🧹 Removing old cache:', key);
      localStorage.removeItem(key);
    });
  }, []); // Only run once on mount

  // Debug logging
  useEffect(() => {
    console.log('🔍 Dashboard State:', {
      selectedChain,
      sovereignWallet: sovereignWallet ? 'EXISTS' : 'NULL',
      hasAddresses: !!sovereignWallet?.addresses,
      currentAddress: sovereignWallet?.addresses?.[selectedChain],
    });
  }, [sovereignWallet, selectedChain]);

  // Get chain config for display
  const getChainConfig = (chain: Chain) => {
    switch (chain) {
      case 'ethereum':
        return { name: 'Ethereum Sepolia', symbol: 'ETH', color: 'text-blue-400' };
      case 'bitcoin':
        return { name: 'Bitcoin Mainnet', symbol: 'BTC', color: 'text-orange-400' };
      case 'bsc':
        return { name: 'BSC Testnet', symbol: 'BNB', color: 'text-yellow-400' };
      case 'xrp':
        return { name: 'XRP Ledger', symbol: 'XRP', color: 'text-gray-400' };
      case 'solana':
        return { name: 'Solana Devnet', symbol: 'SOL', color: 'text-purple-400' };
    }
  };

  const chainConfig = getChainConfig(selectedChain);

  // Fetch all balances for sovereign wallet
  useEffect(() => {
    const loadBalances = async () => {
      if (!sovereignWallet) return;

      setIsLoading(true);
      try {
        // Try cache first
        const cached = getCachedBalances();
        if (cached) {
          setChainBalances(cached);
          const current = cached.find(b => b.chain === selectedChain);
          setCurrentBalance(current || null);
        }

        // Fetch fresh data
        const balances = await fetchAllBalances(sovereignWallet.addresses);
        setChainBalances(balances);
        
        const current = balances.find(b => b.chain === selectedChain);
        setCurrentBalance(current || null);
      } catch (error) {
        console.error('Failed to load balances:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBalances();
  }, [sovereignWallet, selectedChain]);

  // Refresh balances
  const handleRefresh = async () => {
    if (!sovereignWallet) return;
    
    setIsRefreshing(true);
    try {
      const balances = await fetchAllBalances(sovereignWallet.addresses);
      setChainBalances(balances);
      
      const current = balances.find(b => b.chain === selectedChain);
      setCurrentBalance(current || null);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

 // Fetch real transactions
useEffect(() => {
  const loadTransactions = async () => {
    if (!sovereignWallet) {
      setTransactions([]); // Empty if no wallet
      console.log('⚠️ No sovereign wallet - transactions cleared');
      return;
    }

    try {
      const currentAddress = sovereignWallet.addresses[selectedChain];
      if (!currentAddress) {
        console.log('⚠️ No address for chain:', selectedChain);
        setTransactions([]);
        return;
      }

      console.log(`🔍 Fetching transactions for ${selectedChain}: ${currentAddress}`);
      const txs = await fetchChainTransactions(selectedChain, currentAddress);
      console.log(`✅ Loaded ${txs.length} real transactions`);
      setTransactions(txs);
    } catch (error) {
      console.error('❌ Transaction fetch failed:', error);
      setTransactions([]); // EMPTY on error, no mock data
    }
  };
  
    loadTransactions();
  }, [sovereignWallet, selectedChain, blockNumber]);

  // Format balance for display
  const formatBalance = (bal: string | undefined) => {
    if (!bal) return '0.000000';
    const num = parseFloat(bal);
    return num.toFixed(6);
  };

  // Get display balance - ONLY from real API data
const displayBalance = currentBalance?.balance || '0';

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-emerald-900/30 to-cyan-900/30 rounded-2xl p-6 border border-emerald-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm text-gray-400">Total Balance</h3>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="mb-2">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-2xl text-gray-400">Loading...</span>
            </div>
          ) : (
            <p className={`text-4xl font-bold ${hideBalances ? 'blur-sm select-none' : ''}`}>
              {hideBalances ? '••••••' : formatBalance(displayBalance)} {chainConfig.symbol}
            </p>
          )}
        </div>

        {currentBalance?.usdValue !== undefined && !hideBalances && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">
              ≈ ${currentBalance.usdValue.toFixed(2)} USD
            </span>
            <div className="flex items-center gap-1 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
              <span>+2.5% (24h)</span>
            </div>
          </div>
        )}

        {currentBalance?.usdPrice && !hideBalances && (
          <div className="mt-2 text-xs text-gray-500">
            1 {chainConfig.symbol} = ${currentBalance.usdPrice.toFixed(2)}
          </div>
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Network</p>
          <p className="font-medium text-sm">{chainConfig.name}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Block</p>
          <p className="font-medium text-sm">{blockNumber?.toString() || '—'}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Security</p>
          <p className="font-medium text-sm text-emerald-400">Quantum-Ready</p>
        </div>
      </div>

      {/* All Chain Balances (if sovereign wallet) */}
      {sovereignWallet && chainBalances.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3 text-gray-300">All Chain Balances</h3>
          <div className="space-y-2">
            {chainBalances.map((bal) => {
              const config = getChainConfig(bal.chain);
              return (
                <div
                  key={bal.chain}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    bal.chain === selectedChain ? 'bg-emerald-900/20' : 'hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-')}`} />
                    <span className="text-sm">{config.symbol}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {hideBalances ? '••••' : formatBalance(bal.balance)}
                    </p>
                    {bal.usdValue !== undefined && !hideBalances && (
                      <p className="text-xs text-gray-500">${bal.usdValue.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Recent Transactions</h3>
          <button className="text-sm text-cyan-400 hover:underline">View All</button>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No transactions yet on {chainConfig.name}</p>
            <p className="text-sm mt-1">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.hash}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50 hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'receive'
                        ? 'bg-emerald-900/30 text-emerald-400'
                        : 'bg-red-900/30 text-red-400'
                    }`}
                  >
                    {tx.type === 'receive' ? (
                      <ArrowDownLeft className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {tx.type === 'receive' ? 'Received' : 'Sent'} {tx.amount} {tx.token}
                    </p>
                    <p className="text-sm text-gray-400 truncate max-w-[200px]">
                      {tx.type === 'receive' ? 'From' : 'To'}: {tx.type === 'receive' ? tx.from : tx.to}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${tx.type === 'receive' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {tx.type === 'receive' ? '+' : '-'}{hideBalances ? '••••' : tx.amount} {tx.token}
                  </p>
                  <p className="text-xs text-gray-500">
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
