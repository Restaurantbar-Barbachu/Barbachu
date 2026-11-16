export type ServiceType = 'mesa' | 'barra_exterior' | 'barra_interior' | 'para_llevar' | 'domicilio';

export interface Product {
  id: string;
  name: string;
  category: string;
  priceCents: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  initialQuantity: number;
}

export interface Recipe {
  productId: string;
  ingredientId: string;
  quantityPerUnit: number;
}

export interface Catalog {
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
}

export interface AppState {
  schemaVersion: number;
  orders: any[];
  sales: any[];
  stock: Record<string, number>;
  nextOrderNumber: number;
}

export interface LocationOption {
  value: string;
  label: string;
  service: ServiceType;
}

export type OrderStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'closed' | 'delivered';
export type Priority = 'normal' | 'alta';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

export interface OrderItem {
  key: string;
  name: string;
  priceCents: number;
  qty: number;
  note: string;
  station?: 'cocina' | 'barra';
}

export interface CustomerDelivery {
  name: string;
  phone: string;
  address: string;
  reference: string;
}

export interface Order {
  id: string;
  number: number;
  service: ServiceType;
  location: string;
  table: string;
  waiter: string;
  note: string;
  customer?: CustomerDelivery;
  items: OrderItem[];
  totalCents: number;
  discountCents: number;
  priority: Priority;
  status: OrderStatus;
  paid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  receipt: string;
  orderId?: string;
  service: ServiceType;
  location: string;
  table: string;
  waiter: string;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  amountCash?: number;
  amountCard?: number;
  changeGiven?: number;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  user: string;
  action: string;
  detail: string;
  reason?: string;
}

export interface CashShift {
  id: string;
  initialCashCents: number;
  isOpen: boolean;
  openedAt: string;
  closedAt?: string;
  cashSalesCents: number;
  cardSalesCents: number;
  transferSalesCents: number;
  totalSalesCents: number;
  expectedCashCents: number;
  actualCashCents?: number;
  differenceCents?: number;
  closedByUser?: string;
}

export interface InventoryItem {
  clave: number;
  descripcion: string;
  unidad: string;
  categoria: string;
  costo: number;
  stock: number;
  minStock: number;
}

export interface InventoryMovement {
  id: string;
  at: string;
  clave: number;
  descripcion: string;
  type: 'entrada' | 'ajuste' | 'consumo' | 'merma';
  qty: number;
  costUnit: number;
  reason: string;
  user: string;
}

export type UserRole = 'admin' | 'caja' | 'mesero' | 'cocina';

export interface RolePermissions {
  canEditCatalog: boolean;
  canApplyDiscount: boolean;
  canCancelOrders: boolean;
  canCashShiftCut: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canAccessKds: boolean;
  canTakeOrders: boolean;
  canCollectPayment: boolean;
}

export interface PosUser {
  id: string;
  name: string;
  role: UserRole;
  avatar: string;
  pin: string;
  area: string;
}

export type DeviceStation = 'todos' | 'comandero' | 'caja' | 'cocina' | 'barra';

export interface DeviceConfig {
  station: DeviceStation;
  stationName: string;
  autoLockMinutes: number;
}

export interface RestaurantConfig {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  currency: string;
  whatsappNumber: string;
}

export interface SoftProduct {
  key: string;
  name: string;
  group: string;
  category: string;
  sourcePrice: number;
  priceCents: number;
  saleEnabled: boolean;
}

export interface FullPosState {
  products: SoftProduct[];
  orders: Order[];
  sales: Sale[];
  audit: AuditLogEntry[];
  shift: CashShift;
  inventory: Record<number, InventoryItem>;
  inventoryMovements: InventoryMovement[];
  nextOrderNumber: number;
  users: PosUser[];
  activeUser: PosUser;
  permissions: Record<UserRole, RolePermissions>;
  deviceConfig: DeviceConfig;
  config: RestaurantConfig;
}

export interface MenuItemData {
  id: string;
  name: string;
  price: string;
  priceCents?: number;
  group: string;
  sub?: string;
  icon?: string;
  desc?: string;
}

export interface MenuSectionData {
  id: string;
  title: string;
  part?: string;
  items: MenuItemData[];
  note?: string;
  subcategories?: {
    caption: string;
    description?: string;
    items: MenuItemData[];
  }[];
}
