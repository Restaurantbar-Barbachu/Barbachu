import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  canActOnItem,
  canTransitionItemStatus,
  classifyProductStation,
  computeOrderStatusFromItems,
  createOrUpdateOrder,
  locationLabel,
  locationOptions,
  mergeOrdersIntoTarget,
  splitOrderItemByTarget,
  subtotalCents,
  totalCents,
  uid,
} from '../core';
import {
  createInitialSecurePosState,
  securePosApi,
  type OrderToastEvent,
  type SecurePosMutationOptions,
  type SecurePosState,
  type ToastVariant,
} from '../lib/securePosApi';
import { formatMoney } from '../storage';
import type {
  AuditLogEntry,
  CustomerDelivery,
  FullPosState,
  ItemStatus,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  Priority,
  RolePermissions,
  ServiceType,
  SoftProduct,
  UserRole,
} from '../types';
import type { PosViewRoute } from '../components/EmployeePinAuthPanel';

interface UseOrderManagerParams {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  activeRole: UserRole;
  activePerms: RolePermissions;
  isAdminRole: boolean;
  canApplyDiscount: boolean;
  canCancelOrders: boolean;
  kitchenStation: 'todas' | 'cocina' | 'barra';
  firebaseUser: User | null;
  isFirebaseAdmin: boolean;
  authorizedEmails: string[];
  notify: (msg: string, variant?: ToastVariant, detail?: string) => void;
  onConfirmedToast?: (toast: OrderToastEvent) => void;
  setView: React.Dispatch<React.SetStateAction<PosViewRoute>>;
  setModalReason: React.Dispatch<
    React.SetStateAction<{ title: string; onConfirm: (reason: string) => void } | null>
  >;
  setPromptModal: React.Dispatch<
    React.SetStateAction<{
      title: string;
      label: string;
      defaultValue?: string;
      onConfirm: (val: string) => void;
    } | null>
  >;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  setItemNoteModal: React.Dispatch<
    React.SetStateAction<{ targetId: string; name: string } | null>
  >;
  setItemNoteValue: React.Dispatch<React.SetStateAction<string>>;
  setActivePreCheckOrder: React.Dispatch<React.SetStateAction<Order | null>>;
}

export function useOrderManager({
  state,
  setState,
  activeRole,
  activePerms,
  isAdminRole,
  canApplyDiscount,
  canCancelOrders,
  kitchenStation,
  firebaseUser,
  isFirebaseAdmin,
  authorizedEmails,
  notify,
  onConfirmedToast,
  setView,
  setModalReason,
  setPromptModal,
  setPromptValue,
  setItemNoteModal,
  setItemNoteValue,
  setActivePreCheckOrder,
}: UseOrderManagerParams) {
  const [currentService, setCurrentService] = useState<ServiceType>('mesa');
  const [currentTable, setCurrentTable] = useState<string>('1');
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [waiter, setWaiter] = useState<string>(() => state.activeUser?.name || 'Operador');
  const [generalNote, setGeneralNote] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deliveryData, setDeliveryData] = useState<CustomerDelivery>({
    name: '',
    phone: '',
    address: '',
    reference: '',
  });

  // Server transaction status tracked strictly via securePosApi ('idle' | 'pending' | 'confirmed' | 'error')
  const [orderSyncState, setOrderSyncState] = useState<SecurePosState>(
    createInitialSecurePosState
  );
  const isOrderMutating = orderSyncState.status === 'pending';

  // Transfer / Merge Modal State
  const [moveTableModalOpen, setMoveTableModalOpen] = useState<boolean>(false);
  const [moveTargetService, setMoveTargetService] = useState<ServiceType>('mesa');
  const [moveTargetLocation, setMoveTargetLocation] = useState<string>('1');

  const stateRef = useRef(state);
  stateRef.current = state;

  const isMutatingRef = useRef(isOrderMutating);
  isMutatingRef.current = isOrderMutating;

  const secureApiOptions = useMemo<SecurePosMutationOptions>(
    () => ({
      firebaseUser,
      authorizedEmails,
      onStatusChange: setOrderSyncState,
      onConfirmedToast,
    }),
    [authorizedEmails, firebaseUser, onConfirmedToast]
  );

  // Keep waiter synced when active user switches (unless editing an open loaded order)
  useEffect(() => {
    if (!currentOrderId && state.activeUser?.name) {
      setWaiter(state.activeUser.name);
    }
  }, [state.activeUser?.id, state.activeUser?.name, currentOrderId]);

  // Detect external closure/payment of currently loaded order on another terminal
  useEffect(() => {
    if (!currentOrderId) return;
    const found = state.orders.find((o) => o.id === currentOrderId);
    if (!found || found.status === 'closed') {
      setCurrentOrderId(null);
      setCart([]);
      setGeneralNote('');
      notify('La cuenta cargada fue cobrada o cerrada en otra terminal.', 'info');
    }
  }, [state.orders, currentOrderId, notify]);

  const openOrders = useMemo(() => {
    return state.orders.filter((o) => o.status !== 'closed');
  }, [state.orders]);

  const openOrdersByLocation = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of openOrders) {
      const key = `${o.service}::${String(o.location)}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(o);
      } else {
        map.set(key, [o]);
      }
    }
    return map;
  }, [openOrders]);

  const currentLocOrders = useMemo(() => {
    return openOrdersByLocation.get(`${currentService}::${String(currentTable)}`) || [];
  }, [openOrdersByLocation, currentService, currentTable]);

  const selectedOrder = useMemo(() => {
    return state.orders.find((o) => o.id === currentOrderId && o.status !== 'closed') || null;
  }, [state.orders, currentOrderId]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.key, (map.get(item.key) || 0) + item.qty);
    }
    return map;
  }, [cart]);

  const totalOccupiedTables = useMemo(() => {
    const locs = new Set(openOrders.map((o) => `${o.service}-${o.location}`));
    return locs.size;
  }, [openOrders]);

  const loadOrderIntoDraft = useCallback(
    (order: Order, silent = false) => {
      setCurrentOrderId(order.id);
      setCurrentService(order.service);
      setCurrentTable(order.location);
      setCart(order.items.map((i) => ({ ...i })));
      setWaiter(order.waiter);
      setGeneralNote(order.note || '');
      setPriority(order.priority || 'normal');
      if (order.customer) setDeliveryData(order.customer);
      setView('pos');
      if (!silent) {
        notify(`Cuenta #${order.number} cargada en ${locationLabel(order.service, order.location)}.`, 'info');
      }
    },
    [notify, setView]
  );

  const startNewAccount = useCallback(() => {
    setCurrentOrderId(null);
    setCart([]);
    setWaiter(stateRef.current.activeUser?.name || 'Operador');
    setGeneralNote('');
    setPriority('normal');
    setDeliveryData({ name: '', phone: '', address: '', reference: '' });
    notify(`Nueva cuenta preparada en ${locationLabel(currentService, currentTable)}.`, 'info');
  }, [currentService, currentTable, notify]);

  const openLocationDraft = useCallback(
    (service: ServiceType, loc: string, label: string, isExtraAccount = false) => {
      setCurrentService(service);
      setCurrentTable(loc);
      setCurrentOrderId(null);
      setCart([]);
      setWaiter(stateRef.current.activeUser?.name || 'Operador');
      setGeneralNote('');
      setPriority('normal');
      setView('pos');
      notify(
        isExtraAccount
          ? `Nueva cuenta independiente en ${label}.`
          : `${label} lista para tomar comanda.`,
        'info'
      );
    },
    [notify, setView]
  );

  const handleAddProduct = useCallback(
    (prod: SoftProduct) => {
      if (!activePerms?.canTakeOrders && !isAdminRole) {
        notify(`Tu rol (${activeRole.toUpperCase()}) no tiene permiso para tomar comandas.`, 'error');
        return;
      }
      if (!prod.saleEnabled) {
        notify(`El producto "${prod.name}" tiene precio pendiente.`, 'error');
        return;
      }
      const station = prod.station || classifyProductStation(prod.category);

      setCart((prev) => {
        const idx = prev.findIndex(
          (i) =>
            i.key === prod.key &&
            (i.itemStatus || 'pending') === 'pending' &&
            !i.note &&
            !(i.modifiers && i.modifiers.length > 0) &&
            !(i.modificadores && i.modificadores.length > 0)
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
          return copy;
        }
        return [
          ...prev,
          {
            lineId: uid(),
            key: prod.key,
            name: prod.name,
            priceCents: prod.priceCents,
            qty: 1,
            note: '',
            station,
            itemStatus: 'pending',
          },
        ];
      });
      notify(`+1 ${prod.name}`, 'info');
    },
    [activePerms?.canTakeOrders, activeRole, isAdminRole, notify]
  );

  const handleAddProductWithModifiers = useCallback(
    (prod: SoftProduct, modsArray: OrderItemModifier[]) => {
      const station = prod.station || classifyProductStation(prod.category);
      setCart((prev) => [
        ...prev,
        {
          lineId: uid(),
          key: prod.key,
          name: prod.name,
          priceCents: prod.priceCents,
          qty: 1,
          note: '',
          station,
          itemStatus: 'pending',
          modifiers: modsArray,
        },
      ]);
      notify(`+1 ${prod.name} (${modsArray.length} modificadores)`, 'info');
    },
    [notify]
  );

  const handleCancelItem = useCallback(
    (targetId: string) => {
      const item = cart.find((i) => (i.lineId || i.key) === targetId);
      if (!item) return;
      if (!canCancelOrders) {
        notify('Tu rol no tiene permiso para cancelar productos.', 'error');
        return;
      }
      if (selectedOrder && cart.length <= 1) {
        notify(
          'Es el último producto de una cuenta abierta. Usa "Cancelar Cuenta" para cerrarla con bitácora.',
          'error'
        );
        return;
      }

      setModalReason({
        title: `Cancelar producto: ${item.name}`,
        onConfirm: (reason) => {
          void (async () => {
            if (isMutatingRef.current) return;
            const latest = stateRef.current;
            const nextCartSnapshot = cart.filter((i) => (i.lineId || i.key) !== targetId);
            const auditEntry: AuditLogEntry = {
              id: uid(),
              at: new Date().toISOString(),
              user: latest.activeUser.name,
              action: 'Producto cancelado',
              detail: `${item.qty} × ${item.name} de ${locationLabel(currentService, currentTable)}`,
              reason,
            };

            if (selectedOrder && nextCartSnapshot.length > 0) {
              const nextDiscount = Math.min(
                selectedOrder.discountCents || 0,
                subtotalCents(nextCartSnapshot)
              );
              const nextTotal = Math.max(0, subtotalCents(nextCartSnapshot) - nextDiscount);
              const updatedOrder: Order = {
                ...selectedOrder,
                items: nextCartSnapshot,
                discountCents: nextDiscount,
                totalCents: nextTotal,
                updatedAt: new Date().toISOString(),
              };

              const res = await securePosApi.updateOrder(
                updatedOrder,
                auditEntry,
                secureApiOptions,
                {
                  title: 'Producto cancelado y confirmado',
                  detail: `${item.name} eliminado de Cuenta #${selectedOrder.number}`,
                }
              );

              if (res.status !== 'confirmed') {
                notify(res.error || 'Error cancelando producto en Firestore.', 'error');
                return;
              }

              setCart(nextCartSnapshot);
              setState((prev) => ({
                ...prev,
                orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
                audit: [...prev.audit, auditEntry],
              }));
              return;
            }

            const auditRes = await securePosApi.recordAudit(auditEntry, secureApiOptions, {
              title: 'Producto cancelado',
              detail: `${item.name} registrado en bitácora`,
            });
            if (auditRes.status !== 'confirmed') {
              notify(auditRes.error || 'Error registrando cancelación en Firestore.', 'error');
              return;
            }
            setCart(nextCartSnapshot);
            setState((prev) => ({
              ...prev,
              audit: [...prev.audit, auditEntry],
            }));
          })();
        },
      });
    },
    [
      canCancelOrders,
      cart,
      currentService,
      currentTable,
      notify,
      secureApiOptions,
      selectedOrder,
      setModalReason,
      setState,
    ]
  );

  const handleUpdateQty = useCallback(
    (targetId: string, delta: number) => {
      const targetItem = cart.find((i) => (i.lineId || i.key) === targetId);
      if (!targetItem) return;
      if (
        delta < 0 &&
        targetItem.qty <= 1 &&
        selectedOrder &&
        (targetItem.itemStatus || 'pending') !== 'pending'
      ) {
        handleCancelItem(targetId);
        return;
      }
      setCart((prev) =>
        prev
          .map((i) => ((i.lineId || i.key) === targetId ? { ...i, qty: i.qty + delta } : i))
          .filter((i) => i.qty > 0)
      );
    },
    [cart, handleCancelItem, selectedOrder]
  );

  const handleDecrementProductByKey = useCallback((prodKey: string) => {
    setCart((prev) => {
      const revIdx = [...prev].reverse().findIndex((i) => i.key === prodKey);
      if (revIdx < 0) return prev;
      const realIdx = prev.length - 1 - revIdx;
      const next = [...prev];
      const nextQty = next[realIdx].qty - 1;
      if (nextQty <= 0) {
        next.splice(realIdx, 1);
      } else {
        next[realIdx] = { ...next[realIdx], qty: nextQty };
      }
      return next;
    });
  }, []);

  const handleEditItemNote = useCallback(
    (targetId: string) => {
      const item = cart.find((i) => (i.lineId || i.key) === targetId);
      if (!item) return;
      setItemNoteModal({ targetId: item.lineId || item.key, name: item.name });
      setItemNoteValue(item.note || '');
    },
    [cart, setItemNoteModal, setItemNoteValue]
  );

  const handleToggleQuickModifier = useCallback(
    (chip: string) => {
      setItemNoteValue((prev) => {
        const parts = prev
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const exists = parts.some((p) => p.toLowerCase() === chip.toLowerCase());
        if (exists) {
          return parts.filter((p) => p.toLowerCase() !== chip.toLowerCase()).join(', ');
        }
        return [...parts, chip].join(', ');
      });
    },
    [setItemNoteValue]
  );

  const handleSendOrder = useCallback(async () => {
    if (isMutatingRef.current) return;
    if (cart.length === 0) {
      notify('Agrega al menos un producto a la cuenta antes de enviar.', 'error');
      return;
    }
    if (
      currentService === 'domicilio' &&
      (!deliveryData.name || !deliveryData.phone || !deliveryData.address)
    ) {
      notify('Para servicio a domicilio se requiere Nombre, Teléfono y Dirección.', 'error');
      return;
    }

    const isNew = !currentOrderId;
    const { nextState, orderId } = createOrUpdateOrder(stateRef.current, {
      orderId: currentOrderId,
      service: currentService,
      location: currentTable,
      waiter,
      note: generalNote,
      items: cart,
      customer: currentService === 'domicilio' ? deliveryData : undefined,
      priority,
    });

    const savedOrder = nextState.orders.find((o) => o.id === orderId);
    const latestAudit: AuditLogEntry =
      nextState.audit[nextState.audit.length - 1] || {
        id: uid(),
        at: new Date().toISOString(),
        user: stateRef.current.activeUser.name,
        action: isNew ? 'Comanda creada' : 'Comanda actualizada',
        detail: `Cuenta #${savedOrder?.number ?? ''} en ${locationLabel(currentService, currentTable)}`,
      };
    if (!savedOrder) return;

    const res = await securePosApi.saveOrder(
      savedOrder,
      isNew,
      latestAudit,
      secureApiOptions
    );

    if (res.status !== 'confirmed') {
      notify(res.error || 'Error confirmando comanda en Firestore.', 'error');
      return;
    }

    const assignedNum = typeof res.data === 'number' ? res.data : savedOrder.number;
    setCurrentOrderId(orderId);
    setState((prev) => {
      const mergedOrders = prev.orders.some((o) => o.id === orderId)
        ? prev.orders.map((o) => (o.id === orderId ? { ...savedOrder, number: assignedNum } : o))
        : [...prev.orders, { ...savedOrder, number: assignedNum }];
      return {
        ...prev,
        orders: mergedOrders,
        nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
        audit: latestAudit ? [...prev.audit, latestAudit] : prev.audit,
      };
    });
  }, [
    cart,
    currentOrderId,
    currentService,
    currentTable,
    deliveryData,
    generalNote,
    notify,
    priority,
    secureApiOptions,
    setState,
    waiter,
  ]);

  const handleAdvanceItemStatus = useCallback(
    async (orderId: string, itemTargetId: string, targetStatus: ItemStatus) => {
      if (isMutatingRef.current) return;
      const latest = stateRef.current;
      const order = latest.orders.find((o) => o.id === orderId);
      if (!order) return;
      const targetItem = order.items.find((i) => (i.lineId || i.key) === itemTargetId);
      if (!targetItem) return;

      const currentItemStatus: ItemStatus = targetItem.itemStatus || 'pending';
      const itemStation = targetItem.station || 'cocina';

      if (!canTransitionItemStatus(currentItemStatus, targetStatus)) {
        notify(`Transición inválida: ${currentItemStatus} → ${targetStatus}.`, 'error');
        return;
      }
      if (
        !canActOnItem(
          latest.activeUser.role,
          itemStation,
          targetStatus,
          latest.deviceConfig?.station || 'todos'
        )
      ) {
        notify(
          `El rol ${latest.activeUser.role.toUpperCase()} / estación ${latest.deviceConfig?.station} no puede marcar "${targetStatus}" en ${itemStation.toUpperCase()}.`,
          'error'
        );
        return;
      }

      const now = new Date().toISOString();
      const updatedItems: OrderItem[] = order.items.map((it) =>
        (it.lineId || it.key) === itemTargetId ? { ...it, itemStatus: targetStatus } : it
      );
      const nextOrderStatus = computeOrderStatusFromItems(updatedItems, order.status);
      const updatedOrder: Order = {
        ...order,
        items: updatedItems,
        status: nextOrderStatus,
        updatedAt: now,
      };
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: latest.activeUser.name,
        action: 'Partida KDS actualizada',
        detail: `Cuenta #${order.number} · ${targetItem.qty}× ${targetItem.name} (${itemStation}) → ${targetStatus.toUpperCase()}`,
      };

      const res = await securePosApi.updateOrder(updatedOrder, auditEntry, secureApiOptions, {
        title: `${targetItem.name} → ${targetStatus.toUpperCase()}`,
        detail: `Cuenta #${order.number} confirmada en KDS`,
      });

      if (res.status !== 'confirmed') {
        notify(res.error || 'Error actualizando KDS en Firestore.', 'error');
        return;
      }

      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        audit: [...prev.audit, auditEntry],
      }));
    },
    [notify, secureApiOptions, setState]
  );

  const handleAdvanceOrderStatus = useCallback(
    async (orderId: string, currentStatus: OrderStatus) => {
      if (isMutatingRef.current) return;
      const latest = stateRef.current;
      const order = latest.orders.find((o) => o.id === orderId);
      if (!order) return;
      const now = new Date().toISOString();
      const targetStatus: OrderStatus =
        currentStatus === 'sent' ? 'preparing' : currentStatus === 'preparing' ? 'ready' : 'served';
      const itemTarget: ItemStatus =
        targetStatus === 'preparing' ? 'preparing' : targetStatus === 'ready' ? 'ready' : 'served';

      const updatedItems: OrderItem[] = order.items.map((it) => {
        const matchesStation =
          kitchenStation === 'todas' || (it.station || 'cocina') === kitchenStation;
        const curSt = it.itemStatus || 'pending';
        if (matchesStation && canTransitionItemStatus(curSt, itemTarget)) {
          return { ...it, itemStatus: itemTarget };
        }
        return it;
      });

      const computedStatus = computeOrderStatusFromItems(updatedItems, targetStatus);
      const updatedOrder: Order = {
        ...order,
        items: updatedItems,
        status: computedStatus === order.status ? targetStatus : computedStatus,
        updatedAt: now,
      };

      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: latest.activeUser.name,
        action: 'Estado KDS avanzado',
        detail: `Cuenta #${order.number} (${locationLabel(order.service, order.location)}) pasó a ${updatedOrder.status.toUpperCase()}`,
      };

      const res = await securePosApi.updateOrder(updatedOrder, auditEntry, secureApiOptions, {
        title: `Comanda #${order.number} → ${updatedOrder.status.toUpperCase()}`,
        detail: `${locationLabel(order.service, order.location)} confirmada`,
      });

      if (res.status !== 'confirmed') {
        notify(res.error || 'Error avanzando estado en Firestore.', 'error');
        return;
      }

      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        audit: [...prev.audit, auditEntry],
      }));
    },
    [kitchenStation, notify, secureApiOptions, setState]
  );

  const handleSplitOrder = useCallback(() => {
    if (!selectedOrder || selectedOrder.items.length < 2) {
      notify('Se requieren al menos 2 platillos en una cuenta abierta para dividirla.', 'error');
      return;
    }
    const itemsSummary = selectedOrder.items
      .slice(0, 6)
      .map((i) => `${i.key} (${i.name})`)
      .join(', ');
    setPromptModal({
      title: 'Dividir comanda',
      label: `Ingresa la CLAVE del platillo a separar (${itemsSummary}):`,
      defaultValue: selectedOrder.items[0]?.key,
      onConfirm: (keyVal) => {
        void (async () => {
          if (isMutatingRef.current) return;
          const latest = stateRef.current;
          const now = new Date().toISOString();
          const splitOrderNum = latest.nextOrderNumber;
          const newSplitId = uid();
          const splitResult = splitOrderItemByTarget(
            selectedOrder,
            keyVal,
            splitOrderNum,
            newSplitId,
            now
          );
          if (!splitResult) {
            notify('Clave no encontrada en esta comanda.', 'error');
            return;
          }
          const { updatedOriginal, splitOrder, movedItem } = splitResult;

          const auditEntry: AuditLogEntry = {
            id: uid(),
            at: now,
            user: latest.activeUser.name,
            action: 'Cuenta dividida',
            detail: `Producto ${movedItem.name} movido de Cuenta #${selectedOrder.number} a nueva Cuenta #${splitOrderNum}`,
          };

          const res = await securePosApi.splitOrder(
            updatedOriginal,
            splitOrder,
            auditEntry,
            secureApiOptions
          );

          if (res.status !== 'confirmed') {
            notify(res.error || 'Error dividiendo cuenta en Firestore.', 'error');
            return;
          }

          const assignedNum = typeof res.data === 'number' ? res.data : splitOrder.number;
          const confirmedSplit: Order = { ...splitOrder, number: assignedNum };

          setState((prev) => ({
            ...prev,
            orders: [
              ...prev.orders.filter((o) => o.id !== selectedOrder.id),
              updatedOriginal,
              confirmedSplit,
            ],
            nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
            audit: [...prev.audit, auditEntry],
          }));

          loadOrderIntoDraft(confirmedSplit, true);
        })();
      },
    });
    setPromptValue(selectedOrder.items[0]?.key || '');
  }, [
    loadOrderIntoDraft,
    notify,
    secureApiOptions,
    selectedOrder,
    setPromptModal,
    setPromptValue,
    setState,
  ]);

  const handleMoveTable = useCallback(() => {
    if (!selectedOrder) {
      notify('Selecciona o guarda una cuenta antes de cambiar o unir mesa.', 'error');
      return;
    }
    setMoveTargetService(selectedOrder.service);
    const opts = locationOptions(selectedOrder.service);
    const nextDefault =
      opts.find((o) => o.value !== String(selectedOrder.location))?.value || opts[0].value;
    setMoveTargetLocation(nextDefault);
    setMoveTableModalOpen(true);
  }, [notify, selectedOrder]);

  const handleConfirmMoveTable = useCallback(async () => {
    if (!selectedOrder || isMutatingRef.current) return;
    const currentLoc = locationLabel(selectedOrder.service, selectedOrder.location);
    const targetLocLabel = locationLabel(moveTargetService, moveTargetLocation);
    if (
      selectedOrder.service === moveTargetService &&
      String(selectedOrder.location) === String(moveTargetLocation)
    ) {
      notify('Elige una ubicación diferente a la actual.', 'error');
      return;
    }

    const latest = stateRef.current;
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...selectedOrder,
      service: moveTargetService,
      location: moveTargetLocation,
      table: moveTargetLocation,
      updatedAt: now,
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: latest.activeUser.name,
      action: 'Mesa cambiada',
      detail: `Cuenta #${selectedOrder.number}: ${currentLoc} → ${targetLocLabel}`,
    };

    const res = await securePosApi.updateOrder(updatedOrder, auditEntry, secureApiOptions, {
      title: `Cuenta #${selectedOrder.number} movida`,
      detail: `${currentLoc} → ${targetLocLabel}`,
    });

    if (res.status !== 'confirmed') {
      notify(res.error || 'Error cambiando mesa en Firestore.', 'error');
      return;
    }

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
      audit: [...prev.audit, auditEntry],
    }));
    setCurrentService(moveTargetService);
    setCurrentTable(moveTargetLocation);
    setMoveTableModalOpen(false);
  }, [
    moveTargetLocation,
    moveTargetService,
    notify,
    secureApiOptions,
    selectedOrder,
    setState,
  ]);

  const handleConfirmMergeOrders = useCallback(
    async (targetOrder: Order) => {
      if (!selectedOrder || isMutatingRef.current) return;
      const latest = stateRef.current;
      const now = new Date().toISOString();
      const updatedTarget = mergeOrdersIntoTarget(targetOrder, selectedOrder, now);

      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: latest.activeUser.name,
        action: 'Cuentas unidas',
        detail: `Cuenta #${selectedOrder.number} unida dentro de Cuenta #${targetOrder.number} (${locationLabel(targetOrder.service, targetOrder.location)})`,
      };

      const res = await securePosApi.mergeOrders(
        updatedTarget,
        selectedOrder.id,
        auditEntry,
        secureApiOptions
      );

      if (res.status !== 'confirmed') {
        notify(res.error || 'Error uniendo cuentas en Firestore.', 'error');
        return;
      }

      setState((prev) => ({
        ...prev,
        orders: prev.orders
          .filter((o) => o.id !== selectedOrder.id)
          .map((o) => (o.id === targetOrder.id ? updatedTarget : o)),
        audit: [...prev.audit, auditEntry],
      }));

      setMoveTableModalOpen(false);
      loadOrderIntoDraft(updatedTarget, true);
    },
    [loadOrderIntoDraft, notify, secureApiOptions, selectedOrder, setState]
  );

  const handleCancelAccount = useCallback(() => {
    if (!canCancelOrders) {
      notify('Tu rol no tiene autorización para cancelar cuentas completas.', 'error');
      return;
    }
    if (!selectedOrder) {
      notify('No hay una cuenta activa para cancelar.', 'error');
      return;
    }
    setModalReason({
      title: `Cancelar Cuenta #${selectedOrder.number} completa`,
      onConfirm: (reason) => {
        void (async () => {
          if (isMutatingRef.current) return;
          const latest = stateRef.current;
          const now = new Date().toISOString();
          const canceledOrder = selectedOrder;
          const auditEntry: AuditLogEntry = {
            id: uid(),
            at: now,
            user: latest.activeUser.name,
            action: 'Cuenta cancelada',
            detail: `Cuenta #${canceledOrder.number} en ${locationLabel(canceledOrder.service, canceledOrder.location)} por $${(canceledOrder.totalCents / 100).toFixed(2)}`,
            reason,
          };

          const res = await securePosApi.cancelOrder(
            canceledOrder,
            isFirebaseAdmin,
            auditEntry,
            secureApiOptions
          );

          if (res.status !== 'confirmed') {
            notify(res.error || 'Error cancelando cuenta en Firestore.', 'error');
            return;
          }

          setCurrentOrderId(null);
          setCart([]);
          setGeneralNote('');
          setPriority('normal');
          setDeliveryData({ name: '', phone: '', address: '', reference: '' });
          setState((prev) => ({
            ...prev,
            orders: prev.orders.filter((o) => o.id !== canceledOrder.id),
            audit: [...prev.audit, auditEntry],
          }));
        })();
      },
    });
  }, [
    canCancelOrders,
    isFirebaseAdmin,
    notify,
    secureApiOptions,
    selectedOrder,
    setModalReason,
    setState,
  ]);

  const handleApplyDiscount = useCallback(() => {
    if (!canApplyDiscount) {
      notify('Tu rol no tiene autorización para aplicar descuentos.', 'error');
      return;
    }
    if (!selectedOrder) {
      notify('Primero guarda o selecciona una comanda abierta.', 'error');
      return;
    }
    setPromptModal({
      title: 'Aplicar descuento autorizado',
      label: `Ingresa el monto del descuento en PESOS (Subtotal: ${formatMoney(selectedOrder.totalCents)}):`,
      defaultValue: '50',
      onConfirm: (val) => {
        const amountPesos = Number(val);
        if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
          notify('Monto de descuento no válido.', 'error');
          return;
        }
        const discountCents = Math.round(amountPesos * 100);
        setModalReason({
          title: `Autorizar descuento de ${formatMoney(discountCents)}`,
          onConfirm: (reason) => {
            void (async () => {
              if (isMutatingRef.current) return;
              const latest = stateRef.current;
              const now = new Date().toISOString();
              const sub = subtotalCents(selectedOrder.items);
              const nextTotal = Math.max(0, sub - discountCents);
              const updatedOrder: Order = {
                ...selectedOrder,
                discountCents,
                totalCents: nextTotal,
                updatedAt: now,
              };
              const auditEntry: AuditLogEntry = {
                id: uid(),
                at: now,
                user: latest.activeUser.name,
                action: 'Descuento autorizado',
                detail: `Descuento de ${formatMoney(discountCents)} aplicado a Cuenta #${selectedOrder.number}`,
                reason,
              };

              const res = await securePosApi.updateOrder(
                updatedOrder,
                auditEntry,
                secureApiOptions,
                {
                  title: `Descuento ${formatMoney(discountCents)} confirmado`,
                  detail: `Aplicado a Cuenta #${selectedOrder.number}`,
                }
              );

              if (res.status !== 'confirmed') {
                notify(res.error || 'Error aplicando descuento en Firestore.', 'error');
                return;
              }

              setState((prev) => ({
                ...prev,
                orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
                audit: [...prev.audit, auditEntry],
              }));
            })();
          },
        });
      },
    });
    setPromptValue('50');
  }, [
    canApplyDiscount,
    notify,
    secureApiOptions,
    selectedOrder,
    setModalReason,
    setPromptModal,
    setPromptValue,
    setState,
  ]);

  const handleReopenLastSale = useCallback(() => {
    const latest = stateRef.current;
    const lastSale = latest.sales[latest.sales.length - 1];
    if (!lastSale) {
      notify('No hay ventas registradas para reabrir.', 'error');
      return;
    }

    setModalReason({
      title: `Reabrir venta ${lastSale.receipt}`,
      onConfirm: (reason) => {
        void (async () => {
          if (isMutatingRef.current) return;
          const cur = stateRef.current;
          const now = new Date().toISOString();
          const reopenedNum = cur.nextOrderNumber;
          const newOrderId = uid();

          const reopenedOrder: Order = {
            id: newOrderId,
            number: reopenedNum,
            service: lastSale.service,
            location: lastSale.location,
            table: lastSale.location,
            waiter: lastSale.waiter,
            note: `Reapertura derivada de ${lastSale.receipt}`,
            items: lastSale.items.map((i) => ({ ...i, itemStatus: i.itemStatus || 'pending' })),
            totalCents: lastSale.totalCents,
            discountCents: 0,
            priority: 'normal',
            status: 'sent',
            paid: false,
            createdAt: now,
            updatedAt: now,
          };

          const auditEntry: AuditLogEntry = {
            id: uid(),
            at: now,
            user: cur.activeUser.name,
            action: 'Venta reabierta',
            detail: `Nueva cuenta #${reopenedNum} creada a partir de venta ${lastSale.receipt}`,
            reason,
          };

          const res = await securePosApi.saveOrder(
            reopenedOrder,
            true,
            auditEntry,
            secureApiOptions,
            {
              title: `Venta ${lastSale.receipt} reabierta`,
              detail: `Asignada como Cuenta #${reopenedNum}`,
            }
          );

          if (res.status !== 'confirmed') {
            notify(res.error || 'Error reabriendo venta en Firestore.', 'error');
            return;
          }

          const assignedNum = typeof res.data === 'number' ? res.data : reopenedOrder.number;
          const confirmedOrder: Order = { ...reopenedOrder, number: assignedNum };

          setState((prev) => ({
            ...prev,
            orders: [...prev.orders, confirmedOrder],
            nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
            audit: [...prev.audit, auditEntry],
          }));

          loadOrderIntoDraft(confirmedOrder, true);
        })();
      },
    });
  }, [loadOrderIntoDraft, notify, secureApiOptions, setModalReason, setState]);

  const handleOpenDraftPreCheck = useCallback(() => {
    if (selectedOrder) {
      setActivePreCheckOrder(selectedOrder);
      return;
    }
    if (cart.length === 0) {
      notify('Agrega productos antes de emitir una pre-cuenta.', 'error');
      return;
    }
    const now = new Date().toISOString();
    setActivePreCheckOrder({
      id: 'draft-precheck',
      number: stateRef.current.nextOrderNumber,
      service: currentService,
      location: currentTable,
      table: currentTable,
      waiter,
      note: generalNote,
      items: cart,
      totalCents: totalCents(cart, 0),
      discountCents: 0,
      priority,
      status: 'sent',
      paid: false,
      createdAt: now,
      updatedAt: now,
    });
  }, [
    cart,
    currentService,
    currentTable,
    generalNote,
    notify,
    priority,
    selectedOrder,
    setActivePreCheckOrder,
    waiter,
  ]);

  return {
    currentService,
    setCurrentService,
    currentTable,
    setCurrentTable,
    currentOrderId,
    setCurrentOrderId,
    cart,
    setCart,
    waiter,
    setWaiter,
    generalNote,
    setGeneralNote,
    priority,
    setPriority,
    deliveryData,
    setDeliveryData,
    moveTableModalOpen,
    setMoveTableModalOpen,
    moveTargetService,
    setMoveTargetService,
    moveTargetLocation,
    setMoveTargetLocation,
    orderSyncState,
    isOrderMutating,
    openOrders,
    openOrdersByLocation,
    currentLocOrders,
    selectedOrder,
    cartQtyMap,
    totalOccupiedTables,
    loadOrderIntoDraft,
    startNewAccount,
    openLocationDraft,
    handleAddProduct,
    handleAddProductWithModifiers,
    handleUpdateQty,
    handleDecrementProductByKey,
    handleEditItemNote,
    handleToggleQuickModifier,
    handleCancelItem,
    handleSendOrder,
    handleAdvanceItemStatus,
    handleAdvanceOrderStatus,
    handleSplitOrder,
    handleMoveTable,
    handleConfirmMoveTable,
    handleConfirmMergeOrders,
    handleCancelAccount,
    handleApplyDiscount,
    handleReopenLastSale,
    handleOpenDraftPreCheck,
  };
}
