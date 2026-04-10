export interface ShamirConfig {
  shares: number;
  threshold: number;
}

const SHARE_COUNT = 3;
const SHARE_THRESHOLD = 2;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function gf256Mul(a: number, b: number): number {
  let product = 0;
  let left = a;
  let right = b;

  for (let i = 0; i < 8; i += 1) {
    if (right & 1) {
      product ^= left;
    }

    const carry = left & 0x80;
    left = (left << 1) & 0xff;

    if (carry) {
      left ^= 0x1b;
    }

    right >>= 1;
  }

  return product;
}

function gf256Pow(value: number, exponent: number): number {
  let result = 1;
  let base = value;
  let power = exponent;

  while (power > 0) {
    if (power & 1) {
      result = gf256Mul(result, base);
    }

    base = gf256Mul(base, base);
    power >>= 1;
  }

  return result;
}

function gf256Inv(value: number): number {
  if (value === 0) {
    throw new Error('Share indices must be distinct');
  }

  return gf256Pow(value, 254);
}

function encodeShare(index: number, shareBytes: Uint8Array): string {
  return index.toString(16).padStart(2, '0') + bytesToHex(shareBytes);
}

function decodeShare(share: string): { index: number; bytes: Uint8Array } {
  if (!share || share.length < 4) {
    throw new Error('Invalid share');
  }

  const normalized = share.trim().toLowerCase();
  const index = parseInt(normalized.slice(0, 2), 16);

  if (!Number.isInteger(index) || index < 1 || index > SHARE_COUNT) {
    throw new Error('Invalid share index');
  }

  return {
    index,
    bytes: hexToBytes(normalized.slice(2)),
  };
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

  if (config.shares !== SHARE_COUNT || config.threshold !== SHARE_THRESHOLD) {
    throw new Error('Only 2-of-3 Shamir configuration is supported');
  }

  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(normalizedMnemonic);
  const coefficients = crypto.getRandomValues(new Uint8Array(secretBytes.length));

  return Array.from({ length: SHARE_COUNT }, (_, shareOffset) => {
    const x = shareOffset + 1;
    const shareBytes = new Uint8Array(secretBytes.length);

    for (let i = 0; i < secretBytes.length; i += 1) {
      shareBytes[i] = secretBytes[i] ^ gf256Mul(coefficients[i], x);
    }

    return encodeShare(x, shareBytes);
  });
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
    const [shareA, shareB] = shares.slice(0, 2).map(decodeShare);

    if (shareA.bytes.length !== shareB.bytes.length) {
      throw new Error('Share lengths do not match');
    }

    const recovered = new Uint8Array(shareA.bytes.length);
    const denominator = shareA.index ^ shareB.index;
    const lambdaA = gf256Mul(shareB.index, gf256Inv(denominator));
    const lambdaB = gf256Mul(shareA.index, gf256Inv(denominator));

    for (let i = 0; i < recovered.length; i += 1) {
      recovered[i] = gf256Mul(shareA.bytes[i], lambdaA) ^ gf256Mul(shareB.bytes[i], lambdaB);
    }

    const decoder = new TextDecoder();
    return decoder.decode(recovered);
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

