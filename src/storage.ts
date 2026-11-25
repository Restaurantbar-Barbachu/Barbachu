import { FullPosState, PosUser, InventoryItem, CashShift, RestaurantConfig, UserRole, RolePermissions, DeviceConfig } from './types';
import { SOFT_INGREDIENTS, SOFT_PRODUCTS } from './data/softRestaurantCatalog';

export const POS_STORAGE_KEY = 'barbachu.pos.device.v2';
const LEGACY_POS_STORAGE_KEY = 'barbachu.pos.production.v1';

export const DEFAULT_USERS: PosUser[] = [
  {
    id: 'usr-admin',
    name: 'Administrador Principal',
    role: 'admin',
    avatar: 'AD',
    pin: '****',
    mustChangePin: true,
    area: 'Gerencia General',
  },
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

export const DEVICE_STATION_NAMES: Record<DeviceConfig['station'], string> = {
  todos: 'Terminal Central / Multi-Área',
  comandero: 'Comandero Portátil / Salón',
  caja: 'Caja Principal / Cobros',
  cocina: 'Monitor KDS Cocina',
  barra: 'Monitor KDS Barra',
};

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  station: 'todos',
  stationName: DEVICE_STATION_NAMES.todos,
  autoLockMinutes: 0,
};

const DEVICE_ID_KEY = 'barbachu.pos.device_id.v1';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'term-ssr';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[a-zA-Z0-9_\-]{6,64}$/.test(existing)) {
      return existing;
    }
    const rand =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
        : Math.random().toString(36).slice(2, 12);
    const created = `term-${rand}`;
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `term-${Date.now().toString(36)}`;
  }
}

export function detectDevicePlatformLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Terminal';
  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'iPad / Tablet iOS';
  }
  if (/iPhone/i.test(ua)) return 'iPhone / Móvil iOS';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android Móvil' : 'Tablet Android';
  if (/Mac/i.test(ua)) return 'Mac / Navegador';
  if (/Windows/i.test(ua)) return 'Windows / Navegador';
  return 'Terminal Web';
}

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

interface LightweightTerminalPrefs {
  deviceConfig?: DeviceConfig;
  config?: Partial<RestaurantConfig>;
}

export function loadPosState(storage: Storage = window.localStorage): FullPosState {
  const base = createInitialPosState();
  try {
    // Purge legacy v1 full-state dump that stored plaintext PINs and full collections
    if (storage.getItem(LEGACY_POS_STORAGE_KEY)) {
      storage.removeItem(LEGACY_POS_STORAGE_KEY);
    }
    const raw = storage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LightweightTerminalPrefs;
      if (parsed && typeof parsed === 'object') {
        return {
          ...base,
          deviceConfig: parsed.deviceConfig
            ? { ...DEFAULT_DEVICE_CONFIG, ...parsed.deviceConfig }
            : DEFAULT_DEVICE_CONFIG,
          config: parsed.config ? { ...DEFAULT_CONFIG, ...parsed.config } : DEFAULT_CONFIG,
        };
      }
    }
  } catch (err) {
    console.warn('Error loading terminal preferences, returning initial state:', err);
  }
  return base;
}

export function savePosState(state: FullPosState, storage: Storage = window.localStorage): void {
  try {
    const prefs: LightweightTerminalPrefs = {
      deviceConfig: state.deviceConfig,
      config: {
        name: state.config.name,
        tagline: state.config.tagline,
        address: state.config.address,
        currency: state.config.currency,
        receiptFooter: state.config.receiptFooter,
        suggestedTipPct: state.config.suggestedTipPct,
        autoLockMinutes: state.config.autoLockMinutes,
      },
    };
    storage.setItem(POS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('Error saving terminal preferences:', err);
  }
}

export const formatMoney = (cents: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((Number(cents) || 0) / 100);
