// client/src/lib/balanceService.ts
// Multi-chain balance fetching service with mainnet/testnet support

import axios from 'axios';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export interface ChainBalance {
  chain: Chain;
  balance: string;
  usdValue?: number;
  usdPrice?: number;
}

interface CoinGeckoPrices {
  ethereum: { usd: number };
  bitcoin: { usd: number };
  binancecoin: { usd: number };
  ripple: { usd: number };
  solana: { usd: number };
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
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    // Return fallback prices
    return {
      ethereum: { usd: 2000 },
      bitcoin: { usd: 40000 },
      binancecoin: { usd: 300 },
      ripple: { usd: 0.5 },
      solana: { usd: 100 },
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
export async function fetchBitcoinBalance(address: string, useMainnet = true): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? `https://blockstream.info/api/address/${address}`           // Mainnet (default)
      : `https://blockstream.info/testnet/api/address/${address}`;  // Testnet
    
    console.log(`🔍 Fetching BTC balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl);
    
    console.log('📦 BTC API Response:', response.data);

    const balanceSats = response.data.chain_stats.funded_txo_sum - 
                        response.data.chain_stats.spent_txo_sum;
    const balanceBTC = balanceSats / 100000000;
    console.log('✅ BTC Balance:', balanceBTC, 'BTC');
    return balanceBTC.toFixed(8);
  } catch (error) {
    console.error('❌ Failed to fetch Bitcoin balance:', error);
    return '0';
  }
}

/**
 * Fetch BSC balance via BSCScan API
 */
export async function fetchBSCBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.bscscan.com/api'        // Mainnet
      : 'https://api-testnet.bscscan.com/api'; // Testnet (default)
    
    console.log(`🔍 Fetching BNB balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
      },
    });

    console.log('📦 BNB API Response:', response.data);

    if (response.data.status === '1') {
      const balanceWei = response.data.result;
      const balanceBNB = parseFloat(balanceWei) / 1e18;
      console.log('✅ BNB Balance:', balanceBNB, 'BNB');
      return balanceBNB.toFixed(6);
    }
    
    console.warn('⚠️ BNB account not found or no balance');
    return '0';
  } catch (error) {
    console.error('❌ Failed to fetch BSC balance:', error);
    return '0';
  }
}

/**
 * Fetch XRP balance via XRPL public node
 */
export async function fetchXRPBalance(address: string, useMainnet = true): Promise<string> {
  try {
    const rpcUrl = useMainnet 
      ? 'https://s1.ripple.com:51234/'           // Mainnet (default)
      : 'https://s.altnet.rippletest.net:51234/'; // Testnet
    
    console.log(`🔍 Fetching XRP balance from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      method: 'account_info',
      params: [{
        account: address,
        ledger_index: 'validated',
      }],
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
  } catch (error) {
    console.error('❌ Failed to fetch XRP balance:', error);
    return '0';
  }
}

/**
 * Fetch Solana balance via RPC
 */
export async function fetchSolanaBalance(address: string, useMainnet = false): Promise<string> {
  try {
    const rpcUrl = useMainnet
      ? 'https://api.mainnet-beta.solana.com' // Mainnet
      : 'https://api.devnet.solana.com';      // Devnet (default)
    
    console.log(`🔍 Fetching SOL balance from ${useMainnet ? 'MAINNET' : 'DEVNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
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
  } catch (error) {
    console.error('❌ Failed to fetch Solana balance:', error);
    return '0';
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
      },
      {
        chain: 'bitcoin',
        balance: btcBalance,
        usdValue: parseFloat(btcBalance) * prices.bitcoin.usd,
        usdPrice: prices.bitcoin.usd,
      },
      {
        chain: 'bsc',
        balance: bscBalance,
        usdValue: parseFloat(bscBalance) * prices.binancecoin.usd,
        usdPrice: prices.binancecoin.usd,
      },
      {
        chain: 'xrp',
        balance: xrpBalance,
        usdValue: parseFloat(xrpBalance) * prices.ripple.usd,
        usdPrice: prices.ripple.usd,
      },
      {
        chain: 'solana',
        balance: solBalance,
        usdValue: parseFloat(solBalance) * prices.solana.usd,
        usdPrice: prices.solana.usd,
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
