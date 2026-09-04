import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, Loader2, Printer, Search, Sparkles } from 'lucide-react';

import { CryptoNavigation } from '@/components/CryptoNavigation';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useToast } from '@/hooks/use-toast';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { useLoadingMessages } from '@/hooks/useLoadingMessages';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { cn } from '@/lib/utils';
import {
  collectWatchLevels,
  formatTargetWithPercent,
  getHtfRelationshipBadgeVariant,
  getHtfRelationshipLabel,
  getOverallSummary,
  getSection,
  isPendingTradeIdea,
  type MultiTFInsights,
  type TradeIdea,
} from '@/lib/cryptoAiTradePlans';
import {
  buildSessionBoardSections,
  getLatestSnapshotInsights,
  parseKlinesToCandles,
} from '@/lib/cryptoAiSessionBoard';
import { queryClient } from '@/lib/queryClient';
import { formatTickerDisplay } from '@/lib/chart/priceUtils';
import { DEFAULT_AI_TRADER_MODE, ENABLED_AI_TRADER_MODES, isAiTraderModeId, type AiTraderModeId } from '@shared/aiTraderModes';
import type { CryptoPreferences } from '@shared/schema';
import {
  CRYPTO_AI_HIGHER_TIMEFRAMES,
  CRYPTO_AI_LOWER_TIMEFRAMES,
  CRYPTO_AI_TRADE_HORIZONS,
  CRYPTO_AI_TRADE_HORIZON_META,
  DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
  DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
  DEFAULT_CRYPTO_AI_TRADE_HORIZON,
  getCryptoAiTradeHorizon,
  isCryptoAiTradeHorizon,
  type CryptoAiHigherTimeframe,
  type CryptoAiLowerTimeframe,
  type CryptoAiSessionSnapshot,
  type CryptoAiTradeHorizon,
} from '@shared/cryptoAiConfig';
import {
  downloadAnalysisImage,
  downloadTotalAnalysisImage,
  downloadTradeImage,
} from '@/lib/downloadTradeImage';

const HIGHER_TIMEFRAME_OPTIONS = CRYPTO_AI_HIGHER_TIMEFRAMES.map((value) => ({ label: value, value }));
const LOWER_TIMEFRAME_OPTIONS = CRYPTO_AI_LOWER_TIMEFRAMES.map((value) => ({ label: value, value }));
const TRADE_HORIZON_OPTIONS = CRYPTO_AI_TRADE_HORIZONS.map((value) => ({
  value,
  label: CRYPTO_AI_TRADE_HORIZON_META[value].label,
  description: CRYPTO_AI_TRADE_HORIZON_META[value].description,
}));
type AiTimeframe = CryptoAiHigherTimeframe | CryptoAiLowerTimeframe;

type AnalysisResponse = {
  success?: boolean;
  multiTFInsights?: MultiTFInsights | null;
  bestTrades?: TradeIdea[];
  tokens?: { input?: number; output?: number };
  estimatedCost?: number;
  creditsRemaining?: number;
  cached?: boolean;
  sessionBoard?: {
    snapshots?: CryptoAiSessionSnapshot[];
    refreshedAt?: string | null;
    session?: string;
  } | null;
};

type RequestState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: AnalysisResponse };

type AdminAiUsage = {
  activeTickers: number;
  activeCombos?: number;
  activePairs?: number;
  callsPerDay: number;
  averageInputTokens?: number;
  averageOutputTokens?: number;
  averageCostPerCall?: number;
  estimatedDailyCost?: number;
  estimatedMonthlyCost?: number;
  cacheHitRate?: number;
};

type AiPreferences = CryptoPreferences & {
  aiTraderMode?: string;
  aiHigherTimeframe?: AiTimeframe;
  aiLowerTimeframe?: AiTimeframe;
  aiTradeHorizon?: CryptoAiTradeHorizon | string;
};

function getBiasVariant(bias?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (bias === 'BULLISH') return 'default';
  if (bias === 'BEARISH') return 'destructive';
  if (bias === 'NEUTRAL') return 'secondary';
  return 'outline';
}

function formatValue(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

type AiPageSection = 'setup' | 'analysis' | 'usage';

function Pill({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        active
          ? 'border-blue-500 bg-blue-600 text-white'
          : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

const panelClass = 'rounded-xl border border-slate-700 bg-slate-900/80 text-slate-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-400';

export default function CryptoAI() {
  usePageViewTracking('crypto-ai');

  const { isAuthenticated, isLoading: authLoading, isAdmin } = useCryptoAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { watchlistTickers } = useWatchlistState();

  const [aiTraderMode, setAiTraderMode] = useState<AiTraderModeId>(DEFAULT_AI_TRADER_MODE);
  const [aiHigherTimeframe, setAiHigherTimeframe] = useState<CryptoAiHigherTimeframe>(DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME);
  const [aiLowerTimeframe, setAiLowerTimeframe] = useState<CryptoAiLowerTimeframe>(DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME);
  const [aiTradeHorizon, setAiTradeHorizon] = useState<CryptoAiTradeHorizon>(DEFAULT_CRYPTO_AI_TRADE_HORIZON);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [minRiskReward, setMinRiskReward] = useState('1.5');
  const [minConfluence, setMinConfluence] = useState('3');
  const [generalStates, setGeneralStates] = useState<Record<string, RequestState>>({});
  const [deepDiveStates, setDeepDiveStates] = useState<Record<string, RequestState>>({});
  const [sessionCandles, setSessionCandles] = useState<Record<string, ReturnType<typeof parseKlinesToCandles>>>({});
  const [pageSection, setPageSection] = useState<AiPageSection>('analysis');

  const { data: preferences, isLoading: preferencesLoading } = useQuery<AiPreferences>({
    queryKey: ['/api/crypto/preferences'],
    enabled: isAuthenticated && !authLoading,
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', '/api/crypto/preferences');
      return await response.json();
    },
  });

  const { data: adminUsage } = useQuery<AdminAiUsage>({
    queryKey: ['/api/admin/crypto-ai-usage'],
    enabled: isAuthenticated && !authLoading && isAdmin,
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', '/api/admin/crypto-ai-usage');
      return await response.json();
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent('/cryptoai');
      setLocation(`/cryptologin?returnTo=${returnUrl}`);
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!preferences) return;

    if (preferences.aiTraderMode && isAiTraderModeId(preferences.aiTraderMode)) {
      setAiTraderMode(preferences.aiTraderMode);
    }

    if ((CRYPTO_AI_HIGHER_TIMEFRAMES as readonly string[]).includes(preferences.aiHigherTimeframe || '')) {
      setAiHigherTimeframe(preferences.aiHigherTimeframe as CryptoAiHigherTimeframe);
    }

    if ((CRYPTO_AI_LOWER_TIMEFRAMES as readonly string[]).includes(preferences.aiLowerTimeframe || '')) {
      setAiLowerTimeframe(preferences.aiLowerTimeframe as CryptoAiLowerTimeframe);
    }

    if (isCryptoAiTradeHorizon(preferences.aiTradeHorizon)) {
      setAiTradeHorizon(preferences.aiTradeHorizon);
    }

    setMinRiskReward(String(preferences.minRiskReward ?? 1.5));
    setMinConfluence(String(preferences.minConfluence ?? 3));
  }, [preferences]);

  const watchlistOptions = useMemo(
    () => Array.from(new Set(watchlistTickers.filter(Boolean))),
    [watchlistTickers],
  );

  const trackedTickers = useMemo(() => {
    const activeScanTickers = preferences?.scanTickers ?? [];
    return activeScanTickers.filter((ticker) => watchlistOptions.includes(ticker));
  }, [preferences?.scanTickers, watchlistOptions]);

  const timeframeKey = `${aiHigherTimeframe}:${aiLowerTimeframe}`;
  const tickerSlotCap = Math.min(preferences?.tickerSlots ?? 0, 5);
  const canUseAi = tickerSlotCap > 0;
  const isAnyDeepDiveLoading = useMemo(
    () => Object.values(deepDiveStates).some((state) => state.status === 'loading'),
    [deepDiveStates],
  );
  const isAnyGeneralLoading = useMemo(
    () => Object.values(generalStates).some((state) => state.status === 'loading'),
    [generalStates],
  );

  const loadingMessage = useLoadingMessages(isAnyDeepDiveLoading || isAnyGeneralLoading);

  const persistPreferences = async (payload: Partial<AiPreferences>) => {
    setSavingPreferences(true);
    try {
      await authenticatedApiRequest('POST', '/api/crypto/preferences', payload);
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/preferences'] });
    } catch (error: any) {
      toast({
        title: 'Unable to save preferences',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setSavingPreferences(false);
    }
  };

  const fetchAnalysis = async (ticker: string, analysisType: 'general' | 'deep'): Promise<AnalysisResponse> => {
    const response = await authenticatedApiRequest(
      'POST',
      '/api/crypto/order-flow-alerts-multi-tf',
      {
        symbol: ticker,
        higherTimeframe: aiHigherTimeframe,
        lowerTimeframe: aiLowerTimeframe,
        analysisType,
        mode: analysisType === 'deep' ? aiTraderMode : undefined,
        tradeHorizon: analysisType === 'deep' ? aiTradeHorizon : undefined,
      },
      { timeout: analysisType === 'deep' ? 180000 : 90000 },
    );

    return await response.json();
  };

  const toggleScanTicker = async (ticker: string, checked: boolean) => {
    const currentTickers = preferences?.scanTickers ?? [];
    const nextTickers = checked
      ? [...currentTickers, ticker]
      : currentTickers.filter((currentTicker) => currentTicker !== ticker);

    const dedupedTickers = Array.from(new Set(nextTickers)).slice(0, tickerSlotCap);
    try {
      await persistPreferences({ scanTickers: dedupedTickers });
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated || preferencesLoading || !canUseAi) return;

    if (trackedTickers.length === 0) {
      setGeneralStates({});
      return;
    }

    let cancelled = false;
    setGeneralStates({});

    trackedTickers.forEach((ticker) => {
      setGeneralStates((current) => ({ ...current, [ticker]: { status: 'loading' } }));
      fetchAnalysis(ticker, 'general')
        .then((data) => {
          if (cancelled) return;
          setGeneralStates((current) => ({ ...current, [ticker]: { status: 'success', data } }));
        })
        .catch((error: any) => {
          if (cancelled) return;
          setGeneralStates((current) => ({
            ...current,
            [ticker]: { status: 'error', error: error.message || 'General analysis failed.' },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, canUseAi, isAuthenticated, preferencesLoading, trackedTickers, timeframeKey]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || preferencesLoading || !canUseAi) return;
    if (trackedTickers.length === 0) {
      setSessionCandles({});
      return;
    }

    let cancelled = false;
    const loadCandles = async () => {
      const nextEntries = await Promise.all(
        trackedTickers.map(async (ticker) => {
          const response = await fetch(`/api/binance/klines?symbol=${ticker}&interval=${aiLowerTimeframe}&limit=500`);
          const payload = await response.json();
          return [ticker, parseKlinesToCandles(payload)] as const;
        }),
      );

      if (!cancelled) {
        setSessionCandles(Object.fromEntries(nextEntries));
      }
    };

    loadCandles().catch(() => {
      if (!cancelled) {
        setSessionCandles({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [aiLowerTimeframe, authLoading, canUseAi, isAuthenticated, preferencesLoading, trackedTickers]);

  useEffect(() => {
    setDeepDiveStates({});
  }, [timeframeKey, aiTraderMode, aiTradeHorizon]);

  const handleHigherTimeframeChange = async (nextHigherTimeframe: string) => {
    if (!(CRYPTO_AI_HIGHER_TIMEFRAMES as readonly string[]).includes(nextHigherTimeframe)) return;
    const nextHigher = nextHigherTimeframe as CryptoAiHigherTimeframe;
    const previousHigher = aiHigherTimeframe;

    setAiHigherTimeframe(nextHigher);

    try {
      await persistPreferences({
        aiHigherTimeframe: nextHigher,
      });
    } catch {
      setAiHigherTimeframe(previousHigher);
    }
  };

  const handleLowerTimeframeChange = async (nextLowerTimeframe: string) => {
    if (!(CRYPTO_AI_LOWER_TIMEFRAMES as readonly string[]).includes(nextLowerTimeframe)) return;
    const nextLower = nextLowerTimeframe as CryptoAiLowerTimeframe;
    const previousLower = aiLowerTimeframe;

    setAiLowerTimeframe(nextLower);

    try {
      await persistPreferences({
        aiLowerTimeframe: nextLower,
      });
    } catch {
      setAiLowerTimeframe(previousLower);
    }
  };

  const handleTraderModeChange = async (nextMode: string) => {
    if (!isAiTraderModeId(nextMode)) return;
    const previousMode = aiTraderMode;
    setAiTraderMode(nextMode);

    try {
      await persistPreferences({ aiTraderMode: nextMode });
    } catch {
      setAiTraderMode(previousMode);
    }
  };

  const handleTradeHorizonChange = async (nextHorizon: string) => {
    if (!isCryptoAiTradeHorizon(nextHorizon)) return;
    const previous = aiTradeHorizon;
    setAiTradeHorizon(nextHorizon);

    try {
      await persistPreferences({ aiTradeHorizon: nextHorizon });
    } catch {
      setAiTradeHorizon(previous);
    }
  };

  const persistNumericPreference = async (
    key: 'minRiskReward' | 'minConfluence',
    rawValue: string,
  ) => {
    const nextValue = key === 'minConfluence' ? Math.round(Number(rawValue)) : Number(rawValue);
    if (!Number.isFinite(nextValue)) {
      setMinRiskReward(String(preferences?.minRiskReward ?? 1.5));
      setMinConfluence(String(preferences?.minConfluence ?? 3));
      return;
    }

    const payload: Partial<AiPreferences> = { [key]: nextValue };
    try {
      await persistPreferences(payload);
    } catch {
      setMinRiskReward(String(preferences?.minRiskReward ?? 1.5));
      setMinConfluence(String(preferences?.minConfluence ?? 3));
    }
  };

  const handleDeepDive = async (ticker: string) => {
    setDeepDiveStates((current) => ({ ...current, [ticker]: { status: 'loading' } }));

    try {
      const data = await fetchAnalysis(ticker, 'deep');
      setDeepDiveStates((current) => ({ ...current, [ticker]: { status: 'success', data } }));
    } catch (error: any) {
      setDeepDiveStates((current) => ({
        ...current,
        [ticker]: { status: 'error', error: error.message || 'Deep-dive trade search failed.' },
      }));
    }
  };

  if (authLoading || preferencesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white pb-32">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          <Skeleton className="h-20 w-40 bg-slate-800" />
          <Skeleton className="h-10 w-80 bg-slate-800" />
          <Skeleton className="h-48 w-full bg-slate-800" />
        </div>
        <CryptoNavigation />
      </div>
    );
  }

  const setupPanel = (
        <div className={cn(panelClass, 'p-5 space-y-6')}>
          <div>
            <h2 className="text-lg font-semibold text-white">Analysis preferences</h2>
            <p className="text-sm text-slate-400">Activate watchlist tickers and tune thresholds.</p>
          </div>
          <div className="grid gap-5">
            <div className="space-y-2">
              <div className={labelClass}>Higher TF</div>
              <div className="flex flex-wrap gap-2">
                {HIGHER_TIMEFRAME_OPTIONS.map((option) => (
                  <Pill
                    key={option.value}
                    active={aiHigherTimeframe === option.value}
                    onClick={() => void handleHigherTimeframeChange(option.value)}
                  >
                    {option.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className={labelClass}>Lower TF</div>
              <div className="flex flex-wrap gap-2">
                {LOWER_TIMEFRAME_OPTIONS.map((option) => (
                  <Pill
                    key={option.value}
                    active={aiLowerTimeframe === option.value}
                    onClick={() => void handleLowerTimeframeChange(option.value)}
                  >
                    {option.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className={labelClass}>Trader mode</div>
              <div className="flex flex-wrap gap-2">
                {ENABLED_AI_TRADER_MODES.map((mode) => (
                  <Pill
                    key={mode.id}
                    active={aiTraderMode === mode.id}
                    onClick={() => void handleTraderModeChange(mode.id)}
                  >
                    {mode.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className={labelClass}>Trade length</div>
              <div className="flex flex-wrap gap-2">
                {TRADE_HORIZON_OPTIONS.map((option) => (
                  <Pill
                    key={option.value}
                    active={aiTradeHorizon === option.value}
                    onClick={() => void handleTradeHorizonChange(option.value)}
                  >
                    {option.label}
                  </Pill>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Hold window ~{getCryptoAiTradeHorizon(aiTradeHorizon).expectedHold}. Scales stop/target structure independently of the chart pair.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">AI watchlist slots</div>
                  <div className="text-sm text-slate-400">
                    {trackedTickers.length} of {tickerSlotCap} nominated ticker{tickerSlotCap === 1 ? '' : 's'} · each general or deep dive uses 1 token
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    Pair {aiHigherTimeframe}/{aiLowerTimeframe}
                  </span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                    {getCryptoAiTradeHorizon(aiTradeHorizon).label}
                  </span>
                </div>
              </div>

              {watchlistOptions.length === 0 ? (
                <Alert className="border-slate-700 bg-slate-900 text-slate-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No watchlist tokens yet</AlertTitle>
                  <AlertDescription className="text-slate-400">Add tokens on the indicators page before activating them for AI.</AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {watchlistOptions.map((ticker) => {
                    const checked = trackedTickers.includes(ticker);
                    const disableAdd = !checked && trackedTickers.length >= tickerSlotCap;
                    return (
                      <Pill
                        key={ticker}
                        active={checked}
                        disabled={!canUseAi || disableAdd || savingPreferences}
                        onClick={() => void toggleScanTicker(ticker, !checked)}
                      >
                        {formatTickerDisplay(ticker)}
                        {disableAdd && !checked ? ' (full)' : ''}
                      </Pill>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-700 px-3 py-1">Watchlist {watchlistOptions.length}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1">Active {trackedTickers.length}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1">{aiHigherTimeframe}/{aiLowerTimeframe}</span>
              {savingPreferences && (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div className={labelClass}>Deep-dive thresholds</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Min R/R</div>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="99.99"
                    value={minRiskReward}
                    disabled={savingPreferences}
                    onChange={(event) => setMinRiskReward(event.target.value)}
                    onBlur={() => void persistNumericPreference('minRiskReward', minRiskReward)}
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Min confluence</div>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="9"
                    value={minConfluence}
                    disabled={savingPreferences}
                    onChange={(event) => setMinConfluence(event.target.value)}
                    onBlur={() => void persistNumericPreference('minConfluence', minConfluence)}
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
  );

  const usagePanel = isAdmin && adminUsage ? (
          <div className={cn(panelClass, 'p-5')}>
            <h2 className="text-lg font-semibold text-white">AI usage</h2>
            <p className="mb-4 text-sm text-slate-400">Admin-only spend and cache health.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="text-xs uppercase text-slate-500">Active combos</div>
                <div className="mt-1 text-2xl font-semibold">{adminUsage.activeCombos ?? adminUsage.activePairs ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="text-xs uppercase text-slate-500">Calls / day</div>
                <div className="mt-1 text-2xl font-semibold">{adminUsage.callsPerDay.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="text-xs uppercase text-slate-500">Avg tokens / call</div>
                <div className="mt-1 text-sm font-semibold">
                  {(adminUsage.averageInputTokens ?? 0).toLocaleString()} in / {(adminUsage.averageOutputTokens ?? 0).toLocaleString()} out
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="text-xs uppercase text-slate-500">Est. daily cost</div>
                <div className="mt-1 text-2xl font-semibold">${(adminUsage.estimatedDailyCost ?? 0).toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <div className="text-xs uppercase text-slate-500">Cache hit rate</div>
                <div className="mt-1 text-2xl font-semibold">{((adminUsage.cacheHitRate ?? 0) * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        ) : null;

  const analysisPanel = !canUseAi ? (
          <div className={cn(panelClass, 'border-amber-500/30 p-5')}>
            <h2 className="text-lg font-semibold text-white">Upgrade required</h2>
            <p className="mt-1 text-sm text-slate-400">
                Charts stay free. AI trade ideas need a Core, Pro, or Elite usage plan. Each general reading or deep dive uses 1 token on your nominated ticker(s).
            </p>
          </div>
        ) : trackedTickers.length === 0 ? (
          <div className={cn(panelClass, 'p-5 space-y-4')}>
            <h2 className="text-lg font-semibold text-white">No AI tickers active</h2>
            <p className="text-sm text-slate-400">
                Pick up to {tickerSlotCap} ticker{tickerSlotCap === 1 ? '' : 's'} from Setup to start loading pair analyses.
            </p>
            <Button asChild className="bg-blue-600 hover:bg-blue-500">
                <Link href="/cryptoindicators">Open watchlist / indicators</Link>
              </Button>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {trackedTickers.map((ticker) => {
              const generalState = generalStates[ticker] ?? { status: 'idle' as const };
              const deepDiveState = deepDiveStates[ticker] ?? { status: 'idle' as const };
              const generalInsights = generalState.status === 'success'
                ? (generalState.data.multiTFInsights ?? (getLatestSnapshotInsights(generalState.data.sessionBoard?.snapshots) as MultiTFInsights | null))
                : null;
              const sessionSections = generalState.status === 'success'
                ? buildSessionBoardSections(sessionCandles[ticker] ?? [], generalState.data.sessionBoard?.snapshots ?? [])
                : [];
              const deepInsights = deepDiveState.status === 'success' ? deepDiveState.data.multiTFInsights : null;
              const tradeIdeas = deepDiveState.status === 'success' ? (deepDiveState.data.bestTrades ?? []) : [];
              const deepDiveWatchLevels = collectWatchLevels(deepInsights, [aiLowerTimeframe, aiHigherTimeframe]);

              const canPrintTotal =
                generalState.status === 'success' || deepDiveState.status === 'success';

              return (
                <div key={`${ticker}-${timeframeKey}`} className={cn(panelClass, 'h-full p-5 space-y-5')}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-semibold text-white">{formatTickerDisplay(ticker)}</h2>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">HTF {aiHigherTimeframe}</span>
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">LTF {aiLowerTimeframe}</span>
                        {canPrintTotal ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const sessionRows = sessionSections.map(({ session, label, snapshot, metrics }) => {
                                  const sessionInsights = snapshot?.multiTFInsights
                                    ? (snapshot.multiTFInsights as MultiTFInsights)
                                    : null;
                                  const higherSection = getSection(sessionInsights, aiHigherTimeframe);
                                  const lowerSection = getSection(sessionInsights, aiLowerTimeframe);
                                  const summary =
                                    higherSection?.summary
                                    || lowerSection?.summary
                                    || getOverallSummary(sessionInsights)
                                    || 'Waiting for this session snapshot.';
                                  const bias = higherSection?.bias || lowerSection?.bias;
                                  return {
                                    label,
                                    isActive: metrics.isActive,
                                    bias,
                                    summary,
                                    percentChange: metrics.percentChange,
                                    range: metrics.range,
                                    volumeRatio: metrics.volumeRatio,
                                    closePosition: metrics.closePosition,
                                    closePositionLabel: metrics.closePositionLabel,
                                    divergenceBadge: metrics.divergenceBadge,
                                    handoff: metrics.handoff,
                                  };
                                });

                                await downloadTotalAnalysisImage({
                                  symbol: ticker,
                                  higherTimeframe: aiHigherTimeframe,
                                  lowerTimeframe: aiLowerTimeframe,
                                  sessions: sessionRows,
                                  crossTimeframeSummary: getOverallSummary(generalInsights),
                                  generalInsights,
                                  deepInsights,
                                  trades: tradeIdeas,
                                  watchLevels: deepDiveWatchLevels,
                                  horizonLabel: getCryptoAiTradeHorizon(aiTradeHorizon).label,
                                  modeLabel: ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label,
                                });
                                toast({
                                  title: 'Total analysis downloaded',
                                  description: 'Session stats, cross-TF, and setups saved as PNG.',
                                });
                              } catch (error: any) {
                                toast({
                                  title: 'Download failed',
                                  description: error?.message || 'Could not create total analysis image.',
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Print total analysis
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  <div className="space-y-6">
                    <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-white">Session board</h3>
                          <p className="text-sm text-slate-400">Asia · London · New York</p>
                        </div>
                        {generalState.status === 'loading' && (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            <span className="text-sm text-slate-400">{loadingMessage}</span>
                          </div>
                        )}
                      </div>

                      {generalState.status === 'loading' || generalState.status === 'idle' ? (
                        <div className="space-y-3">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : null}

                      {generalState.status === 'error' ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>General analysis failed</AlertTitle>
                          <AlertDescription>{generalState.error}</AlertDescription>
                        </Alert>
                      ) : null}

                      {generalState.status === 'success' ? (
                        <div className="space-y-4">
                          <div className="grid gap-4 xl:grid-cols-3">
                            {sessionSections.map(({ session, label, snapshot, metrics }) => {
                              const sessionInsights = snapshot?.multiTFInsights ? (snapshot.multiTFInsights as MultiTFInsights) : null;
                              const higherSection = getSection(sessionInsights, aiHigherTimeframe);
                              const lowerSection = getSection(sessionInsights, aiLowerTimeframe);
                              const summary = higherSection?.summary || lowerSection?.summary || getOverallSummary(sessionInsights) || 'Waiting for this session snapshot.';
                              const bias = higherSection?.bias || lowerSection?.bias;

                              return (
                                <div key={`${ticker}-${session}`} className={cn("rounded-lg p-4", metrics.isActive ? "bg-green-500/15 border border-green-500/30" : "bg-slate-800/70 border border-slate-700")}>
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="text-sm font-semibold">{label}</h4>
                                    </div>
                                    <Badge variant={getBiasVariant(bias)}>{bias ?? 'Pending'}</Badge>
                                  </div>

                                  <p className="text-sm text-slate-400">{summary}</p>

                                  <div className="mt-4 grid gap-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <span>% change</span>
                                      <span className="font-medium">
                                        {metrics.percentChange == null ? '—' : `${metrics.percentChange >= 0 ? '▲' : '▼'} ${Math.abs(metrics.percentChange).toFixed(2)}%`}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Session range</span>
                                      <span className="font-medium">{metrics.range == null ? '—' : metrics.range.toFixed(4)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Volume vs avg</span>
                                      <span className="font-medium">{metrics.volumeRatio == null ? '—' : `${metrics.volumeRatio.toFixed(1)}×`}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Close in range</span>
                                      <span className="font-medium">
                                        {metrics.closePosition == null ? '—' : `${metrics.closePositionLabel} (${(metrics.closePosition * 100).toFixed(0)}%)`}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Divergence</span>
                                      <Badge variant="outline">{metrics.divergenceBadge}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Handoff</span>
                                      <Badge variant="secondary">{metrics.handoff}</Badge>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                            <div className="mb-2 text-sm font-semibold text-white">Cross-timeframe summary</div>
                            <p className="text-sm text-slate-400">{getOverallSummary(generalInsights)}</p>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-semibold text-white">Deep-dive trade search</h3>
                          <p className="text-sm text-slate-400">
                            Uses {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label ?? 'SMC / ICT'} mode
                            {' · '}
                            {getCryptoAiTradeHorizon(aiTradeHorizon).label} length
                            {' '}(~{getCryptoAiTradeHorizon(aiTradeHorizon).expectedHold}).
                          </p>
                        </div>
                        <Button onClick={() => handleDeepDive(ticker)} disabled={deepDiveState.status === 'loading'}>
                          {deepDiveState.status === 'loading' ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {loadingMessage}
                            </>
                          ) : (
                            <>
                              <Search className="mr-2 h-4 w-4" />
                              Search for trades
                            </>
                          )}
                        </Button>
                      </div>

                      {deepDiveState.status === 'error' ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Trade search failed</AlertTitle>
                          <AlertDescription>{deepDiveState.error}</AlertDescription>
                        </Alert>
                      ) : null}

                      {deepDiveState.status === 'success' ? (
                        <div className="space-y-4">
                          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <Sparkles className="h-4 w-4 text-purple-400" />
                                Deep-dive summary
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await downloadAnalysisImage({
                                      symbol: ticker,
                                      higherTimeframe: aiHigherTimeframe,
                                      lowerTimeframe: aiLowerTimeframe,
                                      insights: deepInsights,
                                      watchLevels: deepDiveWatchLevels,
                                      tradeCount: tradeIdeas.length,
                                      horizonLabel: getCryptoAiTradeHorizon(aiTradeHorizon).label,
                                      modeLabel: ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label,
                                    });
                                    toast({
                                      title: 'Analysis downloaded',
                                      description: tradeIdeas.length === 0
                                        ? 'Summary and watch zones saved as PNG.'
                                        : 'Analysis summary saved as PNG.',
                                    });
                                  } catch (error: any) {
                                    toast({
                                      title: 'Download failed',
                                      description: error?.message || 'Could not create analysis image.',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download analysis
                              </Button>
                            </div>
                            <p className="text-sm text-slate-400">{getOverallSummary(deepInsights)}</p>
                          </div>

                          {tradeIdeas.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-700 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Search className="h-4 w-4" />
                                Key zones to watch
                              </div>
                              <p className="text-sm text-slate-400">
                                No setup has cleared the confluence and risk/reward gates yet. Wait for price to reach one of the next structural zones below.
                              </p>
                              {deepDiveWatchLevels.length > 0 ? (
                                <ul className="mt-3 space-y-2 text-sm text-slate-400">
                                  {deepDiveWatchLevels.map((level) => (
                                    <li key={level} className="rounded-md bg-slate-800/70 px-3 py-2">
                                      {level}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {tradeIdeas.map((trade, index) => (
                                <div key={`${ticker}-trade-${index}`} className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
                                  <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <Badge variant={trade.direction === 'LONG' ? 'default' : trade.direction === 'SHORT' ? 'destructive' : 'outline'}>
                                      {trade.direction ?? 'Setup'}
                                    </Badge>
                                    <Badge variant="secondary">{trade.grade ?? 'Unrated'}</Badge>
                                    <Badge variant={getHtfRelationshipBadgeVariant(trade.htfRelationship)}>
                                      {getHtfRelationshipLabel(trade.htfRelationship)}
                                    </Badge>
                                    <Badge variant="outline">{isPendingTradeIdea(trade) ? 'Pending plan' : 'Live setup'}</Badge>
                                    <Badge variant="outline">{trade.primaryTF ?? `${aiLowerTimeframe}/${aiHigherTimeframe}`}</Badge>
                                  </div>

                                  {(trade.triggerZone || trade.triggerCondition) ? (
                                    <div className="mb-3 rounded-md bg-slate-950/60 p-3">
                                      <div className="text-xs uppercase text-slate-500">Trigger</div>
                                      <div className="font-medium">{trade.triggerZone ?? trade.entryZone ?? '—'}</div>
                                      {trade.triggerCondition ? (
                                        <div className="mt-1 text-sm text-muted-foreground">{trade.triggerCondition}</div>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                    <div>
                                      <div className="text-xs uppercase text-muted-foreground">Entry</div>
                                      <div className="font-medium">{formatValue(trade.entry)}</div>
                                      {trade.entryZone ? <div className="text-xs text-muted-foreground">{trade.entryZone}</div> : null}
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase text-muted-foreground">Stop</div>
                                      <div className="font-medium">{formatValue(trade.stopLoss)}</div>
                                      {trade.slRationale ? <div className="text-xs text-muted-foreground">{trade.slRationale}</div> : null}
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase text-muted-foreground">Targets</div>
                                      <div className="font-medium space-y-0.5">
                                        {trade.targets?.length ? (
                                          trade.targets.map((target, tpIndex) => (
                                            <div key={`${ticker}-tp-${tpIndex}`}>
                                              TP{tpIndex + 1}: {formatTargetWithPercent(trade.entry, target, trade.direction)}
                                            </div>
                                          ))
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                      {trade.tp1Rationale ? <div className="text-xs text-muted-foreground">TP1: {trade.tp1Rationale}</div> : null}
                                      {trade.tp2Rationale ? <div className="text-xs text-muted-foreground">TP2: {trade.tp2Rationale}</div> : null}
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase text-muted-foreground">R:R</div>
                                      <div className="font-medium">
                                        {trade.riskRewardRatio == null ? '—' : `${trade.riskRewardRatio.toFixed(2)}R`}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase text-muted-foreground">Rationale</div>
                                      <div className="text-sm text-muted-foreground">{trade.reasoning ?? '—'}</div>
                                    </div>
                                  </div>

                                  {trade.confluenceSignals?.length ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {trade.confluenceSignals.map((signal) => (
                                        <Badge key={signal} variant="outline">{signal}</Badge>
                                      ))}
                                    </div>
                                  ) : null}

                                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={async () => {
                                       try {
                                         await downloadTradeImage({
                                           trade,
                                           symbol: ticker,
                                           higherTimeframe: aiHigherTimeframe,
                                           lowerTimeframe: aiLowerTimeframe,
                                           horizonLabel: getCryptoAiTradeHorizon(aiTradeHorizon).label,
                                           modeLabel: ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label,
                                         });
                                         toast({ title: 'Trade downloaded', description: 'PNG saved to your downloads.' });
                                       } catch (error: any) {
                                         toast({
                                           title: 'Download failed',
                                           description: error?.message || 'Could not create trade image.',
                                           variant: 'destructive',
                                         });
                                       }
                                     }}
                                   >
                                     <Download className="mr-2 h-4 w-4" />
                                     Download image
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       const dir = trade.direction;
                                       if (dir !== 'LONG' && dir !== 'SHORT') {
                                         toast({ title: 'Cannot print trade', description: 'Trade direction must be LONG or SHORT.', variant: 'destructive' });
                                         return;
                                       }
                                       const entry = Number(trade.entry);
                                       const sl = Number(trade.stopLoss);
                                       const tp = Number(trade.targets?.[0]);
                                       if (!entry || !sl || !tp) {
                                         toast({ title: 'Cannot print trade', description: 'Missing entry, stop-loss, or target price.', variant: 'destructive' });
                                         return;
                                       }
                                       const STORAGE_KEY = 'manual_trades_v1';
                                       const existing: import('@/lib/chartPrimitives/TradePrimitive').ManualTrade[] = (() => {
                                         try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
                                       })();
                                       const newTrade: import('@/lib/chartPrimitives/TradePrimitive').ManualTrade = {
                                         id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                         symbol: ticker,
                                         timeframe: aiLowerTimeframe,
                                         direction: dir,
                                         entryPrice: entry,
                                         slPrice: sl,
                                         tpPrice: tp,
                                         entryTime: Math.floor(Date.now() / 1000),
                                         entryHit: false,
                                       };
                                       existing.push(newTrade);
                                       try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); } catch { toast({ title: 'Storage full', description: 'Could not save trade – browser storage quota exceeded.', variant: 'destructive' }); return; }
                                       toast({ title: 'Trade printed to chart', description: `Open ${formatTickerDisplay(ticker)} on ${aiLowerTimeframe} to see it.` });
                                     }}
                                   >
                                     <Printer className="mr-2 h-4 w-4" />
                                     Print to chart
                                   </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </section>
                  </div>
                </div>
              );
            })}
          </div>
        );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <Helmet>
        <title>AI Trade Ideas | BearTec</title>
        <meta name="description" content="AI-powered crypto trade ideas in a beginner-friendly workspace, alongside charts, oscillators, and indicators." />
      </Helmet>

      <div className="mx-auto max-w-7xl px-4 py-6 pb-32">
        <div className="mb-8">
          <Link href="/cryptoindicators">
            <img
              src={bearTecLogoNew}
              alt="BearTec Logo"
              className="h-20 w-auto cursor-pointer"
            />
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Pill active={pageSection === 'setup'} onClick={() => setPageSection('setup')}>
            Setup
          </Pill>
          <Pill active={pageSection === 'analysis'} onClick={() => setPageSection('analysis')}>
            Analysis
          </Pill>
          {isAdmin ? (
            <Pill active={pageSection === 'usage'} onClick={() => setPageSection('usage')}>
              Usage
            </Pill>
          ) : null}
        </div>

        {pageSection === 'setup' ? setupPanel : null}
        {pageSection === 'analysis' ? analysisPanel : null}
        {pageSection === 'usage' ? usagePanel : null}
      </div>

      <CryptoNavigation />
    </div>
  );
}
