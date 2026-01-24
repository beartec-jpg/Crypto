// client/src/lib/walletService.ts
// Multi-chain embedded wallet service with BTC, ETH, XRP, BSC support and enhanced security

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
const DB_VERSION = 1;

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
    upgrade(db) {
      if (!db.objectStoreNames.contains('wallets')) {
        db.createObjectStore('wallets', { keyPath: 'id' });
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
  // Get compressed public key
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  
  // SHA256 then RIPEMD160
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte (0x00 for mainnet)
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  
  // Combine and encode to Base58
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
  
  // SHA256 then RIPEMD160
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte (0x00 for XRP)
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  
  // Combine and encode to Base58 (XRP uses custom alphabet)
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58EncodeXRP(addressBytes);
}

/**
 * Derive Solana address from private key (ed25519)
 */
function deriveSolanaAddress(seed: Uint8Array): string {
  // Solana uses ed25519, not secp256k1
  // For now, return a placeholder (we'll need @solana/web3.js for proper implementation)
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
  
  // Add leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = '1' + encoded;
  }
  
  return encoded;
}

/**
 * Base58 encoding with XRP alphabet (rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz)
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
async function deriveAddressesFromMnemonic(mnemonic: string): Promise<{
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
  
  // Bitcoin
  const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
  if (!btcNode.privateKey) throw new Error('Failed to derive BTC key');
  addresses.bitcoin = deriveBitcoinAddress(btcNode.privateKey);
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
 * Create a new multi-chain wallet from BIP39 mnemonic
 * Returns the mnemonic so user can back it up!
 */
export async function createWallet(password: string): Promise<WalletCreationResult> {
  try {
    console.log('🔐 Creating new multi-chain wallet...');
    
    // Generate 24-word mnemonic (256 bits entropy)
    const mnemonic = bip39.generateMnemonic(256);
    console.log('✅ Generated mnemonic');
    
    // Derive addresses
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(mnemonic);
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with password
    const salt = randomBytes(32);
    const encryptedMnemonic = encryptData(mnemonic, password, salt);
    
    // Store in IndexedDB
    const db = await getDB();
    const walletId = `wallet_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: false, // Track if user has backed up
    });
    
    console.log('✅ Multi-chain wallet stored in IndexedDB (encrypted)');
    
    // Store wallet ID in localStorage
    localStorage.setItem('current_wallet_id', walletId);
    localStorage.setItem('wallet_created', 'true');
    
    return {
      id: walletId,
      addresses,
      createdAt: new Date().toISOString(),
      mnemonic, // Return mnemonic so UI can show it for backup!
      mnemonicBackedUp: false,
    };
    
  } catch (error) {
    console.error('❌ Failed to create wallet:', error);
    throw new Error('Failed to create wallet. Please try again.');
  }
}

/**
 * Import wallet from mnemonic phrase
 */
export async function importWallet(mnemonic: string, password: string): Promise<Wallet> {
  try {
    console.log('🔐 Importing wallet from mnemonic...');
    
    // Clean up mnemonic (trim whitespace, normalize spaces)
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
    
    // Derive addresses
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(cleanMnemonic);
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with password
    const salt = randomBytes(32);
    const encryptedMnemonic = encryptData(cleanMnemonic, password, salt);
    
    // Store in IndexedDB
    const db = await getDB();
    const walletId = `wallet_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: true, // Imported wallets are already backed up
    });
    
    console.log('✅ Wallet imported and stored');
    
    // Store wallet ID in localStorage
    localStorage.setItem('current_wallet_id', walletId);
    localStorage.setItem('wallet_created', 'true');
    
    return {
      id: walletId,
      addresses,
      createdAt: new Date().toISOString(),
      mnemonicBackedUp: true,
    };
    
  } catch (error: any) {
    console.error('❌ Failed to import wallet:', error);
    throw new Error(error.message || 'Failed to import wallet. Check your recovery phrase.');
  }
}

/**
 * Validate mnemonic phrase (for UI validation)
 */
export function validateMnemonic(mnemonic: string): { valid: boolean; error?: string } {
  try {
    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = cleanMnemonic.split(' ');
    
    // Check word count
    if (words.length !== 12 && words.length !== 24) {
      return { 
        valid: false, 
        error: `Invalid word count: ${words.length}. Must be 12 or 24 words.` 
      };
    }
    
    // Validate with bip39
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
 * Unlock wallet with password (NEVER stores raw keys in localStorage)
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
    
    // Derive private keys (only in memory, never stored)
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

    privateKeys.bsc = privateKeys.ethereum; // Same as ETH

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
 * Get current wallet info (without private keys) - SECURE
 */
export async function getCurrentWallet(): Promise<Wallet | null> {
  try {
    const walletId = localStorage.getItem('current_wallet_id');
    if (!walletId) return null;
    
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) return null;
    
    // NEVER return private keys or mnemonic
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
 * This should ONLY be called during transaction signing
 */
export async function getPrivateKeyForSigning(
  chain: Chain,
  passkeyAuthenticated: boolean
): Promise<string | null> {
  if (!passkeyAuthenticated) {
    throw new Error('🔒 Passkey authentication required to access private keys');
  }

  try {
    const walletId = localStorage.getItem('current_wallet_id');
    if (!walletId) return null;

    // Check cache first (keys auto-expire after 30 seconds)
    const cacheKey = `${walletId}_${chain}`;
    const cachedKey = keyCache.get(cacheKey);
    if (cachedKey) {
      console.log('✅ Using cached private key (expires in 30s)');
      return cachedKey;
    }

    // If not cached, user must re-authenticate
    throw new Error('🔒 Private key expired. Please re-authenticate.');
    
  } catch (error) {
    console.error('❌ Failed to get private key:', error);
    return null;
  }
}

/**
 * Cache private key temporarily (for signing within 30 seconds)
 * Called after successful passkey authentication
 */
export function cachePrivateKey(walletId: string, chain: Chain, privateKey: string): void {
  const cacheKey = `${walletId}_${chain}`;
  keyCache.set(cacheKey, privateKey);
  console.log(`🔑 Cached ${chain} private key (expires in 30s)`);
}

/**
 * Sign transaction for specific chain (with passkey auth)
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
    // Unlock wallet temporarily (keys only in memory)
    const wallet = await unlockWallet(walletId, password);
    const privateKey = wallet.privateKeys[chain];
    
    if (!privateKey) {
      throw new Error(`No private key found for chain: ${chain}`);
    }
    
    // Cache the key for 30 seconds
    cachePrivateKey(walletId, chain, privateKey);
    
    // Sign based on chain
    let signedTx: string;
    
    switch (chain) {
      case 'ethereum':
      case 'bsc': {
        const ethersWallet = new ethers.Wallet('0x' + privateKey);
        signedTx = await ethersWallet.signTransaction(transaction);
        break;
      }
      
      case 'bitcoin': {
        // Bitcoin transaction signing (would need bitcoinjs-lib)
        throw new Error('Bitcoin signing not yet implemented');
      }
      
      case 'xrp': {
        // XRP transaction signing (would need xrpl library)
        throw new Error('XRP signing not yet implemented');
      }
      
      case 'solana': {
        // Solana transaction signing (would need @solana/web3.js)
        throw new Error('Solana signing not yet implemented');
      }
      
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
 * Delete wallet securely
 */
export async function deleteWallet(walletId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('wallets', walletId);
    
    if (localStorage.getItem('current_wallet_id') === walletId) {
      localStorage.removeItem('current_wallet_id');
      localStorage.removeItem('wallet_created');
    }
    
    // Clear any cached keys
    keyCache.clear();
    
    console.log('✅ Wallet deleted securely');
    
  } catch (error) {
    console.error('❌ Failed to delete wallet:', error);
    throw new Error('Failed to delete wallet');
  }
}

/**
 * Clear all sensitive data from memory (call on logout/unmount)
 */
export function clearSensitiveData(): void {
  keyCache.clear();
  console.log('🔒 Cleared all sensitive data from memory');
}

/**
 * Check if wallet exists
 */
export async function hasExistingWallet(): Promise<boolean> {
  try {
    const walletId = localStorage.getItem('current_wallet_id');
    if (!walletId) return false;
    
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    return wallet !== undefined;
  } catch {
    return false;
  }
}
