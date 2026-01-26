// client/src/lib/tokenService.ts
// Token management service - detect, add, remove tokens from wallet

import axios from 'axios';
import { Contract, JsonRpcProvider } from 'ethers';
import { xrplService } from './xrpService';

// ERC-20 ABI (minimal - only what we need)
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';
export type TokenStandard = 'ERC-20' | 'BEP-20' | 'SPL' | 'XRPL';

export interface Token {
  id: string;
  chain: Chain;
  standard: TokenStandard;
  contractAddress?: string;
  mintAddress?: string; // For Solana SPL tokens (Solana's equivalent to ERC-20 contract address)
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usdValue?: number;
  priceChange24h?: number;
  logoUrl?: string;
  isVisible: boolean;
  isNative: boolean;
  addedAt: Date;
  currencyCode?: string;
  issuer?: string;
  trustlineLimit?: string;
  issuerFlags?: {
    requireAuth: boolean;
    globalFreeze: boolean;
    defaultRipple: boolean;
  };
}

const STORAGE_KEY_PREFIX = 'wallet_tokens_';

/**
 * Get all tokens for a wallet
 */
export async function getWalletTokens(walletId: string): Promise<Token[]> {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${walletId}`);
    if (!stored) return [];
    
    const tokens = JSON.parse(stored);
    return tokens.map((t: any) => ({
      ...t,
      addedAt: new Date(t.addedAt),
    }));
  } catch (error) {
    console.error('Failed to load wallet tokens:', error);
    return [];
  }
}

/**
 * Save wallet tokens
 */
export async function saveWalletTokens(walletId: string, tokens: Token[]): Promise<void> {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${walletId}`, JSON.stringify(tokens));
  } catch (error) {
    console.error('Failed to save wallet tokens:', error);
    throw error;
  }
}

/**
 * Add token to wallet
 */
export async function addTokenToWallet(walletId: string, token: Token): Promise<void> {
  const tokens = await getWalletTokens(walletId);
  
  const exists = tokens.find(t => t.id === token.id);
  if (exists) {
    throw new Error('Token already added');
  }
  
  tokens.push(token);
  await saveWalletTokens(walletId, tokens);
}

/**
 * Remove token from wallet
 */
export async function removeTokenFromWallet(walletId: string, tokenId: string): Promise<void> {
  const tokens = await getWalletTokens(walletId);
  const filtered = tokens.filter(t => t.id !== tokenId);
  await saveWalletTokens(walletId, filtered);
}

/**
 * Update token balance
 */
export async function updateTokenBalance(
  walletId: string,
  tokenId: string,
  balance: string,
  usdValue?: number
): Promise<void> {
  const tokens = await getWalletTokens(walletId);
  const token = tokens.find(t => t.id === tokenId);
  
  if (token) {
    token.balance = balance;
    if (usdValue !== undefined) {
      token.usdValue = usdValue;
    }
    await saveWalletTokens(walletId, tokens);
  }
}

/**
 * Fetch ERC-20 token info with RPC fallback and retry logic
 */
export async function fetchERC20TokenInfo(contractAddress: string, chain: 'ethereum' | 'bsc' = 'ethereum'): Promise<{
  name: string;
  symbol: string;
  decimals: number;
}> {
  // Multiple reliable RPC endpoints - cycles through on failure
  const RPC_ENDPOINTS = {
    ethereum: [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
    ],
    bsc: [
      'https://bsc-dataseed.binance.org/',
      'https://bsc-dataseed1.binance.org/',
      'https://bsc-dataseed2.binance.org/',
      'https://bsc-dataseed3.binance.org/',
      'https://bsc-dataseed4.binance.org/',
      'https://rpc.ankr.com/bsc',
      'https://bsc-rpc.publicnode.com',
      'https://bsc.nodereal.io',
      'https://binance.llamarpc.com',
    ],
  };

  const endpoints = RPC_ENDPOINTS[chain];
  let lastError: Error | null = null;

  // Try each RPC endpoint in sequence
  for (let i = 0; i < endpoints.length; i++) {
    const rpcUrl = endpoints[i];
    
    try {
      console.log(`[Token Verify] Attempt ${i + 1}/${endpoints.length} using ${rpcUrl}`);
      
      const provider = new JsonRpcProvider(rpcUrl);
      const contract = new Contract(contractAddress, ERC20_ABI, provider);

      // Fetch token info in parallel with timeout
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);

      // Validate we got actual values (not empty/null)
      if (!symbol || symbol === '' || symbol === null) {
        throw new Error('Symbol returned empty from contract');
      }

      console.log(`[Token Verify] Success: ${symbol} (${name})`);

      return {
        name: String(name),
        symbol: String(symbol),
        decimals: Number(decimals),
      };
    } catch (error: any) {
      console.warn(`[Token Verify] RPC ${rpcUrl} failed:`, error.message);
      lastError = error;
      
      // Add delay between retries to avoid rate limiting
      // Using 500ms as a conservative delay to ensure reliability with BSC nodes
      if (i < endpoints.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // All RPC endpoints failed - throw error instead of returning UNKNOWN
  console.error('[Token Verify] All RPC endpoints failed for contract:', contractAddress);
  throw new Error(
    `Failed to fetch token information after trying ${endpoints.length} RPC endpoints. ` +
    `Please verify the contract address is valid. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Fetch SPL token metadata from Solana blockchain
 * Uses Helius DAS API (if key available) with Jupiter and Solana FM fallbacks
 */
export async function fetchSPLTokenInfo(mintAddress: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}> {
  const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
  
  // Primary: Try Helius DAS API (best for pump.fun and all SPL tokens)
  if (HELIUS_KEY) {
    try {
      console.log('[SPL Token] Attempting Helius DAS API...');
      const response = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: mintAddress },
        },
        { timeout: 10000 }
      );

      const asset = response.data.result;
      if (asset?.content?.metadata) {
        const metadata = asset.content.metadata;
        console.log('[SPL Token] Helius success:', metadata.symbol);
        return {
          name: metadata.name || 'Unknown Token',
          symbol: metadata.symbol || mintAddress.slice(0, 8),
          decimals: asset.token_info?.decimals ?? 9,
          logoUrl: asset.content?.links?.image || asset.content?.files?.[0]?.uri,
        };
      }
    } catch (heliusError) {
      console.warn('[SPL Token] Helius DAS API failed, trying fallback:', heliusError);
    }
  }

  // Fallback 1: Try Jupiter Token List API (covers most traded tokens)
  try {
    console.log('[SPL Token] Attempting Jupiter API...');
    const jupiterResponse = await axios.get(
      `https://token.jup.ag/strict`,
      { timeout: 5000 }
    );
    
    const token = jupiterResponse.data.find(
      (t: any) => t.address === mintAddress
    );
    
    if (token) {
      console.log('[SPL Token] Jupiter success:', token.symbol);
      return {
        name: token.name || 'Unknown Token',
        symbol: token.symbol || mintAddress.slice(0, 8),
        decimals: token.decimals ?? 9,
        logoUrl: token.logoURI,
      };
    }
  } catch (jupiterError) {
    console.warn('[SPL Token] Jupiter API failed:', jupiterError);
  }

  // Fallback 2: Try Solana FM API
  try {
    console.log('[SPL Token] Attempting Solana FM API...');
    const solanaFmResponse = await axios.get(
      `https://api.solana.fm/v1/tokens/${mintAddress}`,
      { timeout: 5000 }
    );
    
    if (solanaFmResponse.data?.tokenMetadata) {
      const meta = solanaFmResponse.data.tokenMetadata;
      console.log('[SPL Token] Solana FM success:', meta.symbol);
      return {
        name: meta.name || 'Unknown Token',
        symbol: meta.symbol || mintAddress.slice(0, 8),
        decimals: meta.decimals ?? 9,
        logoUrl: meta.logoURI,
      };
    }
  } catch (solanaFmError) {
    console.warn('[SPL Token] Solana FM API failed:', solanaFmError);
  }

  // Fallback 3: Get basic mint info from RPC (at least get decimals right)
  try {
    console.log('[SPL Token] Attempting RPC fallback...');
    const rpcUrl = HELIUS_KEY 
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
      : 'https://rpc.ankr.com/solana';

    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [mintAddress, { encoding: 'jsonParsed' }],
    }, { timeout: 10000 });

    if (response.data.result?.value?.data?.parsed?.info) {
      const mintData = response.data.result.value.data.parsed.info;
      console.log('[SPL Token] RPC fallback success, decimals:', mintData.decimals);
      return {
        name: `Token ${mintAddress.slice(0, 8)}...`,
        symbol: mintAddress.slice(0, 8),
        decimals: mintData.decimals ?? 9,
      };
    }
  } catch (rpcError) {
    console.warn('[SPL Token] RPC fallback failed:', rpcError);
  }

  // Final fallback - throw error instead of returning garbage
  console.error('[SPL Token] All metadata sources failed for:', mintAddress);
  throw new Error(
    `Failed to fetch token metadata for ${mintAddress}. ` +
    `Token may not exist or metadata services are unavailable.`
  );
}

/**
 * Fetch XRPL token/issuer info
 */
export async function fetchXRPLIssuerInfo(issuer: string): Promise<{
  exists: boolean;
  flags?: {
    requireAuth: boolean;
    globalFreeze: boolean;
    defaultRipple: boolean;
  };
}> {
  try {
    const client = await xrplService.getClient(true);
    
    const response = await client.request({
      command: 'account_info',
      account: issuer,
      ledger_index: 'validated',
    });
    
    const flags = response.result.account_data.Flags;
    
    return {
      exists: true,
      flags: {
        requireAuth: (flags & 0x00040000) !== 0,
        globalFreeze: (flags & 0x00400000) !== 0,
        defaultRipple: (flags & 0x00800000) !== 0,
      },
    };
  } catch (error: any) {
    if (error.data?.error === 'actNotFound') {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Auto-detect tokens for all chains
 */
export async function autoDetectTokens(addresses: Record<Chain, string>): Promise<Token[]> {
  const detectedTokens: Token[] = [];
  
  try {
    const ethTokens = await detectERC20Tokens(addresses.ethereum);
    detectedTokens.push(...ethTokens);
  } catch (error) {
    console.error('Failed to detect Ethereum tokens:', error);
  }
  
  try {
    const bscTokens = await detectBEP20Tokens(addresses.bsc);
    detectedTokens.push(...bscTokens);
  } catch (error) {
    console.error('Failed to detect BSC tokens:', error);
  }
  
  try {
    const xrpTokens = await detectXRPLTrustlines(addresses.xrp);
    detectedTokens.push(...xrpTokens);
  } catch (error) {
    console.error('Failed to detect XRP trustlines:', error);
  }
  
  return detectedTokens;
}

/**
 * Detect ERC-20 tokens
 */
async function detectERC20Tokens(address: string): Promise<Token[]> {
  // Implementation would use Etherscan or similar API
  // Placeholder for now
  return [];
}

/**
 * Detect BEP-20 tokens
 */
async function detectBEP20Tokens(address: string): Promise<Token[]> {
  // Implementation would use BSCScan or similar API
  // Placeholder for now
  return [];
}

/**
 * Detect XRPL trustlines
 */
async function detectXRPLTrustlines(address: string): Promise<Token[]> {
  try {
    const client = await xrplService.getClient(true);
    
    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });
    
    if (!response.result.lines) return [];
    
    return response.result.lines.map((line: any) => ({
      id: `xrpl-${line.currency}-${line.account}`,
      chain: 'xrp' as Chain,
      standard: 'XRPL' as TokenStandard,
      currencyCode: line.currency,
      issuer: line.account,
      symbol: line.currency,
      name: `${line.currency} (${line.account.slice(0, 8)}...)`,
      decimals: 6,
      balance: line.balance || '0',
      isVisible: true,
      isNative: false,
      addedAt: new Date(),
      trustlineLimit: line.limit,
    }));
  } catch (error) {
    console.error('Failed to detect XRPL trustlines:', error);
    return [];
  }
}

/**
 * Ensure native tokens exist for all chains
 */
export async function ensureNativeTokens(walletId: string): Promise<Token[]> {
  const tokens = await getWalletTokens(walletId);
  
  const NATIVE_TOKENS: Record<Chain, { symbol: string; name: string; decimals: number }> = {
    ethereum: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    bitcoin: { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
    bsc: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    xrp: { symbol: 'XRP', name: 'XRP', decimals: 6 },
    solana: { symbol: 'SOL', name: 'Solana', decimals: 9 },
  };

  const chains: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana'];
  let tokensAdded = false;

  for (const chain of chains) {
    const nativeExists = tokens.find(t => t.chain === chain && t.isNative);
    
    if (!nativeExists) {
      const native = NATIVE_TOKENS[chain];
      const nativeToken: Token = {
        id: `native-${chain}`,
        chain,
        standard: chain === 'xrp' ? 'XRPL' : chain === 'solana' ? 'SPL' : 'ERC-20',
        symbol: native.symbol,
        name: native.name,
        decimals: native.decimals,
        balance: '0',
        isVisible: true,
        isNative: true,
        addedAt: new Date(),
      };
      
      tokens.push(nativeToken);
      tokensAdded = true;
    }
  }

  if (tokensAdded) {
    await saveWalletTokens(walletId, tokens);
  }
  
  return tokens;
}

/**
 * Fetch token price and 24h change from CoinGecko
 * Supports ERC-20, BEP-20, SPL, and XRPL tokens
 */
export async function fetchTokenPrice(token: Token): Promise<{
  usdPrice?: number;
  priceChange24h?: number;
}> {
  try {
    // Handle different token standards
    if (token.standard === 'ERC-20' && token.contractAddress) {
      // Ethereum tokens
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/token_price/ethereum`,
        {
          params: {
            contract_addresses: token.contractAddress,
            vs_currencies: 'usd',
            include_24hr_change: 'true',
          },
          timeout: 5000,
        }
      );
      
      const data = response.data[token.contractAddress.toLowerCase()];
      if (data) {
        return {
          usdPrice: data.usd,
          priceChange24h: data.usd_24h_change,
        };
      }
    } else if (token.standard === 'BEP-20' && token.contractAddress) {
      // BSC tokens
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain`,
        {
          params: {
            contract_addresses: token.contractAddress,
            vs_currencies: 'usd',
            include_24hr_change: 'true',
          },
          timeout: 5000,
        }
      );
      
      const data = response.data[token.contractAddress.toLowerCase()];
      if (data) {
        return {
          usdPrice: data.usd,
          priceChange24h: data.usd_24h_change,
        };
      }
    } else if (token.standard === 'SPL' && token.mintAddress) {
      // Solana tokens
      const mintAddress = token.mintAddress;
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/token_price/solana`,
        {
          params: {
            contract_addresses: mintAddress,
            vs_currencies: 'usd',
            include_24hr_change: 'true',
          },
          timeout: 5000,
        }
      );
      
      const data = response.data[mintAddress.toLowerCase()];
      if (data) {
        return {
          usdPrice: data.usd,
          priceChange24h: data.usd_24h_change,
        };
      }
    } else if (token.standard === 'XRPL' && token.currencyCode && token.issuer) {
      // XRPL tokens - CoinGecko doesn't have comprehensive XRPL token support
      // This is intentionally returning undefined as there's no reliable price API for XRPL tokens
      // Users can still add and track these tokens, but price data won't be available
      return {
        usdPrice: undefined,
        priceChange24h: undefined,
      };
    }
    
    return {
      usdPrice: undefined,
      priceChange24h: undefined,
    };
  } catch (error) {
    console.warn(`Failed to fetch price for ${token.symbol}:`, error);
    return {
      usdPrice: undefined,
      priceChange24h: undefined,
    };
  }
}

/**
 * Update token prices for all tokens
 */
export async function updateTokenPrices(tokens: Token[]): Promise<Token[]> {
  const updatedTokens = await Promise.all(
    tokens.map(async (token) => {
      // Skip native tokens - they get prices from native balance service
      if (token.isNative) {
        return token;
      }
      
      const priceData = await fetchTokenPrice(token);
      
      return {
        ...token,
        usdValue: priceData.usdPrice && token.balance 
          ? priceData.usdPrice * parseFloat(token.balance)
          : token.usdValue,
        priceChange24h: priceData.priceChange24h,
      };
    })
  );
  
  return updatedTokens;
}
