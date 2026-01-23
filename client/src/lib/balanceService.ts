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

interface Transaction {
  hash: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  to: string;
  from: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  chain: Chain;
  category?: string;
}

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

  // Fetch transactions (mock for now - integrate with block explorers later)
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!address && !sovereignWallet) return;

      try {
        // Mock transactions filtered by chain
        const mockTxs: Transaction[] = [
          {
            hash: '0x1234...5678',
            type: 'receive',
            amount: '0.5',
            token: 'ETH',
            to: address || sovereignWallet?.addresses.ethereum || '',
            from: '0xabcd...efgh',
            timestamp: new Date(Date.now() - 3600000),
            status: 'confirmed',
            chain: 'ethereum',
          },
          {
            hash: '0x8765...4321',
            type: 'send',
            amount: '0.1',
            token: 'ETH',
            to: '0x9876...5432',
            from: address || sovereignWallet?.addresses.ethereum || '',
            timestamp: new Date(Date.now() - 7200000),
            status: 'confirmed',
            chain: 'ethereum',
          },
        ];

        // Filter by selected chain
        const filtered = mockTxs.filter(tx => tx.chain === selectedChain);
        setTransactions(filtered);
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      }
    };

    fetchTransactions();
  }, [address, sovereignWallet, blockNumber, selectedChain]);

  // Format balance for display
  const formatBalance = (bal: string | undefined) => {
    if (!bal) return '0.000000';
    const num = parseFloat(bal);
    return num.toFixed(6);
  };

  // Get display balance
  const displayBalance = currentBalance?.balance || 
                        (balance ? formatEther(balance.value) : '0');

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-emerald-900/30 to-cyan-900/30 rounded-2xl p-6 border border-emerald-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm text-gray-400">Total Balance</h3>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p*

