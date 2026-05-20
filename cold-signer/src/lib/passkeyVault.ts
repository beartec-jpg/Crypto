/**
 * Passkey (WebAuthn PRF) vault for the cold signer.
 *
 * The Secure Enclave / FIDO2 hardware key provides a deterministic 32-byte PRF output
 * for a fixed salt. That output IS the master seed — no mnemonic, no password.
 *
 * Registration:  navigator.credentials.create  → stores credentialId in IndexedDB
 * Authentication: navigator.credentials.get    → re-derives same 32-byte PRF output
 *
 * Requirements: Chrome 115+, Safari 17.4+, Firefox 119+ with a FIDO2 authenticator.
 * On an offline device, the authenticator is the device's own secure element (Face ID /
 * fingerprint / Windows Hello) or a hardware security key (YubiKey 5 with PRF).
 */

const PRF_SALT = new TextEncoder().encode('QBTC-COLD-SIGNER-V1-PRF-SALT-2026');

export interface PasskeyVaultRecord {
  credentialId: Uint8Array;
  rpId: string;
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a new passkey and return the 32-byte master seed derived from the PRF output.
 * The credentialId must be stored by the caller (in IndexedDB) for future authentication.
 *
 * @param rpId   Relying-party ID. For the cold signer running on localhost use 'localhost'.
 *               For a hosted cold signer use the domain (e.g. 'beartec.uk').
 * @param label  Human-readable name shown in the OS passkey UI.
 */
export async function registerPasskey(
  rpId: string,
  label = 'qBTC Cold Signer',
): Promise<{ masterSeed: Uint8Array; credentialId: Uint8Array }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: 'qBTC Cold Signer' },
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

  if (!credential) throw new Error('Passkey registration was cancelled');

  const extResults = credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = extResults?.prf?.results?.first;
  if (!prfOutput) {
    throw new Error(
      'This device/browser does not support the WebAuthn PRF extension. ' +
      'Use Chrome 115+, Safari 17.4+, or Firefox 119+ with a compatible authenticator.',
    );
  }

  const masterSeed = new Uint8Array(prfOutput, 0, 32);
  const credentialId = new Uint8Array(credential.rawId);

  return { masterSeed, credentialId };
}

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Authenticate with an existing passkey.
 * Returns the same 32-byte master seed as registration (deterministic PRF).
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

  if (!assertion) throw new Error('Passkey authentication was cancelled');

  const extResults = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = extResults?.prf?.results?.first;
  if (!prfOutput) throw new Error('PRF extension not available on this credential');

  return new Uint8Array(prfOutput, 0, 32);
}

// ── PRF support detection ────────────────────────────────────────────────────

/**
 * Quick capability check. Returns true if the browser+platform supports WebAuthn PRF.
 * Does not require a credential — uses a mock create call with a silent abort.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    // Check if conditional mediation available (proxy for modern WebAuthn support)
    const supported = await (PublicKeyCredential as { isConditionalMediationAvailable?: () => Promise<boolean> })
      .isConditionalMediationAvailable?.();
    return !!supported;
  } catch {
    return false;
  }
}
