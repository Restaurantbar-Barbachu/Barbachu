import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import type { OrderToastEvent, ToastVariant } from '../lib/securePosApi';

interface ToastNotificationProps {
  toast: OrderToastEvent | null;
  onDismiss: () => void;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    container: string;
    iconWrap: string;
    titleColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  confirmed: {
    container: 'bg-[#122822]/95 border-[#25d366]/40 text-[#f0e6d3]',
    iconWrap: 'bg-[#25d366]/15 text-[#25d366]',
    titleColor: 'text-white',
    Icon: CheckCircle2,
  },
  info: {
    container: 'bg-[#161618]/95 border-[#c8a84b]/40 text-[#f0e6d3]',
    iconWrap: 'bg-[#c8a84b]/15 text-[#e8d090]',
    titleColor: 'text-white',
    Icon: Info,
  },
  pending: {
    container: 'bg-[#161618]/95 border-white/20 text-[#f0e6d3]',
    iconWrap: 'bg-white/10 text-[#e8d090]',
    titleColor: 'text-white',
    Icon: Loader2,
  },
  error: {
    container: 'bg-[#261416]/95 border-[#e05252]/45 text-[#f0e6d3]',
    iconWrap: 'bg-[#e05252]/15 text-[#e05252]',
    titleColor: 'text-white',
    Icon: AlertTriangle,
  },
};

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  toast,
  onDismiss,
}) => {
  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-live={toast?.variant === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-50 pointer-events-none flex justify-end max-w-sm w-[calc(100vw-2rem)]"
      >
        <AnimatePresence mode="wait">
          {toast && (() => {
            const style = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
            const Icon = style.Icon;
            return (
              <motion.div
                key={toast.id}
                role={toast.variant === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`pointer-events-auto w-full rounded-2xl border backdrop-blur-xl px-4 py-3 shadow-2xl flex items-start gap-3 ${style.container}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${style.iconWrap}`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      toast.variant === 'pending' ? 'animate-spin' : ''
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className={`text-xs font-bold leading-snug tabular-nums ${style.titleColor}`}>
                    {toast.title}
                  </p>
                  {toast.detail && (
                    <p className="text-[11px] text-[rgba(240,230,211,0.72)] mt-0.5 leading-snug tabular-nums">
                      {toast.detail}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Cerrar notificación"
                  className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] text-[rgba(240,230,211,0.75)] hover:text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
};
