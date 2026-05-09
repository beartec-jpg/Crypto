import { useState, useCallback, useEffect } from 'react';
import { hasWallet, loadWallet, completeMigration } from '../storage/walletStore';
import { isLegacyRecord } from '../storage/db';
import { deriveVaultKey, decryptSeed } from '../lib/vault';
import {
  registerPasskey,
  unlockWithPasskey,
  getDefaultRpId,
  b64uEncode,
  b64uDecode,
} from '../lib/passkeyVault';

export type VaultState =
  | { status: 'loading' }
  | { status: 'no-wallet' }
  | { status: 'needs-migration' }   // old PIN wallet found — must migrate before use
  | { status: 'locked' }            // passkey wallet, biometric needed
  | { status: 'watch-only'; qbtcAddress: string; ecdsaPubHex: string; falconPubHex: string }
  | { status: 'unlocked'; masterSeed: Uint8Array; qbtcAddress: string };

let _globalMasterSeed: Uint8Array | null = null;
let _lockTimer: ReturnType<typeof setTimeout> | null = null;

const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export function useVault() {
  const [state, setState] = useState<VaultState>({ status: 'loading' });
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    (async () => {
      const record = await loadWallet();
      if (!record) {
        setState({ status: 'no-wallet' });
        return;
      }
      if (isLegacyRecord(record)) {
        setState({ status: 'needs-migration' });
        return;
      }
      if (record.walletType === 'watch-only') {
        setState({
          status: 'watch-only',
          qbtcAddress: record.qbtcAddress,
          ecdsaPubHex: record.ecdsaPubHex ?? '',
          falconPubHex: record.falconPubHex ?? '',
        });
        return;
      }
      // passkey wallet
      if (_globalMasterSeed) {
        setState({ status: 'unlocked', masterSeed: _globalMasterSeed, qbtcAddress: record.qbtcAddress });
        return;
      }
      setState({ status: 'locked' });
    })();
  }, []);

  /** Biometric unlock — no PIN argument. */
  const unlock = useCallback(async (): Promise<void> => {
    setUnlockError('');
    try {
      const record = await loadWallet();
      if (!record || !record.credentialIdB64 || !record.rpId) {
        setUnlockError('Wallet record missing passkey data. Please re-create your wallet.');
        return;
      }
      const credentialId = b64uDecode(record.credentialIdB64);
      const seed = await unlockWithPasskey(record.rpId, credentialId);
      _globalMasterSeed = seed;
      setState({ status: 'unlocked', masterSeed: seed, qbtcAddress: record.qbtcAddress });
      resetLockTimer();
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : 'Authentication failed');
    }
  }, []);

  /**
   * One-time migration: decrypt old PIN vault → register passkey → save new record.
   * Returns error string on failure, null on success.
   */
  const migrateFromPin = useCallback(async (pin: string): Promise<string | null> => {
    try {
      const record = await loadWallet();
      if (!record?.encryptedSeed || !record?.saltHex || !record?.seedIv) {
        return 'Wallet record is missing required fields';
      }
      // 1. Decrypt with PIN
      const vaultKey = await deriveVaultKey(pin, record.saltHex);
      const seed = await decryptSeed(record.encryptedSeed, record.seedIv, vaultKey);

      // 2. Register passkey — PRF output will become the new vault key
      const rpId = getDefaultRpId();
      const { credentialId } = await registerPasskey(rpId, 'qBTC Wallet');

      // 3. Persist passkey record (clears PIN fields)
      await completeMigration(b64uEncode(credentialId), rpId, record.qbtcAddress);

      // 4. Unlock immediately
      _globalMasterSeed = seed;
      setState({ status: 'unlocked', masterSeed: seed, qbtcAddress: record.qbtcAddress });
      resetLockTimer();
      return null;
    } catch (e) {
      if (e instanceof Error && e.message.includes('cancelled')) return 'Passkey setup cancelled';
      return e instanceof Error ? e.message : 'Migration failed';
    }
  }, []);

  const lock = useCallback(() => {
    _globalMasterSeed = null;
    if (_lockTimer) clearTimeout(_lockTimer);
    setState({ status: 'locked' });
  }, []);

  /** Called by OnboardingPage after creating a new hot wallet. */
  const setUnlocked = useCallback((seed: Uint8Array, address: string) => {
    _globalMasterSeed = seed;
    setState({ status: 'unlocked', masterSeed: seed, qbtcAddress: address });
    resetLockTimer();
  }, []);

  /** Called by OnboardingPage after receiving cold signer pub keys. */
  const setWatchOnly = useCallback((
    qbtcAddress: string,
    ecdsaPubHex: string,
    falconPubHex: string,
  ) => {
    setState({ status: 'watch-only', qbtcAddress, ecdsaPubHex, falconPubHex });
  }, []);

  function resetLockTimer() {
    if (_lockTimer) clearTimeout(_lockTimer);
    _lockTimer = setTimeout(() => {
      _globalMasterSeed = null;
      setState({ status: 'locked' });
    }, AUTO_LOCK_MS);
  }

  return { state, unlock, lock, setUnlocked, setWatchOnly, migrateFromPin, unlockError };
}
