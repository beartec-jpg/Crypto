// client/src/lib/balanceService.ts
// Multi-chain balance fetching service with mainnet/testnet support

import axios from 'axios';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export interface ChainBalance {
  chain: Chain;
  balance: string;
  usdValue?: number;
  usdPrice?: number;
  priceChange24h?: number;
}

interface CoinGeckoPrices {
  ethereum: { usd: number; usd_24h_change: number };
  bitcoin: { usd: number; usd_24h_change: number };
  binancecoin: { usd: number; usd_24h_change: number };
  ripple: { usd: number; usd_24h_change: number };
  solana: { usd: number; usd_24h_change: number };
}

/**
 * Fetch current prices from CoinGecko
 */
export async function fetchPrices(): Promise<CoinGeckoPrices> {
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'ethereum,bitcoin,binancecoin,ripple,solana',
          vs_currencies: 'usd',
          include_24hr_change: 'true',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    // Return fallback prices
    return {
      ethereum: { usd: 2000, usd_24h_change: 0 },
      bitcoin: { usd: 40000, usd_24h_change: 0 },
      binancecoin: { usd: 300, usd_24h_change: 0 },
      ripple: { usd: 0.5, usd_24h_change: 0 },
      solana: { usd: 100, usd_24h_change: 0 },
    };
  }
}

/**
 * Fetch Ethereum balance via Etherscan API
 */
export async function fetchEthereumBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.etherscan.io/api'      // Mainnet
      : 'https://api-sepolia.etherscan.io/api'; // Sepolia Testnet (default)
    
    console.log(`🔍 Fetching ETH balance from ${useMainnet ? 'MAINNET' : 'SEPOLIA TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
      },
    });

    console.log('📦 ETH API Response:', response.data);

    if (response.data.status === '1') {
      const balanceWei = response.data.result;
      const balanceEth = parseFloat(balanceWei) / 1e18;
      console.log('✅ ETH Balance:', balanceEth, 'ETH');
      return balanceEth.toFixed(6);
    }
    
    console.warn('⚠️ ETH account not found or no balance');
    return '0';
  } catch (error) {
    console.error('❌ Failed to fetch Ethereum balance:', error);
    return '0';
  }
}

/**
 * Fetch Bitcoin balance via Blockstream API
 */
export async function fetchBit*

