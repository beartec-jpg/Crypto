import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  COACHMARK_DURATION_MS,
  recordCoachmarkShown,
  shouldShowCoachmark,
} from '@/lib/watchlistHints';

interface Props {
  /** Element the coachmark is anchored to (the expand button). */
  targetRef: RefObject<HTMLElement>;
}

/**
 * One-off coachmark for the chart fullscreen button: pulsing ring + tooltip
 * the first time the button scrolls into view. Max once per session and
 * 3 times total. pointer-events:none so it never blocks taps.
 */
export function ChartExpandCoachmark({ targetRef }: Props) {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = targetRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (!shouldShowCoachmark()) return;

    try {
      setReducedMotion(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    } catch {
      /* ignore */
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (doneRef.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          doneRef.current = true;
          observer.disconnect();
          if (!shouldShowCoachmark()) return;
          recordCoachmarkShown();
          setVisible(true);
          timer = setTimeout(() => setVisible(false), COACHMARK_DURATION_MS);
        }
      },
      { threshold: 1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [targetRef]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute top-2 right-2 z-20 h-8 w-8"
      aria-hidden="true"
      data-testid="chart-expand-coachmark"
    >
      {!reducedMotion && (
        <span className="absolute -inset-1.5 rounded-full border-2 border-sky-400/80 animate-ping" />
      )}
      <span className="absolute -inset-1 rounded-full border-2 border-sky-400" />
      <span className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-slate-900/95 px-2 py-1 text-xs text-sky-100 shadow-lg border border-sky-500/50">
        Tap to open full-screen chart
      </span>
    </div>
  );
}
