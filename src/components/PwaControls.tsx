import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePwaStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-2xl bg-[#161618]/95 backdrop-blur-xl border border-[#e5a43b]/50 px-3.5 py-2 text-xs font-semibold text-[#eed889] shadow-2xl"
    >
      <WifiOff className="w-4 h-4 text-[#e5a43b] shrink-0" />
      <span>Modo Offline activo · Caché local disponible</span>
    </div>
  );
};

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[38px] px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-[#e8d090] border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0'
            : 'w-full min-h-[44px] py-2 px-3 rounded-2xl border border-[#c8a84b]/35 bg-[#1a1b1f] text-[#e8d090] text-xs font-bold hover:bg-[#c8a84b]/15 transition-colors flex items-center justify-center gap-2 whitespace-nowrap'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[38px] px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-[#e8d090] border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0'
              : 'w-full min-h-[44px] py-2 px-3 rounded-2xl border border-white/15 bg-white/[0.04] text-[#e8d090] text-xs font-semibold hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2 whitespace-nowrap'
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center ios-scrim p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm ios-glass-modal p-6 space-y-4 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 id="ios-install-title" className="font-serif text-lg font-bold text-white">
                  Instalar Barbachu en iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Cerrar guía de instalación"
                  className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#f0e6d3]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-[rgba(240,230,211,0.82)] leading-relaxed list-decimal list-inside">
                <li>
                  Toca el botón <strong className="text-white">Compartir</strong> en la barra de Safari.
                </li>
                <li>
                  Desliza hacia abajo y selecciona <strong className="text-[#e8d090]">Agregar a inicio</strong>.
                </li>
                <li>
                  Confirma en <strong className="text-white">Agregar</strong> para usar Barbachu como app independiente.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
