// client/src/lib/crypto.ts
// Hybrid post-quantum cryptography utilities
// Uses ML-DSA (Dilithium) for post-quantum security + ECDSA for compatibility

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as bip39 from 'bip39';

/**
 * Hybrid key pair containing both post-quantum (ML-DSA) and classical (ECDSA) keys
 * This provides security against both classical and quantum attacks
 */
export interface HybridKeyPair {
  // ML-DSA (Dilithium) keys for post-quantum security
  mlDsaPublicKey: string;
  mlDsaSecretKey: Uint8Array; // Never expose or transmit
  
  // ECDSA secp256k1 keys for EVM compatibility
  ecdsaPublicKey: string;
  ecdsaPrivateKey: Uint8Array; // Never expose or transmit
}

/**
 * Hybrid signature containing both ML-DSA and ECDSA signatures
 */
export interface HybridSignature {
  mlDsaSignature: string;
  ecdsaSignature: string;
  algorithm: 'hybrid-ml-dsa-65-ecdsa-secp256k1';
  timestamp: number;
}

/**
 * Generate a hybrid key pair with both ML-DSA and ECDSA keys
 * ML-DSA provides post-quantum security, ECDSA provides EVM compatibility
 * 
 * SECURITY NOTE: In production, keys should be derived from WebAuthn credentials
 * and stored in the device's secure enclave. Never store raw private keys.
 */
export async function generateHybridKeys(): Promise<HybridKeyPair> {
  // Generate cryptographically secure random seed
  const seed = crypto.getRandomValues(new Uint8Array(32));
  
  // Generate ML-DSA-65 (Dilithium) key pair
  // ML-DSA-65 provides NIST Level 3 security (~192-bit classical, ~128-bit quantum)
  const mlDsaKeys = ml_dsa65.keygen(seed);
  
  // Generate ECDSA secp256k1 key pair (for EVM compatibility)
  const ecdsaPrivateKey = crypto.getRandomValues(new Uint8Array(32));
  const ecdsaPublicKey = secp256k1.getPublicKey(ecdsaPrivateKey);
  
  return {
    mlDsaPublicKey: bytesToHex(mlDsaKeys.publicKey),
    mlDsaSecretKey: mlDsaKeys.secretKey,
    ecdsaPublicKey: bytesToHex(ecdsaPublicKey),
    ecdsaPrivateKey: ecdsaPrivateKey,
  };
}

/**
 * Sign a message using hybrid cryptography (ML-DSA + ECDSA)
 * Both signatures must verify for the transaction to be considered valid
 * 
 * This provides defense-in-depth:
 * - If ECDSA is broken by quantum computers, ML-DSA remains secure
 * - If ML-DSA has implementation issues, ECDSA provides fallback security
 * 
 * @param message - The message bytes to sign
 * @param keys - Optional key pair (if not provided, uses stored keys)
 */
export async function hybridSign(
  message: Uint8Array,
  keys?: HybridKeyPair
): Promise<HybridSignature> {
  // In production, keys would be retrieved from secure enclave via WebAuthn
  // For demo, we generate ephemeral keys if none provided
  const keyPair = keys || await generateHybridKeys();
  
  // Hash the message for consistent signing
  const messageHash = sha256(message);
  
  // Sign with ML-DSA (post-quantum)
  const mlDsaSignature = ml_dsa65.sign(keyPair.mlDsaSecretKey, messageHash);
  
  // Sign with ECDSA (classical, EVM-compatible)
  const ecdsaSignature = secp256k1.sign(messageHash, keyPair.ecdsaPrivateKey);
  
  return {
    mlDsaSignature: bytesToHex(mlDsaSignature),
    ecdsaSignature: ecdsaSignature.toCompactHex(),
    algorithm: 'hybrid-ml-dsa-65-ecdsa-secp256k1',
    timestamp: Date.now(),
  };
}

/**
 * Verify a hybrid signature
 * Both ML-DSA and ECDSA signatures must be valid
 */
export function verifyHybridSignature(
  message: Uint8Array,
  signature: HybridSignature,
  mlDsaPublicKey: string,
  ecdsaPublicKey: string
): boolean {
  try {
    const messageHash = sha256(message);
    
    // Verify ML-DSA signature
    const mlDsaValid = ml_dsa65.verify(
      hexToBytes(mlDsaPublicKey),
      messageHash,
      hexToBytes(signature.mlDsaSignature)
    );
    
    // Verify ECDSA signature
    const ecdsaSig = secp256k1.Signature.fromCompact(signature.ecdsaSignature);
    const ecdsaValid = secp256k1.verify(
      ecdsaSig,
      messageHash,
      hexToBytes(ecdsaPublicKey)
    );
    
    // Both must be valid for hybrid verification to pass
    return mlDsaValid && ecdsaValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Generate a BIP-39 mnemonic for backup purposes
 * WARNING: This should only be used as a last-resort recovery option
 * Passkeys are the primary authentication method
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(256); // 24 words for maximum security
}

/**
 * Validate a BIP-39 mnemonic
 */
