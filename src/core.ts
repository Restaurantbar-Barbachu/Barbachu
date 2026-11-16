import {
  FullPosState,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Priority,
  Sale,
  ServiceType,
} from './types';

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function serviceName(service: ServiceType): string {
  const map: Record<ServiceType, string> = {
    mesa: 'Mesa',
    barra_exterior: 'Barra exterior',
    barra_interior: 'Barra interior',
    para_llevar: 'Para llevar',
    domicilio: 'A domicilio',
  };
  return map[service] || service;
}

export function locationLabel(service: ServiceType, location: string): string {
  if (service === 'para_llevar') return 'Pedido para llevar';
  if (service === 'domicilio') return 'Pedido a domicilio';
  return `${serviceName(service)} ${location}`;
}

export function locationOptions(service: ServiceType): { value: string; label: string }[] {
  if (service === 'mesa') {
    return Array.from({ length: 8 }, (_, i) => ({
      value: String(i + 1),
      label: `Mesa ${i + 1}`,
    }));
  }
  if (service === 'barra_exterior') {
    return Array.from({ length: 6 }, (_, i) => ({
      value: String(i + 1),
      label: `Banco exterior ${i + 1}`,
    }));
  }
  if (service === 'barra_interior') {
    return Array.from({ length: 3 }, (_, i) => ({
      value: String(i + 1),
      label: `Banco interior ${i + 1}`,
    }));
  }
  return [
    {
      value: '0',
      label: service === 'para_llevar' ? 'Mostrador / Para llevar' : 'Entrega a domicilio',
    },
  ];
}

export function lineTotalCents(item: OrderItem): number {
  return item.priceCents * item.qty;
}

export function subtotalCents(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}

export function totalCents(items: OrderItem[], discountCents: number = 0): number {
  return Math.max(0, subtotalCents(items) - discountCents);
}

export function addAudit(
  state: FullPosState,
  action: string,
  detail: string,
  reason?: string
): FullPosState {
  return {
    ...state,
    audit: [
      ...state.audit,
      {
        id: uid(),
        at: new Date().toISOString(),
        user: state.activeUser.name,
        action,
        detail,
        reason,
      },
    ],
  };
}

export function createOrUpdateOrder(
  state: FullPosState,
  params: {
    orderId?: string | null;
    service: ServiceType;
    location: string;
    waiter: string;
    note: string;
    items: OrderItem[];
    customer?: { name: string; phone: string; address: string; reference: string };
    priority?: Priority;
  }
): { nextState: FullPosState; orderId: string } {
  const now = new Date().toISOString();
  const sub = subtotalCents(params.items);

  let updatedOrders = [...state.orders];
  let targetOrderId = params.orderId;

  if (targetOrderId) {
    const existingIndex = updatedOrders.findIndex((o) => o.id === targetOrderId && o.status !== 'closed');
    if (existingIndex >= 0) {
      const existing = updatedOrders[existingIndex];
      const nextTotal = Math.max(0, sub - (existing.discountCents || 0));
      const updatedOrder: Order = {
        ...existing,
        service: params.service,
        location: params.location,
        table: params.location,
        waiter: params.waiter || existing.waiter,
        note: params.note,
        items: params.items.map((i) => ({ ...i })),
        customer: params.customer || existing.customer,
        totalCents: nextTotal,
        priority: params.priority || existing.priority,
        updatedAt: now,
      };
      updatedOrders[existingIndex] = updatedOrder;

      let nextState: FullPosState = {
        ...state,
        orders: updatedOrders,
      };
      nextState = addAudit(
        nextState,
        'Comanda actualizada',
        `Cuenta #${existing.number} en ${locationLabel(params.service, params.location)} · Total: $${(nextTotal / 100).toFixed(2)}`
      );
      return { nextState, orderId: targetOrderId };
    }
  }

  // Create new order
  const orderNumber = state.nextOrderNumber;
  const newId = uid();
  const newOrder: Order = {
    id: newId,
    number: orderNumber,
    service: params.service,
    location: params.location,
    table: params.location,
    waiter: params.waiter || state.activeUser.name,
    note: params.note,
    customer: params.customer,
    items: params.items.map((i) => ({ ...i })),
    totalCents: sub,
    discountCents: 0,
    priority: params.priority || 'normal',
    status: 'sent',
    paid: false,
    createdAt: now,
    updatedAt: now,
  };

  let nextState: FullPosState = {
    ...state,
    orders: [...state.orders, newOrder],
    nextOrderNumber: orderNumber + 1,
  };
  nextState = addAudit(
    nextState,
    'Comanda creada',
    `Cuenta #${orderNumber} en ${locationLabel(params.service, params.location)} · Total: $${(sub / 100).toFixed(2)}`
  );

  return { nextState, orderId: newId };
}

export function closeAndPayOrder(
  state: FullPosState,
  params: {
    orderId: string;
    paymentMethod: PaymentMethod;
    amountCash?: number;
    amountCard?: number;
  }
): FullPosState {
  const order = state.orders.find((o) => o.id === params.orderId && !o.paid);
  if (!order) throw new Error('No se encontró la comanda pendiente para cobrar.');

  const now = new Date().toISOString();
  const receiptFolio = `BC-${String(state.sales.length + 1).padStart(5, '0')}`;

  const sale: Sale = {
    id: uid(),
    receipt: receiptFolio,
    orderId: order.id,
    service: order.service,
    location: order.location,
    table: order.location,
    waiter: order.waiter,
    items: order.items.map((i) => ({ ...i })),
    subtotalCents: subtotalCents(order.items),
    discountCents: order.discountCents || 0,
    totalCents: order.totalCents,
    paymentMethod: params.paymentMethod,
    paidAt: now,
    amountCash: params.amountCash,
    amountCard: params.amountCard,
  };

  // Update orders: mark as closed and paid
  const updatedOrders = state.orders.map((o) =>
    o.id === order.id ? { ...o, status: 'closed' as OrderStatus, paid: true, updatedAt: now } : o
  );

  // Update shift figures
  const shift = { ...state.shift };
  if (params.paymentMethod === 'efectivo') {
    shift.cashSalesCents += order.totalCents;
    shift.expectedCashCents += order.totalCents;
  } else if (params.paymentMethod === 'tarjeta') {
    shift.cardSalesCents += order.totalCents;
  } else if (params.paymentMethod === 'transferencia') {
    shift.transferSalesCents += order.totalCents;
  } else if (params.paymentMethod === 'mixto') {
    const cashPart = params.amountCash || 0;
    const cardPart = params.amountCard || (order.totalCents - cashPart);
    shift.cashSalesCents += cashPart;
    shift.expectedCashCents += cashPart;
    shift.cardSalesCents += cardPart;
  }
  shift.totalSalesCents += order.totalCents;

  let nextState: FullPosState = {
    ...state,
    orders: updatedOrders,
    sales: [...state.sales, sale],
    shift,
  };

  nextState = addAudit(
    nextState,
    'Cobro registrado',
    `Folio ${receiptFolio} · Cuenta #${order.number} (${locationLabel(order.service, order.location)}) · $${(order.totalCents / 100).toFixed(2)} [${params.paymentMethod.toUpperCase()}]`
  );

  return nextState;
}

export function printReceiptText(sale: Sale, config = { name: 'Barbachu', address: 'Poza Rica #4984', phone: '+52 33 1445 6850' }): string {
  const line = '------------------------------------------';
  const lines: string[] = [
    `       ${config.name.toUpperCase()} RESTAURANTE BAR       `,
    `      ${config.address}      `,
    `            Tel: ${config.phone}            `,
    line,
    `Folio: ${sale.receipt}    Fecha: ${new Date(sale.paidAt).toLocaleDateString('es-MX')} ${new Date(sale.paidAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
    `Ubicación: ${locationLabel(sale.service, sale.location)}`,
    `Mesero: ${sale.waiter}`,
    line,
    'Cant  Descripción                      Importe',
    line,
  ];

  for (const item of sale.items) {
    const totalItem = (lineTotalCents(item) / 100).toFixed(2);
    const itemDesc = item.name.slice(0, 24).padEnd(24, ' ');
    const itemQty = String(item.qty).padEnd(5, ' ');
    lines.push(`${itemQty} ${itemDesc} $${totalItem.padStart(8, ' ')}`);
    if (item.note) {
      lines.push(`      * ${item.note}`);
    }
  }

  lines.push(line);
  lines.push(`Subtotal:                        $${(sale.subtotalCents / 100).toFixed(2).padStart(8, ' ')}`);
  if (sale.discountCents > 0) {
    lines.push(`Descuento:                     - $${(sale.discountCents / 100).toFixed(2).padStart(8, ' ')}`);
  }
  lines.push(`TOTAL:                           $${(sale.totalCents / 100).toFixed(2).padStart(8, ' ')}`);
  lines.push(`Método de Pago:                  ${sale.paymentMethod.toUpperCase()}`);
  lines.push(line);
  lines.push('       ¡GRACIAS POR SU PREFERENCIA!       ');
  lines.push('     Conserve este ticket para dudas     ');

  return lines.join('\n');
}
