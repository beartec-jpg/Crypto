import { useState, useEffect, useCallback, useRef } from 'react';
import { Download } from 'lucide-react';
import { useVault } from './hooks/useVault';
import { deriveKeyPair, deriveMessagingKeyPair } from './lib/keys';
import type { QBTCKeyPair } from './lib/keys';
import OnboardingPage from './pages/OnboardingPage';
import WalletTab from './pages/WalletTab';
import MessengerTab from './pages/MessengerTab';
import PinEntry from './components/PinEntry';
import BottomNav from './components/BottomNav';

type Tab = 'wallet' | 'messenger';

// In-memory cache of ECDH keys (cleared on lock)
let _messagingPrivateKey: CryptoKey | null = null;
let _messagingPublicKeyRaw: Uint8Array | null = null;

// Contact ECDH pub key store — populated when contacts share keys
// In production these would be fetched from a key server or QR exchanged
const contactPubKeys = new Map<string, Uint8Array>();

export default function App() {
  const { state, unlock, lock, setUnlocked } = useVault();
  const [tab, setTab] = useState<Tab>('wallet');
  const [keyPair, setKeyPair] = useState<QBTCKeyPair | null>(null);
  const [msgPrivKey, setMsgPrivKey] = useState<CryptoKey | null>(null);
  const [msgPubKeyRaw, setMsgPubKeyRaw] = useState<Uint8Array | null>(null);

  // PWA install prompt
  const installPromptRef = useRef<any>(null);
  const [installable, setInstallable] = useState(false);
  const [installedDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e;
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstallable(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
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
    })();

    return () => { cancelled = true; };
  }, [state.status]);

  const getContactPubKey = useCallback(
    (address: string) => contactPubKeys.get(address),
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
          />
        )}
      </div>
      <BottomNav active={tab} onChange={setTab} />
      {installBanner}
    </div>
  );
}
