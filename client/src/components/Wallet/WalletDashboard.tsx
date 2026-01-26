// client/src/components/Wallet/WalletDashboard.tsx
// Dashboard showing balances with expandable token sections and portfolio summary

import { useState, useEffect } from 'react';
import { useBalance } from 'wagmi';
import { useUser } from '@clerk/clerk-react';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { 
  fetchAllBalances, 
  fetchBlockNumber,
  type ChainBalance,
  type Chain 
} from '@/lib/balanceService';
import { 
  fetchChainTransactions, 
  type Transaction 
} from '@/lib/transactionService';
import { getCurrentWallet } from '@/lib/walletService';
import {
  getWalletTokens,
  updateTokenBalance,
  removeTokenFromWallet,
  autoDetectTokens,
  addTokenToWallet,
  type Token,
} from '@/lib/tokenService';
import { setXRPLTrustline, calculateXRPReserve } from '@/lib/xrpReserveService';
import PendingTransactionCard from './PendingTransactionCard';
import ChainSection from './ChainSection';
import AddTokenModal from './AddTokenModal';
import PortfolioSummary from './PortfolioSummary';
import type { PendingTransaction } from '@/hooks/usePendingTransactions';

interface WalletDashboardProps {
  address: `0x${string}` | undefined;
  balance: ReturnType<typeof useBalance>['data'];
  hideBalances: boolean;
  selectedChain: Chain;
  sovereignWallet?: any;
  pendingTransactions?: PendingTransaction[];
  onSelectToken?: (token: Token) => void;
  onRemovePendingTransaction?: (id: string) => void;
}

export default function WalletDashboard({
  address,
  balance,
  hideBalances,
  selectedChain,
  sovereignWallet,
  pendingTransactions = [],
  onSelectToken,
  onRemovePendingTransaction,
}: WalletDashboardProps) {
  const { user } = useUser();
  const userId = user?.id || '';
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);

  // Token management
  const [tokens, setTokens] = useState<Token[]>([]);
  const [expandedChains, setExpandedChains] = useState<Record<Chain, boolean>>({
    ethereum: true,
    bitcoin: false,
    bsc: false,
    xrp: false,
    solana: false,
  });
  const [addTokenChain, setAddTokenChain] = useState<Chain | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  // Load tokens on mount
  useEffect(() => {
    const loadTokens = async () => {
      if (!sovereignWallet?.id) return;
      
      try {
        const walletTokens = await getWalletTokens(sovereignWallet.id);
        setTokens(walletTokens);
      } catch (error) {
        console.error('Failed to load tokens:', error);
      }
    };

    loadTokens();
  }, [sovereignWallet?.id]);

  // Auto-detect tokens on first wallet load
  useEffect(() => {
    const autoDetect = async () => {
      if (!sovereignWallet?.addresses || isAutoDetecting) return;
      
      // Check if we've already auto-detected (check if we have any non-native tokens)
      const hasNonNativeTokens = tokens.some(t => !t.isNative);
      if (hasNonNativeTokens) return;

      setIsAutoDetecting(true);
      try {
        const detectedTokens = await autoDetectTokens(sovereignWallet.addresses);
        
        if (detectedTokens.length > 0) {
          // Merge with existing native tokens
          const allTokens = [...tokens, ...detectedTokens];
          setTokens(allTokens);
          
          // Save to storage
          const { saveWalletTokens } = await import('@/lib/tokenService');
          await saveWalletTokens(sovereignWallet.id, allTokens);
        }
      } catch (error) {
        console.error('Auto-detect tokens failed:', error);
      } finally {
        setIsAutoDetecting(false);
      }
    };

    autoDetect();
  }, [sovereignWallet?.addresses, sovereignWallet?.id]);

  // Load balances
  useEffect(() => {
    const loadBalances = async () => {
      if (!sovereignWallet?.addresses) {
        setChainBalances([]);
        return;
      }

      setIsLoading(true);
      try {
        const balances = await fetchAllBalances(sovereignWallet.addresses);
        setChainBalances(balances);
        
        // Update native token balances
        balances.forEach(async (chainBal) => {
          const nativeToken = tokens.find(t => t.chain === chainBal.chain && t.isNative);
          if (nativeToken) {
            await updateTokenBalance(
              sovereignWallet.id,
              nativeToken.id,
              chainBal.balance,
              chainBal.usdValue
            );
          }
        });
        
        const block = await fetchBlockNumber(selectedChain);
        setBlockNumber(block);
      } catch (error) {
        console.error('Balance fetch failed:', error);
        setChainBalances([]);
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
      
      // Update token balances
      balances.forEach(async (chainBal) => {
        const nativeToken = tokens.find(t => t.chain === chainBal.chain && t.isNative);
        if (nativeToken) {
          await updateTokenBalance(
            sovereignWallet.id,
            nativeToken.id,
            chainBal.balance,
            chainBal.usdValue
          );
        }
      });
      
      const block = await fetchBlockNumber(selectedChain);
      setBlockNumber(block);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch transactions
  useEffect(() => {
    const loadTransactions = async () => {
      if (!sovereignWallet?.addresses) {
        setTransactions([]);
        return;
      }

      const currentAddress = sovereignWallet.addresses[selectedChain];
      if (!currentAddress) {
        setTransactions([]);
        return;
      }

      try {
        const txs = await fetchChainTransactions(selectedChain, currentAddress);
        setTransactions(txs);
      } catch (error) {
        console.error('Transaction fetch failed:', error);
        setTransactions([]);
      }
    };
    
    loadTransactions();
  }, [sovereignWallet, selectedChain, blockNumber]);

  // Toggle chain expansion
  const toggleChainExpansion = (chain: Chain) => {
    setExpandedChains(prev => ({
      ...prev,
      [chain]: !prev[chain],
    }));
  };

  // Handle add token
  const handleAddToken = async (chain: Chain, tokenData: Partial<Token>) => {
    try {
      const newToken: Token = {
        id: tokenData.id!,
        chain: tokenData.chain!,
        standard: tokenData.standard!,
        symbol: tokenData.symbol!,
        name: tokenData.name!,
        decimals: tokenData.decimals!,
        balance: '0',
        isVisible: true,
        isNative: false,
        addedAt: new Date(),
        ...tokenData,
      };

      await addTokenToWallet(sovereignWallet.id, newToken);
      
      // Update local state
      setTokens(prev => [...prev, newToken]);
      setAddTokenChain(null);
    } catch (error: any) {
      console.error('Failed to add token:', error);
      throw error;
    }
  };

  // Handle XRPL trustline
  const handleSetTrustline = async (currency: string, issuer: string) => {
    if (!sovereignWallet?.id) throw new Error('No wallet found');

    // Get private key (need to unlock wallet)
    const { unlockWallet } = await import('@/lib/walletService');
    const password = prompt('Enter your wallet password to set trustline:');
    if (!password) throw new Error('Password required');

    const unlockedWallet = await unlockWallet(sovereignWallet.id, password);
    const xrpPrivateKey = unlockedWallet.privateKeys.xrp;

    if (!xrpPrivateKey) throw new Error('XRP private key not found');

    const result = await setXRPLTrustline(xrpPrivateKey, currency, issuer);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to set trustline');
    }
  };

  // Handle remove token
  const handleRemoveToken = async (tokenId: string) => {
    try {
      await removeTokenFromWallet(sovereignWallet.id, tokenId);
      setTokens(prev => prev.filter(t => t.id !== tokenId));
    } catch (error) {
      console.error('Failed to remove token:', error);
    }
  };

  // Handle token selection (for sending)
  const handleSelectToken = (token: Token) => {
    if (onSelectToken) {
      onSelectToken(token);
    }
  };

  // Get tokens for each chain
  const getChainTokens = (chain: Chain) => {
    return tokens.filter(t => t.chain === chain && !t.isNative && t.isVisible);
  };

  // Get chain balance
  const getChainBalance = (chain: Chain) => {
    return chainBalances.find(b => b.chain === chain);
  };

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Portfolio</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="text-sm">Refresh</span>
        </button>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* Portfolio Summary - NEW - Positioned above token table */}
          <PortfolioSummary
            chainBalances={chainBalances}
            tokens={tokens}
            hideBalances={hideBalances}
          />

          {/* Chain Sections with Tokens */}
          <div className="space-y-3">
            {/* Ethereum */}
            <ChainSection
              chain="ethereum"
              nativeBalance={getChainBalance('ethereum')?.balance || '0'}
              nativeUsdValue={getChainBalance('ethereum')?.usdValue}
              nativePriceChange24h={getChainBalance('ethereum')?.priceChange24h}
              tokens={getChainTokens('ethereum')}
              isExpanded={expandedChains.ethereum}
              hideBalances={hideBalances}
              onToggleExpand={() => toggleChainExpansion('ethereum')}
              onAddToken={() => setAddTokenChain('ethereum')}
              onSelectToken={handleSelectToken}
              onRemoveToken={handleRemoveToken}
            />

            {/* BSC */}
            <ChainSection
              chain="bsc"
              nativeBalance={getChainBalance('bsc')?.balance || '0'}
              nativeUsdValue={getChainBalance('bsc')?.usdValue}
              nativePriceChange24h={getChainBalance('bsc')?.priceChange24h}
              tokens={getChainTokens('bsc')}
              isExpanded={expandedChains.bsc}
              hideBalances={hideBalances}
              onToggleExpand={() => toggleChainExpansion('bsc')}
              onAddToken={() => setAddTokenChain('bsc')}
              onSelectToken={handleSelectToken}
              onRemoveToken={handleRemoveToken}
            />

            {/* XRP */}
            <ChainSection
              chain="xrp"
              nativeBalance={getChainBalance('xrp')?.balance || '0'}
              nativeUsdValue={getChainBalance('xrp')?.usdValue}
              nativePriceChange24h={getChainBalance('xrp')?.priceChange24h}
              tokens={getChainTokens('xrp')}
              isExpanded={expandedChains.xrp}
              hideBalances={hideBalances}
              onToggleExpand={() => toggleChainExpansion('xrp')}
              onAddToken={() => setAddTokenChain('xrp')}
              onSelectToken={handleSelectToken}
              onRemoveToken={handleRemoveToken}
            />

            {/* Solana */}
            <ChainSection
              chain="solana"
              nativeBalance={getChainBalance('solana')?.balance || '0'}
              nativeUsdValue={getChainBalance('solana')?.usdValue}
              nativePriceChange24h={getChainBalance('solana')?.priceChange24h}
              tokens={getChainTokens('solana')}
              isExpanded={expandedChains.solana}
              hideBalances={hideBalances}
              onToggleExpand={() => toggleChainExpansion('solana')}
              onAddToken={() => setAddTokenChain('solana')}
              onSelectToken={handleSelectToken}
              onRemoveToken={handleRemoveToken}
            />

            {/* Bitcoin (no tokens) */}
            <ChainSection
              chain="bitcoin"
              nativeBalance={getChainBalance('bitcoin')?.balance || '0'}
              nativeUsdValue={getChainBalance('bitcoin')?.usdValue}
              nativePriceChange24h={getChainBalance('bitcoin')?.priceChange24h}
              tokens={[]}
              isExpanded={false}
              hideBalances={hideBalances}
              onToggleExpand={() => {}}
              onAddToken={() => {}}
              onSelectToken={handleSelectToken}
              onRemoveToken={handleRemoveToken}
            />
          </div>

          {/* Recent Transactions */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
            
            {/* Pending Transactions */}
            {pendingTransactions.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-medium text-gray-400">Pending</h4>
                {pendingTransactions.map((tx) => (
                  <PendingTransactionCard 
                    key={tx.hash} 
                    transaction={tx}
                    onRemove={onRemovePendingTransaction}
                  />
                ))}
              </div>
            )}

            {/* Confirmed Transactions */}
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No recent transactions</p>
                <p className="text-sm mt-1">Your transaction history will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingTransactions.length > 0 && (
                  <h4 className="text-sm font-medium text-gray-400 mt-4">Confirmed</h4>
                )}
                {transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50 hover:bg-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${
                          tx.type === 'send'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {tx.type === 'send' ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{tx.type}</p>
                        <p className="text-sm text-gray-400">
                          {new Date(tx.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-medium">
                        {tx.type === 'send' ? '-' : '+'}
                        {tx.amount} {tx.asset}
                      </p>
                      {tx.status === 'confirmed' && (
                        <p className="text-xs text-green-400">Confirmed</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Token Modal */}
      {addTokenChain && sovereignWallet && (
        <AddTokenModal
          chain={addTokenChain}
          walletAddress={sovereignWallet.addresses[addTokenChain]}
          onClose={() => setAddTokenChain(null)}
          onAdd={(tokenData) => handleAddToken(addTokenChain, tokenData)}
          onSetTrustline={addTokenChain === 'xrp' ? handleSetTrustline : undefined}
        />
      )}
    </div>
  );
}
