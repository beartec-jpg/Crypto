// Client helpers for /admin/analytics (formatting, ranges, CSV export).

export type RangePreset = '7d' | '30d' | '90d' | 'custom';

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now: Date = new Date()): { from: string; to: string } {
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() };
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: Math.abs(pence) >= 100000 ? 0 : 2 })
    .format((pence || 0) / 100);
}

export function formatPct(v: number): string {
  return `${(v || 0).toFixed(1)}%`;
}

/** CSV with escaping and a guard against spreadsheet formula injection. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface FunnelStep { label: string; value: number; pctOfPrev: number | null }

export function buildFunnel(signups: number, trialStarts: number, paid: number): FunnelStep[] {
  const p = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return [
    { label: 'Sign-ups', value: signups, pctOfPrev: null },
    { label: 'Trial starts', value: trialStarts, pctOfPrev: p(trialStarts, signups) },
    { label: 'Paid', value: paid, pctOfPrev: p(paid, trialStarts || signups) },
  ];
}
