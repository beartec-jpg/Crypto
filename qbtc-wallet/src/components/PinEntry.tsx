import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PinEntryProps {
  onUnlock: (pin: string) => Promise<boolean>;
}

export default function PinEntry({ onUnlock }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || loading) return;
    setLoading(true);
    setError('');
    const ok = await onUnlock(pin);
    setLoading(false);
    if (!ok) {
      setError('Incorrect PIN — please try again');
      setPin('');
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <Lock size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">qBTC Wallet</h1>
          <p className="text-slate-400 text-sm mt-1">Enter your PIN to unlock</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              placeholder="PIN"
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 pr-10
                         text-slate-100 placeholder-slate-500 text-center text-xl tracking-widest
                         focus:outline-none focus:border-cyan-500"
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPin(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={!pin || loading}
            className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
