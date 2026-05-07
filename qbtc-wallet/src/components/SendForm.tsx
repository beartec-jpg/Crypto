import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { buildAndSignTx } from '../lib/txBuilder';
import { broadcastTransaction, estimateFeeRate } from '../lib/rpc';
import QRScanner from './QRScanner';
import type { UtxoEntry } from '../lib/rpc';
import type { QBTCKeyPair } from '../lib/keys';

interface SendFormProps {
  utxos: UtxoEntry[];
  fromAddress: string;
  keyPair: QBTCKeyPair | null;
  network: 'testnet' | 'mainnet';
  onBack: () => void;
  onSent: (txid: string) => void;
}

type SendStep = 'form' | 'confirm' | 'broadcasting' | 'success' | 'error';

export default function SendForm({ utxos, fromAddress, keyPair, network, onBack, onSent }: SendFormProps) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<SendStep>('form');
  const [txid, setTxid] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<number | null>(null);
  const [buildResult, setBuildResult] = useState<{ hex: string; fee: number } | null>(null);

  const totalBalance = utxos.reduce((sum, u) => sum + u.amount, 0);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!keyPair) { setErrorMsg('Wallet not loaded'); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { setErrorMsg('Invalid amount'); return; }
    const amountSats = Math.round(amountNum * 1e8);
    try {
      const feeRate = await estimateFeeRate(6);
      setFeeEstimate(feeRate);
      const result = await buildAndSignTx(keyPair, utxos, toAddress, amountSats, feeRate, network);
      setBuildResult(result);
      setErrorMsg('');
      setStep('confirm');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to build transaction');
    }
  }

  async function handleBroadcast() {
    if (!buildResult) return;
    setStep('broadcasting');
    try {
      const id = await broadcastTransaction(buildResult.hex);
      setTxid(id);
      setStep('success');
      setTimeout(() => onSent(id), 1500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Broadcast failed');
      setStep('error');
    }
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-5">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <span className="text-3xl">✓</span>
        </div>
        <h3 className="text-xl font-bold text-white">Sent!</h3>
        <p className="text-slate-400 text-xs font-mono text-center break-all">{txid}</p>
      </div>
    );
  }

  if (step === 'broadcasting') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-300 text-sm">Broadcasting…</p>
      </div>
    );
  }

  if (step === 'confirm') {
    const amountNum = parseFloat(amount);
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <button onClick={() => setStep('form')} className="text-slate-400">←</button>
          <h2 className="font-semibold text-white">Confirm Send</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-4">
          <Row label="To" value={toAddress} mono />
          <Row label="Amount" value={`${amountNum.toFixed(8)} qBTC`} />
          <Row label="Fee" value={`${buildResult?.fee.toFixed(8)} qBTC (${feeEstimate} sat/vbyte)`} />
          <Row label="Total" value={`${(amountNum + (buildResult?.fee ?? 0)).toFixed(8)} qBTC`} />
          {errorMsg ? (
            <p className="text-red-400 text-sm">{errorMsg}</p>
          ) : null}
        </div>
        <div className="px-5 pb-6 flex gap-3">
          <button onClick={() => setStep('form')}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-semibold">
            Cancel
          </button>
          <button onClick={handleBroadcast}
            className="flex-1 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
            Confirm & Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
        <button onClick={onBack} className="text-slate-400">←</button>
        <h2 className="font-semibold text-white">Send qBTC</h2>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <form onSubmit={handlePreview} className="flex flex-col gap-5">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Recipient</label>
            <div className="flex gap-2">
              <input
                value={toAddress}
                onChange={e => setToAddress(e.target.value.trim())}
                placeholder="qbtct1…"
                className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100
                           placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="bg-slate-800 border border-slate-600 rounded-xl px-4 flex items-center
                           text-cyan-400 hover:bg-slate-700"
              >
                <ScanLine size={20} />
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Amount (qBTC)</label>
            <input
              type="number"
              step="0.00000001"
              min="0"
              max={totalBalance}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00000000"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100
                         placeholder-slate-500 text-xl font-mono focus:outline-none focus:border-cyan-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Available: {totalBalance.toFixed(8)} qBTC
            </p>
          </div>
          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
          <button
            type="submit"
            disabled={!toAddress || !amount || !keyPair}
            className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview
          </button>
        </form>
      </div>
      {scanning && (
        <QRScanner
          onScan={result => { setToAddress(result); setScanning(false); }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-slate-800 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-slate-100 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
