import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '../types';
import {
  buildNewOrderNotificationPayload,
  detectNewlyArrivedOrders,
  dispatchServiceWorkerNotification,
  getBrowserNotificationPermission,
  getServiceWorkerPushStatus,
  loadPushPrefs,
  playOrderAlertChime,
  requestPushNotificationPermissionAndSubscribe,
  savePushPrefs,
  sendTestOrderPushNotification,
  type BrowserNotificationPermissionState,
  type NotificationStationFilter,
  type PushNotificationPrefs,
} from '../lib/pushNotifications';
import type { ToastVariant } from '../lib/securePosApi';

interface UseOrderPushNotificationsParams {
  orders: Order[];
  workspaceReady: boolean;
  defaultTargetView?: 'kitchen' | 'pos';
  onNotifyToast: (msg: string, variant?: ToastVariant, detail?: string) => void;
  onNotificationNavigate?: (params: { orderId: string; targetView: 'kitchen' | 'pos' }) => void;
}

export function useOrderPushNotifications({
  orders,
  workspaceReady,
  defaultTargetView = 'kitchen',
  onNotifyToast,
  onNotificationNavigate,
}: UseOrderPushNotificationsParams) {
  const [prefs, setPrefs] = useState<PushNotificationPrefs>(() => loadPushPrefs());
  const [permission, setPermission] = useState<BrowserNotificationPermissionState>(() =>
    getBrowserNotificationPermission()
  );
  const [swStatus, setSwStatus] = useState<{
    swRegistered: boolean;
    pushSupported: boolean;
    pushSubscribed: boolean;
    vapidConfigured: boolean;
  }>({
    swRegistered: false,
    pushSupported: typeof window !== 'undefined' && 'Notification' in window,
    pushSubscribed: false,
    vapidConfigured: false,
  });

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hydratedRef = useRef<boolean>(false);
  const onNotificationNavigateRef = useRef(onNotificationNavigate);
  onNotificationNavigateRef.current = onNotificationNavigate;

  const refreshPushStatus = useCallback(async () => {
    setPermission(getBrowserNotificationPermission());
    const status = await getServiceWorkerPushStatus();
    setSwStatus(status);
  }, []);

  useEffect(() => {
    void refreshPushStatus();
  }, [refreshPushStatus]);

  // Listen for notification click events forwarded by the Service Worker
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'OPEN_ORDER_FROM_NOTIFICATION') {
        const orderId = typeof data.orderId === 'string' ? data.orderId : '';
        const targetView = data.targetView === 'pos' ? 'pos' : 'kitchen';
        onNotificationNavigateRef.current?.({ orderId, targetView });
      } else if (data.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        void refreshPushStatus();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [refreshPushStatus]);

  // Reset hydration gate when workspace logs out
  useEffect(() => {
    if (!workspaceReady) {
      hydratedRef.current = false;
      knownOrderIdsRef.current = new Set();
    }
  }, [workspaceReady]);

  // Detect genuinely new incoming POS orders after initial Firestore hydration
  useEffect(() => {
    if (!workspaceReady) return;

    if (!hydratedRef.current) {
      knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
      hydratedRef.current = true;
      return;
    }

    const arrived = detectNewlyArrivedOrders(knownOrderIdsRef.current, orders, {
      stationFilter: prefs.stationFilter,
    });

    // Update known order IDs to reflect current snapshot
    const nextKnown = new Set(knownOrderIdsRef.current);
    for (const o of orders) {
      nextKnown.add(o.id);
    }
    knownOrderIdsRef.current = nextKnown;

    if (arrived.length === 0 || !prefs.enabled) return;

    const currentPerm = getBrowserNotificationPermission();
    setPermission(currentPerm);

    for (const newOrder of arrived) {
      const payload = buildNewOrderNotificationPayload(newOrder, defaultTargetView);
      onNotifyToast(payload.title, 'info', payload.body);

      if (prefs.soundEnabled) {
        playOrderAlertChime(newOrder.priority === 'alta');
      }

      if (currentPerm === 'granted') {
        void dispatchServiceWorkerNotification(payload, { messageType: 'NEW_ORDER_ALERT' });
      }
    }
  }, [orders, workspaceReady, prefs.enabled, prefs.soundEnabled, prefs.stationFilter, defaultTargetView, onNotifyToast]);

  const updatePrefs = useCallback((patch: Partial<PushNotificationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePushPrefs(next);
      return next;
    });
  }, []);

  const enableNotifications = useCallback(async () => {
    const res = await requestPushNotificationPermissionAndSubscribe();
    setPermission(res.permission);
    await refreshPushStatus();

    if (res.permission === 'granted') {
      updatePrefs({ enabled: true });
      onNotifyToast(
        'Notificaciones push activadas',
        'confirmed',
        res.swActive
          ? 'El Service Worker alertará al personal cuando llegue un nuevo pedido.'
          : 'Alertas del navegador habilitadas para nuevos pedidos.'
      );
      return true;
    }

    if (res.permission === 'denied') {
      onNotifyToast(
        'Permiso de notificaciones bloqueado',
        'error',
        'Habilita las notificaciones para este sitio en la configuración de tu navegador.'
      );
      return false;
    }

    onNotifyToast(
      'Notificaciones no disponibles',
      'info',
      'Tu navegador actual no soporta notificaciones push.'
    );
    return false;
  }, [onNotifyToast, refreshPushStatus, updatePrefs]);

  const toggleEnabled = useCallback(async () => {
    if (!prefs.enabled) {
      if (permission !== 'granted') {
        await enableNotifications();
      } else {
        updatePrefs({ enabled: true });
        onNotifyToast('Alertas de pedidos activadas.', 'confirmed');
      }
      return;
    }
    updatePrefs({ enabled: false });
    onNotifyToast('Alertas de pedidos pausadas en esta terminal.', 'info');
  }, [enableNotifications, onNotifyToast, permission, prefs.enabled, updatePrefs]);

  const setStationFilter = useCallback(
    (stationFilter: NotificationStationFilter) => {
      updatePrefs({ stationFilter });
    },
    [updatePrefs]
  );

  const toggleSound = useCallback(() => {
    updatePrefs({ soundEnabled: !prefs.soundEnabled });
  }, [prefs.soundEnabled, updatePrefs]);

  const sendTestAlert = useCallback(async () => {
    let activePerm = getBrowserNotificationPermission();
    if (activePerm === 'default') {
      const ok = await enableNotifications();
      if (!ok) return;
      activePerm = getBrowserNotificationPermission();
    }
    if (activePerm !== 'granted') {
      onNotifyToast(
        'Activa los permisos de notificación primero.',
        'error',
        'El navegador tiene bloqueadas las notificaciones.'
      );
      return;
    }
    if (prefs.soundEnabled) {
      playOrderAlertChime(false);
    }
    const res = await sendTestOrderPushNotification();
    if (res.ok) {
      onNotifyToast(
        'Alerta push de prueba enviada',
        'confirmed',
        res.deliveredVia === 'sw-message' || res.deliveredVia === 'sw-registration'
          ? 'Emitida correctamente mediante el Service Worker.'
          : 'Emitida mediante notificación del navegador.'
      );
    } else {
      onNotifyToast('No se pudo emitir la notificación push.', 'error');
    }
  }, [enableNotifications, onNotifyToast, prefs.soundEnabled]);

  return {
    prefs,
    permission,
    swStatus,
    isNotificationsActive: prefs.enabled && permission === 'granted',
    enableNotifications,
    toggleEnabled,
    toggleSound,
    setStationFilter,
    sendTestAlert,
    refreshPushStatus,
  };
}
