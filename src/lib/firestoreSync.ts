import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  onSnapshotsInSync,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  db,
  BOOTSTRAPPED_ADMIN_EMAIL,
  handleFirestoreError,
  OperationType,
} from './firebase';
import type {
  AuditLogEntry,
  CashShift,
  DeviceStation,
  InventoryItem,
  InventoryMovement,
  Order,
  OrderItem,
  PosUser,
  RestaurantConfig,
  RolePermissions,
  Sale,
  SoftProduct,
  TerminalSession,
  TimeClockRecord,
  UserRole,
} from '../types';
import {
  DEFAULT_CONFIG,
  DEFAULT_PERMISSIONS,
  DEFAULT_USERS,
  createInitialInventory,
  createInitialShift,
} from '../storage';
import { SOFT_PRODUCTS } from '../data/softRestaurantCatalog';
import { classifyProductStation } from '../core';
import { hashPin, isValidFourDigitPin, isWeakDefaultPin, verifyPinSecret } from '../utils/pinSecurity';

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
  return cleaned || `${fallbackPrefix}-${Date.now().toString(36)}`;
}

export function boundStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  return s.slice(0, maxLen);
}

export function ensureEmailList(emails: string[] | undefined, extraEmail?: string | null): string[] {
  const set = new Set<string>([BOOTSTRAPPED_ADMIN_EMAIL]);
  if (extraEmail && extraEmail.trim()) set.add(extraEmail.trim().toLowerCase());
  for (const e of emails || []) {
    if (typeof e === 'string' && e.trim()) {
      set.add(e.trim().toLowerCase());
    }
  }
  return Array.from(set).slice(0, 20);
}

export function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export function sanitizeOrderItemsForFirestore(items: OrderItem[]) {
  return items.slice(0, 100).map((it) => {
    const clean: Record<string, unknown> = {
      key: sanitizeFirestoreId(it.key, 'item').slice(0, 64),
      name: boundStr(it.name, 120, 'Producto'),
      priceCents: Math.max(0, Math.round(Number(it.priceCents) || 0)),
      qty: Math.min(99, Math.max(1, Math.round(Number(it.qty) || 1))),
    };
    if (it.lineId && String(it.lineId).trim()) {
      clean.lineId = sanitizeFirestoreId(it.lineId, 'ln').slice(0, 64);
    }
    if (it.note && it.note.trim()) clean.note = boundStr(it.note, 200);
    const mods = it.modifiers || it.modificadores;
    if (mods && Array.isArray(mods) && mods.length > 0) {
      clean.modifiers = mods.slice(0, 15).map((m) => ({
        name: boundStr(m.name, 60, 'Modifier'),
        priceCents: Math.max(0, Math.round(Number(m.priceCents) || 0)),
      }));
    }
    clean.station = it.station === 'barra' ? 'barra' : 'cocina';
    clean.itemStatus =
      it.itemStatus && ['pending', 'preparing', 'ready', 'served'].includes(it.itemStatus)
        ? it.itemStatus
        : 'pending';
    return clean;
  });
}

function buildOrderPayload(
  order: Order,
  ownerUid: string,
  authorizedEmails: string[],
  isNew: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: sanitizeFirestoreId(order.id, 'ord'),
    number: Math.max(1, Math.round(Number(order.number) || 1)),
    service: order.service,
    location: boundStr(order.location, 40, '1'),
    table: boundStr(order.table || order.location, 40, '1'),
    waiter: boundStr(order.waiter, 80, 'Staff'),
    items: sanitizeOrderItemsForFirestore(order.items),
    totalCents: Math.max(0, Math.round(Number(order.totalCents) || 0)),
    discountCents: Math.max(0, Math.round(Number(order.discountCents) || 0)),
    priority: order.priority === 'alta' ? 'alta' : 'normal',
    status: order.status,
    paid: Boolean(order.paid),
    ownerUid: sanitizeFirestoreId(ownerUid, 'usr'),
    authorizedEmails: ensureEmailList(authorizedEmails),
    updatedAt: serverTimestamp(),
  };
  if (order.note && order.note.trim()) {
    payload.note = boundStr(order.note, 300);
  }
  if (order.customer && (order.customer.name || order.customer.phone || order.customer.address)) {
    payload.customer = {
      name: boundStr(order.customer.name, 80),
      phone: boundStr(order.customer.phone, 30),
      address: boundStr(order.customer.address, 200),
      reference: boundStr(order.customer.reference, 120),
    };
  }
  if (isNew) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

function buildAuditPayload(
  entry: AuditLogEntry,
  ownerUid: string,
  authorizedEmails: string[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: sanitizeFirestoreId(entry.id, 'aud'),
    at: serverTimestamp(),
    user: boundStr(entry.user, 80, 'Sistema'),
    action: boundStr(entry.action, 80, 'Evento'),
    detail: boundStr(entry.detail, 300, 'Acción registrada'),
    ownerUid: sanitizeFirestoreId(ownerUid, 'usr'),
    authorizedEmails: ensureEmailList(authorizedEmails),
  };
  if (entry.reason && entry.reason.trim()) {
    payload.reason = boundStr(entry.reason, 200);
  }
  return payload;
}

export async function bootstrapWorkspace(user: User): Promise<{
  isAdmin: boolean;
  authorized: boolean;
  seeded: boolean;
  workspaceOwnerUid: string;
}> {
  const email = (user.email || '').toLowerCase();
  const isBootstrapAdmin = Boolean(user.emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);

  // 1. Ensure /users/{uid} profile exists
  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: sanitizeFirestoreId(user.uid, 'usr'),
        email: boundStr(email, 180),
        displayName: boundStr(user.displayName || email.split('@')[0] || 'Operador', 120),
        role: isBootstrapAdmin ? 'admin' : 'mesero',
        area: isBootstrapAdmin ? 'Gerencia General' : 'Operación POS',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // 2. Ensure /admins/{uid} marker exists for bootstrapped admin
  if (isBootstrapAdmin) {
    const adminPath = `admins/${user.uid}`;
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid: sanitizeFirestoreId(user.uid, 'adm'),
          email: boundStr(email, 180),
          grantedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
  }

  let isAdmin = isBootstrapAdmin;
  if (!isAdmin) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      isAdmin = adminSnap.exists();
    } catch {
      isAdmin = false;
    }
  }

  // 3. Check /pos_config/main and seed initial restaurant data if empty and user is Admin
  const configPath = 'pos_config/main';
  let workspaceOwnerUid = user.uid;
  let seeded = false;

  try {
    const configRef = doc(db, 'pos_config', 'main');
    const configSnap = await getDoc(configRef);

    if (configSnap.exists()) {
      const cfgData = configSnap.data();
      if (typeof cfgData.ownerUid === 'string' && cfgData.ownerUid) {
        workspaceOwnerUid = cfgData.ownerUid;
      }
      return { isAdmin, authorized: true, seeded: false, workspaceOwnerUid };
    }

    if (!isAdmin) {
      return { isAdmin: false, authorized: false, seeded: false, workspaceOwnerUid };
    }

    if (isAdmin) {
      const emails = ensureEmailList([email]);
      // Seed pos_config/main
      await setDoc(configRef, {
        name: boundStr(DEFAULT_CONFIG.name, 80),
        tagline: boundStr(DEFAULT_CONFIG.tagline, 120),
        address: boundStr(DEFAULT_CONFIG.address, 200),
        phone: '',
        currency: boundStr(DEFAULT_CONFIG.currency, 10),
        whatsappNumber: '',
        receiptFooter: boundStr(DEFAULT_CONFIG.receiptFooter, 160),
        suggestedTipPct: Math.min(30, Math.max(0, Math.round(Number(DEFAULT_CONFIG.suggestedTipPct) || 0))),
        autoLockMinutes: Math.min(120, Math.max(0, Math.round(Number(DEFAULT_CONFIG.autoLockMinutes) || 0))),
        nextOrderNumber: 1,
        nextReceiptNumber: 1,
        permissions: DEFAULT_PERMISSIONS,
        authorizedEmails: emails,
        ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
        updatedAt: serverTimestamp(),
      });

      // Seed 199 products in batches (max 400 per batch)
      const existingProducts = await getDocs(collection(db, 'products'));
      if (existingProducts.empty) {
        const batch = writeBatch(db);
        for (const p of SOFT_PRODUCTS) {
          const prodId = sanitizeFirestoreId(p.key, 'prod');
          batch.set(doc(db, 'products', prodId), {
            key: prodId.slice(0, 64),
            name: boundStr(p.name, 120, 'Producto'),
            group: boundStr(p.group, 40, '1'),
            category: boundStr(p.category, 80, 'GENERAL'),
            station: classifyProductStation(p.category),
            sourcePrice: Math.max(0, Number(p.sourcePrice) || 0),
            priceCents: Math.max(0, Math.round(Number(p.priceCents) || 0)),
            saleEnabled: Boolean(p.saleEnabled),
            ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      // Seed 121 inventory ingredients + initial staff + initial shift + initial clock + init audit
      const invBatch = writeBatch(db);
      const initialInv = createInitialInventory();
      for (const item of Object.values(initialInv)) {
        const docId = sanitizeFirestoreId(String(item.clave), 'inv');
        invBatch.set(doc(db, 'inventory', docId), {
          clave: Math.round(Number(item.clave) || 0),
          descripcion: boundStr(item.descripcion, 140, 'Insumo'),
          unidad: boundStr(item.unidad, 20, 'PZA'),
          categoria: boundStr(item.categoria, 80, 'GENERAL'),
          costo: Math.max(0, Number(item.costo) || 0),
          stock: Math.max(0, Number(item.stock) || 0),
          minStock: Math.max(0, Number(item.minStock) || 0),
          ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
          authorizedEmails: emails,
          updatedAt: serverTimestamp(),
        });
      }

      for (const u of DEFAULT_USERS) {
        const uId = sanitizeFirestoreId(u.id, 'usr');
        const initialPinHash = await hashPin('0000');
        const staffDoc: Record<string, unknown> = {
          id: uId,
          name: boundStr(user.displayName || u.name, 80, 'Administrador'),
          role: u.role,
          avatar: boundStr((user.displayName || u.avatar).slice(0, 2).toUpperCase(), 4, 'AD'),
          pin: '****',
          pinHash: initialPinHash,
          mustChangePin: true,
          area: boundStr(u.area, 80, 'Gerencia'),
          ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
          authorizedEmails: emails,
        };
        if (u.role === 'admin') staffDoc.email = email || BOOTSTRAPPED_ADMIN_EMAIL;
        invBatch.set(doc(db, 'staff_users', uId), staffDoc);
      }

      const initShift = createInitialShift(0);
      const shiftId = sanitizeFirestoreId(initShift.id, 'TURNO');
      invBatch.set(doc(db, 'shifts', shiftId), {
        id: shiftId,
        initialCashCents: 0,
        isOpen: true,
        openedAt: serverTimestamp(),
        cashSalesCents: 0,
        cardSalesCents: 0,
        transferSalesCents: 0,
        totalSalesCents: 0,
        expectedCashCents: 0,
        retirosCents: 0,
        depositosCents: 0,
        ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
        authorizedEmails: emails,
      });

      const initAuditId = sanitizeFirestoreId(`aud-init-${Date.now().toString(36)}`, 'aud');
      invBatch.set(doc(db, 'audit_logs', initAuditId), {
        id: initAuditId,
        at: serverTimestamp(),
        user: boundStr(user.displayName || DEFAULT_USERS[0].name, 80),
        action: 'Base Firebase inicializada',
        detail: 'Catálogo de 199 productos, 121 insumos en ceros y turno inicial sincronizados en Cloud Firestore.',
        ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
        authorizedEmails: emails,
      });

      await invBatch.commit();
      seeded = true;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!isAdmin && (msg.includes('permission') || msg.includes('insufficient'))) {
      return { isAdmin: false, authorized: false, seeded: false, workspaceOwnerUid };
    }
    handleFirestoreError(error, OperationType.WRITE, configPath);
  }

  return { isAdmin, authorized: isAdmin || seeded, seeded, workspaceOwnerUid };
}

export interface WorkspaceCallbacks {
  onConfig: (data: {
    config: RestaurantConfig;
    nextOrderNumber: number;
    nextReceiptNumber: number;
    permissions: Record<UserRole, RolePermissions>;
    authorizedEmails: string[];
    ownerUid: string;
  }) => void;
  onProducts: (products: SoftProduct[]) => void;
  onOrders: (orders: Order[]) => void;
  onSales: (sales: Sale[]) => void;
  onShift: (shift: CashShift) => void;
  onInventory: (inventory: Record<number, InventoryItem>) => void;
  onMovements: (movements: InventoryMovement[]) => void;
  onUsers: (users: PosUser[]) => void;
  onClock: (records: TimeClockRecord[]) => void;
  onAudit: (entries: AuditLogEntry[]) => void;
  onError: (err: Error) => void;
}

export function subscribePosWorkspace(
  user: User,
  _isAdmin: boolean,
  callbacks: WorkspaceCallbacks
): () => void {
  const email = (user.email || '').toLowerCase();
  const isBootstrapAdmin = Boolean(user.emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);

  const scopedQuery = (
    colName: string,
    orderField?: string,
    maxDocs?: number
  ): Query<DocumentData> => {
    const colRef = collection(db, colName);
    const constraints = [];
    if (!isBootstrapAdmin) {
      constraints.push(where('authorizedEmails', 'array-contains', email));
    }
    if (orderField) {
      constraints.push(orderBy(orderField, 'desc'));
    }
    if (maxDocs && maxDocs > 0) {
      constraints.push(limit(maxDocs));
    }
    return constraints.length > 0 ? query(colRef, ...constraints) : colRef;
  };

  const reportErr = (op: OperationType, path: string) => (err: unknown) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (caught) {
      callbacks.onError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  };

  const unsubs: (() => void)[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'pos_config', 'main'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        callbacks.onConfig({
          config: {
            name: d.name || DEFAULT_CONFIG.name,
            tagline: d.tagline || DEFAULT_CONFIG.tagline,
            address: d.address || DEFAULT_CONFIG.address,
            phone: typeof d.phone === 'string' ? d.phone : '',
            currency: d.currency || DEFAULT_CONFIG.currency,
            whatsappNumber: typeof d.whatsappNumber === 'string' ? d.whatsappNumber : '',
            receiptFooter: typeof d.receiptFooter === 'string' ? d.receiptFooter : DEFAULT_CONFIG.receiptFooter,
            suggestedTipPct: typeof d.suggestedTipPct === 'number' ? d.suggestedTipPct : DEFAULT_CONFIG.suggestedTipPct,
            autoLockMinutes: typeof d.autoLockMinutes === 'number' ? d.autoLockMinutes : 0,
          },
          nextOrderNumber: Number(d.nextOrderNumber) || 1,
          nextReceiptNumber: Number(d.nextReceiptNumber) || 1,
          permissions: (d.permissions as Record<UserRole, RolePermissions>) || DEFAULT_PERMISSIONS,
          authorizedEmails: Array.isArray(d.authorizedEmails) ? d.authorizedEmails : [BOOTSTRAPPED_ADMIN_EMAIL],
          ownerUid: String(d.ownerUid || user.uid),
        });
      },
      reportErr(OperationType.GET, 'pos_config/main')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'products'),
      (snap) => {
        if (snap.empty) return;
        const items: SoftProduct[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            key: String(x.key || d.id),
            name: String(x.name || ''),
            group: String(x.group || '1'),
            category: String(x.category || 'GENERAL'),
            station: x.station === 'barra' ? 'barra' : classifyProductStation(String(x.category || '')),
            sourcePrice: Number(x.sourcePrice) || 0,
            priceCents: Number(x.priceCents) || 0,
            saleEnabled: Boolean(x.saleEnabled),
          };
        });
        items.sort((a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'));
        callbacks.onProducts(items);
      },
      reportErr(OperationType.LIST, 'products')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('orders', 'updatedAt', 200),
      (snap) => {
        const orders: Order[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            number: Number(x.number) || 1,
            service: x.service || 'mesa',
            location: String(x.location || '1'),
            table: String(x.table || x.location || '1'),
            waiter: String(x.waiter || 'Staff'),
            note: String(x.note || ''),
            customer: x.customer || undefined,
            items: Array.isArray(x.items)
              ? x.items.map((it: OrderItem, idx: number) => ({
                  ...it,
                  lineId: it.lineId || `${it.key}-${idx}`,
                  note: it.note || '',
                  modifiers: Array.isArray(it.modifiers)
                    ? it.modifiers
                    : Array.isArray(it.modificadores)
                    ? it.modificadores
                    : undefined,
                  station: it.station || 'cocina',
                  itemStatus: it.itemStatus || 'pending',
                }))
              : [],
            totalCents: Number(x.totalCents) || 0,
            discountCents: Number(x.discountCents) || 0,
            priority: x.priority === 'alta' ? 'alta' : 'normal',
            status: x.status || 'sent',
            paid: Boolean(x.paid),
            createdAt: tsToIso(x.createdAt),
            updatedAt: tsToIso(x.updatedAt),
          };
        });
        orders.sort((a, b) => a.number - b.number);
        callbacks.onOrders(orders);
      },
      reportErr(OperationType.LIST, 'orders')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('sales', 'paidAt', 300),
      (snap) => {
        const sales: Sale[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            receipt: String(x.receipt || ''),
            orderId: x.orderId ? String(x.orderId) : undefined,
            service: x.service || 'mesa',
            location: String(x.location || '1'),
            table: String(x.table || x.location || '1'),
            waiter: String(x.waiter || 'Staff'),
            items: Array.isArray(x.items)
              ? x.items.map((it: OrderItem, idx: number) => ({
                  ...it,
                  lineId: it.lineId || `${it.key}-${idx}`,
                  modifiers: Array.isArray(it.modifiers)
                    ? it.modifiers
                    : Array.isArray(it.modificadores)
                    ? it.modificadores
                    : undefined,
                }))
              : [],
            subtotalCents: Number(x.subtotalCents) || 0,
            discountCents: Number(x.discountCents) || 0,
            totalCents: Number(x.totalCents) || 0,
            paymentMethod: x.paymentMethod || 'efectivo',
            paidAt: tsToIso(x.paidAt),
            amountCash: typeof x.amountCash === 'number' ? x.amountCash : undefined,
            amountCard: typeof x.amountCard === 'number' ? x.amountCard : undefined,
            changeGiven: typeof x.changeGiven === 'number' ? x.changeGiven : undefined,
          };
        });
        sales.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
        callbacks.onSales(sales);
      },
      reportErr(OperationType.LIST, 'sales')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('shifts', 'openedAt', 20),
      (snap) => {
        if (snap.empty) return;
        const shifts: CashShift[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            initialCashCents: Number(x.initialCashCents) || 0,
            isOpen: Boolean(x.isOpen),
            openedAt: tsToIso(x.openedAt),
            closedAt: x.closedAt ? tsToIso(x.closedAt) : undefined,
            cashSalesCents: Number(x.cashSalesCents) || 0,
            cardSalesCents: Number(x.cardSalesCents) || 0,
            transferSalesCents: Number(x.transferSalesCents) || 0,
            totalSalesCents: Number(x.totalSalesCents) || 0,
            expectedCashCents: Number(x.expectedCashCents) || 0,
            retirosCents: Number(x.retirosCents) || 0,
            depositosCents: Number(x.depositosCents) || 0,
            actualCashCents: typeof x.actualCashCents === 'number' ? x.actualCashCents : undefined,
            differenceCents: typeof x.differenceCents === 'number' ? x.differenceCents : undefined,
            closedByUser: x.closedByUser ? String(x.closedByUser) : undefined,
          };
        });
        shifts.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
        const active = shifts.find((s) => s.isOpen) || shifts[0];
        if (active) callbacks.onShift(active);
      },
      reportErr(OperationType.LIST, 'shifts')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('inventory'),
      (snap) => {
        if (snap.empty) return;
        const map: Record<number, InventoryItem> = {};
        for (const d of snap.docs) {
          const x = d.data();
          const clave = Number(x.clave) || Number(d.id);
          if (!Number.isFinite(clave)) continue;
          map[clave] = {
            clave,
            descripcion: String(x.descripcion || ''),
            unidad: String(x.unidad || 'PZA'),
            categoria: String(x.categoria || 'GENERAL'),
            costo: Number(x.costo) || 0,
            stock: Number(x.stock) || 0,
            minStock: Number(x.minStock) || 0,
          };
        }
        callbacks.onInventory(map);
      },
      reportErr(OperationType.LIST, 'inventory')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('inventory_movements', 'at', 250),
      (snap) => {
        const list: InventoryMovement[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            at: tsToIso(x.at),
            clave: Number(x.clave) || 0,
            descripcion: String(x.descripcion || ''),
            type: x.type || 'entrada',
            qty: Number(x.qty) || 0,
            costUnit: Number(x.costUnit) || 0,
            reason: String(x.reason || ''),
            user: String(x.user || 'Staff'),
          };
        });
        list.sort((a, b) => a.at.localeCompare(b.at));
        callbacks.onMovements(list);
      },
      reportErr(OperationType.LIST, 'inventory_movements')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('staff_users'),
      (snap) => {
        if (snap.empty) return;
        const users: PosUser[] = snap.docs.map((d) => {
          const x = d.data();
          const hasHash = typeof x.pinHash === 'string' && x.pinHash.length > 0;
          const legacyPlain = !hasHash ? String(x.pin || '').trim() : '';
          return {
            id: String(x.id || d.id),
            name: String(x.name || ''),
            role: (x.role as UserRole) || 'mesero',
            avatar: String(x.avatar || 'OP'),
            pin: '****',
            pinHash: hasHash ? String(x.pinHash) : undefined,
            mustChangePin: Boolean(x.mustChangePin) || legacyPlain === '0000',
            area: String(x.area || 'Salón'),
            email: x.email ? String(x.email) : undefined,
          };
        });
        callbacks.onUsers(users);
      },
      reportErr(OperationType.LIST, 'staff_users')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('staff_clock', 'clockIn', 200),
      (snap) => {
        const list: TimeClockRecord[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            userId: String(x.userId || ''),
            userName: String(x.userName || ''),
            role: String(x.role || 'mesero'),
            clockIn: tsToIso(x.clockIn),
            clockOut: x.clockOut ? tsToIso(x.clockOut) : undefined,
            status: x.status === 'finalizado' ? 'finalizado' : 'activo',
          };
        });
        list.sort((a, b) => b.clockIn.localeCompare(a.clockIn));
        callbacks.onClock(list);
      },
      reportErr(OperationType.LIST, 'staff_clock')
    )
  );

  unsubs.push(
    onSnapshot(
      scopedQuery('audit_logs', 'at', 250),
      (snap) => {
        const list: AuditLogEntry[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: String(x.id || d.id),
            at: tsToIso(x.at),
            user: String(x.user || 'Sistema'),
            action: String(x.action || ''),
            detail: String(x.detail || ''),
            reason: x.reason ? String(x.reason) : undefined,
          };
        });
        list.sort((a, b) => a.at.localeCompare(b.at));
        callbacks.onAudit(list);
      },
      reportErr(OperationType.LIST, 'audit_logs')
    )
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function subscribePublicMenuProducts(
  onProducts: (products: SoftProduct[]) => void
): () => void {
  const q = query(collection(db, 'products'), where('saleEnabled', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) return;
      const items: SoftProduct[] = snap.docs.map((d) => {
        const x = d.data();
        return {
          key: String(x.key || d.id),
          name: String(x.name || ''),
          group: String(x.group || '1'),
          category: String(x.category || 'GENERAL'),
          station: x.station === 'barra' ? 'barra' : classifyProductStation(String(x.category || '')),
          sourcePrice: Number(x.sourcePrice) || 0,
          priceCents: Number(x.priceCents) || 0,
          saleEnabled: Boolean(x.saleEnabled),
        };
      });
      onProducts(items);
    },
    (error) => {
      // Fallback gracefully to static restaurantMenu data if offline or not yet seeded
      console.warn('MenuView public sync notice:', error.message);
    }
  );
}

// -----------------------------------------------------------------------------
// Atomic Write Helpers (every call wrapped in try/catch + handleFirestoreError)
// -----------------------------------------------------------------------------

export async function fsSaveProduct(
  prod: SoftProduct,
  user: User,
  auditEntry: AuditLogEntry,
  authorizedEmails: string[],
  workspaceOwnerUid: string
): Promise<void> {
  const prodId = sanitizeFirestoreId(prod.key, 'prod').slice(0, 64);
  const path = `products/${prodId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'products', prodId), {
      key: prodId,
      name: boundStr(prod.name, 120, 'Producto'),
      group: boundStr(prod.group, 40, '1'),
      category: boundStr(prod.category, 80, 'PLATILLOS'),
      station: prod.station || classifyProductStation(prod.category),
      sourcePrice: Math.max(0, Number(prod.sourcePrice) || 0),
      priceCents: Math.max(0, Math.round(Number(prod.priceCents) || 0)),
      saleEnabled: Boolean(prod.saleEnabled),
      ownerUid: sanitizeFirestoreId(workspaceOwnerUid || user.uid, 'usr'),
      updatedAt: serverTimestamp(),
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fsBatchUpdateProducts(
  products: SoftProduct[],
  user: User,
  auditEntry: AuditLogEntry,
  authorizedEmails: string[],
  workspaceOwnerUid: string
): Promise<void> {
  const path = 'products';
  try {
    const chunkSize = 400;
    for (let i = 0; i < products.length; i += chunkSize) {
      const slice = products.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const prod of slice) {
        const prodId = sanitizeFirestoreId(prod.key, 'prod').slice(0, 64);
        batch.set(doc(db, 'products', prodId), {
          key: prodId,
          name: boundStr(prod.name, 120, 'Producto'),
          group: boundStr(prod.group, 40, '1'),
          category: boundStr(prod.category, 80, 'PLATILLOS'),
          station: prod.station || classifyProductStation(prod.category),
          sourcePrice: Math.max(0, Number(prod.sourcePrice) || 0),
          priceCents: Math.max(0, Math.round(Number(prod.priceCents) || 0)),
          saleEnabled: Boolean(prod.saleEnabled),
          ownerUid: sanitizeFirestoreId(workspaceOwnerUid || user.uid, 'usr'),
          updatedAt: serverTimestamp(),
        });
      }
      if (i + chunkSize >= products.length) {
        const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
        batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fsDeleteProduct(
  prodKey: string,
  user: User,
  auditEntry: AuditLogEntry,
  authorizedEmails: string[]
): Promise<void> {
  const prodId = sanitizeFirestoreId(prodKey, 'prod');
  const path = `products/${prodId}`;
  try {
    await deleteDoc(doc(db, 'products', prodId));
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function isOfflineTransactionError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = (error as { code?: string })?.code;
  return code === 'unavailable' || code === 'failed-precondition';
}

export async function fsSaveOrder(
  order: Order,
  isNew: boolean,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<number> {
  if (!isNew) {
    await fsUpdateOrder(order, user, authorizedEmails, auditEntry);
    return order.number;
  }
  const ordId = sanitizeFirestoreId(order.id, 'ord');
  const path = `orders/${ordId}`;
  const cfgRef = doc(db, 'pos_config', 'main');
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');

  try {
    const assignedNumber = await runTransaction(db, async (tx) => {
      const cfgSnap = await tx.get(cfgRef);
      const nextNum = cfgSnap.exists()
        ? Math.max(1, Math.round(Number(cfgSnap.data().nextOrderNumber) || order.number || 1))
        : Math.max(1, Math.round(Number(order.number) || 1));

      const orderWithNum: Order = { ...order, number: nextNum };
      tx.set(
        doc(db, 'orders', ordId),
        buildOrderPayload(orderWithNum, user.uid, authorizedEmails, true)
      );
      if (cfgSnap.exists()) {
        tx.update(cfgRef, {
          nextOrderNumber: nextNum + 1,
          updatedAt: serverTimestamp(),
        });
      }
      const syncedAudit: AuditLogEntry = {
        ...auditEntry,
        detail: auditEntry.detail.replace(`#${order.number}`, `#${nextNum}`),
      };
      tx.set(doc(db, 'audit_logs', audId), buildAuditPayload(syncedAudit, user.uid, authorizedEmails));
      return nextNum;
    });
    return assignedNumber;
  } catch (error) {
    if (isOfflineTransactionError(error)) {
      try {
        const batch = writeBatch(db);
        batch.set(
          doc(db, 'orders', ordId),
          buildOrderPayload(order, user.uid, authorizedEmails, true)
        );
        batch.update(cfgRef, {
          nextOrderNumber: increment(1),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
        await batch.commit();
        return order.number;
      } catch (offlineErr) {
        handleFirestoreError(offlineErr, OperationType.CREATE, path);
        return order.number;
      }
    }
    handleFirestoreError(error, OperationType.CREATE, path);
    return order.number;
  }
}

export async function fsUpdateOrder(
  order: Order,
  user: User,
  authorizedEmails: string[],
  auditEntry?: AuditLogEntry
): Promise<void> {
  const ordId = sanitizeFirestoreId(order.id, 'ord');
  const path = `orders/${ordId}`;
  try {
    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      service: order.service,
      location: boundStr(order.location, 40, '1'),
      table: boundStr(order.table || order.location, 40, '1'),
      waiter: boundStr(order.waiter, 80, 'Staff'),
      note: boundStr(order.note, 300),
      items: sanitizeOrderItemsForFirestore(order.items),
      totalCents: Math.max(0, Math.round(Number(order.totalCents) || 0)),
      discountCents: Math.max(0, Math.round(Number(order.discountCents) || 0)),
      priority: order.priority === 'alta' ? 'alta' : 'normal',
      status: order.status,
      paid: Boolean(order.paid),
      updatedAt: serverTimestamp(),
    };
    if (order.customer) {
      updatePayload.customer = {
        name: boundStr(order.customer.name, 80),
        phone: boundStr(order.customer.phone, 30),
        address: boundStr(order.customer.address, 200),
        reference: boundStr(order.customer.reference, 120),
      };
    }
    batch.update(doc(db, 'orders', ordId), updatePayload);
    if (auditEntry) {
      const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
      batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fsSplitOrder(
  updatedOriginal: Order,
  splitOrder: Order,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<number> {
  const origId = sanitizeFirestoreId(updatedOriginal.id, 'ord');
  const newId = sanitizeFirestoreId(splitOrder.id, 'ord');
  const path = `orders/${origId}`;
  const origRef = doc(db, 'orders', origId);
  const cfgRef = doc(db, 'pos_config', 'main');
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');

  try {
    const assignedNumber = await runTransaction(db, async (tx) => {
      const [origSnap, cfgSnap] = await Promise.all([tx.get(origRef), tx.get(cfgRef)]);
      if (origSnap.exists()) {
        const origData = origSnap.data();
        if (origData.paid === true || origData.status === 'closed') {
          throw new Error('ORDER_CLOSED:La orden original ya fue cerrada o cobrada.');
        }
      }
      const nextNum = cfgSnap.exists()
        ? Math.max(1, Math.round(Number(cfgSnap.data().nextOrderNumber) || splitOrder.number || 1))
        : Math.max(1, Math.round(Number(splitOrder.number) || 1));

      tx.update(origRef, {
        items: sanitizeOrderItemsForFirestore(updatedOriginal.items),
        totalCents: Math.max(0, Math.round(updatedOriginal.totalCents)),
        updatedAt: serverTimestamp(),
      });
      const syncedSplit: Order = { ...splitOrder, number: nextNum };
      tx.set(doc(db, 'orders', newId), buildOrderPayload(syncedSplit, user.uid, authorizedEmails, true));
      if (cfgSnap.exists()) {
        tx.update(cfgRef, {
          nextOrderNumber: nextNum + 1,
          updatedAt: serverTimestamp(),
        });
      }
      const syncedAudit: AuditLogEntry = {
        ...auditEntry,
        detail: auditEntry.detail.replace(`#${splitOrder.number}`, `#${nextNum}`),
      };
      tx.set(doc(db, 'audit_logs', audId), buildAuditPayload(syncedAudit, user.uid, authorizedEmails));
      return nextNum;
    });
    return assignedNumber;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ORDER_CLOSED:')) {
      throw error;
    }
    if (isOfflineTransactionError(error)) {
      try {
        const batch = writeBatch(db);
        batch.update(origRef, {
          items: sanitizeOrderItemsForFirestore(updatedOriginal.items),
          totalCents: Math.max(0, Math.round(updatedOriginal.totalCents)),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'orders', newId), buildOrderPayload(splitOrder, user.uid, authorizedEmails, true));
        batch.update(cfgRef, {
          nextOrderNumber: increment(1),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
        await batch.commit();
        return splitOrder.number;
      } catch (offlineErr) {
        handleFirestoreError(offlineErr, OperationType.WRITE, path);
        return splitOrder.number;
      }
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    return splitOrder.number;
  }
}

export async function fsCancelOrder(
  order: Order,
  isAdmin: boolean,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const ordId = sanitizeFirestoreId(order.id, 'ord');
  const path = `orders/${ordId}`;
  try {
    if (isAdmin) {
      await deleteDoc(doc(db, 'orders', ordId));
      const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
      await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    } else {
      const batch = writeBatch(db);
      batch.update(doc(db, 'orders', ordId), {
        status: 'closed',
        note: boundStr(`[CANCELADA: ${auditEntry.reason || 'Sin motivo'}] ${order.note || ''}`, 300),
        updatedAt: serverTimestamp(),
      });
      const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
      batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fsCloseAndPayOrder(
  updatedOrder: Order,
  sale: Sale,
  updatedShift: CashShift,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<{ assignedReceipt: string }> {
  const ordId = sanitizeFirestoreId(updatedOrder.id, 'ord');
  const saleId = sanitizeFirestoreId(sale.id, 'sale');
  const shiftId = sanitizeFirestoreId(updatedShift.id, 'TURNO');
  const ordRef = doc(db, 'orders', ordId);
  const shiftRef = doc(db, 'shifts', shiftId);
  const cfgRef = doc(db, 'pos_config', 'main');
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');

  const buildSalePayload = (receiptCode: string): Record<string, unknown> => {
    const salePayload: Record<string, unknown> = {
      id: saleId,
      receipt: boundStr(receiptCode, 40, 'BC-00001'),
      orderId: ordId,
      service: sale.service,
      location: boundStr(sale.location, 40, '1'),
      table: boundStr(sale.table || sale.location, 40, '1'),
      waiter: boundStr(sale.waiter, 80, 'Staff'),
      items: sanitizeOrderItemsForFirestore(sale.items),
      subtotalCents: Math.max(0, Math.round(sale.subtotalCents)),
      discountCents: Math.max(0, Math.round(sale.discountCents)),
      totalCents: Math.max(0, Math.round(sale.totalCents)),
      paymentMethod: sale.paymentMethod,
      paidAt: serverTimestamp(),
      ownerUid: sanitizeFirestoreId(user.uid, 'usr'),
      authorizedEmails: ensureEmailList(authorizedEmails),
    };
    if (typeof sale.amountCash === 'number') salePayload.amountCash = Math.round(sale.amountCash);
    if (typeof sale.amountCard === 'number') salePayload.amountCard = Math.round(sale.amountCard);
    if (typeof sale.changeGiven === 'number') salePayload.changeGiven = Math.round(sale.changeGiven);
    return salePayload;
  };

  const totalDelta = Math.max(0, Math.round(sale.totalCents));
  let cashDelta = 0;
  let cardDelta = 0;
  let transferDelta = 0;
  if (sale.paymentMethod === 'efectivo') {
    cashDelta = totalDelta;
  } else if (sale.paymentMethod === 'tarjeta') {
    cardDelta = totalDelta;
  } else if (sale.paymentMethod === 'transferencia') {
    transferDelta = totalDelta;
  } else if (sale.paymentMethod === 'mixto') {
    cashDelta = Math.max(0, Math.round(sale.amountCash || 0));
    cardDelta = Math.max(0, Math.round(sale.amountCard || 0));
  }

  try {
    const assignedReceipt = await runTransaction(db, async (tx) => {
      const [ordSnap, shiftSnap, cfgSnap] = await Promise.all([
        tx.get(ordRef),
        tx.get(shiftRef),
        tx.get(cfgRef),
      ]);

      if (ordSnap.exists()) {
        const ordData = ordSnap.data();
        if (ordData.paid === true || ordData.status === 'closed') {
          throw new Error('ALREADY_PAID:Esta cuenta ya fue cobrada en otro dispositivo.');
        }
      }

      const nextReceiptNum = cfgSnap.exists()
        ? Math.max(1, Math.round(Number(cfgSnap.data().nextReceiptNumber) || 1))
        : 1;
      const receiptCode = cfgSnap.exists()
        ? `BC-${String(nextReceiptNum).padStart(5, '0')}`
        : sale.receipt;

      tx.update(ordRef, {
        items: sanitizeOrderItemsForFirestore(updatedOrder.items),
        status: 'closed',
        paid: true,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'sales', saleId), buildSalePayload(receiptCode));

      if (shiftSnap.exists()) {
        const s = shiftSnap.data();
        tx.update(shiftRef, {
          cashSalesCents: Math.max(0, Math.round((Number(s.cashSalesCents) || 0) + cashDelta)),
          cardSalesCents: Math.max(0, Math.round((Number(s.cardSalesCents) || 0) + cardDelta)),
          transferSalesCents: Math.max(0, Math.round((Number(s.transferSalesCents) || 0) + transferDelta)),
          totalSalesCents: Math.max(0, Math.round((Number(s.totalSalesCents) || 0) + totalDelta)),
          expectedCashCents: Math.max(0, Math.round((Number(s.expectedCashCents) || 0) + cashDelta)),
        });
      }

      if (cfgSnap.exists()) {
        tx.update(cfgRef, {
          nextReceiptNumber: nextReceiptNum + 1,
          updatedAt: serverTimestamp(),
        });
      }

      const syncedAudit: AuditLogEntry = {
        ...auditEntry,
        detail: auditEntry.detail.replace(sale.receipt, receiptCode),
      };
      tx.set(doc(db, 'audit_logs', audId), buildAuditPayload(syncedAudit, user.uid, authorizedEmails));
      return receiptCode;
    });

    return { assignedReceipt };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ALREADY_PAID:')) {
      throw error;
    }
    if (isOfflineTransactionError(error)) {
      try {
        const batch = writeBatch(db);
        batch.update(ordRef, {
          items: sanitizeOrderItemsForFirestore(updatedOrder.items),
          status: 'closed',
          paid: true,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'sales', saleId), buildSalePayload(sale.receipt));
        batch.update(shiftRef, {
          cashSalesCents: Math.max(0, Math.round(updatedShift.cashSalesCents)),
          cardSalesCents: Math.max(0, Math.round(updatedShift.cardSalesCents)),
          transferSalesCents: Math.max(0, Math.round(updatedShift.transferSalesCents)),
          totalSalesCents: Math.max(0, Math.round(updatedShift.totalSalesCents)),
          expectedCashCents: Math.max(0, Math.round(updatedShift.expectedCashCents)),
        });
        batch.update(cfgRef, {
          nextReceiptNumber: increment(1),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
        await batch.commit();
        return { assignedReceipt: sale.receipt };
      } catch (offlineErr) {
        handleFirestoreError(offlineErr, OperationType.WRITE, `sales/${saleId}`);
        return { assignedReceipt: sale.receipt };
      }
    }
    handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
    return { assignedReceipt: sale.receipt };
  }
}

export async function fsCloseShift(
  shift: CashShift,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const shiftId = sanitizeFirestoreId(shift.id, 'TURNO');
  const shiftRef = doc(db, 'shifts', shiftId);
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
  const audRef = doc(db, 'audit_logs', audId);
  try {
    await runTransaction(db, async (tx) => {
      const shiftSnap = await tx.get(shiftRef);
      if (!shiftSnap.exists()) {
        throw new Error('SHIFT_NOT_FOUND:El turno no existe en Firestore.');
      }
      tx.update(shiftRef, {
        isOpen: false,
        closedAt: serverTimestamp(),
        actualCashCents: Math.round(shift.actualCashCents || 0),
        differenceCents: Math.round(shift.differenceCents || 0),
        closedByUser: boundStr(shift.closedByUser, 80, 'Caja'),
      });
      tx.set(audRef, buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `shifts/${shiftId}`);
  }
}

export async function fsOpenNewShift(
  shift: CashShift,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const shiftId = sanitizeFirestoreId(shift.id, 'TURNO');
  const shiftRef = doc(db, 'shifts', shiftId);
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
  const audRef = doc(db, 'audit_logs', audId);
  try {
    await runTransaction(db, async (tx) => {
      tx.set(shiftRef, {
        id: shiftId,
        initialCashCents: Math.max(0, Math.round(shift.initialCashCents)),
        isOpen: true,
        openedAt: serverTimestamp(),
        cashSalesCents: 0,
        cardSalesCents: 0,
        transferSalesCents: 0,
        totalSalesCents: 0,
        expectedCashCents: Math.max(0, Math.round(shift.initialCashCents)),
        retirosCents: 0,
        depositosCents: 0,
        ownerUid: sanitizeFirestoreId(user.uid, 'usr'),
        authorizedEmails: ensureEmailList(authorizedEmails),
      });
      tx.set(audRef, buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `shifts/${shiftId}`);
  }
}

export async function fsCreateInventoryItem(
  item: InventoryItem,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const itemId = sanitizeFirestoreId(String(item.clave), 'inv');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'inventory', itemId), {
      clave: Math.round(Number(item.clave) || 0),
      descripcion: boundStr(item.descripcion, 140, 'Insumo'),
      unidad: boundStr(item.unidad, 20, 'PZA'),
      categoria: boundStr(item.categoria, 80, 'GENERAL'),
      costo: Math.max(0, Number(item.costo) || 0),
      stock: Math.max(0, Number(item.stock) || 0),
      minStock: Math.max(0, Number(item.minStock) || 0),
      ownerUid: sanitizeFirestoreId(user.uid, 'usr'),
      authorizedEmails: ensureEmailList(authorizedEmails),
      updatedAt: serverTimestamp(),
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inventory/${itemId}`);
  }
}

export async function fsDeleteInventoryItem(
  clave: number,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const itemId = sanitizeFirestoreId(String(clave), 'inv');
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'inventory', itemId));
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `inventory/${itemId}`);
  }
}

export async function fsSaveInventoryMovement(
  item: InventoryItem,
  movement: InventoryMovement | null,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry,
  options?: { updateCost?: boolean }
): Promise<void> {
  const itemId = sanitizeFirestoreId(String(item.clave), 'inv');
  try {
    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      stock: Number(item.stock) || 0,
      minStock: Number(item.minStock) || 0,
      updatedAt: serverTimestamp(),
    };
    if (options?.updateCost) {
      updatePayload.costo = Number(item.costo) || 0;
    }
    batch.update(doc(db, 'inventory', itemId), updatePayload);
    if (movement) {
      const movId = sanitizeFirestoreId(movement.id, 'mov');
      batch.set(doc(db, 'inventory_movements', movId), {
        id: movId,
        at: serverTimestamp(),
        clave: Math.round(Number(movement.clave) || 0),
        descripcion: boundStr(movement.descripcion, 140),
        type: movement.type,
        qty: Number(movement.qty) || 0,
        costUnit: Number(movement.costUnit) || 0,
        reason: boundStr(movement.reason, 200),
        user: boundStr(movement.user, 80),
        ownerUid: sanitizeFirestoreId(user.uid, 'usr'),
        authorizedEmails: ensureEmailList(authorizedEmails),
      });
    }
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory/${itemId}`);
  }
}

export async function fsSaveStaffUser(
  staffUser: PosUser,
  user: User,
  authorizedEmails: string[],
  workspaceOwnerUid: string,
  auditEntry: AuditLogEntry
): Promise<void> {
  const staffId = sanitizeFirestoreId(staffUser.id, 'usr');
  try {
    let resolvedPinHash = typeof staffUser.pinHash === 'string' ? staffUser.pinHash.trim() : '';
    let resolvedMustChangePin = Boolean(staffUser.mustChangePin);

    if (isValidFourDigitPin(staffUser.pin)) {
      resolvedPinHash = await hashPin(staffUser.pin);
      resolvedMustChangePin = isWeakDefaultPin(staffUser.pin);
    } else if (!resolvedPinHash) {
      throw new Error('El operador requiere un PIN numérico válido de 4 dígitos.');
    }

    const batch = writeBatch(db);
    const docData: Record<string, unknown> = {
      id: staffId,
      name: boundStr(staffUser.name, 80, 'Personal'),
      role: staffUser.role,
      avatar: boundStr(staffUser.avatar, 4, 'OP'),
      pin: '****',
      pinHash: boundStr(resolvedPinHash, 180),
      mustChangePin: resolvedMustChangePin,
      area: boundStr(staffUser.area, 80, 'Salón'),
      ownerUid: sanitizeFirestoreId(workspaceOwnerUid || user.uid, 'usr'),
      authorizedEmails: ensureEmailList(authorizedEmails, staffUser.email),
    };
    if (staffUser.email && staffUser.email.trim()) {
      docData.email = boundStr(staffUser.email.toLowerCase(), 180);
    }
    batch.set(doc(db, 'staff_users', staffId), docData);
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `staff_users/${staffId}`);
  }
}

export async function fsUpdateStaffPin(
  staffId: string,
  newPin: string,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<string> {
  const cleanId = sanitizeFirestoreId(staffId, 'usr');
  if (!isValidFourDigitPin(newPin) || isWeakDefaultPin(newPin)) {
    throw new Error('Ingresa un nuevo PIN de 4 dígitos distinto a 0000.');
  }
  try {
    const newHash = await hashPin(newPin);
    const batch = writeBatch(db);
    batch.update(doc(db, 'staff_users', cleanId), {
      pin: '****',
      pinHash: boundStr(newHash, 180),
      mustChangePin: false,
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
    return newHash;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff_users/${cleanId}`);
    return '';
  }
}

export async function fsDeleteStaffUser(
  staffId: string,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const cleanId = sanitizeFirestoreId(staffId, 'usr');
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'staff_users', cleanId));
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `staff_users/${cleanId}`);
  }
}

export async function fsUpdatePosPermissionsAndEmails(
  nextPermissions: Record<UserRole, RolePermissions>,
  nextEmails: string[],
  user: User,
  auditEntry: AuditLogEntry
): Promise<void> {
  const emails = ensureEmailList(nextEmails);
  try {
    await updateDoc(doc(db, 'pos_config', 'main'), {
      permissions: nextPermissions,
      authorizedEmails: emails,
      updatedAt: serverTimestamp(),
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, emails));

    // Propagate authorizedEmails to workspace collections so newly authorized operators can list them
    const callerEmail = (user.email || '').toLowerCase();
    const isBootstrap = Boolean(user.emailVerified && callerEmail === BOOTSTRAPPED_ADMIN_EMAIL);
    const colsToSync = ['orders', 'sales', 'shifts', 'inventory', 'staff_users', 'staff_clock'] as const;
    for (const colName of colsToSync) {
      const colQ = isBootstrap
        ? collection(db, colName)
        : query(collection(db, colName), where('authorizedEmails', 'array-contains', callerEmail));
      const snap = await getDocs(colQ);
      if (snap.empty) continue;
      for (let i = 0; i < snap.docs.length; i += 400) {
        const slice = snap.docs.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const d of slice) {
          const updateData: Record<string, unknown> = { authorizedEmails: emails };
          if (colName === 'inventory' || colName === 'orders') {
            updateData.updatedAt = serverTimestamp();
          }
          batch.update(d.ref, updateData);
        }
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'pos_config/main');
  }
}

export async function fsRecordAudit(
  auditEntry: AuditLogEntry,
  user: User,
  authorizedEmails: string[]
): Promise<void> {
  const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
  try {
    await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${audId}`);
  }
}

export async function fsSaveTimeClock(
  record: TimeClockRecord,
  isNew: boolean,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const clkId = sanitizeFirestoreId(record.id, 'clk');
  try {
    const batch = writeBatch(db);
    if (isNew) {
      batch.set(doc(db, 'staff_clock', clkId), {
        id: clkId,
        userId: sanitizeFirestoreId(record.userId, 'usr'),
        userName: boundStr(record.userName, 80, 'Empleado'),
        role: boundStr(record.role, 30, 'mesero'),
        clockIn: serverTimestamp(),
        status: 'activo',
        ownerUid: sanitizeFirestoreId(user.uid, 'usr'),
        authorizedEmails: ensureEmailList(authorizedEmails),
      });
    } else {
      batch.update(doc(db, 'staff_clock', clkId), {
        clockOut: serverTimestamp(),
        status: 'finalizado',
      });
    }
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, `staff_clock/${clkId}`);
  }
}

export async function fsUpdateRestaurantConfig(
  config: RestaurantConfig,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'pos_config', 'main'), {
      name: boundStr(config.name, 80, 'Barbachu'),
      tagline: boundStr(config.tagline, 120, 'Restaurante Bar'),
      address: boundStr(config.address, 200),
      phone: boundStr(config.phone, 40),
      receiptFooter: boundStr(config.receiptFooter, 160, '¡Gracias por su preferencia!'),
      suggestedTipPct: Math.min(30, Math.max(0, Math.round(Number(config.suggestedTipPct) || 0))),
      autoLockMinutes: Math.min(120, Math.max(0, Math.round(Number(config.autoLockMinutes) || 0))),
      updatedAt: serverTimestamp(),
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'pos_config/main');
  }
}

export async function fsRecordCashDrawerMovement(
  updatedShift: CashShift,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const shiftId = sanitizeFirestoreId(updatedShift.id, 'TURNO');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'shifts', shiftId), {
      retirosCents: Math.max(0, Math.round(Number(updatedShift.retirosCents) || 0)),
      depositosCents: Math.max(0, Math.round(Number(updatedShift.depositosCents) || 0)),
      expectedCashCents: Math.max(0, Math.round(Number(updatedShift.expectedCashCents) || 0)),
    });
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `shifts/${shiftId}`);
  }
}

export async function fsMergeOrders(
  targetOrder: Order,
  sourceOrderId: string,
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<void> {
  const targetId = sanitizeFirestoreId(targetOrder.id, 'ord');
  const sourceId = sanitizeFirestoreId(sourceOrderId, 'ord');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'orders', targetId), {
      items: sanitizeOrderItemsForFirestore(targetOrder.items),
      totalCents: Math.max(0, Math.round(targetOrder.totalCents)),
      note: boundStr(targetOrder.note, 300),
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'orders', sourceId));
    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    batch.set(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${targetId}`);
  }
}

export async function fsCleanupDemoData(
  options: {
    removeLegacyUsers: boolean;
    resetInventoryStock: boolean;
    resetShiftAndTestOrders: boolean;
  },
  user: User,
  authorizedEmails: string[],
  auditEntry: AuditLogEntry
): Promise<{ removedStaff: number; resetInventory: number; resetOrdersAndSales: number }> {
  let removedStaff = 0;
  let resetInventory = 0;
  let resetOrdersAndSales = 0;
  const legacyStaffIds = new Set([
    'usr-caja',
    'usr-mesero1',
    'usr-mesero2',
    'usr-mesero3',
    'usr-cocina',
    'usr-barra',
  ]);
  const legacyClockIds = new Set(['clk-1']);

  try {
    if (options.removeLegacyUsers) {
      const staffSnap = await getDocs(collection(db, 'staff_users'));
      const clockSnap = await getDocs(collection(db, 'staff_clock'));
      const deleteRefs = [];
      for (const d of staffSnap.docs) {
        if (legacyStaffIds.has(d.id)) {
          deleteRefs.push(d.ref);
          removedStaff++;
        }
      }
      for (const d of clockSnap.docs) {
        const data = d.data();
        if (legacyClockIds.has(d.id) || legacyStaffIds.has(String(data.userId || ''))) {
          deleteRefs.push(d.ref);
        }
      }
      for (let i = 0; i < deleteRefs.length; i += 400) {
        const batch = writeBatch(db);
        for (const ref of deleteRefs.slice(i, i + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }
    }

    if (options.resetInventoryStock) {
      const invSnap = await getDocs(collection(db, 'inventory'));
      const docs = invSnap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of docs.slice(i, i + 400)) {
          batch.update(d.ref, { stock: 0, minStock: 0, updatedAt: serverTimestamp() });
          resetInventory++;
        }
        await batch.commit();
      }
    }

    if (options.resetShiftAndTestOrders) {
      const cols = ['orders', 'sales', 'shifts'] as const;
      for (const colName of cols) {
        const snap = await getDocs(collection(db, colName));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const d of snap.docs.slice(i, i + 400)) {
            batch.delete(d.ref);
            resetOrdersAndSales++;
          }
          await batch.commit();
        }
      }

      const freshShift = createInitialShift(0);
      const shiftId = sanitizeFirestoreId(freshShift.id, 'TURNO');
      const batch = writeBatch(db);
      batch.set(doc(db, 'shifts', shiftId), {
        id: shiftId,
        initialCashCents: 0,
        isOpen: true,
        openedAt: serverTimestamp(),
        cashSalesCents: 0,
        cardSalesCents: 0,
        transferSalesCents: 0,
        totalSalesCents: 0,
        expectedCashCents: 0,
        retirosCents: 0,
        depositosCents: 0,
        ownerUid: sanitizeFirestoreId(user.uid, 'adm'),
        authorizedEmails: ensureEmailList(authorizedEmails),
      });
      batch.update(doc(db, 'pos_config', 'main'), {
        nextOrderNumber: 1,
        nextReceiptNumber: 1,
        phone: '',
        whatsappNumber: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }

    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
    return { removedStaff, resetInventory, resetOrdersAndSales };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workspace/cleanup');
    return { removedStaff, resetInventory, resetOrdersAndSales };
  }
}

function mapStaffDocToPosUser(id: string, data: DocumentData): PosUser {
  const legacyPlain = typeof data.pin === 'string' && isValidFourDigitPin(data.pin) ? data.pin : undefined;
  return {
    id: String(data.id || id),
    name: String(data.name || 'Operador'),
    role: (data.role as UserRole) || 'mesero',
    avatar: String(data.avatar || 'OP'),
    pin: '****',
    pinHash: typeof data.pinHash === 'string' && data.pinHash ? data.pinHash : undefined,
    mustChangePin: Boolean(data.mustChangePin || legacyPlain === '0000'),
    area: String(data.area || 'General'),
    email: typeof data.email === 'string' && data.email ? data.email : undefined,
  };
}

export async function fsFetchStaffUsersSnapshot(user: User, _isAdmin: boolean): Promise<PosUser[]> {
  try {
    const callerEmail = (user.email || '').toLowerCase();
    const isBootstrap = Boolean(user.emailVerified && callerEmail === BOOTSTRAPPED_ADMIN_EMAIL);
    const staffQ = isBootstrap
      ? collection(db, 'staff_users')
      : query(collection(db, 'staff_users'), where('authorizedEmails', 'array-contains', callerEmail));
    const snap = await getDocs(staffQ);
    return snap.docs.map((d) => mapStaffDocToPosUser(d.id, d.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `staff_users?uid=${user.uid}`);
    return [];
  }
}

export async function fsVerifyEmployeePinFromFirestore(
  staffId: string,
  enteredPin: string,
  user: User,
  authorizedEmails: string[]
): Promise<{ ok: boolean; user?: PosUser; error?: string }> {
  const cleanPin = String(enteredPin || '').trim();
  if (!isValidFourDigitPin(cleanPin)) {
    return { ok: false, error: 'El PIN debe tener 4 dígitos numéricos.' };
  }

  const cleanStaffId = sanitizeFirestoreId(staffId, 'usr');
  const staffRef = doc(db, 'staff_users', cleanStaffId);

  try {
    let snap;
    try {
      snap = await getDocFromServer(staffRef);
    } catch {
      snap = await getDoc(staffRef);
    }

    if (!snap.exists()) {
      return { ok: false, error: 'Empleado no encontrado en Firestore.' };
    }

    const data = snap.data();
    const valid = await verifyPinSecret(
      cleanPin,
      typeof data.pinHash === 'string' ? data.pinHash : undefined,
      typeof data.pin === 'string' ? data.pin : undefined
    );
    if (!valid) {
      return { ok: false, error: 'PIN incorrecto. Verifica tus 4 dígitos.' };
    }

    const verifiedUser: PosUser = {
      ...mapStaffDocToPosUser(snap.id, data),
      mustChangePin: Boolean(data.mustChangePin || isWeakDefaultPin(cleanPin)),
    };

    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      user: verifiedUser.name,
      action: 'Acceso de empleado (PIN)',
      detail: `${verifiedUser.name} (${verifiedUser.role.toUpperCase()} · ${verifiedUser.area}) autenticó sesión en terminal`,
    };

    const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
    await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));

    return { ok: true, user: verifiedUser };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `staff_users/${cleanStaffId}`);
    return { ok: false, error: 'No se pudo verificar el PIN con Firestore.' };
  }
}

export async function fsVerifyAnyAdminPinFromFirestore(
  enteredPin: string,
  user: User,
  authorizedEmails: string[]
): Promise<{ ok: boolean; user?: PosUser; error?: string }> {
  const cleanPin = String(enteredPin || '').trim();
  if (!isValidFourDigitPin(cleanPin)) {
    return { ok: false, error: 'El PIN debe tener 4 dígitos numéricos.' };
  }

  try {
    const callerEmail = (user.email || '').toLowerCase();
    const isBootstrap = Boolean(user.emailVerified && callerEmail === BOOTSTRAPPED_ADMIN_EMAIL);
    const q = isBootstrap
      ? query(collection(db, 'staff_users'), where('role', '==', 'admin'))
      : query(
          collection(db, 'staff_users'),
          where('role', '==', 'admin'),
          where('authorizedEmails', 'array-contains', callerEmail)
        );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const valid = await verifyPinSecret(
        cleanPin,
        typeof data.pinHash === 'string' ? data.pinHash : undefined,
        typeof data.pin === 'string' ? data.pin : undefined
      );
      if (valid) {
        const verifiedAdmin: PosUser = {
          ...mapStaffDocToPosUser(d.id, data),
          role: 'admin',
          mustChangePin: Boolean(data.mustChangePin || isWeakDefaultPin(cleanPin)),
        };
        const auditEntry: AuditLogEntry = {
          id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          user: verifiedAdmin.name,
          action: 'Autorización de Administrador (PIN)',
          detail: `${verifiedAdmin.name} desbloqueó módulo administrativo`,
        };
        const audId = sanitizeFirestoreId(auditEntry.id, 'aud');
        await setDoc(doc(db, 'audit_logs', audId), buildAuditPayload(auditEntry, user.uid, authorizedEmails));
        return { ok: true, user: verifiedAdmin };
      }
    }
    return { ok: false, error: 'PIN de administrador incorrecto.' };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'staff_users?role=admin');
    return { ok: false, error: 'No se pudo validar el PIN de administrador.' };
  }
}

export async function upsertTerminalHeartbeat(
  params: {
    deviceId: string;
    station: DeviceStation;
    stationName: string;
    staffName: string;
    staffRole: UserRole;
    platform: string;
    online: boolean;
  },
  user: User,
  authorizedEmails: string[]
): Promise<void> {
  const cleanId = sanitizeFirestoreId(params.deviceId, 'term').slice(0, 64);
  const terminalRef = doc(db, 'pos_terminals', cleanId);
  try {
    const existingSnap = await getDoc(terminalRef);
    const ownerUid = existingSnap.exists()
      ? String(existingSnap.data().ownerUid || user.uid)
      : sanitizeFirestoreId(user.uid, 'usr');

    await setDoc(terminalRef, {
      deviceId: cleanId,
      station: params.station,
      stationName: boundStr(params.stationName, 80, 'Terminal POS'),
      staffName: boundStr(params.staffName, 80, 'En espera de PIN'),
      staffRole: ['admin', 'caja', 'mesero', 'cocina'].includes(params.staffRole)
        ? params.staffRole
        : 'mesero',
      operatorEmail: boundStr((user.email || '').toLowerCase(), 180, ''),
      online: Boolean(params.online),
      platform: boundStr(params.platform, 60, 'Web Terminal'),
      ownerUid,
      authorizedEmails: ensureEmailList(authorizedEmails, user.email),
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Heartbeats should degrade gracefully offline without crashing UI
  }
}

export function subscribeTerminalSessions(
  user: User,
  _isAdmin: boolean,
  onTerminals: (terminals: TerminalSession[]) => void
): () => void {
  const email = (user.email || '').toLowerCase();
  const isBootstrapAdmin = Boolean(user.emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);
  const colRef = collection(db, 'pos_terminals');
  const q = isBootstrapAdmin
    ? query(colRef, orderBy('lastSeenAt', 'desc'), limit(30))
    : query(colRef, where('authorizedEmails', 'array-contains', email), limit(30));

  return onSnapshot(
    q,
    (snap) => {
      const list: TerminalSession[] = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            deviceId: String(x.deviceId || d.id),
            station: (x.station as DeviceStation) || 'todos',
            stationName: String(x.stationName || 'Terminal POS'),
            staffName: String(x.staffName || 'Operador'),
            staffRole: (x.staffRole as UserRole) || 'mesero',
            operatorEmail: String(x.operatorEmail || ''),
            online: Boolean(x.online),
            platform: String(x.platform || 'Web'),
            lastSeenAt: tsToIso(x.lastSeenAt),
            updatedAt: tsToIso(x.updatedAt),
          };
        })
        .sort((a, b) => Date.parse(b.lastSeenAt || '') - Date.parse(a.lastSeenAt || ''));
      onTerminals(list);
    },
    () => {
      // Non-fatal fallback if index or rules still warming
    }
  );
}

export async function deleteTerminalSession(deviceId: string): Promise<void> {
  const cleanId = sanitizeFirestoreId(deviceId, 'term').slice(0, 64);
  try {
    await deleteDoc(doc(db, 'pos_terminals', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `pos_terminals/${cleanId}`);
  }
}

export function subscribeFirestoreSyncPulse(onSynced: (syncedAtMs: number) => void): () => void {
  return onSnapshotsInSync(db, () => {
    onSynced(Date.now());
  });
}
