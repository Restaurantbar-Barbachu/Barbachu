import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProductStation,
  closeAndPayOrder,
  computeOrderStatusFromItems,
  createOrUpdateOrder,
  printPreCheckText,
  printReceiptText,
  subtotalCents,
  totalCents,
} from './core';
import { createInitialPosState } from './storage';

test('classifyProductStation routes drinks to barra and food to cocina', () => {
  assert.equal(classifyProductStation('CERVEZA'), 'barra');
  assert.equal(classifyProductStation('michelada'), 'barra');
  assert.equal(classifyProductStation('ALAS'), 'cocina');
  assert.equal(classifyProductStation('HAMBURGUESAS'), 'cocina');
});

test('computeOrderStatusFromItems derives aggregated order state accurately', () => {
  assert.equal(computeOrderStatusFromItems([], 'sent'), 'sent');
  assert.equal(
    computeOrderStatusFromItems(
      [
        { key: '1', name: 'Alitas', priceCents: 10500, qty: 1, note: '', itemStatus: 'served' },
        { key: '2', name: 'Elote', priceCents: 8500, qty: 1, note: '', itemStatus: 'served' },
      ],
      'sent'
    ),
    'served'
  );
  assert.equal(
    computeOrderStatusFromItems(
      [
        { key: '1', name: 'Alitas', priceCents: 10500, qty: 1, note: '', itemStatus: 'ready' },
        { key: '2', name: 'Elote', priceCents: 8500, qty: 1, note: '', itemStatus: 'served' },
      ],
      'sent'
    ),
    'ready'
  );
  assert.equal(
    computeOrderStatusFromItems(
      [
        { key: '1', name: 'Alitas', priceCents: 10500, qty: 1, note: '', itemStatus: 'preparing' },
        { key: '2', name: 'Elote', priceCents: 8500, qty: 1, note: '', itemStatus: 'pending' },
      ],
      'sent'
    ),
    'preparing'
  );
});

test('createOrUpdateOrder and closeAndPayOrder update totals, shift, and receipts consistently', () => {
  const initial = createInitialPosState();
  const items = [
    { key: '701', name: 'ALAS BBQ', priceCents: 10500, qty: 2, note: '', station: 'cocina' as const },
    { key: '201', name: 'CORONA', priceCents: 3500, qty: 1, note: '', station: 'barra' as const },
  ];

  assert.equal(subtotalCents(items), 24500);
  assert.equal(totalCents(items, 2000), 22500);

  const { nextState: withOrder, orderId } = createOrUpdateOrder(initial, {
    service: 'mesa',
    location: '3',
    waiter: 'Carlos',
    note: 'Sin picante',
    items,
  });

  assert.equal(withOrder.orders.length, 1);
  assert.equal(withOrder.nextOrderNumber, 2);
  assert.equal(withOrder.orders[0].totalCents, 24500);

  const paidState = closeAndPayOrder(withOrder, {
    orderId,
    paymentMethod: 'mixto',
    amountCash: 10000,
    amountCard: 14500,
  });

  assert.equal(paidState.orders[0].paid, true);
  assert.equal(paidState.orders[0].status, 'closed');
  assert.equal(paidState.sales.length, 1);
  assert.equal(paidState.shift.cashSalesCents, 10000);
  assert.equal(paidState.shift.cardSalesCents, 14500);
  assert.equal(paidState.shift.totalSalesCents, 24500);

  const receipt = printReceiptText(paidState.sales[0]);
  const preCheck = printPreCheckText(withOrder.orders[0]);
  assert.match(receipt, /BC-00001/);
  assert.match(receipt, /245\.00/);
  assert.match(preCheck, /PRE-CUENTA/);
});
