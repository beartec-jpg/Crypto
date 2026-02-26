import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Bell, Loader2, MessageSquare, Phone, Send, Eye, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCryptoAuth } from '@/hooks/useCryptoAuth';
import type { CryptoPreferences } from '@shared/schema';

interface AlertSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TICKERS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'ADAUSDT', label: 'ADA/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
];

const ALERT_TYPES = [
  // Smart Money Concepts
  { value: 'bos', label: 'Break of Structure (BOS)', description: 'Alert when price breaks market structure', category: 'Smart Money' },
  { value: 'choch', label: 'Change of Character (CHoCH)', description: 'Alert on trend reversals', category: 'Smart Money' },
  { value: 'fvg', label: 'Fair Value Gap (FVG)', description: 'Alert when FVGs are created', category: 'Smart Money' },
  { value: 'liquidation', label: 'Liquidation Spikes', description: 'Alert on high-volume liquidation events', category: 'Smart Money' },
  
  // Oscillators
  { value: 'rsi_divergence', label: 'RSI Divergence', description: 'Alert on RSI bullish/bearish divergences', category: 'Oscillators' },
  { value: 'rsi_overbought', label: 'RSI Overbought/Oversold', description: 'Alert when RSI enters extreme zones', category: 'Oscillators' },
  { value: 'macd_crossover', label: 'MACD Crossover', description: 'Alert on MACD signal line crosses', category: 'Oscillators' },
  { value: 'stoch_cross', label: 'Stochastic Crossover', description: 'Alert on Stochastic K/D crosses', category: 'Oscillators' },
  { value: 'cci', label: 'CCI (Commodity Channel Index)', description: 'Alert on CCI overbought/oversold and zero crosses', category: 'Oscillators' },
  { value: 'adx', label: 'ADX (Trend Strength)', description: 'Alert on ADX strong trend/ranging and DI crossovers', category: 'Oscillators' },
  
  // Indicators
  { value: 'ema_cross', label: 'EMA Crossover', description: 'Alert on EMA crossovers (9/21, 20/50)', category: 'Indicators' },
  { value: 'sma_alignment', label: 'SMA Alignment', description: 'Alert on bullish/bearish SMA stacks', category: 'Indicators' },
  { value: 'bb_squeeze', label: 'Bollinger Band Squeeze', description: 'Alert on volatility compression', category: 'Indicators' },
  { value: 'vwap_cross', label: 'VWAP Cross', description: 'Alert on VWAP crosses', category: 'Indicators' },
  
  // Volume
  { value: 'volume_spike', label: 'Volume Spike', description: 'Alert on unusual volume spikes', category: 'Volume' },
  { value: 'volume_divergence', label: 'Volume Divergence', description: 'Alert on price-volume divergences', category: 'Volume' },
  { value: 'obv_divergence', label: 'OBV Divergence', description: 'Alert on OBV divergences', category: 'Volume' },
  { value: 'cvd_spike', label: 'CVD Spike', description: 'Alert on cumulative delta spikes', category: 'Volume' },
  
  // Price Action
  { value: 'engulfing', label: 'Engulfing Pattern', description: 'Alert on bullish/bearish engulfing candles', category: 'Price Action' },
  { value: 'hammer_star', label: 'Hammer/Shooting Star', description: 'Alert on reversal candlestick patterns', category: 'Price Action' },
];

const ALERT_GRADES = [
  { value: 'A+', label: 'A+', color: 'text-green-500' },
  { value: 'A', label: 'A', color: 'text-green-400' },
  { value: 'B', label: 'B', color: 'text-blue-400' },
  { value: 'C', label: 'C', color: 'text-yellow-400' },
  { value: 'D', label: 'D', color: 'text-orange-400' },
  { value: 'E', label: 'E', color: 'text-red-400' },
];

export function AlertSettingsDialog({ open, onOpenChange }: AlertSettingsDialogProps) {
  const { toast } = useToast();
  const { getToken } = useCryptoAuth();
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([]);
  const [selectedAlertTypes, setSelectedAlertTypes] = useState<string[]>([]);
  const [selectedAlertGrades, setSelectedAlertGrades] = useState<string[]>([]);
  const [pushSubscription, setPushSubscription] = useState<any>(null);
  const [notificationsSupported, setNotificationsSupported] = useState(true);
  const [userTier, setUserTier] = useState<string>('free');
  
  // Alert source toggles
  const [hlineAlertsEnabled, setHlineAlertsEnabled] = useState(true);
  const [elliottAlertsEnabled, setElliottAlertsEnabled] = useState(true);
  const [aiTradeAlertsEnabled, setAiTradeAlertsEnabled] = useState(true);
  const [indicatorAlertsEnabled, setIndicatorAlertsEnabled] = useState(true);
  
  // SMS Settings
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
  const [isSendingTestSms, setIsSendingTestSms] = useState(false);
  
  // Active alerts view
  const [showActiveAlerts, setShowActiveAlerts] = useState(false);

  // Fetch user preferences
  const { data: preferences, isLoading} = useQuery<CryptoPreferences>({
    queryKey: ['/api/crypto/preferences'],
    enabled: open,
  });
  
  // Fetch subscription tier (more reliable source)
  const { data: subscription } = useQuery<{ tier: string }>({
    queryKey: ['/api/crypto/my-subscription'],
    enabled: open,
  });
  
  // Fetch SMS settings
  const { data: smsSettings } = useQuery<{ phoneNumber: string | null; smsAlertsEnabled: boolean }>({
    queryKey: ['/api/crypto/sms-settings'],
    enabled: open,
  });
  
  // Fetch active alerts
  interface ActiveAlertsResponse {
    hLineAlerts: Array<{ id: number; type: string; symbol: string; price: number; label: string; createdAt: string }>;
    elliottAlerts: Array<{ id: number; type: string; symbol: string; price: number; label: string; waveType: string; createdAt: string }>;
    aiTrades: Array<{ id: number; type: string; symbol: string; direction: string; entry: number; stopLoss: number; targets: number[]; status: string; createdAt: string }>;
  }
  
  const { data: activeAlerts, isLoading: isLoadingAlerts, refetch: refetchAlerts } = useQuery<ActiveAlertsResponse>({
    queryKey: ['/api/crypto/active-alerts'],
    enabled: open && showActiveAlerts,
  });
  
  // Delete alert mutation
  const deleteAlertMutation = useMutation({
    mutationFn: async ({ alertType, alertId }: { alertType: string; alertId: number }) => {
      const token = await getToken();
      const response = await apiRequest('DELETE', '/api/crypto/active-alerts', { alertType, alertId }, token || undefined);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/active-alerts'] });
      toast({
        title: '✅ Alert Removed',
        description: 'The alert has been deactivated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Error',
        description: error.message || 'Failed to remove alert',
        variant: 'destructive',
      });
    },
  });
  
  // Initialize SMS state from fetched settings
  useEffect(() => {
    if (smsSettings) {
      setPhoneNumber(smsSettings.phoneNumber || '');
      setSmsAlertsEnabled(smsSettings.smsAlertsEnabled || false);
    }
  }, [smsSettings]);
  
  // SMS settings mutation
  const smsMutation = useMutation({
    mutationFn: async (data: { phoneNumber?: string; smsAlertsEnabled?: boolean }) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/crypto/sms-settings', data, token || undefined);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/sms-settings'] });
      toast({
        title: '✅ SMS Settings Saved',
        description: 'Your SMS notification settings have been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Error',
        description: error.message || 'Failed to save SMS settings',
        variant: 'destructive',
      });
    },
  });
  
  // Test SMS
  const handleTestSms = async () => {
    if (!phoneNumber) {
      toast({
        title: '❌ No Phone Number',
        description: 'Please enter your phone number first.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSendingTestSms(true);
    try {
      // First save the phone number
      await smsMutation.mutateAsync({ phoneNumber, smsAlertsEnabled: true });
      
      // Get auth token for the request
      const token = await getToken();
      
      // Then send test SMS with auth token
      const response = await apiRequest('POST', '/api/crypto/sms-test', {}, token || undefined);
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '✅ Test SMS Sent',
          description: 'Check your phone for the test message!',
        });
      } else {
        throw new Error(result.error || 'Failed to send test SMS');
      }
    } catch (error: any) {
      toast({
        title: '❌ SMS Test Failed',
        description: error.message || 'Could not send test SMS. Please check your phone number.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingTestSms(false);
    }
  };

  // Initialize state from fetched preferences
  useEffect(() => {
    if (preferences) {
      // Use subscription tier as primary source (more reliable), fall back to preferences.tier
      const tier = subscription?.tier || preferences.tier || 'free';
      const limits = getTierLimits(tier);
      
      setAlertsEnabled(preferences.alertsEnabled || false);
      // Provide tier-appropriate defaults for all fields
      setSelectedTickers(preferences.selectedTickers?.length ? preferences.selectedTickers : ['BTCUSDT']); // Default to BTC
      setSelectedTimeframes(preferences.alertTimeframes?.length ? preferences.alertTimeframes : limits.allowedTimeframes);
      setSelectedAlertTypes(preferences.alertTypes?.length ? preferences.alertTypes : limits.allowedAlertTypes.slice(0, 4)); // Default to first 4 of allowed types
      setSelectedAlertGrades(preferences.alertGrades?.length ? preferences.alertGrades : limits.allowedGrades.slice(0, 2)); // Default to first 2 of allowed grades
      setPushSubscription(preferences.pushSubscription || null);
      setUserTier(tier);
      // Alert source toggles
      setHlineAlertsEnabled(preferences.hlineAlertsEnabled ?? true);
      setElliottAlertsEnabled(preferences.elliottAlertsEnabled ?? true);
      setAiTradeAlertsEnabled(preferences.aiTradeAlertsEnabled ?? true);
      setIndicatorAlertsEnabled(preferences.indicatorAlertsEnabled ?? true);
    }
  }, [preferences, subscription]);

  // Check notification support
  useEffect(() => {
    setNotificationsSupported('Notification' in window && 'serviceWorker' in navigator);
  }, []);

  // Type for preferences payload
  type CryptoPreferencesPayload = {
    selectedTickers: string[];
    alertTimeframes: string[];
    alertTypes: string[];
    alertGrades: string[];
    alertsEnabled: boolean;
    pushSubscription: any;
    hlineAlertsEnabled?: boolean;
    elliottAlertsEnabled?: boolean;
    aiTradeAlertsEnabled?: boolean;
    indicatorAlertsEnabled?: boolean;
  };

  // Save preferences mutation (accepts explicit payload)
  const savePreferencesMutation = useMutation({
    mutationFn: async (payload: CryptoPreferencesPayload) => {
      const response = await apiRequest('POST', '/api/crypto/preferences', payload);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/preferences'] });
    },
    onError: (error: any) => {
      // Handle tier validation errors with upgrade messaging
      if (error.status === 403 || error.message?.includes('tier')) {
        toast({
          title: '🔒 Upgrade Required',
          description: error.message || 'This feature requires a higher subscription tier. Upgrade to Beginner or higher to unlock all alert types, additional tickers, and premium features.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '❌ Error',
          description: error.message || 'Failed to save preferences',
          variant: 'destructive',
        });
      }
    },
  });

  // Helper to persist preferences with optional overrides
  const persistPreferences = (overrides?: Partial<CryptoPreferencesPayload>, showToast = true) => {
    const payload = {
      selectedTickers,
      alertTimeframes: selectedTimeframes,
      alertTypes: selectedAlertTypes,
      alertGrades: selectedAlertGrades,
      alertsEnabled,
      pushSubscription,
      hlineAlertsEnabled,
      elliottAlertsEnabled,
      aiTradeAlertsEnabled,
      indicatorAlertsEnabled,
      ...overrides,
    };
    savePreferencesMutation.mutate(payload);
    if (showToast && !overrides) {
      toast({
        title: '✅ Settings Saved',
        description: 'Your alert preferences have been updated.',
      });
    }
  };

  // Normalize tier names (backend may return various tier strings)
  const normalizeTier = (tier: string): string => {
    const lowerTier = tier.toLowerCase();
    
    // Free tier variations
    if (lowerTier.includes('free') || !tier) return 'free';
    
    // Beginner tier variations
    if (lowerTier.includes('beginner') || lowerTier.includes('basic')) return 'beginner';
    
    // Intermediate tier variations  
    if (lowerTier.includes('intermediate') || lowerTier.includes('standard')) return 'intermediate';
    
    // Pro tier variations (professional, pro, professional_plus, etc.)
    if (lowerTier.includes('pro')) return 'pro';
    
    // Elite tier variations (elite, advanced, enterprise, founders, etc.)
    if (lowerTier.includes('elite') || lowerTier.includes('advanced') || 
        lowerTier.includes('enterprise') || lowerTier.includes('founder')) return 'elite';
    
    // Default to free for unknown tiers
    return 'free';
  };

  // Tier-based limits (must match backend exactly) - Minimum tier is Intermediate
  const getTierLimits = (tier: string) => {
    const normalizedTier = normalizeTier(tier);
    const tierLimits: Record<string, {
      maxTickers: number;
      allowedAlertTypes: string[];
      allowedGrades: string[];
      allowedTimeframes: string[];
    }> = {
      free: {
        maxTickers: 0,
        allowedAlertTypes: [],
        allowedGrades: [],
        allowedTimeframes: []
      },
      intermediate: {
        maxTickers: 3,
        allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx'],
        allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
        allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']
      },
      pro: {
        maxTickers: 4,
        allowedAlertTypes: [
          'bos', 'choch', 'fvg', 'liquidation',
          'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx',
          'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross'
        ],
        allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
        allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']
      },
      elite: {
        maxTickers: 5,
        allowedAlertTypes: [
          'bos', 'choch', 'fvg', 'liquidation',
          'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx',
          'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross',
          'volume_spike', 'volume_divergence', 'obv_divergence', 'cvd_spike',
          'engulfing', 'hammer_star'
        ],
        allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
        allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']
      },
    };
    // Return free limits for free tier, otherwise intermediate as fallback
    if (normalizedTier === 'free') return tierLimits['free'];
    return tierLimits[normalizedTier] || tierLimits['intermediate'];
  };
  
  // Check if user has minimum required tier for alerts
  // Use subscription data directly as it's more reliable than state
  const hasMinimumTier = () => {
    // Check subscription first (most reliable), then preferences, then state
    const currentTier = subscription?.tier || preferences?.tier || userTier;
    const normalizedTier = normalizeTier(currentTier);
    console.log(`🔍 hasMinimumTier check: currentTier=${currentTier}, normalized=${normalizedTier}`);
    return ['intermediate', 'pro', 'elite'].includes(normalizedTier);
  };

  // Validate current selections against tier limits
  const validateTierLimits = () => {
    const limits = getTierLimits(userTier);
    
    // Check ticker count
    if (selectedTickers.length > limits.maxTickers) {
      return { valid: false, reason: `${userTier} tier limited to ${limits.maxTickers} ticker(s). Upgrade to access more tickers.` };
    }
    
    // Check alert types
    const invalidTypes = selectedAlertTypes.filter(type => !limits.allowedAlertTypes.includes(type));
    if (invalidTypes.length > 0) {
      return { valid: false, reason: `Selected alert types not available in ${userTier} tier. Upgrade to unlock all alert types.` };
    }
    
    // Check grades
    const invalidGrades = selectedAlertGrades.filter(grade => !limits.allowedGrades.includes(grade));
    if (invalidGrades.length > 0) {
      return { valid: false, reason: `Grades ${invalidGrades.join(', ')} require a higher tier. Upgrade to unlock all quality grades.` };
    }
    
    // Check timeframes
    const invalidTimeframes = selectedTimeframes.filter(tf => !limits.allowedTimeframes.includes(tf));
    if (invalidTimeframes.length > 0) {
      return { valid: false, reason: `Selected timeframes not available in ${userTier} tier. Upgrade to unlock all timeframes.` };
    }
    
    return { valid: true, reason: '' };
  };

  const validationResult = validateTierLimits();
  const isSaveDisabled = !validationResult.valid || savePreferencesMutation.isPending;

  // Request notification permission and subscribe
  const handleEnableNotifications = async () => {
    if (!notificationsSupported) {
      toast({
        title: '❌ Not Supported',
        description: 'Push notifications are not supported in your browser.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          title: '❌ Permission Denied',
          description: 'Please allow notifications in your browser settings.',
          variant: 'destructive',
        });
        return;
      }

      // Fetch the VAPID public key from server
      const vapidResponse = await fetch('/api/crypto/vapid-key');
      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID key from server');
      }
      const { publicKey: vapidPublicKey } = await vapidResponse.json();
      
      if (!vapidPublicKey) {
        throw new Error('VAPID key not configured on server');
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Subscribe to push notifications with correct VAPID key
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionJSON = subscription.toJSON();
      setPushSubscription(subscriptionJSON);
      setAlertsEnabled(true);

      // Auto-save the new push subscription with explicit overrides
      try {
        await new Promise((resolve, reject) => {
          savePreferencesMutation.mutate(
            {
              selectedTickers,
              alertTimeframes: selectedTimeframes,
              alertTypes: selectedAlertTypes,
              alertGrades: selectedAlertGrades,
              alertsEnabled: true,
              pushSubscription: subscriptionJSON,
            },
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });

        toast({
          title: '✅ Notifications Enabled',
          description: 'Push notifications have been enabled and saved.',
        });
      } catch (error: any) {
        // Rollback state on save failure
        setPushSubscription(null);
        setAlertsEnabled(false);
        throw error; // Re-throw to be caught by outer catch
      }
    } catch (error: any) {
      console.error('Failed to enable notifications:', error);
      toast({
        title: '❌ Error',
        description: 'Failed to enable notifications. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Unsubscribe from push notifications
  const handleDisableNotifications = async () => {
    try {
      // Unsubscribe from browser push manager
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
      
      // Clear local state
      const previousSubscription = pushSubscription;
      const previousEnabled = alertsEnabled;
      setPushSubscription(null);
      setAlertsEnabled(false);
      
      // Auto-save the disabled state with explicit overrides
      try {
        await new Promise((resolve, reject) => {
          savePreferencesMutation.mutate(
            {
              selectedTickers,
              alertTimeframes: selectedTimeframes,
              alertTypes: selectedAlertTypes,
              alertGrades: selectedAlertGrades,
              alertsEnabled: false,
              pushSubscription: null,
            },
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });
        
        toast({
          title: '🔕 Notifications Disabled',
          description: 'Push notifications have been disabled and saved.',
        });
      } catch (error: any) {
        // Rollback state on save failure
        setPushSubscription(previousSubscription);
        setAlertsEnabled(previousEnabled);
        toast({
          title: '❌ Save Failed',
          description: 'Failed to save notification settings. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
      // Still disable locally even if unsubscribe fails
      setPushSubscription(null);
      setAlertsEnabled(false);
      toast({
        title: '⚠️ Warning',
        description: 'Notifications disabled but unsubscribe failed.',
        variant: 'destructive',
      });
    }
  };

  // Handle toggle change for already-subscribed users
  const handleToggleAlerts = async (enabled: boolean) => {
    if (enabled) {
      // Re-acquire push subscription when enabling
      await handleEnableNotifications();
    } else {
      await handleDisableNotifications();
    }
  };

  // Helper function to convert VAPID key
  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const handleTickerToggle = (ticker: string) => {
    setSelectedTickers(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  };

  const handleTimeframeToggle = (timeframe: string) => {
    setSelectedTimeframes(prev =>
      prev.includes(timeframe) ? prev.filter(t => t !== timeframe) : [...prev, timeframe]
    );
  };

  const handleAlertTypeToggle = (alertType: string) => {
    setSelectedAlertTypes(prev =>
      prev.includes(alertType) ? prev.filter(t => t !== alertType) : [...prev, alertType]
    );
  };

  const handleAlertGradeToggle = (grade: string) => {
    setSelectedAlertGrades(prev =>
      prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="h-6 w-6 text-blue-400" />
            Alert Notification Settings
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tier Requirement Notice */}
            {!hasMinimumTier() && (
              <div className="p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                <p className="text-yellow-300 font-semibold mb-1">🔒 Intermediate Tier Required</p>
                <p className="text-sm text-yellow-200/80">
                  Alert notifications require Intermediate tier or higher. Upgrade to unlock all alert features.
                </p>
              </div>
            )}
            
            {/* SMS Notifications Section - PRIMARY */}
            <div className="p-4 bg-gradient-to-r from-green-900/30 to-slate-800 rounded-lg border border-green-700/50">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-5 w-5 text-green-400" />
                <Label className="text-white font-semibold">SMS Notifications (Primary)</Label>
                <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Recommended</span>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Get alerts via SMS even when your browser is closed. Most reliable notification method.
                <span className="text-green-400 block mt-1">Included with your subscription</span>
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <Input
                    type="tel"
                    placeholder="+447712345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-500 flex-1"
                    disabled={!hasMinimumTier()}
                    data-testid="input-phone-number"
                  />
                </div>
                <p className="text-xs text-gray-500">Enter phone in international format (e.g., +44 for UK)</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={smsAlertsEnabled}
                      onCheckedChange={(enabled) => {
                        setSmsAlertsEnabled(enabled);
                        if (phoneNumber) {
                          smsMutation.mutate({ smsAlertsEnabled: enabled });
                        }
                      }}
                      disabled={!phoneNumber || !hasMinimumTier()}
                      data-testid="toggle-sms-alerts"
                    />
                    <Label className="text-gray-300 text-sm">
                      {smsAlertsEnabled ? 'SMS Alerts Enabled' : 'Enable SMS Alerts'}
                    </Label>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestSms}
                    disabled={!phoneNumber || isSendingTestSms || !hasMinimumTier()}
                    className="border-green-600 text-green-400 hover:bg-green-900/30"
                    data-testid="button-test-sms"
                  >
                    {isSendingTestSms ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" />
                        Test SMS
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Push Notifications - Secondary/Backup */}
            <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div>
                <Label className="text-white font-semibold">Push Notifications (Backup)</Label>
                <p className="text-sm text-gray-400 mt-1">
                  {pushSubscription
                    ? 'Browser notifications enabled as backup'
                    : 'Enable browser notifications as a backup method'}
                </p>
              </div>
              {pushSubscription ? (
                <Switch
                  checked={alertsEnabled}
                  onCheckedChange={handleToggleAlerts}
                  disabled={!hasMinimumTier()}
                  data-testid="toggle-alerts-enabled"
                />
              ) : (
                <Button
                  onClick={handleEnableNotifications}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!hasMinimumTier()}
                  data-testid="button-enable-notifications"
                >
                  Enable
                </Button>
              )}
            </div>

            {/* Alert Sources - Control which alert types are monitored */}
            <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
              <Label className="text-white font-semibold mb-3 block">
                Alert Sources
              </Label>
              <p className="text-xs text-gray-400 mb-3">Control which types of alerts are active</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                  <Label className="text-gray-300 text-sm">H-Line Alerts</Label>
                  <Switch
                    checked={hlineAlertsEnabled}
                    onCheckedChange={(checked) => {
                      setHlineAlertsEnabled(checked);
                      persistPreferences({ hlineAlertsEnabled: checked }, false);
                    }}
                    data-testid="toggle-hline-alerts"
                  />
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                  <Label className="text-gray-300 text-sm">Elliott Wave</Label>
                  <Switch
                    checked={elliottAlertsEnabled}
                    onCheckedChange={(checked) => {
                      setElliottAlertsEnabled(checked);
                      persistPreferences({ elliottAlertsEnabled: checked }, false);
                    }}
                    data-testid="toggle-elliott-alerts"
                  />
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                  <Label className="text-gray-300 text-sm">AI Trade Alerts</Label>
                  <Switch
                    checked={aiTradeAlertsEnabled}
                    onCheckedChange={(checked) => {
                      setAiTradeAlertsEnabled(checked);
                      persistPreferences({ aiTradeAlertsEnabled: checked }, false);
                    }}
                    data-testid="toggle-ai-trade-alerts"
                  />
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                  <Label className="text-gray-300 text-sm">Indicator Alerts</Label>
                  <Switch
                    checked={indicatorAlertsEnabled}
                    onCheckedChange={(checked) => {
                      setIndicatorAlertsEnabled(checked);
                      persistPreferences({ indicatorAlertsEnabled: checked }, false);
                    }}
                    data-testid="toggle-indicator-alerts"
                  />
                </div>
              </div>
              
              {/* View Active Alerts Button */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowActiveAlerts(!showActiveAlerts);
                    if (!showActiveAlerts) refetchAlerts();
                  }}
                  className="w-full border-blue-600 text-blue-400 hover:bg-blue-900/30"
                  data-testid="button-view-active-alerts"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {showActiveAlerts ? 'Hide Active Alerts' : 'View All Active Alerts'}
                </Button>
              </div>
              
              {/* Active Alerts List */}
              {showActiveAlerts && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {isLoadingAlerts ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <>
                      {/* H-Line Alerts */}
                      {activeAlerts?.hLineAlerts?.map((alert) => (
                        <div key={`hline-${alert.id}`} className="flex items-center justify-between p-2 bg-slate-900/70 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-yellow-400">H-Line</span>
                            <span className="text-gray-300">{alert.symbol}</span>
                            <span className="text-gray-500">@</span>
                            <span className="text-white">${alert.price?.toFixed(2)}</span>
                            <span className="text-gray-500 text-xs">({alert.label})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAlertMutation.mutate({ alertType: 'hline', alertId: alert.id })}
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                            data-testid={`button-delete-hline-${alert.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      
                      {/* Elliott Wave Alerts */}
                      {activeAlerts?.elliottAlerts?.map((alert) => (
                        <div key={`elliott-${alert.id}`} className="flex items-center justify-between p-2 bg-slate-900/70 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400">Elliott</span>
                            <span className="text-gray-300">{alert.symbol}</span>
                            <span className="text-gray-500">@</span>
                            <span className="text-white">${alert.price?.toFixed(2)}</span>
                            <span className="text-gray-500 text-xs">({alert.label})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAlertMutation.mutate({ alertType: 'elliott', alertId: alert.id })}
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                            data-testid={`button-delete-elliott-${alert.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      
                      {/* AI Trade Alerts */}
                      {activeAlerts?.aiTrades?.map((trade) => (
                        <div key={`ai-${trade.id}`} className="flex items-center justify-between p-2 bg-slate-900/70 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span className={trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                              {trade.direction === 'long' ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                              {' '}AI
                            </span>
                            <span className="text-gray-300">{trade.symbol}</span>
                            <span className="text-gray-500">Entry:</span>
                            <span className="text-white">${trade.entry}</span>
                            <span className="text-gray-500 text-xs">({trade.status})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAlertMutation.mutate({ alertType: 'ai_trade', alertId: trade.id })}
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                            data-testid={`button-delete-ai-${trade.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      
                      {/* No alerts message */}
                      {(!activeAlerts?.hLineAlerts?.length && !activeAlerts?.elliottAlerts?.length && !activeAlerts?.aiTrades?.length) && (
                        <p className="text-gray-500 text-center py-4 text-sm">No active alerts</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tickers */}
            <div>
              <Label className="text-white font-semibold mb-3 block">
                Select Tickers (Max 3)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {TICKERS.map(ticker => (
                  <div
                    key={ticker.value}
                    className="flex items-center space-x-2 p-3 bg-slate-800 rounded-lg border border-slate-700"
                  >
                    <Checkbox
                      id={`ticker-${ticker.value}`}
                      checked={selectedTickers.includes(ticker.value)}
                      onCheckedChange={() => handleTickerToggle(ticker.value)}
                      disabled={
                        !hasMinimumTier() || (!selectedTickers.includes(ticker.value) && selectedTickers.length >= 3)
                      }
                      data-testid={`checkbox-ticker-${ticker.value.toLowerCase()}`}
                    />
                    <Label
                      htmlFor={`ticker-${ticker.value}`}
                      className="text-gray-300 cursor-pointer flex-1"
                    >
                      {ticker.label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedTickers.length}/3 tickers selected
              </p>
            </div>

            {/* Timeframes */}
            <div>
              <Label className="text-white font-semibold mb-3 block">
                Monitor Timeframes
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {TIMEFRAMES.map(tf => {
                  const limits = getTierLimits(userTier);
                  const isLocked = !limits.allowedTimeframes.includes(tf.value);
                  return (
                    <div
                      key={tf.value}
                      className={`flex items-center space-x-2 p-3 bg-slate-800 rounded-lg border ${
                        isLocked ? 'border-yellow-600/30' : 'border-slate-700'
                      }`}
                    >
                      <Checkbox
                        id={`timeframe-${tf.value}`}
                        checked={selectedTimeframes.includes(tf.value)}
                        onCheckedChange={() => handleTimeframeToggle(tf.value)}
                        disabled={isLocked}
                        data-testid={`checkbox-timeframe-${tf.value}`}
                      />
                      <Label
                        htmlFor={`timeframe-${tf.value}`}
                        className={`cursor-pointer flex-1 ${isLocked ? 'text-gray-500' : 'text-gray-300'}`}
                      >
                        {tf.label} {isLocked && '🔒'}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alert Types */}
            <div>
              <Label className="text-white font-semibold mb-3 block">
                Alert Types
              </Label>
              <div className="space-y-4">
                {['Smart Money', 'Oscillators', 'Indicators', 'Volume', 'Price Action'].map(category => {
                  const categoryTypes = ALERT_TYPES.filter(type => type.category === category);
                  return (
                    <div key={category}>
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">{category}</h4>
                      <div className="space-y-2">
                        {categoryTypes.map(type => {
                          const limits = getTierLimits(userTier);
                          const isLocked = !limits.allowedAlertTypes.includes(type.value);
                          return (
                            <div
                              key={type.value}
                              className={`flex items-start space-x-3 p-2 bg-slate-800/50 rounded-lg border ${
                                isLocked ? 'border-yellow-600/30' : 'border-slate-700/50'
                              }`}
                            >
                              <Checkbox
                                id={`alert-type-${type.value}`}
                                checked={selectedAlertTypes.includes(type.value)}
                                onCheckedChange={() => handleAlertTypeToggle(type.value)}
                                disabled={isLocked}
                                className="mt-0.5"
                                data-testid={`checkbox-alert-${type.value}`}
                              />
                              <div className="flex-1 min-w-0">
                                <Label
                                  htmlFor={`alert-type-${type.value}`}
                                  className={`cursor-pointer text-sm ${isLocked ? 'text-gray-500' : 'text-gray-200'}`}
                                >
                                  {type.label} {isLocked && '🔒'}
                                </Label>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {type.description}
                                  {isLocked && ' (Requires higher tier)'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alert Grades */}
            <div>
              <Label className="text-white font-semibold mb-3 block">
                Alert Quality Grades
              </Label>
              <p className="text-sm text-gray-400 mb-3">
                Only receive alerts for setups with selected quality grades
              </p>
              <div className="grid grid-cols-6 gap-2">
                {ALERT_GRADES.map(grade => {
                  const limits = getTierLimits(userTier);
                  const isLocked = !limits.allowedGrades.includes(grade.value);
                  return (
                    <div
                      key={grade.value}
                      className={`flex items-center space-x-1.5 p-2 bg-slate-800 rounded-lg border ${
                        isLocked ? 'border-yellow-600/30' : 'border-slate-700'
                      }`}
                    >
                      <Checkbox
                        id={`grade-${grade.value}`}
                        checked={selectedAlertGrades.includes(grade.value)}
                        onCheckedChange={() => handleAlertGradeToggle(grade.value)}
                        disabled={isLocked}
                        data-testid={`checkbox-grade-${grade.value.toLowerCase()}`}
                      />
                      <Label
                        htmlFor={`grade-${grade.value}`}
                        className={`cursor-pointer flex-1 font-bold text-sm ${isLocked ? 'text-gray-500' : grade.color}`}
                      >
                        {grade.label} {isLocked && '🔒'}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Validation Message */}
            {!validationResult.valid && (
              <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-sm text-yellow-300">
                  🔒 {validationResult.reason}
                </p>
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-600 text-gray-300 hover:bg-slate-800"
                data-testid="button-cancel-settings"
              >
                Cancel
              </Button>
              <Button
                onClick={() => persistPreferences()}
                disabled={isSaveDisabled}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-save-settings"
              >
                {savePreferencesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
