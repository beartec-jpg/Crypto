// client/src/components/Wallet/ConfirmationTimer.tsx
// Non-linear confirmation time slider (1min → 1hr) with security feedback and live polling

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, ShieldCheck, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

// Non-linear time steps: bottom-heavy (more sensitive at low end)
const TIME_STEPS = [1, 2, 3, 5, 10, 15, 30, 60]; // minutes
const BLOCK_TIME_SECONDS = 10; // QBTC 10-second blocks

function minutesToConfirmations(minutes: number): number {
  return Math.floor((minutes * 60) / BLOCK_TIME_SECONDS);
}

function formatTime(minutes: number): string {
  if (minutes >= 60) return '1 hour';
  return `${minutes} min`;
}

type SecurityLevel = 'low' | 'medium' | 'high' | 'maximum';

function getSecurityLevel(confirmations: number): SecurityLevel {
  if (confirmations <= 12) return 'low';
  if (confirmations <= 30) return 'medium';
  if (confirmations <= 90) return 'high';
  return 'maximum';
}

const SECURITY_CONFIG: Record<SecurityLevel, { label: string; color: string; bgColor: string; borderColor: string; description: string }> = {
  low: {
    label: 'Basic',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/30',
    description: 'Suitable for small amounts',
  },
  medium: {
    label: 'Standard',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    description: 'Good for most transactions',
  },
  high: {
    label: 'Secure',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    description: 'High security — very hard to reverse',
  },
  maximum: {
    label: 'Maximum',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/30',
    description: 'Maximum security — virtually irreversible',
  },
};

interface ConfirmationTimerProps {
  /** Called when the user changes the confirmation target */
  onTargetChange?: (minutes: number, confirmations: number) => void;
  /** When set, activates live polling mode */
  txid?: string;
  /** Callback to poll for confirmations — should return current count */
  pollConfirmations?: (txid: string) => Promise<number>;
  /** Called when target confirmations reached */
  onConfirmed?: (confirmations: number) => void;
  /** Default slider position index (default: 4 = 10min) */
  defaultStepIndex?: number;
}

export default function ConfirmationTimer({
  onTargetChange,
  txid,
  pollConfirmations,
  onConfirmed,
  defaultStepIndex = 4, // 10min = index 4
}: ConfirmationTimerProps) {
  const [stepIndex, setStepIndex] = useState(defaultStepIndex);
  const [currentConfirmations, setCurrentConfirmations] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const minutes = TIME_STEPS[stepIndex] ?? TIME_STEPS[4];
  const targetConfirmations = minutesToConfirmations(minutes);
  const securityLevel = getSecurityLevel(targetConfirmations);
  const config = SECURITY_CONFIG[securityLevel] ?? SECURITY_CONFIG['low'];

  // Notify parent of target changes
  useEffect(() => {
    onTargetChange?.(minutes, targetConfirmations);
  }, [minutes, targetConfirmations, onTargetChange]);

  // Start polling when txid is provided
  useEffect(() => {
    if (!txid || !pollConfirmations) return;

    setIsPolling(true);
    startTimeRef.current = Date.now();

    // Elapsed time counter
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Poll for confirmations every 15s
    const poll = async () => {
      try {
        const confs = await pollConfirmations(txid);
        setCurrentConfirmations(confs);
        if (confs >= targetConfirmations) {
          setIsConfirmed(true);
          setIsPolling(false);
          onConfirmed?.(confs);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
        }
      } catch {
        // Silently retry on next interval
      }
    };

    void poll(); // immediate first check
    pollIntervalRef.current = setInterval(() => void poll(), 15_000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [txid, pollConfirmations, targetConfirmations, onConfirmed]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStepIndex(Number(e.target.value));
  }, []);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  };

  const SecurityIcon = securityLevel === 'maximum' ? ShieldCheck
    : securityLevel === 'low' ? ShieldAlert
    : Shield;

  // Progress bar (0–100%) based on confirmations toward target
  const progress = targetConfirmations === 0 ? 100 : Math.min(100, (currentConfirmations / targetConfirmations) * 100);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">Confirmation Security</label>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}>
          <SecurityIcon className="w-3 h-3" />
          {config.label}
        </div>
      </div>

      {/* Slider */}
      {!txid && (
        <>
          <div className="relative px-1">
            <input
              type="range"
              min={0}
              max={TIME_STEPS.length - 1}
              step={1}
              value={stepIndex}
              onChange={handleSliderChange}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-500"
              style={{
                background: `linear-gradient(to right, 
                  rgb(107, 114, 128) 0%, 
                  rgb(234, 179, 8) 14%, 
                  rgb(59, 130, 246) 42%, 
                  rgb(16, 185, 129) 57%, 
                  rgb(6, 182, 212) 100%)`,
              }}
            />
            {/* Step tick marks */}
            <div className="flex justify-between mt-1 px-0.5">
              {TIME_STEPS.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStepIndex(i)}
                  className={`text-[10px] transition-colors ${
                    i === stepIndex ? config.color + ' font-bold' : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  {t >= 60 ? '1h' : `${t}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Info line */}
          <div className={`px-3 py-2 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
            <div className="flex items-start gap-2">
              <SecurityIcon className={`w-4 h-4 ${config.color} flex-shrink-0 mt-0.5`} />
              <div>
                <p className={`text-xs ${config.color}`}>
                  <strong>{formatTime(minutes)}</strong> — {targetConfirmations} block{targetConfirmations !== 1 ? 's' : ''} (10s each)
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live polling progress (shown after broadcast) */}
      {txid && (
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out ${
                isConfirmed
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                  : 'bg-gradient-to-r from-yellow-500 to-emerald-500'
              }`}
              style={{ width: `${progress}%` }}
            />
            {/* Shimmer effect while polling */}
            {isPolling && !isConfirmed && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            )}
          </div>

          {/* Status line */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              {isConfirmed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
              )}
              <span className={isConfirmed ? 'text-emerald-400 font-medium' : 'text-gray-400'}>
                {isConfirmed
                  ? `Confirmed — ${currentConfirmations} block${currentConfirmations !== 1 ? 's' : ''}`
                  : `${currentConfirmations} / ${targetConfirmations} blocks`}
              </span>
            </div>
            {isPolling && (
              <span className="text-gray-500 font-mono">{formatElapsed(elapsedSeconds)}</span>
            )}
          </div>

          {/* Security badge when confirmed */}
          {isConfirmed && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
              <ShieldCheck className={`w-4 h-4 ${config.color}`} />
              <span className={`text-xs font-medium ${config.color}`}>
                {config.label} security — transaction is {securityLevel === 'maximum' ? 'virtually irreversible' : 'confirmed'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
