import { locationLabel, subtotalCents } from '../core';
import { toLocalDateKey } from './dashboardMetrics';
import type { CustomerDelivery, Order, OrderItem, PaymentMethod, Sale, ServiceType } from '../types';

export type OrderHistoryStatusFilter = 'all' | 'paid' | 'active';
export type OrderHistoryDatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'month';

export interface OrderHistoryEntry {
  uid: string;
  orderId?: string;
  saleId?: string;
  folio: string;
  orderNumber?: number;
  service: ServiceType;
  location: string;
  locationText: string;
  waiter: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  note: string;
  items: OrderItem[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paid: boolean;
  statusLabel: string;
  paymentMethod?: PaymentMethod;
  dateIso: string;
  dateKey: string;
  sourceOrder?: Order;
  sourceSale?: Sale;
}

export interface OrderHistoryFilterCriteria {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  status: OrderHistoryStatusFilter;
  service: 'all' | ServiceType;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveDatePresetRange(
  preset: OrderHistoryDatePreset,
  referenceDate: Date = new Date()
): { dateFrom: string; dateTo: string } {
  if (preset === 'all') {
    return { dateFrom: '', dateTo: '' };
  }
  const todayKey = toLocalDateKey(referenceDate);
  if (preset === 'today') {
    return { dateFrom: todayKey, dateTo: todayKey };
  }
  if (preset === 'yesterday') {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - 1);
    const key = toLocalDateKey(d);
    return { dateFrom: key, dateTo: key };
  }
  if (preset === 'last7') {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - 6);
    return { dateFrom: toLocalDateKey(d), dateTo: todayKey };
  }
  // 'month'
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return { dateFrom: toLocalDateKey(firstOfMonth), dateTo: todayKey };
}

function formatOrderStatusEs(order: Order): string {
  if (order.paid || order.status === 'closed') return 'Pagado';
  switch (order.status) {
    case 'preparing':
      return 'En preparación';
    case 'ready':
      return 'Listo';
    case 'served':
      return 'Servido';
    case 'delivered':
      return 'Entregado';
    default:
      return 'Abierto';
  }
}

export function buildOrderHistoryEntries(params: {
  openOrders: Order[];
  closedOrders: Order[];
  sales: Sale[];
}): OrderHistoryEntry[] {
  const { openOrders, closedOrders, sales } = params;

  const orderMap = new Map<string, Order>();
  for (const o of [...closedOrders, ...openOrders]) {
    const existing = orderMap.get(o.id);
    if (!existing || o.updatedAt >= existing.updatedAt) {
      orderMap.set(o.id, o);
    }
  }

  const saleByOrderId = new Map<string, Sale>();
  for (const s of sales) {
    if (s.orderId) {
      const prev = saleByOrderId.get(s.orderId);
      if (!prev || s.paidAt >= prev.paidAt) {
        saleByOrderId.set(s.orderId, s);
      }
    }
  }

  const consumedSaleIds = new Set<string>();
  const entries: OrderHistoryEntry[] = [];

  for (const order of orderMap.values()) {
    const linkedSale = saleByOrderId.get(order.id);
    if (linkedSale) {
      consumedSaleIds.add(linkedSale.id);
    }

    const customer: Partial<CustomerDelivery> = order.customer || {};
    const dateIso = linkedSale?.paidAt || order.updatedAt || order.createdAt;
    const items = linkedSale?.items?.length ? linkedSale.items : order.items;
    const itemCount = items.reduce((sum, it) => sum + Math.max(1, it.qty || 1), 0);
    const sub = linkedSale ? linkedSale.subtotalCents : subtotalCents(items);
    const discount = linkedSale ? linkedSale.discountCents : order.discountCents || 0;
    const total = linkedSale ? linkedSale.totalCents : order.totalCents;
    const isPaid = Boolean(linkedSale || order.paid || order.status === 'closed');

    entries.push({
      uid: `ord:${order.id}`,
      orderId: order.id,
      saleId: linkedSale?.id,
      folio: linkedSale?.receipt || `Cuenta #${order.number}`,
      orderNumber: order.number,
      service: linkedSale?.service || order.service,
      location: linkedSale?.location || order.location,
      locationText: locationLabel(linkedSale?.service || order.service, linkedSale?.location || order.location),
      waiter: linkedSale?.waiter || order.waiter || 'Staff',
      customerName: (customer.name || '').trim(),
      customerPhone: (customer.phone || '').trim(),
      customerAddress: (customer.address || '').trim(),
      note: (order.note || '').trim(),
      items,
      itemCount,
      subtotalCents: sub,
      discountCents: discount,
      totalCents: total,
      paid: isPaid,
      statusLabel: isPaid ? 'Pagado' : formatOrderStatusEs(order),
      paymentMethod: linkedSale?.paymentMethod,
      dateIso,
      dateKey: toLocalDateKey(dateIso),
      sourceOrder: order,
      sourceSale: linkedSale,
    });
  }

  // Include standalone sales whose order document is not currently fetched
  for (const sale of sales) {
    if (consumedSaleIds.has(sale.id)) continue;
    const itemCount = sale.items.reduce((sum, it) => sum + Math.max(1, it.qty || 1), 0);
    entries.push({
      uid: `sale:${sale.id}`,
      orderId: sale.orderId,
      saleId: sale.id,
      folio: sale.receipt,
      service: sale.service,
      location: sale.location,
      locationText: locationLabel(sale.service, sale.location),
      waiter: sale.waiter || 'Staff',
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      note: '',
      items: sale.items,
      itemCount,
      subtotalCents: sale.subtotalCents,
      discountCents: sale.discountCents || 0,
      totalCents: sale.totalCents,
      paid: true,
      statusLabel: 'Pagado',
      paymentMethod: sale.paymentMethod,
      dateIso: sale.paidAt,
      dateKey: toLocalDateKey(sale.paidAt),
      sourceSale: sale,
    });
  }

  entries.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  return entries;
}

export function filterOrderHistoryEntries(
  entries: OrderHistoryEntry[],
  criteria: OrderHistoryFilterCriteria
): OrderHistoryEntry[] {
  const q = normalizeText(criteria.searchQuery);
  const fromKey = criteria.dateFrom.trim();
  const toKey = criteria.dateTo.trim();

  return entries.filter((entry) => {
    if (criteria.status === 'paid' && !entry.paid) return false;
    if (criteria.status === 'active' && entry.paid) return false;
    if (criteria.service !== 'all' && entry.service !== criteria.service) return false;

    if (fromKey && entry.dateKey && entry.dateKey < fromKey) return false;
    if (toKey && entry.dateKey && entry.dateKey > toKey) return false;
    if ((fromKey || toKey) && !entry.dateKey) return false;

    if (q) {
      const haystack = normalizeText(
        [
          entry.customerName,
          entry.customerPhone,
          entry.folio,
          entry.orderNumber ? `#${entry.orderNumber}` : '',
          entry.waiter,
          entry.locationText,
          entry.paymentMethod || '',
          ...entry.items.map((it) => it.name),
        ].join(' ')
      );
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function paginateListItems<T>(
  items: T[],
  page: number,
  pageSize: number
): {
  pageItems: T[];
  safePage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
} {
  const safeSize = Math.max(1, Math.floor(pageSize || 10));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page || 1)));
  const start = (safePage - 1) * safeSize;
  const end = Math.min(totalItems, start + safeSize);

  return {
    pageItems: items.slice(start, end),
    safePage,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: end,
  };
}
