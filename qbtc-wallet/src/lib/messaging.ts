/**
 * End-to-end encrypted messaging via ECDH-P256 + HKDF-SHA256 + AES-256-GCM.
 * The relay server (/api/qbtc/messages) only sees ciphertext — never plaintext.
 */

// ── encryption ─────────────────────────────────────────────────────────────

/**
 * Derive a shared AES-256-GCM key from our ECDH private key + recipient public key.
 * Uses HKDF-SHA256 to stretch the ECDH output into an AES key.
 */
export async function deriveSharedKey(
  ourPrivateKey: CryptoKey,
  theirPublicKeyRaw: Uint8Array,
  context: string = 'QBTC-MSG',
): Promise<CryptoKey> {
  const theirPublicKey = await crypto.subtle.importKey(
    'raw',
    theirPublicKeyRaw.slice(),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    ourPrivateKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(context),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a plaintext message. Returns base64 of IV + ciphertext. */
export async function encryptMessage(plaintext: string, sharedKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, enc.encode(plaintext)),
  );
  // prepend IV so we only need one base64 blob
  const combined = new Uint8Array(12 + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, 12);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt. Throws on authentication failure (tampered/wrong key). */
export async function decryptMessage(encryptedB64: string, sharedKey: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── relay transport ────────────────────────────────────────────────────────

export interface RelayMessage {
  id: string;
  from: string;       // sender qBTC address
  to: string;         // recipient qBTC address
  payload: string;    // base64 AES-256-GCM ciphertext (IV prepended)
  timestamp: number;
}

/**
 * Send an encrypted message via the relay.
 * The payload must already be encrypted before calling this.
 */
export async function sendRelayMessage(
  from: string,
  to: string,
  encryptedPayload: string,
): Promise<{ id: string }> {
  const response = await fetch('/api/qbtc/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, payload: encryptedPayload }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Send failed: ${response.status} ${text}`);
  }
  return response.json() as Promise<{ id: string }>;
}

/**
 * Poll the relay for new messages addressed to `address` since `since`.
 */
export async function pollRelayMessages(
  address: string,
  since = 0,
): Promise<RelayMessage[]> {
  const url = `/api/qbtc/messages/poll?to=${encodeURIComponent(address)}&since=${since}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json() as { messages?: RelayMessage[] };
  return data.messages ?? [];
}
