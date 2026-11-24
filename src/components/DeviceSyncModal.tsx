import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { DeviceConfig, DeviceStation } from '../types';
import { measureCloudLatencyMs } from '../lib/firebase';

interface DeviceSyncModalProps {
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
  openOrdersCount: number;
  deviceConfig?: DeviceConfig;
  onUpdateDeviceStation: (station: DeviceStation, stationName: string, autoLockMinutes: number) => void;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  open,
  onClose,
  isOnline,
  openOrdersCount,
  deviceConfig,
  onUpdateDeviceStation,
}) => {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [probing, setProbing] = useState<boolean>(false);

  const probeLatency = useCallback(async () => {
    if (!isOnline) {
      setLatencyMs(null);
      return;
    }
    setProbing(true);
    try {
      const measured = await measureCloudLatencyMs();
      setLatencyMs(measured);
    } finally {
      setProbing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    if (open) {
      void probeLatency();
    }
  }, [open, probeLatency]);

  if (!open) return null;

  const latencyLabel = !isOnline
    ? 'Sin conexión (Modo local)'
    : probing
    ? 'Midiendo...'
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

  return (
    <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="ios-glass-modal w-full max-w-lg rounded-[28px] p-6 space-y-5 text-left max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                isOnline
                  ? 'bg-[#122822] text-[#25d366] border-[#25d366]/40'
                  : 'bg-[#f2a93b]/15 text-[#f2a93b] border-[#f2a93b]/40'
              }`}
            >
              {isOnline ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                Conexión de Dispositivos & Cloud Sync
              </h3>
              <p className={`text-xs font-mono mt-0.5 ${isOnline ? 'text-[#25d366]' : 'text-[#f2a93b]'}`}>
                {isOnline ? '● En línea · Firestore Realtime Active' : '● Offline · Caché local / cola en espera'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-3">
            <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider">Configuración de esta Terminal</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[rgba(240,230,211,0.68)] mb-1.5">Rol / Estación de este Dispositivo</label>
                <select
                  id="device-station-select-modal"
                  aria-label="Rol o Estación de este Dispositivo"
                  value={deviceConfig?.station || 'todos'}
                  onChange={(e) => {
                    const val = e.target.value as DeviceStation;
                    const nameMap: Record<DeviceStation, string> = {
                      todos: 'Terminal Central / Multi-Área',
                      comandero: 'Comandero Portátil / Salón',
                      caja: 'Caja Principal / Cobros',
                      cocina: 'Monitor KDS Cocina',
                      barra: 'Monitor KDS Barra',
                    };
                    onUpdateDeviceStation(val, nameMap[val], deviceConfig?.autoLockMinutes || 0);
                  }}
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-2xl bg-[#16191f] border border-white/10 text-white font-semibold text-xs focus:outline-none focus:border-[#c8a84b]"
                >
                  <option value="todos">Terminal Central / Multi-Área (Todos los permisos)</option>
                  <option value="comandero">Comandero Portátil / Salón (Toma de órdenes)</option>
                  <option value="caja">Caja Principal / Cobros (Tickets y Turnos)</option>
                  <option value="cocina">Monitor KDS Cocina (Sólo alimentos)</option>
                  <option value="barra">Monitor KDS Barra (Sólo bebidas y coctelería)</option>
                </select>
              </div>
              <div className="text-xs text-[rgba(240,230,211,0.6)]">
                Estación actual: <strong className="text-white">{deviceConfig?.stationName || 'Terminal Central'}</strong>. Todas las comandas, KDS de cocina/barra y cortes de caja se sincronizan entre dispositivos conectados en la nube.
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-[#c8a84b] uppercase tracking-wider">Estado de Sincronización Multi-Dispositivo</h4>
              <button
                type="button"
                onClick={() => void probeLatency()}
                disabled={!isOnline || probing}
                className="text-xs text-[#e8d090] hover:text-white disabled:opacity-40 inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                Medir
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-xs text-[#8b92a0]">Latencia Cloud</div>
                <div className={`font-mono font-bold text-sm mt-0.5 ${latencyColorClass}`}>
                  {latencyLabel}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-xs text-[#8b92a0]">Cuentas Abiertas</div>
                <div className="font-mono font-bold text-white text-sm mt-0.5">{openOrdersCount} activas</div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Cerrar Panel de Conexión
          </button>
        </div>
      </div>
    </div>
  );
};
