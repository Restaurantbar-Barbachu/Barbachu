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

import { lineTotalCents, modifiersTotalCents, unitTotalCents } from './core';
import {
  buildCatalogHierarchy,
  filterCatalogProductsByHierarchy,
  getMainCatalogCategory,
  getProductSubgroup,
} from './utils/catalogHierarchy';

test('modifiers array prices sum accurately into item unit and line totals', () => {
  const item = {
    key: '801',
    name: 'HAMBURGUESA RES',
    priceCents: 9500,
    qty: 2,
    note: 'Extra queso, Sin cebolla',
    modifiers: [
      { name: 'Sin cebolla', priceCents: 0 },
      { name: 'Extra queso', priceCents: 1500 },
      { name: 'Tocino extra', priceCents: 2000 },
    ],
  };

  assert.equal(modifiersTotalCents(item), 3500);
  assert.equal(unitTotalCents(item), 13000);
  assert.equal(lineTotalCents(item), 26000);
  assert.equal(subtotalCents([item]), 26000);
  assert.equal(totalCents([item], 1000), 25000);

  const preCheck = printPreCheckText({
    id: 'ord-mod',
    number: 99,
    service: 'mesa',
    location: '1',
    table: '1',
    waiter: 'Luis',
    note: '',
    items: [item],
    totalCents: 26000,
    discountCents: 0,
    priority: 'normal',
    status: 'sent',
    paid: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.match(preCheck, /Extra queso/);
  assert.match(preCheck, /260\.00/);
});

test('catalog hierarchy builds 3-level category tree and filters products cleanly', () => {
  assert.equal(getMainCatalogCategory('ALAS'), 'Alimentos');
  assert.equal(getMainCatalogCategory('BEBIDAS S/ALCOHOL'), 'Bebidas');
  assert.equal(getMainCatalogCategory('CERVEZA'), 'Alcohol & Barra');
  assert.equal(getMainCatalogCategory('EXTRAS'), 'Extras');

  assert.equal(getProductSubgroup({ category: 'CAMARONES', name: 'AGUACHILE VERDE' }), 'Aguachiles');
  assert.equal(getProductSubgroup({ category: 'DESTILADOS', name: 'SHOT HERRADURA' }), 'Shots y Preparados');
  assert.equal(getProductSubgroup({ category: 'BOTANAS', name: 'PAPA DORADA' }), 'Papas y Elotes');

  const sampleProducts = [
    { key: '701', name: 'ALAS BBQ', group: '01', category: 'ALAS', sourcePrice: 105, priceCents: 10500, saleEnabled: true },
    { key: '710', name: 'AGUACHILE VERDE', group: '01', category: 'CAMARONES', sourcePrice: 190, priceCents: 19000, saleEnabled: true },
    { key: '711', name: 'CAMARONES CAJUN', group: '01', category: 'CAMARONES', sourcePrice: 210, priceCents: 21000, saleEnabled: true },
    { key: '201', name: 'CORONA EXTRA', group: '02', category: 'CERVEZA', sourcePrice: 30, priceCents: 3000, saleEnabled: true },
  ];

  const tree = buildCatalogHierarchy(sampleProducts);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].name, 'Alimentos');
  assert.equal(tree[0].count, 3);
  const camaronesSub = tree[0].subcategories.find((s) => s.name === 'CAMARONES');
  assert.ok(camaronesSub);
  assert.equal(camaronesSub.groups.length, 2);

  const aguachilesOnly = filterCatalogProductsByHierarchy(sampleProducts, {
    category: 'Alimentos',
    subcategory: 'CAMARONES',
    group: 'Aguachiles',
  });
  assert.equal(aguachilesOnly.length, 1);
  assert.equal(aguachilesOnly[0].key, '710');

  const searchResult = filterCatalogProductsByHierarchy(sampleProducts, {
    category: 'Alimentos',
    subcategory: 'CAMARONES',
    group: 'Aguachiles',
    searchQuery: 'corona',
  });
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].key, '201');
});

