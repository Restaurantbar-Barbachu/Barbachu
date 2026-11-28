/* Barbachu POS — Service Worker Push & Order Alert Handler */
/* Loaded by Workbox SW via importScripts('/sw-push.js') */

const DEFAULT_ICON = '/pwa-192x192.png';
const DEFAULT_BADGE = '/pwa-192x192.png';

function buildOrderNotificationOptions(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const isHighPriority = payload.priority === 'alta';
  const orderId = payload.orderId ? String(payload.orderId) : '';
  const targetView = payload.targetView === 'pos' ? 'pos' : 'kitchen';
  const defaultUrl = orderId
    ? `/?view=pos&targetView=${encodeURIComponent(targetView)}&orderId=${encodeURIComponent(orderId)}`
    : '/?view=pos';

  return {
    title: String(payload.title || 'Nuevo pedido en Barbachu POS'),
    options: {
      body: String(payload.body || 'Ha llegado una nueva comanda al sistema.'),
      icon: String(payload.icon || DEFAULT_ICON),
      badge: String(payload.badge || DEFAULT_BADGE),
      tag: String(payload.tag || (orderId ? `barbachu-order-${orderId}` : `barbachu-order-${Date.now()}`)),
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction ?? isHighPriority),
      vibrate: isHighPriority ? [240, 100, 240, 100, 240] : [180, 90, 180],
      timestamp: Date.now(),
      data: {
        url: String(payload.url || defaultUrl),
        orderId,
        targetView,
        orderNumber: payload.orderNumber ?? null,
      },
      actions: [
        { action: 'open-kds', title: 'Ver en Cocina' },
        { action: 'open-pos', title: 'Abrir Comanda' },
      ],
    },
  };
}

self.addEventListener('push', (event) => {
  let raw = {};
  if (event.data) {
    try {
      raw = event.data.json();
    } catch {
      try {
        raw = { body: event.data.text() };
      } catch {
        raw = {};
      }
    }
  }

  const { title, options } = buildOrderNotificationOptions(raw);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (msg.type === 'NEW_ORDER_ALERT' || msg.type === 'TEST_PUSH_NOTIFICATION') {
    const { title, options } = buildOrderNotificationOptions(msg.payload);
    const notifyPromise = self.registration.showNotification(title, options);
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(notifyPromise);
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = (event.notification && event.notification.data) || {};
  const action = event.action || '';
  const targetView =
    action === 'open-pos'
      ? 'pos'
      : action === 'open-kds'
      ? 'kitchen'
      : notifData.targetView === 'pos'
      ? 'pos'
      : 'kitchen';
  const orderId = notifData.orderId ? String(notifData.orderId) : '';
  const targetUrl =
    notifData.url ||
    (orderId
      ? `/?view=pos&targetView=${encodeURIComponent(targetView)}&orderId=${encodeURIComponent(orderId)}`
      : '/?view=pos');

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              client.postMessage({
                type: 'OPEN_ORDER_FROM_NOTIFICATION',
                orderId,
                targetView,
              });
              if ('focus' in client) {
                return client.focus();
              }
            }
          } catch {
            // Ignore malformed client URL
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
        }
      })
  );
});
