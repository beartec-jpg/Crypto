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
2. client/src/components/Wallet/PasskeyAuthModal.tsx
TypeScript
// client/src/components/Wallet/PasskeyAuthModal.tsx
// Passkey authentication modal with create/import wallet options

import { useState, useEffect } from 'react';
import { Lock, Shield, Key, AlertTriangle, Eye, EyeOff, Check, X, Import, Plus } from 'lucide-react';
import { 
  createWallet, 
  importWallet, 
  validateMnemonic, 
  markMnemonicBackedUp,
  hasExistingWallet 
} from '@/lib/walletService';
import { 
  registerPasskey, 
  authenticateWithPasskey, 
  isPasskeyRegistered,
  isWebAuthnSupported 
} from '@/lib/passkeyService';

interface PasskeyAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type ModalMode = 'choose' | 'create' | 'import' | 'backup' | 'authenticate';

export default function PasskeyAuthModal({ onClose, onSuccess }: PasskeyAuthModalProps) {
  const [mode, setMode] = useState<ModalMode>('choose');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);
  
  // Import wallet state
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  
  // Backup state (for new wallet creation)
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);

  useEffect(() => {
    // Check WebAuthn support
    setWebAuthnSupported(isWebAuthnSupported());
    
    // Check if passkey already registered (returning user)
    const checkExisting = async () => {
      const hasWallet = await hasExistingWallet();
      if (hasWallet && isPasskeyRegistered()) {
        setMode('authenticate');
      }
    };
    checkExisting();
  }, []);

  const validatePassword = (): boolean => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (mode === 'create' && password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleCreateWallet = async () => {
    if (!validatePassword()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create wallet and get mnemonic
      const wallet = await createWallet(password);
      
      // Store for backup step
      setGeneratedMnemonic(wallet.mnemonic);
      setWalletId(wallet.id);
      
      // Register passkey
      if (webAuthnSupported) {
        try {
          await registerPasskey('wallet_user');
        } catch (passkeyError) {
          console.warn('Passkey registration failed, continuing with password-only:', passkeyError);
        }
      }
      
      // Move to backup step
      setMode('backup');
      
    } catch (err: any) {
      setError(err.message || 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportWallet = async () => {
    if (!validatePassword()) return;
    
    // Validate mnemonic first
    const validation = validateMnemonic(mnemonicInput);
    if (!validation.valid) {
      setMnemonicError(validation.error || 'Invalid recovery phrase');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setMnemonicError(null);
    
    try {
      // Import wallet
      await importWallet(mnemonicInput, password);
      
      // Register passkey
      if (webAuthnSupported) {
        try {
          await registerPasskey('wallet_user');
        } catch (passkeyError) {
          console.warn('Passkey registration failed, continuing with password-only:', passkeyError);
        }
      }
      
      // Clear sensitive data
      setMnemonicInput('');
      setPassword('');
      
      onSuccess();
      
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await authenticateWithPasskey();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupComplete = async () => {
    if (!backupConfirmed) {
      setError('Please confirm you have saved your recovery phrase');
      return;
    }
    
    if (walletId) {
      await markMnemonicBackedUp(walletId);
    }
    
    // Clear sensitive data
    setGeneratedMnemonic(null);
    setPassword('');
    setConfirmPassword('');
    
    onSuccess();
  };

  const copyMnemonic = () => {
    if (generatedMnemonic) {
      navigator.clipboard.writeText(generatedMnemonic);
      setMnemonicCopied(true);
      setTimeout(() => setMnemonicCopied(false), 3000);
    }
  };

  const renderMnemonicWords = (mnemonic: string) => {
    const words = mnemonic.split(' ');
    return (
      <div className="grid grid-cols-3 gap-2 p-4 bg-gray-900 rounded-lg">
        {words.map((word, index) => (
          <div 
            key={index} 
            className="flex items-center gap-2 p-2 bg-gray-800 rounded text-sm"
          >
            <span className="text-gray-500 w-6">{index + 1}.</span>
            <span className="text-white font-mono">{word}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              {mode === 'backup' ? <Key className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {mode === 'choose' && 'Sovereign Wallet'}
                {mode === 'create' && 'Create New Wallet'}
                {mode === 'import' && 'Import Wallet'}
                {mode === 'backup' && 'Backup Recovery Phrase'}
                {mode === 'authenticate' && 'Unlock Wallet'}
              </h2>
              <p className="text-sm text-gray-400">
                {mode === 'choose' && 'Create or import your wallet'}
                {mode === 'create' && 'Set a strong password'}
                {mode === 'import' && 'Enter your 12 or 24 word phrase'}
                {mode === 'backup' && 'Write down these words safely'}
                {mode === 'authenticate' && 'Verify your identity'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Choose Mode */}
          {mode === 'choose' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('create')}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-semibold">Create New Wallet</p>
                  <p className="text-sm text-white/70">Generate a new multi-chain wallet</p>
                </div>
              </button>

              <button
                onClick={() => setMode('import')}
                className="w-full p-4 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
                  <Import className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-semibold">Import Existing Wallet</p>
                  <p className="text-sm text-gray-400">Restore with recovery phrase</p>
                </div>
              </button>

              <div className="mt-6 p-4 rounded-xl bg-gray-900/50 border border-gray-700">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-400">
                    <p className="font-medium text-emerald-400 mb-1">Your Keys, Your Crypto</p>
                    <p>
                      Your private keys are encrypted and stored locally on this device.
                      We never have access to your funds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Wallet */}
          {mode === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a strong password"
                    className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setMode('choose')}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateWallet}
                  disabled={isLoading || !password || !confirmPassword}
                  className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Create Wallet
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Import Wallet */}
          {mode === 'import' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recovery Phrase
                </label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => {
                    setMnemonicInput(e.target.value);
                    setMnemonicError(null);
                  }}
                  placeholder="Enter your 12 or 24 word recovery phrase, separated by spaces"
                  rows={4}
                  className={`w-full px-4 py-3 rounded-lg bg-gray-900 border ${
                    mnemonicError ? 'border-red-500' : 'border-gray-700'
                  } focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-mono text-sm`}
                />
                {mnemonicError && (
                  <p className="mt-1 text-sm text-red-400">{mnemonicError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Words: {mnemonicInput.trim() ? mnemonicInput.trim().split(/\s+/).length : 0}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set a password for this device"
                    className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Never share your recovery phrase. Anyone with these words can access your funds.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setMode('choose');
                    setMnemonicInput('');
                    setMnemonicError(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImportWallet}
                  disabled={isLoading || !mnemonicInput || !password || !confirmPassword}
                  className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Import className="w-5 h-5" />
                    Import Wallet
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Backup Mnemonic */}
          {mode === 'backup' && generatedMnemonic && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400">Write these words down!</p>
                    <p className="text-sm text-red-300 mt-1">
                      This is the ONLY way to recover your wallet. Store it safely offline.
                      Never share it with anyone.
                    </p>
                  </div>
                </div>
              </div>

              {renderMnemonicWords(generatedMnemonic)}

              <button
                onClick={copyMnemonic}
                className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
              >
                {mnemonicCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>

              <label className="flex items-start gap-3 p-4 rounded-lg bg-gray-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-300">
                  I have written down my recovery phrase and stored it in a safe place.
                  I understand that losing this phrase means losing access to my funds.
                </span>
              </label>
                    <button
                onClick={handleBackupComplete}
                disabled={!backupConfirmed}
                className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-5 h-5" />
                I've Backed Up My Phrase
              </button>
            </div>
          )}

          {/* Authenticate */}
          {mode === 'authenticate' && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-900/30 border border-emerald-700/50 flex items-center justify-center mb-4">
                  <Lock className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-gray-400">
                  Use your passkey or biometrics to unlock your wallet
                </p>
              </div>

              <button
                onClick={handleAuthenticate}
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Unlock with Passkey
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={() => setMode('import')}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Restore from recovery phrase instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
