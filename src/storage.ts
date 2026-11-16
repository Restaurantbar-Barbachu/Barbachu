import { FullPosState, PosUser, InventoryItem, CashShift, RestaurantConfig, UserRole, RolePermissions, DeviceConfig } from './types';
import { SOFT_INGREDIENTS, SOFT_PRODUCTS } from './data/softRestaurantCatalog';

export const POS_STORAGE_KEY = 'barbachu.pos.production.v1';

export const DEFAULT_USERS: PosUser[] = [
  { id: 'usr-admin', name: 'Mauro (Administrador)', role: 'admin', avatar: 'AD', pin: '1234', area: 'Gerencia General' },
  { id: 'usr-caja', name: 'Caja Mostrador', role: 'caja', avatar: 'CA', pin: '2222', area: 'Caja Principal' },
  { id: 'usr-mesero1', name: 'Andrea (Mesera)', role: 'mesero', avatar: 'AN', pin: '3333', area: 'Salón Principal' },
  { id: 'usr-mesero2', name: 'Diego (Mesero)', role: 'mesero', avatar: 'DI', pin: '3334', area: 'Terraza y Barra Exterior' },
  { id: 'usr-mesero3', name: 'Mariana (Mesera)', role: 'mesero', avatar: 'MA', pin: '3335', area: 'Salón y Domicilio' },
  { id: 'usr-cocina', name: 'Jefe de Cocina / KDS', role: 'cocina', avatar: 'CO', pin: '4444', area: 'Cocina Caliente' },
  { id: 'usr-barra', name: 'Bartender / Barra', role: 'cocina', avatar: 'BA', pin: '5555', area: 'Barra de Bebidas' },
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
  phone: '+52 33 1445 6850',
  currency: 'MXN',
  whatsappNumber: '523314456850',
};

export function createInitialInventory(): Record<number, InventoryItem> {
  const inv: Record<number, InventoryItem> = {};
  for (const item of SOFT_INGREDIENTS) {
    let initialStock = 20;
    if (item.Unidad === 'KG' || item.Unidad === 'kg') initialStock = 15;
    else if (item.Unidad === 'LT' || item.Unidad === 'L') initialStock = 30;
    else if (item.Unidad === 'PZA' || item.Unidad === 'pza') initialStock = 50;

    inv[item.Clave] = {
      clave: item.Clave,
      descripcion: item['Descripción'],
      unidad: item.Unidad || 'PZA',
      categoria: item['Categoría'] || 'GENERAL',
      costo: item.Costo || item['Costo Promedio'] || 0,
      stock: initialStock,
      minStock: 5,
    };
  }
  return inv;
}

export function createInitialShift(): CashShift {
  return {
    id: `TURNO-${Date.now().toString(36)}`,
    initialCashCents: 100000, // $1,000.00 MXN fondo inicial
    isOpen: true,
    openedAt: new Date().toISOString(),
    cashSalesCents: 0,
    cardSalesCents: 0,
    transferSalesCents: 0,
    totalSalesCents: 0,
    expectedCashCents: 100000,
  };
}

export function createInitialPosState(): FullPosState {
  return {
    products: SOFT_PRODUCTS.map((p) => ({ ...p })),
    orders: [],
    sales: [],
    audit: [
      {
        id: `aud-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        user: DEFAULT_USERS[0].name,
        action: 'Sistema inicializado',
        detail: 'POS Barbachu listo para operaciones en vivo con catálogo SoftRestaurant de 199 productos y 121 insumos.',
      },
    ],
    shift: createInitialShift(),
    inventory: createInitialInventory(),
    inventoryMovements: [],
    nextOrderNumber: 1,
    users: DEFAULT_USERS,
    activeUser: DEFAULT_USERS[0],
    permissions: DEFAULT_PERMISSIONS,
    deviceConfig: DEFAULT_DEVICE_CONFIG,
    config: DEFAULT_CONFIG,
  };
}

export function loadPosState(storage: Storage = window.localStorage): FullPosState {
  try {
    const raw = storage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.sales)) {
        return {
          ...createInitialPosState(),
          ...parsed,
          users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : DEFAULT_USERS,
          permissions: parsed.permissions || DEFAULT_PERMISSIONS,
          deviceConfig: parsed.deviceConfig || DEFAULT_DEVICE_CONFIG,
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

    // Try migration from legacy keys if available
    const legacyV2 = storage.getItem('barbachu.pos.demo.v2');
    if (legacyV2) {
      const parsed = JSON.parse(legacyV2);
      if (parsed && Array.isArray(parsed.orders)) {
        const state = createInitialPosState();
        state.orders = parsed.orders || [];
        state.sales = parsed.sales || [];
        state.audit = parsed.audit || state.audit;
        state.nextOrderNumber = parsed.nextNumber || 1;
        return state;
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
