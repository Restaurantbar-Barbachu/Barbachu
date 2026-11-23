import type { InventoryItem, Sale } from '../types';

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
