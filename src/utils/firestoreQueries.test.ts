import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_PAGE_LIMITS,
  buildActiveOrdersQuerySpec,
  buildOpenShiftQuerySpec,
  buildPaginatedCollectionQuerySpec,
  filterActiveOrders,
  isMissingIndexError,
  mergePaginatedRecords,
  normalizePageSize,
  selectActiveOrLatestShift,
} from './firestoreQueries';
import type { CashShift, Order } from '../types';

test('normalizePageSize clamps limits safely between 1 and 250', () => {
  assert.equal(normalizePageSize(undefined, 50), 50);
  assert.equal(normalizePageSize(0), 1);
  assert.equal(normalizePageSize(-10), 1);
  assert.equal(normalizePageSize(999), 250);
  assert.equal(normalizePageSize(75.8), 75);
});

test('buildActiveOrdersQuerySpec restricts to unpaid active orders and bounded limit', () => {
  const adminSpec = buildActiveOrdersQuerySpec('maurocazqiez013@gmail.com', true);
  assert.equal(adminSpec.collectionName, 'orders');
  assert.deepEqual(adminSpec.filters, [{ field: 'paid', op: '==', value: false }]);
  assert.equal(adminSpec.limitCount, WORKSPACE_PAGE_LIMITS.orders);

  const staffSpec = buildActiveOrdersQuerySpec('Caja@Barbachu.mx', false, 60);
  assert.deepEqual(staffSpec.filters, [
    { field: 'authorizedEmails', op: 'array-contains', value: 'caja@barbachu.mx' },
    { field: 'paid', op: '==', value: false },
  ]);
  assert.equal(staffSpec.limitCount, 60);
  assert.equal(staffSpec.orderByField, 'updatedAt');
});

test('buildOpenShiftQuerySpec restricts shifts subscription to single open shift', () => {
  const spec = buildOpenShiftQuerySpec('cajero@barbachu.mx', false);
  assert.equal(spec.collectionName, 'shifts');
  assert.equal(spec.limitCount, 1);
  assert.deepEqual(spec.filters, [
    { field: 'authorizedEmails', op: 'array-contains', value: 'cajero@barbachu.mx' },
    { field: 'isOpen', op: '==', value: true },
  ]);
});

test('buildPaginatedCollectionQuerySpec builds scoped cursor query metadata', () => {
  const spec = buildPaginatedCollectionQuerySpec('sales', 'mesero@barbachu.mx', false, 'paidAt', 'desc', 40);
  assert.equal(spec.collectionName, 'sales');
  assert.equal(spec.orderByField, 'paidAt');
  assert.equal(spec.orderDirection, 'desc');
  assert.equal(spec.limitCount, 40);
  assert.equal(spec.filters.length, 1);
});

test('filterActiveOrders removes paid and closed orders and sorts ascending by order number', () => {
  const baseOrder: Order = {
    id: 'o1',
    number: 5,
    service: 'mesa',
    location: '1',
    table: '1',
    waiter: 'Juan',
    note: '',
    items: [],
    totalCents: 1000,
    discountCents: 0,
    priority: 'normal',
    status: 'sent',
    paid: false,
    createdAt: '2026-11-25T10:00:00Z',
    updatedAt: '2026-11-25T10:00:00Z',
  };

  const result = filterActiveOrders([
    { ...baseOrder, id: 'o3', number: 12, status: 'preparing', paid: false },
    { ...baseOrder, id: 'o2', number: 7, status: 'closed', paid: false },
    { ...baseOrder, id: 'o4', number: 8, status: 'closed', paid: true },
    { ...baseOrder, id: 'o1', number: 3, status: 'ready', paid: false },
  ]);

  assert.deepEqual(
    result.map((o) => o.id),
    ['o1', 'o3']
  );
});

test('selectActiveOrLatestShift prefers open shift over newer closed shift or picks latest closed', () => {
  const closedNewer: CashShift = {
    id: 's2',
    initialCashCents: 0,
    isOpen: false,
    openedAt: '2026-11-25T12:00:00Z',
    cashSalesCents: 0,
    cardSalesCents: 0,
    transferSalesCents: 0,
    totalSalesCents: 0,
    expectedCashCents: 0,
  };
  const openOlder: CashShift = {
    ...closedNewer,
    id: 's1',
    isOpen: true,
    openedAt: '2026-11-25T09:00:00Z',
  };

  assert.equal(selectActiveOrLatestShift([closedNewer, openOlder])?.id, 's1');
  assert.equal(selectActiveOrLatestShift([closedNewer])?.id, 's2');
  assert.equal(selectActiveOrLatestShift([]), null);
});

test('mergePaginatedRecords deduplicates pages while preserving order', () => {
  const merged = mergePaginatedRecords(
    [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ],
    [
      { id: 'b', v: 99 },
      { id: 'c', v: 3 },
    ],
    (x) => x.id
  );
  assert.deepEqual(merged, [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
    { id: 'c', v: 3 },
  ]);
});

test('isMissingIndexError detects Firestore index precondition errors cleanly', () => {
  assert.equal(isMissingIndexError({ code: 'failed-precondition', message: 'The query requires an index' }), true);
  assert.equal(isMissingIndexError(new Error('PERMISSION_DENIED')), false);
});
