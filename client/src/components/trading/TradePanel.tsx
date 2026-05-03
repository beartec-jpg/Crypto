import { useState } from 'react';
import { X, TrendingUp, TrendingDown, Trash2, LogOut, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ManualTrade } from '@/lib/chartPrimitives/TradePrimitive';

interface TradePanelProps {
  currentPrice: number;
  currentTime: number;
  symbol: string;
  trades: ManualTrade[];
  onAddTrade: (
    direction: 'LONG' | 'SHORT',
    entry: number,
    sl: number,
    tp: number,
    entryTime: number,
    closeTime?: number,
  ) => void;
  onExitTrade: (id: string, exitTime: number) => void;
  onDeleteTrade: (id: string) => void;
  onClose: () => void;
}

type View = 'main' | 'open' | 'results' | 'history';

/** Convert a Unix timestamp (seconds) to datetime-local input value */
function tsToDatetimeLocal(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  // datetime-local expects "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local input string to Unix timestamp (seconds) */
function datetimeLocalToTs(s: string): number {
  if (!s) return 0;
  return Math.floor(new Date(s).getTime() / 1000);
}

/** Format a Unix timestamp to a short human-readable string */
function formatTs(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TradePanel({
  currentPrice,
  currentTime,
  symbol,
  trades,
  onAddTrade,
  onExitTrade,
  onDeleteTrade,
  onClose,
}: TradePanelProps) {
  const [view, setView] = useState<View>('main');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryInput, setEntryInput] = useState(String(currentPrice));
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');

  // Historical trade form state
  const [histDir, setHistDir] = useState<'LONG' | 'SHORT'>('LONG');
  const [histEntry, setHistEntry] = useState('');
  const [histSl, setHistSl] = useState('');
  const [histTp, setHistTp] = useState('');
  const [histStillActive, setHistStillActive] = useState(false);
  const [histEntryDate, setHistEntryDate] = useState(tsToDatetimeLocal(Math.min(currentTime, Math.floor(Date.now() / 1000)) - 86400));
  const [histExitDate, setHistExitDate] = useState(tsToDatetimeLocal(Math.min(currentTime, Math.floor(Date.now() / 1000))));

  const handleCreate = () => {
    const entry = parseFloat(entryInput);
    const sl = parseFloat(slInput);
    const tp = parseFloat(tpInput);
    if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return;
    onAddTrade(direction, entry, sl, tp, currentTime);
    setView('main');
    setSlInput('');
    setTpInput('');
  };

  const handleAddHistorical = () => {
    const entry = parseFloat(histEntry);
    const sl = parseFloat(histSl);
    const tp = parseFloat(histTp);
    const entryTs = datetimeLocalToTs(histEntryDate);
    const exitTs = histStillActive ? undefined : datetimeLocalToTs(histExitDate);
    if (isNaN(entry) || isNaN(sl) || isNaN(tp) || !entryTs) return;
    if (!histStillActive && !exitTs) return;
    onAddTrade(histDir, entry, sl, tp, entryTs, exitTs);
    setView('results');
    setHistEntry('');
    setHistSl('');
    setHistTp('');
  };

  const wins = trades.filter(t => t.outcome === 'win').length;
  const losses = trades.filter(t => t.outcome === 'loss').length;
  const pending = trades.filter(t => !t.outcome).length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <div className="w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-slate-100 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800 rounded-t-lg">
        <span className="font-semibold text-slate-200">Trade</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-400 hover:text-white" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Main View */}
      {view === 'main' && (
        <div className="p-3 space-y-2">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            onClick={() => { setEntryInput(String(currentPrice)); setView('open'); }}
          >
            Open Trade
          </Button>
          <Button
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"
            onClick={() => setView('history')}
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            Add Historical Trade
          </Button>
          <Button
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"
            onClick={() => setView('results')}
          >
            Results
            {trades.length > 0 && (
              <span className="ml-1 text-xs text-slate-400">
                ({wins}W / {losses}L{pending > 0 ? ` / ${pending}P` : ''})
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Open Trade Form */}
      {view === 'open' && (
        <div className="p-3 space-y-3">
          {/* Direction */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setDirection('LONG')}
              className={cn(
                'flex-1 font-semibold',
                direction === 'LONG'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" /> LONG
            </Button>
            <Button
              size="sm"
              onClick={() => setDirection('SHORT')}
              className={cn(
                'flex-1 font-semibold',
                direction === 'SHORT'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              <TrendingDown className="h-3.5 w-3.5 mr-1" /> SHORT
            </Button>
          </div>

          {/* Activation time (read-only) */}
          <div className="bg-slate-800 rounded px-2 py-1.5 text-xs text-slate-400">
            <span className="text-slate-500">Activation:</span>{' '}
            <span className="text-slate-200">{formatTs(currentTime)}</span>
          </div>

          {/* Entry */}
          <div>
            <Label className="text-slate-400 text-xs">Entry Price</Label>
            <div className="flex gap-1 mt-1">
              <Input
                type="number"
                value={entryInput}
                onChange={e => setEntryInput(e.target.value)}
                className="flex-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
                placeholder="Entry"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs border-slate-600 text-slate-400 hover:text-white"
                onClick={() => setEntryInput(String(currentPrice))}
              >
                Mkt
              </Button>
            </div>
          </div>

          {/* SL */}
          <div>
            <Label className="text-slate-400 text-xs">Stop Loss</Label>
            <Input
              type="number"
              value={slInput}
              onChange={e => setSlInput(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder={direction === 'LONG' ? 'Below entry' : 'Above entry'}
            />
          </div>

          {/* TP */}
          <div>
            <Label className="text-slate-400 text-xs">Take Profit</Label>
            <Input
              type="number"
              value={tpInput}
              onChange={e => setTpInput(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder={direction === 'LONG' ? 'Above entry' : 'Below entry'}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-slate-600 text-slate-400 hover:text-white"
              onClick={() => setView('main')}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleCreate}
              disabled={!entryInput || !slInput || !tpInput}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Historical Trade Form */}
      {view === 'history' && (
        <div className="p-3 space-y-3">
          <p className="text-slate-400 text-xs">Plot a past trade on the chart.</p>

          {/* Direction */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setHistDir('LONG')}
              className={cn(
                'flex-1 font-semibold',
                histDir === 'LONG'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" /> LONG
            </Button>
            <Button
              size="sm"
              onClick={() => setHistDir('SHORT')}
              className={cn(
                'flex-1 font-semibold',
                histDir === 'SHORT'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              <TrendingDown className="h-3.5 w-3.5 mr-1" /> SHORT
            </Button>
          </div>

          {/* Still Active toggle */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setHistStillActive(false)}
              className={cn(
                'flex-1 text-xs font-semibold',
                !histStillActive
                  ? 'bg-slate-600 hover:bg-slate-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              Closed
            </Button>
            <Button
              size="sm"
              onClick={() => setHistStillActive(true)}
              className={cn(
                'flex-1 text-xs font-semibold',
                histStillActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-600',
              )}
            >
              Still Active
            </Button>
          </div>

          {/* Entry date */}
          <div>
            <Label className="text-slate-400 text-xs">Entry Date &amp; Time</Label>
            <Input
              type="datetime-local"
              value={histEntryDate}
              onChange={e => setHistEntryDate(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
            />
          </div>

          {/* Exit date – only shown when trade is closed */}
          {!histStillActive && (
            <div>
              <Label className="text-slate-400 text-xs">Exit Date &amp; Time</Label>
              <Input
                type="datetime-local"
                value={histExitDate}
                onChange={e => setHistExitDate(e.target.value)}
                className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              />
            </div>
          )}

          {/* Entry price */}
          <div>
            <Label className="text-slate-400 text-xs">Entry Price</Label>
            <Input
              type="number"
              value={histEntry}
              onChange={e => setHistEntry(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder="Entry price"
            />
          </div>

          {/* SL */}
          <div>
            <Label className="text-slate-400 text-xs">Stop Loss</Label>
            <Input
              type="number"
              value={histSl}
              onChange={e => setHistSl(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder="SL price"
            />
          </div>

          {/* TP */}
          <div>
            <Label className="text-slate-400 text-xs">Take Profit</Label>
            <Input
              type="number"
              value={histTp}
              onChange={e => setHistTp(e.target.value)}
              className="mt-1 h-8 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder="TP price"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-slate-600 text-slate-400 hover:text-white"
              onClick={() => setView('main')}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleAddHistorical}
              disabled={!histEntry || !histSl || !histTp || !histEntryDate || (!histStillActive && !histExitDate)}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Results View */}
      {view === 'results' && (
        <div className="p-3 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-800 rounded p-2">
              <div className="text-green-400 font-bold">{wins}</div>
              <div className="text-slate-400 text-[10px]">Wins</div>
            </div>
            <div className="bg-slate-800 rounded p-2">
              <div className="text-red-400 font-bold">{losses}</div>
              <div className="text-slate-400 text-[10px]">Losses</div>
            </div>
            <div className="bg-slate-800 rounded p-2">
              <div className="text-slate-200 font-bold">{winRate}%</div>
              <div className="text-slate-400 text-[10px]">Win Rate</div>
            </div>
          </div>

          {/* Trade list */}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {trades.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-4">No trades yet</p>
            ) : (
              trades.map(trade => (
                <div
                  key={trade.id}
                  className="bg-slate-800 rounded px-2 py-1.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-1 rounded',
                          trade.direction === 'LONG' ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400',
                        )}
                      >
                        {trade.direction}
                      </span>
                      {trade.outcome ? (
                        <span
                          className={cn(
                            'text-[10px] font-semibold',
                            trade.outcome === 'win' ? 'text-green-400' : trade.outcome === 'loss' ? 'text-red-400' : 'text-purple-400',
                          )}
                        >
                          {trade.outcome === 'win' ? '✓ WIN' : trade.outcome === 'loss' ? '✗ LOSS' : '◉ MANUAL'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Pending</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Exit button – only for pending (open) trades */}
                      {!trade.outcome && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 text-slate-500 hover:text-purple-400 shrink-0"
                          onClick={() => onExitTrade(trade.id, currentTime)}
                          title="Exit trade now"
                        >
                          <LogOut className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0 text-slate-500 hover:text-red-400 shrink-0"
                        onClick={() => onDeleteTrade(trade.id)}
                        title="Delete trade"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    E:{trade.entryPrice} SL:{trade.slPrice} TP:{trade.tpPrice}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span title="Activation time">▶ {formatTs(trade.entryTime)}</span>
                    {trade.closeTime && (
                      <span className="ml-2" title="Exit time">■ {formatTs(trade.closeTime)}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full border-slate-600 text-slate-400 hover:text-white"
            onClick={() => setView('main')}
          >
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
