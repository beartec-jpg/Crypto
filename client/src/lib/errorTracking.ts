// Error tracking with Sentry (optional)
// import * as Sentry from "@sentry/react";

export function setupErrorTracking() {
  // Optional: Initialize Sentry for production
  // if (import.meta.env.PROD) {
  //   Sentry.init({
  //     dsn: import.meta.env.VITE_SENTRY_DSN,
  //     integrations: [
  //       new Sentry.Replay(),
  //     ],
  //     tracesSampleRate: 0.1,
  //     replaysSessionSampleRate: 0.1,
  //     replaysOnErrorSampleRate: 1.0,
  //   });
  // }
  
  // Setup global error handler
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    // Send to error tracking service
  });
  
  // Setup unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    // Send to error tracking service
  });
}
