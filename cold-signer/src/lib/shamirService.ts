import secrets from 'secrets.js-grempe';

export interface ShamirConfig {
  shares: number;
  threshold: number;
}

/**
 * Split a mnemonic into Shamir Secret Shares
 * @param mnemonic 24-word BIP-39 mnemonic
 * @param config Shamir configuration (shares: 3, threshold: 2)
 * @returns Array of base64-encoded shares
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
  
  // Convert mnemonic string to hex for secrets.js
  const hexMnemonic = Buffer.from(normalizedMnemonic, 'utf8').toString('hex');
  
  // Generate shares using secrets.js
  // secrets.js returns shares as hex strings
  const shares = secrets.share(hexMnemonic, config.shares, config.threshold);
  
  // Convert shares to base64 for QR compatibility
  return shares.map(share => Buffer.from(share, 'hex').toString('base64'));
}

/**
 * Reconstruct mnemonic from Shamir Secret Shares
 * @param shares Array of base64-encoded shares (minimum threshold required)
 * @returns Reconstructed mnemonic
 */
export function reconstructMnemonic(shares: string[]): string {
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('At least 2 shares required');
  }

  try {
    // Convert shares back to hex format for secrets.js
    const hexShares = shares.map(share => {
      try {
        return Buffer.from(share, 'base64').toString('hex');
      } catch (e) {
        throw new Error('Invalid share format');
      }
    });

    // Reconstruct the secret
    const hexMnemonic = secrets.combine(hexShares);
    
    // Convert hex back to mnemonic string
    const mnemonic = Buffer.from(hexMnemonic, 'hex').toString('utf8');
    
    return mnemonic;
  } catch (error) {
    throw new Error(`Failed to reconstruct mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a fingerprint for a share (first 8 characters)
 * @param share Base64-encoded share
 * @returns Fingerprint string
 */
export function getShareFingerprint(share: string): string {
  return share.substring(0, 8);
}

/**
 * Validate that shares can reconstruct a secret
 * @param shares Array of base64-encoded shares
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
