import { useState, useEffect, useCallback } from 'react';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const formatTickerDisplay = (ticker: string) => {
  return ticker.replace('USDT', '/USDT');
};

export function useWatchlistState() {
  const { toast } = useToast();
  
  // Watchlist management - synced to database
  const { data: watchlistData, refetch: refetchWatchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      console.log('📥 Fetching watchlist from API');
      const response = await authenticatedApiRequest('GET', '/api/crypto/watchlist');
      const data = await response.json();
      console.log('✅ Watchlist loaded:', data);
      return data;
    },
    staleTime: Infinity,
  });

  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);

  // Sync watchlist from API to local state
  useEffect(() => {
    if (watchlistData?.tickers) {
      setWatchlistTickers(watchlistData.tickers);
    }
  }, [watchlistData]);

  // Save watchlist mutation
  const saveWatchlistMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      console.log('💾 Saving watchlist:', tickers);
      const response = await authenticatedApiRequest('POST', '/api/crypto/watchlist', { tickers });
      const data = await response.json();
      console.log('✅ Watchlist saved:', data);
      return data;
    },
    onSuccess: () => {
      console.log('♻️ Refetching watchlist');
      refetchWatchlist();
    },
    onError: (error) => {
      console.error('❌ Failed to save watchlist:', error);
      toast({
        title: 'Failed to save',
        description: 'Could not save watchlist to account',
        variant: 'destructive',
      });
    },
  });

  const handleAddTicker = useCallback((ticker: string, onSuccess?: (ticker: string) => void) => {
    if (!watchlistTickers.includes(ticker)) {
      const newTickers = [...watchlistTickers, ticker];
      setWatchlistTickers(newTickers);
      saveWatchlistMutation.mutate(newTickers);
      if (onSuccess) {
        onSuccess(ticker);
      }
      toast({
        title: 'Ticker added',
        description: `${formatTickerDisplay(ticker)} has been added to your watchlist`,
      });
    } else {
      toast({
        title: 'Already in watchlist',
        description: `${formatTickerDisplay(ticker)} is already in your watchlist`,
        variant: 'destructive',
      });
    }
  }, [watchlistTickers, toast, saveWatchlistMutation]);

  const handleRemoveTicker = useCallback((ticker: string, currentSymbol?: string, onSymbolChange?: (newSymbol: string) => void) => {
    const filtered = watchlistTickers.filter(t => t !== ticker);
    setWatchlistTickers(filtered);
    saveWatchlistMutation.mutate(filtered);
    if (currentSymbol === ticker && filtered.length > 0 && onSymbolChange) {
      const currentIndex = watchlistTickers.indexOf(ticker);
      const nextIndex = currentIndex < filtered.length ? currentIndex : currentIndex - 1;
      onSymbolChange(filtered[nextIndex]);
    }
    toast({
      title: 'Ticker removed',
      description: `${formatTickerDisplay(ticker)} has been removed from your watchlist`,
    });
  }, [watchlistTickers, toast, saveWatchlistMutation]);

  return {
    watchlistTickers,
    setWatchlistTickers,
    handleAddTicker,
    handleRemoveTicker,
    refetchWatchlist
  };
}
