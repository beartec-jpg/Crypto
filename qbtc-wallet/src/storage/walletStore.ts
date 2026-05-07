import { getDb, type WalletRecord } from './db';

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
