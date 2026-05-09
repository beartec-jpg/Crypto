import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, UserPlus, ArrowLeft, Trash2, Share2, Copy, Check } from 'lucide-react';
import { useMessages } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { getContact, addContact as storeAddContact } from '../storage/contactStore';
import { fetchContactPubKey } from '../lib/messaging';
import type { MessageRecord } from '../storage/db';
import ContactCard from '../components/ContactCard';
import ChatBubble from '../components/ChatBubble';

interface MessengerTabProps {
  myAddress: string;
  myPrivateKey: CryptoKey | null;
  myPublicKeyRaw: Uint8Array | null;
  getContactPubKey: (address: string) => Uint8Array | undefined;
  setContactPubKey: (address: string, key: Uint8Array) => void;
}

type View = 'list' | 'chat' | 'add-contact';

export default function MessengerTab({
  myAddress,
  myPrivateKey,
  myPublicKeyRaw,
  getContactPubKey,
  setContactPubKey,
}: MessengerTabProps) {
  const [view, setView] = useState<View>('list');
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageRecord[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleShareMyAddress() {
    const text = `Add me on qBTC Messenger: ${myAddress}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My qBTC Address', text }); return; } catch { /* cancelled */ return; }
    }
    await navigator.clipboard.writeText(myAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Add-contact form
  const [newAddress, setNewAddress] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const { contacts, remove: removeContact, refresh: refreshContacts } = useContacts();

  const getContactPublicKeyFn = useCallback(
    (address: string) => getContactPubKey(address),
    [getContactPubKey],
  );

  const { threads, getMessages, send, refreshThreads } = useMessages(
    myAddress,
    myPrivateKey,
    getContactPublicKeyFn,
  );

  // Load chat messages when switching to chat view
  useEffect(() => {
    if (view === 'chat' && activePeer) {
      getMessages(activePeer).then(msgs => {
        setChatMessages(msgs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
    }
  }, [view, activePeer, getMessages, threads]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activePeer || sending) return;
    const theirPubKey = getContactPubKey(activePeer);
    if (!theirPubKey) {
      alert('Contact public key not found. Ask them to share their messaging public key.');
      return;
    }
    setSending(true);
    try {
      await send(activePeer, input.trim(), theirPubKey);
      setInput('');
      const msgs = await getMessages(activePeer);
      setChatMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newAddress.trim() || !newName.trim()) { setAddError('Name and address required'); return; }
    setAddError('');
    try {
      // Attempt to fetch their messaging public key from the relay
      const address = newAddress.trim();
      const pubKeyBytes = await fetchContactPubKey(address);
      const pubKeyHex = pubKeyBytes
        ? Array.from(pubKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('')
        : undefined;

      await storeAddContact({ address, name: newName.trim(), addedAt: Date.now(), pubKeyHex });

      if (pubKeyBytes) {
        setContactPubKey(address, pubKeyBytes);
      }

      await refreshContacts();
      setNewAddress('');
      setNewName('');
      setView('list');

      if (!pubKeyHex) {
        // Contact saved, but they haven't opened the app yet — can still message once they do
        setAddError('');
      }
    } catch {
      setAddError('Failed to add contact');
    }
  }

  if (view === 'add-contact') {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setView('list')} className="text-slate-400"><ArrowLeft size={20} /></button>
          <h2 className="font-semibold text-white">Add Contact</h2>
        </header>
        <div className="flex-1 px-5 py-6">
          <form onSubmit={handleAddContact} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Contact name"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100
                           placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">qBTC Address</label>
              <input
                value={newAddress}
                onChange={e => setNewAddress(e.target.value.trim())}
                placeholder="qbtct1…"
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100
                           placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                The contact will need to share their P-256 messaging public key separately.
              </p>
            </div>
            {addError && <p className="text-red-400 text-sm">{addError}</p>}
            <button type="submit"
              className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
              Add Contact
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'chat' && activePeer) {
    const peer = contacts.find(c => c.address === activePeer);
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setView('list')} className="text-slate-400"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <p className="font-semibold text-white">{peer?.name ?? activePeer.slice(0, 12) + '…'}</p>
            <p className="text-xs text-slate-500 font-mono truncate">{activePeer}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {chatMessages.length === 0 && (
            <p className="text-center text-slate-500 text-sm mt-8">
              No messages yet. Send one!
            </p>
          )}
          {chatMessages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-slate-700">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Message…"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-full px-4 py-2.5 text-slate-100
                       placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full bg-cyan-600 hover:bg-cyan-500 flex items-center justify-center
                       text-white disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  }

  // Contact list
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <h2 className="font-semibold text-white">Messenger</h2>
        <button onClick={() => setView('add-contact')} className="text-cyan-400 hover:text-cyan-300">
          <UserPlus size={20} />
        </button>
      </header>

      {/* Share my address */}
      <div className="px-4 py-3 bg-slate-800/40 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Your qBTC address</p>
            <p className="text-xs font-mono text-slate-300 truncate">{myAddress}</p>
          </div>
          <button
            onClick={handleShareMyAddress}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-700/60 hover:bg-cyan-600/70 active:bg-cyan-600/70 text-cyan-200 text-xs font-medium transition-colors"
          >
            {copied ? <Check size={13} /> : (typeof navigator.share === 'function' ? <Share2 size={13} /> : <Copy size={13} />)}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 && (
          <div className="text-center px-5 py-12">
            <p className="text-slate-500 text-sm">No contacts yet</p>
            <p className="text-slate-600 text-xs mt-1">Tap + to add a contact</p>
          </div>
        )}
        {contacts.map(contact => {
          const thread = threads.find(t => t.address === contact.address);
          return (
            <div key={contact.address} className="group flex items-center border-b border-slate-800/50">
              <ContactCard
                contact={contact}
                lastMessage={thread?.lastMessage}
                onClick={() => { setActivePeer(contact.address); setView('chat'); }}
              />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Remove ${contact.name}?`)) return;
                  await removeContact(contact.address);
                  if (activePeer === contact.address) { setActivePeer(null); setView('list'); }
                }}
                className="shrink-0 mr-4 p-2 text-slate-600 hover:text-red-400 active:text-red-400 transition-colors"
                aria-label="Delete contact"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
