import type { CashShift, Order } from '../types';

export const WORKSPACE_PAGE_LIMITS = {
  products: 250,
  publicProducts: 250,
  orders: 100,
  sales: 100,
  shifts: 1,
  inventory: 200,
  inventoryMovements: 100,
  staffUsers: 100,
  staffClock: 100,
  auditLogs: 100,
  terminals: 30,
} as const;

export const MAX_PAGINATION_LIMIT = 250;
export const DEFAULT_PAGINATION_LIMIT = 50;

export interface QueryFilterSpec {
  field: string;
  op: '==' | '!=' | 'array-contains';
  value: string | boolean | number;
}

export interface ScopedQuerySpec {
  collectionName: string;
  filters: QueryFilterSpec[];
  orderByField?: string;
  orderDirection: 'asc' | 'desc';
  limitCount: number;
}

export function normalizePageSize(requested?: number, fallback = DEFAULT_PAGINATION_LIMIT): number {
  const base = Number.isFinite(requested) ? Math.floor(Number(requested)) : fallback;
  return Math.min(MAX_PAGINATION_LIMIT, Math.max(1, base));
}

export function buildScopedEmailFilter(
  callerEmail: string,
  isBootstrapAdmin: boolean
): QueryFilterSpec[] {
  const cleanEmail = callerEmail.trim().toLowerCase();
  if (isBootstrapAdmin || !cleanEmail) return [];
  return [{ field: 'authorizedEmails', op: 'array-contains', value: cleanEmail }];
}

export function buildActiveOrdersQuerySpec(
  callerEmail: string,
  isBootstrapAdmin: boolean,
  pageSize: number = WORKSPACE_PAGE_LIMITS.orders
): ScopedQuerySpec {
  return {
    collectionName: 'orders',
    filters: [
      ...buildScopedEmailFilter(callerEmail, isBootstrapAdmin),
      { field: 'paid', op: '==', value: false },
    ],
    orderByField: 'updatedAt',
    orderDirection: 'desc',
    limitCount: normalizePageSize(pageSize, WORKSPACE_PAGE_LIMITS.orders),
  };
}

export function buildOpenShiftQuerySpec(
  callerEmail: string,
  isBootstrapAdmin: boolean
): ScopedQuerySpec {
  return {
    collectionName: 'shifts',
    filters: [
      ...buildScopedEmailFilter(callerEmail, isBootstrapAdmin),
      { field: 'isOpen', op: '==', value: true },
    ],
    orderByField: 'openedAt',
    orderDirection: 'desc',
    limitCount: WORKSPACE_PAGE_LIMITS.shifts,
  };
}

export function buildPaginatedCollectionQuerySpec(
  collectionName: string,
  callerEmail: string,
  isBootstrapAdmin: boolean,
  orderByField: string,
  orderDirection: 'asc' | 'desc' = 'desc',
  pageSize = DEFAULT_PAGINATION_LIMIT,
  extraFilters: QueryFilterSpec[] = []
): ScopedQuerySpec {
  return {
    collectionName,
    filters: [...buildScopedEmailFilter(callerEmail, isBootstrapAdmin), ...extraFilters],
    orderByField,
    orderDirection,
    limitCount: normalizePageSize(pageSize),
  };
}

export function filterActiveOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => !o.paid && o.status !== 'closed')
    .slice()
    .sort((a, b) => a.number - b.number);
}

export function selectActiveOrLatestShift(shifts: CashShift[]): CashShift | null {
  if (!shifts || shifts.length === 0) return null;
  const sorted = shifts.slice().sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  return sorted.find((s) => s.isOpen) || sorted[0] || null;
}

export function mergePaginatedRecords<T>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of existing) {
    const k = getKey(item);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(item);
    }
  }
  for (const item of incoming) {
    const k = getKey(item);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(item);
    }
  }
  return result;
}

export function isMissingIndexError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return code === 'failed-precondition' || msg.includes('requires an index') || msg.includes('index');
}
