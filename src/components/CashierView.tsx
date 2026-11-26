import React, { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowDownCircle, ArrowUpCircle, FileText, X } from 'lucide-react';
import { closeAndPayOrder, hasUnservedItems, lineTotalCents, locationLabel, uid } from '../core';
import {
  fsCloseAndPayOrder,
  fsCloseShift,
  fsOpenNewShift,
  fsRecordCashDrawerMovement,
} from '../lib/firestoreSync';
import { createInitialShift, formatMoney } from '../storage';
import type {
  AuditLogEntry,
  FullPosState,
  ItemStatus,
  Order,
  PaymentMethod,
  Sale,
} from '../types';

interface CashierViewProps {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  openOrders: Order[];
  payOrderId: string;
  setPayOrderId: React.Dispatch<React.SetStateAction<string>>;
  currentOrderId: string | null;
  onClearActiveDraft: () => void;
  canCollectPayment: boolean;
  canCashCut: boolean;
  firebaseUser: User | null;
  authorizedEmails: string[];
  hasMoreSales: boolean;
  loadingMoreSales: boolean;
  onLoadMoreSales: () => void;
  onExportSalesCsv: () => void;
  onReopenLastSale: () => void;
  onOpenPreCheck: (order: Order) => void;
  onOpenReceipt: React.Dispatch<React.SetStateAction<Sale | null>>;
  onNotify: (msg: string) => void;
}

function formatCashierError(err: unknown, fallback = 'Sin permisos'): string {
  const raw = err instanceof Error ? err.message : fallback;
  return raw.replace(
    /^(ORDER_CLOSED|ALREADY_PAID|SHIFT_CLOSED|SHIFT_ALREADY_CLOSED|SHIFT_ALREADY_OPEN|SHIFT_NOT_FOUND|INSUFFICIENT_CASH):/,
    ''
  );
}

export const CashierView: React.FC<CashierViewProps> = React.memo(
  ({
    state,
    setState,
    openOrders,
    payOrderId,
    setPayOrderId,
    currentOrderId,
    onClearActiveDraft,
    canCollectPayment,
    canCashCut,
    firebaseUser,
    authorizedEmails,
    hasMoreSales,
    loadingMoreSales,
    onLoadMoreSales,
    onExportSalesCsv,
    onReopenLastSale,
    onOpenPreCheck,
    onOpenReceipt,
    onNotify,
  }) => {
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
    const [cashTendered, setCashTendered] = useState<string>('');
    const [mixedCashInput, setMixedCashInput] = useState<string>('');
    const [physicalCashCount, setPhysicalCashCount] = useState<string>('');
    const [openingCashInput, setOpeningCashInput] = useState<string>('0');
    const [confirmUnservedPay, setConfirmUnservedPay] = useState<boolean>(false);

    // Cash Drawer Movement Modal
    const [drawerModalType, setDrawerModalType] = useState<'deposito' | 'retiro' | null>(null);
    const [drawerAmount, setDrawerAmount] = useState<string>('');
    const [drawerReason, setDrawerReason] = useState<string>('');

    const stateRef = useRef(state);
    stateRef.current = state;

    const selectedPayOrder = useMemo(
      () => state.orders.find((o) => o.id === payOrderId) || null,
      [state.orders, payOrderId]
    );

    const reversedSales = useMemo(() => state.sales.slice().reverse(), [state.sales]);

    const executePaymentConfirmed = (order: Order, forceMarkServed: boolean) => {
      if (!canCollectPayment) {
        onNotify('Tu rol no tiene permiso para cobrar cuentas.');
        return;
      }
      const latest = stateRef.current;
      if (!latest.shift.isOpen) {
        onNotify('El turno de caja está cerrado. Abre un nuevo turno antes de cobrar.');
        return;
      }

      const workingOrder: Order = forceMarkServed
        ? {
            ...order,
            items: order.items.map((it) => ({ ...it, itemStatus: 'served' as ItemStatus })),
            status: 'served',
          }
        : order;

      const preparedState: FullPosState = forceMarkServed
        ? {
            ...latest,
            orders: latest.orders.map((o) => (o.id === order.id ? workingOrder : o)),
          }
        : latest;

      const cashVal = Number(cashTendered) ? Math.round(Number(cashTendered) * 100) : undefined;
      const change =
        cashVal && cashVal > workingOrder.totalCents ? cashVal - workingOrder.totalCents : 0;
      const mixedCashCents =
        paymentMethod === 'mixto'
          ? Math.min(
              workingOrder.totalCents,
              Math.max(0, Math.round((Number(mixedCashInput) || 0) * 100))
            )
          : undefined;

      try {
        const nextState = closeAndPayOrder(preparedState, {
          orderId: workingOrder.id,
          paymentMethod,
          amountCash: paymentMethod === 'efectivo' ? workingOrder.totalCents : mixedCashCents,
          amountCard:
            paymentMethod === 'tarjeta'
              ? workingOrder.totalCents
              : paymentMethod === 'mixto'
              ? workingOrder.totalCents - (mixedCashCents || 0)
              : undefined,
        });

        setState(nextState);
        if (currentOrderId === workingOrder.id) {
          onClearActiveDraft();
        }
        const closedOrder = nextState.orders.find((o) => o.id === workingOrder.id);
        const sale = nextState.sales[nextState.sales.length - 1];
        const latestAudit = nextState.audit[nextState.audit.length - 1];

        if (firebaseUser && closedOrder && sale && latestAudit) {
          void fsCloseAndPayOrder(
            closedOrder,
            { ...sale, changeGiven: change },
            nextState.shift,
            firebaseUser,
            authorizedEmails,
            latestAudit
          )
            .then(({ assignedReceipt }) => {
              if (assignedReceipt && assignedReceipt !== sale.receipt) {
                setState((prev) => ({
                  ...prev,
                  sales: prev.sales.map((s) =>
                    s.id === sale.id ? { ...s, receipt: assignedReceipt } : s
                  ),
                }));
                onOpenReceipt((prev) =>
                  prev && prev.id === sale.id ? { ...prev, receipt: assignedReceipt } : prev
                );
              }
            })
            .catch((err) => {
              const rawMsg = err instanceof Error ? err.message : 'Sin permisos';
              if (rawMsg.startsWith('ALREADY_PAID:')) {
                onNotify(rawMsg.replace('ALREADY_PAID:', ''));
              } else {
                onNotify(`Error guardando cobro en Firestore: ${formatCashierError(err)}`);
              }
            });
        }

        onOpenReceipt(sale);
        setPayOrderId('');
        setCashTendered('');
        setMixedCashInput('');
        setConfirmUnservedPay(false);
        onNotify(
          `Cobro registrado con éxito. Folio: ${sale.receipt}${
            change > 0 ? ` · Cambio: ${formatMoney(change)}` : ''
          }`
        );
      } catch (err: unknown) {
        onNotify(err instanceof Error ? err.message : 'Error al procesar cobro');
      }
    };

    const handleExecutePayment = (e: React.FormEvent) => {
      e.preventDefault();
      if (!canCollectPayment) {
        onNotify('Tu rol no tiene autorización para registrar cobros.');
        return;
      }
      if (!state.shift.isOpen) {
        onNotify('El turno de caja está cerrado. Abre un nuevo turno antes de cobrar.');
        return;
      }
      if (!payOrderId) {
        onNotify('Selecciona una cuenta pendiente de cobro.');
        return;
      }
      const order = state.orders.find((o) => o.id === payOrderId && !o.paid);
      if (!order) {
        onNotify('Cuenta no encontrada o ya está cobrada.');
        return;
      }
      if (hasUnservedItems(order) && !confirmUnservedPay) {
        setConfirmUnservedPay(true);
        onNotify('Esta cuenta aún tiene productos pendientes de marcar como servidos.');
        return;
      }
      executePaymentConfirmed(order, true);
    };

    const handlePerformCashCut = () => {
      if (!canCashCut) {
        onNotify('Tu rol no tiene autorización para realizar cortes de caja.');
        return;
      }
      const counted = Number(physicalCashCount);
      if (!Number.isFinite(counted) || counted < 0) {
        onNotify('Ingresa el monto del conteo físico de efectivo en caja.');
        return;
      }
      const actualCents = Math.round(counted * 100);
      const expected = state.shift.expectedCashCents;
      const diff = actualCents - expected;

      const shift = {
        ...state.shift,
        isOpen: false,
        closedAt: new Date().toISOString(),
        actualCashCents: actualCents,
        differenceCents: diff,
        closedByUser: state.activeUser.name,
      };

      let detail = `Corte de turno completado. Esperado: ${formatMoney(expected)} · Conteo físico: ${formatMoney(actualCents)}`;
      if (diff === 0) detail += ' (Caja cuadrada exacta)';
      else if (diff > 0) detail += ` (Sobrante: +${formatMoney(diff)})`;
      else detail += ` (Faltante: ${formatMoney(diff)})`;

      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: new Date().toISOString(),
        user: state.activeUser.name,
        action: 'Corte de caja Z',
        detail,
      };

      setState((prev) => ({
        ...prev,
        shift,
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsCloseShift(shift, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          onNotify(`Error cerrando turno en Firestore: ${formatCashierError(err)}`);
        });
      }

      onNotify(`Corte de turno completado: ${detail}`);
    };

    const handleOpenNewShift = () => {
      if (!canCashCut) {
        onNotify('Tu rol no tiene autorización para abrir turnos de caja.');
        return;
      }
      const openingPesos = Number(openingCashInput);
      if (!Number.isFinite(openingPesos) || openingPesos < 0) {
        onNotify('Ingresa un fondo inicial válido ($0.00 o mayor).');
        return;
      }
      const initialCents = Math.round(openingPesos * 100);
      const newShift = createInitialShift(initialCents);
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: new Date().toISOString(),
        user: state.activeUser.name,
        action: 'Apertura de turno de caja',
        detail: `Nuevo turno ${newShift.id} abierto con fondo inicial ${formatMoney(newShift.initialCashCents)}`,
      };
      setState((prev) => ({
        ...prev,
        shift: newShift,
        audit: [...prev.audit, auditEntry],
      }));
      setPhysicalCashCount('');
      setOpeningCashInput('0');
      if (firebaseUser) {
        void fsOpenNewShift(newShift, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          onNotify(`Error abriendo turno en Firestore: ${formatCashierError(err)}`);
        });
      }
      onNotify(`Nuevo turno abierto (${newShift.id}) con fondo ${formatMoney(initialCents)}.`);
    };

    const handleSaveDrawerMovement = (e: React.FormEvent) => {
      e.preventDefault();
      if (!canCashCut) {
        onNotify('Tu rol no tiene autorización para registrar movimientos de efectivo.');
        return;
      }
      if (!drawerModalType) return;
      if (!state.shift.isOpen) {
        onNotify('Abre un turno de caja antes de registrar ingresos o retiros.');
        return;
      }
      const pesos = Number(drawerAmount);
      if (!Number.isFinite(pesos) || pesos <= 0) {
        onNotify('Ingresa un monto mayor a $0.00.');
        return;
      }
      const cents = Math.round(pesos * 100);
      if (drawerModalType === 'retiro' && cents > state.shift.expectedCashCents) {
        onNotify('El retiro no puede superar el efectivo esperado en cajón.');
        return;
      }
      const movementType = drawerModalType;
      const reason =
        drawerReason.trim() ||
        (movementType === 'deposito' ? 'Ingreso de cambio a caja' : 'Retiro parcial de caja');
      const updatedShift = {
        ...state.shift,
        depositosCents: (state.shift.depositosCents || 0) + (movementType === 'deposito' ? cents : 0),
        retirosCents: (state.shift.retirosCents || 0) + (movementType === 'retiro' ? cents : 0),
        expectedCashCents:
          movementType === 'deposito'
            ? state.shift.expectedCashCents + cents
            : Math.max(0, state.shift.expectedCashCents - cents),
      };
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: new Date().toISOString(),
        user: state.activeUser.name,
        action: movementType === 'deposito' ? 'Ingreso de efectivo' : 'Retiro de efectivo',
        detail: `${movementType === 'deposito' ? '+' : '-'}${formatMoney(cents)} · Nuevo esperado: ${formatMoney(updatedShift.expectedCashCents)}`,
        reason,
      };

      setState((prev) => ({
        ...prev,
        shift: updatedShift,
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsRecordCashDrawerMovement(
          { shiftId: state.shift.id, type: movementType, amountCents: cents },
          firebaseUser,
          authorizedEmails,
          auditEntry
        )
          .then(({ expectedCashCents }) => {
            if (typeof expectedCashCents === 'number') {
              setState((prev) => ({
                ...prev,
                shift: { ...prev.shift, expectedCashCents },
              }));
            }
          })
          .catch((err) => {
            onNotify(`Error registrando movimiento de caja: ${formatCashierError(err)}`);
          });
      }

      setDrawerModalType(null);
      setDrawerAmount('');
      setDrawerReason('');
      onNotify(`${movementType === 'deposito' ? 'Ingreso' : 'Retiro'} de ${formatMoney(cents)} registrado.`);
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Payment Processing Form */}
        <div className="lg:col-span-6 p-6 ios-glass-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
              Módulo de Cobro en Caja
            </h3>
            <span className={`text-xs font-bold ${state.shift.isOpen ? 'text-[#25d366]' : 'text-[#e5a43b]'}`}>
              {state.shift.isOpen ? 'Turno Abierto' : 'Turno Cerrado'}
            </span>
          </div>

          <form onSubmit={handleExecutePayment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#8b92a0] mb-1">
                Seleccionar Cuenta Pendiente de Cobro
              </label>
              <select
                value={payOrderId}
                onChange={(e) => {
                  setPayOrderId(e.target.value);
                  setConfirmUnservedPay(false);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-sm text-white focus:outline-none focus:border-[#d4af37]"
              >
                <option value="">-- Elige una cuenta por cobrar --</option>
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    Cuenta #{o.number} · {locationLabel(o.service, o.location)} · {formatMoney(o.totalCents)} (
                    {o.items.length} productos)
                  </option>
                ))}
              </select>
            </div>

            {/* Summary of chosen order */}
            {selectedPayOrder && (
              <div className="p-4 rounded-xl bg-[#1e222b] border border-[#2b303c] space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold text-white text-sm">
                  <span>
                    Cuenta #{selectedPayOrder.number} (
                    {locationLabel(selectedPayOrder.service, selectedPayOrder.location)})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenPreCheck(selectedPayOrder)}
                      className="px-2.5 py-1 rounded-lg bg-[#16191f] border border-white/15 text-[#eed889] text-xs font-semibold hover:border-[#d4af37] inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" /> Pre-cuenta
                    </button>
                    <span className="font-mono text-[#eed889] tabular-nums">
                      {formatMoney(selectedPayOrder.totalCents)}
                    </span>
                  </div>
                </div>
                <div className="text-[#8b92a0]">Mesero responsable: {selectedPayOrder.waiter}</div>
                <div className="pt-2 border-t border-[#2b303c] space-y-1">
                  {selectedPayOrder.items.map((i, idx) => {
                    const mods = i.modifiers || i.modificadores || [];
                    return (
                      <div key={i.lineId || idx} className="flex justify-between gap-2 text-[#8b92a0]">
                        <div className="min-w-0">
                          <span>
                            {i.qty} × {i.name}{' '}
                            <span className="text-xs uppercase text-[#d4af37]">
                              [{i.itemStatus || 'pending'}]
                            </span>
                          </span>
                          {mods.length > 0 && (
                            <div className="text-[11px] text-[#eed889]/85 truncate">
                              Extras:{' '}
                              {mods
                                .map(
                                  (m) =>
                                    `${m.name}${m.priceCents > 0 ? ` (+${formatMoney(m.priceCents)})` : ''}`
                                )
                                .join(', ')}
                            </div>
                          )}
                        </div>
                        <span className="tabular-nums shrink-0">{formatMoney(lineTotalCents(i))}</span>
                      </div>
                    );
                  })}
                </div>
                {selectedPayOrder.discountCents > 0 && (
                  <div className="flex justify-between text-[#25d366] font-bold pt-1 tabular-nums">
                    <span>Descuento aplicado</span>
                    <span>- {formatMoney(selectedPayOrder.discountCents)}</span>
                  </div>
                )}
              </div>
            )}

            {confirmUnservedPay && payOrderId && (
              <div className="p-3.5 rounded-xl bg-[#e5a43b]/15 border border-[#e5a43b]/50 text-xs space-y-2">
                <div className="font-bold text-[#eed889]">
                  ⚠️ Hay productos en esta orden aún no marcados como servidos en KDS.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const ord = state.orders.find((o) => o.id === payOrderId && !o.paid);
                      if (ord) executePaymentConfirmed(ord, true);
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#25d366] text-black font-bold"
                  >
                    ✓ Marcar Servido y Cobrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnservedPay(false)}
                    className="px-3 py-2 rounded-lg bg-[#16191f] text-[#8b92a0]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Payment method selector */}
            <div>
              <label className="block text-xs font-semibold text-[#8b92a0] mb-2">Método de Pago</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all border ${
                      paymentMethod === m
                        ? 'bg-[#d4af37] text-black border-[#d4af37]'
                        : 'bg-[#1e222b] text-[#8b92a0] border-[#2b303c] hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Change Calculator */}
            {paymentMethod === 'efectivo' && selectedPayOrder && (
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2">
                <label className="block text-xs font-semibold text-[#8b92a0]">
                  Efectivo Entregado por Cliente ($)
                </label>
                <input
                  type="number"
                  placeholder="Monto entregado (ej. 200, 500)"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white text-sm font-mono"
                />
                <div className="flex gap-1.5 pt-1">
                  {[50, 100, 200, 500, 1000].map((billete) => (
                    <button
                      key={billete}
                      type="button"
                      onClick={() => setCashTendered(String(billete))}
                      className="px-2 py-1 rounded-lg text-xs bg-[#16191f] border border-[#2b303c] text-[#8b92a0] hover:text-white"
                    >
                      ${billete}
                    </button>
                  ))}
                </div>

                {(() => {
                  const val = Number(cashTendered);
                  if (!val) return null;
                  const change = val * 100 - selectedPayOrder.totalCents;
                  return (
                    <div className="pt-2 border-t border-[#2b303c] flex justify-between font-mono font-bold text-sm">
                      <span className="text-[#8b92a0]">Cambio a Devolver:</span>
                      <span className={change >= 0 ? 'text-[#25d366]' : 'text-[#e05252]'}>
                        {change >= 0 ? formatMoney(change) : `Faltan ${formatMoney(-change)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Mixed Payment Split Input */}
            {paymentMethod === 'mixto' && selectedPayOrder && (
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2 text-xs">
                <label className="block font-semibold text-[#8b92a0]">
                  Monto pagado en EFECTIVO ($ MXN) — el resto va a Tarjeta
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={mixedCashInput}
                  onChange={(e) => setMixedCashInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white text-sm font-mono"
                />
                {(() => {
                  const cashCents = Math.min(
                    selectedPayOrder.totalCents,
                    Math.max(0, Math.round((Number(mixedCashInput) || 0) * 100))
                  );
                  const cardCents = selectedPayOrder.totalCents - cashCents;
                  return (
                    <div className="flex justify-between font-mono font-bold pt-1 text-[#eed889]">
                      <span>Efectivo: {formatMoney(cashCents)}</span>
                      <span>Tarjeta: {formatMoney(cardCents)}</span>
                    </div>
                  );
                })()}
              </div>
            )}

            <button
              type="submit"
              disabled={!payOrderId}
              className="w-full py-3.5 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-sm transition-all shadow-lg disabled:opacity-40"
            >
              Confirmar Cobro e Imprimir Ticket
            </button>
          </form>

          {/* Operations: Reopen last sale & Export CSV */}
          <div className="pt-4 border-t border-[#2b303c] flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={onExportSalesCsv}
              className="flex-1 py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold"
            >
              📥 Exportar Ventas (CSV)
            </button>
            <button
              type="button"
              onClick={onReopenLastSale}
              className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-[#eed889] font-bold"
            >
              🔄 Reabrir Última Venta
            </button>
          </div>
        </div>

        {/* Cash Shift Summary & Cut (Corte de Turno) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="p-6 ios-glass-card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Arqueo y Corte de Caja
              </h3>
              <span className="text-xs text-[#8b92a0] tabular-nums">
                Turno iniciado:{' '}
                {new Date(state.shift.openedAt).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs tabular-nums">
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                <div className="text-[#8b92a0]">Fondo Inicial</div>
                <div className="text-base font-mono font-bold text-white mt-1">
                  {formatMoney(state.shift.initialCashCents)}
                </div>
              </div>
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                <div className="text-[#8b92a0]">Ventas Efectivo</div>
                <div className="text-base font-mono font-bold text-[#25d366] mt-1">
                  {formatMoney(state.shift.cashSalesCents)}
                </div>
              </div>
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                <div className="text-[#8b92a0]">Ventas Tarjeta</div>
                <div className="text-base font-mono font-bold text-[#eed889] mt-1">
                  {formatMoney(state.shift.cardSalesCents)}
                </div>
              </div>
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                <div className="text-[#8b92a0]">Depósitos (+)</div>
                <div className="text-base font-mono font-bold text-[#25d366] mt-1">
                  +{formatMoney(state.shift.depositosCents || 0)}
                </div>
              </div>
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                <div className="text-[#8b92a0]">Retiros (-)</div>
                <div className="text-base font-mono font-bold text-[#e05252] mt-1">
                  -{formatMoney(state.shift.retirosCents || 0)}
                </div>
              </div>
              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#d4af37]/40">
                <div className="text-[#eed889] font-semibold">Esperado en Cajón</div>
                <div className="text-base font-mono font-bold text-[#eed889] mt-1">
                  {formatMoney(state.shift.expectedCashCents)}
                </div>
              </div>
            </div>

            {/* Cash Drawer Movements (Ingreso / Retiro) */}
            {state.shift.isOpen && (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerModalType('deposito');
                    setDrawerAmount('');
                    setDrawerReason('');
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-[#122822] hover:bg-[#173c34] border border-[#25d366]/40 text-[#25d366] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowDownCircle className="w-4 h-4" /> Ingreso de Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerModalType('retiro');
                    setDrawerAmount('');
                    setDrawerReason('');
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-[#e05252]/10 hover:bg-[#e05252]/20 border border-[#e05252]/40 text-[#e05252] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUpCircle className="w-4 h-4" /> Retiro de Efectivo
                </button>
              </div>
            )}

            {/* Physical count input / Open New Shift with real cash fund */}
            <div className="p-4 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-3 text-xs">
              {state.shift.isOpen ? (
                <>
                  <label className="block text-[#8b92a0] font-semibold">
                    Conteo Físico de Dinero en Cajón ($ MXN)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={physicalCashCount}
                      onChange={(e) => setPhysicalCashCount(e.target.value)}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={handlePerformCashCut}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#d4af37] text-black font-bold hover:bg-[#eed889]"
                    >
                      Hacer Corte Z
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-[#eed889] font-semibold">
                    Fondo Inicial de Caja ($ MXN) para Nuevo Turno
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={openingCashInput}
                      onChange={(e) => setOpeningCashInput(e.target.value)}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={handleOpenNewShift}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#25d366] text-black font-bold hover:bg-[#20b858]"
                    >
                      Abrir Nuevo Turno
                    </button>
                  </div>
                </>
              )}
              {state.shift.closedAt && (
                <div className="text-xs pt-1">
                  <span className="text-[#8b92a0]">Último corte registrado: </span>
                  <span className="font-bold text-white tabular-nums">
                    Diferencia: {formatMoney(state.shift.differenceCents || 0)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sales history of current shift (paginated) */}
          <div className="p-6 ios-glass-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">
                Historial de Ventas
              </h3>
              <span className="text-xs text-[rgba(240,230,211,0.58)] tabular-nums">
                {state.sales.length} cobros
              </span>
            </div>
            {reversedSales.length === 0 ? (
              <div className="py-8 text-center text-[#8b92a0] text-xs">
                Sin ventas cobradas aún en este turno.
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {reversedSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{sale.receipt}</span>
                        <span className="text-[#8b92a0]">
                          · {locationLabel(sale.service, sale.location)}
                        </span>
                      </div>
                      <div className="text-xs text-[#8b92a0]">
                        {sale.paymentMethod.toUpperCase()} · {sale.waiter} ·{' '}
                        {new Date(sale.paidAt).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-[#eed889]">
                        {formatMoney(sale.totalCents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(sale)}
                        className="px-2 py-1 rounded bg-[#16191f] border border-[#2b303c] text-[#8b92a0] hover:text-white"
                      >
                        Ticket
                      </button>
                    </div>
                  </div>
                ))}
                {hasMoreSales && (
                  <button
                    type="button"
                    disabled={loadingMoreSales}
                    onClick={onLoadMoreSales}
                    className="w-full min-h-[38px] py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-[#e8d090] disabled:opacity-50 transition-colors"
                  >
                    {loadingMoreSales ? 'Cargando cobros...' : 'Cargar cobros anteriores'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cash Drawer Movement Modal (Ingreso / Retiro) */}
        {drawerModalType && (
          <div
            className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">
                  {drawerModalType === 'deposito'
                    ? 'Ingreso de Efectivo a Caja'
                    : 'Retiro Parcial de Caja'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDrawerModalType(null)}
                  aria-label="Cerrar modal de movimiento de caja"
                  className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveDrawerMovement} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Monto ($ MXN) *
                  </label>
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="0.00"
                    value={drawerAmount}
                    onChange={(e) => setDrawerAmount(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Concepto / Motivo
                  </label>
                  <input
                    type="text"
                    placeholder={
                      drawerModalType === 'deposito'
                        ? 'Ej. Cambio en monedas / fondo adicional'
                        : 'Ej. Pago a proveedor / corte parcial'
                    }
                    value={drawerReason}
                    onChange={(e) => setDrawerReason(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDrawerModalType(null)}
                    className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] font-semibold text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`min-h-[44px] px-5 py-2 rounded-2xl font-bold transition-colors ${
                      drawerModalType === 'deposito'
                        ? 'bg-[#25d366] text-[#0a0a0b]'
                        : 'bg-[#e05252] text-white'
                    }`}
                  >
                    Registrar {drawerModalType === 'deposito' ? 'Ingreso' : 'Retiro'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }
);

CashierView.displayName = 'CashierView';
