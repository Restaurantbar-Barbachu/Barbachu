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
  fsCancelOrder,
  fsMergeOrders,
  fsRecordAudit,
  fsSaveOrder,
  fsSplitOrder,
  fsUpdateOrder,
} from '../lib/firestoreSync';
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

function formatOrderError(err: unknown, fallback = 'Sin permisos'): string {
  const raw = err instanceof Error ? err.message : fallback;
  return raw.replace(
    /^(ORDER_CLOSED|ALREADY_PAID|SHIFT_CLOSED|SHIFT_ALREADY_CLOSED|SHIFT_ALREADY_OPEN|SHIFT_NOT_FOUND|INSUFFICIENT_CASH|ITEM_EXISTS|ITEM_NOT_FOUND):/,
    ''
  );
}

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
  notify: (msg: string) => void;
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

  // Transfer / Merge Modal State
  const [moveTableModalOpen, setMoveTableModalOpen] = useState<boolean>(false);
  const [moveTargetService, setMoveTargetService] = useState<ServiceType>('mesa');
  const [moveTargetLocation, setMoveTargetLocation] = useState<string>('1');

  const stateRef = useRef(state);
  stateRef.current = state;

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
      notify('La cuenta cargada fue cobrada o cerrada en otra terminal.');
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
    (order: Order) => {
      setCurrentOrderId(order.id);
      setCurrentService(order.service);
      setCurrentTable(order.location);
      setCart(order.items.map((i) => ({ ...i })));
      setWaiter(order.waiter);
      setGeneralNote(order.note || '');
      setPriority(order.priority || 'normal');
      if (order.customer) setDeliveryData(order.customer);
      setView('pos');
      notify(`Cuenta #${order.number} cargada en ${locationLabel(order.service, order.location)}.`);
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
    notify(`Nueva cuenta preparada en ${locationLabel(currentService, currentTable)}.`);
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
          : `${label} lista para tomar comanda.`
      );
    },
    [notify, setView]
  );

  const handleAddProduct = useCallback(
    (prod: SoftProduct) => {
      if (!activePerms?.canTakeOrders && !isAdminRole) {
        notify(`Tu rol (${activeRole.toUpperCase()}) no tiene permiso para tomar comandas.`);
        return;
      }
      if (!prod.saleEnabled) {
        notify(`El producto "${prod.name}" tiene precio pendiente.`);
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
      notify(`+1 ${prod.name}`);
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
      notify(`+1 ${prod.name} (${modsArray.length} modificadores)`);
    },
    [notify]
  );

  const handleCancelItem = useCallback(
    (targetId: string) => {
      const item = cart.find((i) => (i.lineId || i.key) === targetId);
      if (!item) return;
      if (!canCancelOrders) {
        notify('Tu rol no tiene permiso para cancelar productos.');
        return;
      }
      if (selectedOrder && cart.length <= 1) {
        notify(
          'Es el último producto de una cuenta abierta. Usa "Cancelar Cuenta" para cerrarla con bitácora.'
        );
        return;
      }

      setModalReason({
        title: `Cancelar producto: ${item.name}`,
        onConfirm: (reason) => {
          const latest = stateRef.current;
          let nextCartSnapshot: OrderItem[] = [];
          setCart((prev) => {
            nextCartSnapshot = prev.filter((i) => (i.lineId || i.key) !== targetId);
            return nextCartSnapshot;
          });
          const auditEntry: AuditLogEntry = {
            id: uid(),
            at: new Date().toISOString(),
            user: latest.activeUser.name,
            action: 'Producto cancelado',
            detail: `${item.qty} × ${item.name} de ${locationLabel(currentService, currentTable)}`,
            reason,
          };
          setState((prev) => ({
            ...prev,
            audit: [...prev.audit, auditEntry],
          }));
          if (firebaseUser && selectedOrder && nextCartSnapshot.length > 0) {
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
            void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch(
              (err) => {
                notify(`Error actualizando orden en Firestore: ${formatOrderError(err)}`);
              }
            );
          } else if (firebaseUser) {
            void fsRecordAudit(auditEntry, firebaseUser, authorizedEmails).catch((err) => {
              notify(`Error registrando bitácora en Firestore: ${formatOrderError(err)}`);
            });
          }
          notify('Producto cancelado y registrado en bitácora.');
        },
      });
    },
    [
      authorizedEmails,
      canCancelOrders,
      cart,
      currentService,
      currentTable,
      firebaseUser,
      notify,
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

  const handleSendOrder = useCallback(() => {
    if (cart.length === 0) {
      notify('Agrega al menos un producto a la cuenta antes de enviar.');
      return;
    }
    if (
      currentService === 'domicilio' &&
      (!deliveryData.name || !deliveryData.phone || !deliveryData.address)
    ) {
      notify('Para servicio a domicilio se requiere Nombre, Teléfono y Dirección.');
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

    setState(nextState);
    setCurrentOrderId(orderId);

    const savedOrder = nextState.orders.find((o) => o.id === orderId);
    const latestAudit = nextState.audit[nextState.audit.length - 1];
    if (firebaseUser && savedOrder && latestAudit) {
      void fsSaveOrder(savedOrder, isNew, firebaseUser, authorizedEmails, latestAudit)
        .then((assignedNum) => {
          if (isNew && assignedNum !== savedOrder.number) {
            setState((prev) => ({
              ...prev,
              orders: prev.orders.map((o) =>
                o.id === orderId ? { ...o, number: assignedNum } : o
              ),
              nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
            }));
          }
        })
        .catch((err) => {
          notify(`Error guardando comanda en Firestore: ${formatOrderError(err)}`);
        });
    }
    notify('Comanda guardada y enviada a cocina/barra exitosamente.');
  }, [
    authorizedEmails,
    cart,
    currentOrderId,
    currentService,
    currentTable,
    deliveryData,
    firebaseUser,
    generalNote,
    notify,
    priority,
    setState,
    waiter,
  ]);

  const handleAdvanceItemStatus = useCallback(
    (orderId: string, itemTargetId: string, targetStatus: ItemStatus) => {
      const latest = stateRef.current;
      const order = latest.orders.find((o) => o.id === orderId);
      if (!order) return;
      const targetItem = order.items.find((i) => (i.lineId || i.key) === itemTargetId);
      if (!targetItem) return;

      const currentItemStatus: ItemStatus = targetItem.itemStatus || 'pending';
      const itemStation = targetItem.station || 'cocina';

      if (!canTransitionItemStatus(currentItemStatus, targetStatus)) {
        notify(`Transición inválida: ${currentItemStatus} → ${targetStatus}.`);
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
          `El rol ${latest.activeUser.role.toUpperCase()} / estación ${latest.deviceConfig?.station} no puede marcar "${targetStatus}" en ${itemStation.toUpperCase()}.`
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

      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          notify(`Error actualizando KDS en Firestore: ${formatOrderError(err)}`);
        });
      }
      notify(`${targetItem.name} → ${targetStatus.toUpperCase()}`);
    },
    [authorizedEmails, firebaseUser, notify, setState]
  );

  const handleAdvanceOrderStatus = useCallback(
    (orderId: string, currentStatus: OrderStatus) => {
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

      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          notify(`Error KDS Firestore: ${formatOrderError(err)}`);
        });
      }
      notify(`Comanda avanzada a ${updatedOrder.status.toUpperCase()}.`);
    },
    [authorizedEmails, firebaseUser, kitchenStation, notify, setState]
  );

  const handleSplitOrder = useCallback(() => {
    if (!selectedOrder || selectedOrder.items.length < 2) {
      notify('Se requieren al menos 2 platillos en una cuenta abierta para dividirla.');
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
          notify('Clave no encontrada en esta comanda.');
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

        setState((prev) => ({
          ...prev,
          orders: [
            ...prev.orders.filter((o) => o.id !== selectedOrder.id),
            updatedOriginal,
            splitOrder,
          ],
          nextOrderNumber: splitOrderNum + 1,
          audit: [...prev.audit, auditEntry],
        }));

        if (firebaseUser) {
          void fsSplitOrder(updatedOriginal, splitOrder, firebaseUser, authorizedEmails, auditEntry)
            .then((assignedNum) => {
              if (assignedNum !== splitOrder.number) {
                setState((prev) => ({
                  ...prev,
                  orders: prev.orders.map((o) =>
                    o.id === newSplitId ? { ...o, number: assignedNum } : o
                  ),
                  nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
                }));
              }
            })
            .catch((err) => {
              notify(`Error dividiendo cuenta en Firestore: ${formatOrderError(err)}`);
            });
        }

        loadOrderIntoDraft(splitOrder);
        notify(`Nueva Cuenta #${splitOrderNum} creada con ${movedItem.name}.`);
      },
    });
    setPromptValue(selectedOrder.items[0]?.key || '');
  }, [
    authorizedEmails,
    firebaseUser,
    loadOrderIntoDraft,
    notify,
    selectedOrder,
    setPromptModal,
    setPromptValue,
    setState,
  ]);

  const handleMoveTable = useCallback(() => {
    if (!selectedOrder) {
      notify('Selecciona o guarda una cuenta antes de cambiar o unir mesa.');
      return;
    }
    setMoveTargetService(selectedOrder.service);
    const opts = locationOptions(selectedOrder.service);
    const nextDefault =
      opts.find((o) => o.value !== String(selectedOrder.location))?.value || opts[0].value;
    setMoveTargetLocation(nextDefault);
    setMoveTableModalOpen(true);
  }, [notify, selectedOrder]);

  const handleConfirmMoveTable = useCallback(() => {
    if (!selectedOrder) return;
    const currentLoc = locationLabel(selectedOrder.service, selectedOrder.location);
    const targetLocLabel = locationLabel(moveTargetService, moveTargetLocation);
    if (
      selectedOrder.service === moveTargetService &&
      String(selectedOrder.location) === String(moveTargetLocation)
    ) {
      notify('Elige una ubicación diferente a la actual.');
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
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
      audit: [...prev.audit, auditEntry],
    }));
    if (firebaseUser) {
      void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error cambiando mesa en Firestore: ${formatOrderError(err)}`);
      });
    }
    setCurrentService(moveTargetService);
    setCurrentTable(moveTargetLocation);
    setMoveTableModalOpen(false);
    notify(`Cuenta #${selectedOrder.number} movida a ${targetLocLabel}.`);
  }, [
    authorizedEmails,
    firebaseUser,
    moveTargetLocation,
    moveTargetService,
    notify,
    selectedOrder,
    setState,
  ]);

  const handleConfirmMergeOrders = useCallback(
    (targetOrder: Order) => {
      if (!selectedOrder) return;
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

      setState((prev) => ({
        ...prev,
        orders: prev.orders
          .filter((o) => o.id !== selectedOrder.id)
          .map((o) => (o.id === targetOrder.id ? updatedTarget : o)),
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsMergeOrders(
          updatedTarget,
          selectedOrder.id,
          firebaseUser,
          authorizedEmails,
          auditEntry
        ).catch((err) => {
          notify(`Error uniendo cuentas en Firestore: ${formatOrderError(err)}`);
        });
      }

      setMoveTableModalOpen(false);
      loadOrderIntoDraft(updatedTarget);
      notify(`Cuenta #${selectedOrder.number} unida a Cuenta #${targetOrder.number}.`);
    },
    [authorizedEmails, firebaseUser, loadOrderIntoDraft, notify, selectedOrder, setState]
  );

  const handleCancelAccount = useCallback(() => {
    if (!canCancelOrders) {
      notify('Tu rol no tiene autorización para cancelar cuentas completas.');
      return;
    }
    if (!selectedOrder) {
      notify('No hay una cuenta activa para cancelar.');
      return;
    }
    setModalReason({
      title: `Cancelar Cuenta #${selectedOrder.number} completa`,
      onConfirm: (reason) => {
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
        if (firebaseUser) {
          void fsCancelOrder(
            canceledOrder,
            isFirebaseAdmin,
            firebaseUser,
            authorizedEmails,
            auditEntry
          ).catch((err) => {
            notify(`Error cancelando cuenta en Firestore: ${formatOrderError(err)}`);
          });
        }
        notify(`Cuenta #${canceledOrder.number} cancelada y registrada en bitácora.`);
      },
    });
  }, [
    authorizedEmails,
    canCancelOrders,
    firebaseUser,
    isFirebaseAdmin,
    notify,
    selectedOrder,
    setModalReason,
    setState,
  ]);

  const handleApplyDiscount = useCallback(() => {
    if (!canApplyDiscount) {
      notify('Tu rol no tiene autorización para aplicar descuentos.');
      return;
    }
    if (!selectedOrder) {
      notify('Primero guarda o selecciona una comanda abierta.');
      return;
    }
    setPromptModal({
      title: 'Aplicar descuento autorizado',
      label: `Ingresa el monto del descuento en PESOS (Subtotal: ${formatMoney(selectedOrder.totalCents)}):`,
      defaultValue: '50',
      onConfirm: (val) => {
        const amountPesos = Number(val);
        if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
          notify('Monto de descuento no válido.');
          return;
        }
        const discountCents = Math.round(amountPesos * 100);
        setModalReason({
          title: `Autorizar descuento de ${formatMoney(discountCents)}`,
          onConfirm: (reason) => {
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
            setState((prev) => ({
              ...prev,
              orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
              audit: [...prev.audit, auditEntry],
            }));
            if (firebaseUser) {
              void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch(
                (err) => {
                  notify(`Error aplicando descuento en Firestore: ${formatOrderError(err)}`);
                }
              );
            }
            notify(`Descuento de ${formatMoney(discountCents)} aplicado.`);
          },
        });
      },
    });
    setPromptValue('50');
  }, [
    authorizedEmails,
    canApplyDiscount,
    firebaseUser,
    notify,
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
      notify('No hay ventas registradas para reabrir.');
      return;
    }

    setModalReason({
      title: `Reabrir venta ${lastSale.receipt}`,
      onConfirm: (reason) => {
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

        setState((prev) => ({
          ...prev,
          orders: [...prev.orders, reopenedOrder],
          nextOrderNumber: reopenedNum + 1,
          audit: [...prev.audit, auditEntry],
        }));

        if (firebaseUser) {
          void fsSaveOrder(reopenedOrder, true, firebaseUser, authorizedEmails, auditEntry)
            .then((assignedNum) => {
              if (assignedNum !== reopenedOrder.number) {
                setState((prev) => ({
                  ...prev,
                  orders: prev.orders.map((o) =>
                    o.id === newOrderId ? { ...o, number: assignedNum } : o
                  ),
                  nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
                }));
              }
            })
            .catch((err) => {
              notify(`Error reabriendo venta en Firestore: ${formatOrderError(err)}`);
            });
        }

        loadOrderIntoDraft(reopenedOrder);
        notify(`Venta reabierta como Cuenta #${reopenedNum}.`);
      },
    });
  }, [authorizedEmails, firebaseUser, loadOrderIntoDraft, notify, setModalReason, setState]);

  const handleOpenDraftPreCheck = useCallback(() => {
    if (selectedOrder) {
      setActivePreCheckOrder(selectedOrder);
      return;
    }
    if (cart.length === 0) {
      notify('Agrega productos antes de emitir una pre-cuenta.');
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
