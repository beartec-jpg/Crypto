// client/src/lib/passkeyService.ts
// WebAuthn Passkey Authentication Service

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

const RP_NAME = 'BearTec Crypto Wallet';

/**
 * Extract the registrable (apex) domain so that passkeys work
 * on both beartec.uk and www.beartec.uk.
 */
function getApexDomain(): string {
  if (typeof window === 'undefined') return 'localhost';
  const host = window.location.hostname;
  // localhost / IP — return as-is
  if (host === 'localhost' || /^\d+\./.test(host)) return host;
  // Strip leading sub-domains to keep only the last two segments
  const parts = host.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : host;
}

const RP_ID = getApexDomain();

/**
 * Check if WebAuthn is supported in this browser
 */
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 
         window.PublicKeyCredential !== undefined &&
         typeof window.PublicKeyCredential === 'function';
}

/**
 * Check if platform authenticator (biometric) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new passkey for the wallet
 */
export async function registerPasskey(username: string = 'wallet_user'): Promise<boolean> {
  try {
    console.log('🔐 Starting passkey registration...');

    if (!isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    // Generate challenge (in production, this should come from server)
    const challenge = generateChallenge();
    const userId = generateUserId(username);

    // Create credential options
    const options: PublicKeyCredentialCreationOptionsJSON = {
      challenge,
      rp: {
        name: RP_NAME,
        id: RP_ID,
      },
      user: {
        id: userId,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    // Start registration
    const credential = await startRegistration(options);

    console.log('✅ Passkey registered:', credential);

    // Store credential ID (in production, send to server)
    localStorage.setItem('passkey_credential_id', credential.id);
    localStorage.setItem('passkey_registered', 'true');

    return true;
  } catch (error: any) {
    console.error('❌ Passkey registration failed:', error);
    
    if (error.name === 'NotAllowedError') {
      throw new Error('Passkey registration was cancelled');
    } else if (error.name === 'NotSupportedError') {
      throw new Error('Passkeys are not supported on this device');
    } else {
      throw new Error('Failed to register passkey: ' + error.message);
    }
  }
}

/**
 * Authenticate with existing passkey
 */
export async function authenticateWithPasskey(): Promise<boolean> {
  try {
    console.log('🔐 Starting passkey authentication...');

    if (!isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    // Check if passkey is registered
    const credentialId = localStorage.getItem('passkey_credential_id');
    if (!credentialId) {
      throw new Error('No passkey registered. Please register first.');
    }

    // Generate challenge (in production, this should come from server)
    const challenge = generateChallenge();

    // Create authentication options
    const options: PublicKeyCredentialRequestOptionsJSON = {
      challenge,
      rpId: RP_ID,
      allowCredentials: [
        {
          id: credentialId,
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    };

    // Start authentication
    const assertion = await startAuthentication(options);

    console.log('✅ Passkey authenticated:', assertion);

    // Mark as authenticated
    sessionStorage.setItem('passkey_authenticated', 'true');
    sessionStorage.setItem('passkey_auth_time', Date.now().toString());

    return true;
  } catch (error: any) {
    console.error('❌ Passkey authentication failed:', error);
    
    if (error.name === 'NotAllowedError') {
      throw new Error('Authentication was cancelled');
    } else {
      throw new Error('Failed to authenticate: ' + error.message);
    }
  }
}

/**
 * Check if user is currently authenticated
 */
export function isPasskeyAuthenticated(): boolean {
  const authenticated = sessionStorage.getItem('passkey_authenticated') === 'true';
  const authTime = sessionStorage.getItem('passkey_auth_time');
  
  if (!authenticated || !authTime) return false;

  // Check if session expired (30 minutes)
  const elapsed = Date.now() - parseInt(authTime, 10);
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  if (elapsed > THIRTY_MINUTES) {
    sessionStorage.removeItem('passkey_authenticated');
    sessionStorage.removeItem('passkey_auth_time');
    return false;
  }

  return true;
}

/**
 * Check if passkey is registered
 */
export function isPasskeyRegistered(): boolean {
  return localStorage.getItem('passkey_registered') === 'true';
}

/**
 * Clear passkey authentication session
 */
export function clearPasskeySession(): void {
  sessionStorage.removeItem('passkey_authenticated');
  sessionStorage.removeItem('passkey_auth_time');
  console.log('🔒 Passkey session cleared');
}

/**
 * Delete registered passkey
 */
export function deletePasskey(): void {
  localStorage.removeItem('passkey_credential_id');
  localStorage.removeItem('passkey_registered');
  clearPasskeySession();
  console.log('🗑️ Passkey deleted');
}

// Helper functions

/**
 * Generate a random challenge (base64url encoded)
 */
function generateChallenge(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return bufferToBase64url(buffer);
}

/**
 * Generate user ID from username
 */
function generateUserId(username: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(username + Date.now());
  return bufferToBase64url(data);
}

/**
 * Convert buffer to base64url string
 */
function bufferToBase64url(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(buffer)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Request passkey authentication for transaction signing
 * This is a convenience wrapper that handles errors gracefully
 */
export async function requestPasskeyForTransaction(): Promise<boolean> {
  try {
    // Check if already authenticated recently
    if (isPasskeyAuthenticated()) {
      console.log('✅ Already authenticated');
      return true;
    }

    // Request authentication
    return await authenticateWithPasskey();
  } catch (error: any) {
    console.error('Transaction passkey auth failed:', error);
    return false;
  }
}
