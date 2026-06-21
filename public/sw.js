self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Point dos Malokas', body: event.data?.text() || '' }; }

  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Point dos Malokas', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
