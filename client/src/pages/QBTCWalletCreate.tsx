import { useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Shield, Key, Copy, CheckCircle2, Eye, EyeOff, Settings, RefreshCw, Lock } from 'lucide-react';
import * as bip39 from 'bip39';
import { QBTCKeyPair, getQBTCRpcSettings, setQBTCRpcSettings, type QBTCRpcSettings } from '@/lib/qbtcService';

interface WalletData {
  mnemonic: string;
  address: string;
  ecdsaPublicKey: string;
  dilithiumPublicKey: string;
  shamirShares: string[];
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
      title={label || 'Copy'}
    >
      {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : (label || 'Copy')}
    </button>
  );
}

export default function QBTCWalletCreate() {
  const [step, setStep] = useState<'create' | 'wallet' | 'settings'>('create');
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showShares, setShowShares] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rpcSettings, setRpcSettings] = useState<QBTCRpcSettings>(getQBTCRpcSettings());
  const [rpcSaved, setRpcSaved] = useState(false);

  const generateWallet = useCallback(async () => {
    setGenerating(true);
    try {
      const mnemonic = bip39.generateMnemonic(128);
      const keyPair = await QBTCKeyPair.fromMnemonic(mnemonic);
      const address = keyPair.getAddress('testnet');
      const shamirShares = keyPair.splitECDSAPrivateKey(3, 2);

      setWalletData({
        mnemonic,
        address,
        ecdsaPublicKey: keyPair.ecdsaPublicKeyHex,
        dilithiumPublicKey: keyPair.dilithiumPublicKeyHex,
        shamirShares,
      });
      setStep('wallet');
    } catch (err) {
      console.error('Wallet generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, []);

  const saveRpcSettings = useCallback(() => {
    setQBTCRpcSettings(rpcSettings);
    setRpcSaved(true);
    setTimeout(() => setRpcSaved(false), 2000);
  }, [rpcSettings]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-cyan-500 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-emerald-500 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/crypto">
            <button className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 transition-colors">
              Back to BearTec
            </button>
          </Link>
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap justify-end">
            <Link href="/qbtc-faucet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300">
                Faucet
              </button>
            </Link>
            <Link href="/wallet">
              <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-cyan-400 text-cyan-300">
                Multi-Chain Wallet
              </button>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 backdrop-blur p-6 md:p-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-cyan-400" />
            <h1 className="text-3xl font-bold tracking-tight">QBTC Wallet</h1>
          </div>
          <p className="text-slate-300 mb-6">
            Create a quantum-resistant QBTC wallet with hybrid ECDSA + ML-DSA-44 (Dilithium) signing.
          </p>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setStep(walletData ? 'wallet' : 'create')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === 'create' || step === 'wallet'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
              }`}
            >
              <Key className="w-4 h-4 inline mr-1.5" />
              Wallet
            </button>
            <button
              onClick={() => setStep('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === 'settings'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-1.5" />
              RPC Settings
            </button>
          </div>

          {(step === 'create' && !walletData) && (
            <div className="text-center py-12 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-300 text-sm border border-emerald-500/20">
                <Lock className="w-4 h-4" />
                Hybrid PQC: ECDSA + ML-DSA-44 (Dilithium)
              </div>
              <p className="text-slate-400 max-w-md mx-auto">
                Generate a BIP-39 mnemonic seed phrase and derive your quantum-resistant QBTC keypair.
                Includes Shamir 2-of-3 secret sharing backup.
              </p>
              <button
                onClick={generateWallet}
                disabled={generating}
                className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  'Generate QBTC Wallet'
                )}
              </button>
            </div>
          )}

          {(step === 'create' || step === 'wallet') && walletData && (
            <div className="space-y-5">
              {/* Mnemonic */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Recovery Phrase (BIP-39)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowMnemonic(!showMnemonic)}
                      className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200"
                    >
                      {showMnemonic ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showMnemonic ? 'Hide' : 'Show'}
                    </button>
                    {showMnemonic && <CopyButton text={walletData.mnemonic} />}
                  </div>
                </div>
                {showMnemonic ? (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {walletData.mnemonic.split(' ').map((word, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm font-mono bg-slate-950/60 rounded px-2 py-1">
                        <span className="text-slate-500 text-xs w-5">{i + 1}.</span>
                        <span className="text-slate-200">{word}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-200/60">Click &quot;Show&quot; to reveal your recovery phrase. Store it securely offline.</p>
                )}
              </div>

              {/* Address */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">QBTC Testnet Address</h3>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-cyan-300 text-sm break-all">{walletData.address}</p>
                  <CopyButton text={walletData.address} />
                </div>
              </div>

              {/* Dilithium Public Key */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  Dilithium Public Key (ML-DSA-44)
                </h3>
                <p className="text-xs text-slate-500 mb-2">1312 bytes — post-quantum signature verification key</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-emerald-300/80 text-xs break-all max-h-16 overflow-y-auto">
                    {walletData.dilithiumPublicKey.slice(0, 128)}...
                  </p>
                  <CopyButton text={walletData.dilithiumPublicKey} label="Copy Full" />
                </div>
              </div>

              {/* ECDSA Public Key */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">ECDSA Public Key</h3>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-slate-300 text-sm break-all">{walletData.ecdsaPublicKey}</p>
                  <CopyButton text={walletData.ecdsaPublicKey} />
                </div>
              </div>

              {/* Shamir 2-of-3 Shares */}
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-violet-300 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Shamir 2-of-3 Backup Shares
                  </h3>
                  <button
                    onClick={() => setShowShares(!showShares)}
                    className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200"
                  >
                    {showShares ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showShares ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-violet-200/60 mb-3">
                  Any 2 of 3 shares can reconstruct your private key. Distribute them to separate secure locations.
                </p>
                {showShares && walletData.shamirShares.map((share, i) => (
                  <div key={i} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between gap-2 bg-slate-950/60 rounded p-2">
                      <div>
                        <p className="text-xs text-violet-300 font-medium">Share {i + 1}</p>
                        <p className="font-mono text-[10px] text-slate-400 break-all">{share.slice(0, 64)}...</p>
                      </div>
                      <CopyButton text={share} label={`Copy #${i + 1}`} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Generate another */}
              <button
                onClick={() => {
                  setWalletData(null);
                  setShowMnemonic(false);
                  setShowShares(false);
                  setStep('create');
                }}
                className="w-full py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Generate New Wallet
              </button>
            </div>
          )}

          {step === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-200">Connect to QBTC Node</h3>
              <p className="text-sm text-slate-400">
                Configure RPC connection to your QBTC node for wallet operations.
              </p>

              <div>
                <label className="text-sm text-slate-300 block mb-1">Network</label>
                <select
                  value={rpcSettings.network}
                  onChange={(e) => setRpcSettings({ ...rpcSettings, network: e.target.value as 'testnet' | 'mainnet' })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                >
                  <option value="testnet">Testnet (qbtct1...)</option>
                  <option value="mainnet">Mainnet (qbtc1...)</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-300 block mb-1">RPC URL</label>
                <input
                  value={rpcSettings.rpcUrl}
                  onChange={(e) => setRpcSettings({ ...rpcSettings, rpcUrl: e.target.value })}
                  placeholder="http://localhost:28332"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Default: port 28332 (testnet), 8332 (mainnet)</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 block mb-1">RPC Username</label>
                  <input
                    value={rpcSettings.username || ''}
                    onChange={(e) => setRpcSettings({ ...rpcSettings, username: e.target.value })}
                    placeholder="rpcuser"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1">RPC Password</label>
                  <input
                    type="password"
                    value={rpcSettings.password || ''}
                    onChange={(e) => setRpcSettings({ ...rpcSettings, password: e.target.value })}
                    placeholder="rpcpass"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-300 block mb-1">Fee Rate (sat/vB)</label>
                <input
                  type="number"
                  value={rpcSettings.feeRate || 10}
                  onChange={(e) => setRpcSettings({ ...rpcSettings, feeRate: Number(e.target.value) || 10 })}
                  min={1}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm"
                />
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
                <p className="font-medium text-slate-300 mb-1">Node Requirements</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>QBTC node with <code className="text-cyan-300">-pqc=1 -pqcmode=hybrid</code></li>
                  <li>RPC enabled with <code className="text-cyan-300">-rpcport=28332</code></li>
                  <li>ML-DSA-44 (Dilithium2) post-quantum signatures</li>
                </ul>
              </div>

              <button
                onClick={saveRpcSettings}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
              >
                {rpcSaved ? (
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Settings Saved
                  </span>
                ) : (
                  'Save RPC Settings'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
