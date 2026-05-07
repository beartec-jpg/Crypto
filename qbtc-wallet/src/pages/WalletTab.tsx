import { useState } from 'react';
import { Send, QrCode, RefreshCw, Copy, CheckCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import QRDisplay from '../components/QRDisplay';
import SendForm from '../components/SendForm';
import type { QBTCKeyPair } from '../lib/keys';

interface WalletTabProps {
  address: string;
  masterSeed: Uint8Array;
  keyPair: QBTCKeyPair | null;
  network: 'testnet' | 'mainnet';
}

type SubView = 'main' | 'receive' | 'send';

export default function WalletTab({ address, masterSeed, keyPair, network }: WalletTabProps) {
  const { balance, utxos, loading, error, refresh } = useWallet(address, network);
  const [subView, setSubView] = useState<SubView>('main');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (subView === 'receive') {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setSubView('main')} className="text-slate-400">
            ←
          </button>
          <h2 className="font-semibold text-white">Receive qBTC</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center gap-5">
          <QRDisplay value={address} size={220} />
          <div className="w-full bg-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Your address</p>
            <p className="text-slate-100 text-sm font-mono break-all leading-relaxed">{address}</p>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-cyan-400 font-medium"
          >
            {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
        </div>
      </div>
    );
  }

  if (subView === 'send') {
    return (
      <SendForm
        utxos={utxos}
        fromAddress={address}
        keyPair={keyPair}
        network={network}
        onBack={() => setSubView('main')}
        onSent={() => { setSubView('main'); refresh(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Wallet</h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {network === 'testnet' && (
          <span className="text-xs text-yellow-500 font-medium">Testnet</span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto">
        {/* Balance */}
        <div className="px-5 py-8 text-center">
          <p className="text-5xl font-bold text-white tabular-nums">
            {balance.toFixed(4)}
          </p>
          <p className="text-slate-400 mt-1 text-sm">qBTC</p>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 px-5 pb-6 justify-center">
          <button
            onClick={() => setSubView('send')}
            className="flex flex-col items-center gap-1 flex-1 bg-slate-800 hover:bg-slate-700
                       rounded-xl py-4 transition-colors"
          >
            <ArrowUpRight size={22} className="text-cyan-400" />
            <span className="text-sm text-slate-200 font-medium">Send</span>
          </button>
          <button
            onClick={() => setSubView('receive')}
            className="flex flex-col items-center gap-1 flex-1 bg-slate-800 hover:bg-slate-700
                       rounded-xl py-4 transition-colors"
          >
            <ArrowDownLeft size={22} className="text-cyan-400" />
            <span className="text-sm text-slate-200 font-medium">Receive</span>
          </button>
        </div>

        {/* UTXO list */}
        {utxos.length > 0 && (
          <div className="px-5 pb-6">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-medium">
              UTXOs ({utxos.length})
            </p>
            <div className="flex flex-col gap-2">
              {utxos.map(u => (
                <div key={`${u.txid}:${u.vout}`}
                  className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send size={14} className="text-slate-500" />
                    <span className="text-slate-400 text-xs font-mono">
                      {u.txid.slice(0, 8)}…:{u.vout}
                    </span>
                  </div>
                  <span className="text-slate-100 text-sm font-mono">{u.amount.toFixed(8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {utxos.length === 0 && !loading && (
          <div className="text-center px-5 pb-10">
            <QrCode size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No funds yet</p>
            <p className="text-slate-600 text-xs mt-1">Tap Receive to get your address</p>
          </div>
        )}
      </div>
    </div>
  );
}
