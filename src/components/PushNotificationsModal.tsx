import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, CheckCircle2, Send, Volume2, VolumeX, X } from 'lucide-react';
import type {
  BrowserNotificationPermissionState,
  NotificationStationFilter,
  PushNotificationPrefs,
} from '../lib/pushNotifications';

interface PushNotificationsModalProps {
  open: boolean;
  onClose: () => void;
  prefs: PushNotificationPrefs;
  permission: BrowserNotificationPermissionState;
  swStatus: {
    swRegistered: boolean;
    pushSupported: boolean;
    pushSubscribed: boolean;
    vapidConfigured: boolean;
  };
  onEnableNotifications: () => Promise<boolean>;
  onToggleEnabled: () => Promise<void>;
  onToggleSound: () => void;
  onChangeStationFilter: (station: NotificationStationFilter) => void;
  onSendTestAlert: () => Promise<void>;
}

export const PushNotificationsModal: React.FC<PushNotificationsModalProps> = ({
  open,
  onClose,
  prefs,
  permission,
  swStatus,
  onEnableNotifications,
  onToggleEnabled,
  onToggleSound,
  onChangeStationFilter,
  onSendTestAlert,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const isActive = prefs.enabled && permission === 'granted';

  const permissionLabel =
    permission === 'granted'
      ? 'Concedido'
      : permission === 'denied'
      ? 'Bloqueado en navegador'
      : permission === 'default'
      ? 'Pendiente de autorización'
      : 'No soportado';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] ios-scrim flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-modal-title"
      onClick={onClose}
    >
      <div
        className="ios-glass-modal w-full max-w-md rounded-[28px] p-5 sm:p-6 space-y-4 text-left my-auto max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0 ${
                isActive
                  ? 'bg-[#122822] text-[#25d366] border-[#25d366]/40'
                  : 'bg-white/[0.06] text-[#e8d090] border-white/15'
              }`}
            >
              {isActive ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3
                id="push-modal-title"
                className="font-serif font-bold text-lg text-white tracking-[-0.02em]"
              >
                Alertas Push de Pedidos
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Notificaciones del Service Worker cuando llega una nueva comanda al POS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel de notificaciones"
            className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.75)] hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Summary */}
        <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[rgba(240,230,211,0.65)]">Permiso del navegador</span>
            <span
              className={`font-bold ${
                permission === 'granted'
                  ? 'text-[#25d366]'
                  : permission === 'denied'
                  ? 'text-[#e05252]'
                  : 'text-[#e8d090]'
              }`}
            >
              {permissionLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[rgba(240,230,211,0.65)]">Service Worker</span>
            <span className={`font-bold ${swStatus.swRegistered ? 'text-[#25d366]' : 'text-[#e8d090]'}`}>
              {swStatus.swRegistered ? 'Activo (/sw.js)' : 'Canal local / En espera'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[rgba(240,230,211,0.65)]">Suscripción Push</span>
            <span className="font-semibold text-white">
              {swStatus.pushSubscribed
                ? 'VAPID Activa'
                : swStatus.pushSupported
                ? 'Canal SW en tiempo real'
                : 'No compatible'}
            </span>
          </div>
        </div>

        {/* Permission CTA if not granted */}
        {permission !== 'granted' && (
          <div className="p-3.5 rounded-2xl bg-[#173c34]/45 border border-[#c8a84b]/40 space-y-2.5 text-xs">
            <p className="text-[rgba(240,230,211,0.85)] leading-relaxed">
              {permission === 'denied'
                ? 'Las notificaciones están bloqueadas en este dispositivo. Actívalas en los permisos del navegador para recibir alertas de nuevos pedidos.'
                : 'Autoriza las notificaciones para avisar al personal de cocina, barra y caja al llegar un nuevo pedido.'}
            </p>
            {permission === 'default' && (
              <button
                type="button"
                onClick={() => void onEnableNotifications()}
                className="w-full min-h-[42px] rounded-xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Activar Permiso de Notificaciones
              </button>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-bold text-white">Recibir alertas en esta terminal</div>
              <div className="text-[11px] text-[rgba(240,230,211,0.62)]">
                Notifica automáticamente cada comanda nueva recibida
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onToggleEnabled()}
              className={`min-h-[38px] px-3.5 rounded-xl font-bold border transition-colors shrink-0 ${
                prefs.enabled
                  ? 'bg-[#173c34] border-[#25d366]/50 text-[#25d366]'
                  : 'bg-white/[0.06] border-white/15 text-[rgba(240,230,211,0.72)]'
              }`}
            >
              {prefs.enabled ? 'Activado' : 'Pausado'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <div className="flex items-center gap-2.5">
              {prefs.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#e8d090] shrink-0" />
              ) : (
                <VolumeX className="w-4 h-4 text-[rgba(240,230,211,0.5)] shrink-0" />
              )}
              <div>
                <div className="font-bold text-white">Timbre sonoro de cocina</div>
                <div className="text-[11px] text-[rgba(240,230,211,0.62)]">
                  Reproduce un tono al recibir un pedido nuevo
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              className={`min-h-[38px] px-3.5 rounded-xl font-bold border transition-colors shrink-0 ${
                prefs.soundEnabled
                  ? 'bg-[#c8a84b]/20 border-[#c8a84b] text-[#e8d090]'
                  : 'bg-white/[0.06] border-white/15 text-[rgba(240,230,211,0.72)]'
              }`}
            >
              {prefs.soundEnabled ? 'Con sonido' : 'Silencio'}
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
            <label className="block font-bold text-white">Estación de pedidos a notificar</label>
            <select
              aria-label="Filtrar alertas por estación"
              value={prefs.stationFilter}
              onChange={(e) => onChangeStationFilter(e.target.value as NotificationStationFilter)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0a0a0b] border border-white/15 text-xs text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
            >
              <option value="all">Todas las áreas (Cocina, Barra y Caja)</option>
              <option value="cocina">Solo comandas con platillos de Cocina</option>
              <option value="barra">Solo comandas con bebidas de Barra</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={() => void onSendTestAlert()}
            className="flex-1 min-h-[44px] px-4 rounded-2xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-[#e8d090] font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Enviar Alerta de Prueba
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
