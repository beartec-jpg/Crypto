import { useState, useEffect, useCallback } from 'react';
import { listContacts, addContact, deleteContact } from '../storage/contactStore';
import type { ContactRecord } from '../storage/db';

export function useContacts() {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);

  const refresh = useCallback(async () => {
    const all = await listContacts();
    setContacts(all.sort((a, b) => b.addedAt - a.addedAt));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (address: string, name: string) => {
    await addContact({ address, name, addedAt: Date.now() });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (address: string) => {
    await deleteContact(address);
    await refresh();
  }, [refresh]);

  return { contacts, add, remove, refresh };
}
