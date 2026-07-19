import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Brain, Loader2, Printer, Search, Sparkles } from 'lucide-react';

import { CryptoNavigation } from '@/components/CryptoNavigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useToast } from '@/hooks/use-toast';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { cn } from '@/lib/utils';
import {
  collectWatchLevels,
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
  DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME,
  DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME,
  type CryptoAiHigherTimeframe,
  type CryptoAiLowerTimeframe,
  type CryptoAiSessionSnapshot,
} from '@shared/cryptoAiConfig';

const HIGHER_TIMEFRAME_OPTIONS = CRYPTO_AI_HIGHER_TIMEFRAMES.map((value) => ({ label: value, value }));
const LOWER_TIMEFRAME_OPTIONS = CRYPTO_AI_LOWER_TIMEFRAMES.map((value) => ({ label: value, value }));
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

export default function CryptoAI() {
  usePageViewTracking('crypto-ai');

  const { isAuthenticated, isLoading: authLoading, isAdmin } = useCryptoAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { watchlistTickers } = useWatchlistState();

  const [aiTraderMode, setAiTraderMode] = useState<AiTraderModeId>(DEFAULT_AI_TRADER_MODE);
  const [aiHigherTimeframe, setAiHigherTimeframe] = useState<CryptoAiHigherTimeframe>(DEFAULT_CRYPTO_AI_HIGHER_TIMEFRAME);
  const [aiLowerTimeframe, setAiLowerTimeframe] = useState<CryptoAiLowerTimeframe>(DEFAULT_CRYPTO_AI_LOWER_TIMEFRAME);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [minRiskReward, setMinRiskReward] = useState('1.5');
  const [minConfluence, setMinConfluence] = useState('3');
  const [generalStates, setGeneralStates] = useState<Record<string, RequestState>>({});
  const [deepDiveStates, setDeepDiveStates] = useState<Record<string, RequestState>>({});
  const [sessionCandles, setSessionCandles] = useState<Record<string, ReturnType<typeof parseKlinesToCandles>>>({});

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
  }, [timeframeKey, aiTraderMode]);

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
      <div className="min-h-screen bg-background pb-28">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
        <CryptoNavigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <Helmet>
        <title>Crypto AI Analysis</title>
      </Helmet>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-background to-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Brain className="h-8 w-8 text-purple-400" />
              AI Analysis
            </CardTitle>
            <CardDescription className="max-w-3xl text-base">
              Multi-timeframe overview with on-demand deep-dive trade search.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Analysis preferences</CardTitle>
            <CardDescription>
              Activate watchlist tickers and tune thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Higher TF</div>
              <Select value={aiHigherTimeframe} onValueChange={handleHigherTimeframeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select higher timeframe">
                    {HIGHER_TIMEFRAME_OPTIONS.find((option) => option.value === aiHigherTimeframe)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HIGHER_TIMEFRAME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Lower TF</div>
              <Select value={aiLowerTimeframe} onValueChange={handleLowerTimeframeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lower timeframe">
                    {LOWER_TIMEFRAME_OPTIONS.find((option) => option.value === aiLowerTimeframe)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOWER_TIMEFRAME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Trader mode</div>
              <Select value={aiTraderMode} onValueChange={handleTraderModeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trader mode">
                    {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ENABLED_AI_TRADER_MODES.map((mode) => (
                    <SelectItem key={mode.id} value={mode.id}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 md:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">AI watchlist slots</div>
                  <div className="text-sm text-muted-foreground">
                    {trackedTickers.length} of {tickerSlotCap} slots used
                  </div>
                </div>
                <Badge variant="outline">
                  Pair: {aiHigherTimeframe}/{aiLowerTimeframe}
                </Badge>
              </div>

              {watchlistOptions.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No watchlist tokens yet</AlertTitle>
                  <AlertDescription>Add tokens on the indicators page before activating them for AI.</AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-3 rounded-lg border border-border/60 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {watchlistOptions.map((ticker) => {
                    const checked = trackedTickers.includes(ticker);
                    const disableAdd = !checked && trackedTickers.length >= tickerSlotCap;
                    return (
                      <label key={ticker} className="flex items-center gap-3 rounded-md border border-border/40 p-3">
                        <Checkbox
                          checked={checked}
                          disabled={!canUseAi || disableAdd || savingPreferences}
                          onCheckedChange={(value) => void toggleScanTicker(ticker, value === true)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium">{formatTickerDisplay(ticker)}</div>
                          {disableAdd ? (
                            <div className="text-xs text-muted-foreground">Slot cap reached</div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="md:col-span-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">Available watchlist: {watchlistOptions.length}</Badge>
              <Badge variant="outline">Active AI tickers: {trackedTickers.length}</Badge>
              <Badge variant="outline">General analysis: {aiHigherTimeframe} / {aiLowerTimeframe}</Badge>
              <Badge variant="outline">Deep dive mode: {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label ?? 'SMC / ICT'}</Badge>
              {savingPreferences && (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving preferences…
                </span>
              )}
            </div>

            <div className="space-y-3 md:col-span-3">
              <div>
                <div className="text-sm font-medium">Deep-dive thresholds</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2">
                  <div className="text-sm font-medium">Min R/R</div>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="99.99"
                    value={minRiskReward}
                    disabled={savingPreferences}
                    onChange={(event) => setMinRiskReward(event.target.value)}
                    onBlur={() => void persistNumericPreference('minRiskReward', minRiskReward)}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium">Min confluence</div>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="9"
                    value={minConfluence}
                    disabled={savingPreferences}
                    onChange={(event) => setMinConfluence(event.target.value)}
                    onBlur={() => void persistNumericPreference('minConfluence', minConfluence)}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {isAdmin && adminUsage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">AI usage</CardTitle>
              <CardDescription>Admin-only spend and cache health.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-border/60 p-4">
                <div className="text-xs uppercase text-muted-foreground">Active combos</div>
                <div className="mt-1 text-2xl font-semibold">{adminUsage.activeCombos ?? adminUsage.activePairs ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <div className="text-xs uppercase text-muted-foreground">Calls / day</div>
                <div className="mt-1 text-2xl font-semibold">{adminUsage.callsPerDay.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <div className="text-xs uppercase text-muted-foreground">Avg tokens / call</div>
                <div className="mt-1 text-sm font-semibold">
                  {(adminUsage.averageInputTokens ?? 0).toLocaleString()} in / {(adminUsage.averageOutputTokens ?? 0).toLocaleString()} out
                </div>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <div className="text-xs uppercase text-muted-foreground">Est. daily cost</div>
                <div className="mt-1 text-2xl font-semibold">${(adminUsage.estimatedDailyCost ?? 0).toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <div className="text-xs uppercase text-muted-foreground">Cache hit rate</div>
                <div className="mt-1 text-2xl font-semibold">{((adminUsage.cacheHitRate ?? 0) * 100).toFixed(0)}%</div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!canUseAi ? (
          <Card className="border-amber-500/30">
            <CardHeader>
              <CardTitle>Upgrade required</CardTitle>
              <CardDescription>
                Free accounts do not have access to AI Analysis. Upgrade to Intermediate, Pro, or Elite to unlock pair-based session boards and on-demand deep dives.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : trackedTickers.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No AI tickers active</CardTitle>
              <CardDescription>
                Pick up to {tickerSlotCap} ticker{tickerSlotCap === 1 ? '' : 's'} from your watchlist above to start loading pair analyses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/cryptoindicators">Open watchlist / indicators</Link>
              </Button>
            </CardContent>
          </Card>
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

              return (
                <Card key={`${ticker}-${timeframeKey}`} className="h-full border-border/60">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-2xl">{formatTickerDisplay(ticker)}</CardTitle>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Badge variant="outline">HTF {aiHigherTimeframe}</Badge>
                        <Badge variant="outline">LTF {aiLowerTimeframe}</Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <section className="space-y-4 rounded-lg border border-border/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Session board</h3>
                          <p className="text-sm text-muted-foreground">Asia · London · New York</p>
                        </div>
                        {generalState.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
                                <div key={`${ticker}-${session}`} className={cn("rounded-lg p-4", metrics.isActive ? "bg-green-500/15 border border-green-500/30" : "bg-muted/40")}>
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <h4 className="text-sm font-semibold">{label}</h4>
                                    </div>
                                    <Badge variant={getBiasVariant(bias)}>{bias ?? 'Pending'}</Badge>
                                  </div>

                                  <p className="text-sm text-muted-foreground">{summary}</p>

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

                          <div className="rounded-lg border border-border/60 p-4">
                            <div className="mb-2 text-sm font-semibold">Cross-timeframe summary</div>
                            <p className="text-sm text-muted-foreground">{getOverallSummary(generalInsights)}</p>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="space-y-4 rounded-lg border border-border/60 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-semibold">Deep-dive trade search</h3>
                          <p className="text-sm text-muted-foreground">
                            Uses {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label ?? 'SMC / ICT'} mode.
                          </p>
                        </div>
                        <Button onClick={() => handleDeepDive(ticker)} disabled={deepDiveState.status === 'loading'}>
                          {deepDiveState.status === 'loading' ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Searching…
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
                          <div className="rounded-lg border border-border/60 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                              <Sparkles className="h-4 w-4 text-purple-400" />
                              Deep-dive summary
                            </div>
                            <p className="text-sm text-muted-foreground">{getOverallSummary(deepInsights)}</p>
                          </div>

                          {tradeIdeas.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/60 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Search className="h-4 w-4" />
                                Key zones to watch
                              </div>
                              <p className="text-sm text-muted-foreground">
                                No setup has cleared the confluence and risk/reward gates yet. Wait for price to reach one of the next structural zones below.
                              </p>
                              {deepDiveWatchLevels.length > 0 ? (
                                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                                  {deepDiveWatchLevels.map((level) => (
                                    <li key={level} className="rounded-md bg-muted/40 px-3 py-2">
                                      {level}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {tradeIdeas.map((trade, index) => (
                                <div key={`${ticker}-trade-${index}`} className="rounded-lg border border-border/60 p-4">
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
                                    <div className="mb-3 rounded-md bg-muted/40 p-3">
                                      <div className="text-xs uppercase text-muted-foreground">Trigger</div>
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
                                      <div className="font-medium">{trade.targets?.map((target) => formatValue(target)).join(' / ') || '—'}</div>
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

                                  <div className="mt-3 flex justify-end">
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
                                       };
                                       existing.push(newTrade);
                                       try { localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); } catch { /* ignore quota */ }
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CryptoNavigation />
    </div>
  );
}
