// Service Worker for Web Push notifications

self.addEventListener('push', (event) => {
  let data = { title: 'SHIFTHIGHBURY', body: '' };
  try { data = event.data ? event.data.json() : data; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'SHIFTHIGHBURY', {
      body: data.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/favicon.png',
      tag: 'shifthighbury-push',
      renotify: true,
      data: { url: data.url || '/portal' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/portal';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(target);
    }),
  );
});
