// client/src/lib/walletService.ts
// Multi-chain embedded wallet service with AES-256-GCM encryption and multi-user support

import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import { Keypair } from '@solana/web3.js';
import { deriveKeypair, deriveAddress, generateSeed } from 'ripple-keypairs';
import { Wallet as XRPLWallet } from 'xrpl';
import { QBTCKeyPair, qbtcAddressFromCompressedPubKey } from './qbtcService';

/**
 * Encode a credential ID (Uint8Array from credential.rawId) to base64url.
 * Uses Array.from to avoid spread-into-String.fromCharCode argument-count limits.
 */
function credentialIdToB64u(id: Uint8Array): string {
  return btoa(Array.from(id).map(b => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Supported chains
export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana' | 'qbtc';

interface WalletDB extends DBSchema {
  wallets: {
    key: string;
    value: {
      id: string;
      userId: string;
      walletType?: 'legacy' | 'passkey' | 'watch-only';
      // legacy wallets only:
      encryptedMnemonic?: string;
      salt?: string;
      mnemonicBackedUp?: boolean;
      // passkey wallets: PRF-encrypted mnemonic (migration preserves BIP39 keys)
      credentialIdB64?: string;
      rpId?: string;
      prfEncryptedMnemonic?: string; // AES-GCM ciphertext hex, encrypted with PRF masterSeed
      prfEncryptedMnemonicIv?: string; // 12-byte IV hex
      addresses: {
        ethereum: string;
        bitcoin: string;
        bitcoinTestnet: string;
        bsc: string;
        xrp: string;
        xrpTestnet: string;
        solana: string;
        solanaTestnet: string;
        qbtc: string;
        qbtcMainnet: string;
        qbtcVault?: string;
        qbtcVaultMainnet?: string;
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
    };
    indexes: { userId: string };
  };
}

interface Wallet {
  id: string;
  addresses: {
    ethereum: string;
    bitcoin: string;
    bitcoinTestnet: string;
    bsc: string;
    xrp: string;
    xrpTestnet: string;
    solana: string;
    solanaTestnet: string;
    qbtc: string;
    qbtcMainnet: string;
    qbtcVault?: string;
    qbtcVaultMainnet?: string;
  };
  publicKeys?: {
    ethereum: string;
    bitcoin: string;
    bitcoinTestnet?: string;
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
    bitcoinTestnet: string;
    bsc: string;
    xrp: string;
    xrpTestnet: string;
    solana: string;
    qbtc: string;
    qbtcVault: string;
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
  bitcoinTestnet: "m/44'/1'/0'/0/0",
  bsc: "m/44'/60'/0'/0/0",
  xrp: "m/44'/144'/0'/0/0",
  xrpTestnet: "m/44'/144'/1'/0/0",
  solana: "m/44'/501'/0'/0/0",
  solanaTestnet: "m/44'/501'/1'/0/0",
  // I-1: Uses a QBTC-specific coin type (9999) to avoid private-key reuse with BTC.
  // Note: QBTC key derivation in practice uses QBTCKeyPair.fromMasterSeed which
  // derives keys via HMAC rather than this BIP-44 path.
  qbtc: "m/44'/9999'/0'/0/0",
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
        salt: new Uint8Array(salt),
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
        salt: new Uint8Array(salt),
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
function deriveBitcoinAddress(privateKeyBytes: Uint8Array, network: 'mainnet' | 'testnet' = 'mainnet'): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = network === 'testnet' ? 0x6f : 0x00;
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
 * Derive Bitcoin address from a compressed public key (hex) — no private key needed.
 * Used for auto-repair of stored addresses without requiring wallet unlock.
 */
function deriveBitcoinAddressFromPubKeyHex(compressedPubKeyHex: string, network: 'mainnet' | 'testnet'): string {
  const publicKeyBytes = Buffer.from(compressedPubKeyHex, 'hex');
  const sha256Hash = sha256(new Uint8Array(publicKeyBytes));
  const ripemd160Hash = ripemd160(sha256Hash);

  const versionedHash = new Uint8Array(21);
  versionedHash[0] = network === 'testnet' ? 0x6f : 0x00;
  versionedHash.set(ripemd160Hash, 1);

  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);

  return base58Encode(addressBytes);
}

/**
 * Validate that a Bitcoin address prefix matches the expected network.
 * Mainnet P2PKH starts with '1', testnet P2PKH starts with 'm' or 'n'.
 */
function isBitcoinAddressCorrectNetwork(address: string, network: 'mainnet' | 'testnet'): boolean {
  if (!address) return false;
  return network === 'mainnet' ? address.startsWith('1') : /^[mn]/.test(address);
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
    bitcoinTestnet: '',
    bsc: '',
    xrp: '',
    xrpTestnet: '',
    solana: '',
    solanaTestnet: '',
    qbtc: '',
    qbtcMainnet: '',
    qbtcVault: '',
    qbtcVaultMainnet: '',
  };
  
  const publicKeys: Record<Chain, string> = {
    ethereum: '',
    bitcoin: '',
    bsc: '',
    bsc_testnet: '',
    xrp: '',
    solana: '',
    qbtc: '',
  };
  
  // Ethereum
  const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
  if (!ethNode.privateKey) throw new Error('Failed to derive ETH key');
  addresses.ethereum = deriveEthereumAddress(ethNode.privateKey);
  publicKeys.ethereum = Buffer.from(secp256k1.getPublicKey(ethNode.privateKey, false)).toString('hex');
  
  // Bitcoin (mainnet + testnet)
  const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
  if (!btcNode.privateKey) throw new Error('Failed to derive BTC key');
  addresses.bitcoin = deriveBitcoinAddress(btcNode.privateKey, 'mainnet');
  publicKeys.bitcoin = Buffer.from(secp256k1.getPublicKey(btcNode.privateKey, true)).toString('hex');
  const btcTestnetNode = derivePath(root, DERIVATION_PATHS.bitcoinTestnet);
  if (!btcTestnetNode.privateKey) throw new Error('Failed to derive BTC testnet key');
  addresses.bitcoinTestnet = deriveBitcoinAddress(btcTestnetNode.privateKey, 'testnet');
  publicKeys.bitcoinTestnet = Buffer.from(secp256k1.getPublicKey(btcTestnetNode.privateKey, true)).toString('hex');
  
  // BSC (same as Ethereum)
  addresses.bsc = addresses.ethereum;
  publicKeys.bsc = publicKeys.ethereum;
  
  // XRP (mainnet + testnet)
  const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
  if (!xrpNode.privateKey) throw new Error('Failed to derive XRP key');
  addresses.xrp = deriveXRPAddress(xrpNode.privateKey);
  publicKeys.xrp = Buffer.from(secp256k1.getPublicKey(xrpNode.privateKey, true)).toString('hex');
  const xrpTestnetNode = derivePath(root, DERIVATION_PATHS.xrpTestnet);
  if (!xrpTestnetNode.privateKey) throw new Error('Failed to derive XRP testnet key');
  addresses.xrpTestnet = deriveXRPAddress(xrpTestnetNode.privateKey);
  
  // Solana (mainnet + testnet)
  const solNode = derivePath(root, DERIVATION_PATHS.solana);
  if (!solNode.privateKey) throw new Error('Failed to derive SOL key');
  addresses.solana = deriveSolanaAddress(solNode.privateKey);
  publicKeys.solana = Buffer.from(solNode.privateKey).toString('hex');
  const solTestnetNode = derivePath(root, DERIVATION_PATHS.solanaTestnet);
  if (!solTestnetNode.privateKey) throw new Error('Failed to derive SOL testnet key');
  addresses.solanaTestnet = deriveSolanaAddress(solTestnetNode.privateKey);

  // QBTC Hot Wallet (pathIndex 0)
  const qbtcKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 0);
  addresses.qbtc = qbtcKeyPair.getAddress('testnet');
  addresses.qbtcMainnet = qbtcKeyPair.getAddress('mainnet');
  publicKeys.qbtc = qbtcKeyPair.ecdsaPublicKeyHex;

  // QBTC Quantum Vault (pathIndex 1 — PQC-enforced cold storage)
  const vaultKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 1);
  addresses.qbtcVault = vaultKeyPair.getAddress('testnet');
  addresses.qbtcVaultMainnet = vaultKeyPair.getAddress('mainnet');

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
      bitcoinTestnet: '',
      bsc: '',
      xrp: '',
      xrpTestnet: '',
      solana: '',
      qbtc: '',
      qbtcVault: '',
    };
    
    const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
    privateKeys.ethereum = ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString('hex') : '';

    const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
    privateKeys.bitcoin = btcNode.privateKey ? Buffer.from(btcNode.privateKey).toString('hex') : '';
    const btcTestnetNode = derivePath(root, DERIVATION_PATHS.bitcoinTestnet);
    privateKeys.bitcoinTestnet = btcTestnetNode.privateKey ? Buffer.from(btcTestnetNode.privateKey).toString('hex') : '';

    privateKeys.bsc = privateKeys.ethereum;

    const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
    privateKeys.xrp = xrpNode.privateKey ? Buffer.from(xrpNode.privateKey).toString('hex') : '';
    const xrpTestnetNode = derivePath(root, DERIVATION_PATHS.xrpTestnet);
    privateKeys.xrpTestnet = xrpTestnetNode.privateKey ? Buffer.from(xrpTestnetNode.privateKey).toString('hex') : '';

    const solNode = derivePath(root, DERIVATION_PATHS.solana);
    privateKeys.solana = solNode.privateKey ? Buffer.from(solNode.privateKey).toString('hex') : '';
    const solTestnetNode = derivePath(root, DERIVATION_PATHS.solanaTestnet);

    const qbtcKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 0);
    privateKeys.qbtc = qbtcKeyPair.ecdsaPrivateKeyHex;

    // Vault key (pathIndex 1)
    const vaultKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 1);
    privateKeys.qbtcVault = vaultKeyPair.ecdsaPrivateKeyHex;

    // Auto-repair: wallets created by an earlier build may have Bitcoin addresses
    // encoded with the wrong version byte (mainnet stored as testnet-format 'm...'
    // and testnet stored as mainnet-format '1...').  Re-derive using the private
    // keys we just unlocked so the correct Base58Check encoding is stored.
    const mergedAddresses = {
      ethereum: wallet.addresses.ethereum,
      bitcoin: isBitcoinAddressCorrectNetwork(wallet.addresses.bitcoin, 'mainnet')
        ? wallet.addresses.bitcoin
        : deriveBitcoinAddress(btcNode.privateKey!, 'mainnet'),
      bitcoinTestnet: (() => {
        const stored = wallet.addresses.bitcoinTestnet;
        if (!stored) return deriveBitcoinAddress(btcTestnetNode.privateKey!, 'testnet');
        return isBitcoinAddressCorrectNetwork(stored, 'testnet')
          ? stored
          : deriveBitcoinAddress(btcTestnetNode.privateKey!, 'testnet');
      })(),
      bsc: wallet.addresses.bsc,
      xrp: wallet.addresses.xrp,
      xrpTestnet: wallet.addresses.xrpTestnet || deriveXRPAddress(xrpTestnetNode.privateKey!),
      solana: wallet.addresses.solana,
      solanaTestnet: wallet.addresses.solanaTestnet || deriveSolanaAddress(solTestnetNode.privateKey!),
      qbtc: wallet.addresses.qbtc || qbtcKeyPair.getAddress('testnet'),
      qbtcMainnet: wallet.addresses.qbtcMainnet || qbtcKeyPair.getAddress('mainnet'),
      qbtcVault: wallet.addresses.qbtcVault || vaultKeyPair.getAddress('testnet'),
      qbtcVaultMainnet: wallet.addresses.qbtcVaultMainnet || vaultKeyPair.getAddress('mainnet'),
    };

    // Persist any repaired / newly-derived addresses back to IndexedDB.
    const needsUpdate =
      !wallet.addresses.qbtc ||
      !wallet.addresses.qbtcVault ||
      !wallet.addresses.bitcoinTestnet ||
      !wallet.addresses.xrpTestnet ||
      !wallet.addresses.solanaTestnet ||
      wallet.addresses.bitcoin !== mergedAddresses.bitcoin ||
      wallet.addresses.bitcoinTestnet !== mergedAddresses.bitcoinTestnet;

    if (needsUpdate) {
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

    // Auto-repair Bitcoin mainnet address if it was stored with the wrong (testnet) version byte.
    // This can happen with wallets created by an earlier build that had the encoding reversed.
    // We only need the stored public key — no password / private key required.
    let bitcoinAddress = wallet.addresses.bitcoin;
    if (!isBitcoinAddressCorrectNetwork(bitcoinAddress, 'mainnet')) {
      const btcPubKey = wallet.publicKeys?.bitcoin;
      if (btcPubKey) {
        try {
          const repaired = deriveBitcoinAddressFromPubKeyHex(btcPubKey, 'mainnet');
          console.log('🔧 Auto-repaired Bitcoin mainnet address:', repaired);
          bitcoinAddress = repaired;
          wallet.addresses = { ...wallet.addresses, bitcoin: repaired };
          await db.put('wallets', wallet);
        } catch (err) {
          console.warn('Failed to auto-repair Bitcoin mainnet address:', err);
        }
      }
    }

    const addresses = {
      ethereum: wallet.addresses.ethereum,
      bitcoin: bitcoinAddress,
      bitcoinTestnet: wallet.addresses.bitcoinTestnet || '',
      bsc: wallet.addresses.bsc,
      xrp: wallet.addresses.xrp,
      xrpTestnet: wallet.addresses.xrpTestnet || '',
      solana: wallet.addresses.solana,
      solanaTestnet: wallet.addresses.solanaTestnet || '',
      qbtc: qbtcAddress,
      qbtcMainnet: qbtcMainnetAddress,
      qbtcVault: (wallet.addresses as any).qbtcVault || '',
      qbtcVaultMainnet: (wallet.addresses as any).qbtcVaultMainnet || '',
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
  passkeyAuthenticated: boolean,
  masterSeed?: Uint8Array | null,
): Promise<string> {
  // Step 1: Require passkey authentication
  if (!passkeyAuthenticated && !masterSeed) {
    throw new Error('🔒 Passkey authentication required to sign transactions');
  }

  // Step 2: Verify backup before allowing transaction
  // Passkey wallets (masterSeed present) have no mnemonic backup requirement
  if (!masterSeed) {
    const backupVerified = await isBackupVerified(walletId);
    if (!backupVerified) {
      throw new Error('Please verify your recovery phrase backup before sending transactions');
    }
  }

  try {
    // Step 3: Unlock wallet and get private key
    const wallet = masterSeed
      ? await unlockWalletWithPasskey(walletId, masterSeed)
      : await unlockWallet(walletId, password);
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
 * Reset wallet password using the seed phrase (re-encrypts the wallet with a new password)
 */
export async function resetWalletPassword(
  userId: string,
  mnemonic: string,
  newPassword: string
): Promise<void> {
  // Validate mnemonic
  const cleaned = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!bip39.validateMnemonic(cleaned)) {
    throw new Error('Invalid seed phrase. Please check every word and try again.');
  }

  // Validate new password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new Error(`Weak password: ${passwordValidation.errors.join(', ')}`);
  }

  const walletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
  if (!walletId) {
    throw new Error('No wallet found for this account.');
  }

  const db = await getDB();
  const wallet = await db.get('wallets', walletId);
  if (!wallet) {
    throw new Error('Wallet record not found in database.');
  }

  // Verify the mnemonic matches the stored wallet by comparing derived addresses
  const { addresses } = await deriveAddressesFromMnemonic(cleaned);
  if (addresses.ethereum.toLowerCase() !== wallet.addresses.ethereum.toLowerCase()) {
    throw new Error('Seed phrase does not match this wallet. Please use the correct seed phrase.');
  }

  // Re-encrypt with new password and new salt
  const newSalt = randomBytes(32);
  const encryptedMnemonic = await encryptData(cleaned, newPassword, newSalt);

  wallet.encryptedMnemonic = encryptedMnemonic;
  wallet.salt = Buffer.from(newSalt).toString('hex');
  await db.put('wallets', wallet);

  // Clear any rate-limit counters
  unlockAttempts.delete(walletId);
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
 * Get XRP seed for the testnet derivation path (m/44'/144'/1'/0/0).
 * Use this when operating on XRPL testnet.
 */
export async function getXRPTestnetSeed(walletId: string, password: string): Promise<string> {
  try {
    const wallet = await unlockWallet(walletId, password);
    const xrpPrivateKey = wallet.privateKeys.xrpTestnet;
    
    if (!xrpPrivateKey) {
      throw new Error('XRP testnet private key not found');
    }
    
    const entropy = Buffer.from(Buffer.from(xrpPrivateKey, 'hex').slice(0, 16));
    const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
    
    return seed;
  } catch (error) {
    console.error('Failed to get XRP testnet seed:', error);
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

// ── Passkey PRF-based wallet ─────────────────────────────────────────────────
//
// Derives all chain private keys from a 32-byte PRF seed using HMAC-SHA512.
// No mnemonic, no password, no BIP39. Same passkey → same addresses forever,
// backed by Google/Apple account sync.

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function deriveChainKey(masterSeed: Uint8Array, label: string): Uint8Array {
  return hmacSha512(masterSeed, new TextEncoder().encode(label)).slice(0, 32);
}

/**
 * Derive all multi-chain addresses from a raw 32-byte PRF master seed.
 * Uses HMAC-SHA512 with chain-specific labels — deterministic, no BIP39.
 */
export async function deriveAddressesFromPRFSeed(masterSeed: Uint8Array): Promise<{
  addresses: Wallet['addresses'];
  publicKeys: Record<string, string>;
  privateKeys: UnlockedWallet['privateKeys'];
}> {
  // ETH / BSC
  const ethPriv = deriveChainKey(masterSeed, 'BEARTEC-ETH-V1');
  const ethAddress = deriveEthereumAddress(ethPriv);

  // BTC mainnet + testnet
  const btcPriv = deriveChainKey(masterSeed, 'BEARTEC-BTC-V1');
  const btcAddress = deriveBitcoinAddress(btcPriv, 'mainnet');
  const btcTestPriv = deriveChainKey(masterSeed, 'BEARTEC-BTC-TESTNET-V1');
  const btcTestAddress = deriveBitcoinAddress(btcTestPriv, 'testnet');

  // XRP mainnet + testnet
  const xrpPriv = deriveChainKey(masterSeed, 'BEARTEC-XRP-V1');
  const xrpAddress = deriveXRPAddress(xrpPriv);
  const xrpTestPriv = deriveChainKey(masterSeed, 'BEARTEC-XRP-TESTNET-V1');
  const xrpTestAddress = deriveXRPAddress(xrpTestPriv);

  // Solana mainnet + testnet
  const solPriv = deriveChainKey(masterSeed, 'BEARTEC-SOL-V1');
  const solAddress = deriveSolanaAddress(solPriv);
  const solTestPriv = deriveChainKey(masterSeed, 'BEARTEC-SOL-TESTNET-V1');
  const solTestAddress = deriveSolanaAddress(solTestPriv);

  // qBTC (uses existing HMAC derivation, pathIndex=0 hot + pathIndex=1 vault)
  const qbtcKeyPair = await QBTCKeyPair.fromMasterSeed(masterSeed, 0);
  const qbtcVaultKeyPair = await QBTCKeyPair.fromMasterSeed(masterSeed, 1);

  const addresses: Wallet['addresses'] = {
    ethereum: ethAddress,
    bitcoin: btcAddress,
    bitcoinTestnet: btcTestAddress,
    bsc: ethAddress,
    xrp: xrpAddress,
    xrpTestnet: xrpTestAddress,
    solana: solAddress,
    solanaTestnet: solTestAddress,
    qbtc: qbtcKeyPair.getAddress('testnet'),
    qbtcMainnet: qbtcKeyPair.getAddress('mainnet'),
    qbtcVault: qbtcVaultKeyPair.getAddress('testnet'),
    qbtcVaultMainnet: qbtcVaultKeyPair.getAddress('mainnet'),
  };

  const publicKeys: Record<string, string> = {
    ethereum: Buffer.from(secp256k1.getPublicKey(ethPriv, false)).toString('hex'),
    bitcoin: Buffer.from(secp256k1.getPublicKey(btcPriv, true)).toString('hex'),
    bitcoinTestnet: Buffer.from(secp256k1.getPublicKey(btcTestPriv, true)).toString('hex'),
    bsc: Buffer.from(secp256k1.getPublicKey(ethPriv, false)).toString('hex'),
    xrp: Buffer.from(secp256k1.getPublicKey(xrpPriv, true)).toString('hex'),
    solana: Buffer.from(solPriv).toString('hex'),
    qbtc: qbtcKeyPair.ecdsaPublicKeyHex,
  };

  const privateKeys: UnlockedWallet['privateKeys'] = {
    ethereum: Buffer.from(ethPriv).toString('hex'),
    bitcoin: Buffer.from(btcPriv).toString('hex'),
    bitcoinTestnet: Buffer.from(btcTestPriv).toString('hex'),
    bsc: Buffer.from(ethPriv).toString('hex'),
    xrp: Buffer.from(xrpPriv).toString('hex'),
    xrpTestnet: Buffer.from(xrpTestPriv).toString('hex'),
    solana: Buffer.from(solPriv).toString('hex'),
    qbtc: qbtcKeyPair.ecdsaPrivateKeyHex,
    qbtcVault: qbtcVaultKeyPair.ecdsaPrivateKeyHex,
  };

  return { addresses, publicKeys, privateKeys };
}

/**
 * Create a new passkey-secured wallet. No mnemonic, no password.
 * masterSeed and credentialId come from registerPasskeyWithPRF().
 */
export async function createWalletFromPasskey(
  userId: string,
  masterSeed: Uint8Array,
  credentialId: Uint8Array,
  rpId: string,
): Promise<Wallet> {
  const existing = await getCurrentWallet(userId);
  if (existing) {
    throw new Error('Wallet already exists for this account.');
  }

  const { addresses, publicKeys } = await deriveAddressesFromPRFSeed(masterSeed);

  const db = await getDB();
  const walletId = `wallet_${userId}_${Date.now()}`;
  const credentialIdB64 = credentialIdToB64u(credentialId);

  await db.put('wallets', {
    id: walletId,
    userId,
    walletType: 'passkey',
    credentialIdB64,
    rpId,
    addresses,
    publicKeys,
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), walletId);
  localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');

  return { id: walletId, addresses, publicKeys, createdAt: new Date().toISOString() };
}

/**
 * Import a watch-only wallet from cold signer public keys.
 * No private keys — can view balances, sign via cold signer QR flow.
 */
export async function createWatchOnlyWallet(
  userId: string,
  addresses: Wallet['addresses'],
  publicKeys: Record<string, string>,
): Promise<Wallet> {
  const existing = await getCurrentWallet(userId);
  if (existing) {
    await deleteWallet(existing.id, userId);
  }

  const db = await getDB();
  const walletId = `wallet_${userId}_${Date.now()}`;

  await db.put('wallets', {
    id: walletId,
    userId,
    walletType: 'watch-only',
    addresses,
    publicKeys,
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem(getUserStorageKey(userId, 'wallet_id'), walletId);
  localStorage.setItem(getUserStorageKey(userId, 'wallet_created'), 'true');

  return { id: walletId, addresses, publicKeys, createdAt: new Date().toISOString() };
}

/**
 * Unlock a passkey wallet — derive private keys from PRF masterSeed in memory.
 * masterSeed comes from authenticateWithPasskeyPRF().
 */
/**
 * Encrypt a mnemonic using an AES-GCM key derived from the PRF masterSeed.
 * Returns { encryptedHex, ivHex }.
 */
async function encryptMnemonicWithPRF(
  mnemonic: string,
  masterSeed: Uint8Array,
): Promise<{ encryptedHex: string; ivHex: string }> {
  // Derive a 256-bit AES key from masterSeed via HMAC-SHA512 (first 32 bytes)
  const keyBytes = hmac(sha512, masterSeed, new TextEncoder().encode('BEARTEC-MNEMONIC-ENC-V1')).slice(0, 32);
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(mnemonic));
  return {
    encryptedHex: Buffer.from(ciphertext).toString('hex'),
    ivHex: Buffer.from(iv).toString('hex'),
  };
}

/**
 * Decrypt a PRF-encrypted mnemonic.
 */
async function decryptMnemonicWithPRF(
  encryptedHex: string,
  ivHex: string,
  masterSeed: Uint8Array,
): Promise<string> {
  const keyBytes = hmac(sha512, masterSeed, new TextEncoder().encode('BEARTEC-MNEMONIC-ENC-V1')).slice(0, 32);
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(encryptedHex, 'hex');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plain);
}

export async function unlockWalletWithPasskey(
  walletId: string,
  masterSeed: Uint8Array,
): Promise<UnlockedWallet> {
  const db = await getDB();
  const wallet = await db.get('wallets', walletId);
  if (!wallet) throw new Error('Wallet not found');

  // Migrated legacy wallet: decrypt BIP39 mnemonic with PRF key → same addresses
  if (wallet.prfEncryptedMnemonic && wallet.prfEncryptedMnemonicIv) {
    const mnemonic = await decryptMnemonicWithPRF(
      wallet.prfEncryptedMnemonic,
      wallet.prfEncryptedMnemonicIv,
      masterSeed,
    );
    const { addresses: derivedAddresses, privateKeys } = await deriveKeysFromMnemonic(mnemonic);
    return {
      id: wallet.id,
      addresses: wallet.addresses,
      mnemonic,
      privateKeys,
      createdAt: wallet.createdAt,
    };
  }

  // Brand-new passkey wallet: derive keys from HMAC-SHA512 chains
  const { addresses, privateKeys } = await deriveAddressesFromPRFSeed(masterSeed);
  return {
    id: wallet.id,
    addresses: wallet.addresses,
    mnemonic: '',
    privateKeys,
    createdAt: wallet.createdAt,
  };
}

/**
 * Check if the stored wallet for a user is passkey-type (vs legacy password wallet).
 */
export async function getWalletType(
  userId: string,
): Promise<'passkey' | 'watch-only' | 'legacy' | null> {
  const wallet = await getCurrentWallet(userId);
  if (!wallet) return null;
  const db = await getDB();
  const record = await db.get('wallets', wallet.id);
  if (!record) return null;
  return (record.walletType as 'passkey' | 'watch-only' | 'legacy') ?? 'legacy';
}

/**
 * Get the stored credentialId for an existing passkey wallet.
 */
export async function getWalletCredentialId(userId: string): Promise<string | null> {
  const wallet = await getCurrentWallet(userId);
  if (!wallet) return null;
  const db = await getDB();
  const record = await db.get('wallets', wallet.id);
  return record?.credentialIdB64 ?? null;
}

/**
 * Update the stored credentialId for a wallet.
 * Called after a successful PRF authentication so the ID from assertion.rawId
 * (which Chrome definitely recognises) replaces the ID from registration.
 */
export async function updateWalletCredentialId(walletId: string, credentialIdB64: string): Promise<void> {
  try {
    const db = await getDB();
    const record = await db.get('wallets', walletId);
    if (record) {
      record.credentialIdB64 = credentialIdB64;
      await db.put('wallets', record);
    }
  } catch (err) {
    console.warn('Failed to update stored credential ID:', err);
  }
}

/**
 * Get XRP seed string from a PRF master seed (passkey wallet path).
 * Mirrors the entropy-based generation used in getXRPSeed/getXRPTestnetSeed.
 */
export function getXRPSeedFromMasterSeed(masterSeed: Uint8Array, testnet: boolean): string {
  const label = testnet ? 'BEARTEC-XRP-TESTNET-V1' : 'BEARTEC-XRP-V1';
  const xrpPriv = hmac(sha512, masterSeed, new TextEncoder().encode(label)).slice(0, 32);
  const entropy = Buffer.from(xrpPriv.slice(0, 16));
  return generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
}

/**
 * Derive private keys from a BIP39 mnemonic (in-memory only, not stored).
 * Used during passkey migration to keep existing keys.
 */
async function deriveKeysFromMnemonic(mnemonic: string): Promise<{
  addresses: Wallet['addresses'];
  privateKeys: UnlockedWallet['privateKeys'];
}> {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
  const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
  const btcTestnetNode = derivePath(root, DERIVATION_PATHS.bitcoinTestnet);
  const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
  const xrpTestnetNode = derivePath(root, DERIVATION_PATHS.xrpTestnet);
  const solNode = derivePath(root, DERIVATION_PATHS.solana);
  const solTestnetNode = derivePath(root, DERIVATION_PATHS.solanaTestnet);
  const qbtcKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 0);
  const vaultKeyPair = await QBTCKeyPair.fromMasterSeed(seed, 1);

  const privateKeys: UnlockedWallet['privateKeys'] = {
    ethereum: ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString('hex') : '',
    bitcoin: btcNode.privateKey ? Buffer.from(btcNode.privateKey).toString('hex') : '',
    bitcoinTestnet: btcTestnetNode.privateKey ? Buffer.from(btcTestnetNode.privateKey).toString('hex') : '',
    bsc: ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString('hex') : '',
    xrp: xrpNode.privateKey ? Buffer.from(xrpNode.privateKey).toString('hex') : '',
    xrpTestnet: xrpTestnetNode.privateKey ? Buffer.from(xrpTestnetNode.privateKey).toString('hex') : '',
    solana: solNode.privateKey ? Buffer.from(solNode.privateKey).toString('hex') : '',
    qbtc: qbtcKeyPair.ecdsaPrivateKeyHex,
    qbtcVault: vaultKeyPair.ecdsaPrivateKeyHex,
  };

  const ethAddr = deriveEthereumAddress(ethNode.privateKey!);
  const addresses: Wallet['addresses'] = {
    ethereum: ethAddr,
    bitcoin: deriveBitcoinAddress(btcNode.privateKey!, 'mainnet'),
    bitcoinTestnet: deriveBitcoinAddress(btcTestnetNode.privateKey!, 'testnet'),
    bsc: ethAddr,
    xrp: deriveXRPAddress(xrpNode.privateKey!),
    xrpTestnet: deriveXRPAddress(xrpTestnetNode.privateKey!),
    solana: deriveSolanaAddress(solNode.privateKey!),
    solanaTestnet: deriveSolanaAddress(solTestnetNode.privateKey!),
    qbtc: qbtcKeyPair.getAddress('testnet'),
    qbtcMainnet: qbtcKeyPair.getAddress('mainnet'),
    qbtcVault: vaultKeyPair.getAddress('testnet'),
    qbtcVaultMainnet: vaultKeyPair.getAddress('mainnet'),
  };

  return { addresses, privateKeys };
}

/**
 * Migrate an existing legacy (BIP39/password) wallet to passkey security.
 * Re-encrypts the existing mnemonic with the PRF masterSeed — same addresses,
 * no fund transfer required. Old password-based encryption is replaced.
 */
export async function migrateToPasskey(
  userId: string,
  masterSeed: Uint8Array,
  credentialId: Uint8Array,
  rpId: string,
  existingPassword: string,
): Promise<Wallet> {
  const walletId = localStorage.getItem(getUserStorageKey(userId, 'wallet_id'));
  if (!walletId) throw new Error('No wallet found to migrate');

  // Unlock legacy wallet to get the mnemonic
  const unlocked = await unlockWallet(walletId, existingPassword);
  const mnemonic = unlocked.mnemonic;
  if (!mnemonic) throw new Error('Could not retrieve mnemonic from legacy wallet');

  // Re-encrypt mnemonic with PRF masterSeed (AES-GCM, no PBKDF2)
  const { encryptedHex, ivHex } = await encryptMnemonicWithPRF(mnemonic, masterSeed);

  const credentialIdB64 = credentialIdToB64u(credentialId);

  const db = await getDB();
  const existing = await db.get('wallets', walletId);
  if (!existing) throw new Error('Wallet DB record not found');

  // Update the wallet record in-place: keep same addresses, add passkey fields
  await db.put('wallets', {
    ...existing,
    walletType: 'passkey',
    credentialIdB64,
    rpId,
    prfEncryptedMnemonic: encryptedHex,
    prfEncryptedMnemonicIv: ivHex,
    // Keep encryptedMnemonic + salt for emergency password-based recovery
  });

  return {
    id: walletId,
    addresses: existing.addresses,
    publicKeys: existing.publicKeys,
    createdAt: existing.createdAt,
  };
}

/**
 * Find the oldest legacy (BIP39/password) wallet for a user if one exists.
 * Used in SecuritySettings to prompt the user to move funds to their new passkey addresses.
 */
export async function getLegacyWallet(userId: string): Promise<Wallet | null> {
  const db = await getDB();
  const all = await db.getAllFromIndex('wallets', 'userId', userId);
  const legacy = all.filter(
    (w) => w.walletType === 'legacy' || (!w.walletType && !w.credentialIdB64),
  );
  if (!legacy.length) return null;
  // Return the oldest one
  legacy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return legacy[0] as unknown as Wallet;
}
