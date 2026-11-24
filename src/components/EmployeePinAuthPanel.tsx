import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookOpen,
  CheckCircle2,
  Delete,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import type { PosUser, RolePermissions, UserRole } from '../types';
import {
  fsFetchStaffUsersSnapshot,
  fsVerifyEmployeePinFromFirestore,
} from '../lib/firestoreSync';
import { sharedPinRateLimiter } from '../utils/pinSecurity';
import { BarbachuLogo } from './BarbachuLogo';

export type PosViewRoute =
  | 'dashboard'
  | 'pos'
  | 'tables'
  | 'kitchen'
  | 'cash'
  | 'inventory'
  | 'reports'
  | 'admin';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  caja: 'Caja y Cobros',
  mesero: 'Mesero / Piso',
  cocina: 'Cocina & Barra',
};

export function describeRoleCapabilities(
  role: UserRole,
  perms: RolePermissions
): string[] {
  if (role === 'admin') {
    return [
      'Resumen y Reportes',
      'Comandero y Mesas',
      'KDS Cocina/Barra',
      'Caja y Cortes Z',
      'Inventario',
      'Gestión de Empleados',
    ];
  }
  const caps: string[] = [];
  if (perms.canTakeOrders) caps.push('Comandero y Mesas');
  if (perms.canAccessKds || role === 'mesero') caps.push('Cocina & Barra (KDS)');
  if (perms.canCollectPayment) caps.push('Cobros en Caja');
  if (perms.canCashShiftCut) caps.push('Arqueo y Corte Z');
  if (perms.canApplyDiscount) caps.push('Descuentos');
  if (perms.canViewReports) caps.push('Reportes de Venta');
  if (perms.canEditCatalog) caps.push('Catálogo e Inventario');
  return caps.length > 0 ? caps : ['Resumen Operativo'];
}

export function defaultViewForRole(
  role: UserRole,
  perms: RolePermissions
): PosViewRoute {
  if (role === 'admin') return 'dashboard';
  if (role === 'cocina') return 'kitchen';
  if (role === 'caja') return perms.canCollectPayment ? 'cash' : 'pos';
  if (role === 'mesero') return perms.canTakeOrders ? 'tables' : 'kitchen';
  return 'dashboard';
}

interface EmployeePinAuthPanelProps {
  users: PosUser[];
  activeUser: PosUser;
  permissions: Record<UserRole, RolePermissions>;
  firebaseUser: User;
  isFirebaseAdmin: boolean;
  authorizedEmails: string[];
  mode: 'gate' | 'switch' | 'unlock';
  onAuthenticated: (verifiedUser: PosUser) => void;
  onSyncUsers?: (freshUsers: PosUser[]) => void;
  onCancel?: () => void;
  onSwitchToMenu?: () => void;
  onSignOutGoogle?: () => void;
}

export const EmployeePinAuthPanel: React.FC<EmployeePinAuthPanelProps> = ({
  users,
  activeUser,
  permissions,
  firebaseUser,
  isFirebaseAdmin,
  authorizedEmails,
  mode,
  onAuthenticated,
  onSyncUsers,
  onCancel,
  onSwitchToMenu,
  onSignOutGoogle,
}) => {
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRole>('todos');
  const [selectedId, setSelectedId] = useState<string>(() => activeUser?.id || users[0]?.id || '');
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lockRemainingSec, setLockRemainingSec] = useState<number>(0);

  const filteredUsers = useMemo(() => {
    const list = users || [];
    if (roleFilter === 'todos') return list;
    return list.filter((u) => u.role === roleFilter);
  }, [users, roleFilter]);

  const selectedEmployee = useMemo(() => {
    return (
      users.find((u) => u.id === selectedId) ||
      filteredUsers[0] ||
      users[0] ||
      activeUser
    );
  }, [users, filteredUsers, selectedId, activeUser]);

  const rlScope = useMemo(
    () => `gate:${selectedEmployee?.id || 'default'}`,
    [selectedEmployee?.id]
  );

  useEffect(() => {
    if (!selectedId && users.length > 0) {
      setSelectedId(activeUser?.id || users[0].id);
    }
  }, [users, selectedId, activeUser?.id]);

  useEffect(() => {
    const status = sharedPinRateLimiter.check(rlScope);
    setLockRemainingSec(status.blocked ? Math.ceil(status.remainingMs / 1000) : 0);
  }, [rlScope]);

  useEffect(() => {
    if (lockRemainingSec <= 0) return;
    const timer = window.setInterval(() => {
      const status = sharedPinRateLimiter.check(rlScope);
      setLockRemainingSec(status.blocked ? Math.ceil(status.remainingMs / 1000) : 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [lockRemainingSec, rlScope]);

  const selectedCapabilities = useMemo(() => {
    if (!selectedEmployee) return [];
    const rolePerms = permissions[selectedEmployee.role] || permissions.mesero;
    return describeRoleCapabilities(selectedEmployee.role, rolePerms);
  }, [selectedEmployee, permissions]);

  const handleRefreshFromFirestore = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMsg(null);
    try {
      const fresh = await fsFetchStaffUsersSnapshot(firebaseUser, isFirebaseAdmin);
      if (fresh.length > 0 && onSyncUsers) {
        onSyncUsers(fresh);
      }
    } catch {
      setErrorMsg('No se pudo actualizar la lista desde Firestore.');
    } finally {
      setRefreshing(false);
    }
  };

  const isLocked = lockRemainingSec > 0;

  const submitPinAttempt = async (candidatePin: string) => {
    if (!selectedEmployee || verifying) return;
    const preCheck = sharedPinRateLimiter.check(rlScope);
    if (preCheck.blocked) {
      const sec = Math.ceil(preCheck.remainingMs / 1000);
      setLockRemainingSec(sec);
      setErrorMsg(`Demasiados intentos. Espera ${sec}s.`);
      setPin('');
      return;
    }

    setVerifying(true);
    setErrorMsg(null);
    try {
      const res = await fsVerifyEmployeePinFromFirestore(
        selectedEmployee.id,
        candidatePin,
        firebaseUser,
        authorizedEmails
      );
      if (res.ok && res.user) {
        sharedPinRateLimiter.reset(rlScope);
        setLockRemainingSec(0);
        setPin('');
        setErrorMsg(null);
        onAuthenticated(res.user);
      } else {
        const nextStatus = sharedPinRateLimiter.recordFailure(rlScope);
        if (nextStatus.blocked) {
          const sec = Math.ceil(nextStatus.remainingMs / 1000);
          setLockRemainingSec(sec);
          setErrorMsg(`Demasiados intentos fallidos. Bloqueado por ${sec}s.`);
        } else {
          setErrorMsg(
            `${res.error || 'PIN incorrecto.'} (${nextStatus.attemptsLeft} intento${nextStatus.attemptsLeft === 1 ? '' : 's'} restante${nextStatus.attemptsLeft === 1 ? '' : 's'})`
          );
        }
        setTimeout(() => setPin(''), 260);
      }
    } catch {
      setErrorMsg('Error al validar el PIN en Firestore.');
      setTimeout(() => setPin(''), 260);
    } finally {
      setVerifying(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (verifying || isLocked || !selectedEmployee || pin.length >= 4) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);
    if (nextPin.length === 4) {
      void submitPinAttempt(nextPin);
    }
  };

  const handleBackspace = () => {
    if (verifying || isLocked) return;
    setPin((p) => p.slice(0, -1));
    setErrorMsg(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (verifying) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' && mode === 'switch' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selectedEmployee?.id, verifying, isLocked, mode]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const headerTitle =
    mode === 'unlock'
      ? 'Terminal Bloqueada'
      : mode === 'switch'
      ? 'Cambiar Empleado Activo'
      : 'Acceso de Empleados por PIN';

  const headerSubtitle =
    mode === 'unlock'
      ? 'Selecciona tu perfil e ingresa tu PIN personal para reanudar tus funciones.'
      : 'Selecciona tu perfil de Firestore e ingresa tu PIN de 4 dígitos para desbloquear tu área.';

  return (
    <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full max-w-4xl ios-glass-modal p-5 sm:p-7 my-auto space-y-5">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#173c34] border border-[#c8a84b]/40 flex items-center justify-center shrink-0">
              {mode === 'unlock' ? (
                <Lock className="w-5 h-5 text-[#e8d090]" />
              ) : (
                <BarbachuLogo className="w-7 h-auto" />
              )}
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl sm:text-2xl text-white tracking-[-0.02em]">
                {headerTitle}
              </h2>
              <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5">
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRefreshFromFirestore()}
              disabled={refreshing}
              title="Sincronizar empleados desde Firestore"
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#f0e6d3] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            {mode === 'switch' && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cerrar"
                className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Firestore Employee Directory */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            {/* Role Filter Segmented Bar */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 overflow-x-auto">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'admin', label: 'Admin' },
                  { id: 'caja', label: 'Caja' },
                  { id: 'mesero', label: 'Mesero' },
                  { id: 'cocina', label: 'Cocina' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    roleFilter === tab.id
                      ? 'bg-[#c8a84b] text-[#0a0a0b]'
                      : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Staff Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {filteredUsers.length === 0 ? (
                <div className="sm:col-span-2 py-12 text-center text-xs text-[rgba(240,230,211,0.58)] ios-glass-card">
                  No hay empleados registrados en este rol dentro de Firestore.
                </div>
              ) : (
                filteredUsers.map((emp) => {
                  const isSelected = selectedEmployee?.id === emp.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      disabled={verifying}
                      onClick={() => {
                        setSelectedId(emp.id);
                        setPin('');
                        setErrorMsg(null);
                      }}
                      className={`min-h-[68px] p-3.5 rounded-[18px] border text-left flex items-center gap-3 transition-all active:scale-[0.985] ${
                        isSelected
                          ? 'bg-[#173c34]/80 border-[#c8a84b] shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full font-bold text-xs flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#e8d090]'
                            : 'bg-[#1f1f22] text-[#e8d090] border-white/15'
                        }`}
                      >
                        {emp.avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white truncate flex items-center justify-between gap-2">
                          <span className="truncate">{emp.name}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-[#25d366] shrink-0" />}
                        </div>
                        <div className="text-xs text-[rgba(240,230,211,0.65)] truncate mt-0.5">
                          {ROLE_LABELS[emp.role] || emp.role} · {emp.area || 'General'}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Employee Capabilities Preview */}
            {selectedEmployee && (
              <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/60 border border-white/10 space-y-1.5">
                <div className="text-xs uppercase tracking-[0.06em] font-semibold text-[#e8d090] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Funciones habilitadas para {selectedEmployee.name.split(' ')[0]}
                </div>
                <p className="text-xs text-[rgba(240,230,211,0.72)] leading-relaxed">
                  {selectedCapabilities.join(' · ')}
                </p>
                {selectedEmployee.mustChangePin && (
                  <p className="text-xs font-semibold text-[#f2a93b] pt-0.5">
                    PIN inicial activo — deberás configurar un PIN personal al ingresar.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: iOS Tactile 4-Digit Keypad */}
          <div className="lg:col-span-5 p-5 rounded-[22px] bg-[#0a0a0b]/55 border border-white/10 flex flex-col justify-between space-y-4 text-center">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] font-semibold text-[#c8a84b]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Validación Firestore
              </div>
              <div className="text-base font-bold text-white truncate">
                {selectedEmployee ? selectedEmployee.name : 'Selecciona empleado'}
              </div>
              <div className="text-xs text-[rgba(240,230,211,0.58)]">
                {selectedEmployee ? `${ROLE_LABELS[selectedEmployee.role]} · ${selectedEmployee.area}` : 'Sin perfil'}
              </div>
            </div>

            {/* 4-dot passcode indicator */}
            <div className="py-1 flex flex-col items-center gap-2">
              <div className="flex items-center justify-center gap-4">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = idx < pin.length;
                  return (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 border ${
                        errorMsg || isLocked
                          ? 'border-[#e05252] bg-[#e05252]/40 scale-105'
                          : filled
                          ? 'border-[#e8d090] bg-[#e8d090] scale-110 shadow-[0_0_12px_rgba(232,208,144,0.45)]'
                          : 'border-white/30 bg-transparent'
                      }`}
                    />
                  );
                })}
              </div>
              {isLocked ? (
                <p className="text-xs font-semibold text-[#e05252] min-h-[18px]">
                  Bloqueado temporalmente · Espera {lockRemainingSec}s
                </p>
              ) : verifying ? (
                <p className="text-xs font-semibold text-[#e8d090] min-h-[18px]">
                  Verificando PIN en Firestore...
                </p>
              ) : errorMsg ? (
                <p className="text-xs font-semibold text-[#e05252] min-h-[18px]">
                  {errorMsg}
                </p>
              ) : (
                <p className="text-xs text-[rgba(240,230,211,0.52)] min-h-[18px]">
                  Ingresa tu PIN de 4 dígitos
                </p>
              )}
            </div>

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-2.5 justify-items-center max-w-[232px] mx-auto">
              {keys.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={verifying || isLocked || !selectedEmployee}
                  onClick={() => handleDigit(digit)}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/[0.08] hover:bg-white/[0.16] active:scale-95 disabled:opacity-40 border border-white/10 text-xl sm:text-2xl font-medium text-white tabular-nums flex items-center justify-center transition-all"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                disabled={verifying || isLocked}
                onClick={() => {
                  setPin('');
                  setErrorMsg(null);
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white active:scale-95 disabled:opacity-40 flex items-center justify-center transition-all"
              >
                Limpiar
              </button>

              <button
                type="button"
                disabled={verifying || isLocked || !selectedEmployee}
                onClick={() => handleDigit('0')}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/[0.08] hover:bg-white/[0.16] active:scale-95 disabled:opacity-40 border border-white/10 text-xl sm:text-2xl font-medium text-white tabular-nums flex items-center justify-center transition-all"
              >
                0
              </button>

              <button
                type="button"
                disabled={verifying || isLocked}
                onClick={handleBackspace}
                aria-label="Borrar dígito"
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full text-[rgba(240,230,211,0.72)] hover:text-white active:scale-95 disabled:opacity-40 flex items-center justify-center transition-all"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer links for terminal management */}
        {(onSwitchToMenu || onSignOutGoogle) && (
          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-[rgba(240,230,211,0.58)] truncate">
              Terminal enlazada: <strong className="text-white">{firebaseUser.email}</strong>
            </span>
            <div className="flex items-center gap-2">
              {onSwitchToMenu && (
                <button
                  type="button"
                  onClick={onSwitchToMenu}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[#e8d090] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Menú Público
                </button>
              )}
              {onSignOutGoogle && (
                <button
                  type="button"
                  onClick={onSignOutGoogle}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-2xl bg-[#e05252]/10 hover:bg-[#e05252]/20 border border-[#e05252]/30 text-[#e05252] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" /> Cerrar Terminal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
