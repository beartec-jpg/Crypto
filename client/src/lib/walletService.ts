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
import { Keypair } from '@solana/web3.js';
import { deriveKeypair, deriveAddress, generateSeed } from 'ripple-keypairs';
import { Wallet as XRPLWallet } from 'xrpl';
import { QBTCKeyPair, qbtcAddressFromCompressedPubKey } from './qbtcService';

// Supported chains
export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana' | 'qbtc';

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
        qbtc: string;
        qbtcMainnet: string;
      };
      publicKeys: {
        ethereum: string;
        bitcoin: string;
        bsc: string;
        xrp: string;
        solana: string;
        qbtc: string;
      };
      createdAt: string;
      salt: string;
      mnemonicBackedUp?: boolean;
    };
    indexes: { userId: string };
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
    qbtc: string;
    qbtcMainnet: string;
  };
  publicKeys?: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
    qbtc: string;
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
    qbtc: string;
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
  qbtc: "m/44'/0'/0'/0/0",
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
 * Derive XRP address using STANDARD XRPL.js method ONLY
 * NO custom derivation, NO legacy support
 */
function deriveXRPAddress(privateKeyBytes: Uint8Array): string {
  // Use first 16 bytes as entropy for seed generation (XRPL standard)
  const entropy = Buffer.from(privateKeyBytes.slice(0, 16));
  
  // Generate seed using ripple-keypairs standard method
  const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
  
  // Create wallet from seed using XRPL.js (standard library method)
  const wallet = XRPLWallet.fromSeed(seed);
  
  return wallet.address;
}

/**
 * Derive Solana address from private key
 * Uses proper Ed25519 keypair derivation
 */
function deriveSolanaAddress(privateKeyBytes: Uint8Array): string {
  // Solana uses Ed25519 - the private key IS the seed for the keypair
  // Take first 32 bytes as the seed (BIP44 derived key is 32 bytes)
  const seed = privateKeyBytes.slice(0, 32);
  const keypair = Keypair.fromSeed(seed);
  
  return keypair.publicKey.toBase58();
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
 * Derive all addresses from mnemonic
 */
export async function deriveAddressesFromMnemonic(mnemonic: string): Promise<{
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
    qbtc: '',
    qbtcMainnet: '',
  };
  
  const publicKeys: Record<Chain, string> = {
    ethereum: '',
    bitcoin: '',
    bsc: '',
    xrp: '',
    solana: '',
    qbtc: '',
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

  // QBTC (default to testnet address format)
  const qbtcKeyPair = QBTCKeyPair.fromMasterSeed(seed, 0);
  addresses.qbtc = qbtcKeyPair.getAddress('testnet');
  addresses.qbtcMainnet = qbtcKeyPair.getAddress('mainnet');
  publicKeys.qbtc = qbtcKeyPair.ecdsaPublicKeyHex;

  if (!addresses.qbtc || !addresses.qbtc.startsWith('qbtct1')) {
    throw new Error('Failed to derive QBTC testnet address for new wallet');
  }
  
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
    
    // Derive addresses
    const { addresses, publicKeys } = await deriveAddressesFromMnemonic(mnemonic);

    if (!addresses.qbtc || !addresses.qbtc.startsWith('qbtct1')) {
      throw new Error('QBTC testnet address derivation failed during wallet creation');
    }
    
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

    if (!addresses.qbtc || !addresses.qbtc.startsWith('qbtct1')) {
      throw new Error('QBTC testnet address derivation failed during wallet import');
    }
    
    const existing = await getCurrentWallet(userId);
    
    console.log('✅ Derived addresses:', addresses);
    
    // Encrypt mnemonic with AES-256-GCM
    const salt = randomBytes(32);
    const encryptedMnemonic = await encryptData(cleanMnemonic, password, salt);
    
    if (existing) {
      if (existing.addresses.ethereum === addresses.ethereum) {
        console.log('🔄 Re-importing same wallet for this account...');
      } else {
        console.log('🔄 Replacing existing wallet...');
      }
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
  
  // Check for common weak passwords
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
const LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 minutes

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
    }
  } catch (error) {
    console.error('Failed to mark mnemonic as backed up:', error);
  }
}

/**
 * Verify mnemonic backup by asking user to confirm specific words
 */
export async function verifyMnemonicBackup(
  walletId: string,
  password: string,
  userEnteredWords: { index: number; word: string }[]
): Promise<boolean> {
  try {
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
 * Check if wallet backup is verified
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
      throw new Error('Wallet not found');
    }
    
    // Decrypt mnemonic using AES-256-GCM
    const salt = Buffer.from(wallet.salt, 'hex');
    let mnemonic = '';
    try {
      mnemonic = await decryptData(wallet.encryptedMnemonic, password, salt);
    } catch {
      recordFailedUnlockAttempt(walletId);
      throw new Error('Invalid password');
    }
    
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
      qbtc: '',
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

    const qbtcKeyPair = QBTCKeyPair.fromMasterSeed(seed, 0);
    privateKeys.qbtc = qbtcKeyPair.ecdsaPrivateKeyHex;

    // No auto-repair - wallets must be created fresh with correct derivation

    const mergedAddresses = {
      ethereum: wallet.addresses.ethereum,
      bitcoin: wallet.addresses.bitcoin,
      bsc: wallet.addresses.bsc,
      xrp: wallet.addresses.xrp,
      solana: wallet.addresses.solana,
      qbtc: wallet.addresses.qbtc || qbtcKeyPair.getAddress('testnet'),
      qbtcMainnet: wallet.addresses.qbtcMainnet || qbtcKeyPair.getAddress('mainnet'),
    };

    // Auto-upgrade older wallet records that were created before QBTC support.
    if (!wallet.addresses.qbtc) {
      wallet.addresses = mergedAddresses;
      wallet.publicKeys = {
        ...wallet.publicKeys,
        qbtc: qbtcKeyPair.ecdsaPublicKeyHex,
      };
      await db.put('wallets', wallet);
    }

    return {
      id: wallet.id,
      addresses: mergedAddresses,
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

    if (error.message === 'Wallet not found' || error.message === 'Invalid password') {
      throw error;
    }
    
    console.error('❌ Failed to unlock wallet:', error);
    throw new Error(error?.message || 'Failed to unlock wallet');
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
    
    let qbtcAddress = wallet.addresses.qbtc || '';

    // If address is missing but public key exists, deterministically rebuild testnet address.
    if (!qbtcAddress) {
      const qbtcPubKey = (wallet as any)?.publicKeys?.qbtc as string | undefined;
      if (qbtcPubKey) {
        try {
          qbtcAddress = qbtcAddressFromCompressedPubKey(qbtcPubKey, 'testnet');
          wallet.addresses = {
            ...wallet.addresses,
            qbtc: qbtcAddress,
          };
          await db.put('wallets', wallet);
        } catch (error) {
          console.warn('Failed to reconstruct QBTC address from stored public key:', error);
        }
      }
    }

    let qbtcMainnetAddress = (wallet.addresses as any).qbtcMainnet || '';
    if (!qbtcMainnetAddress) {
      const qbtcPubKey = (wallet as any)?.publicKeys?.qbtc as string | undefined;
      if (qbtcPubKey) {
        try {
          qbtcMainnetAddress = qbtcAddressFromCompressedPubKey(qbtcPubKey, 'mainnet');
        } catch {}
      }
    }

    const addresses = {
      ethereum: wallet.addresses.ethereum,
      bitcoin: wallet.addresses.bitcoin,
      bsc: wallet.addresses.bsc,
      xrp: wallet.addresses.xrp,
      solana: wallet.addresses.solana,
      qbtc: qbtcAddress,
      qbtcMainnet: qbtcMainnetAddress,
    };

    return {
      id: wallet.id,
      addresses,
      publicKeys: wallet.publicKeys,
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
}

/**
 * Sign transaction for specific chain with full security verification
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
    
    let signedTx: string;
    
    // Step 4: Sign transaction based on chain
    switch (chain) {
      case 'ethereum':
      case 'bsc': {
        const ethersWallet = new ethers.Wallet('0x' + privateKey);
        
        const signerAddress = ethersWallet.address;
        const expectedAddress = wallet.addresses[chain];
        
        console.log('🔐 Signing transaction:');
        console.log('  - Expected address:', expectedAddress.slice(0, 10) + '...' + expectedAddress.slice(-4));
        console.log('  - Actual signer:', signerAddress.slice(0, 10) + '...' + signerAddress.slice(-4));
        
        if (signerAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
          throw new Error(
            `Signing address mismatch! Expected ${expectedAddress.slice(0, 10)}... but got ${signerAddress.slice(0, 10)}...`
          );
        }
        
        console.log('✅ Signer address matches');
        
        const { from, ...txWithoutFrom } = transaction;
        signedTx = await ethersWallet.signTransaction(txWithoutFrom);
        
        try {
          const parsedTx = ethers.Transaction.from(signedTx);
          
          if (parsedTx.from) {
            console.log('✅ Recovered signer:', parsedTx.from.slice(0, 10) + '...' + parsedTx.from.slice(-4));
            if (parsedTx.from.toLowerCase() !== expectedAddress.toLowerCase()) {
              throw new Error('Recovered signer does not match wallet address');
            }
          }
          
          if (!parsedTx.signature) {
            throw new Error('Transaction signature missing');
          }
          
          const expectedAddressLower = wallet.addresses[chain].toLowerCase();
          
          if (!transaction.from) {
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
      
      case 'xrp': {
        // Use ONLY standard XRPL.js signing
        const entropy = Buffer.from(Buffer.from(privateKey, 'hex').slice(0, 16));
        const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
        const xrpWallet = XRPLWallet.fromSeed(seed);
        
        signedTx = xrpWallet.sign(transaction).tx_blob;
        break;
      }
      
      case 'solana':
        throw new Error('Solana signing not yet implemented');

      case 'qbtc':
        throw new Error('QBTC signing is handled via QBTCChain service');
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
    
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
 * Delete wallet securely (for specific user) + clear all associated data
 */
export async function deleteWallet(walletId: string, userId: string): Promise<void> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (wallet && wallet.userId !== userId) {
      throw new Error('Unauthorized: Cannot delete another user\'s wallet');
    }
    
    // Delete wallet from IndexedDB
    await db.delete('wallets', walletId);
    
    // Clear localStorage references
    const storedWalletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
    if (storedWalletId === walletId) {
      localStorage.removeItem(getUserStorageKey(userId, 'wallet_id'));
      localStorage.removeItem(getUserStorageKey(userId, 'wallet_created'));
    }
    
    // Clear added tokens from localStorage
    localStorage.removeItem(`wallet_tokens_${walletId}`);
    
    // Clear sensitive data from memory
    keyCache.clear();
    
    console.log('✅ Wallet and all associated data deleted securely');
    
  } catch (error) {
    console.error('❌ Failed to delete wallet:', error);
    throw error;
  }
}

/**
 * Remove all wallets for a user from this device (IndexedDB + localStorage refs)
 */
export async function removeAllWalletsForUser(userId: string): Promise<void> {
  // Step 1: Nuke all localStorage keys that relate to this user or any wallet
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.includes(userId) ||
      key.startsWith('wallet_tokens_') ||
      key === 'passkey_credential_id' ||
      key === 'passkey_registered' ||
      key === 'current_wallet_id'
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  keyCache.clear();

  // Step 2: Delete all IndexedDB wallet records for this userId
  // Iterate ALL records to avoid relying on index existing
  try {
    const db = await getDB();
    const allWallets = await db.getAll('wallets');
    const userWallets = allWallets.filter(w => w.userId === userId);
    for (const w of userWallets) {
      await db.delete('wallets', w.id);
    }
    console.log(`✅ Removed ${userWallets.length} wallet(s) from IndexedDB for user ${userId}`);
  } catch (error) {
    // IndexedDB failed — localStorage already cleared so hasExistingWallet returns false
    console.warn('⚠️ IndexedDB cleanup failed (localStorage already cleared):', error);
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
      
      console.log('✅ Migrated wallet to user-scoped storage');
    }
  } catch (error) {
    console.error('Failed to migrate wallet:', error);
  }
}
/**
 * Get XRP seed for wallet operations (used by xrpReserveService and xrpSendService)
 */
export async function getXRPSeed(walletId: string, password: string): Promise<string> {
  try {
    const wallet = await unlockWallet(walletId, password);
    const xrpPrivateKey = wallet.privateKeys.xrp;
    
    if (!xrpPrivateKey) {
      throw new Error('XRP private key not found');
    }
    
    // Generate seed from private key using same method as deriveXRPAddress
    const entropy = Buffer.from(Buffer.from(xrpPrivateKey, 'hex').slice(0, 16));
    const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
    
    return seed;
  } catch (error) {
    console.error('Failed to get XRP seed:', error);
    throw error;
  }
}

/**
 * Get legacy Ethereum address for recovery purposes
 * Uses legacy derivation path m/44'/60'/0'/0 (without leaf index)
 */
export async function getLegacyAddressForRecovery(
  walletId: string,
  password: string
): Promise<{ legacyAddress: string; currentAddress: string; legacyPrivateKey: string } | null> {
  try {
    const wallet = await unlockWallet(walletId, password);
    const mnemonic = wallet.mnemonic;

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = HDKey.fromMasterSeed(seed);

    // Legacy derivation path (without the leaf index)
    const legacyNode = derivePath(root, "m/44'/60'/0'/0");
    if (!legacyNode.privateKey) throw new Error('Failed to derive legacy key');

    const legacyPrivateKey = Buffer.from(legacyNode.privateKey).toString('hex');
    const legacyAddress = deriveEthereumAddress(legacyNode.privateKey);

    return {
      legacyAddress,
      currentAddress: wallet.addresses.ethereum,
      legacyPrivateKey,
    };
  } catch (error) {
    console.error('Failed to get legacy address for recovery:', error);
    return null;
  }
}
export async function getSolanaKeypair(walletId: string, password: string): Promise<Keypair> {
  try {
    const wallet = await unlockWallet(walletId, password);
    const solPrivateKey = wallet.privateKeys.solana;
    
    if (!solPrivateKey) {
      throw new Error('Solana private key not found');
    }
    
    // Create keypair from private key using same method as deriveSolanaAddress
    const privateKeyBytes = Buffer.from(solPrivateKey, 'hex');
    const seed = privateKeyBytes.slice(0, 32);
    const keypair = Keypair.fromSeed(seed);
    
    return keypair;
  } catch (error) {
    console.error('Failed to get Solana keypair:', error);
    throw error;
  }
}
