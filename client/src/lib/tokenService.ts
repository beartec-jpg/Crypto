// client/src/lib/tokenService.ts
// Multi-chain token management service

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import axios from 'axios';
import { Contract, JsonRpcProvider } from 'ethers';
import type { Chain } from './balanceService';
import { xrplService } from './xrpService';

export type TokenStandard = 'native' | 'ERC20' | 'BEP20' | 'XRPL' | 'SPL';

export interface Token {
  id: string;
  chain: Chain;
  standard: TokenStandard;
  
  // Contract/Currency info
  contractAddress?: string;  // For ERC-20/BEP-20
  currencyCode?: string;     // For XRPL (e.g., "USD")
  issuer?: string;           // For XRPL issuer address
  mintAddress?: string;      // For SPL tokens
  
  // Display info
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  
  // Balance
  balance: string;
  usdValue?: number;
  
  // User preferences
  isVisible: boolean;
  isNative: boolean;
  addedAt: Date;
  
  // XRPL specific
  trustlineLimit?: string;   // Max amount for trustline
  issuerFlags?: {            // Issuer account flags
    requireAuth: boolean;
    globalFreeze: boolean;
    defaultRipple: boolean;
  };
}

export interface WalletTokens {
  walletId: string;
  tokens: Token[];
  lastUpdated: Date;
}

interface TokenDB extends DBSchema {
  tokens: {
    key: string;
    value: WalletTokens;
    indexes: { 'by-wallet': string };
  };
}

// ERC-20 ABI (minimal - just what we need)
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];

// IndexedDB for token storage
let dbPromise: Promise<IDBPDatabase<TokenDB>> | null = null;

async function getTokenDB(): Promise<IDBPDatabase<TokenDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TokenDB>('token_storage', 1, {
      upgrade(db) {
        const store = db.createObjectStore('tokens', { keyPath: 'walletId' });
        store.createIndex('by-wallet', 'walletId');
      },
    });
  }
  return dbPromise;
}

/**
 * Get all tokens for a wallet
 */
export async function getWalletTokens(walletId: string): Promise<Token[]> {
  try {
    const db = await getTokenDB();
    const data = await db.get('tokens', walletId);
    
    if (!data) {
      // Return default native tokens
      return createDefaultNativeTokens();
    }
    
    return data.tokens;
  } catch (error) {
    console.error('Failed to get wallet tokens:', error);
    return createDefaultNativeTokens();
  }
}

/**
 * Create default native tokens (ETH, BTC, BNB, XRP, SOL)
 */
function createDefaultNativeTokens(): Token[] {
  return [
    {
      id: 'native-ethereum',
      chain: 'ethereum',
      standard: 'native',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      balance: '0',
      isVisible: true,
      isNative: true,
      addedAt: new Date(),
    },
    {
      id: 'native-bitcoin',
      chain: 'bitcoin',
      standard: 'native',
      symbol: 'BTC',
      name: 'Bitcoin',
      decimals: 8,
      balance: '0',
      isVisible: true,
      isNative: true,
      addedAt: new Date(),
    },
    {
      id: 'native-bsc',
      chain: 'bsc',
      standard: 'native',
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      balance: '0',
      isVisible: true,
      isNative: true,
      addedAt: new Date(),
    },
    {
      id: 'native-xrp',
      chain: 'xrp',
      standard: 'native',
      symbol: 'XRP',
      name: 'XRP',
      decimals: 6,
      balance: '0',
      isVisible: true,
      isNative: true,
      addedAt: new Date(),
    },
    {
      id: 'native-solana',
      chain: 'solana',
      standard: 'native',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      balance: '0',
      isVisible: true,
      isNative: true,
      addedAt: new Date(),
    },
  ];
}

/**
 * Save tokens to storage
 */
export async function saveWalletTokens(walletId: string, tokens: Token[]): Promise<void> {
  try {
    const db = await getTokenDB();
    await db.put('tokens', {
      walletId,
      tokens,
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error('Failed to save wallet tokens:', error);
    throw error;
  }
}

/**
 * Add a token to wallet
 */
export async function addTokenToWallet(walletId: string, token: Token): Promise<void> {
  const tokens = await getWalletTokens(walletId);
  
  // Check if already exists
  const exists = tokens.find(t => t.id === token.id);
  if (exists) {
    throw new Error('Token already added');
  }
  
  tokens.push(token);
  await saveWalletTokens(walletId, tokens);
}

/**
 * Remove a token from wallet
 */
export async function removeTokenFromWallet(walletId: string, tokenId: string): Promise<void> {
  const tokens = await getWalletTokens(walletId);
  const filtered = tokens.filter(t => t.id !== tokenId);
  
  if (filtered.length === tokens.length) {
    throw new Error('Token not found');
  }
  
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
  
  if (!token) return;
  
  token.balance = balance;
  if (usdValue !== undefined) {
    token.usdValue = usdValue;
  }
  
  await saveWalletTokens(walletId, tokens);
}

/**
 * Auto-detect tokens on wallet creation/import
 */
export async function autoDetectTokens(addresses: {
  ethereum: string;
  bitcoin: string;
  bsc: string;
  xrp: string;
  solana: string;
}): Promise<Token[]> {
  const detectedTokens: Token[] = [];
  
  try {
    // Detect ERC-20 tokens
    const ethTokens = await detectERC20Tokens(addresses.ethereum);
    detectedTokens.push(...ethTokens);
    
    // Detect BEP-20 tokens
    const bscTokens = await detectBEP20Tokens(addresses.bsc);
    detectedTokens.push(...bscTokens);
    
    // Detect XRPL trustlines
    const xrpTokens = await detectXRPLTrustlines(addresses.xrp);
    detectedTokens.push(...xrpTokens);
    
    // Detect SPL tokens
    const solTokens = await detectSPLTokens(addresses.solana);
    detectedTokens.push(...solTokens);
  } catch (error) {
    console.error('Auto-detect tokens failed:', error);
  }
  
  return detectedTokens;
}

/**
 * Detect ERC-20 tokens from Etherscan
 */
async function detectERC20Tokens(address: string): Promise<Token[]> {
  try {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        address,
        page: 1,
        offset: 100,
        sort: 'desc',
        apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
      },
      timeout: 10000,
    });
    
    if (response.data.status !== '1') return [];
    
    // Get unique tokens
    const tokenMap = new Map<string, any>();
    
    response.data.result.forEach((tx: any) => {
      if (!tokenMap.has(tx.contractAddress)) {
        tokenMap.set(tx.contractAddress, {
          contractAddress: tx.contractAddress,
          symbol: tx.tokenSymbol,
          name: tx.tokenName,
          decimals: parseInt(tx.tokenDecimal),
        });
      }
    });
    
    // Convert to Token objects
    return Array.from(tokenMap.values()).map(token => ({
      id: `erc20-${token.contractAddress}`,
      chain: 'ethereum' as Chain,
      standard: 'ERC20' as TokenStandard,
      contractAddress: token.contractAddress,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: '0',
      isVisible: true,
      isNative: false,
      addedAt: new Date(),
    }));
  } catch (error) {
    console.error('Failed to detect ERC-20 tokens:', error);
    return [];
  }
}

/**
 * Detect BEP-20 tokens from BscScan
 */
async function detectBEP20Tokens(address: string): Promise<Token[]> {
  try {
    const response = await axios.get('https://api.bscscan.com/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        address,
        page: 1,
        offset: 100,
        sort: 'desc',
        apikey: import.meta.env.VITE_BSCSCAN_API_KEY || '',
      },
      timeout: 10000,
    });
    
    if (response.data.status !== '1') return [];
    
    const tokenMap = new Map<string, any>();
    
    response.data.result.forEach((tx: any) => {
      if (!tokenMap.has(tx.contractAddress)) {
        tokenMap.set(tx.contractAddress, {
          contractAddress: tx.contractAddress,
          symbol: tx.tokenSymbol,
          name: tx.tokenName,
          decimals: parseInt(tx.tokenDecimal),
        });
      }
    });
    
    return Array.from(tokenMap.values()).map(token => ({
      id: `bep20-${token.contractAddress}`,
      chain: 'bsc' as Chain,
      standard: 'BEP20' as TokenStandard,
      contractAddress: token.contractAddress,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance: '0',
      isVisible: true,
      isNative: false,
      addedAt: new Date(),
    }));
  } catch (error) {
    console.error('Failed to detect BEP-20 tokens:', error);
    return [];
  }
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
      trustlineLimit: line.limit,
      isVisible: true,
      isNative: false,
      addedAt: new Date(),
    }));
  } catch (error) {
    console.error('Failed to detect XRPL trustlines:', error);
    return [];
  }
}

/**
 * Detect SPL tokens (Solana)
 */
async function detectSPLTokens(address: string): Promise<Token[]> {
  try {
    const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
    const rpcUrl = HELIUS_KEY 
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
      : 'https://rpc.ankr.com/solana';
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        address,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ],
    }, { timeout: 10000 });
    
    if (!response.data.result?.value) return [];
    
    return response.data.result.value
      .filter((account: any) => {
        const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
        return amount > 0; // Only show tokens with balance
      })
      .map((account: any) => {
        const info = account.account.data.parsed.info;
        return {
          id: `spl-${info.mint}`,
          chain: 'solana' as Chain,
          standard: 'SPL' as TokenStandard,
          mintAddress: info.mint,
          symbol: info.mint.slice(0, 8), // Placeholder until we fetch metadata
          name: `Token ${info.mint.slice(0, 8)}...`,
          decimals: info.tokenAmount.decimals,
          balance: info.tokenAmount.uiAmountString,
          isVisible: true,
          isNative: false,
          addedAt: new Date(),
        };
      });
  } catch (error) {
    console.error('Failed to detect SPL tokens:', error);
    return [];
  }
}

/**
 * Fetch ERC-20 token info from blockchain
 */
export async function fetchERC20TokenInfo(contractAddress: string, chain: 'ethereum' | 'bsc' = 'ethereum'): Promise<{
  name: string;
  symbol: string;
  decimals: number;
}> {
  try {
    // RPC endpoints
    const RPC_URLS = {
      ethereum: 'https://eth.llamarpc.com',
      bsc: 'https://bsc-dataseed.binance.org',
    };

    const provider = new JsonRpcProvider(RPC_URLS[chain]);
    const contract = new Contract(contractAddress, ERC20_ABI, provider);

    // Fetch token info in parallel
    const [name, symbol, decimals] = await Promise.all([
      contract.name().catch(() => 'Unknown Token'),
      contract.symbol().catch(() => 'UNKNOWN'),
      contract.decimals().catch(() => 18),
    ]);

    return {
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
    };
  } catch (error) {
    console.error('Error fetching ERC-20 token info:', error);
    throw new Error('Failed to fetch token information. Verify the contract address is valid.');
  }
}

/**
 * Fetch SPL token metadata from Solana blockchain
 */
export async function fetchSPLTokenInfo(mintAddress: string): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}> {
  try {
    const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
    const rpcUrl = HELIUS_KEY 
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
      : 'https://rpc.ankr.com/solana';

    // Get token metadata using Metaplex standard
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [
        mintAddress,
        { encoding: 'jsonParsed' },
      ],
    }, { timeout: 10000 });

    if (!response.data.result?.value) {
      throw new Error('Token mint not found');
    }

    const mintData = response.data.result.value.data.parsed.info;

    // Try to fetch metadata from Metaplex
    try {
      const metadataResponse = await axios.get(
        `https://api.metaplex.solana.com/v1/metadata/${mintAddress}`,
        { timeout: 5000 }
      );

      if (metadataResponse.data) {
        return {
          name: metadataResponse.data.name || 'Unknown Token',
          symbol: metadataResponse.data.symbol || mintAddress.slice(0, 8),
          decimals: mintData.decimals || 9,
          logoUrl: metadataResponse.data.image,
        };
      }
    } catch (metadataError) {
      console.warn('Failed to fetch Metaplex metadata:', metadataError);
    }

    // Fallback to basic info
    return {
      name: `Token ${mintAddress.slice(0, 8)}...`,
      symbol: mintAddress.slice(0, 8),
      decimals: mintData.decimals || 9,
    };
  } catch (error) {
    console.error('Error fetching SPL token info:', error);
    throw new Error('Failed to fetch token information. Verify the mint address is valid.');
  }
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
  } catch (error) {
    return { exists: false };
  }
}
