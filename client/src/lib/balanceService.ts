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
      ethereum: { usd: 2925, usd_24h_change: -0.6 },
      bitcoin: { usd: 94000, usd_24h_change: 1.2 },
      binancecoin: { usd: 648, usd_24h_change: 0.8 },
      ripple: { usd: 3.12, usd_24h_change: 2.1 },
      solana: { usd: 244, usd_24h_change: -1.4 },
    };
  }
}

/**
 * Fetch Ethereum balance via Etherscan API
 */
export async function fetchEthereumBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.etherscan.io/api'
      : 'https://api-sepolia.etherscan.io/api';
    
    console.log(`🔍 Fetching ETH balance from ${useMainnet ? 'MAINNET' : 'SEPOLIA TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
        apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '', // ← Add this
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
export async function fetchBitcoinBalance(address: string, useMainnet = true): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? `https://blockstream.info/api/address/${address}`
      : `https://blockstream.info/testnet/api/address/${address}`;
    
    console.log(`🔍 Fetching BTC balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      timeout: 10000,
    });
    
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
 * Fetch BSC balance via BSCScan API
 */
export async function fetchBSCBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.bscscan.com/api'
      : 'https://api-testnet.bscscan.com/api';
    
    console.log(`🔍 Fetching BNB balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
      },
      timeout: 10000,
    });

    console.log('📦 BNB API Response:', response.data);

    if (response.data.status === '1' && response.data.result) {
      const balanceWei = response.data.result;
      const balanceBNB = parseFloat(balanceWei) / 1e18;
      console.log('✅ BNB Balance:', balanceBNB, 'BNB');
      return balanceBNB.toFixed(6);
    }
    
    console.warn('⚠️ BNB account not found or no balance');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch BSC balance:', error.message);
    return '0';
  }
}

/**
 * Fetch XRP balance via XRPL public node
 */
export async function fetchXRPBalance(address: string, useMainnet = true): Promise<string> {
  try {
    const rpcUrl = useMainnet 
      ? 'https://s1.ripple.com:51234/'
      : 'https://s.altnet.rippletest.net:51234/';
    
    console.log(`🔍 Fetching XRP balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      method: 'account_info',
      params: [{
        account: address,
        ledger_index: 'validated',
      }],
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('📦 XRP API Response:', response.data);

    if (response.data.result?.account_data?.Balance) {
      const balanceDrops = parseInt(response.data.result.account_data.Balance);
      const balanceXRP = balanceDrops / 1000000;
      console.log('✅ XRP Balance:', balanceXRP, 'XRP');
      return balanceXRP.toFixed(6);
    }
    
    console.warn('⚠️ XRP account not found or no balance');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch XRP balance:', error.message);
    return '0';
  }
}

/**
 * Fetch Solana balance via RPC
 */
export async function fetchSolanaBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const rpcUrl = useMainnet
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com';
    
    console.log(`🔍 Fetching SOL balance from ${useMainnet ? 'MAINNET' : 'DEVNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }, {
      timeout: 10000,
    });

    console.log('📦 SOL API Response:', response.data);

    if (response.data.result?.value !== undefined) {
      const balanceLamports = response.data.result.value;
      const balanceSOL = balanceLamports / 1000000000;
      console.log('✅ SOL Balance:', balanceSOL, 'SOL');
      return balanceSOL.toFixed(6);
    }
    
    console.warn('⚠️ SOL account not found or no balance');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch Solana balance:', error.message);
    return '0';
  }
}

/**
 * Fetch current block/ledger number for a chain
 */
export async function fetchBlockNumber(chain: Chain, useMainnet = false): Promise<number | null> {
  try {
    switch (chain) {
      case 'ethereum': {
        const rpcUrl = useMainnet
          ? 'https://eth.llamarpc.com'
          : 'https://sepolia.gateway.tenderly.co';
        
        const response = await axios.post(rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        
        return parseInt(response.data.result, 16);
      }

      case 'bitcoin': {
        const apiUrl = useMainnet
          ? 'https://blockstream.info/api/blocks/tip/height'
          : 'https://blockstream.info/testnet/api/blocks/tip/height';
        
        const response = await axios.get(apiUrl, { timeout: 5000 });
        return response.data;
      }

      case 'bsc': {
        const rpcUrl = useMainnet
          ? 'https://bsc-dataseed.binance.org/'
          : 'https://data-seed-prebsc-1-s1.binance.org:8545/';
        
        const response = await axios.post(rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        
        return parseInt(response.data.result, 16);
      }

      case 'xrp': {
        const rpcUrl = useMainnet
          ? 'https://s1.ripple.com:51234/'
          : 'https://s.altnet.rippletest.net:51234/';
        
        const response = await axios.post(rpcUrl, {
          method: 'ledger',
          params: [{
            ledger_index: 'validated',
          }],
        }, { timeout: 5000 });
        
        return response.data.result?.ledger_index || null;
      }

      case 'solana': {
        const rpcUrl = useMainnet
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com';
        
        const response = await axios.post(rpcUrl, {
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
export async function fetchChainBalance(
  chain: Chain,
  address: string,
  useMainnet = false
): Promise<ChainBalance> {
  let balance = '0';

  switch (chain) {
    case 'ethereum':
      balance = await fetchEthereumBalance(address, useMainnet);
      break;
    case 'bitcoin':
      balance = await fetchBitcoinBalance(address, useMainnet);
      break;
    case 'bsc':
      balance = await fetchBSCBalance(address, useMainnet);
      break;
    case 'xrp':
      balance = await fetchXRPBalance(address, useMainnet);
      break;
    case 'solana':
      balance = await fetchSolanaBalance(address, useMainnet);
      break;
  }

  return { chain, balance };
}

/**
 * Fetch balances for all chains
 */
export async function fetchAllBalances(
  addresses: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  },
  useMainnet = false
): Promise<ChainBalance[]> {
  try {
    console.log(`🌐 Fetching all balances from ${useMainnet ? 'MAINNET' : 'TESTNET'}`);
    
    // Fetch prices first
    const prices = await fetchPrices();

    // Fetch all balances in parallel
    const [ethBalance, btcBalance, bscBalance, xrpBalance, solBalance] = await Promise.all([
      fetchEthereumBalance(addresses.ethereum, useMainnet),
      fetchBitcoinBalance(addresses.bitcoin, useMainnet),
      fetchBSCBalance(addresses.bsc, useMainnet),
      fetchXRPBalance(addresses.xrp, useMainnet),
      fetchSolanaBalance(addresses.solana, useMainnet),
    ]);

    // Calculate USD values
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

    // Cache the results
    localStorage.setItem('cached_balances', JSON.stringify({
      balances,
      timestamp: Date.now(),
      network: useMainnet ? 'mainnet' : 'testnet',
    }));

    console.log('✅ All balances fetched successfully');
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

    // Cache expires after 5 minutes
    if (age > 300000) return null;

    return balances;
  } catch {
    return null;
  }
}
