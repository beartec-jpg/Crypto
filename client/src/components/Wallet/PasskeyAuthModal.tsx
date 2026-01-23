// client/src/components/Wallet/PasskeyAuthModal.tsx
// WebAuthn passkey authentication modal for secure client-side signing

import { useState } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { X, Fingerprint, Shield, AlertTriangle, Loader2 } from 'lucide-react';

interface PasskeyAuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasskeyAuthModal({ onClose, onSuccess }: PasskeyAuthModalProps) {
  const [mode, setMode] = useState<'choose' | 'register' | 'authenticate'>('choose');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const supportsWebAuthn = browserSupportsWebAuthn();

  const encodeBase64Url = (buffer: Uint8Array): string => {
    const bytes = Array.from(buffer);
    const binary = bytes.map(b => String.fromCharCode(b)).join('');
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const generateRegistrationOptions = (): PublicKeyCredentialCreationOptionsJSON => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const rpId = window.location.hostname === 'localhost' 
      ? 'localhost' 
      : window.location.hostname.replace('www.', '');

    return {
      challenge: encodeBase64Url(challenge),
      rp: {
        name: 'BearTec Wallet',
        id: rpId,
      },
      user: {
        id: encodeBase64Url(userId),
        name: `user_${Date.now()}`,
        displayName: 'Wallet User',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    };
  };

  const generateAuthenticationOptions = (): PublicKeyCredentialRequestOptionsJSON => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const storedCredentialId = localStorage.getItem('passkey_credential_id');
    const rpId = window.location.hostname === 'localhost' 
      ? 'localhost' 
      : window.location.hostname.replace('www.', '');

    return {
      challenge: encodeBase64Url(challenge),
      timeout: 60000,
      rpId: rpId,
      userVerification: 'preferred',
      allowCredentials: storedCredentialId ? [
        {
          id: storedCredentialId,
          type: 'public-key',
          transports: ['internal'],
        },
      ] : [],
    };
  };

  const handleRegister = async () => {
    setIsLoading(true);
    setError(null);
    setStatus('Starting passkey registration...');

    try {
      console.log('Registration starting...');
      const options = generateRegistrationOptions();
      console.log('Registration options:', options);

      const registration = await startRegistration({ optionsJSON: options });
      console.log('Registration response:', registration);

      localStorage.setItem('passkey_credential_id', registration.id);
      localStorage.setItem('passkey_registered', 'true');
      localStorage.setItem('wallet_created', 'true');
      localStorage.setItem('wallet_created_at', new Date().toISOString());

      setStatus('Passkey registered successfully!');
      
      setTimeout(() => {
        onSuccess();
      }, 1000);

    } catch (err: any) {
      console.error('Registration failed:', err);
      
      let errorMessage = 'Registration failed. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Registration was cancelled. Please try again and approve the prompt.';
      } else if (err.name === 'SecurityError') {
        errorMessage = 'Security error. This feature requires HTTPS.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Passkeys not supported on this device.';
      } else if (err.name === 'InvalidStateError') {
        errorMessage = 'A passkey already exists. Try authenticating instead.';
      } else if (err.name === 'AbortError') {
        errorMessage = 'Registration timed out or was cancelled.';
      } else if (err.message) {
        errorMessage += err.message;
      } else {
        errorMessage = 'Unknown error. Please try a different browser.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    setIsLoading(true);
    setError(null);
    setStatus('Verifying your identity...');

    try {
      const options = generateAuthenticationOptions();
      const authentication = await startAuthentication({ optionsJSON: options });

      console.log('Authentication successful:', authentication.id);
      setStatus('Authentication successful!');
      
      setTimeout(() => {
        onSuccess();
      }, 500);

    } catch (err: any) {
      console.error('Authentication failed:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Authentication cancelled. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const hasExistingPasskey = localStorage.getItem('passkey_registered') === 'true';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <Fingerprint className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Passkey Authentication</h2>
          <p className="text-gray-400 mt-2">
            Secure your wallet with biometric authentication
          </p>
        </div>

        {!supportsWebAuthn && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/20 border border-red-700/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-400">Browser Not Supported</p>
                <p className="text-sm text-gray-400 mt-1">
                  Your browser doesn't support WebAuthn. Please use Chrome, Safari, or Firefox.
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === 'choose' && supportsWebAuthn && !isLoading && !error && (
          <div className="space-y-4">
            {hasExistingPasskey ? (
              <>
                <button
                  onClick={() => {
                    setMode('authenticate');
                    handleAuthenticate();
                  }}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Fingerprint className="w-5 h-5" />
                  <span>Authenticate with Passkey</span>
                </button>
                <button
                  onClick={() => {
                    setMode('register');
                    handleRegister();
                  }}
                  className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors text-gray-300"
                >
                  Register New Passkey
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMode('register');
                  handleRegister();
                }}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Shield className="w-5 h-5" />
                <span>Create Sovereign Wallet</span>
              </button>
            )}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 mx-auto text-emerald-400 animate-spin mb-4" />
            <p className="text-gray-300">{status}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-900/20 border border-red-700/30">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setMode('choose');
              }}
              className="mt-3 text-sm text-cyan-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-700">
          <div className="flex items-start gap-3 text-sm text-gray-400">
            <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-300 mb-1">How it works</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Keys stored in device secure enclave</li>
                <li>Biometric/PIN verification required</li>
                <li>We never see or store your keys</li>
                <li>Works offline once set up</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
