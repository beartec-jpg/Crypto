// client/src/lib/walletService.ts
// Multi-chain embedded wallet service with multi-user support and enhanced security

import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';

// Supported chains
export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

interface WalletDB extends DBSchema {
  wallets: {
    key: string;
    value: {
      id: string;
      userId: string; // Clerk user ID
      encryptedMnemonic: string;
      addresses: {
        ethereum: string;
        bitcoin: string;
        bsc: string;
        xrp: string;
        solana: string;
      };
      publicKeys: {
        ethereum: string;
        bitcoin: string;
        bsc: string;
        xrp: string;
        solana: string;
      };
      createdAt: string;
      salt: string;
      mnemonicBackedUp?: boolean;
    };
  };
}

interface Wallet {
  id: string;
  addresses: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  };
  createdAt: string;
  mnemonicBackedUp?: boolean;
}

interface UnlockedWallet extends Wallet {
  mnemonic: string;
  privateKeys: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  };
}

interface WalletCreationResult extends Wallet {
  mnemonic: string; // Return mnemonic on creation so user can back it up
}

const DB_NAME = 'beartec_wallet';
const DB_VERSION = 2; // Incremented for schema update

// BIP44 Derivation Paths
const DERIVATION_PATHS = {
  ethereum: "m/44'/60'/0'/0/0",   // ETH
  bitcoin: "m/44'/0'/0'/0/0",     // BTC
  bsc: "m/44'/60'/0'/0/0",        // BSC (same as ETH)
  xrp: "m/44'/144'/0'/0/0",       // XRP
  solana: "m/44'/501'/0'/0/0",    // SOL
};

// Security: In-memory key cache with automatic cleanup
class SecureKeyCache {
  private cache: Map<string, { key: string; timestamp: number }> = new Map();
  private readonly MAX_AGE = 30000; // 30 seconds

  set(id: string, key: string) {
    this.cache.set(id, { key, timestamp: Date.now() });
    
    // Auto-cleanup after MAX_AGE
    setTimeout(() => {
      this.delete(id);
    }, this.MAX_AGE);
  }

  get(id: string): string | null {
    const entry = this.cache.get(id);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.MAX_AGE) {
      this.delete(id);
      return null;
    }

    return entry.key;
  }

  delete(id: string) {
    const entry = this.cache.get(id);
    if (entry) {
      // Overwrite with zeros before deletion
      entry.key = '0'.repeat(entry.key.length);
    }
    this.cache.delete(id);
  }

  clear() {
    this.cache.forEach((entry) => {
      entry.key = '0'.repeat(entry.key.length);
    });
    this.cache.clear();
  }
}

const keyCache = new SecureKeyCache();

// Security: Clear cache on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    keyCache.clear();
    console.log('🔒 Cleared key cache on page unload');
  });
}

// Helper: Get user-specific localStorage key
function getUserStorageKey(userId: string, key: string): string {
  return `${key}_${userId}`;
}

// Helper to derive BIP44 path using @scure/bip32
function derivePath(node: HDKey, path: string): HDKey {
  const segments = path.replace(/^m\//i, '').split('/');
  let derived = node;
  
  for (const segment of segments) {
    if (!segment) continue;
    const hardened = segment.endsWith("'");
    const index = parseInt(segment.replace("'", ''), 10);
    derived = derived.deriveChild(hardened ? index + 0x80000000 : index);
  }
  
  return derived;
}

// Initialize IndexedDB
async function getDB(): Promise<IDBPDatabase<WalletDB>> {
  return openDB<WalletDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      // Create wallets store if it doesn't exist
      if (!db.objectStoreNames.contains('wallets')) {
        const store = db.createObjectStore('wallets', { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      } else if (oldVersion < 2) {
        // Migration: Add userId index for existing stores
        const tx = db.transaction('wallets', 'readwrite');
        const store = tx.objectStore('wallets');
        if (!store.indexNames.contains('userId')) {
          store.createIndex('userId', 'userId', { unique: false });
        }
      }
    },
  });
}

// Encrypt data using password (PBKDF2 with 100k iterations)
function encryptData(data: string, password: string, salt: Uint8Array): string {
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const dataBytes = new TextEncoder().encode(data);
  const encrypted = new Uint8Array(dataBytes.length);
  
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ key[i % key.length];
  }
  
  return Buffer.from(encrypted).toString('hex');
}

// Decrypt data using password
function decryptData(encryptedHex: string, password: string, salt: Uint8Array): string {
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decrypted = new Uint8Array(encrypted.length);
  
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length];
  }
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Derive Ethereum/BSC address from private key
 */
function deriveEthereumAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyNoPrefix = publicKeyBytes.slice(1); // Remove 0x04 prefix
  const hash = sha256(publicKeyNoPrefix);
  return ethers.getAddress('0x' + Buffer.from(hash.slice(-20)).toString('hex'));
}

/**
 * Derive Bitcoin address from private key (P2PKH)
 */
function deriveBitcoinAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58Encode(addressBytes);
}

/**
 * Derive XRP address from private key
 */
function deriveXRPAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58EncodeXRP(addressBytes);
}

/**
 * Derive Solana address from private key
 */
function deriveSolanaAddress(seed: Uint8Array): string {
  const hash = sha256(seed);
  return base58Encode(hash);
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let encoded = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }
  
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = '1' + encoded;
  }
  
  return encoded;
}

/**
 * Base58 encoding with XRP alphabet
 */
function base58EncodeXRP(bytes: Uint8Array): string {
  const ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let encoded = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }
  
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = 'r' + encoded;
  }
  
  return encoded;
}

/**
 * Derive all addresses from mnemonic (shared logic)
 */
async function deriveAddressesFromMnemonic(
  mnemonic: string,
  useTestnet = false // Add testnet parameter
): Promise<{
  addresses: Wallet['addresses'];
  publicKeys: Record<Chain, string>;
}> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  
  const addresses: Wallet['addresses'] = {
    ethereum: '',
    bitcoin: '',
    bsc: '',
    xrp: '',
    solana: '',
  };
  
  const publicKeys: Record<Chain, string> = {
    ethereum: '',
    bitcoin: '',
    bsc: '',
    xrp: '',
    solana: '',
  };
  
  // Ethereum
  const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
  if (!ethNode.privateKey) throw new Error('Failed to derive ETH key');
  addresses.ethereum = deriveEthereumAddress(ethNode.privateKey);
  publicKeys.ethereum = Buffer.from(secp256k1.getPublicKey(ethNode.privateKey, false)).toString('hex');
  
  // Bitcoin (with testnet support)
  const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
  if (!btcNode.privateKey) throw new Error('Failed to derive BTC key');
  addresses.bitcoin = deriveBitcoinAddress(btcNode.privateKey, useTestnet); // Pass testnet flag
  publicKeys.bitcoin = Buffer.from(secp256k1.getPublicKey(btcNode.privateKey, true)).toString('hex');
  
  // BSC (same as Ethereum)
  addresses.bsc = addresses.ethereum;
  publicKeys.bsc = publicKeys.ethereum;
  
  // XRP
  const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
  if (!xrpNode.privateKey) throw new Error('Failed to derive XRP key');
  addresses.xrp = deriveXRPAddress(xrpNode.privateKey);
  publicKeys.xrp = Buffer.from(secp256k1.getPublicKey(xrpNode.privateKey, true)).toString('hex');
  
  // Solana
  const solNode = derivePath(root, DERIVATION_PATHS.solana);
  if (!solNode.privateKey) throw new Error('Failed to derive SOL key');
  addresses.solana = deriveSolanaAddress(solNode.privateKey);
  publicKeys.solana = Buffer.from(solNode.privateKey).toString('hex');
  
  return { addresses, publicKeys };
}

/**
 * Derive Bitcoin address from private key (P2PKH) - with testnet support
 */
function deriveBitcoinAddress(privateKeyBytes: Uint8Array, useTestnet = false): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte (0x00 for mainnet, 0x6F for testnet)
  const versionByte = useTestnet ? 0x6F : 0x00;
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = versionByte;
  versionedHash.set(ripemd160Hash, 1);
  
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58Encode(addressBytes);
}

/**
 * Create a new multi-chain wallet (with user isolation)
 */
export async function createWallet(password: string, userId: string): Promise<WalletCreationResult> {
  try {
    console.log(`🔐 Creating new multi-chain wallet for user: ${userId}`);
    
    // Check if user already has a wallet
    const existing = await getCurrentWallet(userId);
    if (existing) {
      throw new Error('You already have a wallet. Use import to restore a different wallet.');
    }
    
    // Generate 24-word mnemonic (256 bits entropy)
    const mnemonic = bip39.generateMnemonic(256);
    console.log('✅ Generated mnemonic');
    
    // Derive addresses (false = mainnet Bitcoin addresses)
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(mnemonic, false);
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with password
    const salt = randomBytes(32);
    const encryptedMnemonic = encryptData(mnemonic, password, salt);
    
    // Store in IndexedDB with userId
    const db = await getDB();
    const walletId = `wallet_${userId}_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      userId, // Associate with Clerk user
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: false,
    });
    
    console.log('✅ Multi-chain wallet stored in IndexedDB (encrypted)');
    
    // Store wallet ID in user-specific localStorage
    localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), walletId);
    localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');
    
    return {
      id: walletId,
      addresses,
      createdAt: new Date().toISOString(),
      mnemonic,
      mnemonicBackedUp: false,
    };
    
  } catch (error) {
    console.error('❌ Failed to create wallet:', error);
    throw error;
  }
}

/**
 * Import wallet from mnemonic phrase (with user isolation)
 */
export async function importWallet(mnemonic: string, password: string, userId: string): Promise<Wallet> {
  try {
    console.log(`🔐 Importing wallet for user: ${userId}`);
    
    // Clean up mnemonic
    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Validate mnemonic
    if (!bip39.validateMnemonic(cleanMnemonic)) {
      throw new Error('Invalid recovery phrase. Please check your words and try again.');
    }
    
    // Check word count
    const wordCount = cleanMnemonic.split(' ').length;
    if (wordCount !== 12 && wordCount !== 24) {
      throw new Error(`Invalid word count: ${wordCount}. Must be 12 or 24 words.`);
    }
    
    // Check if user already has a wallet with these addresses
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(cleanMnemonic);
    
    const existing = await getCurrentWallet(userId);
    if (existing && existing.addresses.ethereum === addresses.ethereum) {
      throw new Error('This wallet is already imported for your account.');
    }
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with password
    const salt = randomBytes(32);
    const encryptedMnemonic = encryptData(cleanMnemonic, password, salt);
    
    // Delete old wallet if exists (user is replacing)
    if (existing) {
      console.log('🔄 Replacing existing wallet...');
      await deleteWallet(existing.id, userId);
    }
    
    // Store in IndexedDB with userId
    const db = await getDB();
    const walletId = `wallet_${userId}_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      userId, // Associate with Clerk user
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: true, // Imported wallets are already backed up
    });
    
    console.log('✅ Wallet imported and stored');
    
    // Store wallet ID in user-specific localStorage
    localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), walletId);
    localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');
    
    return {
      id: walletId,
      addresses,
      createdAt: new Date().toISOString(),
      mnemonicBackedUp: true,
    };
    
  } catch (error: any) {
    console.error('❌ Failed to import wallet:', error);
    throw error;
  }
}

/**
 * Validate mnemonic phrase (for UI validation)
 */
export function validateMnemonic(mnemonic: string): { valid: boolean; error?: string } {
  try {
    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = cleanMnemonic.split(' ');
    
    if (words.length !== 12 && words.length !== 24) {
      return { 
        valid: false, 
        error: `Invalid word count: ${words.length}. Must be 12 or 24 words.` 
      };
    }
    
    if (!bip39.validateMnemonic(cleanMnemonic)) {
      return { 
        valid: false, 
        error: 'Invalid recovery phrase. Please check your words.' 
      };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid recovery phrase format.' };
  }
}

/**
 * Mark mnemonic as backed up
 */
export async function markMnemonicBackedUp(walletId: string): Promise<void> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (wallet) {
      wallet.mnemonicBackedUp = true;
      await db.put('wallets', wallet);
      console.log('✅ Mnemonic marked as backed up');
    }
  } catch (error) {
    console.error('Failed to mark mnemonic as backed up:', error);
  }
}

/**
 * Unlock wallet with password
 */
export async function unlockWallet(walletId: string, password: string): Promise<UnlockedWallet> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Decrypt mnemonic
    const salt = Buffer.from(wallet.salt, 'hex');
    const mnemonic = decryptData(wallet.encryptedMnemonic, password, salt);
    
    // Verify mnemonic is valid
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid password');
    }
    
    // Derive private keys (only in memory)
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    
    const privateKeys: UnlockedWallet['privateKeys'] = {
      ethereum: '',
      bitcoin: '',
      bsc: '',
      xrp: '',
      solana: '',
    };
    
    const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
    privateKeys.ethereum = ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString('hex') : '';

    const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
    privateKeys.bitcoin = btcNode.privateKey ? Buffer.from(btcNode.privateKey).toString('hex') : '';

    privateKeys.bsc = privateKeys.ethereum;

    const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
    privateKeys.xrp = xrpNode.privateKey ? Buffer.from(xrpNode.privateKey).toString('hex') : '';

    const solNode = derivePath(root, DERIVATION_PATHS.solana);
    privateKeys.solana = solNode.privateKey ? Buffer.from(solNode.privateKey).toString('hex') : '';

    console.log('✅ Wallet unlocked (keys in memory only)');

    return {
      id: wallet.id,
      addresses: wallet.addresses,
      mnemonic,
      privateKeys,
      createdAt: wallet.createdAt,
      mnemonicBackedUp: wallet.mnemonicBackedUp,
    };
    
  } catch (error) {
    console.error('❌ Failed to unlock wallet:', error);
    throw new Error('Failed to unlock wallet. Check your password.');
  }
}

/**
 * Get current wallet info for user (without private keys)
 */
export async function getCurrentWallet(userId: string): Promise<Wallet | null> {
  try {
    const walletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (!walletId) return null;
    
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) return null;
    
    // Verify wallet belongs to this user
    if (wallet.userId !== userId) {
      console.warn('⚠️ Wallet userId mismatch, clearing invalid reference');
      localStorage.removeItem(getUserStorageKey(userId, 'wallet_id'));
      return null;
    }
    
    return {
      id: wallet.id,
      addresses: wallet.addresses,
      createdAt: wallet.createdAt,
      mnemonicBackedUp: wallet.mnemonicBackedUp,
    };
    
  } catch (error) {
    console.error('Failed to get current wallet:', error);
    return null;
  }
}

/**
 * Get private key for signing (with passkey authentication required)
 */
export async function getPrivateKeyForSigning(
  chain: Chain,
  passkeyAuthenticated: boolean,
  userId: string
): Promise<string | null> {
  if (!passkeyAuthenticated) {
    throw new Error('🔒 Passkey authentication required to access private keys');
  }

  try {
    const walletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (!walletId) return null;

    const cacheKey = `${walletId}_${chain}`;
    const cachedKey = keyCache.get(cacheKey);
    if (cachedKey) {
      console.log('✅ Using cached private key (expires in 30s)');
      return cachedKey;
    }

    throw new Error('🔒 Private key expired. Please re-authenticate.');
    
  } catch (error) {
    console.error('❌ Failed to get private key:', error);
    return null;
  }
}

/**
 * Cache private key temporarily
 */
export function cachePrivateKey(walletId: string, chain: Chain, privateKey: string): void {
  const cacheKey = `${walletId}_${chain}`;
  keyCache.set(cacheKey, privateKey);
  console.log(`🔑 Cached ${chain} private key (expires in 30s)`);
}

/**
 * Sign transaction for specific chain
 */
export async function signTransaction(
  walletId: string,
  password: string,
  chain: Chain,
  transaction: any,
  passkeyAuthenticated: boolean
): Promise<string> {
  if (!passkeyAuthenticated) {
    throw new Error('🔒 Passkey authentication required to sign transactions');
  }

  try {
    const wallet = await unlockWallet(walletId, password);
    const privateKey = wallet.privateKeys[chain];
    
    if (!privateKey) {
      throw new Error(`No private key found for chain: ${chain}`);
    }
    
    cachePrivateKey(walletId, chain, privateKey);
    
    let signedTx: string;
    
    switch (chain) {
      case 'ethereum':
      case 'bsc': {
        const ethersWallet = new ethers.Wallet('0x' + privateKey);
        signedTx = await ethersWallet.signTransaction(transaction);
        break;
      }
      
      case 'bitcoin':
        throw new Error('Bitcoin signing not yet implemented');
      
      case 'xrp':
        throw new Error('XRP signing not yet implemented');
      
      case 'solana':
        throw new Error('Solana signing not yet implemented');
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
    
    console.log('✅ Transaction signed successfully');
    return signedTx;
    
  } catch (error) {
    console.error('❌ Failed to sign transaction:', error);
    throw new Error('Failed to sign transaction');
  }
}

/**
 * Export mnemonic (backup) - requires passkey authentication
 */
export async function exportMnemonic(
  walletId: string, 
  password: string,
  passkeyAuthenticated: boolean
): Promise<string> {
  if (!passkeyAuthenticated) {
    throw new Error('🔒 Passkey authentication required to export mnemonic');
  }

  const wallet = await unlockWallet(walletId, password);
  return wallet.mnemonic;
}

/**
 * Delete wallet securely (for specific user)
 */
export async function deleteWallet(walletId: string, userId: string): Promise<void> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    // Verify wallet belongs to this user
    if (wallet && wallet.userId !== userId) {
      throw new Error('Unauthorized: Cannot delete another user\'s wallet');
    }
    
    await db.delete('wallets', walletId);
    
    const storedWalletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (storedWalletId === walletId) {
      localStorage.removeItem(getUserStorageKey(userId, 'wallet_id'));
      localStorage.removeItem(getUserStorageKey(userId, 'wallet_created'));
    }
    
    keyCache.clear();
    
    console.log('✅ Wallet deleted securely');
    
  } catch (error) {
    console.error('❌ Failed to delete wallet:', error);
    throw error;
  }
}

/**
 * Clear all sensitive data from memory
 */
export function clearSensitiveData(): void {
  keyCache.clear();
  console.log('🔒 Cleared all sensitive data from memory');
}

/**
 * Check if user has existing wallet
 */
export async function hasExistingWallet(userId: string): Promise<boolean> {
  try {
    const walletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (!walletId) return false;
    
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    // Verify wallet exists and belongs to this user
    return wallet !== undefined && wallet.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Migrate old wallet to new user-scoped format (run once on login)
 */
export async function migrateWalletToUser(userId: string): Promise<void> {
  try {
    // Check if there's an old wallet without userId
    const oldWalletId = localStorage.getItem('current_wallet_id');
    if (!oldWalletId) return;
    
    // Check if user already has a new wallet
    const newWalletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (newWalletId) return;
    
    const db = await getDB();
    const oldWallet = await db.get('wallets', oldWalletId);
    
    if (oldWallet && !oldWallet.userId) {
      // Migrate: add userId to old wallet
      oldWallet.userId = userId;
      await db.put('wallets', oldWallet);
      
      // Update localStorage
      localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), oldWalletId);
      localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');
      
      // Remove old keys
      localStorage.removeItem('current_wallet_id');
      localStorage.removeItem('wallet_created');
      
      console.log('✅ Migrated wallet to user-scoped storage');
    }
  } catch (error) {
    console.error('Failed to migrate wallet:', error);
  }
}
