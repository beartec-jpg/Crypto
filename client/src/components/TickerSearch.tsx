import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TickerSearchProps {
  onAddTicker: (symbol: string) => void;
  existingTickers?: string[];
}

/**
 * Search bar component for finding and adding new tickers to the watchlist
 * Features:
 * - Autocomplete dropdown showing matching tickers from Binance
 * - Validates against real Binance USDT pairs
 * - Prevents duplicate tickers
 */
export function TickerSearch({ onAddTicker, existingTickers = [] }: TickerSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [filteredTickers, setFilteredTickers] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch available tickers from Binance on mount
  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        const data = await response.json();
        
        // Filter for USDT pairs only and extract symbols
        const usdtPairs = data.symbols
          .filter((s: any) => s.symbol.endsWith('USDT') && s.status === 'TRADING')
          .map((s: any) => s.symbol);
        
        setAvailableTickers(usdtPairs);
      } catch (error) {
        console.error('Failed to fetch tickers:', error);
        toast({
          title: 'Error',
          description: 'Failed to load available tickers',
          variant: 'destructive',
        });
      }
    };

    fetchTickers();
  }, []);

  // Filter tickers based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTickers([]);
      setShowDropdown(false);
      return;
    }

    const query = searchQuery.toUpperCase().replace('/', '');
    const matches = availableTickers
      .filter(ticker => ticker.includes(query))
      .slice(0, 10); // Limit to 10 results

    setFilteredTickers(matches);
    setShowDropdown(matches.length > 0);
    setSelectedIndex(0);
  }, [searchQuery, availableTickers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = (ticker?: string) => {
    const symbolToAdd = ticker || searchQuery.toUpperCase().replace('/', '');
    
    if (!symbolToAdd.trim()) {
      toast({
        title: 'Invalid ticker',
        description: 'Please enter a ticker symbol',
        variant: 'destructive',
      });
      return;
    }

    // Check if ticker exists in available tickers
    if (!availableTickers.includes(symbolToAdd)) {
      toast({
        title: 'Invalid ticker',
        description: `${symbolToAdd} is not a valid Binance USDT pair`,
        variant: 'destructive',
      });
      return;
    }

    // Check if already in watchlist
    if (existingTickers.includes(symbolToAdd)) {
      toast({
        title: 'Already in watchlist',
        description: `${symbolToAdd} is already in your watchlist`,
        variant: 'destructive',
      });
      return;
    }

    onAddTicker(symbolToAdd);
    setSearchQuery('');
    setShowDropdown(false);
    
    toast({
      title: 'Ticker added',
      description: `${symbolToAdd} added to watchlist`,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && filteredTickers.length > 0) {
        handleAdd(filteredTickers[selectedIndex]);
      } else {
        handleAdd();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredTickers.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="flex gap-2 w-full max-w-2xl relative" ref={dropdownRef}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          type="text"
          placeholder="Search to add ticker... (e.g., BTC/USDT, ETH/USDT)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => filteredTickers.length > 0 && setShowDropdown(true)}
          className="pl-10"
        />
        
        {/* Autocomplete Dropdown */}
        {showDropdown && filteredTickers.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
            {filteredTickers.map((ticker, index) => (
              <button
                key={ticker}
                onClick={() => handleAdd(ticker)}
                className={`w-full px-4 py-2 text-left hover:bg-slate-700 transition-colors ${
                  index === selectedIndex ? 'bg-slate-700' : ''
                } ${index === 0 ? 'rounded-t-lg' : ''} ${
                  index === filteredTickers.length - 1 ? 'rounded-b-lg' : ''
                }`}
                type="button"
              >
                <span className="text-white font-medium">
                  {ticker.replace('USDT', '')}<span className="text-gray-400">/USDT</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <Button onClick={() => handleAdd()} size="default" className="gap-2">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  );
}
