import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogModifierOptions,
  buildModifierProductKey,
  calculateModifierSelectionTotal,
  duplicateOrderItemInList,
  getSelectedModifiersArray,
  matchItemModifiersToOptions,
  removeModifierFromItem,
  updateModifierOnItem,
} from './modifiers';
import type { OrderItem, SoftProduct } from '../types';

const SAMPLE_PRODUCTS: SoftProduct[] = [
  {
    key: '101',
    name: 'TACOS DE CECINA',
    group: '1',
    category: 'TACOS',
    sourcePrice: 120,
    priceCents: 12000,
    saleEnabled: true,
  },
  {
    key: '1226',
    name: 'BARABCHU',
    group: '12',
    category: 'MODIFICADORES',
    sourcePrice: 55,
    priceCents: 5500,
    saleEnabled: true,
  },
  {
    key: '1215',
    name: 'BBQ',
    group: '12',
    category: 'MODIFICADORES',
    sourcePrice: 0,
    priceCents: 0,
    saleEnabled: false,
  },
  {
    key: '1299',
    name: 'EXTRA PAUSADO',
    group: '12',
    category: 'MODIFICADORES',
    sourcePrice: 30,
    priceCents: 3000,
    saleEnabled: false,
  },
];

test('buildCatalogModifierOptions syncs MODIFICADORES from catalog and keeps $0 prep items', () => {
  const opts = buildCatalogModifierOptions(SAMPLE_PRODUCTS);
  assert.equal(opts.length, 2);
  assert.deepEqual(
    opts.map((o) => ({ key: o.key, name: o.name, priceCents: o.priceCents })),
    [
      { key: '1226', name: 'BARABCHU', priceCents: 5500 },
      { key: '1215', name: 'BBQ', priceCents: 0 },
    ]
  );
});

test('buildCatalogModifierOptions merges custom modifiers without duplicating catalog names', () => {
  const opts = buildCatalogModifierOptions(SAMPLE_PRODUCTS, [
    { id: 'c1', name: 'bbq', priceCents: 0, source: 'custom', saleEnabled: true },
    { id: 'c2', name: 'Extra Queso', priceCents: 1500, source: 'custom', saleEnabled: true },
  ]);
  assert.equal(opts.length, 3);
  assert.equal(opts[2].name, 'Extra Queso');
  assert.equal(opts[2].priceCents, 1500);
});

test('buildModifierProductKey generates safe unique keys', () => {
  const k1 = buildModifierProductKey('Salsa Piña / Habanero', ['mod_salsa_pina_habanero']);
  assert.equal(k1, 'mod_salsa_pina_habanero_2');
  const k2 = buildModifierProductKey('Extra Limón', []);
  assert.equal(k2, 'mod_extra_limon');
});

test('selection totals and array extraction compute accurately', () => {
  const opts = buildCatalogModifierOptions(SAMPLE_PRODUCTS);
  const selected = { cat_1226: true, cat_1215: true };
  assert.equal(calculateModifierSelectionTotal(opts, selected), 5500);
  assert.deepEqual(getSelectedModifiersArray(opts, selected), [
    { name: 'BARABCHU', priceCents: 5500 },
    { name: 'BBQ', priceCents: 0 },
  ]);
});

test('removeModifierFromItem and updateModifierOnItem edit item modifiers cleanly', () => {
  const item: OrderItem = {
    lineId: 'ln-1',
    key: '101',
    name: 'TACOS DE CECINA',
    priceCents: 12000,
    qty: 1,
    note: '',
    modifiers: [
      { name: 'BARABCHU', priceCents: 5500 },
      { name: 'BBQ', priceCents: 0 },
    ],
  };

  const edited = updateModifierOnItem(item, 1, { name: 'BBQ Ahumada', priceCents: 1000 });
  assert.deepEqual(edited.modifiers, [
    { name: 'BARABCHU', priceCents: 5500 },
    { name: 'BBQ Ahumada', priceCents: 1000 },
  ]);

  const removedFirst = removeModifierFromItem(edited, 0);
  assert.deepEqual(removedFirst.modifiers, [{ name: 'BBQ Ahumada', priceCents: 1000 }]);

  const removedAll = removeModifierFromItem(removedFirst, 0);
  assert.equal(removedAll.modifiers, undefined);
});

test('matchItemModifiersToOptions maps catalog items and isolates price-overridden custom mods', () => {
  const opts = buildCatalogModifierOptions(SAMPLE_PRODUCTS);
  const item: OrderItem = {
    lineId: 'ln-2',
    key: '101',
    name: 'TACOS DE CECINA',
    priceCents: 12000,
    qty: 1,
    note: '',
    modifiers: [
      { name: 'BBQ', priceCents: 0 },
      { name: 'Aderezo especial', priceCents: 2500 },
    ],
  };

  const matched = matchItemModifiersToOptions(item, opts);
  assert.equal(matched.selected.cat_1215, true);
  assert.equal(matched.unmatchedCustom.length, 1);
  assert.equal(matched.unmatchedCustom[0].name, 'Aderezo especial');
  assert.equal(matched.selected[matched.unmatchedCustom[0].id], true);
});

test('duplicateOrderItemInList clones line with pending status and fresh lineId', () => {
  const list: OrderItem[] = [
    {
      lineId: 'ln-1',
      key: '101',
      name: 'TACOS DE CECINA',
      priceCents: 12000,
      qty: 2,
      note: '',
      itemStatus: 'preparing',
      modifiers: [{ name: 'BBQ', priceCents: 0 }],
    },
  ];
  const next = duplicateOrderItemInList(list, 'ln-1', 'ln-2');
  assert.equal(next.length, 2);
  assert.equal(next[1].lineId, 'ln-2');
  assert.equal(next[1].itemStatus, 'pending');
  assert.deepEqual(next[1].modifiers, [{ name: 'BBQ', priceCents: 0 }]);
  assert.notEqual(next[1].modifiers, next[0].modifiers);
});
