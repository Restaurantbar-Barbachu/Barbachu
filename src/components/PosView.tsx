import React, { useState, useEffect, useMemo } from 'react';
import {
  FullPosState,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Priority,
  Sale,
  ServiceType,
  SoftProduct,
  InventoryItem,
  PosUser,
} from '../types';
import { AdminDashboard } from './AdminDashboard';
import { BarbachuLogo } from './BarbachuLogo';
import { PosAnalyticsDashboard } from './PosAnalyticsDashboard';
import {
  closeAndPayOrder,
  createOrUpdateOrder,
  lineTotalCents,
  locationLabel,
  locationOptions,
  printReceiptText,
  serviceName,
  subtotalCents,
  totalCents,
  uid,
} from '../core';
import {
  formatMoney,
  loadPosState,
  savePosState,
} from '../storage';

interface PosViewProps {
  onSwitchToMenu?: () => void;
}

export const PosView: React.FC<PosViewProps> = ({ onSwitchToMenu }) => {
  const [state, setState] = useState<FullPosState>(() => loadPosState());
  const [view, setView] = useState<'dashboard' | 'pos' | 'tables' | 'kitchen' | 'cash' | 'inventory' | 'reports' | 'admin'>('dashboard');

  // POS Order Draft state
  const [currentService, setCurrentService] = useState<ServiceType>('mesa');
  const [currentTable, setCurrentTable] = useState<string>('1');
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [waiter, setWaiter] = useState<string>('Andrea (Mesera)');
  const [generalNote, setGeneralNote] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deliveryData, setDeliveryData] = useState({ name: '', phone: '', address: '', reference: '' });

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [kitchenStation, setKitchenStation] = useState<'todas' | 'cocina' | 'barra'>('todas');
  const [ingredientSearch, setIngredientSearch] = useState<string>('');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);

  // Cashier State
  const [payOrderId, setPayOrderId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [physicalCashCount, setPhysicalCashCount] = useState<string>('');

  // Modals & Receipts
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);
  const [modalReason, setModalReason] = useState<{ title: string; onConfirm: (reason: string) => void } | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [promptModal, setPromptModal] = useState<{ title: string; label: string; defaultValue?: string; onConfirm: (val: string) => void } | null>(null);
  const [promptValue, setPromptValue] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Inventory Modal
  const [inventoryModal, setInventoryModal] = useState<{ clave: number; descripcion: string; type: 'entrada' | 'ajuste' | 'minStock' } | null>(null);
  const [invQty, setInvQty] = useState<string>('');
  const [invCost, setInvCost] = useState<string>('');
  const [invReason, setInvReason] = useState<string>('');

  // User switcher modal state
  const [userSwitchModal, setUserSwitchModal] = useState<boolean>(false);
  const [selectedSwitchUser, setSelectedSwitchUser] = useState<PosUser | null>(null);
  const [switchPinInput, setSwitchPinInput] = useState<string>('');

  // Auto-save state
  useEffect(() => {
    savePosState(state);
  }, [state]);

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Categories list from live products
  const categories = useMemo(() => {
    const set = new Set(state.products.map((p) => p.category).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [state.products]);

  // Filtered products for POS
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.products.filter((p) => {
      const matchCat = selectedCategory === 'TODOS' || p.category === selectedCategory;
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [searchQuery, selectedCategory, state.products]);

  // Low stock inventory items
  const lowStockItems = useMemo(() => {
    return Object.values(state.inventory).filter((item) => item.stock <= item.minStock);
  }, [state.inventory]);

  // Current active orders (not closed)
  const openOrders = useMemo(() => {
    return state.orders.filter((o) => o.status !== 'closed');
  }, [state.orders]);

  // Active accounts for current service & location
  const currentLocOrders = useMemo(() => {
    return state.orders.filter(
      (o) => o.status !== 'closed' && o.service === currentService && String(o.location) === String(currentTable)
    );
  }, [state.orders, currentService, currentTable]);

  // Current selected order
  const selectedOrder = useMemo(() => {
    return state.orders.find((o) => o.id === currentOrderId && o.status !== 'closed') || null;
  }, [state.orders, currentOrderId]);

  // Load account into draft
  const loadOrderIntoDraft = (order: Order) => {
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
  };

  // Reset cart for a new account
  const startNewAccount = () => {
    setCurrentOrderId(null);
    setCart([]);
    setGeneralNote('');
    setPriority('normal');
    setDeliveryData({ name: '', phone: '', address: '', reference: '' });
    notify(`Nueva cuenta preparada en ${locationLabel(currentService, currentTable)}.`);
  };

  // Add product to cart
  const handleAddProduct = (prod: SoftProduct) => {
    if (!prod.saleEnabled) {
      notify(`El producto "${prod.name}" tiene precio pendiente.`);
      return;
    }
    const station: 'cocina' | 'barra' = ['CERVEZA', 'MICHELADA', 'BEBIDAS C/ALCOHOL', 'BEBIDAS S/ALCOHOL', 'DESTILADOS', 'CUBETAS'].includes(prod.category)
      ? 'barra'
      : 'cocina';

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.key === prod.key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          key: prod.key,
          name: prod.name,
          priceCents: prod.priceCents,
          qty: 1,
          note: '',
          station,
        },
      ];
    });
    notify(`+1 ${prod.name}`);
  };

  const handleUpdateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const handleEditItemNote = (key: string) => {
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    setPromptModal({
      title: 'Nota de cocina / preparación',
      label: `Nota específica para: ${item.name}`,
      defaultValue: item.note,
      onConfirm: (val) => {
        setCart((prev) =>
          prev.map((i) => (i.key === key ? { ...i, note: val.trim() } : i))
        );
        notify('Nota de producto actualizada.');
      },
    });
    setPromptValue(item.note);
  };

  // Cancel item line with reason
  const handleCancelItem = (key: string) => {
    const item = cart.find((i) => i.key === key);
    if (!item) return;

    setModalReason({
      title: `Cancelar producto: ${item.name}`,
      onConfirm: (reason) => {
        setCart((prev) => prev.filter((i) => i.key !== key));
        setState((prev) => ({
          ...prev,
          audit: [
            ...prev.audit,
            {
              id: uid(),
              at: new Date().toISOString(),
              user: prev.activeUser.name,
              action: 'Producto cancelado',
              detail: `${item.qty} × ${item.name} de ${locationLabel(currentService, currentTable)}`,
              reason,
            },
          ],
        }));
        notify('Producto cancelado y registrado en bitácora.');
      },
    });
  };

  // Send Order
  const handleSendOrder = () => {
    if (cart.length === 0) {
      notify('Agrega al menos un producto a la cuenta antes de enviar.');
      return;
    }
    if (currentService === 'domicilio' && (!deliveryData.name || !deliveryData.phone || !deliveryData.address)) {
      notify('Para servicio a domicilio se requiere Nombre, Teléfono y Dirección.');
      return;
    }

    const { nextState, orderId } = createOrUpdateOrder(state, {
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
    notify(`Comanda guardada y enviada a cocina/barra exitosamente.`);
  };

  // Advance Kitchen Status
  const handleAdvanceOrderStatus = (orderId: string, currentStatus: OrderStatus) => {
    const targetStatus: OrderStatus =
      currentStatus === 'sent' ? 'preparing' : currentStatus === 'preparing' ? 'ready' : 'delivered';

    setState((prev) => {
      const order = prev.orders.find((o) => o.id === orderId);
      if (!order) return prev;
      const updated = prev.orders.map((o) =>
        o.id === orderId ? { ...o, status: targetStatus, updatedAt: new Date().toISOString() } : o
      );
      return {
        ...prev,
        orders: updated,
        audit: [
          ...prev.audit,
          {
            id: uid(),
            at: new Date().toISOString(),
            user: prev.activeUser.name,
            action: 'Estado KDS avanzado',
            detail: `Cuenta #${order.number} (${locationLabel(order.service, order.location)}) pasó a ${targetStatus.toUpperCase()}`,
          },
        ],
      };
    });
    notify(`Comanda avanzada a ${targetStatus.toUpperCase()}.`);
  };

  // Split Order
  const handleSplitOrder = () => {
    if (!selectedOrder || selectedOrder.items.length === 0) {
      notify('Primero envía o selecciona una comanda abierta para dividirla.');
      return;
    }
    setPromptModal({
      title: 'Dividir comanda',
      label: 'Ingresa la CLAVE del producto a separar en una nueva cuenta:',
      defaultValue: selectedOrder.items[0]?.key,
      onConfirm: (keyVal) => {
        const item = selectedOrder.items.find((i) => i.key === keyVal.trim());
        if (!item) {
          notify('Clave no encontrada en esta comanda.');
          return;
        }
        const now = new Date().toISOString();
        const splitOrderNum = state.nextOrderNumber;
        const newSplitId = uid();

        const splitOrder: Order = {
          ...selectedOrder,
          id: newSplitId,
          number: splitOrderNum,
          items: [{ ...item }],
          totalCents: lineTotalCents(item),
          discountCents: 0,
          note: `Dividida de cuenta #${selectedOrder.number}`,
          createdAt: now,
          updatedAt: now,
        };

        const remainingItems = selectedOrder.items.filter((i) => i.key !== keyVal.trim());
        const updatedOriginal: Order = {
          ...selectedOrder,
          items: remainingItems,
          totalCents: Math.max(0, subtotalCents(remainingItems) - selectedOrder.discountCents),
          updatedAt: now,
        };

        setState((prev) => ({
          ...prev,
          orders: [...prev.orders.filter((o) => o.id !== selectedOrder.id), updatedOriginal, splitOrder],
          nextOrderNumber: splitOrderNum + 1,
          audit: [
            ...prev.audit,
            {
              id: uid(),
              at: now,
              user: prev.activeUser.name,
              action: 'Cuenta dividida',
              detail: `Producto ${item.name} movido de Cuenta #${selectedOrder.number} a nueva Cuenta #${splitOrderNum}`,
            },
          ],
        }));

        loadOrderIntoDraft(splitOrder);
        notify(`Nueva Cuenta #${splitOrderNum} creada con ${item.name}.`);
      },
    });
  };

  // Move table
  const handleMoveTable = () => {
    if (!selectedOrder) {
      notify('Selecciona o guarda una cuenta antes de cambiar de mesa.');
      return;
    }
    const currentLoc = `${serviceName(selectedOrder.service)} ${selectedOrder.location}`;
    setPromptModal({
      title: 'Cambiar de mesa / ubicación',
      label: `Mover Cuenta #${selectedOrder.number} (Actualmente en ${currentLoc}) a número de mesa (1-8) o banco:`,
      defaultValue: '2',
      onConfirm: (targetTable) => {
        const now = new Date().toISOString();
        const updatedOrders = state.orders.map((o) =>
          o.id === selectedOrder.id ? { ...o, location: targetTable.trim(), table: targetTable.trim(), updatedAt: now } : o
        );
        setState((prev) => ({
          ...prev,
          orders: updatedOrders,
          audit: [
            ...prev.audit,
            {
              id: uid(),
              at: now,
              user: prev.activeUser.name,
              action: 'Mesa cambiada',
              detail: `Cuenta #${selectedOrder.number}: ${currentLoc} → ${serviceName(selectedOrder.service)} ${targetTable.trim()}`,
            },
          ],
        }));
        setCurrentTable(targetTable.trim());
        notify(`Cuenta movida a ${serviceName(selectedOrder.service)} ${targetTable.trim()}.`);
      },
    });
  };

  // Cancel whole account
  const handleCancelAccount = () => {
    if (!selectedOrder) {
      notify('No hay una cuenta activa para cancelar.');
      return;
    }
    setModalReason({
      title: `Cancelar Cuenta #${selectedOrder.number} completa`,
      onConfirm: (reason) => {
        const now = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          orders: prev.orders.filter((o) => o.id !== selectedOrder.id),
          audit: [
            ...prev.audit,
            {
              id: uid(),
              at: now,
              user: prev.activeUser.name,
              action: 'Cuenta cancelada',
              detail: `Cuenta #${selectedOrder.number} en ${locationLabel(selectedOrder.service, selectedOrder.location)} por $${(selectedOrder.totalCents / 100).toFixed(2)}`,
              reason,
            },
          ],
        }));
        startNewAccount();
        notify(`Cuenta #${selectedOrder.number} cancelada y registrada en bitácora.`);
      },
    });
  };

  // Apply discount
  const handleApplyDiscount = () => {
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
            const now = new Date().toISOString();
            const sub = subtotalCents(selectedOrder.items);
            const nextTotal = Math.max(0, sub - discountCents);
            const updated = state.orders.map((o) =>
              o.id === selectedOrder.id ? { ...o, discountCents, totalCents: nextTotal, updatedAt: now } : o
            );
            setState((prev) => ({
              ...prev,
              orders: updated,
              audit: [
                ...prev.audit,
                {
                  id: uid(),
                  at: now,
                  user: prev.activeUser.name,
                  action: 'Descuento autorizado',
                  detail: `Descuento de ${formatMoney(discountCents)} aplicado a Cuenta #${selectedOrder.number}`,
                  reason,
                },
              ],
            }));
            notify(`Descuento de ${formatMoney(discountCents)} aplicado.`);
          },
        });
      },
    });
  };

  // Execute payment in cashier
  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrderId) {
      notify('Selecciona una cuenta pendiente de cobro.');
      return;
    }
    const order = state.orders.find((o) => o.id === payOrderId && !o.paid);
    if (!order) {
      notify('Cuenta no encontrada o ya está cobrada.');
      return;
    }

    const cashVal = Number(cashTendered) ? Math.round(Number(cashTendered) * 100) : undefined;
    const change = cashVal && cashVal > order.totalCents ? cashVal - order.totalCents : 0;

    try {
      const nextState = closeAndPayOrder(state, {
        orderId: order.id,
        paymentMethod,
        amountCash: paymentMethod === 'efectivo' ? order.totalCents : undefined,
        amountCard: paymentMethod === 'tarjeta' ? order.totalCents : undefined,
      });

      setState(nextState);
      const sale = nextState.sales[nextState.sales.length - 1];
      setActiveReceiptSale(sale);
      setPayOrderId('');
      setCashTendered('');
      notify(`Cobro registrado con éxito. Folio: ${sale.receipt}${change > 0 ? ` · Cambio: ${formatMoney(change)}` : ''}`);
    } catch (err: any) {
      notify(err.message || 'Error al procesar cobro');
    }
  };

  // Perform Cash Cut (Corte de Turno)
  const handlePerformCashCut = () => {
    const counted = Number(physicalCashCount);
    if (!Number.isFinite(counted) || counted < 0) {
      notify('Ingresa el monto del conteo físico de efectivo en caja.');
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

    setState((prev) => ({
      ...prev,
      shift,
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: new Date().toISOString(),
          user: prev.activeUser.name,
          action: 'Corte de caja Z',
          detail,
        },
      ],
    }));

    notify(`Corte de turno completado: ${detail}`);
  };

  // Reopen Last Sale
  const handleReopenLastSale = () => {
    const lastSale = state.sales[state.sales.length - 1];
    if (!lastSale) {
      notify('No hay ventas registradas para reabrir.');
      return;
    }

    setModalReason({
      title: `Reabrir venta ${lastSale.receipt}`,
      onConfirm: (reason) => {
        const now = new Date().toISOString();
        const reopenedNum = state.nextOrderNumber;
        const newOrderId = uid();

        const reopenedOrder: Order = {
          id: newOrderId,
          number: reopenedNum,
          service: lastSale.service,
          location: lastSale.location,
          table: lastSale.location,
          waiter: lastSale.waiter,
          note: `Reapertura derivada de ${lastSale.receipt}`,
          items: lastSale.items.map((i) => ({ ...i })),
          totalCents: lastSale.totalCents,
          discountCents: 0,
          priority: 'normal',
          status: 'sent',
          paid: false,
          createdAt: now,
          updatedAt: now,
        };

        setState((prev) => ({
          ...prev,
          orders: [...prev.orders, reopenedOrder],
          nextOrderNumber: reopenedNum + 1,
          audit: [
            ...prev.audit,
            {
              id: uid(),
              at: now,
              user: prev.activeUser.name,
              action: 'Venta reabierta',
              detail: `Nueva cuenta #${reopenedNum} creada a partir de venta ${lastSale.receipt}`,
              reason,
            },
          ],
        }));

        loadOrderIntoDraft(reopenedOrder);
        notify(`Venta reabierta como Cuenta #${reopenedNum}.`);
      },
    });
  };

  // Export CSV
  const handleExportSalesCsv = () => {
    if (state.sales.length === 0) {
      notify('No hay ventas para exportar.');
      return;
    }
    const headers = [
      'Folio',
      'Fecha',
      'Hora',
      'Servicio',
      'Ubicación',
      'Mesero',
      'Clave',
      'Producto',
      'Cantidad',
      'Precio_Unitario_MXN',
      'Subtotal_MXN',
      'Metodo_Pago',
      'Descuento_MXN',
      'Total_MXN',
    ];

    const rows: string[][] = [headers];
    state.sales.forEach((s) => {
      const dateObj = new Date(s.paidAt);
      const d = dateObj.toLocaleDateString('es-MX');
      const t = dateObj.toLocaleTimeString('es-MX');
      s.items.forEach((i) => {
        rows.push([
          s.receipt,
          d,
          t,
          serviceName(s.service),
          s.location,
          s.waiter,
          i.key,
          i.name,
          String(i.qty),
          (i.priceCents / 100).toFixed(2),
          (lineTotalCents(i) / 100).toFixed(2),
          s.paymentMethod.toUpperCase(),
          (s.discountCents / 100).toFixed(2),
          (s.totalCents / 100).toFixed(2),
        ]);
      });
    });

    const csvContent = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barbachu-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Reporte de ventas exportado a CSV.');
  };

  // Inventory Stock Adjustment or Intake or MinStock change
  const handleSaveInventoryMovement = () => {
    if (!inventoryModal) return;
    const qtyNum = Number(invQty);
    const costNum = Number(invCost) || 0;
    const now = new Date().toISOString();

    const currentItem = state.inventory[inventoryModal.clave] || {
      clave: inventoryModal.clave,
      descripcion: inventoryModal.descripcion,
      unidad: 'PZA',
      categoria: 'GENERAL',
      costo: costNum,
      stock: 0,
      minStock: 5,
    };

    if (inventoryModal.type === 'minStock') {
      if (!Number.isFinite(qtyNum) || qtyNum < 0) {
        notify('Ingresa un umbral de stock mínimo válido.');
        return;
      }
      const updatedItem: InventoryItem = {
        ...currentItem,
        minStock: qtyNum,
      };
      setState((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          [inventoryModal.clave]: updatedItem,
        },
        audit: [
          ...prev.audit,
          {
            id: uid(),
            at: now,
            user: prev.activeUser.name,
            action: 'Alerta de inventario modificada',
            detail: `${inventoryModal.descripcion}: umbral mínimo fijado a ${qtyNum} ${currentItem.unidad}`,
          },
        ],
      }));
      setInventoryModal(null);
      setInvQty('');
      notify(`Umbral de alerta actualizado a ${qtyNum} ${currentItem.unidad}.`);
      return;
    }

    if (!Number.isFinite(qtyNum) || qtyNum === 0) {
      notify('Ingresa una cantidad válida.');
      return;
    }

    let newStock = currentItem.stock;
    if (inventoryModal.type === 'entrada') {
      newStock += qtyNum;
    } else {
      newStock = qtyNum; // Ajuste directo al stock contado
    }

    const updatedItem: InventoryItem = {
      ...currentItem,
      stock: Math.max(0, newStock),
      costo: costNum > 0 ? costNum : currentItem.costo,
    };

    const mov = {
      id: uid(),
      at: now,
      clave: inventoryModal.clave,
      descripcion: inventoryModal.descripcion,
      type: inventoryModal.type,
      qty: qtyNum,
      costUnit: costNum,
      reason: invReason.trim() || 'Ajuste operativo',
      user: state.activeUser.name,
    };

    setState((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [inventoryModal.clave]: updatedItem,
      },
      inventoryMovements: [...prev.inventoryMovements, mov],
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: `Inventario: ${inventoryModal.type.toUpperCase()}`,
          detail: `${inventoryModal.descripcion} (${currentItem.unidad}) · ${inventoryModal.type === 'entrada' ? `+${qtyNum}` : `fijado a ${qtyNum}`} · Nuevo stock: ${updatedItem.stock}`,
          reason: invReason,
        },
      ],
    }));

    setInventoryModal(null);
    setInvQty('');
    setInvCost('');
    setInvReason('');
    notify(`Inventario actualizado: ${inventoryModal.descripcion} ahora tiene ${updatedItem.stock} ${updatedItem.unidad}.`);
  };

  // Permissions & PIN protected navigation
  const handleNavigateToAdmin = () => {
    const userRole = state.activeUser.role;
    const canAccess = state.permissions?.[userRole]?.canEditCatalog ?? (userRole === 'admin');
    if (canAccess) {
      setView('admin');
    } else {
      setPromptModal({
        title: '🔒 Acceso Protegido con PIN',
        label: `El usuario actual (${state.activeUser.name}) no tiene permisos directos para administración. Ingresa el PIN de Administrador (ej. 1234):`,
        defaultValue: '',
        onConfirm: (pinVal) => {
          const adminUser = state.users?.find((u) => u.role === 'admin');
          const adminPin = adminUser?.pin || '1234';
          if (pinVal.trim() === adminPin) {
            setView('admin');
            notify('Acceso autorizado por Administrador.');
          } else {
            notify('PIN incorrecto. Acceso restringido al Administrador.');
          }
        },
      });
    }
  };

  const handleOpenUserSwitcher = () => {
    setSelectedSwitchUser(state.users?.[0] || null);
    setSwitchPinInput('');
    setUserSwitchModal(true);
  };

  const handleConfirmUserSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSwitchUser) return;
    if (switchPinInput.trim() !== selectedSwitchUser.pin) {
      notify('PIN incorrecto para este usuario.');
      return;
    }
    setState((prev) => ({ ...prev, activeUser: selectedSwitchUser }));
    setUserSwitchModal(false);
    setSwitchPinInput('');
    notify(`Sesión iniciada como: ${selectedSwitchUser.name} (${selectedSwitchUser.area || selectedSwitchUser.role}).`);
  };

  // Total sales calculated
  const totalSalesCents = useMemo(() => {
    return state.sales.reduce((sum, s) => sum + s.totalCents, 0);
  }, [state.sales]);

  // Tables map overview
  const tableLocations = useMemo(() => {
    return [
      ...Array.from({ length: 8 }, (_, i) => ({ service: 'mesa' as ServiceType, loc: String(i + 1), label: `Mesa ${i + 1}`, section: 'Salón Principal' })),
      ...Array.from({ length: 6 }, (_, i) => ({ service: 'barra_exterior' as ServiceType, loc: String(i + 1), label: `Banco Terraza ${i + 1}`, section: 'Barra Exterior' })),
      ...Array.from({ length: 3 }, (_, i) => ({ service: 'barra_interior' as ServiceType, loc: String(i + 1), label: `Banco Interior ${i + 1}`, section: 'Barra Interior' })),
      { service: 'para_llevar' as ServiceType, loc: '0', label: 'Mostrador / Para llevar', section: 'Mostrador' },
      { service: 'domicilio' as ServiceType, loc: '0', label: 'Pedidos a Domicilio', section: 'Reparto' },
    ];
  }, []);

  const totalOccupiedTables = useMemo(() => {
    const locs = new Set(openOrders.map((o) => `${o.service}-${o.location}`));
    return locs.size;
  }, [openOrders]);

  return (
    <div className="pos-app">
      {/* Sidebar Desktop */}
      <aside className="pos-sidebar">
        <div>
          <div className="pos-brand">
            <BarbachuLogo className="w-10 h-auto drop-shadow-[0_0_12px_rgba(200,168,75,0.3)]" />
            <div>
              <h1>BARBACHU</h1>
              <p>Restaurante Bar · POS</p>
            </div>
          </div>

          <nav className="pos-nav">
            <button
              type="button"
              className={`pos-nav-btn ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => setView('dashboard')}
            >
              <span className="ico">📊</span> Resumen General
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'pos' ? 'active' : ''}`}
              onClick={() => setView('pos')}
            >
              <span className="ico">🧾</span> Punto de Venta
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'tables' ? 'active' : ''}`}
              onClick={() => setView('tables')}
            >
              <span className="ico">🍽️</span> Mapa de Mesas
              {totalOccupiedTables > 0 && (
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#d4af37] text-black font-bold">
                  {totalOccupiedTables}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'kitchen' ? 'active' : ''}`}
              onClick={() => setView('kitchen')}
            >
              <span className="ico">🔥</span> Cocina & Barra KDS
              {openOrders.length > 0 && (
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#e05252] text-white font-bold">
                  {openOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'cash' ? 'active' : ''}`}
              onClick={() => setView('cash')}
            >
              <span className="ico">💵</span> Caja & Cobros
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'inventory' ? 'active' : ''}`}
              onClick={() => setView('inventory')}
            >
              <span className="ico">📦</span> Control de Inventario
              {lowStockItems.length > 0 && (
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#e05252] text-white font-bold animate-pulse" title={`${lowStockItems.length} insumos con stock bajo`}>
                  ⚠️ {lowStockItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'reports' ? 'active' : ''}`}
              onClick={() => setView('reports')}
            >
              <span className="ico">📈</span> Reportes de Venta
            </button>
            <button
              type="button"
              className={`pos-nav-btn ${view === 'admin' ? 'active' : ''}`}
              onClick={handleNavigateToAdmin}
            >
              <span className="ico">⚙️</span> Administración & Precios
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-[#2b303c] space-y-3">
          {onSwitchToMenu && (
            <button
              type="button"
              className="w-full py-2.5 px-3 rounded-xl border border-[#d4af37]/40 bg-[#1e222b] text-[#eed889] text-xs font-bold hover:bg-[#d4af37]/20 transition-all flex items-center justify-center gap-2"
              onClick={onSwitchToMenu}
            >
              <span>📖</span> Ver Menú de Clientes
            </button>
          )}
          <div
            onClick={handleOpenUserSwitcher}
            className="flex items-center gap-2.5 px-2 py-1 bg-[#16191f] rounded-xl border border-[#2b303c] cursor-pointer hover:border-[#d4af37] transition-colors"
            title="Cambiar usuario o PIN"
          >
            <div className="w-8 h-8 rounded-full bg-[#173c34] text-[#eed889] font-bold text-xs flex items-center justify-center border border-[#d4af37]/40">
              {state.activeUser.avatar}
            </div>
            <div className="text-left overflow-hidden">
              <div className="text-xs font-bold text-white truncate">{state.activeUser.name}</div>
              <div className="text-[10px] text-[#8b92a0] uppercase">{state.activeUser.role} · PIN</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pos-main">
        {/* Top Operational Bar */}
        <header className="pos-topbar">
          <div className="flex items-center gap-3">
            <h2>
              <span key={view}>
                {view === 'dashboard'
                  ? 'Resumen Operativo'
                  : view === 'pos'
                  ? 'Punto de Venta · Comandas'
                  : view === 'tables'
                  ? 'Salón & Barra · Estado de Ubicaciones'
                  : view === 'kitchen'
                  ? 'Comandero de Cocina & Barra (KDS)'
                  : view === 'cash'
                  ? 'Control de Caja & Movimientos'
                  : view === 'inventory'
                  ? 'Inventario de Insumos SoftRestaurant'
                  : view === 'reports'
                  ? 'Reportes & Estadísticas de Ventas'
                  : 'Administración · Precios, Productos y Archivos'}
              </span>
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#122822] text-[#25d366] border border-[#25d366]/30">
              <span className="w-2 h-2 rounded-full bg-[#25d366] animate-pulse"></span>
              SISTEMA OPERATIVO ACTIVO
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-xs font-mono text-[#8b92a0]">
              {new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {onSwitchToMenu && (
              <button
                type="button"
                onClick={onSwitchToMenu}
                className="px-3 py-1.5 rounded-lg border border-[#d4af37]/50 text-[#eed889] bg-[#1e222b] text-xs font-bold hover:bg-[#d4af37]/20 transition-all sm:hidden"
              >
                📖 Menú
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenUserSwitcher}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs font-semibold text-white hover:border-[#d4af37]"
              title="Cambiar usuario activo o PIN"
            >
              <span className="w-5 h-5 rounded-full bg-[#173c34] text-[#eed889] text-[10px] font-bold flex items-center justify-center">
                {state.activeUser.avatar}
              </span>
              <span className="hidden sm:inline">{state.activeUser.name.split(' ')[0]}</span>
              <span className="text-[10px] text-[#d4af37]">⇄</span>
            </button>
          </div>
        </header>

        {/* View Switcher Container */}
        <div className="pos-content">
          {/* VIEW 1: DASHBOARD */}
          {view === 'dashboard' && (
            <div className="space-y-6">
              {/* Critical Inventory Alert Banner if low stock exists */}
              {lowStockItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#e05252]/20 via-[#1e222b] to-[#16191f] border border-[#e05252]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-bounce">⚠️</span>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Alerta de Inventario Crítico</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#e05252] text-white">
                          {lowStockItems.length} insumo{lowStockItems.length > 1 ? 's' : ''} bajo mínimo
                        </span>
                      </h4>
                      <p className="text-xs text-[#eed889] mt-0.5">
                        Insumos en nivel bajo:{' '}
                        {lowStockItems.slice(0, 4).map((i) => `${i.descripcion} (${i.stock} ${i.unidad})`).join(', ')}
                        {lowStockItems.length > 4 ? ` y ${lowStockItems.length - 4} más...` : '.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyLowStock(true);
                      setView('inventory');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#e05252] hover:bg-[#c93b3b] text-white text-xs font-bold transition-all shadow-md whitespace-nowrap"
                  >
                    Ver Insumos en Alerta →
                  </button>
                </div>
              )}

              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="text-xs uppercase tracking-wider text-[#8b92a0] font-bold mb-1">Ventas del Día</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#eed889]">{formatMoney(totalSalesCents)}</div>
                  <div className="text-[11px] text-[#8b92a0] mt-1">{state.sales.length} transacciones cobradas</div>
                </div>
                <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="text-xs uppercase tracking-wider text-[#8b92a0] font-bold mb-1">Cuentas Abiertas</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-white">{openOrders.length}</div>
                  <div className="text-[11px] text-[#8b92a0] mt-1">{totalOccupiedTables} ubicaciones con consumo</div>
                </div>
                <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="text-xs uppercase tracking-wider text-[#8b92a0] font-bold mb-1">Ocupación Salón</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#25d366]">
                    {openOrders.filter((o) => o.service === 'mesa').length} / 8
                  </div>
                  <div className="text-[11px] text-[#8b92a0] mt-1">Mesas con clientes en sala</div>
                </div>
                <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="text-xs uppercase tracking-wider text-[#8b92a0] font-bold mb-1">Pendientes KDS</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#e05252]">
                    {openOrders.filter((o) => ['sent', 'preparing'].includes(o.status)).length}
                  </div>
                  <div className="text-[11px] text-[#8b92a0] mt-1">Comandas en cocina y barra</div>
                </div>
              </div>

              {/* Quick Actions & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick actions */}
                <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
                  <h3 className="font-serif font-bold text-lg text-white mb-4">Accesos Rápidos</h3>
                  <button
                    type="button"
                    onClick={() => {
                      startNewAccount();
                      setView('pos');
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] transition-all"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-xl">🧾</span>
                      <div>
                        <div className="text-sm font-bold text-white">Nueva Comanda / Venta</div>
                        <div className="text-xs text-[#8b92a0]">Tomar orden con catálogo activo de {state.products.length} productos</div>
                      </div>
                    </div>
                    <span className="text-sm text-[#d4af37] font-bold">→</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView('tables')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] transition-all"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-xl">🍽️</span>
                      <div>
                        <div className="text-sm font-bold text-white">Ver Mapa de Mesas y Barra</div>
                        <div className="text-xs text-[#8b92a0]">Supervisar salón, terraza exterior y barra interior</div>
                      </div>
                    </div>
                    <span className="text-sm text-[#d4af37] font-bold">→</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView('admin')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] transition-all"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-xl">🏷️</span>
                      <div>
                        <div className="text-sm font-bold text-white">Cambiar Precios y Agregar Productos</div>
                        <div className="text-xs text-[#eed889]">Gestión administrativa de catálogo y nuevos platillos</div>
                      </div>
                    </div>
                    <span className="text-sm text-[#d4af37] font-bold">→</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setView('cash')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] transition-all"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <span className="text-xl">💵</span>
                      <div>
                        <div className="text-sm font-bold text-white">Cobrar Cuenta & Corte de Caja</div>
                        <div className="text-xs text-[#8b92a0]">Efectivo, tarjeta, arqueo de turno e imprimir tickets</div>
                      </div>
                    </div>
                    <span className="text-sm text-[#d4af37] font-bold">→</span>
                  </button>
                </div>

                {/* Recent Activity */}
                <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif font-bold text-lg text-white">Comandas Activas en Sala</h3>
                    <span className="text-xs text-[#8b92a0]">{openOrders.length} cuentas pendientes</span>
                  </div>
                  {openOrders.length === 0 ? (
                    <div className="text-center py-12 text-[#8b92a0] text-sm">
                      No hay comandas activas en este momento. Abre una mesa o toma un pedido en Punto de Venta.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                      {openOrders.slice().reverse().map((order) => (
                        <div
                          key={order.id}
                          onClick={() => loadOrderIntoDraft(order)}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-[#1e222b] border border-[#2b303c] hover:border-[#d4af37] cursor-pointer transition-all"
                        >
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>Cuenta #{order.number}</span>
                              <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                              {order.priority === 'alta' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#e05252] text-white font-bold">ALTA</span>
                              )}
                            </div>
                            <div className="text-xs text-[#8b92a0] mt-0.5">
                              {order.waiter} · {order.items.reduce((s, i) => s + i.qty, 0)} productos · {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-sm text-[#eed889]">{formatMoney(order.totalCents)}</div>
                            <span className="text-[10px] font-bold text-[#8b92a0] uppercase">{order.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Sales, Top Products and Performance Analytics with Recharts */}
              <div className="pt-2">
                <PosAnalyticsDashboard state={state} />
              </div>
            </div>
          )}

          {/* VIEW 2: POS / COMANDERO */}
          {view === 'pos' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Product catalog column */}
              <div className="xl:col-span-7 2xl:col-span-8 space-y-4">
                {/* Search and filters toolbar */}
                <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre, clave (ej. 701, 729) o categoría..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-sm text-white placeholder-[#8b92a0] focus:outline-none focus:border-[#d4af37]"
                    />
                    <span className="absolute left-3.5 top-3 text-[#8b92a0]">🔍</span>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-2.5 text-xs text-[#8b92a0] hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Category chips */}
                  <div className="pos-chips">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`pos-chip ${selectedCategory === cat ? 'active' : ''}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product items grid */}
                <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="flex items-center justify-between mb-3 text-xs text-[#8b92a0]">
                    <span>Mostrando {filteredProducts.length} productos ({selectedCategory})</span>
                    <button
                      type="button"
                      onClick={handleNavigateToAdmin}
                      className="text-[#eed889] hover:underline font-semibold"
                    >
                      ⚙️ Administrar Precios y Catálogo
                    </button>
                  </div>
                  {filteredProducts.length === 0 ? (
                    <div className="py-16 text-center text-[#8b92a0] text-sm">
                      No se encontraron productos con el filtro "{searchQuery}".
                    </div>
                  ) : (
                    <div className="pos-product-grid">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          disabled={!p.saleEnabled}
                          onClick={() => handleAddProduct(p)}
                          className="pos-prod-card"
                        >
                          <div>
                            <div className="prod-key">Clave {p.key} · {p.category}</div>
                            <div className="prod-name">{p.name}</div>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2b303c]">
                            <span className="prod-price">
                              {p.saleEnabled ? formatMoney(p.priceCents) : 'Sin precio'}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-[#173c34] text-[#25d366] font-bold">
                              +
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Order builder / Cart sidebar */}
              <div className="xl:col-span-5 2xl:col-span-4 p-5 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#2b303c]">
                  <div>
                    <h3 className="font-serif font-bold text-lg text-white">
                      {currentOrderId ? `Cuenta #${selectedOrder?.number || ''}` : 'Nueva Comanda'}
                    </h3>
                    <p className="text-xs text-[#8b92a0]">{locationLabel(currentService, currentTable)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={startNewAccount}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1e222b] hover:bg-[#2b303c] text-white border border-[#2b303c]"
                      title="Crear nueva cuenta independiente"
                    >
                      + Nueva
                    </button>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#e05252]/20 text-[#e05252] hover:bg-[#e05252]/30"
                      >
                        Vaciar
                      </button>
                    )}
                  </div>
                </div>

                {/* Location & Service selector */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[#8b92a0] mb-1 font-semibold">Tipo de Servicio</label>
                    <select
                      value={currentService}
                      onChange={(e) => {
                        const s = e.target.value as ServiceType;
                        setCurrentService(s);
                        const opts = locationOptions(s);
                        setCurrentTable(opts[0].value);
                        setCurrentOrderId(null);
                        setCart([]);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white focus:outline-none focus:border-[#d4af37]"
                    >
                      <option value="mesa">Mesa (Salón)</option>
                      <option value="barra_exterior">Barra Exterior</option>
                      <option value="barra_interior">Barra Interior</option>
                      <option value="para_llevar">Para Llevar</option>
                      <option value="domicilio">A Domicilio</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#8b92a0] mb-1 font-semibold">Ubicación / Mesa</label>
                    <select
                      value={currentTable}
                      onChange={(e) => {
                        setCurrentTable(e.target.value);
                        setCurrentOrderId(null);
                        setCart([]);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white focus:outline-none focus:border-[#d4af37]"
                    >
                      {locationOptions(currentService).map((opt) => {
                        const count = state.orders.filter(
                          (o) => o.status !== 'closed' && o.service === currentService && String(o.location) === opt.value
                        ).length;
                        return (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} {count > 0 ? `· (${count} abierta${count > 1 ? 's' : ''})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Account in table selector if multiple accounts exist */}
                {currentLocOrders.length > 0 && (
                  <div className="text-xs">
                    <label className="block text-[#8b92a0] mb-1 font-semibold">Cuentas Abiertas en esta Ubicación</label>
                    <select
                      value={currentOrderId || ''}
                      onChange={(e) => {
                        const ord = state.orders.find((o) => o.id === e.target.value);
                        if (ord) loadOrderIntoDraft(ord);
                        else startNewAccount();
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#d4af37]/40 text-[#eed889] font-bold focus:outline-none"
                    >
                      <option value="">+ Preparar Nueva Cuenta Independiente</option>
                      {currentLocOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          Cuenta #{o.number} · {o.waiter} · {formatMoney(o.totalCents)} ({o.items.length} productos)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Waiter & Priority */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[#8b92a0] mb-1 font-semibold">Mesero</label>
                    <input
                      type="text"
                      value={waiter}
                      onChange={(e) => setWaiter(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8b92a0] mb-1 font-semibold">Prioridad</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                      className={`w-full px-3 py-2 rounded-xl bg-[#1e222b] border text-white font-semibold focus:outline-none ${priority === 'alta' ? 'border-[#e05252] text-[#e05252]' : 'border-[#2b303c]'}`}
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">🔥 Alta Prioridad</option>
                    </select>
                  </div>
                </div>

                {/* Domicilio customer data fields if delivery service is chosen */}
                {currentService === 'domicilio' && (
                  <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2 text-xs">
                    <div className="font-bold text-[#eed889]">Datos de Entrega a Domicilio</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Nombre del cliente *"
                        value={deliveryData.name}
                        onChange={(e) => setDeliveryData((prev) => ({ ...prev, name: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg bg-[#16191f] border border-[#2b303c] text-white"
                      />
                      <input
                        placeholder="Teléfono *"
                        value={deliveryData.phone}
                        onChange={(e) => setDeliveryData((prev) => ({ ...prev, phone: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg bg-[#16191f] border border-[#2b303c] text-white"
                      />
                    </div>
                    <input
                      placeholder="Dirección completa y calle *"
                      value={deliveryData.address}
                      onChange={(e) => setDeliveryData((prev) => ({ ...prev, address: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#16191f] border border-[#2b303c] text-white"
                    />
                    <input
                      placeholder="Referencia (ej. Portón negro, entre calle X e Y)"
                      value={deliveryData.reference}
                      onChange={(e) => setDeliveryData((prev) => ({ ...prev, reference: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#16191f] border border-[#2b303c] text-white"
                    />
                  </div>
                )}

                {/* Cart items list */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <div className="py-12 text-center text-[#8b92a0] text-xs">
                      Selecciona productos del catálogo para agregarlos a la comanda.
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.key} className="p-3 rounded-xl bg-[#1e222b] border border-[#2b303c] space-y-1.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-xs font-bold text-white">{item.name}</div>
                            <div className="text-[11px] text-[#8b92a0]">
                              Clave {item.key} · {formatMoney(item.priceCents)} c/u
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.key, -1)}
                              className="w-7 h-7 rounded-lg bg-[#16191f] border border-[#2b303c] text-white font-bold flex items-center justify-center hover:bg-[#2b303c]"
                            >
                              −
                            </button>
                            <span className="font-bold text-xs text-white min-w-[16px] text-center">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.key, 1)}
                              className="w-7 h-7 rounded-lg bg-[#16191f] border border-[#2b303c] text-white font-bold flex items-center justify-center hover:bg-[#2b303c]"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {item.note && (
                          <div className="text-[11px] text-[#eed889] bg-[#16191f] px-2 py-1 rounded">
                            📝 Nota: {item.note}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-[#2b303c]/60 text-[11px]">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditItemNote(item.key)}
                              className="text-[#8b92a0] hover:text-[#eed889]"
                            >
                              Editar nota
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelItem(item.key)}
                              className="text-[#e05252] hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                          <span className="font-mono font-bold text-white">
                            {formatMoney(lineTotalCents(item))}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* General order note */}
                <div>
                  <input
                    type="text"
                    value={generalNote}
                    onChange={(e) => setGeneralNote(e.target.value)}
                    placeholder="Nota general para cocina (ej. Sin hielo en bebidas)..."
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs text-white placeholder-[#8b92a0] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                {/* Subtotals & Total */}
                <div className="pt-3 border-t border-[#2b303c] space-y-1 text-xs">
                  <div className="flex justify-between text-[#8b92a0]">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotalCents(cart))}</span>
                  </div>
                  {selectedOrder && selectedOrder.discountCents > 0 && (
                    <div className="flex justify-between text-[#25d366] font-bold">
                      <span>Descuento autorizado</span>
                      <span>- {formatMoney(selectedOrder.discountCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-white pt-1">
                    <span>Total a pagar</span>
                    <span className="font-mono text-[#eed889]">
                      {formatMoney(totalCents(cart, selectedOrder?.discountCents || 0))}
                    </span>
                  </div>
                </div>

                {/* Primary Action Button: Send to kitchen */}
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleSendOrder}
                  className="w-full py-3.5 rounded-xl bg-[#173c34] hover:bg-[#28584c] text-white font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-[#d4af37]/40 flex items-center justify-center gap-2"
                >
                  <span>🔥</span> Enviar Comanda a Cocina
                </button>

                {/* Secondary management actions */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <button
                    type="button"
                    onClick={handleMoveTable}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-white border border-[#2b303c] font-semibold"
                  >
                    🔄 Mover Mesa
                  </button>
                  <button
                    type="button"
                    onClick={handleSplitOrder}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-white border border-[#2b303c] font-semibold"
                  >
                    ✂️ Dividir Cuenta
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDiscount}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-[#eed889] border border-[#2b303c] font-semibold"
                  >
                    🏷️ Descuento
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAccount}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-[#e05252] border border-[#2b303c] font-semibold"
                  >
                    🚫 Cancelar Cuenta
                  </button>
                </div>

                {/* Pay button (routes directly to cash) */}
                {currentOrderId && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayOrderId(currentOrderId);
                      setView('cash');
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#eed889] text-black font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <span>💵</span> Pasar a Cobrar en Caja
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: TABLES MAP */}
          {view === 'tables' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Mapa del Restaurante y Barra</h3>
                  <p className="text-xs text-[#8b92a0]">
                    Toca cualquier mesa o banco para ver sus cuentas abiertas o abrir una nueva comanda.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[#122822] text-[#25d366] font-semibold">
                    ● Disponible
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[#2b2512] text-[#eed889] font-semibold">
                    ● Ocupada con cuenta
                  </span>
                </div>
              </div>

              {['Salón Principal', 'Barra Exterior', 'Barra Interior', 'Mostrador', 'Reparto'].map((sec) => {
                const locs = tableLocations.filter((t) => t.section === sec);
                return (
                  <div key={sec} className="space-y-3">
                    <h4 className="text-xs uppercase tracking-wider font-bold text-[#8b92a0] px-1">{sec}</h4>
                    <div className="table-map-grid">
                      {locs.map((loc) => {
                        const ordersAtLoc = state.orders.filter(
                          (o) => o.status !== 'closed' && o.service === loc.service && String(o.location) === loc.loc
                        );
                        const isBusy = ordersAtLoc.length > 0;
                        const totalLoc = ordersAtLoc.reduce((sum, o) => sum + o.totalCents, 0);

                        return (
                          <div
                            key={`${loc.service}-${loc.loc}`}
                            onClick={() => {
                              setCurrentService(loc.service);
                              setCurrentTable(loc.loc);
                              if (ordersAtLoc.length > 0) {
                                loadOrderIntoDraft(ordersAtLoc[0]);
                              } else {
                                startNewAccount();
                                setView('pos');
                              }
                            }}
                            className={`table-tile ${isBusy ? 'busy' : 'free'}`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-white">{loc.label}</span>
                                <span className={`w-2.5 h-2.5 rounded-full ${isBusy ? 'bg-[#d4af37]' : 'bg-[#25d366]'}`}></span>
                              </div>
                              <p className="text-xs text-[#8b92a0]">
                                {isBusy ? `${ordersAtLoc.length} cuenta(s) activa(s)` : 'Disponible'}
                              </p>
                            </div>

                            <div className="pt-3 border-t border-[#2b303c]/60">
                              <div className="text-[10px] text-[#8b92a0]">Total acumulado</div>
                              <div className="font-mono font-bold text-sm text-[#eed889]">
                                {isBusy ? formatMoney(totalLoc) : '$0.00'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 4: KITCHEN / KDS */}
          {view === 'kitchen' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Comandero de Producción (KDS)</h3>
                  <p className="text-xs text-[#8b92a0]">Avanza cada ticket conforme se prepara y entrega al comensal.</p>
                </div>
                <div className="flex gap-1.5 text-xs">
                  {(['todas', 'cocina', 'barra'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setKitchenStation(st)}
                      className={`px-3 py-1.5 rounded-xl font-bold uppercase transition-all ${
                        kitchenStation === st ? 'bg-[#d4af37] text-black' : 'bg-[#1e222b] text-[#8b92a0] hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kanban Columns */}
              <div className="kds-board">
                {/* Column 1: Recibida */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#e5a43b] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#e5a43b]"></span> RECIBIDAS
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#1e222b] text-white">
                      {openOrders.filter((o) => o.status === 'sent').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'sent').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en espera</div>
                    ) : (
                      openOrders
                        .filter((o) => o.status === 'sent')
                        .map((order) => (
                          <div key={order.id} className={`kds-ticket ${order.priority === 'alta' ? 'priority-alta' : ''}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                  <span>Cuenta #{order.number}</span>
                                  <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                </div>
                                <div className="text-xs text-[#8b92a0]">
                                  {order.waiter} · {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              {order.priority === 'alta' && (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-[#e05252] text-white font-bold">ALTA</span>
                              )}
                            </div>

                            <div className="my-3 py-2 border-y border-[#2b303c] space-y-1.5 text-xs">
                              {order.items
                                .filter((i) => kitchenStation === 'todas' || i.station === kitchenStation)
                                .map((i, idx) => (
                                  <div key={idx} className="flex flex-col">
                                    <div className="flex justify-between font-bold text-white">
                                      <span>{i.qty} × {i.name}</span>
                                      <span className="text-[10px] text-[#8b92a0] uppercase">{i.station}</span>
                                    </div>
                                    {i.note && <span className="text-[11px] text-[#eed889]">Nota: {i.note}</span>}
                                  </div>
                                ))}
                            </div>

                            {order.note && (
                              <p className="text-xs text-[#8b92a0] mb-3 italic">Nota general: {order.note}</p>
                            )}

                            <button
                              type="button"
                              onClick={() => handleAdvanceOrderStatus(order.id, 'sent')}
                              className="w-full py-2 rounded-xl bg-[#e5a43b] hover:bg-[#d4af37] text-black font-bold text-xs"
                            >
                              ▶ Iniciar Preparación
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Column 2: Preparando */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#3b82f6] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span> EN PREPARACIÓN
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#1e222b] text-white">
                      {openOrders.filter((o) => o.status === 'preparing').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'preparing').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en cocción</div>
                    ) : (
                      openOrders
                        .filter((o) => o.status === 'preparing')
                        .map((order) => (
                          <div key={order.id} className={`kds-ticket ${order.priority === 'alta' ? 'priority-alta' : ''}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                  <span>Cuenta #{order.number}</span>
                                  <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                </div>
                                <div className="text-xs text-[#8b92a0]">
                                  {order.waiter} · {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>

                            <div className="my-3 py-2 border-y border-[#2b303c] space-y-1.5 text-xs">
                              {order.items
                                .filter((i) => kitchenStation === 'todas' || i.station === kitchenStation)
                                .map((i, idx) => (
                                  <div key={idx} className="flex flex-col">
                                    <div className="flex justify-between font-bold text-white">
                                      <span>{i.qty} × {i.name}</span>
                                      <span className="text-[10px] text-[#8b92a0] uppercase">{i.station}</span>
                                    </div>
                                    {i.note && <span className="text-[11px] text-[#eed889]">Nota: {i.note}</span>}
                                  </div>
                                ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAdvanceOrderStatus(order.id, 'preparing')}
                              className="w-full py-2 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-xs"
                            >
                              ✓ Marcar Lista
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Column 3: Lista / Entregada */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#25d366] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#25d366]"></span> LISTA PARA ENTREGAR
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#1e222b] text-white">
                      {openOrders.filter((o) => o.status === 'ready').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'ready').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes por servir</div>
                    ) : (
                      openOrders
                        .filter((o) => o.status === 'ready')
                        .map((order) => (
                          <div key={order.id} className="kds-ticket border-[#25d366]/40">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                  <span>Cuenta #{order.number}</span>
                                  <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                </div>
                                <div className="text-xs text-[#8b92a0]">
                                  Mesero: {order.waiter}
                                </div>
                              </div>
                            </div>

                            <div className="my-3 py-2 border-y border-[#2b303c] space-y-1 text-xs">
                              {order.items.map((i, idx) => (
                                <div key={idx} className="font-medium text-white">
                                  {i.qty} × {i.name}
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAdvanceOrderStatus(order.id, 'ready')}
                              className="w-full py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-xs"
                            >
                              🤝 Marcar Entregada en Mesa
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: CASH & SETTLEMENT */}
          {view === 'cash' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Payment Processing Form */}
              <div className="lg:col-span-6 p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#2b303c]">
                  <h3 className="font-serif font-bold text-lg text-white">Módulo de Cobro en Caja</h3>
                  <span className="text-xs text-[#eed889] font-bold">Turno Abierto</span>
                </div>

                <form onSubmit={handleExecutePayment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8b92a0] mb-1">
                      Seleccionar Cuenta Pendiente de Cobro
                    </label>
                    <select
                      value={payOrderId}
                      onChange={(e) => setPayOrderId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-sm text-white focus:outline-none focus:border-[#d4af37]"
                    >
                      <option value="">-- Elige una cuenta por cobrar --</option>
                      {openOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          Cuenta #{o.number} · {locationLabel(o.service, o.location)} · {formatMoney(o.totalCents)} ({o.items.length} productos)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Summary of chosen order */}
                  {payOrderId && (
                    <div className="p-4 rounded-xl bg-[#1e222b] border border-[#2b303c] space-y-2 text-xs">
                      {(() => {
                        const ord = state.orders.find((o) => o.id === payOrderId);
                        if (!ord) return null;
                        return (
                          <>
                            <div className="flex justify-between font-bold text-white text-sm">
                              <span>Cuenta #{ord.number} ({locationLabel(ord.service, ord.location)})</span>
                              <span className="font-mono text-[#eed889]">{formatMoney(ord.totalCents)}</span>
                            </div>
                            <div className="text-[#8b92a0]">Mesero responsable: {ord.waiter}</div>
                            <div className="pt-2 border-t border-[#2b303c] space-y-1">
                              {ord.items.map((i, idx) => (
                                <div key={idx} className="flex justify-between text-[#8b92a0]">
                                  <span>{i.qty} × {i.name}</span>
                                  <span>{formatMoney(lineTotalCents(i))}</span>
                                </div>
                              ))}
                            </div>
                            {ord.discountCents > 0 && (
                              <div className="flex justify-between text-[#25d366] font-bold pt-1">
                                <span>Descuento aplicado</span>
                                <span>- {formatMoney(ord.discountCents)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
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
                  {paymentMethod === 'efectivo' && payOrderId && (
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2">
                      <label className="block text-xs font-semibold text-[#8b92a0]">Efectivo Entregado por Cliente ($)</label>
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
                        const ord = state.orders.find((o) => o.id === payOrderId);
                        const val = Number(cashTendered);
                        if (!ord || !val) return null;
                        const change = val * 100 - ord.totalCents;
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
                    onClick={handleExportSalesCsv}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold"
                  >
                    📥 Exportar Ventas (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={handleReopenLastSale}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-[#eed889] font-bold"
                  >
                    🔄 Reabrir Última Venta
                  </button>
                </div>
              </div>

              {/* Cash Shift Summary & Cut (Corte de Turno) */}
              <div className="lg:col-span-6 space-y-6">
                <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#2b303c]">
                    <h3 className="font-serif font-bold text-lg text-white">Arqueo y Corte de Caja</h3>
                    <span className="text-xs text-[#8b92a0]">
                      Turno iniciado: {new Date(state.shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
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
                      <div className="text-[#8b92a0]">Total Esperado en Efectivo</div>
                      <div className="text-base font-mono font-bold text-[#eed889] mt-1">
                        {formatMoney(state.shift.expectedCashCents)}
                      </div>
                    </div>
                  </div>

                  {/* Physical count input */}
                  <div className="p-4 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2 text-xs">
                    <label className="block text-[#8b92a0] font-semibold">
                      Conteo Físico de Dinero en Cajón ($ MXN)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Ej. 1850.00"
                        value={physicalCashCount}
                        onChange={(e) => setPhysicalCashCount(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handlePerformCashCut}
                        className="px-4 py-2 rounded-xl bg-[#d4af37] text-black font-bold hover:bg-[#eed889]"
                      >
                        Hacer Corte Z
                      </button>
                    </div>
                    {state.shift.closedAt && (
                      <div className="text-xs pt-1">
                        <span className="text-[#8b92a0]">Último corte registrado: </span>
                        <span className="font-bold text-white">
                          Diferencia: {formatMoney(state.shift.differenceCents || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sales history of current shift */}
                <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif font-bold text-base text-white">Historial de Ventas</h3>
                    <span className="text-xs text-[#8b92a0]">{state.sales.length} cobros</span>
                  </div>
                  {state.sales.length === 0 ? (
                    <div className="py-8 text-center text-[#8b92a0] text-xs">Sin ventas cobradas aún en este turno.</div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {state.sales.slice().reverse().map((sale) => (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{sale.receipt}</span>
                              <span className="text-[#8b92a0]">· {locationLabel(sale.service, sale.location)}</span>
                            </div>
                            <div className="text-[11px] text-[#8b92a0]">
                              {sale.paymentMethod.toUpperCase()} · {sale.waiter} · {new Date(sale.paidAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-sm text-[#eed889]">{formatMoney(sale.totalCents)}</span>
                            <button
                              type="button"
                              onClick={() => setActiveReceiptSale(sale)}
                              className="px-2 py-1 rounded bg-[#16191f] border border-[#2b303c] text-[#8b92a0] hover:text-white"
                            >
                              Ticket
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: INVENTORY & STOCK */}
          {view === 'inventory' && (
            <div className="space-y-4">
              {/* Critical Alert banner if low stock exists */}
              {lowStockItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#e05252]/15 border border-[#e05252]/40 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <strong className="text-white font-bold">{lowStockItems.length} insumos con existencia igual o menor al mínimo:</strong>
                      <div className="text-[#eed889] mt-0.5">
                        {lowStockItems.map((i) => `${i.descripcion} (${i.stock} / mín ${i.minStock})`).join(', ')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnlyLowStock(!onlyLowStock)}
                    className="px-3 py-1.5 rounded-lg bg-[#e05252] text-white font-bold hover:bg-[#c93b3b] whitespace-nowrap"
                  >
                    {onlyLowStock ? 'Ver todos los insumos' : 'Filtrar solo críticos'}
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Catálogo de Insumos e Inventario</h3>
                  <p className="text-xs text-[#8b92a0]">
                    121 insumos importados de SoftRestaurant con costos, unidades, compras y umbrales de alerta.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={(e) => setIngredientSearch(e.target.value)}
                    placeholder="Filtrar por insumo o clave..."
                    className="px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs text-white placeholder-[#8b92a0] focus:outline-none focus:border-[#d4af37] w-full sm:w-64"
                  />
                  <button
                    type="button"
                    onClick={() => setOnlyLowStock(!onlyLowStock)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${onlyLowStock ? 'bg-[#e05252] text-white border-[#e05252]' : 'bg-[#1e222b] text-[#8b92a0] border-[#2b303c] hover:text-white'}`}
                  >
                    ⚠️ Alertas ({lowStockItems.length})
                  </button>
                </div>
              </div>

              {/* Insumos table */}
              <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#2b303c] text-[#8b92a0]">
                      <th className="pb-3 pl-2">Clave</th>
                      <th className="pb-3">Descripción</th>
                      <th className="pb-3">Categoría</th>
                      <th className="pb-3">Unidad</th>
                      <th className="pb-3">Costo Origen</th>
                      <th className="pb-3">Existencia Actual</th>
                      <th className="pb-3">Umbral Mínimo (Alerta)</th>
                      <th className="pb-3 pr-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2b303c]/60">
                    {Object.values(state.inventory)
                      .filter((item) => {
                        const matchLow = !onlyLowStock || item.stock <= item.minStock;
                        const q = ingredientSearch.toLowerCase().trim();
                        const matchQ = !q || item.descripcion.toLowerCase().includes(q) || String(item.clave).includes(q) || item.categoria.toLowerCase().includes(q);
                        return matchLow && matchQ;
                      })
                      .map((item) => {
                        const isLow = item.stock <= item.minStock;
                        return (
                          <tr key={item.clave} className={`hover:bg-[#1e222b]/50 ${isLow ? 'bg-[#e05252]/5' : ''}`}>
                            <td className="py-3 pl-2 font-mono text-[#8b92a0]">{item.clave}</td>
                            <td className="py-3 font-bold text-white flex items-center gap-2">
                              {isLow && <span className="text-[#e05252]" title="Stock en nivel crítico">⚠️</span>}
                              <span>{item.descripcion}</span>
                            </td>
                            <td className="py-3 text-[#8b92a0]">{item.categoria}</td>
                            <td className="py-3 font-semibold text-white">{item.unidad}</td>
                            <td className="py-3 font-mono text-[#eed889]">${item.costo.toFixed(2)}</td>
                            <td className="py-3 font-mono font-bold">
                              <span className={isLow ? 'text-[#e05252] bg-[#e05252]/15 px-2 py-0.5 rounded' : 'text-[#25d366]'}>
                                {item.stock} {item.unidad}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-[#8b92a0]">
                              {item.minStock} {item.unidad}
                            </td>
                            <td className="py-3 pr-2 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setInventoryModal({ clave: item.clave, descripcion: item.descripcion, type: 'minStock' });
                                  setInvQty(String(item.minStock));
                                }}
                                className="px-2 py-1 rounded-lg bg-[#1e222b] text-[#eed889] border border-[#2b303c] font-semibold hover:border-[#d4af37]"
                                title="Cambiar límite mínimo de alerta"
                              >
                                🔔 Mínimo
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInventoryModal({ clave: item.clave, descripcion: item.descripcion, type: 'entrada' });
                                  setInvCost(String(item.costo));
                                }}
                                className="px-2 py-1 rounded-lg bg-[#122822] text-[#25d366] border border-[#25d366]/30 font-semibold hover:bg-[#25d366] hover:text-black"
                              >
                                + Compra
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInventoryModal({ clave: item.clave, descripcion: item.descripcion, type: 'ajuste' });
                                  setInvQty(String(item.stock));
                                  setInvCost(String(item.costo));
                                }}
                                className="px-2 py-1 rounded-lg bg-[#1e222b] text-white border border-[#2b303c] font-semibold hover:border-[#d4af37]"
                              >
                                Ajustar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 7: REPORTS & PERFORMANCE ANALYTICS WITH RECHARTS */}
          {view === 'reports' && (
            <PosAnalyticsDashboard state={state} />
          )}

          {/* VIEW 8: ADMIN DASHBOARD */}
          {view === 'admin' && (
            <AdminDashboard
              state={state}
              setState={setState}
              onClose={() => setView('pos')}
              notify={notify}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="pos-mobile-bar">
        <button
          type="button"
          className={`pos-mobile-btn ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          <span>📊</span>
          <span>Resumen</span>
        </button>
        <button
          type="button"
          className={`pos-mobile-btn ${view === 'pos' ? 'active' : ''}`}
          onClick={() => setView('pos')}
        >
          <span>🧾</span>
          <span>Venta</span>
        </button>
        <button
          type="button"
          className={`pos-mobile-btn ${view === 'tables' ? 'active' : ''}`}
          onClick={() => setView('tables')}
        >
          <span>🍽️</span>
          <span>Mesas</span>
        </button>
        <button
          type="button"
          className={`pos-mobile-btn ${view === 'kitchen' ? 'active' : ''}`}
          onClick={() => setView('kitchen')}
        >
          <span>🔥</span>
          <span>Cocina</span>
        </button>
        <button
          type="button"
          className={`pos-mobile-btn ${view === 'cash' ? 'active' : ''}`}
          onClick={() => setView('cash')}
        >
          <span>💵</span>
          <span>Caja</span>
        </button>
      </nav>

      {/* Printable Receipt Modal */}
      {activeReceiptSale && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white text-black rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="font-bold text-base">Ticket de Venta</h3>
              <button
                type="button"
                onClick={() => setActiveReceiptSale(null)}
                className="text-gray-500 hover:text-black font-bold"
              >
                ✕
              </button>
            </div>

            <pre
              id="printable-receipt"
              className="text-[11px] leading-tight font-mono bg-gray-50 p-4 rounded-xl border border-gray-200 overflow-x-auto whitespace-pre"
            >
              {printReceiptText(activeReceiptSale, state.config)}
            </pre>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-[#173c34] text-white font-bold text-xs"
              >
                🖨️ Imprimir Ticket (80mm)
              </button>
              <button
                type="button"
                onClick={() => setActiveReceiptSale(null)}
                className="px-4 py-2.5 rounded-xl bg-gray-200 text-black font-bold text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason Modal (Audited cancellation / discount) */}
      {modalReason && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-md w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-lg text-white">{modalReason.title}</h3>
            <p className="text-xs text-[#8b92a0]">
              Por trazabilidad y control de auditoría, escribe el motivo justificado de esta acción:
            </p>
            <textarea
              autoFocus
              rows={3}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Escribe el motivo aquí..."
              className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white text-xs placeholder-[#8b92a0] focus:outline-none focus:border-[#d4af37]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalReason(null);
                  setReasonInput('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0] hover:bg-[#1e222b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reasonInput.trim()}
                onClick={() => {
                  modalReason.onConfirm(reasonInput.trim());
                  setModalReason(null);
                  setReasonInput('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#d4af37] text-black disabled:opacity-40"
              >
                Confirmar y Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {promptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white">{promptModal.title}</h3>
            <p className="text-xs text-[#8b92a0]">{promptModal.label}</p>
            <input
              autoFocus
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white text-xs focus:outline-none focus:border-[#d4af37]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPromptModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  promptModal.onConfirm(promptValue);
                  setPromptModal(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#d4af37] text-black"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Intake / Adjust / MinStock Modal */}
      {inventoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white">
              {inventoryModal.type === 'entrada'
                ? 'Registrar Compra / Entrada de Insumo'
                : inventoryModal.type === 'ajuste'
                ? 'Ajustar Existencia Física'
                : 'Configurar Umbral de Alerta de Stock Mínimo'}
            </h3>
            <p className="text-xs text-[#eed889] font-bold">{inventoryModal.descripcion}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8b92a0] mb-1">
                  {inventoryModal.type === 'entrada'
                    ? 'Cantidad a ingresar'
                    : inventoryModal.type === 'ajuste'
                    ? 'Nueva existencia contada'
                    : 'Cantidad mínima para activar alerta'}
                </label>
                <input
                  type="number"
                  placeholder="Cantidad"
                  value={invQty}
                  onChange={(e) => setInvQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-mono"
                />
              </div>

              {inventoryModal.type !== 'minStock' && (
                <>
                  <div>
                    <label className="block text-[#8b92a0] mb-1">Costo Unitario ($ MXN)</label>
                    <input
                      type="number"
                      placeholder="Costo"
                      value={invCost}
                      onChange={(e) => setInvCost(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8b92a0] mb-1">Motivo / Proveedor</label>
                    <input
                      type="text"
                      placeholder="Ej. Factura #123, Merma, Conteo semanal..."
                      value={invReason}
                      onChange={(e) => setInvReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInventoryModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInventoryMovement}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#25d366] text-black"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Switcher Modal with 4-digit PIN */}
      {userSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-sm w-full p-6 space-y-4 text-left shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2b303c]">
              <h3 className="font-serif font-bold text-base text-white">Cambiar de Usuario</h3>
              <button
                type="button"
                onClick={() => setUserSwitchModal(false)}
                className="text-[#8b92a0] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmUserSwitch} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">Seleccionar Usuario</label>
                <select
                  value={selectedSwitchUser?.id || ''}
                  onChange={(e) => {
                    const u = (state.users || []).find((x) => x.id === e.target.value);
                    if (u) setSelectedSwitchUser(u);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-semibold"
                >
                  {(state.users || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.toUpperCase()} - {u.area || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">
                  Ingresar PIN de 4 dígitos ({selectedSwitchUser?.name.split(' ')[0]})
                </label>
                <input
                  autoFocus
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={switchPinInput}
                  onChange={(e) => setSwitchPinInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1e222b] border border-[#d4af37] text-white font-mono font-bold text-center tracking-widest text-lg"
                />
                <span className="text-[10px] text-[#8b92a0] block mt-1">
                  PIN predeterminado: {selectedSwitchUser?.pin}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserSwitchModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={switchPinInput.length !== 4}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#d4af37] text-black disabled:opacity-40"
                >
                  Iniciar Sesión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[#173c34] text-white border border-[#25d366]/40 text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
