import { Fingerprint, Loader } from 'lucide-react';
import { useState } from 'react';

interface PasskeyUnlockProps {
  onUnlock: () => Promise<void>;
  error?: string;
}

export default function PasskeyUnlock({ onUnlock, error }: PasskeyUnlockProps) {
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    setLoading(true);
    try {
      await onUnlock();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 text-center">
        <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
          <Fingerprint size={48} className="text-cyan-400" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white">qBTC Wallet</h1>
          <p className="text-slate-400 text-sm mt-2">
            Authenticate with your passkey to unlock
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 w-full">
            {error}
          </p>
        )}

        <button
          onClick={handleUnlock}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700
                     text-white font-semibold text-lg flex items-center justify-center gap-3
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader size={20} className="animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              <Fingerprint size={20} />
              Unlock
            </>
          )}
        </button>
      </div>
    </div>
  );
}
