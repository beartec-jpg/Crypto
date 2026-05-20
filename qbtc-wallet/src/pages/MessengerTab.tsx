import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, UserPlus, ArrowLeft, Trash2, QrCode, Camera, PenLine,
  Copy, Check, Download, Share2, X, Lock,
} from 'lucide-react';
import { useMessages } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { addContact as storeAddContact } from '../storage/contactStore';
import { fetchContactPubKey } from '../lib/messaging';
import type { MessageRecord } from '../storage/db';
import ContactCard from '../components/ContactCard';
import ChatBubble from '../components/ChatBubble';
import QRDisplay from '../components/QRDisplay';
import QRScanner from '../components/QRScanner';

// ── helpers ──────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

interface MessengerQRPayload {
  v: number;
  addr: string;
  msgKey: string;
}

/** Parse the shared-addy QR payload. Returns null for unrecognised codes. */
function parseQRPayload(raw: string): MessengerQRPayload | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof obj?.v === 'number' && obj.v === 1 &&
      typeof obj.addr === 'string' &&
      typeof obj.msgKey === 'string'
    ) {
      return { v: 1, addr: obj.addr, msgKey: obj.msgKey };
    }
    return null;
  } catch {
    return null;
  }
}

// ── types ─────────────────────────────────────────────────────────────────────

interface MessengerTabProps {
  myAddress: string;
  myPrivateKey: CryptoKey | null;
  myPublicKeyRaw: Uint8Array | null;
  getContactPubKey: (address: string) => Uint8Array | undefined;
  setContactPubKey: (address: string, key: Uint8Array) => void;
}

type View = 'list' | 'chat' | 'add-contact';
type AddMode = 'scan' | 'manual';

// ── component ────────────────────────────────────────────────────────────────

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
  const [newAddress, setNewAddress] = useState('');
  const [newName, setNewName] = useState('');
  const [newMsgKey, setNewMsgKey] = useState('');
  const [addError, setAddError] = useState('');
  const [addMode, setAddMode] = useState<AddMode>('scan');
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedPayload, setScannedPayload] = useState<MessengerQRPayload | null>(null);

  // Share My Addy modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const qrWrapperRef = useRef<HTMLDivElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const { contacts, remove: removeContact, refresh: refreshContacts } = useContacts();

  const getContactPublicKeyFn = useCallback(
    (address: string) => getContactPubKey(address),
    [getContactPubKey],
  );

  const { threads, getMessages, send } = useMessages(
    myAddress,
    myPrivateKey,
    getContactPublicKeyFn,
  );

  // Derived share values
  const myPubKeyHex = myPublicKeyRaw ? toHex(myPublicKeyRaw) : '';
  const sharePayload = myPublicKeyRaw
    ? JSON.stringify({ v: 1, addr: myAddress, msgKey: myPubKeyHex })
    : '';

  // Load chat messages when switching to chat view
  useEffect(() => {
    if (view === 'chat' && activePeer) {
      getMessages(activePeer).then(msgs => {
        setChatMessages(msgs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
    }
  }, [view, activePeer, getMessages, threads]);

  // ── add-contact helpers ───────────────────────────────────────────────────

  function openAddContact() {
    setNewAddress('');
    setNewName('');
    setNewMsgKey('');
    setAddError('');
    setAddMode('scan');
    setShowScanner(false);
    setScanError('');
    setScannedPayload(null);
    setView('add-contact');
  }

  function handleScanResult(raw: string) {
    const payload = parseQRPayload(raw);
    if (!payload) {
      setScanError('Unrecognised QR code — ask your contact to share their qBTC Messenger QR.');
      setShowScanner(false);
      return;
    }
    setScanError('');
    setScannedPayload(payload);
    setNewAddress(payload.addr);
    setNewMsgKey(payload.msgKey);
    // Pre-fill name with truncated address; user can edit
    setNewName(payload.addr.slice(0, 10) + '…');
    setShowScanner(false);
  }

  function clearScan() {
    setScannedPayload(null);
    setNewAddress('');
    setNewMsgKey('');
    setNewName('');
    setScanError('');
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    const address = newAddress.trim();
    const name = newName.trim();
    if (!address || !name) { setAddError('Name and address are required'); return; }

    const rawMsgKey = newMsgKey.trim();
    if (rawMsgKey && !/^[0-9a-fA-F]+$/.test(rawMsgKey)) {
      setAddError('Messaging key must be valid hex characters');
      return;
    }
    // P-256 uncompressed public key is 65 bytes = 130 hex chars
    if (rawMsgKey && rawMsgKey.length !== 130) {
      setAddError('Messaging key should be 130 hex characters (P-256 uncompressed public key)');
      return;
    }

    setAddError('');
    try {
      let pubKeyHex: string | undefined = rawMsgKey || undefined;
      let pubKeyBytes: Uint8Array | undefined;

      if (pubKeyHex) {
        // Use the key from QR scan or manual paste directly
        pubKeyBytes = fromHex(pubKeyHex);
      } else {
        // Fall back to relay lookup (works once the contact has opened the app)
        const fetched = await fetchContactPubKey(address);
        if (fetched) {
          pubKeyBytes = fetched;
          pubKeyHex = toHex(fetched);
        }
      }

      await storeAddContact({ address, name, addedAt: Date.now(), pubKeyHex });

      if (pubKeyBytes) {
        setContactPubKey(address, pubKeyBytes);
      }

      await refreshContacts();
      setView('list');
    } catch {
      setAddError('Failed to add contact');
    }
  }

  // ── share-modal helpers ───────────────────────────────────────────────────

  function handleDownloadQR() {
    const canvas = qrWrapperRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qbtc-messenger-address.png';
    a.click();
  }

  async function handleShareAddy() {
    if (!sharePayload || !navigator.share) return;
    try {
      await navigator.share({ title: 'My qBTC Messenger Address', text: sharePayload });
    } catch { /* user cancelled */ }
  }

  async function handleCopyAddress() {
    await navigator.clipboard.writeText(myAddress);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  }

  // ── send message ──────────────────────────────────────────────────────────

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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  // ── scanner overlay ───────────────────────────────────────────────────────

  if (showScanner) {
    return (
      <QRScanner
        onScan={handleScanResult}
        onClose={() => {
          setShowScanner(false);
        }}
      />
    );
  }

  // ── add-contact view ──────────────────────────────────────────────────────

  if (view === 'add-contact') {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setView('list')} className="text-slate-400">
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-semibold text-white">Add Contact</h2>
        </header>

        {/* Mode toggle */}
        <div className="flex gap-2 px-5 pt-5">
          <button
            onClick={() => { setAddMode('scan'); setAddError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${
              addMode === 'scan'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Camera size={16} /> Scan QR
          </button>
          <button
            onClick={() => { setAddMode('manual'); setAddError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${
              addMode === 'manual'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <PenLine size={16} /> Enter Manually
          </button>
        </div>

        <div className="flex-1 px-5 py-5 overflow-y-auto">
          {addMode === 'scan' ? (
            <form onSubmit={handleAddContact} className="flex flex-col gap-4">
              {/* Scan button / scanned result banner */}
              {scannedPayload ? (
                <div className="bg-cyan-900/40 border border-cyan-500/40 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock size={14} className="text-cyan-400" />
                    <span className="text-xs text-cyan-400 font-semibold">QR scanned successfully</span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono break-all">{scannedPayload.addr}</p>
                  <button
                    type="button"
                    onClick={clearScan}
                    className="mt-2 text-xs text-slate-500 hover:text-slate-300 underline"
                  >
                    Scan a different code
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setScanError(''); setShowScanner(true); }}
                  className="w-full flex items-center justify-center gap-3 py-6 border-2 border-dashed
                             border-cyan-600/60 rounded-xl text-cyan-400 hover:border-cyan-400
                             hover:bg-cyan-900/20 transition-colors"
                >
                  <Camera size={24} />
                  <span className="font-semibold">Scan Their QR</span>
                </button>
              )}

              {scanError && <p className="text-amber-400 text-sm">{scanError}</p>}

              {/* Name input — always required */}
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

              {addError && <p className="text-red-400 text-sm">{addError}</p>}

              <button
                type="submit"
                disabled={!scannedPayload || !newName.trim()}
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700
                           disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold
                           transition-colors"
              >
                Add Contact
              </button>

              <p className="text-xs text-slate-500 text-center">
                Ask your contact to tap{' '}
                <span className="text-slate-400 font-medium">Share My Addy</span>
                {' '}on their Messenger tab.
              </p>
            </form>
          ) : (
            /* Manual entry */
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
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Messaging Key{' '}
                  <span className="normal-case text-slate-500">(optional)</span>
                </label>
                <input
                  value={newMsgKey}
                  onChange={e => setNewMsgKey(e.target.value.trim())}
                  placeholder="04… (P-256 public key hex)"
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100
                             placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-500"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Ask your contact to copy their messaging key from their Messenger tab, or scan their QR
                  code instead.
                </p>
              </div>

              {addError && <p className="text-red-400 text-sm">{addError}</p>}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold
                           transition-colors"
              >
                Add Contact
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── chat view ─────────────────────────────────────────────────────────────

  if (view === 'chat' && activePeer) {
    const peer = contacts.find(c => c.address === activePeer);
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setView('list')} className="text-slate-400">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="font-semibold text-white">{peer?.name ?? activePeer.slice(0, 12) + '…'}</p>
            <p className="text-xs text-slate-500 font-mono truncate">{activePeer}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {chatMessages.length === 0 && (
            <p className="text-center text-slate-500 text-sm mt-8">No messages yet. Send one!</p>
          )}
          {chatMessages.map(msg => <ChatBubble key={msg.id} message={msg} />)}
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

  // ── contact list ──────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Messenger</h2>
          <div className="flex items-center gap-2">
            {myPublicKeyRaw && (
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-900/50
                           hover:bg-cyan-800/60 text-cyan-400 text-sm font-medium transition-colors"
              >
                <QrCode size={15} />
                Share My Addy
              </button>
            )}
            <button onClick={openAddContact} className="text-cyan-400 hover:text-cyan-300">
              <UserPlus size={20} />
            </button>
          </div>
        </header>

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

      {/* ── Share My Addy modal ──────────────────────────────────────────── */}
      {showShareModal && sharePayload && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h3 className="font-semibold text-white">Share My Addy</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* QR code */}
              <div ref={qrWrapperRef} className="flex justify-center">
                <QRDisplay value={sharePayload} size={220} />
              </div>

              {/* Address + copy */}
              <div className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <p className="flex-1 text-slate-100 text-xs font-mono truncate">{myAddress}</p>
                <button
                  onClick={handleCopyAddress}
                  className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                    copiedAddr
                      ? 'bg-emerald-600/30 text-emerald-400'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                  aria-label="Copy address"
                >
                  {copiedAddr ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                             bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium
                             transition-colors"
                >
                  <Download size={16} /> Download QR
                </button>
                {'share' in navigator && (
                  <button
                    onClick={handleShareAddy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                               bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium
                               transition-colors"
                  >
                    <Share2 size={16} /> Share
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-500 text-center">
                Your contact can scan this with their qBTC Wallet app to add you instantly.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
