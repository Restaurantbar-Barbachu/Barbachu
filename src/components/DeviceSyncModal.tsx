import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { DeviceConfig, DeviceStation, TerminalSession } from '../types';
import { DEVICE_STATION_NAMES } from '../storage';
import { measureCloudLatencyMs } from '../lib/firebase';

interface DeviceSyncModalProps {
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
  openOrdersCount: number;
  deviceId: string;
  deviceConfig?: DeviceConfig;
  terminals: TerminalSession[];
  lastSyncMs: number | null;
  isAdmin: boolean;
  onUpdateDeviceStation: (station: DeviceStation, stationName: string, autoLockMinutes: number) => void;
  onForceSyncHeartbeat?: () => Promise<void>;
  onRemoveTerminal?: (deviceId: string) => Promise<void>;
}

function formatRelativeAgo(isoOrMs: string | number | null): string {
  if (!isoOrMs) return 'Sincronizando...';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts)) return 'Reciente';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return 'En vivo';
  if (diffSec < 60) return `Hace ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin}m`;
  return `Hace ${Math.floor(diffMin / 60)}h`;
}

function isTerminalActiveRecently(terminal: TerminalSession): boolean {
  if (!terminal.online) return false;
  const ts = Date.parse(terminal.lastSeenAt);
  if (!Number.isFinite(ts)) return terminal.online;
  return Date.now() - ts < 3 * 60 * 1000;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  open,
  onClose,
  isOnline,
  openOrdersCount,
  deviceId,
  deviceConfig,
  terminals,
  lastSyncMs,
  isAdmin,
  onUpdateDeviceStation,
  onForceSyncHeartbeat,
  onRemoveTerminal,
}) => {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [probing, setProbing] = useState<boolean>(false);
  const [pairStation, setPairStation] = useState<DeviceStation>(deviceConfig?.station || 'comandero');
  const [copiedPairUrl, setCopiedPairUrl] = useState<boolean>(false);

  const probeLatency = useCallback(async () => {
    if (!isOnline) {
      setLatencyMs(null);
      return;
    }
    setProbing(true);
    try {
      const measured = await measureCloudLatencyMs();
      setLatencyMs(measured);
      if (onForceSyncHeartbeat) {
        await onForceSyncHeartbeat();
      }
    } finally {
      setProbing(false);
    }
  }, [isOnline, onForceSyncHeartbeat]);

  useEffect(() => {
    if (open) {
      void probeLatency();
    }
  }, [open, probeLatency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const currentStation = deviceConfig?.station || 'todos';
  const currentAutoLock = deviceConfig?.autoLockMinutes || 0;

  const pairingUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?view=pos&station=${pairStation}`
      : `/?view=pos&station=${pairStation}`;

  const activeTerminalsCount = terminals.filter(isTerminalActiveRecently).length;

  const latencyLabel = !isOnline
    ? 'Sin conexión (Caché local)'
    : probing
    ? 'Midiendo y sincronizando...'
    : latencyMs === null
    ? 'Caché local activa'
    : `${latencyMs} ms (${latencyMs < 150 ? 'Óptima' : latencyMs < 400 ? 'Estable' : 'Lenta'})`;

  const latencyColorClass = !isOnline
    ? 'text-[#f2a93b]'
    : latencyMs === null
    ? 'text-[#e8d090]'
    : latencyMs < 150
    ? 'text-[#25d366]'
    : latencyMs < 400
    ? 'text-[#e8d090]'
    : 'text-[#e05252]';

  const handleCopyPairingLink = async () => {
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopiedPairUrl(true);
      setTimeout(() => setCopiedPairUrl(false), 2000);
    } catch {
      setCopiedPairUrl(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] ios-scrim flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="ios-glass-modal w-full max-w-2xl rounded-[28px] p-5 sm:p-6 space-y-5 text-left my-auto max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${
                isOnline
                  ? 'bg-[#122822] text-[#25d366] border-[#25d366]/40'
                  : 'bg-[#f2a93b]/15 text-[#f2a93b] border-[#f2a93b]/40'
              }`}
            >
              {isOnline ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-lg sm:text-xl text-white tracking-[-0.02em] truncate">
                Conectividad de Dispositivos & Sync Cloud
              </h3>
              <p className={`text-xs font-mono mt-0.5 truncate ${isOnline ? 'text-[#25d366]' : 'text-[#f2a93b]'}`}>
                {isOnline
                  ? `● En línea · ${activeTerminalsCount || 1} terminal(es) activa(s) · ${formatRelativeAgo(lastSyncMs)}`
                  : '● Offline · Cola local activa (sincroniza al reconectar)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Telemetry Cards */}
        <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider">
              Diagnóstico de Red en Tiempo Real
            </h4>
            <button
              type="button"
              onClick={() => void probeLatency()}
              disabled={!isOnline || probing}
              className="min-h-[32px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-[#e8d090] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
              Sincronizar ahora
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-[11px] text-[#8b92a0]">Latencia Cloud</div>
              <div className={`font-mono font-bold text-sm mt-0.5 truncate ${latencyColorClass}`}>
                {latencyLabel}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-[11px] text-[#8b92a0]">Cuentas Abiertas</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">{openOrdersCount} activas</div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-[11px] text-[#8b92a0]">ID de Terminal</div>
              <div className="font-mono font-bold text-[#e8d090] text-sm mt-0.5 truncate">{deviceId}</div>
            </div>
          </div>
        </div>

        {/* Station & Auto-Lock Configuration for Current Device */}
        <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-3">
          <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider">
            Estación y Bloqueo de Este Dispositivo
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[rgba(240,230,211,0.68)] mb-1.5">
                Rol / Estación Asignada
              </label>
              <select
                id="device-station-select-modal"
                aria-label="Rol o Estación de este Dispositivo"
                value={currentStation}
                onChange={(e) => {
                  const val = e.target.value as DeviceStation;
                  onUpdateDeviceStation(val, DEVICE_STATION_NAMES[val], currentAutoLock);
                }}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#16191f] border border-white/10 text-white font-semibold text-xs focus:outline-none focus:border-[#c8a84b]"
              >
                <option value="todos">Terminal Central / Multi-Área (Todos los permisos)</option>
                <option value="comandero">Comandero Portátil / Salón (Toma de órdenes)</option>
                <option value="caja">Caja Principal / Cobros (Tickets y Turnos)</option>
                <option value="cocina">Monitor KDS Cocina (Sólo alimentos)</option>
                <option value="barra">Monitor KDS Barra (Sólo bebidas y coctelería)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[rgba(240,230,211,0.68)] mb-1.5">
                Auto-Bloqueo PIN
              </label>
              <select
                aria-label="Tiempo de auto-bloqueo PIN"
                value={currentAutoLock}
                onChange={(e) => {
                  const mins = Math.max(0, Number(e.target.value) || 0);
                  onUpdateDeviceStation(currentStation, DEVICE_STATION_NAMES[currentStation], mins);
                }}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#16191f] border border-white/10 text-white font-semibold text-xs focus:outline-none focus:border-[#c8a84b]"
              >
                <option value={0}>Desactivado</option>
                <option value={2}>2 minutos</option>
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-[rgba(240,230,211,0.62)]">
            Estación activa: <strong className="text-white">{deviceConfig?.stationName || DEVICE_STATION_NAMES.todos}</strong>. Cambiar la estación optimiza automáticamente la vista y los filtros de cocina/barra.
          </p>
        </div>

        {/* Live Employee Terminals Directory */}
        <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider inline-flex items-center gap-1.5">
              <MonitorSmartphone className="w-4 h-4" /> Dispositivos de Empleados Conectados ({terminals.length})
            </h4>
          </div>

          {terminals.length === 0 ? (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-[rgba(240,230,211,0.65)]">
              Esta terminal está registrando su latido de presencia en Firestore. Los demás dispositivos del equipo aparecerán aquí en tiempo real en cuanto inicien sesión.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {terminals.map((term) => {
                const isThisDevice = term.deviceId === deviceId;
                const activeNow = isTerminalActiveRecently(term);
                return (
                  <div
                    key={term.deviceId}
                    className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                      isThisDevice
                        ? 'bg-[#173c34]/35 border-[#25d366]/45'
                        : 'bg-white/[0.03] border-white/10'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            activeNow ? 'bg-[#25d366]' : 'bg-[#8b92a0]'
                          }`}
                        />
                        <span className="font-bold text-white truncate">{term.staffName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase font-bold text-[#e8d090]">
                          {term.staffRole}
                        </span>
                        {isThisDevice && (
                          <span className="px-1.5 py-0.5 rounded bg-[#25d366]/20 text-[10px] font-bold text-[#25d366]">
                            Este dispositivo
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[rgba(240,230,211,0.68)] truncate">
                        {term.stationName} · {term.platform} · {formatRelativeAgo(term.lastSeenAt)}
                      </div>
                    </div>

                    {isAdmin && !isThisDevice && onRemoveTerminal && (
                      <button
                        type="button"
                        onClick={() => void onRemoveTerminal(term.deviceId)}
                        title="Quitar registro de terminal inactiva"
                        aria-label={`Quitar terminal ${term.deviceId}`}
                        className="w-8 h-8 rounded-lg bg-[#e05252]/15 hover:bg-[#e05252] text-[#e05252] hover:text-white flex items-center justify-center transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* QR & Direct Pairing Link for Employee Devices */}
        <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider inline-flex items-center gap-1.5">
              <QrCode className="w-4 h-4" /> Vincular Nuevo Dispositivo de Empleado
            </h4>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="p-2.5 rounded-2xl bg-white shrink-0">
              <QRCodeSVG value={pairingUrl} size={116} level="M" />
            </div>
            <div className="flex-1 min-w-0 space-y-2.5 w-full">
              <div>
                <label className="block text-[11px] text-[rgba(240,230,211,0.68)] mb-1">
                  Preconfigurar estación al escanear QR o abrir enlace:
                </label>
                <select
                  value={pairStation}
                  onChange={(e) => setPairStation(e.target.value as DeviceStation)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#16191f] border border-white/10 text-xs text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                >
                  <option value="comandero">Comandero Portátil / Salón (Meseros)</option>
                  <option value="cocina">Monitor KDS Cocina</option>
                  <option value="barra">Monitor KDS Barra</option>
                  <option value="caja">Caja Principal / Cobros</option>
                  <option value="todos">Terminal Central / Gerencia</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={pairingUrl}
                  aria-label="Enlace de vinculación de terminal"
                  className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-[11px] font-mono text-[rgba(240,230,211,0.8)]"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyPairingLink()}
                  className="min-h-[38px] px-3 rounded-xl bg-[#173c34] hover:bg-[#28584c] text-[#25d366] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                >
                  {copiedPairUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPairUrl ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Cerrar Panel de Conectividad
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
