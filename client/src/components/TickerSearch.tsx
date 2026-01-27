import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TickerSearchProps {
  onAddTicker: (symbol: string) => void;
}

/**
 * Search bar component for finding and adding new tickers to the watchlist
 * Features:
 * - Search input to find tickers
 * - Add button to add ticker to favorites/watchlist
 * - Uses Binance exchange-info API
 */
export function TickerSearch({ onAddTicker }: TickerSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const handleAdd = () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Invalid ticker',
        description: 'Please enter a ticker symbol',
        variant: 'destructive',
      });
      return;
    }

    // Format the symbol (e.g., "BTC/USDT" or "btcusdt" -> "BTCUSDT")
    const formatted = searchQuery.toUpperCase().replace('/', '');
    
    // Validate format (should end with USDT for now)
    if (!formatted.endsWith('USDT')) {
      toast({
        title: 'Invalid ticker',
        description: 'Ticker must be a USDT pair (e.g., BTC/USDT)',
        variant: 'destructive',
      });
      return;
    }

    onAddTicker(formatted);
    setSearchQuery(''); // Clear input after adding
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  return (
    <div className="flex gap-2 w-full max-w-2xl">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search to add ticker... (e.g., BTC/USDT, ETH/USDT)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          className="pl-10"
        />
      </div>
      <Button onClick={handleAdd} size="default" className="gap-2">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  );
}
