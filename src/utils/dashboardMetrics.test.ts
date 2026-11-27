import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailySalesSummary,
  buildHourlySalesTrend,
  buildInventoryLevels,
  buildSalesPerformanceMetrics,
  buildSalesTrend,
  classifyInventoryHealth,
  toLocalDateKey,
} from './dashboardMetrics';
import type { InventoryItem, Sale, SoftProduct } from '../types';

function makeSale(id: string, paidAt: string, totalCents: number): Sale {
  return {
    id,
    receipt: `BC-${id}`,
    service: 'mesa',
    location: '1',
    table: '1',
    waiter: 'Mesero',
    items: [],
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    paymentMethod: 'efectivo',
    paidAt,
  };
}

test('toLocalDateKey formats local date consistently without UTC shift', () => {
  const localLateNight = new Date(2026, 10, 22, 23, 45, 0);
  assert.equal(toLocalDateKey(localLateNight), '2026-11-22');
  assert.equal(toLocalDateKey('invalid-date'), '');
});

test('buildSalesTrend aggregates 7-day sales revenue and ticket counts accurately', () => {
  const ref = new Date(2026, 10, 22, 18, 0, 0);
  const todayIso = new Date(2026, 10, 22, 15, 30, 0).toISOString();
  const yesterdayIso = new Date(2026, 10, 21, 20, 15, 0).toISOString();

  const trend = buildSalesTrend(
    [
      makeSale('1', todayIso, 25000),
      makeSale('2', todayIso, 15050),
      makeSale('3', yesterdayIso, 10000),
    ],
    7,
    ref
  );

  assert.equal(trend.length, 7);
  assert.equal(trend[6].dateKey, '2026-11-22');
  assert.equal(trend[6].ventas, 400.5);
  assert.equal(trend[6].tickets, 2);
  assert.equal(trend[5].dateKey, '2026-11-21');
  assert.equal(trend[5].ventas, 100);
  assert.equal(trend[5].tickets, 1);
  assert.equal(trend[0].ventas, 0);
});

test('buildHourlySalesTrend buckets sales for target day only', () => {
  const ref = new Date(2026, 10, 22, 18, 0, 0);
  const today14 = new Date(2026, 10, 22, 14, 15, 0).toISOString();
  const prev14 = new Date(2026, 10, 21, 14, 15, 0).toISOString();

  const hourly = buildHourlySalesTrend(
    [makeSale('1', today14, 18500), makeSale('2', prev14, 99900)],
    ref
  );

  const slot14 = hourly.find((h) => h.hora === '14:00');
  assert.ok(slot14);
  assert.equal(slot14.ventas, 185);
  assert.equal(slot14.tickets, 1);
});

test('classifyInventoryHealth and buildInventoryLevels prioritize critical and low stock items', () => {
  assert.equal(classifyInventoryHealth(0, 5), 'critico');
  assert.equal(classifyInventoryHealth(5, 5), 'critico');
  assert.equal(classifyInventoryHealth(6, 5), 'bajo');
  assert.equal(classifyInventoryHealth(12, 5), 'optimo');

  const inventory: Record<number, InventoryItem> = {
    1: { clave: 1, descripcion: 'Cerveza Clara', categoria: 'Cerveza', unidad: 'Botella', costo: 20, stock: 24, minStock: 6 },
    2: { clave: 2, descripcion: 'Alitas Frescas', categoria: 'Cocina', unidad: 'Kg', costo: 90, stock: 2, minStock: 5 },
    3: { clave: 3, descripcion: 'Limón Verde', categoria: 'Barra', unidad: 'Kg', costo: 30, stock: 6, minStock: 5 },
    4: { clave: 4, descripcion: 'Tequila Reposado', categoria: 'Destilados', unidad: 'Botella', costo: 320, stock: 0, minStock: 2 },
  };

  const summary = buildInventoryLevels(inventory, 3);
  assert.equal(summary.totalItems, 4);
  assert.equal(summary.outOfStockCount, 1);
  assert.equal(summary.criticalCount, 2);
  assert.equal(summary.lowCount, 1);
  assert.equal(summary.healthyCount, 1);
  // Valuation = 24*20 + 2*90 + 6*30 + 0*320 = 480 + 180 + 180 = 840
  assert.equal(summary.totalValuation, 840);
  // Chart items prioritized: out of stock / critical first, capped to 3
  assert.equal(summary.chartItems.length, 3);
  assert.equal(summary.chartItems[0].clave, 4);
  assert.equal(summary.chartItems[1].clave, 2);
  assert.equal(summary.chartItems[2].clave, 3);
});

test('buildSalesPerformanceMetrics includes modifier pricing and weights discounts proportionally', () => {
  const products: SoftProduct[] = [
    { key: '801', name: 'HAMBURGUESA', group: '01', category: 'HAMBURGUESAS', sourcePrice: 100, priceCents: 10000, saleEnabled: true },
    { key: '201', name: 'CORONA', group: '02', category: 'CERVEZA', sourcePrice: 50, priceCents: 5000, saleEnabled: true },
  ];

  // Item 1: 100 + 20 mod = 120; Item 2: 80 => gross 200; discount 20 => net 180 (90% of gross)
  const saleWithModsAndDiscount: Sale = {
    id: 's1',
    receipt: 'BC-00001',
    service: 'mesa',
    location: '1',
    table: '1',
    waiter: 'Mesero',
    items: [
      {
        key: '801',
        name: 'HAMBURGUESA',
        priceCents: 10000,
        qty: 1,
        note: '',
        modifiers: [{ name: 'Extra queso', priceCents: 2000 }],
      },
      {
        key: '201',
        name: 'CORONA',
        priceCents: 4000,
        qty: 2,
        note: '',
      },
    ],
    subtotalCents: 20000,
    discountCents: 2000,
    totalCents: 18000,
    paymentMethod: 'efectivo',
    paidAt: new Date().toISOString(),
  };

  const { topProducts, categorySales } = buildSalesPerformanceMetrics([saleWithModsAndDiscount], products, 'revenue');
  assert.equal(topProducts.length, 2);
  assert.equal(topProducts[0].fullName, 'HAMBURGUESA');
  assert.equal(topProducts[0].ingresos, 108); // 120 * 0.9
  assert.equal(topProducts[1].fullName, 'CORONA');
  assert.equal(topProducts[1].ingresos, 72); // 80 * 0.9

  assert.equal(categorySales.length, 2);
  assert.equal(categorySales[0].categoria, 'HAMBURGUESAS');
  assert.equal(categorySales[0].ventas, 108);
  assert.equal(categorySales[1].categoria, 'CERVEZA');
  assert.equal(categorySales[1].ventas, 72);
});

test('buildDailySalesSummary computes today revenue, tickets, average ticket, and top product', () => {
  const ref = new Date(2026, 10, 26, 18, 0, 0);
  const products: SoftProduct[] = [
    { key: '701', name: 'ORDEN ALITAS', group: '01', category: 'ALAS', sourcePrice: 150, priceCents: 15000, saleEnabled: true },
  ];
  const todaySale: Sale = {
    id: 's-today',
    receipt: 'BC-10',
    service: 'mesa',
    location: '1',
    table: '1',
    waiter: 'Mesero',
    items: [{ key: '701', name: 'ORDEN ALITAS', priceCents: 15000, qty: 2, note: '' }],
    subtotalCents: 30000,
    discountCents: 0,
    totalCents: 30000,
    paymentMethod: 'tarjeta',
    paidAt: new Date(2026, 10, 26, 14, 0, 0).toISOString(),
  };
  const oldSale = makeSale('old', new Date(2026, 10, 20, 12, 0, 0).toISOString(), 99900);

  const summary = buildDailySalesSummary([todaySale, oldSale], products, ref);
  assert.equal(summary.todayRevenueCents, 30000);
  assert.equal(summary.todayTickets, 1);
  assert.equal(summary.todayUnits, 2);
  assert.equal(summary.averageTicketCents, 30000);
  assert.equal(summary.topProductName, 'ORDEN ALITAS');
  assert.equal(summary.topProductUnits, 2);

  // Tie in units sold (1 each): higher revenue item should lead
  const tieSale: Sale = {
    ...todaySale,
    id: 's-tie',
    items: [
      { key: '729', name: 'ALAS CONVINADAS', priceCents: 9500, qty: 1, note: '' },
      { key: '722', name: 'BONELES BARBACHU', priceCents: 13000, qty: 1, note: '' },
    ],
    subtotalCents: 22500,
    totalCents: 22500,
  };
  const tieSummary = buildDailySalesSummary([tieSale], products, ref);
  assert.equal(tieSummary.topProductName, 'BONELES BARBACHU');
  assert.equal(tieSummary.topProductUnits, 1);
});

