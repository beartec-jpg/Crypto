// client/src/components/Wallet/WalletDashboard.tsx
// Dashboard showing balances, recent transactions, and quick actions

import { useState, useEffect } from 'react';
import { useBalance, useBlockNumber } from 'wagmi';
import { formatEther } from 'viem';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { 
  fetchAllBalances, 
  getCachedBalances,
  type ChainBalance,
  type Chain 
} from '@/lib/balanceService';
import { 
  fetchChainTransactions, 
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

  // Clean up old mock cache on mount
  useEffect(() => {
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('txs_') && !key.includes('cached')
    );
    
    keysToRemove.forEach(key => {
      console.log('🧹 Removing old cache:', key);
      localStorage.removeItem(key);
    });
  }, []);

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
      if (!sovereignWallet?.addresses) {
        console.log('⚠️ No sovereign wallet addresses');
        setChainBalances([]);
        setCurrentBalance(null);
        return;
      }

      setIsLoading(true);
      try {
        console.log('🔄 Fetching balances...');
        const balances = await fetchAllBalances(sovereignWallet.addresses);
        console.log('✅ Balances loaded:', balances);
        
        setChainBalances(balances);
        
        const current = balances.find(b => b.chain === selectedChain);
        setCurrentBalance(current || null);
      } catch (error) {
        console.error('❌ Failed to load balances:', error);
        setChainBalances([]);
        setCurrentBalance(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadBalances();
  }, [sovereignWallet, selectedChain]);

  // Refresh balances
  const handleRefresh = async () => {
    if (!sovereignWallet?.addresses) return;
    
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

  // Fetch real transactions - NO MOCK DATA
  useEffect(() => {
    const loadTransactions = async () => {
      if (!sovereignWallet?.addresses) {
        console.log('⚠️ No sovereign wallet - transactions cleared');
        setTransactions([]);
        return;
      }

      const currentAddress = sovereignWallet.addresses[selectedChain];
      if (!currentAddress) {
        console.log('⚠️ No address for chain:', selectedChain);
        setTransactions([]);
        return;
      }

      try {
        console.log(`🔍 Fetching transactions for ${selectedChain}: ${currentAddress}`);
        const txs = await fetchChainTransactions(selectedChain, currentAddress);
        console.log(`✅ Loaded ${txs.length} real transactions`);
        setTransactions(txs);
      } catch (error) {
        console.error('❌ Transaction fetch failed:', error);
        setTransactions([]);
      }
    };
    
    loadTransactions();
  }, [sovereignWallet, selectedChain, blockNumber]);

  // Format balance for display
  const formatBalance = (bal: string | undefined) => {
    if (!bal) return '0.000000';
    const num = parseFloat(bal);

