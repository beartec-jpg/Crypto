/**
 * Color utility functions for the Active System Monitor and related components.
 * Maps trading system scores (-100 to +100) to Tailwind classes and labels.
 */

/** Returns a Tailwind text color class based on the score. */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-lime-400';
  if (score >= 20) return 'text-yellow-400';
  if (score >= -20) return 'text-slate-400';
  if (score >= -50) return 'text-orange-400';
  if (score >= -80) return 'text-orange-500';
  return 'text-red-500';
}

/** Returns a Tailwind background color class for the score bar. */
export function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-lime-500';
  if (score >= 20) return 'bg-yellow-500';
  if (score >= -20) return 'bg-slate-500';
  if (score >= -50) return 'bg-orange-500';
  if (score >= -80) return 'bg-orange-600';
  return 'bg-red-600';
}

/** Returns a Tailwind text color class based on the signal label string. */
export function getSentimentColor(signalLabel: string): string {
  const lower = signalLabel.toLowerCase();
  if (lower.includes('buy') || lower.includes('bullish')) return 'text-green-400';
  if (lower.includes('sell') || lower.includes('bearish')) return 'text-red-400';
  return 'text-slate-400';
}

/** Returns a human-readable sentiment label derived from the score. */
export function getSentimentLabel(score: number): string {
  if (score >= 80) return 'STRONG BULLISH';
  if (score >= 50) return 'BULLISH';
  if (score >= 20) return 'WEAK BULLISH';
  if (score >= -20) return 'NEUTRAL';
  if (score >= -50) return 'WEAK BEARISH';
  if (score >= -80) return 'BEARISH';
  return 'STRONG BEARISH';
}

/** Returns a human-readable "time ago" string from a Unix ms timestamp. */
export function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
