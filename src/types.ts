export type ServiceType = 'mesa' | 'barra_exterior' | 'barra_interior' | 'para_llevar' | 'domicilio';

export type OrderStatus = 'sent' | 'preparing' | 'ready' | 'served' | 'closed' | 'delivered';
export type Priority = 'normal' | 'alta';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served';
export type StationType = 'cocina' | 'barra';

export interface OrderItemModifier {
  name: string;
  priceCents: number;
}

export interface OrderItem {
  lineId?: string;
  key: string;
  name: string;
  priceCents: number;
  qty: number;
  note: string;
  station?: StationType;
  itemStatus?: ItemStatus;
  modifiers?: OrderItemModifier[];
  modificadores?: OrderItemModifier[];
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
  retirosCents?: number;
  depositosCents?: number;
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
  pinHash?: string;
  mustChangePin?: boolean;
  area: string;
  email?: string;
}

export type DeviceStation = 'todos' | 'comandero' | 'caja' | 'cocina' | 'barra';

export interface DeviceConfig {
  station: DeviceStation;
  stationName: string;
  autoLockMinutes: number;
}

export interface TerminalSession {
  deviceId: string;
  station: DeviceStation;
  stationName: string;
  staffName: string;
  staffRole: UserRole;
  operatorEmail: string;
  online: boolean;
  platform: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface RestaurantConfig {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  currency: string;
  whatsappNumber: string;
  receiptFooter?: string;
  suggestedTipPct?: number;
  autoLockMinutes?: number;
}

export interface ModifierScope {
  mode: 'all' | 'specific';
  productKeys?: string[];
  categories?: string[];
}

export interface SoftProduct {
  key: string;
  name: string;
  group: string;
  category: string;
  station?: StationType;
  sourcePrice: number;
  priceCents: number;
  saleEnabled: boolean;
  modifierScope?: ModifierScope;
}

export interface TimeClockRecord {
  id: string;
  userId: string;
  userName: string;
  role: string;
  clockIn: string;
  clockOut?: string;
  status: 'activo' | 'finalizado';
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
  nextReceiptNumber?: number;
  users: PosUser[];
  activeUser: PosUser;
  permissions: Record<UserRole, RolePermissions>;
  deviceConfig: DeviceConfig;
  config: RestaurantConfig;
  staffClock: TimeClockRecord[];
  authorizedEmails?: string[];
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
