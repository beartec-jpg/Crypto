/**
 * Bridge to the main BearTec wallet stored in IndexedDB.
 * The PWA is same-origin, so it can read the 'beartec_wallet' database directly.
 * The mnemonic is encrypted with the user's wallet password (PBKDF2 + AES-256-GCM).
 */

const MAIN_DB_NAME = 'beartec_wallet';

interface MainWalletRecord {
  id: string;
  userId: string;
  encryptedMnemonic: string;
  addresses: { qbtc?: string; [key: string]: string | undefined };
  salt: string; // hex
}

/** Returns true if a BearTec wallet exists in the main app's IndexedDB. */
export async function mainWalletExists(): Promise<boolean> {
  try {
    const records = await getAllMainWallets();
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Returns the most recent wallet record (without decrypting). */
export async function getMainWalletRecord(): Promise<MainWalletRecord | null> {
  try {
    const all = await getAllMainWallets();
    console.log('[bridge] getAllMainWallets returned', all.length, 'record(s)');
    if (all.length === 0) return null;
    // Filter to records that have the required fields
    const valid = all.filter(r => r && typeof r.encryptedMnemonic === 'string' && typeof r.salt === 'string');
    console.log('[bridge] valid records (have encryptedMnemonic + salt):', valid.length);
    if (valid.length === 0) {
      console.warn('[bridge] No records have encryptedMnemonic/salt — field names may not match:', Object.keys(all[0] || {}));
      return null;
    }
    // Sort by createdAt descending if available, otherwise by id
    valid.sort((a: any, b: any) => {
      if (a.createdAt && b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
      return b.id > a.id ? 1 : -1;
    });
    const chosen = valid[0];
    console.log('[bridge] chosen record id:', chosen.id, 'userId:', chosen.userId);
    return chosen;
  } catch (err) {
    console.error('[bridge] getMainWalletRecord error:', err);
    return null;
  }
}

function getAllMainWallets(): Promise<MainWalletRecord[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MAIN_DB_NAME);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      // DB doesn't exist yet — abort so we get an error
      req.transaction!.abort();
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('wallets')) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction('wallets', 'readonly');
      const store = tx.objectStore('wallets');
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        db.close();
        resolve(getAllReq.result as MainWalletRecord[]);
      };
      getAllReq.onerror = () => {
        db.close();
        reject(getAllReq.error);
      };
    };
  });
}

/**
 * Decrypt the mnemonic from the main wallet using the user's wallet password.
 * Throws if the password is wrong (AES-GCM auth tag fails).
 */
export async function decryptMainWalletMnemonic(
  record: MainWalletRecord,
  password: string,
): Promise<string> {
  console.log('[bridge] attempting decrypt, encryptedMnemonic length:', record.encryptedMnemonic?.length, 'salt length:', record.salt?.length);
  const salt = hexToBytes(record.salt);
  try {
    const result = await decryptData(record.encryptedMnemonic, password, salt);
    console.log('[bridge] decryption succeeded');
    return result;
  } catch (err) {
    console.error('[bridge] decryption failed:', err);
    throw err;
  }
}

// ── internal (mirrors walletService.ts decryptData exactly) ───────────────

async function decryptData(encryptedHex: string, password: string, salt: Uint8Array): Promise<string> {
  const combined = hexToBytes(encryptedHex);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.slice(), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyBits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.slice() },
    aesKey,
    ciphertext.slice(),
  );
  return new TextDecoder().decode(plaintext);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}
