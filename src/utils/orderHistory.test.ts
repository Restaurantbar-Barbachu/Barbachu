import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderHistoryEntries,
  filterOrderHistoryEntries,
  paginateListItems,
  resolveDatePresetRange,
} from './orderHistory';
import type { Order, Sale } from '../types';

const sampleOrderBase: Order = {
  id: 'ord-1',
  number: 11,
  service: 'mesa',
  location: '3',
  table: '3',
  waiter: 'Carlos',
  note: '',
  customer: {
    name: 'María López',
    phone: '3312345678',
    address: '',
    reference: '',
  },
  items: [
    {
      key: '701',
      name: 'Birria Tradicional',
      priceCents: 18000,
      qty: 2,
      note: '',
      station: 'cocina',
      itemStatus: 'served',
    },
  ],
  totalCents: 36000,
  discountCents: 0,
  priority: 'normal',
  status: 'closed',
  paid: true,
  createdAt: '2026-11-26T14:00:00.000Z',
  updatedAt: '2026-11-26T14:45:00.000Z',
};

const sampleSaleLinked: Sale = {
  id: 'sale-1',
  receipt: 'BC-00011',
  orderId: 'ord-1',
  service: 'mesa',
  location: '3',
  table: '3',
  waiter: 'Carlos',
  items: sampleOrderBase.items,
  subtotalCents: 36000,
  discountCents: 0,
  totalCents: 36000,
  paymentMethod: 'tarjeta',
  paidAt: '2026-11-26T14:45:00.000Z',
};

const sampleStandaloneSale: Sale = {
  id: 'sale-2',
  receipt: 'BC-00012',
  service: 'para_llevar',
  location: '0',
  table: '0',
  waiter: 'Ana',
  items: [
    {
      key: '801',
      name: 'Michelada Clásica',
      priceCents: 12000,
      qty: 1,
      note: '',
      station: 'barra',
      itemStatus: 'served',
    },
  ],
  subtotalCents: 12000,
  discountCents: 0,
  totalCents: 12000,
  paymentMethod: 'efectivo',
  paidAt: '2026-11-27T18:15:00.000Z',
};

const sampleOpenOrder: Order = {
  ...sampleOrderBase,
  id: 'ord-3',
  number: 13,
  service: 'domicilio',
  location: '0',
  table: '0',
  customer: {
    name: 'Roberto Gómez',
    phone: '3398765432',
    address: 'Av. Reforma 120',
    reference: 'Portón café',
  },
  status: 'preparing',
  paid: false,
  createdAt: '2026-11-28T16:10:00.000Z',
  updatedAt: '2026-11-28T16:15:00.000Z',
};

test('buildOrderHistoryEntries merges linked orders/sales without duplication and sorts newest first', () => {
  const entries = buildOrderHistoryEntries({
    openOrders: [sampleOpenOrder],
    closedOrders: [sampleOrderBase],
    sales: [sampleSaleLinked, sampleStandaloneSale],
  });

  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => e.folio),
    ['Cuenta #13', 'BC-00012', 'BC-00011']
  );

  const mariaEntry = entries.find((e) => e.folio === 'BC-00011');
  assert.equal(mariaEntry?.customerName, 'María López');
  assert.equal(mariaEntry?.paymentMethod, 'tarjeta');
  assert.equal(mariaEntry?.paid, true);
});

test('filterOrderHistoryEntries searches case-insensitively and accent-insensitively by customer name, folio, and date', () => {
  const entries = buildOrderHistoryEntries({
    openOrders: [sampleOpenOrder],
    closedOrders: [sampleOrderBase],
    sales: [sampleSaleLinked, sampleStandaloneSale],
  });

  const byCustomer = filterOrderHistoryEntries(entries, {
    searchQuery: 'maria lopez',
    dateFrom: '',
    dateTo: '',
    status: 'all',
    service: 'all',
  });
  assert.equal(byCustomer.length, 1);
  assert.equal(byCustomer[0].folio, 'BC-00011');

  const byDateRange = filterOrderHistoryEntries(entries, {
    searchQuery: '',
    dateFrom: '2026-11-27',
    dateTo: '2026-11-27',
    status: 'paid',
    service: 'all',
  });
  assert.equal(byDateRange.length, 1);
  assert.equal(byDateRange[0].folio, 'BC-00012');

  const byService = filterOrderHistoryEntries(entries, {
    searchQuery: 'roberto',
    dateFrom: '',
    dateTo: '',
    status: 'active',
    service: 'domicilio',
  });
  assert.equal(byService.length, 1);
  assert.equal(byService[0].orderNumber, 13);
});

test('paginateListItems slices pages accurately and clamps out-of-range page numbers', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  const p1 = paginateListItems(items, 1, 10);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.startIndex, 1);
  assert.equal(p1.endIndex, 10);
  assert.deepEqual(p1.pageItems, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const p3 = paginateListItems(items, 99, 10);
  assert.equal(p3.safePage, 3);
  assert.equal(p3.startIndex, 21);
  assert.equal(p3.endIndex, 25);
  assert.deepEqual(p3.pageItems, [21, 22, 23, 24, 25]);

  const empty = paginateListItems([], 1, 10);
  assert.equal(empty.totalPages, 1);
  assert.equal(empty.startIndex, 0);
  assert.equal(empty.endIndex, 0);
});

test('resolveDatePresetRange computes expected local date keys', () => {
  const ref = new Date(2026, 10, 28, 12, 0, 0); // Nov 28, 2026 local
  assert.deepEqual(resolveDatePresetRange('today', ref), {
    dateFrom: '2026-11-28',
    dateTo: '2026-11-28',
  });
  assert.deepEqual(resolveDatePresetRange('yesterday', ref), {
    dateFrom: '2026-11-27',
    dateTo: '2026-11-27',
  });
  assert.deepEqual(resolveDatePresetRange('last7', ref), {
    dateFrom: '2026-11-22',
    dateTo: '2026-11-28',
  });
  assert.deepEqual(resolveDatePresetRange('month', ref), {
    dateFrom: '2026-11-01',
    dateTo: '2026-11-28',
  });
});
