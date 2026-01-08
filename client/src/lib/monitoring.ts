// Web Vitals tracking
import { onCLS, onFID, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals';

export function setupPerformanceMonitoring() {
  // Track Core Web Vitals
  onCLS(reportWebVital);
  onFID(reportWebVital);
  onFCP(reportWebVital);
  onLCP(reportWebVital);
  onTTFB(reportWebVital);
  
  // Track custom metrics
  trackRouteLoadTime();
  trackComponentRenderTime();
  trackBundleChunkLoading();
}

function reportWebVital(metric: Metric) {
  // Send to monitoring service (Sentry, DataDog, etc.)
  console.log(`${metric.name}:`, metric.value);
  
  // Only send to analytics if in production
  if (import.meta.env.PROD) {
    // sendToAnalytics(metric);
  }
}

function trackRouteLoadTime() {
  // Measure time from navigation to route render using Navigation Timing API
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (perfData) {
      const loadTime = perfData.loadEventEnd - perfData.fetchStart;
      console.log(`Page load time: ${loadTime}ms`);
    }
  });
}

function trackComponentRenderTime() {
  // Measure component render performance
  // Use React.Profiler in development
  if (import.meta.env.DEV) {
    console.log('Performance profiling enabled - check React DevTools Profiler');
  }
}

function trackBundleChunkLoading() {
  // Monitor lazy-loaded chunk performance
  window.addEventListener('message', (e) => {
    if (e.data.__CHUNK_LOAD__) {
      console.log(`Chunk loaded: ${e.data.chunkName} in ${e.data.loadTime}ms`);
    }
  });
}
