// client/src/lib/tokenService.ts
// Token management service - detect, add, remove tokens from wallet

import axios from 'axios';
import { Contract, JsonRpcProvider } from 'ethers';
import { xrplService } from './xrpService';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// ERC-20 ABI (minimal - only what we need)
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana' | 'qbtc';
export type TokenStandard = 'ERC-20' | 'BEP-20' | 'SPL' | 'XRPL' | 'QBTC';

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

// IndexedDB Schema for tokens
interface TokenDB extends DBSchema {
  tokens: {
    key: string; // walletId
    value: {
      walletId: string;
      tokens: Token[];
      lastUpdated: string;
    };
  };
}

const TOKEN_DB_NAME = 'beartec_tokens';
const TOKEN_DB_VERSION = 1;

// Initialize Token IndexedDB
async function getTokenDB(): Promise<IDBPDatabase<TokenDB>> {
  return openDB<TokenDB>(TOKEN_DB_NAME, TOKEN_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens', { keyPath: 'walletId' });
      }
    },
  });
}

/**
 * Get all tokens for a wallet from IndexedDB
 */
export async function getWalletTokens(walletId: string): Promise<Token[]> {
  try {
    const db = await getTokenDB();
    const record = await db.get('tokens', walletId);
    
    if (!record) {
      return [];
    }
    
    // Parse dates back from strings
    return record.tokens.map(token => ({
      ...token,
      addedAt: new Date(token.addedAt),
    }));
  } catch (error) {
    console.error('Failed to load wallet tokens:', error);
    return [];
  }
}

/**
 * Save wallet tokens to IndexedDB
 */
export async function saveWalletTokens(walletId: string, tokens: Token[]): Promise<void> {
  try {
    const db = await getTokenDB();
    await db.put('tokens', {
      walletId,
      tokens,
      lastUpdated: new Date().toISOString(),
    });
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
 * Clear all tokens for a wallet (called when wallet is deleted)
 */
export async function clearWalletTokens(walletId: string): Promise<void> {
  try {
    const db = await getTokenDB();
    await db.delete('tokens', walletId);
    console.log(`✅ Cleared tokens for wallet: ${walletId}`);
  } catch (error) {
    console.error('Failed to clear wallet tokens:', error);
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

  // Final fallback - throw error
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
    const result = await detectXRPLTrustlines(addresses.xrp);
    detectedTokens.push(...result.tokens);
    if (result.error) {
      console.error('Failed to detect XRP trustlines:', result.error);
    }
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
 * Decode XRPL currency code from hex encoding
 * 
 * XRPL standard currency codes (3 chars or fewer) are returned as-is.
 * Longer token names are hex-encoded as 40-character strings and need decoding.
 * 
 * @param currency - The currency code to decode (e.g., "USD", "534F4C4F00...")
 * @returns Decoded currency string or original if:
 *          - 3 characters or fewer (standard codes like "USD", "BTC")
 *          - 40-char hex that decodes successfully (e.g., "SOLO")
 *          - Original hex string if decoding fails (fallback)
 * 
 * @example
 * decodeCurrencyCode("USD") // Returns "USD"
 * decodeCurrencyCode("534F4C4F00000000000000000000000000000000") // Returns "SOLO"
 */
function decodeCurrencyCode(currency: string): string {
  // Return as-is if 3 characters or fewer (standard currency codes)
  if (currency.length <= 3) {
    return currency;
  }
  
  // If it's a 40-character hex string, decode it
  if (currency.length === 40 && /^[0-9A-F]+$/i.test(currency)) {
    try {
      // Convert hex to UTF-8, stripping null bytes
      const hexBytes = currency.match(/.{1,2}/g) || [];
      const decoded = hexBytes
        .map(byte => String.fromCharCode(parseInt(byte, 16)))
        .join('')
        .replace(/\0/g, '')
        .trim();
      
      // Return decoded string if it's non-empty and contains valid characters
      // Allow most printable characters including Unicode, but reject control chars
      if (decoded && !/[\x00-\x1F\x7F]/.test(decoded)) {
        return decoded;
      }
    } catch (error) {
      console.error('Failed to decode currency code:', error);
    }
  }
  
  // Fallback to raw hex if decoding fails
  return currency;
}

/**
 * Detect XRPL trustlines
 */
async function detectXRPLTrustlines(
  address: string
): Promise<{ tokens: Token[]; error?: string }> {
  try {
    const client = await xrplService.getClient(true);
    
    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    });
    
    if (!response.result.lines) return { tokens: [] };
    
    // Fetch issuer flags for each unique issuer (batch to avoid too many requests)
    const uniqueIssuers = [...new Set(response.result.lines.map((line: any) => line.account))];
    const issuerFlagsMap = new Map<string, any>();
    
    await Promise.all(uniqueIssuers.map(async (issuer) => {
      try {
        const issuerInfo = await fetchXRPLIssuerInfo(issuer);
        issuerFlagsMap.set(issuer, issuerInfo.flags);
      } catch (e) {
        // Log error but continue with other issuers
        console.warn(`Failed to fetch issuer info for ${issuer}:`, e);
      }
    }));
    
    const tokens = response.result.lines.map((line: any) => {
      const decodedCurrency = decodeCurrencyCode(line.currency);
      return {
        id: `xrpl-${line.currency}-${line.account}`,
        chain: 'xrp' as Chain,
        standard: 'XRPL' as TokenStandard,
        currencyCode: line.currency,
        issuer: line.account,
        symbol: decodedCurrency,
        name: `${decodedCurrency} (${line.account.slice(0, 8)}...)`,
        decimals: 6,
        balance: line.balance || '0',
        isVisible: true,
        isNative: false,
        addedAt: new Date(),
        trustlineLimit: line.limit,
        issuerFlags: issuerFlagsMap.get(line.account),  // Add issuer flags
      };
    });
    
    return { tokens };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to detect XRPL trustlines:', error);
    return { tokens: [], error: errorMessage };
  }
}

/**
 * Refresh XRPL token balances by querying the ledger
 * Merges current on-chain data with stored tokens
 */
export async function refreshXRPLTokenBalances(
  walletId: string,
  xrpAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔄 Refreshing XRPL token balances...');
    
    // Get current stored tokens
    const storedTokens = await getWalletTokens(walletId);
    const xrpTokens = storedTokens.filter(t => t.chain === 'xrp' && !t.isNative);
    
    // Detect current on-chain trust lines
    const result = await detectXRPLTrustlines(xrpAddress);
    
    // If there was an error, return it
    if (result.error) {
      console.error('Failed to detect XRPL trustlines:', result.error);
      return { success: false, error: result.error };
    }
    
    const detectedTokens = result.tokens;
    
    // Merge: update balances for existing tokens, add newly detected ones
    const tokenMap = new Map<string, Token>();
    
    // Start with stored tokens (preserves user settings like isVisible)
    xrpTokens.forEach(token => {
      tokenMap.set(token.id, token);
    });
    
    // Update with detected data (fresher balances and new trustlines)
    detectedTokens.forEach(detected => {
      const existing = tokenMap.get(detected.id);
      if (existing) {
        // Update balance and trustline limit for existing tokens
        existing.balance = detected.balance;
        existing.trustlineLimit = detected.trustlineLimit;
      } else {
        // Add newly detected token
        tokenMap.set(detected.id, detected);
      }
    });
    
    // Rebuild token list with updated XRPL tokens
    const updatedTokens = [
      ...storedTokens.filter(t => t.chain !== 'xrp' || t.isNative),
      ...Array.from(tokenMap.values()),
    ];
    
    // Save back to IndexedDB
    await saveWalletTokens(walletId, updatedTokens);
    
    console.log('✅ XRPL token balances refreshed');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to refresh XRPL token balances:', error);
    return { success: false, error: errorMessage };
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
    qbtc: { symbol: 'QBTC', name: 'QuantumBTC', decimals: 8 },
  };

  const chains: Chain[] = ['ethereum', 'bitcoin', 'bsc', 'xrp', 'solana', 'qbtc'];
  let tokensAdded = false;

  for (const chain of chains) {
    const nativeExists = tokens.find(t => t.chain === chain && t.isNative);
    
    if (!nativeExists) {
      const native = NATIVE_TOKENS[chain];
      const nativeToken: Token = {
        id: `native-${chain}`,
        chain,
        standard: chain === 'xrp' ? 'XRPL' : chain === 'solana' ? 'SPL' : chain === 'qbtc' ? 'QBTC' : 'ERC-20',
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
