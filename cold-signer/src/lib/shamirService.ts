import secrets from 'secrets.js-grempe';

export interface ShamirConfig {
  shares: number;
  threshold: number;
}

/**
 * Split a mnemonic into Shamir Secret Shares
 * @param mnemonic 24-word BIP-39 mnemonic
 * @param config Shamir configuration (shares: 3, threshold: 2)
 * @returns Array of hex-encoded shares (compatible with secrets.js)
 */
export function splitMnemonic(
  mnemonic: string,
  config: ShamirConfig = { shares: 3, threshold: 2 }
): string[] {
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new Error('Invalid mnemonic');
  }

  if (config.shares < 2 || config.threshold < 2 || config.threshold > config.shares) {
    throw new Error('Invalid Shamir configuration');
  }

  // Trim and normalize the mnemonic
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  
  // Convert mnemonic string to hex using TextEncoder (browser-compatible)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(normalizedMnemonic);
  const hexMnemonic = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Generate shares using secrets.js
  // secrets.js returns shares as hex strings - keep them as hex
  const shares = secrets.share(hexMnemonic, config.shares, config.threshold);
  
  return shares;
}

/**
 * Reconstruct mnemonic from Shamir Secret Shares
 * @param shares Array of hex-encoded shares (minimum threshold required)
 * @returns Reconstructed mnemonic
 */
export function reconstructMnemonic(shares: string[]): string {
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('At least 2 shares required');
  }

  try {
    // Reconstruct the secret (hex shares to hex mnemonic)
    const hexMnemonic = secrets.combine(shares);
    
    // Convert hex back to mnemonic string using TextDecoder (browser-compatible)
    const bytes = new Uint8Array(hexMnemonic.length / 2);
    for (let i = 0; i < hexMnemonic.length; i += 2) {
      bytes[i / 2] = parseInt(hexMnemonic.substring(i, i + 2), 16);
    }
    const decoder = new TextDecoder();
    const mnemonic = decoder.decode(bytes);
    
    return mnemonic;
  } catch (error) {
    throw new Error(`Failed to reconstruct mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a fingerprint for a share (first 8 characters)
 * @param share Hex-encoded share
 * @returns Fingerprint string
 */
export function getShareFingerprint(share: string): string {
  return share.substring(0, 8);
}

/**
 * Validate that shares can reconstruct a secret
 * @param shares Array of hex-encoded shares
 * @returns True if shares are valid
 */
export function validateShares(shares: string[]): boolean {
  try {
    reconstructMnemonic(shares);
    return true;
  } catch {
    return false;
  }
}

