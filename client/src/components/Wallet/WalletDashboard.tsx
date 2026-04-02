// client/src/components/Wallet/WalletDashboard.tsx
// Dashboard showing balances with expandable token sections and portfolio summary

import { useState, useEffect } from 'react';
import { useBalance } from 'wagmi';
import { useUser } from '@clerk/clerk-react';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Clock, Loader2, Copy, Share2, ExternalLink, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  refreshXRPLTokenBalances,
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

// Chain badge configuration
const CHAIN_CONFIG: Record<Chain, { symbol: string; color: string; bgColor: string }> = {
  ethereum: { symbol: 'ETH', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  bitcoin: { symbol: 'BTC', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  bsc: { symbol: 'BNB', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  xrp: { symbol: 'XRP', color: 'text-gray-300', bgColor: 'bg-gray-500/20' },
  solana: { symbol: 'SOL', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  qbtc: { symbol: 'QBTC', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
};

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
  const { toast } = useToast();
  
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);
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
    qbtc: false,
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
      
      // Refresh XRPL token balances (trust lines)
      if (sovereignWallet.addresses.xrp) {
        const result = await refreshXRPLTokenBalances(
          sovereignWallet.id,
          sovereignWallet.addresses.xrp
        );
        if (result.success) {
          // Reload tokens to show updated balances
          const updatedTokens = await getWalletTokens(sovereignWallet.id);
          setTokens(updatedTokens);
          
          toast({
            title: "XRPL Tokens Refreshed",
            description: "Token balances updated from ledger",
          });
        } else if (result.error) {
          console.error('Failed to refresh XRPL tokens:', result.error);
          toast({
            title: 'XRPL Refresh Warning',
            description: result.error,
            variant: 'destructive',
          });
        }
      }
      
      const block = await fetchBlockNumber(selectedChain);
      setBlockNumber(block);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch transactions from ALL chains
  useEffect(() => {
    const loadTransactions = async () => {
      if (!sovereignWallet?.addresses) {
        setAllTransactions([]);
        return;
      }

      try {
        const chains: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana', 'qbtc'];
        
        // Fetch from all chains in parallel
        const transactionPromises = chains.map(async (chain) => {
          const address = sovereignWallet.addresses[chain];
          if (!address) return [];
          
          try {
            return await fetchChainTransactions(chain, address);
          } catch (error) {
            console.error(`Failed to fetch ${chain} transactions:`, error);
            return [];
          }
        });

        const allChainTransactions = await Promise.all(transactionPromises);
        
        // Flatten and sort by timestamp (newest first)
        const combinedTransactions = allChainTransactions
          .flat()
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        setAllTransactions(combinedTransactions);
      } catch (error) {
        console.error('Transaction fetch failed:', error);
        setAllTransactions([]);
      }
    };
    
    loadTransactions();
  }, [sovereignWallet, blockNumber]);

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
    if (!sovereignWallet?.id) {
      toast({
        title: "Error",
        description: "No wallet found",
        variant: "destructive",
      });
      throw new Error('No wallet found');
    }

    const password = prompt('Enter your wallet password to set trustline:');
    if (!password) {
      toast({
        title: "Cancelled",
        description: "Password required to set trustline",
      });
      throw new Error('Password required');
    }

    try {
      // Pass walletId and password - setXRPLTrustline handles key derivation internally
      const result = await setXRPLTrustline(sovereignWallet.id, password, currency, issuer);
      
      if (!result.success) {
        toast({
          title: "Trustline Failed",
          description: result.error || 'Failed to set trustline',
          variant: "destructive",
        });
        throw new Error(result.error || 'Failed to set trustline');
      }
      
      toast({
        title: "Trustline Created",
        description: `Successfully added ${currency} token`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Unknown error',
        variant: "destructive",
      });
      throw error;
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

  // Helper function to get block explorer URL
  const getExplorerUrl = (chain: Chain, hash: string): string => {
    const explorers: Record<Chain, string> = {
      ethereum: `https://etherscan.io/tx/${hash}`,
      bitcoin: `https://mempool.space/tx/${hash}`,
      bsc: `https://bscscan.com/tx/${hash}`,
      xrp: `https://xrpscan.com/tx/${hash}`,
      solana: `https://solscan.io/tx/${hash}`,
      qbtc: `http://localhost:28332/tx/${hash}`,
    };
    return explorers[chain];
  };

  // Handle copy transaction details
  const handleCopyTransaction = async (tx: Transaction) => {
    const details = `Transaction Details:
Type: ${tx.type}
Amount: ${tx.amount} ${tx.token || CHAIN_CONFIG[tx.chain].symbol}
Chain: ${CHAIN_CONFIG[tx.chain].symbol}
Hash: ${tx.hash}
Date: ${new Date(tx.timestamp).toLocaleString()}
From: ${tx.from}
To: ${tx.to}`;

    try {
      await navigator.clipboard.writeText(details);
      setCopiedTxHash(tx.hash);
      setTimeout(() => setCopiedTxHash(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Handle share transaction
  const handleShareTransaction = async (tx: Transaction) => {
    const details = `${tx.type === 'send' ? 'Sent' : 'Received'} ${tx.amount} ${tx.token || CHAIN_CONFIG[tx.chain].symbol} on ${CHAIN_CONFIG[tx.chain].symbol}\nTx: ${getExplorerUrl(tx.chain, tx.hash)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Transaction Details',
          text: details,
        });
      } catch (error) {
        // User cancelled or share failed, fallback to copy
        await handleCopyTransaction(tx);
      }
    } else {
      // Fallback to copy if share API not available
      await handleCopyTransaction(tx);
    }
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

            {/* QuantumBTC (no tokens) */}
            <ChainSection
              chain="qbtc"
              nativeBalance={getChainBalance('qbtc')?.balance || '0'}
              nativeUsdValue={getChainBalance('qbtc')?.usdValue}
              nativePriceChange24h={getChainBalance('qbtc')?.priceChange24h}
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
            {allTransactions.length === 0 ? (
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
                {allTransactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.hash}
                    className="group flex flex-col md:flex-row md:items-center md:justify-between p-3 rounded-lg bg-gray-900/50 hover:bg-gray-900 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 mb-2 md:mb-0">
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
                      
                      {/* Chain Badge */}
                      <div className={`px-2 py-1 rounded text-xs font-medium ${CHAIN_CONFIG[tx.chain].bgColor} ${CHAIN_CONFIG[tx.chain].color}`}>
                        {CHAIN_CONFIG[tx.chain].symbol}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium capitalize">{tx.type}</p>
                        <p className="text-sm text-gray-400 truncate">
                          {new Date(tx.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:gap-2">
                      {/* Amount */}
                      <div className="text-left md:text-right md:mr-2">
                        <p className="font-mono font-medium">
                          {tx.type === 'send' ? '-' : '+'}
                          {tx.amount} {tx.token || CHAIN_CONFIG[tx.chain].symbol}
                        </p>
                        {tx.status === 'confirmed' && (
                          <p className="text-xs text-green-400">Confirmed</p>
                        )}
                      </div>

                      {/* Action Buttons - Always visible on mobile, hover on desktop */}
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {/* Copy Button */}
                        <button
                          onClick={() => handleCopyTransaction(tx)}
                          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
                          title="Copy transaction details"
                        >
                          {copiedTxHash === tx.hash ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>

                        {/* Share Button */}
                        <button
                          onClick={() => handleShareTransaction(tx)}
                          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
                          title="Share transaction"
                        >
                          <Share2 className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* Explorer Link */}
                        <a
                          href={getExplorerUrl(tx.chain, tx.hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-gray-700 transition-colors"
                          title="View on block explorer"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </a>
                      </div>
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
