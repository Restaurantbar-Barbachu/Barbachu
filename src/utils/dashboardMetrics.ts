import { lineTotalCents } from '../core';
import type { InventoryItem, Sale, SoftProduct } from '../types';

export type InventoryHealthStatus = 'critico' | 'bajo' | 'optimo';

export interface SalesTrendPoint {
  date: string;
  dateKey: string;
  ventas: number;
  tickets: number;
}

export interface HourlySalesPoint {
  hora: string;
  ventas: number;
  tickets: number;
}

export interface InventoryLevelPoint {
  clave: number;
  shortName: string;
  fullName: string;
  categoria: string;
  unidad: string;
  stock: number;
  minStock: number;
  costo: number;
  valorTotal: number;
  status: InventoryHealthStatus;
}

export interface InventorySummaryMetrics {
  totalItems: number;
  outOfStockCount: number;
  criticalCount: number;
  lowCount: number;
  healthyCount: number;
  totalValuation: number;
  chartItems: InventoryLevelPoint[];
}

export function toLocalDateKey(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function classifyInventoryHealth(stock: number, minStock: number): InventoryHealthStatus {
  if (stock <= 0 || (minStock > 0 && stock <= minStock)) {
    return 'critico';
  }
  if (minStock > 0 && stock <= minStock * 1.35) {
    return 'bajo';
  }
  return 'optimo';
}

export function buildSalesTrend(
  sales: Sale[],
  days = 7,
  referenceDate: Date = new Date()
): SalesTrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days));
  const dateMap = new Map<string, { revenueCents: number; count: number }>();

  for (const sale of sales) {
    const key = toLocalDateKey(sale.paidAt);
    if (!key) continue;
    const current = dateMap.get(key) || { revenueCents: 0, count: 0 };
    current.revenueCents += sale.totalCents;
    current.count += 1;
    dateMap.set(key, current);
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const points: SalesTrendPoint[] = [];

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const key = toLocalDateKey(d);
    const live = dateMap.get(key);
    points.push({
      date: `${dayNames[d.getDay()]} ${d.getDate()}`,
      dateKey: key,
      ventas: live ? Math.round((live.revenueCents / 100) * 100) / 100 : 0,
      tickets: live ? live.count : 0,
    });
  }

  return points;
}

export function buildHourlySalesTrend(
  sales: Sale[],
  referenceDate: Date = new Date()
): HourlySalesPoint[] {
  const targetDayKey = toLocalDateKey(referenceDate);
  const hours = Array.from({ length: 14 }, (_, idx) => `${String((idx + 10) % 24).padStart(2, '0')}:00`);
  const bucketMap = new Map<string, { revenueCents: number; tickets: number }>();

  for (const h of hours) {
    bucketMap.set(h, { revenueCents: 0, tickets: 0 });
  }

  for (const sale of sales) {
    if (toLocalDateKey(sale.paidAt) !== targetDayKey) continue;
    const paidDate = new Date(sale.paidAt);
    if (Number.isNaN(paidDate.getTime())) continue;
    const hourLabel = `${String(paidDate.getHours()).padStart(2, '0')}:00`;
    const bucket = bucketMap.get(hourLabel);
    if (bucket) {
      bucket.revenueCents += sale.totalCents;
      bucket.tickets += 1;
    }
  }

  return hours.map((hora) => {
    const entry = bucketMap.get(hora)!;
    return {
      hora,
      ventas: Math.round((entry.revenueCents / 100) * 100) / 100,
      tickets: entry.tickets,
    };
  });
}

const STATUS_WEIGHT: Record<InventoryHealthStatus, number> = {
  critico: 0,
  bajo: 1,
  optimo: 2,
};

export function buildInventoryLevels(
  inventory: Record<number, InventoryItem> | undefined,
  maxItems = 8
): InventorySummaryMetrics {
  const items = Object.values(inventory || {});
  let outOfStockCount = 0;
  let criticalCount = 0;
  let lowCount = 0;
  let healthyCount = 0;
  let totalValuation = 0;

  const mapped: InventoryLevelPoint[] = items.map((item) => {
    const stock = Math.max(0, Number(item.stock) || 0);
    const minStock = Math.max(0, Number(item.minStock) || 0);
    const costo = Math.max(0, Number(item.costo) || 0);
    const valorTotal = Math.round(stock * costo * 100) / 100;
    const status = classifyInventoryHealth(stock, minStock);

    if (stock <= 0) outOfStockCount += 1;
    if (status === 'critico') criticalCount += 1;
    else if (status === 'bajo') lowCount += 1;
    else healthyCount += 1;

    totalValuation += valorTotal;

    const cleanName = String(item.descripcion || `Insumo ${item.clave}`).trim();
    const shortName = cleanName.length > 18 ? `${cleanName.slice(0, 16)}…` : cleanName;

    return {
      clave: item.clave,
      shortName,
      fullName: cleanName,
      categoria: item.categoria || 'General',
      unidad: item.unidad || 'Pza',
      stock,
      minStock,
      costo,
      valorTotal,
      status,
    };
  });

  // Sort critical/low stock items first so restaurant managers immediately see what needs restocking
  mapped.sort((a, b) => {
    const weightDiff = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
    if (weightDiff !== 0) return weightDiff;
    const ratioA = a.minStock > 0 ? a.stock / a.minStock : a.stock;
    const ratioB = b.minStock > 0 ? b.stock / b.minStock : b.stock;
    if (ratioA !== ratioB) return ratioA - ratioB;
    return a.fullName.localeCompare(b.fullName, 'es');
  });

  return {
    totalItems: items.length,
    outOfStockCount,
    criticalCount,
    lowCount,
    healthyCount,
    totalValuation: Math.round(totalValuation * 100) / 100,
    chartItems: mapped.slice(0, Math.max(1, maxItems)),
  };
}

export interface TopProductMetric {
  name: string;
  fullName: string;
  unidades: number;
  ingresos: number;
  categoria: string;
}

export interface CategorySalesMetric {
  categoria: string;
  ventas: number;
}

export function buildSalesPerformanceMetrics(
  sales: Sale[],
  products: SoftProduct[],
  productMetric: 'revenue' | 'units' = 'revenue'
): { topProducts: TopProductMetric[]; categorySales: CategorySalesMetric[] } {
  const productMap = new Map<string, SoftProduct>();
  for (const p of products) {
    productMap.set(p.key, p);
  }

  const productStats = new Map<string, { name: string; category: string; units: number; revenueCents: number }>();
  const categoryStats = new Map<string, number>();

  for (const sale of sales) {
    let itemsGrossCents = 0;
    const itemRevenues = sale.items.map((item) => {
      const gross = lineTotalCents(item);
      itemsGrossCents += gross;
      return gross;
    });

    const netRatio =
      itemsGrossCents > 0 && sale.discountCents > 0
        ? Math.max(0, sale.totalCents) / itemsGrossCents
        : 1;

    sale.items.forEach((item, idx) => {
      const prod = productMap.get(item.key);
      const category = prod?.category || 'PLATILLOS';
      const netItemCents = Math.round(itemRevenues[idx] * netRatio);

      const curr = productStats.get(item.key) || {
        name: item.name,
        category,
        units: 0,
        revenueCents: 0,
      };
      curr.units += item.qty;
      curr.revenueCents += netItemCents;
      productStats.set(item.key, curr);

      categoryStats.set(category, (categoryStats.get(category) || 0) + netItemCents);
    });
  }

  const topProducts: TopProductMetric[] = Array.from(productStats.values())
    .sort((a, b) => (productMetric === 'revenue' ? b.revenueCents - a.revenueCents : b.units - a.units))
    .slice(0, 7)
    .map((p) => ({
      name: p.name.length > 18 ? p.name.slice(0, 16) + '...' : p.name,
      fullName: p.name,
      unidades: p.units,
      ingresos: Math.round((p.revenueCents / 100) * 100) / 100,
      categoria: p.category,
    }));

  const categorySales: CategorySalesMetric[] = Array.from(categoryStats.entries())
    .map(([categoria, cents]) => ({
      categoria,
      ventas: Math.round((cents / 100) * 100) / 100,
    }))
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 6);

  return { topProducts, categorySales };
}
