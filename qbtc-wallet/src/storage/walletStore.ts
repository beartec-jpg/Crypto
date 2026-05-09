import { getDb, isLegacyRecord, type WalletRecord } from './db';

export async function saveWallet(record: WalletRecord): Promise<void> {
  const db = await getDb();
  await db.put('wallet', record);
}

export async function loadWallet(): Promise<WalletRecord | undefined> {
  const db = await getDb();
  return db.get('wallet', 'main');
}

export async function hasWallet(): Promise<boolean> {
  const record = await loadWallet();
  return record !== undefined;
}

export async function clearWallet(): Promise<void> {
  const db = await getDb();
  await db.delete('wallet', 'main');
}

/** Returns true if an old PIN-encrypted record is present (needs one-time migration). */
export async function hasLegacyWallet(): Promise<boolean> {
  const record = await loadWallet();
  return !!record && isLegacyRecord(record);
}

/**
 * Overwrite an existing legacy record with a passkey record.
 * Clears the encrypted PIN fields so they are never stored again.
 */
export async function completeMigration(
  credentialIdB64: string,
  rpId: string,
  qbtcAddress: string,
): Promise<void> {
  const db = await getDb();
  await db.put('wallet', {
    id: 'main',
    walletType: 'passkey',
    credentialIdB64,
    rpId,
    qbtcAddress,
    createdAt: Date.now(),
    // Legacy fields intentionally absent
  });
}
