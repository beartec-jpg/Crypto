/**
 * Passkey (WebAuthn PRF) vault for the qBTC web wallet.
 *
 * The Secure Enclave / FIDO2 authenticator provides a deterministic 32-byte PRF output
 * for a fixed salt. That output IS the master seed — no mnemonic, no password.
 *
 * Registration:   navigator.credentials.create → credentialId stored in IndexedDB
 * Authentication: navigator.credentials.get    → re-derives same 32-byte PRF output
 *
 * Requirements: Chrome 115+, Safari 17.4+, Firefox 119+
 */

const PRF_SALT = new TextEncoder().encode('QBTC-WALLET-V1-PRF-SALT-2026');

/** Returns the relying-party ID — hostname only, no port. */
export function getDefaultRpId(): string {
  return window.location.hostname; // 'localhost' in dev, 'beartec.uk' in prod
}

/** base64url (no-padding) encode */
export function b64uEncode(bytes: Uint8Array): string {
  const b = btoa(String.fromCharCode(...bytes));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** base64url (no-padding) decode */
export function b64uDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b = atob(padded + '='.repeat(padLen));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a new passkey and return the 32-byte master seed + credentialId.
 * The caller must persist credentialId (via walletStore) for future authentication.
 */
export async function registerPasskey(
  rpId: string,
  label = 'qBTC Wallet',
): Promise<{ masterSeed: Uint8Array; credentialId: Uint8Array }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: 'qBTC Wallet' },
      user: { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256 (P-256)
        { type: 'public-key', alg: -257 },  // RS256 fallback
      ],
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'required',
      },
      extensions: {
        prf: { eval: { first: PRF_SALT } },
      } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error('Passkey registration cancelled');

  const extResults = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const prfOutput = extResults?.prf?.results?.first;
  if (!prfOutput) {
    throw new Error(
      'This device does not support the WebAuthn PRF extension. ' +
      'Use Chrome 115+, Safari 17.4+, or a FIDO2 hardware key with PRF support.',
    );
  }

  return {
    masterSeed: new Uint8Array(prfOutput, 0, 32),
    credentialId: new Uint8Array(credential.rawId),
  };
}

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Authenticate with an existing passkey.
 * Returns the same 32-byte master seed deterministically (same passkey + same PRF salt).
 */
export async function unlockWithPasskey(
  rpId: string,
  credentialId: Uint8Array,
): Promise<Uint8Array> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [{ type: 'public-key', id: credentialId.buffer as ArrayBuffer }],
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: PRF_SALT } },
      } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Passkey authentication cancelled');

  const extResults = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const prfOutput = extResults?.prf?.results?.first;
  if (!prfOutput) throw new Error('PRF extension not available on this credential');

  return new Uint8Array(prfOutput, 0, 32);
}

// ── Support detection ────────────────────────────────────────────────────────

export async function isPasskeySupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return !!(await (
      PublicKeyCredential as {
        isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
      }
    ).isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}
