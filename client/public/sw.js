// Service Worker for Push Notifications
// Handles push events and notification clicks

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Listen for push events from server
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);
  
  if (!event.data) {
    console.log('Push event but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (error) {
    console.error('Failed to parse push data:', error);
    return;
  }

  const options = {
    body: data.body || 'New trade alert available',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: {
      url: data.url || '/cryptoc',
      alertData: data.alertData || {}
    },
    tag: data.tag || 'trade-alert',
    requireInteraction: true, // Keep notification visible until user interacts
    vibrate: [200, 100, 200], // Vibration pattern for mobile
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Trade Alert', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/cryptoc';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if /cryptoc is already open in any tab
        for (const client of clientList) {
          if (client.url.includes('/cryptoc') && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if /cryptoc not found
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Optional: Handle notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification);
});
