// client/src/lib/priceService.ts
// Price fetching service for cryptocurrency prices

import axios from 'axios';

const COINGECKO_IDS: Record<string, string> = {
  ethereum: 'ethereum',
  bitcoin: 'bitcoin',
  bsc: 'binancecoin',
  xrp: 'ripple',
  solana: 'solana',
};

interface PriceCache {
  price: number;
  timestamp: number;
}

let priceCache: Record<string, PriceCache> = {};
const CACHE_DURATION = 60000; // 1 minute

/**
 * Get cryptocurrency price in USD
 * @param chain - The chain/cryptocurrency to get price for
 * @returns Price in USD, or 0 if unavailable
 */
export async function getPrice(chain: string): Promise<number> {
  const cached = priceCache[chain];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }
  
  try {
    const coinId = COINGECKO_IDS[chain];
    if (!coinId) {
      console.warn(`No CoinGecko ID for chain: ${chain}`);
      return 0;
    }
    
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    
    const price = response.data[coinId]?.usd || 0;
    priceCache[chain] = { price, timestamp: Date.now() };
    return price;
  } catch (error) {
    console.warn('Failed to fetch price:', error);
    return cached?.price || 0;
  }
}

/**
 * Format a number as USD currency
 * @param amount - The amount to format
 * @returns Formatted USD string (e.g., "$1,234.56")
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get balance with USD value
 * @param chain - The chain to get balance for
 * @param address - The address to check
 * @returns Object with balance and USD value
 */
export async function getBalanceWithUsd(
  chain: string,
  balance: string
): Promise<{ balance: string; balanceUsd: number }> {
  const price = await getPrice(chain);
  const balanceUsd = parseFloat(balance) * price;
  return { balance, balanceUsd };
}
