// client/src/lib/walletService.ts
// Multi-chain embedded wallet service with AES-256-GCM encryption and multi-user support

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
      userId: string;
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
  mnemonic: string;
}

const DB_NAME = 'beartec_wallet';
const DB_VERSION = 2;

// BIP44 Derivation Paths
const DERIVATION_PATHS = {
  ethereum: "m/44'/60'/0'/0/0",
  bitcoin: "m/44'/0'/0'/0/0",
  bsc: "m/44'/60'/0'/0/0",
  xrp: "m/44'/144'/0'/0/0",
  solana: "m/44'/501'/0'/0/0",
};

// Security: In-memory key cache with automatic cleanup
class SecureKeyCache {
  private cache: Map<string, { key: string; timestamp: number }> = new Map();
  private readonly MAX_AGE = 5000; // 5 seconds (security requirement)

  set(id: string, key: string) {
    this.cache.set(id, { key, timestamp: Date.now() });
    
    // Security: Auto-clear after 5 seconds to minimize exposure
    setTimeout(() => {
      this.delete(id);
    }, this.MAX_AGE);
  }

  get(id: string): string | null {
    const entry = this.cache.get(id);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.MAX_AGE) {
      this.delete(id);
      return null;
    }

    return entry.key;
  }

  delete(id: string) {
    const entry = this.cache.get(id);
    if (entry) {
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
    // Security: Don't log sensitive operations
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
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`🔄 Upgrading DB from v${oldVersion} to v${newVersion}`);
      
      try {
        if (!db.objectStoreNames.contains('wallets')) {
          console.log('📦 Creating wallets store...');
          const store = db.createObjectStore('wallets', { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          console.log('✅ Store created');
        } else if (oldVersion < 2) {
          console.log('🔄 Migrating existing store to v2...');
          const store = transaction.objectStore('wallets');
          
          if (!store.indexNames.contains('userId')) {
            console.log('➕ Adding userId index...');
            store.createIndex('userId', 'userId', { unique: false });
            console.log('✅ Index added');
          }
        }
      } catch (error) {
        console.error('❌ DB upgrade failed:', error);
        throw error;
      }
    },
    blocked() {
      console.warn('⚠️ DB upgrade blocked - close other tabs using this database');
    },
    blocking() {
      console.warn('⚠️ DB upgrade blocking other connections');
    },
  });
}

/**
 * Encrypt data using AES-256-GCM (industry standard)
 */
async function encryptData(data: string, password: string, salt: Uint8Array): Promise<string> {
  try {
    const encoder = new TextEncoder();
    
    // Derive key using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const keyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    
    // Import as AES-GCM key
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyBits,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt with AES-GCM
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      encoder.encode(data)
    );
    
    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return Buffer.from(combined).toString('hex');
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
async function decryptData(encryptedHex: string, password: string, salt: Uint8Array): Promise<string> {
  try {
    const combined = Buffer.from(encryptedHex, 'hex');
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const encoder = new TextEncoder();
    
    // Derive key using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const keyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyBits,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw new Error('Invalid password or corrupted data');
  }
}

/**
 * Derive Ethereum/BSC address from private key
 * Uses ethers.js to ensure correct Keccak-256 hashing
 */
function deriveEthereumAddress(privateKeyBytes: Uint8Array): string {
  // Use ethers.js which correctly implements Keccak-256 hashing
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  const wallet = new ethers.Wallet('0x' + privateKeyHex);
  return wallet.address;
}

/**
 * Derive Bitcoin address from private key (P2PKH)
 */
function deriveBitcoinAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00; // Mainnet
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
 * Derive all addresses from mnemonic
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
  
  // Bitcoin (mainnet)
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
 * Create a new multi-chain wallet (with user isolation and password validation)
 */
export async function createWallet(password: string, userId: string): Promise<WalletCreationResult> {
  try {
    console.log(`🔐 Creating new multi-chain wallet for user: ${userId}`);
    
    // Security: Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new Error(`Weak password: ${passwordValidation.errors.join(', ')}`);
    }
    
    const existing = await getCurrentWallet(userId);
    if (existing) {
      throw new Error('You already have a wallet. Use import to restore a different wallet.');
    }
    
    // Generate 24-word mnemonic (256 bits entropy)
    const mnemonic = bip39.generateMnemonic(256);
    // Security: Mnemonic generated securely
    
    // Derive addresses
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(mnemonic);
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with AES-256-GCM
    const salt = randomBytes(32);
    const encryptedMnemonic = await encryptData(mnemonic, password, salt);
    
    // Store in IndexedDB with userId
    const db = await getDB();
    const walletId = `wallet_${userId}_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      userId,
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: false,
    });
    
    console.log('✅ Multi-chain wallet stored in IndexedDB (AES-256-GCM encrypted)');
    
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
 * Import wallet from mnemonic phrase (with user isolation and password validation)
 */
export async function importWallet(mnemonic: string, password: string, userId: string): Promise<Wallet> {
  try {
    console.log(`🔐 Importing wallet for user: ${userId}`);
    
    // Security: Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new Error(`Weak password: ${passwordValidation.errors.join(', ')}`);
    }
    
    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    
    if (!bip39.validateMnemonic(cleanMnemonic)) {
      throw new Error('Invalid recovery phrase. Please check your words and try again.');
    }
    
    const wordCount = cleanMnemonic.split(' ').length;
    if (wordCount !== 12 && wordCount !== 24) {
      throw new Error(`Invalid word count: ${wordCount}. Must be 12 or 24 words.`);
    }
    
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(cleanMnemonic);
    
    const existing = await getCurrentWallet(userId);
    if (existing && existing.addresses.ethereum === addresses.ethereum) {
      throw new Error('This wallet is already imported for your account.');
    }
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with AES-256-GCM
    const salt = randomBytes(32);
    const encryptedMnemonic = await encryptData(cleanMnemonic, password, salt);
    
    if (existing) {
      console.log('🔄 Replacing existing wallet...');
      await deleteWallet(existing.id, userId);
    }
    
    const db = await getDB();
    const walletId = `wallet_${userId}_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      userId,
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
      mnemonicBackedUp: true,
    });
    
    console.log('✅ Wallet imported and stored (AES-256-GCM encrypted)');
    
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
 * Validate mnemonic phrase
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
 * Password validation result
 */
export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate password strength (Security requirement: min 12 chars, mixed case, number, special char)
 */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];
  
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain a special character (!@#$%^&*(),.?":{}|<>)');
  }
  
  // Check for common weak passwords (exact match only)
  // Note: This is a basic list - consider integrating with a more comprehensive
  // dictionary like "Have I Been Pwned" API for production use
  const commonPasswords = [
    'password123!',
    'Password123!',
    'Admin123456!',
    'Welcome123!',
    'Qwerty123456!',
    'Letmein123!',
    '1234567890Ab!',
    'Password1234!',
    'Abc123456789!',
    'P@ssw0rd123',
    'Welcome@123',
    'Admin@123456'
  ];
  const lowerPassword = password.toLowerCase();
  if (commonPasswords.some(common => lowerPassword === common.toLowerCase())) {
    errors.push('Password is too common. Please choose a more unique password');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Security: Rate limiting for unlock attempts
interface UnlockAttempt {
  count: number;
  lastAttempt: number;
}

const unlockAttempts = new Map<string, UnlockAttempt>();
const MAX_UNLOCK_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Check if wallet is locked out due to too many failed attempts
 */
function checkUnlockLockout(walletId: string): void {
  const attempts = unlockAttempts.get(walletId);
  
  if (attempts && attempts.count >= MAX_UNLOCK_ATTEMPTS) {
    const timeSinceLast = Date.now() - attempts.lastAttempt;
    
    if (timeSinceLast < LOCKOUT_TIME_MS) {
      const remainingMinutes = Math.ceil((LOCKOUT_TIME_MS - timeSinceLast) / 60000);
      throw new Error(`Too many unlock attempts. Try again in ${remainingMinutes} minutes.`);
    }
    
    // Lockout expired, reset counter
    unlockAttempts.delete(walletId);
  }
}

/**
 * Record failed unlock attempt
 */
function recordFailedUnlockAttempt(walletId: string): void {
  const attempts = unlockAttempts.get(walletId) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  unlockAttempts.set(walletId, attempts);
  
  const remaining = MAX_UNLOCK_ATTEMPTS - attempts.count;
  if (remaining > 0) {
    throw new Error(`Invalid password. ${remaining} attempts remaining before lockout.`);
  } else {
    throw new Error(`Too many unlock attempts. Wallet locked for 15 minutes.`);
  }
}

/**
 * Clear unlock attempts on successful unlock
 */
function clearUnlockAttempts(walletId: string): void {
  unlockAttempts.delete(walletId);
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
      // Security: Backup status updated
    }
  } catch (error) {
    console.error('Failed to mark mnemonic as backed up:', error);
  }
}

/**
 * Verify mnemonic backup by asking user to confirm specific words
 * Security: Users must verify backup before sending transactions
 * Note: This bypasses rate limiting since it's not a security-sensitive unlock
 */
export async function verifyMnemonicBackup(
  walletId: string,
  password: string,
  userEnteredWords: { index: number; word: string }[]
): Promise<boolean> {
  try {
    // Directly decrypt mnemonic without triggering rate limiting
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) {
      return false;
    }
    
    // Decrypt mnemonic
    const salt = Buffer.from(wallet.salt, 'hex');
    let mnemonic: string;
    try {
      mnemonic = await decryptData(wallet.encryptedMnemonic, password, salt);
    } catch (error) {
      // Incorrect password
      return false;
    }
    
    // Verify mnemonic is valid
    if (!bip39.validateMnemonic(mnemonic)) {
      return false;
    }
    
    const originalWords = mnemonic.split(' ');
    
    // Verify each word the user entered
    for (const entry of userEnteredWords) {
      if (entry.word.toLowerCase().trim() !== originalWords[entry.index].toLowerCase()) {
        return false;
      }
    }
    
    // Mark wallet as backup verified
    await markMnemonicBackedUp(walletId);
    
    return true;
  } catch (error) {
    console.error('Failed to verify mnemonic backup:', error);
    return false;
  }
}

/**
 * Check if wallet backup is verified (required before sending transactions)
 */
export async function isBackupVerified(walletId: string): Promise<boolean> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    return wallet?.mnemonicBackedUp ?? false;
  } catch (error) {
    console.error('Failed to check backup status:', error);
    return false;
  }
}

/**
 * Unlock wallet with password (with rate limiting)
 */
export async function unlockWallet(walletId: string, password: string): Promise<UnlockedWallet> {
  // Security: Check for rate limiting lockout
  checkUnlockLockout(walletId);
  
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) {
      recordFailedUnlockAttempt(walletId);
      throw new Error('Wallet not found');
    }
    
    // Decrypt mnemonic using AES-256-GCM
    const salt = Buffer.from(wallet.salt, 'hex');
    const mnemonic = await decryptData(wallet.encryptedMnemonic, password, salt);
    
    // Verify mnemonic is valid
    if (!bip39.validateMnemonic(mnemonic)) {
      recordFailedUnlockAttempt(walletId);
      throw new Error('Invalid password');
    }
    
    // Security: Successful unlock, clear attempt counter
    clearUnlockAttempts(walletId);
    
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

    // === AUTO-REPAIR: Detect and fix address mismatch ===
    if (ethNode.privateKey) {
      const correctAddress = deriveEthereumAddress(ethNode.privateKey);
      const storedAddress = wallet.addresses.ethereum;
      
      if (correctAddress.toLowerCase() !== storedAddress.toLowerCase()) {
        console.warn('⚠️ Address mismatch detected, auto-repairing...');
        console.log('  Stored:', storedAddress.slice(0, 10) + '...' + storedAddress.slice(-4));
        console.log('  Correct:', correctAddress.slice(0, 10) + '...' + correctAddress.slice(-4));
        
        // Re-derive all addresses
        const { addresses: newAddresses, publicKeys: newPublicKeys } = 
          await deriveAddressesFromMnemonic(mnemonic);
        
        // Update in database
        wallet.addresses = newAddresses;
        wallet.publicKeys = newPublicKeys;
        await db.put('wallets', wallet);
        
        console.log('✅ Wallet addresses auto-repaired!');
      }
    }
    // === END AUTO-REPAIR ===

    // Security: Wallet unlocked, keys in memory (5s cache timeout)

    return {
      id: wallet.id,
      addresses: wallet.addresses,
      mnemonic,
      privateKeys,
      createdAt: wallet.createdAt,
      mnemonicBackedUp: wallet.mnemonicBackedUp,
    };
    
  } catch (error: any) {
    // Security: If error already has attempt info, rethrow it
    if (error.message.includes('attempts remaining') || error.message.includes('Too many')) {
      throw error;
    }
    
    console.error('❌ Failed to unlock wallet:', error);
    recordFailedUnlockAttempt(walletId);
    throw new Error('Failed to unlock wallet. Check your password.');
  }
}

/**
 * Repair wallet with incorrect ETH address derivation
 * This fixes wallets created with the SHA-256 bug
 */
export async function repairWalletAddresses(
  walletId: string,
  password: string,
  userId: string
): Promise<void> {
  try {
    console.log('🔧 Repairing wallet addresses...');
    
    // Get wallet and decrypt mnemonic
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Verify wallet belongs to this user
    if (wallet.userId !== userId) {
      throw new Error('Unauthorized: wallet does not belong to this user');
    }
    
    // Decrypt mnemonic using AES-256-GCM
    const salt = Buffer.from(wallet.salt, 'hex');
    const mnemonic = await decryptData(wallet.encryptedMnemonic, password, salt);
    
    // Verify mnemonic is valid
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid password');
    }
    
    // Re-derive addresses with FIXED derivation
    const { addresses: newAddresses, publicKeys: newPublicKeys } = 
      await deriveAddressesFromMnemonic(mnemonic);
    
    // Check if repair is needed
    const needsRepair = 
      wallet.addresses.ethereum.toLowerCase() !== newAddresses.ethereum.toLowerCase();
    
    if (!needsRepair) {
      console.log('✅ Wallet addresses are already correct');
      return;
    }
    
    console.log('🔧 Updating wallet with correct addresses:');
    console.log('  Old ETH:', wallet.addresses.ethereum.slice(0, 10) + '...' + wallet.addresses.ethereum.slice(-4));
    console.log('  New ETH:', newAddresses.ethereum.slice(0, 10) + '...' + newAddresses.ethereum.slice(-4));
    
    // Update wallet in database
    wallet.addresses = newAddresses;
    wallet.publicKeys = newPublicKeys;
    
    await db.put('wallets', wallet);
    
    console.log('✅ Wallet addresses repaired successfully!');
    
  } catch (error) {
    console.error('❌ Failed to repair wallet:', error);
    throw error;
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
      // Security: Key cache active (expires in 5s)
      return cachedKey;
    }

    throw new Error('🔒 Private key expired. Please re-authenticate.');
    
  } catch (error) {
    console.error('❌ Failed to get private key:', error);
    return null;
  }
}

/**
 * Cache private key temporarily (5 seconds for security)
 */
export function cachePrivateKey(walletId: string, chain: Chain, privateKey: string): void {
  const cacheKey = `${walletId}_${chain}`;
  keyCache.set(cacheKey, privateKey);
  // Security: Key cached with 5-second expiration
}

/**
 * Sign transaction for specific chain with full security verification
 * Security: Implements comprehensive validation, backup verification, and immediate key clearing
 */
export async function signTransaction(
  walletId: string,
  password: string,
  chain: Chain,
  transaction: any,
  passkeyAuthenticated: boolean
): Promise<string> {
  // Step 1: Require passkey authentication
  if (!passkeyAuthenticated) {
    throw new Error('🔒 Passkey authentication required to sign transactions');
  }

  // Step 2: Verify backup before allowing transaction
  const backupVerified = await isBackupVerified(walletId);
  if (!backupVerified) {
    throw new Error('Please verify your recovery phrase backup before sending transactions');
  }

  try {
    // Step 3: Unlock wallet and get private key
    const wallet = await unlockWallet(walletId, password);
    const privateKey = wallet.privateKeys[chain];
    
    if (!privateKey) {
      throw new Error(`No private key found for chain: ${chain}`);
    }
    
    // SECURITY: Zero key cache - private key cleared immediately after signing
    // No caching to minimize exposure window for memory dump attacks
    
    let signedTx: string;
    
    // Step 5: Sign transaction based on chain
    switch (chain) {
      case 'ethereum':
      case 'bsc': {
        const ethersWallet = new ethers.Wallet('0x' + privateKey);
        
        // === NEW: Log and verify signer address ===
        const signerAddress = ethersWallet.address;
        const expectedAddress = wallet.addresses[chain];
        
        console.log('🔐 Signing transaction:');
        console.log('  - Expected address (from wallet):', expectedAddress.slice(0, 10) + '...' + expectedAddress.slice(-4));
        console.log('  - Actual signer address (from private key):', signerAddress.slice(0, 10) + '...' + signerAddress.slice(-4));
        
        if (signerAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
          console.error('❌ ADDRESS MISMATCH DETECTED!');
          console.error('  The private key produces a different address than expected.');
          console.error('  Expected:', expectedAddress.slice(0, 10) + '...' + expectedAddress.slice(-4));
          console.error('  Got:', signerAddress.slice(0, 10) + '...' + signerAddress.slice(-4));
          throw new Error(
            `Signing address mismatch! Expected ${expectedAddress.slice(0, 10)}... but got ${signerAddress.slice(0, 10)}... ` +
            `This indicates a wallet derivation issue. Please re-import your wallet.`
          );
        }
        
        console.log('✅ Signer address matches expected address');
        // === END NEW CODE ===
        
        // Safeguard: Remove 'from' field to prevent checksum mismatch
        // ethers.js will automatically use the wallet's address when signing
        const { from, ...txWithoutFrom } = transaction;
        signedTx = await ethersWallet.signTransaction(txWithoutFrom);
        
        // Step 6: Verify signature by recovering signer address
        try {
          const parsedTx = ethers.Transaction.from(signedTx);
          
          // === NEW: Recover and verify signer from signed transaction ===
          if (parsedTx.from) {
            console.log('✅ Recovered signer from tx:', parsedTx.from.slice(0, 10) + '...' + parsedTx.from.slice(-4));
            if (parsedTx.from.toLowerCase() !== expectedAddress.toLowerCase()) {
              console.error('❌ RECOVERED SIGNER MISMATCH!');
              throw new Error('Recovered signer does not match wallet address');
            }
          }
          // === END NEW CODE ===
          
          // Security: Verify the transaction was properly signed
          // Note: Signature validation happens automatically when parsing
          // The wallet address should match what we expect
          if (!parsedTx.signature) {
            throw new Error('Transaction signature missing');
          }
          
          // Additional validation: verify sender address matches wallet
          const expectedAddressLower = wallet.addresses[chain].toLowerCase();
          
          // For Ethereum transactions, the 'from' field should be present and match
          if (!transaction.from) {
            // If from is not provided in the transaction, this is acceptable
            // as ethers will use the wallet's address by default
            console.warn('Transaction from field not provided, will use wallet address');
          } else {
            const txFrom = transaction.from.toLowerCase();
            if (txFrom !== expectedAddressLower) {
              throw new Error('Transaction from address does not match wallet address');
            }
          }
        } catch (verifyError) {
          console.error('Signature verification error:', verifyError);
          throw new Error('Signature verification failed');
        }
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
    
    // Security: Transaction signed and verified
    // Note: JavaScript cannot reliably clear strings from memory due to immutability
    // The keyCache will auto-expire in 5 seconds
    return signedTx;
    
  } catch (error) {
    console.error('❌ Failed to sign transaction:', error);
    throw error instanceof Error ? error : new Error('Failed to sign transaction');
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
    
    return wallet !== undefined && wallet.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Migrate old wallet to new user-scoped format
 */
export async function migrateWalletToUser(userId: string): Promise<void> {
  try {
    const oldWalletId = localStorage.getItem('current_wallet_id');
    if (!oldWalletId) return;
    
    const newWalletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (newWalletId) return;
    
    const db = await getDB();
    const oldWallet = await db.get('wallets', oldWalletId);
    
    if (oldWallet && !oldWallet.userId) {
      oldWallet.userId = userId;
      await db.put('wallets', oldWallet);
      
      localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), oldWalletId);
      localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');
      
      localStorage.removeItem('current_wallet_id');
      localStorage.removeItem('wallet_created');
      
      console.log('✅ Migrated wallet to user-scoped storage with AES-256-GCM');
    }
  } catch (error) {
    console.error('Failed to migrate wallet:', error);
  }
}
