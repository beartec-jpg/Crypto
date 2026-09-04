import { useState } from 'react';
import { Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getOscillatorLiveReport, getOscillatorManual } from '@/lib/indicators/oscillatorManual';
import type { OscillatorData } from '@/hooks/useOscillatorData';

interface OscillatorInfoButtonProps {
  id: string;
  oscillatorData: OscillatorData;
  candles: Array<{ time?: number; open?: number; high?: number; low?: number; close?: number }>;
}

export function OscillatorInfoButton({ id, oscillatorData, candles }: OscillatorInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const manual = getOscillatorManual(id);
  const ohlc = candles
    .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null)
    .map((c) => ({ open: c.open as number, high: c.high as number, low: c.low as number, close: c.close as number }));
  const live = open ? getOscillatorLiveReport(id, oscillatorData, ohlc) : null;

  return (
    <>
      <button
        type="button"
        className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-500 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
        aria-label={`${manual.title} training`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Info className="h-3 w-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-900 p-0 text-slate-100 gap-0 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-700 px-4 py-3">
            <DialogTitle className="text-sm font-semibold">{manual.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-3 text-[12px] leading-snug">
            <section>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Training</h3>
              <p className="text-slate-200">{manual.how}</p>
              <p className="mt-2 text-slate-300">{manual.levels}</p>
            </section>
            <section className="border-t border-slate-700 pt-3">
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Now</h3>
              {live ? (
                <>
                  <p className={`font-semibold ${live.color}`}>{live.headline}</p>
                  <p className="mt-1 text-slate-200">{live.meaning}</p>
                </>
              ) : (
                <p className="text-slate-400">Need more candles for a live read.</p>
              )}
            </section>
            <section className="border-t border-slate-700 pt-3">
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">What it may show</h3>
              <p className="text-slate-300">{live?.lookFor || manual.levels}</p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface OscillatorDockHeaderProps {
  id: string;
  title: string;
  onCycle?: (id: string) => void;
  oscillatorData: OscillatorData;
  candles: OscillatorInfoButtonProps['candles'];
}

export function OscillatorDockHeader({
  id,
  title,
  onCycle,
  oscillatorData,
  candles,
}: OscillatorDockHeaderProps) {
  return (
    <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-slate-300 select-none"
        onClick={() => onCycle?.(id)}
      >
        {title}
        <span className="ml-2 text-slate-600">tap to cycle</span>
      </button>
      <OscillatorInfoButton id={id} oscillatorData={oscillatorData} candles={candles} />
    </div>
  );
}
