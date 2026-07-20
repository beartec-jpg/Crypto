import { useEffect, useState } from 'react';

/**
 * Funny cycling loading messages shown across all loading spinners
 */
export const LOADING_MESSAGES = [
  'Weighing the candles…',
  'Training the hamsters…',
  'Discombobulating the RSI matrix…',
  'Shaking the Fibonacci tree…',
  'Interrogating the order book…',
  'Consulting the sacred moving averages…',
  'Bribing the market makers…',
  'Untangling the Bollinger Bands…',
  'Polishing the crystal ball…',
  'Asking the whales nicely…',
  'Decoding whale whispers…',
  'Feeding the algorithm…',
  'Counting Elliott waves by hand…',
  'Recalibrating the hopium meter…',
  'Cross-examining the volume profile…',
  'Warming up the neural hamsters…',
  'Reading the tea leaves (and the candles)…',
  'Aligning the liquidity chakras…',
  "Reverse-engineering Satoshi's diary…",
  'Stress-testing the crayons…',
  'Poking the smart money…',
  'Calibrating the moon laser…',
  'Waking up the quant bots…',
  'Flipping coins (just kidding)…',
  'Summoning the liquidity gods…',
] as const;

function getNextIndex(previousIndex?: number): number {
  const nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
  if (LOADING_MESSAGES.length <= 1 || nextIndex !== previousIndex) {
    return nextIndex;
  }
  return (nextIndex + 1) % LOADING_MESSAGES.length;
}

/**
 * Hook that cycles through funny loading messages every `intervalMs`.
 * Returns the current message string. The cycle only runs while `active` is true.
 */
export function useLoadingMessages(active: boolean, intervalMs = 3000): string {
  const [index, setIndex] = useState(() => getNextIndex());

  useEffect(() => {
    if (!active) return;
    setIndex((prev) => getNextIndex(prev));
    const id = window.setInterval(() => {
      setIndex((prev) => getNextIndex(prev));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return LOADING_MESSAGES[index];
}
