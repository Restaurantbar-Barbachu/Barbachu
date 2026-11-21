import React, { useState, useEffect } from 'react';
import { Delete, Lock, ShieldCheck, X } from 'lucide-react';
import type { PosUser } from '../types';

interface IosPinPadModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  users?: PosUser[];
  selectedUser?: PosUser | null;
  onSelectUser?: (user: PosUser) => void;
  onValidatePin: (pin: string, selectedUser: PosUser | null) => boolean | Promise<boolean>;
  onSuccess?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  allowCancel?: boolean;
}

export const IosPinPadModal: React.FC<IosPinPadModalProps> = ({
  open,
  title,
  subtitle,
  users,
  selectedUser = null,
  onSelectUser,
  onValidatePin,
  onSuccess,
  onCancel,
  cancelLabel = 'Cancelar',
  allowCancel = true,
}) => {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setErrorMsg(null);
      setVerifying(false);
    }
  }, [open, selectedUser?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (verifying) return;
      if (e.key >= '0' && e.key <= '9') {
        void handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        setPin((p) => p.slice(0, -1));
        setErrorMsg(null);
      } else if (e.key === 'Escape' && allowCancel && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pin, selectedUser, allowCancel, verifying]);

  if (!open) return null;

  const handleDigit = async (digit: string) => {
    if (verifying || pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);

    if (nextPin.length === 4) {
      setVerifying(true);
      try {
        const ok = await onValidatePin(nextPin, selectedUser);
        if (ok) {
          setPin('');
          setErrorMsg(null);
          if (onSuccess) onSuccess();
        } else {
          setErrorMsg('PIN incorrecto. Intenta nuevamente.');
          setTimeout(() => setPin(''), 260);
        }
      } catch {
        setErrorMsg('Error al verificar PIN.');
        setTimeout(() => setPin(''), 260);
      } finally {
        setVerifying(false);
      }
    }
  };

  const handleBackspace = () => {
    if (verifying) return;
    setPin((p) => p.slice(0, -1));
    setErrorMsg(null);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4">
      <div className="w-full max-w-[368px] ios-glass-modal p-6 space-y-5 text-center">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-full bg-[#c8a84b]/15 border border-[#c8a84b]/35 flex items-center justify-center text-[#e8d090]">
            {users ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </div>
          {allowCancel && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label={cancelLabel}
              className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-11 h-11" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">{title}</h3>
          {subtitle && (
            <p className="text-xs text-[rgba(240,230,211,0.68)] leading-relaxed">{subtitle}</p>
          )}
        </div>

        {users && users.length > 0 && onSelectUser && (
          <div className="text-left">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-[rgba(240,230,211,0.6)] mb-1.5 pl-1">
              Operador
            </label>
            <select
              value={selectedUser?.id || ''}
              disabled={verifying}
              onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value);
                if (u) {
                  onSelectUser(u);
                  setPin('');
                  setErrorMsg(null);
                }
              }}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-sm text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role.toUpperCase()} ({u.area || 'General'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 4-dot passcode indicator */}
        <div className="py-2 flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-4">
            {[0, 1, 2, 3].map((idx) => {
              const filled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 border ${
                    errorMsg
                      ? 'border-[#e05252] bg-[#e05252]/40 scale-105'
                      : filled
                      ? 'border-[#e8d090] bg-[#e8d090] scale-110 shadow-[0_0_12px_rgba(232,208,144,0.45)]'
                      : 'border-white/30 bg-transparent'
                  }`}
                />
              );
            })}
          </div>
          {verifying ? (
            <p className="text-xs font-semibold text-[#e8d090] min-h-[16px]">Verificando con Firestore...</p>
          ) : errorMsg ? (
            <p className="text-xs font-semibold text-[#e05252] min-h-[16px]">{errorMsg}</p>
          ) : (
            <p className="text-[11px] text-[rgba(240,230,211,0.5)] min-h-[16px]">
              Ingresa tu código de 4 dígitos
            </p>
          )}
        </div>

        {/* Tactile iOS numeric keypad */}
        <div className="grid grid-cols-3 gap-3 justify-items-center max-w-[244px] mx-auto">
          {keys.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={verifying}
              onClick={() => void handleDigit(digit)}
              className="w-16 h-16 rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 disabled:opacity-50 border border-white/10 text-2xl font-medium text-white tabular-nums flex items-center justify-center transition-all"
            >
              {digit}
            </button>
          ))}

          {allowCancel && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="w-16 h-16 rounded-full text-xs font-semibold text-[rgba(240,230,211,0.72)] hover:text-white active:scale-95 flex items-center justify-center transition-all"
            >
              {cancelLabel}
            </button>
          ) : (
            <div className="w-16 h-16" />
          )}

          <button
            type="button"
            disabled={verifying}
            onClick={() => void handleDigit('0')}
            className="w-16 h-16 rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 disabled:opacity-50 border border-white/10 text-2xl font-medium text-white tabular-nums flex items-center justify-center transition-all"
          >
            0
          </button>

          <button
            type="button"
            disabled={verifying}
            onClick={handleBackspace}
            aria-label="Borrar dígito"
            className="w-16 h-16 rounded-full text-[rgba(240,230,211,0.72)] hover:text-white active:scale-95 disabled:opacity-50 flex items-center justify-center transition-all"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
