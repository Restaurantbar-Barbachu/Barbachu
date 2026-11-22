import { FullPosState, PosUser, InventoryItem, CashShift, RestaurantConfig, UserRole, RolePermissions, DeviceConfig } from './types';
import { SOFT_INGREDIENTS, SOFT_PRODUCTS } from './data/softRestaurantCatalog';

export const POS_STORAGE_KEY = 'barbachu.pos.production.v1';

export const DEFAULT_USERS: PosUser[] = [
  { id: 'usr-admin', name: 'Administrador Principal', role: 'admin', avatar: 'AD', pin: '0000', area: 'Gerencia General' },
];

export const DEFAULT_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canEditCatalog: true,
    canApplyDiscount: true,
    canCancelOrders: true,
    canCashShiftCut: true,
    canViewReports: true,
    canManageUsers: true,
    canAccessKds: true,
    canTakeOrders: true,
    canCollectPayment: true,
  },
  caja: {
    canEditCatalog: false,
    canApplyDiscount: true,
    canCancelOrders: false,
    canCashShiftCut: true,
    canViewReports: true,
    canManageUsers: false,
    canAccessKds: false,
    canTakeOrders: true,
    canCollectPayment: true,
  },
  mesero: {
    canEditCatalog: false,
    canApplyDiscount: false,
    canCancelOrders: false,
    canCashShiftCut: false,
    canViewReports: false,
    canManageUsers: false,
    canAccessKds: false,
    canTakeOrders: true,
    canCollectPayment: false,
  },
  cocina: {
    canEditCatalog: false,
    canApplyDiscount: false,
    canCancelOrders: false,
    canCashShiftCut: false,
    canViewReports: false,
    canManageUsers: false,
    canAccessKds: true,
    canTakeOrders: false,
    canCollectPayment: false,
  },
};

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  station: 'todos',
  stationName: 'Estación Central / Multi-Área',
  autoLockMinutes: 0,
};

export const DEFAULT_CONFIG: RestaurantConfig = {
  name: 'Barbachu',
  tagline: 'Restaurante Bar',
  address: 'Poza Rica #4984, San Pedrito, Tlaquepaque, Jal.',
  phone: '',
  currency: 'MXN',
  whatsappNumber: '',
  receiptFooter: '¡Gracias por su preferencia!',
  suggestedTipPct: 10,
  autoLockMinutes: 0,
};

export function createInitialInventory(): Record<number, InventoryItem> {
  const inv: Record<number, InventoryItem> = {};
  for (const item of SOFT_INGREDIENTS) {
    inv[item.Clave] = {
      clave: item.Clave,
      descripcion: item['Descripción'],
      unidad: item.Unidad || 'PZA',
      categoria: item['Categoría'] || 'GENERAL',
      costo: item.Costo || item['Costo Promedio'] || 0,
      stock: 0,
      minStock: 0,
    };
  }
  return inv;
}

export function createInitialShift(initialCashCents = 0): CashShift {
  const safeInitial = Math.max(0, Math.round(Number(initialCashCents) || 0));
  return {
    id: `TURNO-${Date.now().toString(36)}`,
    initialCashCents: safeInitial,
    isOpen: true,
    openedAt: new Date().toISOString(),
    cashSalesCents: 0,
    cardSalesCents: 0,
    transferSalesCents: 0,
    totalSalesCents: 0,
    expectedCashCents: safeInitial,
    retirosCents: 0,
    depositosCents: 0,
  };
}

export function createInitialPosState(): FullPosState {
  return {
    products: SOFT_PRODUCTS.map((p) => ({ ...p })),
    orders: [],
    sales: [],
    audit: [],
    shift: createInitialShift(0),
    inventory: createInitialInventory(),
    inventoryMovements: [],
    nextOrderNumber: 1,
    nextReceiptNumber: 1,
    users: DEFAULT_USERS,
    activeUser: DEFAULT_USERS[0],
    permissions: DEFAULT_PERMISSIONS,
    deviceConfig: DEFAULT_DEVICE_CONFIG,
    config: DEFAULT_CONFIG,
    staffClock: [],
  };
}

export function loadPosState(storage: Storage = window.localStorage): FullPosState {
  try {
    const raw = storage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.sales)) {
        const users: PosUser[] =
          Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : DEFAULT_USERS;
        const activeUser =
          parsed.activeUser && users.some((u) => u.id === parsed.activeUser.id)
            ? parsed.activeUser
            : users[0];

        return {
          ...createInitialPosState(),
          ...parsed,
          users,
          activeUser,
          permissions: parsed.permissions || DEFAULT_PERMISSIONS,
          deviceConfig: parsed.deviceConfig || DEFAULT_DEVICE_CONFIG,
          config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
          staffClock: Array.isArray(parsed.staffClock) ? parsed.staffClock : [],
          products:
            Array.isArray(parsed.products) && parsed.products.length > 0
              ? parsed.products
              : SOFT_PRODUCTS.map((p) => ({ ...p })),
          inventory: {
            ...createInitialInventory(),
            ...(parsed.inventory || {}),
          },
        };
      }
    }
  } catch (err) {
    console.warn('Error loading POS state, returning initial state:', err);
  }
  return createInitialPosState();
}

export function savePosState(state: FullPosState, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(POS_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving POS state:', err);
  }
}

export const formatMoney = (cents: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((Number(cents) || 0) / 100);
