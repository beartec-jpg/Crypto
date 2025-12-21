// Service Worker for Push Notifications
// Handles push events and notification clicks even when app is backgrounded

const SW_VERSION = '1.2.0';

self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  event.waitUntil(clients.claim());
});

// Listen for push events from server
self.addEventListener('push', (event) => {
  console.log(`[SW ${SW_VERSION}] Push received:`, event);
  
  // CRITICAL: Always use waitUntil to keep SW alive during async operations
  event.waitUntil(
    (async () => {
      let data = {
        title: 'Trade Alert',
        body: 'New trading alert available',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: '/cryptoc',
        tag: 'trade-alert-' + Date.now()
      };

      // Try to parse push data if available
      if (event.data) {
        try {
          const parsed = event.data.json();
          data = { ...data, ...parsed };
          console.log(`[SW ${SW_VERSION}] Push data parsed:`, data);
        } catch (error) {
          // Try text format
          try {
            const text = event.data.text();
            if (text) {
              data.body = text;
            }
          } catch (e) {
            console.log(`[SW ${SW_VERSION}] Could not parse push data, using defaults`);
          }
        }
      } else {
        console.log(`[SW ${SW_VERSION}] No event.data, showing default notification`);
      }

      const options = {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        data: {
          url: data.url || '/cryptoc',
          alertData: data.alertData || {},
          timestamp: Date.now()
        },
        tag: data.tag || 'trade-alert',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        actions: [
          { action: 'view', title: 'View Chart' },
          { action: 'dismiss', title: 'Dismiss' }
        ],
        renotify: true,
        silent: false
      };

      try {
        await self.registration.showNotification(data.title, options);
        console.log(`[SW ${SW_VERSION}] Notification shown successfully`);
      } catch (notifError) {
        console.error(`[SW ${SW_VERSION}] Failed to show notification:`, notifError);
      }
    })()
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log(`[SW ${SW_VERSION}] Notification clicked:`, event.action, event.notification);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/cryptoc';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes('/cryptoc') && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log(`[SW ${SW_VERSION}] Notification closed`);
});

// Keep service worker alive with periodic sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alerts') {
    console.log(`[SW ${SW_VERSION}] Periodic sync: check-alerts`);
  }
});

// Handle push subscription change (important for iOS/Safari)
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log(`[SW ${SW_VERSION}] Push subscription changed`);
  
  event.waitUntil(
    (async () => {
      try {
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: self.applicationServerKey
        });
        
        // Re-register with backend
        await fetch('/api/crypto/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() })
        });
        
        console.log(`[SW ${SW_VERSION}] Resubscribed after change`);
      } catch (error) {
        console.error(`[SW ${SW_VERSION}] Failed to resubscribe:`, error);
      }
    })()
  );
});
