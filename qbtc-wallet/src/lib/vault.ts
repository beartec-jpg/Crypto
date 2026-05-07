/**
 * Vault: PIN → PBKDF2 key → AES-256-GCM encrypted master seed
 * All crypto is done via the Web Crypto API (no dependencies).
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;

// Derive a 256-bit vault key from PIN + salt using PBKDF2-SHA-256
export async function deriveVaultKey(pin: string, saltHex: string): Promise<CryptoKey> {
  const salt = hexToBytes(saltHex);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.slice(), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Generate a fresh random 16-byte salt, returned as hex
export function generateSaltHex(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return bytesToHex(salt);
}

// Encrypt 32-byte master seed with vault key. Returns base64 ciphertext + base64 IV.
export async function encryptSeed(
  masterSeed: Uint8Array,
  vaultKey: CryptoKey,
): Promise<{ encryptedSeed: string; seedIv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, masterSeed.slice());
  return {
    encryptedSeed: bytesToBase64(new Uint8Array(ciphertext)),
    seedIv: bytesToBase64(iv),
  };
}

// Decrypt master seed. Throws if PIN is wrong (authentication tag mismatch).
export async function decryptSeed(
  encryptedSeed: string,
  seedIv: string,
  vaultKey: CryptoKey,
): Promise<Uint8Array> {
  const iv = base64ToBytes(seedIv);
  const ciphertext = base64ToBytes(encryptedSeed);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.slice() }, vaultKey, ciphertext.slice());
  return new Uint8Array(plaintext);
}

// Validate PIN: must be at least 6 characters
export function validatePin(pin: string): string | null {
  if (pin.length < 6) return 'PIN must be at least 6 characters';
  return null;
}

// ── utilities ──────────────────────────────────────────────────────────────
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
