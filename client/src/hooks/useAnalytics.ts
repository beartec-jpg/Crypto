import { useCallback, useEffect, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';

const SESSION_KEY = 'beartec_session_id';

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

interface TrackEventOptions {
  eventType: 'page_view' | 'click' | 'feature_usage' | 'api_call';
  eventName: string;
  eventData?: Record<string, any>;
  page?: string;
  symbol?: string;
  timeframe?: string;
  userTier?: string;
}

export function useAnalytics() {
  const sessionId = useRef(getSessionId());
  
  const trackEvent = useCallback(async (options: TrackEventOptions) => {
    try {
      await apiRequest('/api/analytics/event', {
        method: 'POST',
        body: JSON.stringify({
          ...options,
          sessionId: sessionId.current,
        }),
      });
    } catch (error) {
      // Silent fail - don't break the app for analytics
      console.debug('Analytics event failed:', error);
    }
  }, []);
  
  const trackPageView = useCallback((page: string, symbol?: string, timeframe?: string, userTier?: string) => {
    trackEvent({
      eventType: 'page_view',
      eventName: 'page_viewed',
      page,
      symbol,
      timeframe,
      userTier,
    });
  }, [trackEvent]);
  
  const trackClick = useCallback((elementName: string, page?: string, additionalData?: Record<string, any>) => {
    trackEvent({
      eventType: 'click',
      eventName: elementName,
      page,
      eventData: additionalData,
    });
  }, [trackEvent]);
  
  const trackFeature = useCallback((featureName: string, page?: string, symbol?: string, timeframe?: string, additionalData?: Record<string, any>) => {
    trackEvent({
      eventType: 'feature_usage',
      eventName: featureName,
      page,
      symbol,
      timeframe,
      eventData: additionalData,
    });
  }, [trackEvent]);
  
  const trackApiCall = useCallback((apiType: string, endpoint?: string, symbol?: string, interval?: string, tokensUsed?: number, estimatedCost?: number, responseTime?: number, success?: boolean, errorMessage?: string) => {
    apiRequest('/api/analytics/api-usage', {
      method: 'POST',
      body: JSON.stringify({
        apiType,
        endpoint,
        symbol,
        interval,
        tokensUsed,
        estimatedCost,
        responseTime,
        success: success ?? true,
        errorMessage,
      }),
    }).catch(() => {});
  }, []);
  
  return {
    trackEvent,
    trackPageView,
    trackClick,
    trackFeature,
    trackApiCall,
    sessionId: sessionId.current,
  };
}

export function usePageViewTracking(page: string, symbol?: string, timeframe?: string, userTier?: string) {
  const { trackPageView } = useAnalytics();
  const hasTracked = useRef(false);
  
  useEffect(() => {
    if (!hasTracked.current) {
      trackPageView(page, symbol, timeframe, userTier);
      hasTracked.current = true;
    }
  }, [page, symbol, timeframe, userTier, trackPageView]);
}
