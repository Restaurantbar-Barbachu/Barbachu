import { locationLabel } from '../core';
import { formatMoney } from '../storage';
import type { Order } from '../types';

export type NotificationStationFilter = 'all' | 'cocina' | 'barra';

export interface PushNotificationPrefs {
  enabled: boolean;
  soundEnabled: boolean;
  stationFilter: NotificationStationFilter;
  notifyLocalOrders: boolean;
}

export interface OrderPushPayload {
  title: string;
  body: string;
  tag: string;
  orderId: string;
  orderNumber: number;
  location: string;
  priority: 'normal' | 'alta';
  targetView: 'kitchen' | 'pos';
  url: string;
  requireInteraction: boolean;
}

export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

const PUSH_PREFS_STORAGE_KEY = 'barbachu.pos.push_prefs.v1';

export const DEFAULT_PUSH_PREFS: PushNotificationPrefs = {
  enabled: true,
  soundEnabled: true,
  stationFilter: 'all',
  notifyLocalOrders: true,
};

export function loadPushPrefs(storage?: Storage): PushNotificationPrefs {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) return { ...DEFAULT_PUSH_PREFS };
  try {
    const raw = targetStorage.getItem(PUSH_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PUSH_PREFS };
    const parsed = JSON.parse(raw) as Partial<PushNotificationPrefs>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PUSH_PREFS.enabled,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_PUSH_PREFS.soundEnabled,
      stationFilter:
        parsed.stationFilter === 'cocina' || parsed.stationFilter === 'barra'
          ? parsed.stationFilter
          : 'all',
      notifyLocalOrders:
        typeof parsed.notifyLocalOrders === 'boolean'
          ? parsed.notifyLocalOrders
          : DEFAULT_PUSH_PREFS.notifyLocalOrders,
    };
  } catch {
    return { ...DEFAULT_PUSH_PREFS };
  }
}

export function savePushPrefs(prefs: PushNotificationPrefs, storage?: Storage): void {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(PUSH_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function orderMatchesStationFilter(
  order: Order,
  stationFilter: NotificationStationFilter
): boolean {
  if (stationFilter === 'all') return true;
  return order.items.some((it) => (it.station || 'cocina') === stationFilter);
}

export function detectNewlyArrivedOrders(
  previousOrderIds: Set<string>,
  currentOrders: Order[],
  options?: {
    ignoreOrderIds?: Set<string>;
    stationFilter?: NotificationStationFilter;
  }
): Order[] {
  const stationFilter = options?.stationFilter ?? 'all';
  const ignoreSet = options?.ignoreOrderIds;
  const arrived: Order[] = [];

  for (const order of currentOrders) {
    if (order.paid || order.status === 'closed') continue;
    if (previousOrderIds.has(order.id)) continue;
    if (ignoreSet && ignoreSet.has(order.id)) continue;
    if (!orderMatchesStationFilter(order, stationFilter)) continue;
    arrived.push(order);
  }

  return arrived;
}

export function buildNewOrderNotificationPayload(
  order: Order,
  targetView: 'kitchen' | 'pos' = 'kitchen'
): OrderPushPayload {
  const loc = locationLabel(order.service, order.location);
  const itemCount = order.items.reduce((sum, item) => sum + Math.max(1, item.qty || 1), 0);
  const isHigh = order.priority === 'alta';
  const customerName = order.customer?.name?.trim();

  const title = isHigh
    ? `URGENTE · Nuevo Pedido #${order.number} (${loc})`
    : `Nuevo Pedido #${order.number} · ${loc}`;

  const bodyParts = [
    `${itemCount} art.`,
    formatMoney(order.totalCents),
    `Mesero: ${order.waiter || 'Staff'}`,
  ];
  if (customerName) {
    bodyParts.push(`Cliente: ${customerName}`);
  }

  const url = `/?view=pos&targetView=${encodeURIComponent(targetView)}&orderId=${encodeURIComponent(order.id)}`;

  return {
    title,
    body: bodyParts.join(' · '),
    tag: `barbachu-order-${order.id}`,
    orderId: order.id,
    orderNumber: order.number,
    location: loc,
    priority: isHigh ? 'alta' : 'normal',
    targetView,
    url,
    requireInteraction: isHigh,
  };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

export async function getServiceWorkerPushStatus(): Promise<{
  swRegistered: boolean;
  pushSupported: boolean;
  pushSubscribed: boolean;
  vapidConfigured: boolean;
}> {
  const vapidKey =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_VAPID_PUBLIC_KEY || '';
  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const reg = await getReadyServiceWorkerRegistration();
  if (!reg) {
    return {
      swRegistered: false,
      pushSupported,
      pushSubscribed: false,
      vapidConfigured: Boolean(vapidKey),
    };
  }

  let pushSubscribed = false;
  if ('pushManager' in reg) {
    try {
      const sub = await reg.pushManager.getSubscription();
      pushSubscribed = Boolean(sub);
    } catch {
      pushSubscribed = false;
    }
  }

  return {
    swRegistered: Boolean(reg.active || reg.waiting || reg.installing),
    pushSupported,
    pushSubscribed,
    vapidConfigured: Boolean(vapidKey),
  };
}

export async function requestPushNotificationPermissionAndSubscribe(): Promise<{
  permission: BrowserNotificationPermissionState;
  subscribed: boolean;
  swActive: boolean;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { permission: 'unsupported', subscribed: false, swActive: false };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  const reg = await getReadyServiceWorkerRegistration();
  const swActive = Boolean(reg?.active || reg?.waiting || reg?.installing);
  let subscribed = false;

  if (permission === 'granted' && reg && 'pushManager' in reg) {
    try {
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        subscribed = true;
      } else {
        const vapidKey =
          (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_VAPID_PUBLIC_KEY ||
          '';
        if (vapidKey.trim()) {
          const applicationServerKey = urlBase64ToUint8Array(vapidKey.trim());
          await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
          });
          subscribed = true;
        }
      }
    } catch {
      subscribed = false;
    }
  }

  return { permission, subscribed, swActive };
}

export function playOrderAlertChime(isHighPriority = false): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = isHighPriority ? [880, 1174.66, 1318.51] : [783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.26);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 900);
  } catch {
    // Ignore audio context autoplay restrictions until user interacts
  }
}

export async function dispatchServiceWorkerNotification(
  payload: OrderPushPayload,
  options?: { messageType?: 'NEW_ORDER_ALERT' | 'TEST_PUSH_NOTIFICATION' }
): Promise<{ deliveredVia: 'sw-message' | 'sw-registration' | 'window-notification' | 'none' }> {
  const perm = getBrowserNotificationPermission();
  if (perm !== 'granted') {
    return { deliveredVia: 'none' };
  }

  const reg = await getReadyServiceWorkerRegistration();
  if (reg) {
    const worker = reg.active || navigator.serviceWorker?.controller;
    if (worker) {
      worker.postMessage({
        type: options?.messageType || 'NEW_ORDER_ALERT',
        payload,
      });
      return { deliveredVia: 'sw-message' };
    }
    if (typeof reg.showNotification === 'function') {
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag,
        requireInteraction: payload.requireInteraction,
        data: {
          url: payload.url,
          orderId: payload.orderId,
          targetView: payload.targetView,
        },
      });
      return { deliveredVia: 'sw-registration' };
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      tag: payload.tag,
    });
    return { deliveredVia: 'window-notification' };
  }

  return { deliveredVia: 'none' };
}

export async function sendTestOrderPushNotification(): Promise<{
  ok: boolean;
  deliveredVia: string;
}> {
  const testOrder: Order = {
    id: `test-${Date.now()}`,
    number: 99,
    service: 'mesa',
    location: '4',
    table: '4',
    waiter: 'Prueba POS',
    note: '',
    items: [
      {
        key: 'TEST-1',
        name: 'Orden de prueba KDS',
        priceCents: 24500,
        qty: 2,
        note: '',
        station: 'cocina',
        itemStatus: 'pending',
      },
    ],
    totalCents: 49000,
    discountCents: 0,
    priority: 'normal',
    status: 'sent',
    paid: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const payload = buildNewOrderNotificationPayload(testOrder, 'kitchen');
  payload.title = 'Barbachu POS · Alerta de Prueba Activa';
  payload.tag = `barbachu-test-${Date.now()}`;

  const res = await dispatchServiceWorkerNotification(payload, {
    messageType: 'TEST_PUSH_NOTIFICATION',
  });
  return {
    ok: res.deliveredVia !== 'none',
    deliveredVia: res.deliveredVia,
  };
}
