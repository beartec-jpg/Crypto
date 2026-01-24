// client/src/lib/balanceService.ts
// Multi-chain balance fetching service - MAINNET ONLY

import axios from 'axios';
import { xrplService } from './xrpService';

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
    return {
      ethereum: { usd: 2925, usd_24h_change: -0.6 },
      bitcoin: { usd: 94000, usd_24h_change: 1.2 },
      binancecoin: { usd: 648, usd_24h_change: 0.8 },
      ripple: { usd: 3.12, usd_24h_change: 2.1 },
      solana: { usd: 244, usd_24h_change: -1.4 },
    };
  }
}

/**
 * Fetch Ethereum balance via Etherscan API v2
 */
export async function fetchEthereumBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching ETH balance from MAINNET for:', address);
    
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: 1,
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
        apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
      },
      timeout: 10000,
    });

    console.log('📦 ETH API Response:', response.data);

    if (response.data.status === '1' && response.data.result) {
      const balanceWei = response.data.result;
      const balanceEth = parseFloat(balanceWei) / 1e18;
      console.log('✅ ETH Balance:', balanceEth, 'ETH');
      return balanceEth.toFixed(6);
    }
    
    console.warn('⚠️ ETH account not found or no balance');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch Ethereum balance:', error.message);
    return '0';
  }
}

/**
 * Fetch Bitcoin balance via Blockstream API
 */
export async function fetchBitcoinBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching BTC balance from MAINNET for:', address);
    
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}`,
      { timeout: 10000 }
    );
    
    console.log('📦 BTC API Response:', response.data);

    const balanceSats = response.data.chain_stats.funded_txo_sum - 
                        response.data.chain_stats.spent_txo_sum;
    const balanceBTC = balanceSats / 100000000;
    console.log('✅ BTC Balance:', balanceBTC, 'BTC');
    return balanceBTC.toFixed(8);
  } catch (error: any) {
    console.error('❌ Failed to fetch Bitcoin balance:', error.message);
    return '0';
  }
}

/**
 * Fetch BSC balance via RPC
 */
export async function fetchBSCBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching BNB balance from MAINNET for:', address);
    
    const response = await axios.post('https://bsc-dataseed.binance.org/', {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }, { timeout: 10000 });

    console.log('📦 BNB RPC Response:', response.data);

    if (response.data.result) {
      const balanceWei = parseInt(response.data.result, 16);
      const balanceBNB = balanceWei / 1e18;
      console.log('✅ BNB Balance:', balanceBNB, 'BNB');
      return balanceBNB.toFixed(6);
    }
    
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch BSC balance:', error.message);
    return '0';
  }
}

/**
 * Fetch XRP balance using official xrpl.js library
 */
export async function fetchXRPBalance(address: string): Promise<string> {
  try {
    if (!xrplService.isValidAddress(address)) {
      console.error('❌ Invalid XRP address format:', address);
      return '0';
    }
    
    const result = await xrplService.getBalance(address, true); // Always mainnet
    
    if (result) {
      return parseFloat(result.balance).toFixed(6);
    }
    
    console.warn('⚠️ XRP account not found or not activated');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch XRP balance:', error.message);
    return '0';
  }
}

/**
 * Fetch Solana balance via RPC
 */
export async function fetchSolanaBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching SOL balance from MAINNET for:', address);
    
    const response = await axios.post('https://api.mainnet-beta.solana.com', {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }, { timeout: 10000 });

    console.log('📦 SOL API Response:', response.data);

    if (response.data.result?.value !== undefined) {
      const balanceLamports = response.data.result.value;
      const balanceSOL = balanceLamports / 1000000000;
      console.log('✅ SOL Balance:', balanceSOL, 'SOL');
      return balanceSOL.toFixed(6);
    }
    
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch Solana balance:', error.message);
    return '0';
  }
}

/**
 * Fetch current block/ledger number for a chain
 */
export async function fetchBlockNumber(chain: Chain): Promise<number | null> {
  try {
    switch (chain) {
      case 'ethereum': {
        const response = await axios.post('https://eth.llamarpc.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        return parseInt(response.data.result, 16);
      }

      case 'bitcoin': {
        const response = await axios.get(
          'https://blockstream.info/api/blocks/tip/height',
          { timeout: 5000 }
        );
        return response.data;
      }

      case 'bsc': {
        const response = await axios.post('https://bsc-dataseed.binance.org/', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        return parseInt(response.data.result, 16);
      }

      case 'xrp': {
        const ledgerIndex = await xrplService.getLedgerInfo(true);
        return ledgerIndex;
      }

      case 'solana': {
        const response = await axios.post('https://api.mainnet-beta.solana.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSlot',
          params: [],
        }, { timeout: 5000 });
        return response.data.result;
      }

      default:
        return null;
    }
  } catch (error: any) {
    console.error(`Failed to fetch block number for ${chain}:`, error.message);
    return null;
  }
}

/**
 * Fetch balance for a specific chain
 */
export async function fetchChainBalance(chain: Chain, address: string): Promise<ChainBalance> {
  let balance = '0';

  switch (chain) {
    case 'ethereum':
      balance = await fetchEthereumBalance(address);
      break;
    case 'bitcoin':
      balance = await fetchBitcoinBalance(address);
      break;
    case 'bsc':
      balance = await fetchBSCBalance(address);
      break;
    case 'xrp':
      balance = await fetchXRPBalance(address);
      break;
    case 'solana':
      balance = await fetchSolanaBalance(address);
      break;
  }

  return { chain, balance };
}

/**
 * Fetch balances for all chains
 */
export async function fetchAllBalances(addresses: {
  ethereum: string;
  bitcoin: string;
  bsc: string;
  xrp: string;
  solana: string;
}): Promise<ChainBalance[]> {
  try {
    console.log('🌐 Fetching all MAINNET balances');
    
    const prices = await fetchPrices();

    const [ethBalance, btcBalance, bscBalance, xrpBalance, solBalance] = await Promise.all([
      fetchEthereumBalance(addresses.ethereum),
      fetchBitcoinBalance(addresses.bitcoin),
      fetchBSCBalance(addresses.bsc),
      fetchXRPBalance(addresses.xrp),
      fetchSolanaBalance(addresses.solana),
    ]);

    const balances: ChainBalance[] = [
      {
        chain: 'ethereum',
        balance: ethBalance,
        usdValue: parseFloat(ethBalance) * prices.ethereum.usd,
        usdPrice: prices.ethereum.usd,
        priceChange24h: prices.ethereum.usd_24h_change,
      },
      {
        chain: 'bitcoin',
        balance: btcBalance,
        usdValue: parseFloat(btcBalance) * prices.bitcoin.usd,
        usdPrice: prices.bitcoin.usd,
        priceChange24h: prices.bitcoin.usd_24h_change,
      },
      {
        chain: 'bsc',
        balance: bscBalance,
        usdValue: parseFloat(bscBalance) * prices.binancecoin.usd,
        usdPrice: prices.binancecoin.usd,
        priceChange24h: prices.binancecoin.usd_24h_change,
      },
      {
        chain: 'xrp',
        balance: xrpBalance,
        usdValue: parseFloat(xrpBalance) * prices.ripple.usd,
        usdPrice: prices.ripple.usd,
        priceChange24h: prices.ripple.usd_24h_change,
      },
      {
        chain: 'solana',
        balance: solBalance,
        usdValue: parseFloat(solBalance) * prices.solana.usd,
        usdPrice: prices.solana.usd,
        priceChange24h: prices.solana.usd_24h_change,
      },
    ];

    localStorage.setItem('cached_balances', JSON.stringify({
      balances,
      timestamp: Date.now(),
    }));

    console.log('✅ All mainnet balances fetched successfully');
    return balances;
  } catch (error) {
    console.error('❌ Failed to fetch all balances:', error);
    return [];
  }
}

/**
 * Get cached balances
 */
export function getCachedBalances(): ChainBalance[] | null {
  try {
    const cached = localStorage.getItem('cached_balances');
    if (!cached) return null;

    const { balances, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > 300000) return null;

    return balances;
  } catch {
    return null;
  }
}
