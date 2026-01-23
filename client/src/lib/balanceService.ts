// client/src/lib/balanceService.ts
// Multi-chain balance fetching service

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export interface ChainBalance {
  chain: Chain;
  balance: string;
  symbol: string;
  usdPrice?: number;
  usdValue?: number;
  isLoading: boolean;
  error?: string;
}

// CoinGecko API for prices
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';

const COINGECKO_IDS: Record<Chain, string> = {
  ethereum: 'ethereum',
  bitcoin: 'bitcoin',
  bsc: 'binancecoin',
  xrp: 'ripple',
  solana: 'solana',
};

/**
 * Fetch prices for all chains from CoinGecko
 */
export async function fetchPrices(): Promise<Record<Chain, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const response = await axios.get(COINGECKO_API, {
      params: {
        ids,
        vs_currencies: 'usd',
      },
    });

    return {
      ethereum: response.data.ethereum?.usd || 0,
      bitcoin: response.data.bitcoin?.usd || 0,
      bsc: response.data.binancecoin?.usd || 0,
      xrp: response.data.ripple?.usd || 0,
      solana: response.data.solana?.usd || 0,
    };
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return {
      ethereum: 0,
      bitcoin: 0,
      bsc: 0,
      xrp: 0,
      solana: 0,
    };
  }
}

/**
 * Fetch Bitcoin balance via Blockstream API (mainnet)
 */
export async function fetchBitcoinBalance(address: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}`
    );
    
    const balanceSats = response.data.chain_stats.funded_txo_sum - 
                        response.data.chain_stats.spent_txo_sum;
    const balanceBTC = balanceSats / 100000000; // Convert satoshis to BTC
    
    return balanceBTC.toFixed(8);
  } catch (error) {
    console.error('Bitcoin balance fetch failed:', error);
    return '0';
  }
}

/**
 * Fetch XRP balance via public XRPL node
 */
export async function fetchXRPBalance(address: string): Promise<string> {
  try {
    const response = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [
        {
          account: address,
          ledger_index: 'validated',
        },
      ],
    });

    if (response.data.result?.account_data?.Balance) {
      const balanceDrops = parseInt(response.data.result.account_data.Balance);
      const balanceXRP = balanceDrops / 1000000; // Convert drops to XRP
      return balanceXRP.toFixed(6);
    }
    
    return '0';
  } catch (error) {
    // Account might not be activated (requires 10 XRP reserve)
    console.error('XRP balance fetch failed:', error);
    return '0';
  }
}

/**
 * Fetch Solana balance via @solana/web3.js (devnet)
 */
export async function fetchSolanaBalance(address: string): Promise<string> {
  try {
    // Use devnet for testing (change to mainnet-beta for production)
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    
    return (balance / LAMPORTS_PER_SOL).toFixed(6);
  } catch (error) {
    console.error('Solana balance fetch failed:', error);
    return '0';
  }
}

/**
 * Fetch Ethereum balance (uses Wagmi hook instead, but here for completeness)
 */
export async function fetchEthereumBalance(address: string): Promise<string> {
  try {
    // Use public Sepolia RPC
    const response = await axios.post(
      'https://rpc.sepolia.org',
      {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }
    );

    if (response.data.result) {
      const balanceWei = BigInt(response.data.result);
      const balanceEth = Number(balanceWei) / 1e18;
      return balanceEth.toFixed(6);
    }
    
    return '0';
  } catch (error) {
    console.error('Ethereum balance fetch failed:', error);
    return '0';
  }
}

/**
 * Fetch BSC balance (similar to Ethereum)
 */
export async function fetchBSCBalance(address: string): Promise<string> {
  try {
    // Use BSC testnet RPC
    const response = await axios.post(
      'https://data-seed-prebsc-1-s1.binance.org:8545',
      {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }
    );

    if (response.data.result) {
      const balanceWei = BigInt(response.data.result);
      const balanceBNB = Number(balanceWei) / 1e18;
      return balanceBNB.toFixed(6);
    }
    
    return '0';
  } catch (error) {
    console.error('BSC balance fetch failed:', error);
    return '0';
  }
}

/**
 * Fetch balance for specific chain
 */
export async function fetchChainBalance(
  chain: Chain,
  address: string
): Promise<string> {
  switch (chain) {
    case 'ethereum':
      return fetchEthereumBalance(address);
    case 'bitcoin':
      return fetchBitcoinBalance(address);
    case 'bsc':
      return fetchBSCBalance(address);
    case 'xrp':
      return fetchXRPBalance(address);
    case 'solana':
      return fetchSolanaBalance(address);
    default:
      return '0';
  }
}

/**
 * Fetch all balances for multi-chain wallet
 */
export async function fetchAllBalances(addresses: {
  ethereum: string;
  bitcoin: string;
  bsc: string;
  xrp: string;
  solana: string;
}): Promise<ChainBalance[]> {
  try {
    // Fetch prices first
    const prices = await fetchPrices();

    // Fetch all balances in parallel
    const [ethBalance, btcBalance, bscBalance, xrpBalance, solBalance] = 
      await Promise.all([
        fetchEthereumBalance(addresses.ethereum),
        fetchBitcoinBalance(addresses.bitcoin),
        fetchBSCBalance(addresses.bsc),
        fetchXRPBalance(addresses.xrp),
        fetchSolanaBalance(addresses.solana),
      ]);

    // Calculate USD values
    const balances: ChainBalance[] = [
      {
        chain: 'ethereum',
        balance: ethBalance,
        symbol: 'ETH',
        usdPrice: prices.ethereum,
        usdValue: parseFloat(ethBalance) * prices.ethereum,
        isLoading: false,
      },
      {
        chain: 'bitcoin',
        balance: btcBalance,
        symbol: 'BTC',
        usdPrice: prices.bitcoin,
        usdValue: parseFloat(btcBalance) * prices.bitcoin,
        isLoading: false,
      },
      {
        chain: 'bsc',
        balance: bscBalance,
        symbol: 'BNB',
        usdPrice: prices.bsc,
        usdValue: parseFloat(bscBalance) * prices.bsc,
        isLoading: false,
      },
      {
        chain: 'xrp',
        balance: xrpBalance,
        symbol: 'XRP',
        usdPrice: prices.xrp,
        usdValue: parseFloat(xrpBalance) * prices.xrp,
        isLoading: false,
      },
      {
        chain: 'solana',
        balance: solBalance,
        symbol: 'SOL',
        usdPrice: prices.solana,
        usdValue: parseFloat(solBalance) * prices.solana,
        isLoading: false,
      },
    ];

    // Cache balances
    localStorage.setItem('cached_balances', JSON.stringify({
      balances,
      timestamp: Date.now(),
    }));

    return balances;
  } catch (error) {
    console.error('Failed to fetch all balances:', error);
    throw error;
  }
}

/**
 * Get cached balances (for offline/fast loading)
 */
export function getCachedBalances(): ChainBalance[] | null {
  try {
    const cached = localStorage.getItem('cached_balances');
    if (!cached) return null;

    const { balances, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Cache expires after 30 seconds
    if (age > 30000) return null;

    return balances;
  } catch {
    return null;
  }
}
