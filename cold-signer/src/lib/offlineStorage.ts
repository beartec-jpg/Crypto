import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { EncryptedShare } from '../types/coldTypes';
import { decrypt } from './coldCrypto';

interface ColdSignerDB extends DBSchema {
  shares: {
    key: string;
    value: EncryptedShare;
  };
}

const DB_NAME = 'cold-signer-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ColdSignerDB> | null = null;

/**
 * Initialize and get database instance
 */
async function getDB(): Promise<IDBPDatabase<ColdSignerDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ColdSignerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

/**
 * Store encrypted share in IndexedDB
 */
export async function storeEncryptedShare(share: EncryptedShare): Promise<void> {
  const db = await getDB();
  await db.put('shares', share);
}

/**
 * Load encrypted share from IndexedDB
 */
export async function loadEncryptedShare(id: string): Promise<EncryptedShare | null> {
  const db = await getDB();
  const share = await db.get('shares', id);
  return share || null;
}

/**
 * Get the stored share (there should only be one)
 */
export async function getStoredShare(): Promise<EncryptedShare | null> {
  const db = await getDB();
  const shares = await db.getAll('shares');
  return shares.length > 0 ? shares[0] : null;
}

/**
 * Load and decrypt share with password
 */
export async function loadAndDecryptShare(
  id: string,
  password: string
): Promise<string> {
  const share = await loadEncryptedShare(id);
  
  if (!share) {
    throw new Error('No share found');
  }

  try {
    const decryptedShare = await decrypt(
      share.encryptedData,
      password,
      share.salt
    );
    return decryptedShare;
  } catch (error) {
    throw new Error('Failed to decrypt share - invalid password');
  }
}

/**
 * Delete all shares from storage
 */
export async function clearAllShares(): Promise<void> {
  const db = await getDB();
  await db.clear('shares');
}

/**
 * Check if a share exists
 */
export async function hasStoredShare(): Promise<boolean> {
  const share = await getStoredShare();
  return share !== null;
}

/**
 * Get share metadata without decryption
 */
export async function getShareMetadata(): Promise<{
  exists: boolean;
  createdAt?: string;
  id?: string;
} | null> {
  const share = await getStoredShare();
  
  if (!share) {
    return { exists: false };
  }

  return {
    exists: true,
    createdAt: share.createdAt,
    id: share.id,
  };
}
