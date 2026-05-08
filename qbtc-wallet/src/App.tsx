import { useState, useEffect, useCallback, useRef } from 'react';
import { Download } from 'lucide-react';
import { useVault } from './hooks/useVault';
import { deriveKeyPair, deriveMessagingKeyPair } from './lib/keys';
import type { QBTCKeyPair } from './lib/keys';
import { publishPubKey } from './lib/messaging';
import { listContacts } from './storage/contactStore';
import OnboardingPage from './pages/OnboardingPage';
import WalletTab from './pages/WalletTab';
import MessengerTab from './pages/MessengerTab';
import PinEntry from './components/PinEntry';
import BottomNav from './components/BottomNav';

type Tab = 'wallet' | 'messenger';

// In-memory cache of ECDH keys (cleared on lock)
let _messagingPrivateKey: CryptoKey | null = null;
let _messagingPublicKeyRaw: Uint8Array | null = null;

// Contact ECDH pub key store — keyed by qBTC address
const contactPubKeys = new Map<string, Uint8Array>();

export default function App() {
  const { state, unlock, lock, setUnlocked } = useVault();
  const [tab, setTab] = useState<Tab>('wallet');
  const [keyPair, setKeyPair] = useState<QBTCKeyPair | null>(null);
  const [msgPrivKey, setMsgPrivKey] = useState<CryptoKey | null>(null);
  const [msgPubKeyRaw, setMsgPubKeyRaw] = useState<Uint8Array | null>(null);

  // PWA install prompt — event may fire before React mounts, captured in index.html
  const installPromptRef = useRef<any>((window as any).deferredInstallPrompt ?? null);
  const [installable, setInstallable] = useState(() => !!(window as any).deferredInstallPrompt);
  const [installedDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    // In case it fires after mount
    const onReady = () => {
      installPromptRef.current = (window as any).deferredInstallPrompt;
      setInstallable(true);
    };
    window.addEventListener('installpromptready', onReady);
    window.addEventListener('appinstalled', () => setInstallable(false));
    return () => window.removeEventListener('installpromptready', onReady);
  }, []);

  async function handleInstall() {
    if (!installPromptRef.current) return;
    installPromptRef.current.prompt();
    const { outcome } = await installPromptRef.current.userChoice;
    if (outcome === 'accepted') setInstallable(false);
    installPromptRef.current = null;
  }

  // Derive key pair once the vault is unlocked
  useEffect(() => {
    if (state.status !== 'unlocked') {
      setKeyPair(null);
      setMsgPrivKey(null);
      setMsgPubKeyRaw(null);
      _messagingPrivateKey = null;
      _messagingPublicKeyRaw = null;
      return;
    }
    let cancelled = false;

    (async () => {
      const kp = await deriveKeyPair(state.masterSeed);
      const msg = await deriveMessagingKeyPair(state.masterSeed);
      if (cancelled) return;
      setKeyPair(kp);
      setMsgPrivKey(msg.privateKey);
      setMsgPubKeyRaw(msg.publicKeyRaw);
      _messagingPrivateKey = msg.privateKey;
      _messagingPublicKeyRaw = msg.publicKeyRaw;

      // Publish own public key to relay so contacts can find us
      publishPubKey(state.qbtcAddress, msg.publicKeyRaw).catch(() => {});

      // Load stored contact pub keys into the in-memory map
      contactPubKeys.clear();
      const contacts = await listContacts();
      for (const c of contacts) {
        if (c.pubKeyHex) {
          const hex = c.pubKeyHex;
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
          contactPubKeys.set(c.address, bytes);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [state.status]);

  const getContactPubKey = useCallback(
    (address: string) => contactPubKeys.get(address),
    [],
  );

  const setContactPubKey = useCallback(
    (address: string, key: Uint8Array) => { contactPubKeys.set(address, key); },
    [],
  );

  // ── loading ──────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Install banner (shown on any screen if installable)
  const installBanner = installable && !installedDismissed ? (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 bg-cyan-700 px-4 py-3 shadow-lg">
      <Download size={18} className="shrink-0 text-white" />
      <span className="flex-1 text-sm text-white font-medium">Install qBTC Wallet on your device</span>
      <button
        onClick={handleInstall}
        className="px-3 py-1.5 rounded-lg bg-white text-cyan-800 text-sm font-semibold"
      >
        Install
      </button>
      <button
        onClick={() => setInstallDismissed(true)}
        className="text-cyan-200 text-lg leading-none px-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  ) : null;

  // ── onboarding ───────────────────────────────────────────────────────────
  if (state.status === 'no-wallet') {
    return (
      <>
        <OnboardingPage
          onComplete={(masterSeed, qbtcAddress) => setUnlocked(masterSeed, qbtcAddress)}
        />
        {installBanner}
      </>
    );
  }

  // ── locked ───────────────────────────────────────────────────────────────
  if (state.status === 'locked') {
    return (
      <>
        <PinEntry onUnlock={unlock} />
        {installBanner}
      </>
    );
  }

  // ── unlocked ─────────────────────────────────────────────────────────────
  const { masterSeed, qbtcAddress } = state;

  return (
    <div className="flex flex-col h-screen bg-slate-950 safe-top">
      <div className="flex-1 overflow-hidden">
        {tab === 'wallet' ? (
          <WalletTab
            address={qbtcAddress}
            masterSeed={masterSeed}
            keyPair={keyPair}
            network="testnet"
          />
        ) : (
          <MessengerTab
            myAddress={qbtcAddress}
            myPrivateKey={msgPrivKey}
            myPublicKeyRaw={msgPubKeyRaw}
            getContactPubKey={getContactPubKey}
            setContactPubKey={setContactPubKey}
          />
        )}
      </div>
      <BottomNav active={tab} onChange={setTab} />
      {installBanner}
    </div>
  );
}
