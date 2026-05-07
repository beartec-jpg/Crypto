import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { validatePin } from '../lib/vault';

interface PinSetupProps {
  onComplete: (pin: string) => void;
}

export default function PinSetup({ onComplete }: PinSetupProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validatePin(pin);
    if (validationError) { setError(validationError); return; }
    if (pin !== confirm) { setError('PINs do not match'); return; }
    setError('');
    onComplete(pin);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-cyan-400">
        <Lock size={20} />
        <h2 className="text-lg font-semibold">Create a PIN</h2>
      </div>
      <p className="text-sm text-slate-400">
        Your PIN encrypts your wallet locally. It is never sent anywhere.
        Use at least 6 characters.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            placeholder="Enter PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 pr-10
                       text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPin(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <input
          type={showPin ? 'text' : 'password'}
          placeholder="Confirm PIN"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3
                     text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          autoComplete="new-password"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={!pin || !confirm}
          className="w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
