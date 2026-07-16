import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Brain, Loader2, Search, Sparkles } from 'lucide-react';

import { CryptoNavigation } from '@/components/CryptoNavigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import { useToast } from '@/hooks/use-toast';
import { useWatchlistState } from '@/hooks/useWatchlistState';
import { usePageViewTracking } from '@/hooks/useAnalytics';
import { authenticatedApiRequest } from '@/lib/apiAuth';
import { queryClient } from '@/lib/queryClient';
import { formatTickerDisplay } from '@/lib/chart/priceUtils';
import { DEFAULT_AI_TRADER_MODE, ENABLED_AI_TRADER_MODES, isAiTraderModeId, type AiTraderModeId } from '@shared/aiTraderModes';
import type { CryptoPreferences } from '@shared/schema';

const TIMEFRAME_OPTIONS = [
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1d', value: '1d' },
  { label: '1w', value: '1w' },
] as const;
type AiTimeframe = (typeof TIMEFRAME_OPTIONS)[number]['value'];

const TIMEFRAME_RANK: Record<AiTimeframe, number> = {
  '5m': 1,
  '15m': 2,
  '1h': 3,
  '4h': 4,
  '1d': 5,
  '1w': 6,
};

const DEFAULT_HIGHER_TIMEFRAME = '1d';
const DEFAULT_LOWER_TIMEFRAME = '15m';

type AnalysisSection = {
  summary?: string;
  bias?: string;
  keyLevels?: string[];
};

type MultiTFInsights = {
  overallSummary?: string;
  [key: string]: AnalysisSection | string | undefined;
};

type TradeIdea = {
  grade?: string;
  primaryTF?: string;
  direction?: 'LONG' | 'SHORT';
  entryZone?: string;
  entry?: string | number;
  stopLoss?: string | number;
  targets?: Array<string | number>;
  confluenceSignals?: string[];
  reasoning?: string;
  slRationale?: string;
  tp1Rationale?: string;
  tp2Rationale?: string;
};

type AnalysisResponse = {
  success?: boolean;
  multiTFInsights?: MultiTFInsights | null;
  bestTrades?: TradeIdea[];
  tokens?: { input?: number; output?: number };
  estimatedCost?: number;
  creditsRemaining?: number;
};

type RequestState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: AnalysisResponse };

type AiPreferences = CryptoPreferences & {
  aiTraderMode?: string;
  aiHigherTimeframe?: AiTimeframe;
  aiLowerTimeframe?: AiTimeframe;
};

function getSection(insights: MultiTFInsights | null | undefined, timeframe: string): AnalysisSection | null {
  if (!insights) return null;
  const section = insights[timeframe];
  return section && typeof section === 'object' ? (section as AnalysisSection) : null;
}

function getOverallSummary(insights: MultiTFInsights | null | undefined): string {
  return typeof insights?.overallSummary === 'string' ? insights.overallSummary : '';
}

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

function formatUsage(data?: AnalysisResponse): string {
  if (!data) return '';
  const cost = data.estimatedCost;
  const input = data.tokens?.input ?? 0;
  const output = data.tokens?.output ?? 0;
  const parts: string[] = [];
  if (input || output) {
    parts.push(`${input.toLocaleString()} in / ${output.toLocaleString()} out`);
  }
  if (typeof cost === 'number') {
    parts.push(`~$${cost.toFixed(6)}`);
  }
  return parts.join(' • ');
}

function getNearestLowerTimeframe(higherTimeframe: AiTimeframe): AiTimeframe {
  const lowerOptions = TIMEFRAME_OPTIONS.filter((option) => TIMEFRAME_RANK[option.value] < TIMEFRAME_RANK[higherTimeframe]);
  return (lowerOptions[lowerOptions.length - 1]?.value ?? DEFAULT_LOWER_TIMEFRAME) as AiTimeframe;
}

function getNearestHigherTimeframe(lowerTimeframe: AiTimeframe): AiTimeframe {
  const higherOptions = TIMEFRAME_OPTIONS.filter((option) => TIMEFRAME_RANK[option.value] > TIMEFRAME_RANK[lowerTimeframe]);
  return (higherOptions[0]?.value ?? DEFAULT_HIGHER_TIMEFRAME) as AiTimeframe;
}

export default function CryptoAI() {
  usePageViewTracking('crypto-ai');

  const { isAuthenticated, isLoading: authLoading } = useCryptoAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { watchlistTickers } = useWatchlistState();

  const [aiTraderMode, setAiTraderMode] = useState<AiTraderModeId>(DEFAULT_AI_TRADER_MODE);
  const [aiHigherTimeframe, setAiHigherTimeframe] = useState<AiTimeframe>(DEFAULT_HIGHER_TIMEFRAME);
  const [aiLowerTimeframe, setAiLowerTimeframe] = useState<AiTimeframe>(DEFAULT_LOWER_TIMEFRAME);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [generalStates, setGeneralStates] = useState<Record<string, RequestState>>({});
  const [deepDiveStates, setDeepDiveStates] = useState<Record<string, RequestState>>({});

  const { data: preferences, isLoading: preferencesLoading } = useQuery<AiPreferences>({
    queryKey: ['/api/crypto/preferences'],
    enabled: isAuthenticated && !authLoading,
    queryFn: async () => {
      const response = await authenticatedApiRequest('GET', '/api/crypto/preferences');
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

    if (preferences.aiHigherTimeframe && preferences.aiHigherTimeframe in TIMEFRAME_RANK) {
      setAiHigherTimeframe(preferences.aiHigherTimeframe as AiTimeframe);
    }

    if (preferences.aiLowerTimeframe && preferences.aiLowerTimeframe in TIMEFRAME_RANK) {
      setAiLowerTimeframe(preferences.aiLowerTimeframe as AiTimeframe);
    }
  }, [preferences]);

  const trackedTickers = useMemo(() => {
    const fallbackTickers = preferences?.selectedTickers ?? [];
    return Array.from(new Set([...watchlistTickers, ...fallbackTickers].filter(Boolean)));
  }, [preferences?.selectedTickers, watchlistTickers]);

  const timeframeKey = `${aiHigherTimeframe}:${aiLowerTimeframe}`;

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

  useEffect(() => {
    if (authLoading || !isAuthenticated || preferencesLoading) return;

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
  }, [authLoading, isAuthenticated, preferencesLoading, trackedTickers, timeframeKey]);

  useEffect(() => {
    setDeepDiveStates({});
  }, [timeframeKey, aiTraderMode]);

  const handleHigherTimeframeChange = async (nextHigherTimeframe: string) => {
    if (!(nextHigherTimeframe in TIMEFRAME_RANK)) return;
    const nextHigher = nextHigherTimeframe as AiTimeframe;
    const previousHigher = aiHigherTimeframe;
    const previousLower = aiLowerTimeframe;
    const nextLowerTimeframe = TIMEFRAME_RANK[nextHigher] <= TIMEFRAME_RANK[aiLowerTimeframe]
      ? getNearestLowerTimeframe(nextHigher)
      : aiLowerTimeframe;

    setAiHigherTimeframe(nextHigher);
    setAiLowerTimeframe(nextLowerTimeframe);

    try {
      await persistPreferences({
        aiHigherTimeframe: nextHigher,
        aiLowerTimeframe: nextLowerTimeframe,
      });
    } catch {
      setAiHigherTimeframe(previousHigher);
      setAiLowerTimeframe(previousLower);
    }
  };

  const handleLowerTimeframeChange = async (nextLowerTimeframe: string) => {
    if (!(nextLowerTimeframe in TIMEFRAME_RANK)) return;
    const nextLower = nextLowerTimeframe as AiTimeframe;
    const previousHigher = aiHigherTimeframe;
    const previousLower = aiLowerTimeframe;
    const nextHigherTimeframe = TIMEFRAME_RANK[nextLower] >= TIMEFRAME_RANK[aiHigherTimeframe]
      ? getNearestHigherTimeframe(nextLower)
      : aiHigherTimeframe;

    setAiLowerTimeframe(nextLower);
    setAiHigherTimeframe(nextHigherTimeframe);

    try {
      await persistPreferences({
        aiHigherTimeframe: nextHigherTimeframe,
        aiLowerTimeframe: nextLower,
      });
    } catch {
      setAiHigherTimeframe(previousHigher);
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

  const higherTimeframeOptions = TIMEFRAME_OPTIONS.filter((option) => TIMEFRAME_RANK[option.value] > TIMEFRAME_RANK[aiLowerTimeframe]);
  const lowerTimeframeOptions = TIMEFRAME_OPTIONS.filter((option) => TIMEFRAME_RANK[option.value] < TIMEFRAME_RANK[aiHigherTimeframe]);

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
              Watchlist-driven token cards with a lightweight multi-timeframe read on every token and an on-demand trade search when you want the full deep dive.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Analysis preferences</CardTitle>
            <CardDescription>
              Reusing your existing watchlist from the indicators page. Choose the higher and lower timeframe pair that matches your trading style, then use trader mode for deep-dive trade searches.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Higher TF</div>
              <Select value={aiHigherTimeframe} onValueChange={handleHigherTimeframeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select higher timeframe" />
                </SelectTrigger>
                <SelectContent>
                  {higherTimeframeOptions.map((option) => (
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
                  <SelectValue placeholder="Select lower timeframe" />
                </SelectTrigger>
                <SelectContent>
                  {lowerTimeframeOptions.map((option) => (
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
                  <SelectValue placeholder="Select trader mode" />
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

            <div className="md:col-span-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">Watchlist tokens: {trackedTickers.length}</Badge>
              <Badge variant="outline">General analysis: {aiHigherTimeframe} / {aiLowerTimeframe}</Badge>
              <Badge variant="outline">Deep dive mode: {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label ?? 'SMC / ICT'}</Badge>
              {savingPreferences && (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving preferences…
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {trackedTickers.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No watchlist tokens yet</CardTitle>
              <CardDescription>
                Add tokens to your existing watchlist on the indicators page and they will appear here automatically.
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
              const generalInsights = generalState.status === 'success' ? generalState.data.multiTFInsights : null;
              const higherSection = getSection(generalInsights, aiHigherTimeframe);
              const lowerSection = getSection(generalInsights, aiLowerTimeframe);
              const deepInsights = deepDiveState.status === 'success' ? deepDiveState.data.multiTFInsights : null;
              const tradeIdeas = deepDiveState.status === 'success' ? (deepDiveState.data.bestTrades ?? []) : [];

              return (
                <Card key={`${ticker}-${timeframeKey}`} className="h-full border-border/60">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-2xl">{formatTickerDisplay(ticker)}</CardTitle>
                        <CardDescription>
                          Cheap running overview first, then search for trade ideas only when you want the heavier analysis.
                        </CardDescription>
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
                          <h3 className="font-semibold">General analysis</h3>
                          <p className="text-sm text-muted-foreground">Bias, trend alignment, momentum, and key levels across your selected timeframe pair.</p>
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
                          <div className="grid gap-4 md:grid-cols-2">
                            {[
                              { label: `Higher TF · ${aiHigherTimeframe}`, section: higherSection },
                              { label: `Lower TF · ${aiLowerTimeframe}`, section: lowerSection },
                            ].map(({ label, section }) => (
                              <div key={label} className="rounded-lg bg-muted/40 p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <h4 className="text-sm font-semibold">{label}</h4>
                                  <Badge variant={getBiasVariant(section?.bias)}>{section?.bias ?? 'Pending'}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{section?.summary ?? 'No summary returned.'}</p>
                                {section?.keyLevels?.length ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {section.keyLevels.map((level) => (
                                      <Badge key={level} variant="secondary">{level}</Badge>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>

                          <div className="rounded-lg border border-border/60 p-4">
                            <div className="mb-2 text-sm font-semibold">Cross-timeframe summary</div>
                            <p className="text-sm text-muted-foreground">{getOverallSummary(generalInsights)}</p>
                          </div>

                          <div className="text-xs text-muted-foreground">{formatUsage(generalState.data)}</div>
                        </div>
                      ) : null}
                    </section>

                    <section className="space-y-4 rounded-lg border border-border/60 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-semibold">Deep-dive trade search</h3>
                          <p className="text-sm text-muted-foreground">
                            Uses {ENABLED_AI_TRADER_MODES.find((mode) => mode.id === aiTraderMode)?.label ?? 'SMC / ICT'} mode and only runs when you click the button.
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
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertTitle>No trades right now</AlertTitle>
                              <AlertDescription>
                                The deep dive did not find a valid plan that meets the current bias, structure, and risk/reward rules.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <div className="space-y-4">
                              {tradeIdeas.map((trade, index) => (
                                <div key={`${ticker}-trade-${index}`} className="rounded-lg border border-border/60 p-4">
                                  <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <Badge variant={trade.direction === 'LONG' ? 'default' : trade.direction === 'SHORT' ? 'destructive' : 'outline'}>
                                      {trade.direction ?? 'Setup'}
                                    </Badge>
                                    <Badge variant="secondary">{trade.grade ?? 'Unrated'}</Badge>
                                    <Badge variant="outline">{trade.primaryTF ?? `${aiLowerTimeframe}/${aiHigherTimeframe}`}</Badge>
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground">{formatUsage(deepDiveState.data)}</div>
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
