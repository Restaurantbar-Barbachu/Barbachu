import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  Ban,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChefHat,
  Clock,
  Cloud,
  DollarSign,
  FileText,
  Flame,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Merge,
  Minus,
  Package,
  Plus,
  Printer,
  Receipt,
  Scissors,
  Search,
  Server,
  Settings,
  Sparkles,
  Tag,
  UserCheck,
  UtensilsCrossed,
  WifiOff,
  X,
} from 'lucide-react';
import {
  FullPosState,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  PaymentMethod,
  Priority,
  Sale,
  ServiceType,
  SoftProduct,
  InventoryItem,
  AuditLogEntry,
  ItemStatus,
  DeviceStation,
  TerminalSession,
} from '../types';
const AdminDashboard = lazy(() => import('./AdminDashboard').then(m => ({ default: m.AdminDashboard })));
import { BarbachuLogo } from './BarbachuLogo';
import { CategorySidebar } from './CategorySidebar';
import {
  defaultViewForRole,
  describeRoleCapabilities,
  EmployeePinAuthPanel,
  PosViewRoute,
  ROLE_LABELS,
} from './EmployeePinAuthPanel';
import { IosPinPadModal } from './IosPinPadModal';
import { DeviceSyncModal } from './DeviceSyncModal';
import { PWAInstallButton } from './PwaControls';
import { useOnlineStatus } from '../hooks/usePwaStatus';
const PosAnalyticsDashboard = lazy(() => import('./PosAnalyticsDashboard').then(m => ({ default: m.PosAnalyticsDashboard })));
const PosDashboardPanel = lazy(() => import('./PosDashboardPanel').then(m => ({ default: m.PosDashboardPanel })));
const InventoryManagementView = lazy(() => import('./InventoryManagementView').then(m => ({ default: m.InventoryManagementView })));
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  signInWithGoogle,
  signOutFirebase,
  testConnection,
} from '../lib/firebase';
import {
  bootstrapWorkspace,
  deleteTerminalSession,
  ensureEmailList,
  fsCancelOrder,
  fsCloseAndPayOrder,
  fsCloseShift,
  fsMergeOrders,
  fsOpenNewShift,
  fsRecordAudit,
  fsRecordCashDrawerMovement,
  fsSaveInventoryMovement,
  fsSaveOrder,
  fsSplitOrder,
  fsUpdateOrder,
  fsUpdateStaffPin,
  fsVerifyAnyAdminPinFromFirestore,
  subscribeFirestoreSyncPulse,
  subscribePosWorkspace,
  subscribeTerminalSessions,
  upsertTerminalHeartbeat,
} from '../lib/firestoreSync';
import {
  canActOnItem,
  canTransitionItemStatus,
  classifyProductStation,
  closeAndPayOrder,
  computeOrderStatusFromItems,
  createOrUpdateOrder,
  hasUnservedItems,
  lineTotalCents,
  locationLabel,
  locationOptions,
  modifiersTotalCents,
  nextItemStatus,
  printPreCheckText,
  printReceiptText,
  serviceName,
  subtotalCents,
  totalCents,
  uid,
  unitTotalCents,
} from '../core';
import {
  createInitialShift,
  DEFAULT_PERMISSIONS,
  DEVICE_STATION_NAMES,
  detectDevicePlatformLabel,
  formatMoney,
  getOrCreateDeviceId,
  loadPosState,
  savePosState,
} from '../storage';
import { toLocalDateKey } from '../utils/dashboardMetrics';
import { downloadCsvFile } from '../utils/csv';
import { isValidFourDigitPin, isWeakDefaultPin } from '../utils/pinSecurity';
import {
  buildCatalogHierarchy,
  filterCatalogProductsByHierarchy,
  MainCatalogCategory,
} from '../utils/catalogHierarchy';

const QUICK_ITEM_MODIFIERS = [
  'Sin cebolla',
  'Sin picante',
  'Salsa aparte',
  'Bien cocido',
  'Con hielo',
  'Sin hielo',
  'Extra limón',
  'Para llevar',
];

function formatElapsedTime(createdAt: string, nowMs: number): string {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start)) return '0m';
  const mins = Math.max(0, Math.floor((nowMs - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
}

const DEFAULT_MODIFIER_OPTIONS: ModifierOption[] = [
  { id: 'sin_cebolla', name: 'Sin cebolla', priceCents: 0 },
  { id: 'sin_tomate', name: 'Sin tomate', priceCents: 0 },
  { id: 'sin_chile', name: 'Sin chile', priceCents: 0 },
  { id: 'sin_mayonesa', name: 'Sin mayonesa', priceCents: 0 },
  { id: 'salsa_aparte', name: 'Salsa aparte', priceCents: 0 },
  { id: 'para_llevar', name: 'Para llevar', priceCents: 0 },
  { id: 'extra_queso', name: 'Extra queso', priceCents: 1500 },
  { id: 'tocino_extra', name: 'Tocino extra', priceCents: 2000 },
  { id: 'aguacate_extra', name: 'Aguacate extra', priceCents: 2500 },
  { id: 'carne_extra', name: 'Carne extra', priceCents: 3500 },
  { id: 'termino_medio', name: 'Término: Medio', priceCents: 0 },
  { id: 'termino_3_4', name: 'Término: Tres cuartos', priceCents: 0 },
  { id: 'termino_bien', name: 'Término: Bien cocido', priceCents: 0 },
];

export function useModifiers(initialModifiers: ModifierOption[] = DEFAULT_MODIFIER_OPTIONS) {
  const [modifiers, setModifiers] = useState<ModifierOption[]>(initialModifiers);

  const addCustomModifier = (rawName: string, pricePesos: number): { id: string; error?: string } => {
    const cleanName = rawName.trim().slice(0, 50);
    if (!cleanName) {
      return { id: '', error: 'Escribe el nombre del modificador o extra.' };
    }
    const safePesos = Number.isFinite(pricePesos) ? Math.max(0, pricePesos) : 0;
    const priceCents = Math.round(safePesos * 100);

    const existing = modifiers.find((m) => m.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      if (existing.priceCents !== priceCents) {
        setModifiers((prev) =>
          prev.map((m) => (m.id === existing.id ? { ...m, priceCents } : m))
        );
      }
      return { id: existing.id };
    }

    const slug = cleanName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const id = `custom_${slug || 'extra'}_${Date.now().toString(36)}`;
    setModifiers((prev) => [...prev, { id, name: cleanName, priceCents }]);
    return { id };
  };

  const calculateModifierTotal = (selected: Record<string, boolean>): number => {
    return modifiers
      .filter((m) => selected[m.id])
      .reduce((sum, m) => sum + m.priceCents, 0);
  };

  const getModifiersArray = (selected: Record<string, boolean>): OrderItemModifier[] => {
    return modifiers
      .filter((m) => selected[m.id])
      .map((m) => ({ name: m.name, priceCents: m.priceCents }));
  };

  const buildSelectionFromItem = (item: OrderItem): Record<string, boolean> => {
    const itemMods = item.modifiers || item.modificadores || [];
    const selectedMap: Record<string, boolean> = {};
    const missingMods: ModifierOption[] = [];

    for (const mod of itemMods) {
      const existing = modifiers.find((m) => m.name.toLowerCase() === mod.name.toLowerCase());
      if (existing) {
        selectedMap[existing.id] = true;
      } else {
        const customId = `custom_loaded_${mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${missingMods.length}`;
        missingMods.push({ id: customId, name: mod.name, priceCents: mod.priceCents || 0 });
        selectedMap[customId] = true;
      }
    }

    if (missingMods.length > 0) {
      setModifiers((prev) => [...prev, ...missingMods]);
    }
    return selectedMap;
  };

  return {
    modifiers,
    addCustomModifier,
    calculateModifierTotal,
    getModifiersArray,
    buildSelectionFromItem,
  };
}

interface PosViewProps {
  onSwitchToMenu?: () => void;
}

export const PosView: React.FC<PosViewProps> = ({ onSwitchToMenu }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceAuthorized, setWorkspaceAuthorized] = useState<boolean>(true);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState<boolean>(false);
  const [workspaceOwnerUid, setWorkspaceOwnerUid] = useState<string>('');
  const [cloudBooting, setCloudBooting] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  const isOnline = useOnlineStatus();
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const platformLabel = useMemo(() => detectDevicePlatformLabel(), []);
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  const [state, setState] = useState<FullPosState>(() => loadPosState());
  const [view, setView] = useState<PosViewRoute>('dashboard');

  // POS Order Draft state
  const [currentService, setCurrentService] = useState<ServiceType>('mesa');
  const [currentTable, setCurrentTable] = useState<string>('1');
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [waiter, setWaiter] = useState<string>(() => state.activeUser?.name || 'Operador');
  const [generalNote, setGeneralNote] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deliveryData, setDeliveryData] = useState({ name: '', phone: '', address: '', reference: '' });
  const [modifierModalProduct, setModifierModalProduct] = useState<SoftProduct | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, boolean>>({});
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);
  const [editingItemModifiers, setEditingItemModifiers] = useState<Record<string, boolean>>({});
  const [customModName, setCustomModName] = useState<string>('');
  const [customModPrice, setCustomModPrice] = useState<string>('0');
  const [customModError, setCustomModError] = useState<string>('');

  const {
    modifiers,
    addCustomModifier,
    calculateModifierTotal,
    getModifiersArray,
    buildSelectionFromItem,
  } = useModifiers();

  const handleOpenNewProductModifiers = (prod: SoftProduct) => {
    if (!activePerms?.canTakeOrders && !isAdminRole) {
      notify(`Tu rol (${activeRole.toUpperCase()}) no tiene permiso para tomar comandas.`);
      return;
    }
    if (!prod.saleEnabled) {
      notify(`El producto "${prod.name}" tiene precio pendiente.`);
      return;
    }
    setSelectedModifiers({});
    setCustomModName('');
    setCustomModPrice('0');
    setCustomModError('');
    setModifierModalProduct(prod);
  };

  const handleOpenCartItemModifiers = (item: OrderItem, idx: number) => {
    setEditingCartItemIndex(idx);
    setCustomModName('');
    setCustomModPrice('0');
    setCustomModError('');
    setEditingItemModifiers(buildSelectionFromItem(item));
  };

  // Hierarchical Filtering & Search (Categoría -> Subcategoría -> Grupo)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMainCategory, setSelectedMainCategory] = useState<MainCatalogCategory>('Alimentos');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('Todas');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('Todos');
  const [posStationFilter, setPosStationFilter] = useState<'todas' | 'cocina' | 'barra'>('todas');
  const [kitchenStation, setKitchenStation] = useState<'todas' | 'cocina' | 'barra'>('todas');

  // Mapa de Mesas iOS Filters & Quick-Action Sheet
  const [tableZoneFilter, setTableZoneFilter] = useState<'todas' | ServiceType>('todas');
  const [tableStatusFilter, setTableStatusFilter] = useState<'todas' | 'free' | 'busy' | 'ready'>('todas');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableSheetLoc, setTableSheetLoc] = useState<{
    service: ServiceType;
    loc: string;
    label: string;
    section: string;
  } | null>(null);

  // Live Clock for Table Stay Timers
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Cashier State
  const [payOrderId, setPayOrderId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [mixedCashInput, setMixedCashInput] = useState<string>('');
  const [physicalCashCount, setPhysicalCashCount] = useState<string>('');
  const [openingCashInput, setOpeningCashInput] = useState<string>('0');
  const [confirmUnservedPay, setConfirmUnservedPay] = useState<boolean>(false);

  // Cash Drawer Movement Modal
  const [drawerModalType, setDrawerModalType] = useState<'deposito' | 'retiro' | null>(null);
  const [drawerAmount, setDrawerAmount] = useState<string>('');
  const [drawerReason, setDrawerReason] = useState<string>('');

  // Modals & Receipts
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);
  const [activePreCheckOrder, setActivePreCheckOrder] = useState<Order | null>(null);
  const [modalReason, setModalReason] = useState<{ title: string; onConfirm: (reason: string) => void } | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [promptModal, setPromptModal] = useState<{ title: string; label: string; defaultValue?: string; onConfirm: (val: string) => void } | null>(null);
  const [promptValue, setPromptValue] = useState<string>('');
  const [itemNoteModal, setItemNoteModal] = useState<{ targetId: string; name: string } | null>(null);
  const [itemNoteValue, setItemNoteValue] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Transfer / Merge Table Modal
  const [moveTableModalOpen, setMoveTableModalOpen] = useState<boolean>(false);
  const [moveTargetService, setMoveTargetService] = useState<ServiceType>('mesa');
  const [moveTargetLocation, setMoveTargetLocation] = useState<string>('1');

  // Inventory Modal
  const [inventoryModal, setInventoryModal] = useState<{ clave: number; descripcion: string; type: 'entrada' | 'ajuste' | 'merma' | 'minStock' } | null>(null);
  const [invQty, setInvQty] = useState<string>('');
  const [invCost, setInvCost] = useState<string>('');
  const [invReason, setInvReason] = useState<string>('');

  // Employee PIN Auth & Session Lock State (verified against Firestore staff_users)
  const [employeeAuthenticated, setEmployeeAuthenticated] = useState<boolean>(false);
  const [pinPadMode, setPinPadMode] = useState<'switch' | 'admin' | 'unlock' | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(false);

  // Forced PIN change modal state for default 0000 admin PIN
  const [forcePinNew, setForcePinNew] = useState<string>('');
  const [forcePinConfirm, setForcePinConfirm] = useState<string>('');
  const [forcePinError, setForcePinError] = useState<string | null>(null);
  const [savingForcedPin, setSavingForcedPin] = useState<boolean>(false);

  // New Feature & Navigation States
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState<boolean>(false);

  // Keep waiter synced when active user switches (unless editing an open loaded order)
  useEffect(() => {
    if (!currentOrderId && state.activeUser?.name) {
      setWaiter(state.activeUser.name);
    }
  }, [state.activeUser?.id, state.activeUser?.name, currentOrderId]);

  // 60-second clock tick for table stay timers and topbar time
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  // Configurable Auto-Lock Timer
  useEffect(() => {
    const lockMins = Number(state.config.autoLockMinutes || state.deviceConfig?.autoLockMinutes || 0);
    if (!firebaseUser || lockMins <= 0 || isSessionLocked) return;

    let timeoutId: number;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setIsSessionLocked(true);
        setPinPadMode('unlock');
      }, lockMins * 60 * 1000);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [firebaseUser, state.config.autoLockMinutes, state.deviceConfig?.autoLockMinutes, isSessionLocked, state.activeUser]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setAuthError(null);
      if (!user) {
        setIsFirebaseAdmin(false);
        setWorkspaceAuthorized(true);
        setEmployeeAuthenticated(false);
        setIsSessionLocked(false);
        setPinPadMode(null);
      }
    });
    return () => unsub();
  }, []);

  // Preconfigure terminal station from QR/pairing URL query (?station=cocina|barra|comandero|caja|todos)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rawStation = params.get('station') as DeviceStation | null;
    if (!rawStation || !(rawStation in DEVICE_STATION_NAMES)) return;

    const nextStationName = DEVICE_STATION_NAMES[rawStation];
    setState((prev) => ({
      ...prev,
      deviceConfig: {
        station: rawStation,
        stationName: nextStationName,
        autoLockMinutes: prev.deviceConfig?.autoLockMinutes || 0,
      },
    }));

    if (rawStation === 'cocina') {
      setKitchenStation('cocina');
      setPosStationFilter('cocina');
      setView('kitchen');
    } else if (rawStation === 'barra') {
      setKitchenStation('barra');
      setPosStationFilter('barra');
      setView('kitchen');
    } else if (rawStation === 'comandero') {
      setView('pos');
    } else if (rawStation === 'caja') {
      setView('cash');
    }
  }, []);

  // Bootstrap & subscribe to Firestore workspace when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let active = true;
    let unsubWorkspace: (() => void) | null = null;
    let unsubTerminals: (() => void) | null = null;
    let unsubSyncPulse: (() => void) | null = null;

    setCloudBooting(true);
    void testConnection();
    bootstrapWorkspace(firebaseUser)
      .then((res) => {
        if (!active) return;
        setIsFirebaseAdmin(res.isAdmin);
        setWorkspaceAuthorized(res.authorized);
        setWorkspaceOwnerUid(res.workspaceOwnerUid || firebaseUser.uid);

        if (!res.authorized) {
          setCloudBooting(false);
          return;
        }

        if (res.seeded) {
          setToastMessage('Base de datos Cloud Firestore inicializada con catálogo e inventario.');
        }

        unsubWorkspace = subscribePosWorkspace(firebaseUser, res.isAdmin, {
          onConfig: ({ config, nextOrderNumber, nextReceiptNumber, permissions, authorizedEmails, ownerUid }) => {
            setWorkspaceOwnerUid(ownerUid);
            setState((prev) => ({
              ...prev,
              config,
              nextOrderNumber,
              nextReceiptNumber,
              permissions,
              authorizedEmails,
            }));
          },
          onProducts: (products) => setState((prev) => ({ ...prev, products })),
          onOrders: (orders) => setState((prev) => ({ ...prev, orders })),
          onSales: (sales) => setState((prev) => ({ ...prev, sales })),
          onShift: (shift) => setState((prev) => ({ ...prev, shift })),
          onInventory: (inventory) => setState((prev) => ({ ...prev, inventory })),
          onMovements: (inventoryMovements) => setState((prev) => ({ ...prev, inventoryMovements })),
          onUsers: (users) =>
            setState((prev) => {
              const matchedEmailUser = firebaseUser.email
                ? users.find((u) => u.email?.toLowerCase() === firebaseUser.email?.toLowerCase())
                : undefined;
              const currentStillExists = users.find((u) => u.id === prev.activeUser.id);
              const nextActive =
                currentStillExists ||
                matchedEmailUser ||
                (res.isAdmin ? users.find((u) => u.role === 'admin') : users[0]) ||
                prev.activeUser;
              return { ...prev, users, activeUser: nextActive };
            }),
          onClock: (staffClock) => setState((prev) => ({ ...prev, staffClock })),
          onAudit: (audit) => setState((prev) => ({ ...prev, audit })),
          onError: (err) => setSyncError(err),
        });

        unsubTerminals = subscribeTerminalSessions(firebaseUser, res.isAdmin, setTerminals);
        unsubSyncPulse = subscribeFirestoreSyncPulse(setLastSyncMs);
        setCloudBooting(false);
      })
      .catch((err) => {
        if (!active) return;
        setCloudBooting(false);
        setSyncError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      active = false;
      if (unsubWorkspace) unsubWorkspace();
      if (unsubTerminals) unsubTerminals();
      if (unsubSyncPulse) unsubSyncPulse();
    };
  }, [authReady, firebaseUser]);

  // Propagate fatal Firestore permission errors to ErrorBoundary cleanly
  if (syncError) {
    throw syncError;
  }

  // Keep lightweight offline cache of state
  useEffect(() => {
    savePosState(state);
  }, [state]);

  const authorizedEmails = useMemo(
    () => ensureEmailList(state.authorizedEmails, firebaseUser?.email),
    [state.authorizedEmails, firebaseUser?.email]
  );

  // Live terminal presence heartbeat (every 45s while connected)
  useEffect(() => {
    if (!authReady || !firebaseUser || !workspaceAuthorized) return;

    const pushHeartbeat = () => {
      void upsertTerminalHeartbeat(
        {
          deviceId,
          station: state.deviceConfig?.station || 'todos',
          stationName: state.deviceConfig?.stationName || DEVICE_STATION_NAMES.todos,
          staffName: employeeAuthenticated ? state.activeUser.name : 'En espera de PIN',
          staffRole: employeeAuthenticated ? state.activeUser.role : 'mesero',
          platform: platformLabel,
          online: isOnline,
        },
        firebaseUser,
        authorizedEmails
      );
    };

    pushHeartbeat();
    if (!isOnline) return;
    const intervalId = window.setInterval(pushHeartbeat, 45000);
    return () => window.clearInterval(intervalId);
  }, [
    authReady,
    firebaseUser,
    workspaceAuthorized,
    isOnline,
    deviceId,
    platformLabel,
    state.deviceConfig?.station,
    state.deviceConfig?.stationName,
    employeeAuthenticated,
    state.activeUser.name,
    state.activeUser.role,
    authorizedEmails,
  ]);

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Role-specific capabilities computed from live permissions matrix
  const activeRole = state.activeUser?.role || 'mesero';
  const activePerms = useMemo(() => {
    return state.permissions?.[activeRole] || DEFAULT_PERMISSIONS[activeRole] || DEFAULT_PERMISSIONS.mesero;
  }, [state.permissions, activeRole]);

  const isAdminRole = activeRole === 'admin';
  const canViewPos = isAdminRole || activePerms.canTakeOrders;
  const canViewTables = isAdminRole || activePerms.canTakeOrders || activePerms.canCollectPayment;
  const canViewKitchen = isAdminRole || activePerms.canAccessKds || activeRole === 'mesero';
  const canViewCash = isAdminRole || activePerms.canCollectPayment || activePerms.canCashShiftCut;
  const canViewInventory = isAdminRole || activePerms.canEditCatalog || activePerms.canAccessKds || activePerms.canCollectPayment;
  const canViewReports = isAdminRole || activePerms.canViewReports;
  const canViewAdmin = isAdminRole;

  const canApplyDiscount = isAdminRole || activePerms.canApplyDiscount;
  const canCancelOrders = isAdminRole || activePerms.canCancelOrders;
  const canCollectPayment = isAdminRole || activePerms.canCollectPayment;
  const canCashCut = isAdminRole || activePerms.canCashShiftCut;

  // Redirect if current active employee role does not allow active view
  useEffect(() => {
    const allowedMap: Record<PosViewRoute, boolean> = {
      dashboard: true,
      pos: canViewPos,
      tables: canViewTables,
      kitchen: canViewKitchen,
      cash: canViewCash,
      inventory: canViewInventory,
      reports: canViewReports,
      admin: canViewAdmin,
    };
    if (employeeAuthenticated && !allowedMap[view]) {
      setView(defaultViewForRole(activeRole, activePerms));
    }
  }, [
    employeeAuthenticated,
    view,
    activeRole,
    activePerms,
    canViewPos,
    canViewTables,
    canViewKitchen,
    canViewCash,
    canViewInventory,
    canViewReports,
    canViewAdmin,
  ]);

  // Detect external closure/payment of currently loaded order on another terminal
  useEffect(() => {
    if (!currentOrderId) return;
    const found = state.orders.find((o) => o.id === currentOrderId);
    if (!found || found.status === 'closed') {
      setCurrentOrderId(null);
      setCart([]);
      setGeneralNote('');
      notify('La cuenta cargada fue cobrada o cerrada en otra terminal.');
    }
  }, [state.orders, currentOrderId]);

  const catalogModifiers = useMemo(
    () => state.products.filter((p) => p.category === 'MODIFICADORES'),
    [state.products]
  );

  // Saleable products (excluding standalone MODIFICADORES catalog rows)
  const saleableCatalogProducts = useMemo(() => {
    return state.products.filter((p) => {
      if (!p.category || p.category === 'MODIFICADORES') return false;
      const station = p.station || classifyProductStation(p.category);
      return posStationFilter === 'todas' || station === posStationFilter;
    });
  }, [state.products, posStationFilter]);

  // Hierarchical Tree: Categoría -> Subcategoría -> Grupo
  const catalogTree = useMemo(
    () => buildCatalogHierarchy(saleableCatalogProducts),
    [saleableCatalogProducts]
  );

  // Keep selectedMainCategory / selectedSubcategory / selectedGroupFilter valid on filter changes
  useEffect(() => {
    if (catalogTree.length === 0) return;
    const catNode = catalogTree.find((c) => c.name === selectedMainCategory);
    if (!catNode) {
      setSelectedMainCategory(catalogTree[0].name);
      setSelectedSubcategory('Todas');
      setSelectedGroupFilter('Todos');
      return;
    }
    if (selectedSubcategory !== 'Todas') {
      const subNode = catNode.subcategories.find((s) => s.name === selectedSubcategory);
      if (!subNode) {
        setSelectedSubcategory('Todas');
        setSelectedGroupFilter('Todos');
        return;
      }
      if (
        selectedGroupFilter !== 'Todos' &&
        !subNode.groups.some((g) => g.name === selectedGroupFilter)
      ) {
        setSelectedGroupFilter('Todos');
      }
    } else if (selectedGroupFilter !== 'Todos') {
      setSelectedGroupFilter('Todos');
    }
  }, [catalogTree, selectedMainCategory, selectedSubcategory, selectedGroupFilter]);

  // Filtered products for POS (global search OR Categoría -> Subcategoría -> Grupo)
  const filteredProducts = useMemo(
    () =>
      filterCatalogProductsByHierarchy(saleableCatalogProducts, {
        category: selectedMainCategory,
        subcategory: selectedSubcategory,
        group: selectedGroupFilter,
        searchQuery,
      }),
    [saleableCatalogProducts, selectedMainCategory, selectedSubcategory, selectedGroupFilter, searchQuery]
  );

  // Top-selling / quick-fire products for fast 1-tap Comandero ordering
  const quickFireProducts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of state.sales) {
      for (const it of s.items) {
        counts.set(it.key, (counts.get(it.key) || 0) + it.qty);
      }
    }
    for (const o of state.orders) {
      for (const it of o.items) {
        counts.set(it.key, (counts.get(it.key) || 0) + it.qty);
      }
    }
    const enabled = state.products.filter((p) => p.saleEnabled);
    return enabled
      .slice()
      .sort((a, b) => (counts.get(b.key) || 0) - (counts.get(a.key) || 0))
      .slice(0, 8);
  }, [state.products, state.sales, state.orders]);

  // Fast lookup for quantities already inside current cart
  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.key, (map.get(item.key) || 0) + item.qty);
    }
    return map;
  }, [cart]);

  // Low stock inventory items (only items with an explicitly configured minStock > 0)
  const lowStockItems = useMemo(() => {
    return Object.values(state.inventory).filter((item) => item.minStock > 0 && item.stock <= item.minStock);
  }, [state.inventory]);

  // Current active orders (not closed)
  const openOrders = useMemo(() => {
    return state.orders.filter((o) => o.status !== 'closed');
  }, [state.orders]);

  // Active accounts for current service & location
  const currentLocOrders = useMemo(() => {
    return state.orders.filter(
      (o) => o.status !== 'closed' && o.service === currentService && String(o.location) === String(currentTable)
    );
  }, [state.orders, currentService, currentTable]);

  // Current selected order
  const selectedOrder = useMemo(() => {
    return state.orders.find((o) => o.id === currentOrderId && o.status !== 'closed') || null;
  }, [state.orders, currentOrderId]);

  // Load account into draft
  const loadOrderIntoDraft = (order: Order) => {
    setCurrentOrderId(order.id);
    setCurrentService(order.service);
    setCurrentTable(order.location);
    setCart(order.items.map((i) => ({ ...i })));
    setWaiter(order.waiter);
    setGeneralNote(order.note || '');
    setPriority(order.priority || 'normal');
    if (order.customer) setDeliveryData(order.customer);
    setView('pos');
    notify(`Cuenta #${order.number} cargada en ${locationLabel(order.service, order.location)}.`);
  };

  // Reset cart for a new account
  const startNewAccount = () => {
    setCurrentOrderId(null);
    setCart([]);
    setWaiter(state.activeUser?.name || 'Operador');
    setGeneralNote('');
    setPriority('normal');
    setDeliveryData({ name: '', phone: '', address: '', reference: '' });
    notify(`Nueva cuenta preparada en ${locationLabel(currentService, currentTable)}.`);
  };

  // Add product to cart (respects role permission and creates independent rounds when items already sent/noted)
  const handleAddProduct = (prod: SoftProduct) => {
    if (!activePerms?.canTakeOrders && !isAdminRole) {
      notify(`Tu rol (${activeRole.toUpperCase()}) no tiene permiso para tomar comandas.`);
      return;
    }
    if (!prod.saleEnabled) {
      notify(`El producto "${prod.name}" tiene precio pendiente.`);
      return;
    }
    const station = prod.station || classifyProductStation(prod.category);

    setCart((prev) => {
      const idx = prev.findIndex(
        (i) =>
          i.key === prod.key &&
          (i.itemStatus || 'pending') === 'pending' &&
          !i.note &&
          !(i.modifiers && i.modifiers.length > 0) &&
          !(i.modificadores && i.modificadores.length > 0)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          lineId: uid(),
          key: prod.key,
          name: prod.name,
          priceCents: prod.priceCents,
          qty: 1,
          note: '',
          station,
          itemStatus: 'pending',
        },
      ];
    });
    notify(`+1 ${prod.name}`);
  };

  const handleUpdateQty = (targetId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => ((i.lineId || i.key) === targetId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const handleDecrementProductByKey = (prodKey: string) => {
    setCart((prev) => {
      const revIdx = [...prev].reverse().findIndex((i) => i.key === prodKey);
      if (revIdx < 0) return prev;
      const realIdx = prev.length - 1 - revIdx;
      const next = [...prev];
      const nextQty = next[realIdx].qty - 1;
      if (nextQty <= 0) {
        next.splice(realIdx, 1);
      } else {
        next[realIdx] = { ...next[realIdx], qty: nextQty };
      }
      return next;
    });
  };

  const handleEditItemNote = (targetId: string) => {
    const item = cart.find((i) => (i.lineId || i.key) === targetId);
    if (!item) return;
    setItemNoteModal({ targetId: item.lineId || item.key, name: item.name });
    setItemNoteValue(item.note || '');
  };

  const handleToggleQuickModifier = (chip: string) => {
    setItemNoteValue((prev) => {
      const parts = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = parts.some((p) => p.toLowerCase() === chip.toLowerCase());
      if (exists) {
        return parts.filter((p) => p.toLowerCase() !== chip.toLowerCase()).join(', ');
      }
      return [...parts, chip].join(', ');
    });
  };

  // Cancel item line with reason and immediate Firestore sync
  const handleCancelItem = (targetId: string) => {
    const item = cart.find((i) => (i.lineId || i.key) === targetId);
    if (!item) return;
    if (!canCancelOrders) {
      notify('Tu rol no tiene permiso para cancelar productos.');
      return;
    }

    setModalReason({
      title: `Cancelar producto: ${item.name}`,
      onConfirm: (reason) => {
        const nextCart = cart.filter((i) => (i.lineId || i.key) !== targetId);
        setCart(nextCart);
        const auditEntry: AuditLogEntry = {
          id: uid(),
          at: new Date().toISOString(),
          user: state.activeUser.name,
          action: 'Producto cancelado',
          detail: `${item.qty} × ${item.name} de ${locationLabel(currentService, currentTable)}`,
          reason,
        };
        setState((prev) => ({
          ...prev,
          audit: [...prev.audit, auditEntry],
        }));
        if (firebaseUser) {
          if (selectedOrder && nextCart.length > 0) {
            const nextTotal = Math.max(0, subtotalCents(nextCart) - (selectedOrder.discountCents || 0));
            const updatedOrder: Order = {
              ...selectedOrder,
              items: nextCart,
              totalCents: nextTotal,
              updatedAt: new Date().toISOString(),
            };
            void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
              notify(`Error actualizando orden en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
            });
          } else {
            void fsRecordAudit(auditEntry, firebaseUser, authorizedEmails).catch((err) => {
              notify(`Error registrando bitácora en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
            });
          }
        }
        notify('Producto cancelado y registrado en bitácora.');
      },
    });
  };

  // Send Order (syncs atomically to Cloud Firestore)
  const handleSendOrder = () => {
    if (cart.length === 0) {
      notify('Agrega al menos un producto a la cuenta antes de enviar.');
      return;
    }
    if (currentService === 'domicilio' && (!deliveryData.name || !deliveryData.phone || !deliveryData.address)) {
      notify('Para servicio a domicilio se requiere Nombre, Teléfono y Dirección.');
      return;
    }

    const isNew = !currentOrderId;
    const { nextState, orderId } = createOrUpdateOrder(state, {
      orderId: currentOrderId,
      service: currentService,
      location: currentTable,
      waiter,
      note: generalNote,
      items: cart,
      customer: currentService === 'domicilio' ? deliveryData : undefined,
      priority,
    });

    setState(nextState);
    setCurrentOrderId(orderId);

    const savedOrder = nextState.orders.find((o) => o.id === orderId);
    const latestAudit = nextState.audit[nextState.audit.length - 1];
    if (firebaseUser && savedOrder && latestAudit) {
      void fsSaveOrder(savedOrder, isNew, firebaseUser, authorizedEmails, latestAudit)
        .then((assignedNum) => {
          if (isNew && assignedNum !== savedOrder.number) {
            setState((prev) => ({
              ...prev,
              orders: prev.orders.map((o) => (o.id === orderId ? { ...o, number: assignedNum } : o)),
              nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
            }));
          }
        })
        .catch((err) => {
          notify(`Error guardando comanda en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
        });
    }
    notify(`Comanda guardada y enviada a cocina/barra exitosamente.`);
  };

  // Advance individual item status in KDS (Fase 2: pending -> preparing -> ready -> served)
  const handleAdvanceItemStatus = (orderId: string, itemTargetId: string, targetStatus: ItemStatus) => {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return;
    const targetItem = order.items.find((i) => (i.lineId || i.key) === itemTargetId);
    if (!targetItem) return;

    const currentItemStatus: ItemStatus = targetItem.itemStatus || 'pending';
    const itemStation = targetItem.station || 'cocina';

    if (!canTransitionItemStatus(currentItemStatus, targetStatus)) {
      notify(`Transición inválida: ${currentItemStatus} → ${targetStatus}.`);
      return;
    }
    if (!canActOnItem(state.activeUser.role, itemStation, targetStatus, state.deviceConfig?.station || 'todos')) {
      notify(`El rol ${state.activeUser.role.toUpperCase()} / estación ${state.deviceConfig?.station} no puede marcar "${targetStatus}" en ${itemStation.toUpperCase()}.`);
      return;
    }

    const now = new Date().toISOString();
    const updatedItems: OrderItem[] = order.items.map((it) =>
      (it.lineId || it.key) === itemTargetId ? { ...it, itemStatus: targetStatus } : it
    );
    const nextOrderStatus = computeOrderStatusFromItems(updatedItems, order.status);
    const updatedOrder: Order = {
      ...order,
      items: updatedItems,
      status: nextOrderStatus,
      updatedAt: now,
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Partida KDS actualizada',
      detail: `Cuenta #${order.number} · ${targetItem.qty}× ${targetItem.name} (${itemStation}) → ${targetStatus.toUpperCase()}`,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error actualizando KDS en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    notify(`${targetItem.name} → ${targetStatus.toUpperCase()}`);
  };

  // Advance Kitchen Order Status (advances matching station items cleanly)
  const handleAdvanceOrderStatus = (orderId: string, currentStatus: OrderStatus) => {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return;
    const now = new Date().toISOString();
    const targetStatus: OrderStatus =
      currentStatus === 'sent' ? 'preparing' : currentStatus === 'preparing' ? 'ready' : 'served';
    const itemTarget: ItemStatus =
      targetStatus === 'preparing' ? 'preparing' : targetStatus === 'ready' ? 'ready' : 'served';

    const updatedItems: OrderItem[] = order.items.map((it) => {
      const matchesStation = kitchenStation === 'todas' || (it.station || 'cocina') === kitchenStation;
      const curSt = it.itemStatus || 'pending';
      if (matchesStation && canTransitionItemStatus(curSt, itemTarget)) {
        return { ...it, itemStatus: itemTarget };
      }
      return it;
    });

    const computedStatus = computeOrderStatusFromItems(updatedItems, targetStatus);
    const updatedOrder: Order = {
      ...order,
      items: updatedItems,
      status: computedStatus === order.status ? targetStatus : computedStatus,
      updatedAt: now,
    };

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Estado KDS avanzado',
      detail: `Cuenta #${order.number} (${locationLabel(order.service, order.location)}) pasó a ${updatedOrder.status.toUpperCase()}`,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error KDS Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    notify(`Comanda avanzada a ${updatedOrder.status.toUpperCase()}.`);
  };

  // Split Order
  const handleSplitOrder = () => {
    if (!selectedOrder || selectedOrder.items.length < 2) {
      notify('Se requieren al menos 2 platillos distintos en una cuenta abierta para dividirla.');
      return;
    }
    setPromptModal({
      title: 'Dividir comanda',
      label: 'Ingresa la CLAVE del producto a separar en una nueva cuenta:',
      defaultValue: selectedOrder.items[0]?.key,
      onConfirm: (keyVal) => {
        const item = selectedOrder.items.find((i) => i.key === keyVal.trim());
        if (!item) {
          notify('Clave no encontrada en esta comanda.');
          return;
        }
        const now = new Date().toISOString();
        const splitOrderNum = state.nextOrderNumber;
        const newSplitId = uid();

        const splitOrder: Order = {
          ...selectedOrder,
          id: newSplitId,
          number: splitOrderNum,
          items: [{ ...item }],
          totalCents: lineTotalCents(item),
          discountCents: 0,
          note: `Dividida de cuenta #${selectedOrder.number}`,
          createdAt: now,
          updatedAt: now,
        };

        const remainingItems = selectedOrder.items.filter((i) => i.key !== keyVal.trim());
        const updatedOriginal: Order = {
          ...selectedOrder,
          items: remainingItems,
          totalCents: Math.max(0, subtotalCents(remainingItems) - selectedOrder.discountCents),
          updatedAt: now,
        };

        const auditEntry: AuditLogEntry = {
          id: uid(),
          at: now,
          user: state.activeUser.name,
          action: 'Cuenta dividida',
          detail: `Producto ${item.name} movido de Cuenta #${selectedOrder.number} a nueva Cuenta #${splitOrderNum}`,
        };

        setState((prev) => ({
          ...prev,
          orders: [...prev.orders.filter((o) => o.id !== selectedOrder.id), updatedOriginal, splitOrder],
          nextOrderNumber: splitOrderNum + 1,
          audit: [...prev.audit, auditEntry],
        }));

        if (firebaseUser) {
          void fsSplitOrder(updatedOriginal, splitOrder, firebaseUser, authorizedEmails, auditEntry)
            .then((assignedNum) => {
              if (assignedNum !== splitOrder.number) {
                setState((prev) => ({
                  ...prev,
                  orders: prev.orders.map((o) => (o.id === newSplitId ? { ...o, number: assignedNum } : o)),
                  nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
                }));
              }
            })
            .catch((err) => {
              const rawMsg = err instanceof Error ? err.message : 'Sin permisos';
              notify(`Error dividiendo cuenta en Firestore: ${rawMsg.replace(/^ORDER_CLOSED:/, '')}`);
            });
        }

        loadOrderIntoDraft(splitOrder);
        notify(`Nueva Cuenta #${splitOrderNum} creada con ${item.name}.`);
      },
    });
    setPromptValue(selectedOrder.items[0]?.key || '');
  };

  // Move or Merge table
  const handleMoveTable = () => {
    if (!selectedOrder) {
      notify('Selecciona o guarda una cuenta antes de cambiar o unir mesa.');
      return;
    }
    setMoveTargetService(selectedOrder.service);
    const opts = locationOptions(selectedOrder.service);
    const nextDefault = opts.find((o) => o.value !== String(selectedOrder.location))?.value || opts[0].value;
    setMoveTargetLocation(nextDefault);
    setMoveTableModalOpen(true);
  };

  const handleConfirmMoveTable = () => {
    if (!selectedOrder) return;
    const currentLoc = locationLabel(selectedOrder.service, selectedOrder.location);
    const targetLocLabel = locationLabel(moveTargetService, moveTargetLocation);
    if (selectedOrder.service === moveTargetService && String(selectedOrder.location) === String(moveTargetLocation)) {
      notify('Elige una ubicación diferente a la actual.');
      return;
    }

    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...selectedOrder,
      service: moveTargetService,
      location: moveTargetLocation,
      table: moveTargetLocation,
      updatedAt: now,
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Mesa cambiada',
      detail: `Cuenta #${selectedOrder.number}: ${currentLoc} → ${targetLocLabel}`,
    };
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
      audit: [...prev.audit, auditEntry],
    }));
    if (firebaseUser) {
      void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error cambiando mesa en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    setCurrentService(moveTargetService);
    setCurrentTable(moveTargetLocation);
    setMoveTableModalOpen(false);
    notify(`Cuenta #${selectedOrder.number} movida a ${targetLocLabel}.`);
  };

  const handleConfirmMergeOrders = (targetOrder: Order) => {
    if (!selectedOrder || !isFirebaseAdmin) return;
    const now = new Date().toISOString();
    const mergedMap = new Map<string, OrderItem>();
    for (const it of [...targetOrder.items, ...selectedOrder.items]) {
      const mergeKey = `${it.key}::${it.note || ''}::${it.itemStatus || 'pending'}`;
      const existing = mergedMap.get(mergeKey);
      if (existing) {
        mergedMap.set(mergeKey, {
          ...existing,
          qty: existing.qty + it.qty,
        });
      } else {
        mergedMap.set(mergeKey, { ...it, lineId: it.lineId || uid() });
      }
    }
    const mergedItems = Array.from(mergedMap.values());
    const mergedDiscount = (targetOrder.discountCents || 0) + (selectedOrder.discountCents || 0);
    const mergedTotal = Math.max(0, subtotalCents(mergedItems) - mergedDiscount);
    const mergedNote = [targetOrder.note, selectedOrder.note, `Unida con Cuenta #${selectedOrder.number}`]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300);

    const updatedTarget: Order = {
      ...targetOrder,
      items: mergedItems,
      discountCents: mergedDiscount,
      totalCents: mergedTotal,
      note: mergedNote,
      updatedAt: now,
    };

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Cuentas unidas',
      detail: `Cuenta #${selectedOrder.number} unida dentro de Cuenta #${targetOrder.number} (${locationLabel(targetOrder.service, targetOrder.location)})`,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders
        .filter((o) => o.id !== selectedOrder.id)
        .map((o) => (o.id === targetOrder.id ? updatedTarget : o)),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsMergeOrders(updatedTarget, selectedOrder.id, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error uniendo cuentas en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setMoveTableModalOpen(false);
    loadOrderIntoDraft(updatedTarget);
    notify(`Cuenta #${selectedOrder.number} unida a Cuenta #${targetOrder.number}.`);
  };

  // Cancel whole account (permission gated)
  const handleCancelAccount = () => {
    if (!canCancelOrders) {
      notify('Tu rol no tiene autorización para cancelar cuentas completas.');
      return;
    }
    if (!selectedOrder) {
      notify('No hay una cuenta activa para cancelar.');
      return;
    }
    setModalReason({
      title: `Cancelar Cuenta #${selectedOrder.number} completa`,
      onConfirm: (reason) => {
        const now = new Date().toISOString();
        const auditEntry: AuditLogEntry = {
          id: uid(),
          at: now,
          user: state.activeUser.name,
          action: 'Cuenta cancelada',
          detail: `Cuenta #${selectedOrder.number} en ${locationLabel(selectedOrder.service, selectedOrder.location)} por $${(selectedOrder.totalCents / 100).toFixed(2)}`,
          reason,
        };
        setState((prev) => ({
          ...prev,
          orders: prev.orders.filter((o) => o.id !== selectedOrder.id),
          audit: [...prev.audit, auditEntry],
        }));
        if (firebaseUser) {
          void fsCancelOrder(selectedOrder, isFirebaseAdmin, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
            notify(`Error cancelando cuenta en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
          });
        }
        startNewAccount();
        notify(`Cuenta #${selectedOrder.number} cancelada y registrada en bitácora.`);
      },
    });
  };

  // Apply discount (permission gated)
  const handleApplyDiscount = () => {
    if (!canApplyDiscount) {
      notify('Tu rol no tiene autorización para aplicar descuentos.');
      return;
    }
    if (!selectedOrder) {
      notify('Primero guarda o selecciona una comanda abierta.');
      return;
    }
    setPromptModal({
      title: 'Aplicar descuento autorizado',
      label: `Ingresa el monto del descuento en PESOS (Subtotal: ${formatMoney(selectedOrder.totalCents)}):`,
      defaultValue: '50',
      onConfirm: (val) => {
        const amountPesos = Number(val);
        if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
          notify('Monto de descuento no válido.');
          return;
        }
        const discountCents = Math.round(amountPesos * 100);
        setModalReason({
          title: `Autorizar descuento de ${formatMoney(discountCents)}`,
          onConfirm: (reason) => {
            const now = new Date().toISOString();
            const sub = subtotalCents(selectedOrder.items);
            const nextTotal = Math.max(0, sub - discountCents);
            const updatedOrder: Order = {
              ...selectedOrder,
              discountCents,
              totalCents: nextTotal,
              updatedAt: now,
            };
            const auditEntry: AuditLogEntry = {
              id: uid(),
              at: now,
              user: state.activeUser.name,
              action: 'Descuento autorizado',
              detail: `Descuento de ${formatMoney(discountCents)} aplicado a Cuenta #${selectedOrder.number}`,
              reason,
            };
            setState((prev) => ({
              ...prev,
              orders: prev.orders.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
              audit: [...prev.audit, auditEntry],
            }));
            if (firebaseUser) {
              void fsUpdateOrder(updatedOrder, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
                notify(`Error aplicando descuento en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
              });
            }
            notify(`Descuento de ${formatMoney(discountCents)} aplicado.`);
          },
        });
      },
    });
    setPromptValue('50');
  };

  // Execute payment in cashier (enforces Fase 2 unserved items check & open shift check)
  const executePaymentConfirmed = (order: Order, forceMarkServed: boolean) => {
    if (!canCollectPayment) {
      notify('Tu rol no tiene permiso para cobrar cuentas.');
      return;
    }
    if (!state.shift.isOpen) {
      notify('El turno de caja está cerrado. Abre un nuevo turno antes de cobrar.');
      return;
    }

    const workingOrder: Order = forceMarkServed
      ? {
          ...order,
          items: order.items.map((it) => ({ ...it, itemStatus: 'served' as ItemStatus })),
          status: 'served',
        }
      : order;

    const preparedState: FullPosState = forceMarkServed
      ? {
          ...state,
          orders: state.orders.map((o) => (o.id === order.id ? workingOrder : o)),
        }
      : state;

    const cashVal = Number(cashTendered) ? Math.round(Number(cashTendered) * 100) : undefined;
    const change = cashVal && cashVal > workingOrder.totalCents ? cashVal - workingOrder.totalCents : 0;
    const mixedCashCents =
      paymentMethod === 'mixto'
        ? Math.min(workingOrder.totalCents, Math.max(0, Math.round((Number(mixedCashInput) || 0) * 100)))
        : undefined;

    try {
      const nextState = closeAndPayOrder(preparedState, {
        orderId: workingOrder.id,
        paymentMethod,
        amountCash: paymentMethod === 'efectivo' ? workingOrder.totalCents : mixedCashCents,
        amountCard:
          paymentMethod === 'tarjeta'
            ? workingOrder.totalCents
            : paymentMethod === 'mixto'
            ? workingOrder.totalCents - (mixedCashCents || 0)
            : undefined,
      });

      setState(nextState);
      const closedOrder = nextState.orders.find((o) => o.id === workingOrder.id);
      const sale = nextState.sales[nextState.sales.length - 1];
      const latestAudit = nextState.audit[nextState.audit.length - 1];

      if (firebaseUser && closedOrder && sale && latestAudit) {
        void fsCloseAndPayOrder(
          closedOrder,
          { ...sale, changeGiven: change },
          nextState.shift,
          firebaseUser,
          authorizedEmails,
          latestAudit
        )
          .then(({ assignedReceipt }) => {
            if (assignedReceipt && assignedReceipt !== sale.receipt) {
              setState((prev) => ({
                ...prev,
                sales: prev.sales.map((s) => (s.id === sale.id ? { ...s, receipt: assignedReceipt } : s)),
              }));
              setActiveReceiptSale((prev) => (prev && prev.id === sale.id ? { ...prev, receipt: assignedReceipt } : prev));
            }
          })
          .catch((err) => {
            const rawMsg = err instanceof Error ? err.message : 'Sin permisos';
            if (rawMsg.startsWith('ALREADY_PAID:')) {
              notify(rawMsg.replace('ALREADY_PAID:', ''));
            } else {
              notify(`Error guardando cobro en Firestore: ${rawMsg}`);
            }
          });
      }

      setActiveReceiptSale(sale);
      setPayOrderId('');
      setCashTendered('');
      setMixedCashInput('');
      setConfirmUnservedPay(false);
      notify(`Cobro registrado con éxito. Folio: ${sale.receipt}${change > 0 ? ` · Cambio: ${formatMoney(change)}` : ''}`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error al procesar cobro');
    }
  };

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCollectPayment) {
      notify('Tu rol no tiene autorización para registrar cobros.');
      return;
    }
    if (!state.shift.isOpen) {
      notify('El turno de caja está cerrado. Abre un nuevo turno antes de cobrar.');
      return;
    }
    if (!payOrderId) {
      notify('Selecciona una cuenta pendiente de cobro.');
      return;
    }
    const order = state.orders.find((o) => o.id === payOrderId && !o.paid);
    if (!order) {
      notify('Cuenta no encontrada o ya está cobrada.');
      return;
    }
    if (hasUnservedItems(order) && !confirmUnservedPay) {
      setConfirmUnservedPay(true);
      notify('Esta cuenta aún tiene productos pendientes de marcar como servidos.');
      return;
    }
    executePaymentConfirmed(order, true);
  };

  // Perform Cash Cut (Corte de Turno - permission gated)
  const handlePerformCashCut = () => {
    if (!canCashCut) {
      notify('Tu rol no tiene autorización para realizar cortes de caja.');
      return;
    }
    const counted = Number(physicalCashCount);
    if (!Number.isFinite(counted) || counted < 0) {
      notify('Ingresa el monto del conteo físico de efectivo en caja.');
      return;
    }
    const actualCents = Math.round(counted * 100);
    const expected = state.shift.expectedCashCents;
    const diff = actualCents - expected;

    const shift = {
      ...state.shift,
      isOpen: false,
      closedAt: new Date().toISOString(),
      actualCashCents: actualCents,
      differenceCents: diff,
      closedByUser: state.activeUser.name,
    };

    let detail = `Corte de turno completado. Esperado: ${formatMoney(expected)} · Conteo físico: ${formatMoney(actualCents)}`;
    if (diff === 0) detail += ' (Caja cuadrada exacta)';
    else if (diff > 0) detail += ` (Sobrante: +${formatMoney(diff)})`;
    else detail += ` (Faltante: ${formatMoney(diff)})`;

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: state.activeUser.name,
      action: 'Corte de caja Z',
      detail,
    };

    setState((prev) => ({
      ...prev,
      shift,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsCloseShift(shift, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error cerrando turno en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    notify(`Corte de turno completado: ${detail}`);
  };

  // Open New Shift after Corte Z with explicit opening cash fund (defaults to 0)
  const handleOpenNewShift = () => {
    if (!canCashCut) {
      notify('Tu rol no tiene autorización para abrir turnos de caja.');
      return;
    }
    const openingPesos = Number(openingCashInput);
    if (!Number.isFinite(openingPesos) || openingPesos < 0) {
      notify('Ingresa un fondo inicial válido ($0.00 o mayor).');
      return;
    }
    const initialCents = Math.round(openingPesos * 100);
    const newShift = createInitialShift(initialCents);
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: state.activeUser.name,
      action: 'Apertura de turno de caja',
      detail: `Nuevo turno ${newShift.id} abierto con fondo inicial ${formatMoney(newShift.initialCashCents)}`,
    };
    setState((prev) => ({
      ...prev,
      shift: newShift,
      audit: [...prev.audit, auditEntry],
    }));
    setPhysicalCashCount('');
    setOpeningCashInput('0');
    if (firebaseUser) {
      void fsOpenNewShift(newShift, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error abriendo turno en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    notify(`Nuevo turno abierto (${newShift.id}) con fondo ${formatMoney(initialCents)}.`);
  };

  // Record Cash Drawer Movement (Ingreso / Retiro de efectivo)
  const handleSaveDrawerMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCashCut) {
      notify('Tu rol no tiene autorización para registrar movimientos de efectivo.');
      return;
    }
    if (!drawerModalType) return;
    if (!state.shift.isOpen) {
      notify('Abre un turno de caja antes de registrar ingresos o retiros.');
      return;
    }
    const pesos = Number(drawerAmount);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      notify('Ingresa un monto mayor a $0.00.');
      return;
    }
    const cents = Math.round(pesos * 100);
    if (drawerModalType === 'retiro' && cents > state.shift.expectedCashCents) {
      notify('El retiro no puede superar el efectivo esperado en cajón.');
      return;
    }
    const reason = drawerReason.trim() || (drawerModalType === 'deposito' ? 'Ingreso de cambio a caja' : 'Retiro parcial de caja');
    const updatedShift = {
      ...state.shift,
      depositosCents: (state.shift.depositosCents || 0) + (drawerModalType === 'deposito' ? cents : 0),
      retirosCents: (state.shift.retirosCents || 0) + (drawerModalType === 'retiro' ? cents : 0),
      expectedCashCents:
        drawerModalType === 'deposito'
          ? state.shift.expectedCashCents + cents
          : Math.max(0, state.shift.expectedCashCents - cents),
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: state.activeUser.name,
      action: drawerModalType === 'deposito' ? 'Ingreso de efectivo' : 'Retiro de efectivo',
      detail: `${drawerModalType === 'deposito' ? '+' : '-'}${formatMoney(cents)} · Nuevo esperado: ${formatMoney(updatedShift.expectedCashCents)}`,
      reason,
    };

    setState((prev) => ({
      ...prev,
      shift: updatedShift,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsRecordCashDrawerMovement(updatedShift, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error registrando movimiento de caja: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setDrawerModalType(null);
    setDrawerAmount('');
    setDrawerReason('');
    notify(`${drawerModalType === 'deposito' ? 'Ingreso' : 'Retiro'} de ${formatMoney(cents)} registrado.`);
  };

  // Reopen Last Sale
  const handleReopenLastSale = () => {
    const lastSale = state.sales[state.sales.length - 1];
    if (!lastSale) {
      notify('No hay ventas registradas para reabrir.');
      return;
    }

    setModalReason({
      title: `Reabrir venta ${lastSale.receipt}`,
      onConfirm: (reason) => {
        const now = new Date().toISOString();
        const reopenedNum = state.nextOrderNumber;
        const newOrderId = uid();

        const reopenedOrder: Order = {
          id: newOrderId,
          number: reopenedNum,
          service: lastSale.service,
          location: lastSale.location,
          table: lastSale.location,
          waiter: lastSale.waiter,
          note: `Reapertura derivada de ${lastSale.receipt}`,
          items: lastSale.items.map((i) => ({ ...i, itemStatus: i.itemStatus || 'pending' })),
          totalCents: lastSale.totalCents,
          discountCents: 0,
          priority: 'normal',
          status: 'sent',
          paid: false,
          createdAt: now,
          updatedAt: now,
        };

        const auditEntry: AuditLogEntry = {
          id: uid(),
          at: now,
          user: state.activeUser.name,
          action: 'Venta reabierta',
          detail: `Nueva cuenta #${reopenedNum} creada a partir de venta ${lastSale.receipt}`,
          reason,
        };

        setState((prev) => ({
          ...prev,
          orders: [...prev.orders, reopenedOrder],
          nextOrderNumber: reopenedNum + 1,
          audit: [...prev.audit, auditEntry],
        }));

        if (firebaseUser) {
          void fsSaveOrder(reopenedOrder, true, firebaseUser, authorizedEmails, auditEntry)
            .then((assignedNum) => {
              if (assignedNum !== reopenedOrder.number) {
                setState((prev) => ({
                  ...prev,
                  orders: prev.orders.map((o) => (o.id === newOrderId ? { ...o, number: assignedNum } : o)),
                  nextOrderNumber: Math.max(prev.nextOrderNumber, assignedNum + 1),
                }));
              }
            })
            .catch((err) => {
              notify(`Error reabriendo venta en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
            });
        }

        loadOrderIntoDraft(reopenedOrder);
        notify(`Venta reabierta como Cuenta #${reopenedNum}.`);
      },
    });
  };

  // Export CSV
  const handleExportSalesCsv = () => {
    if (state.sales.length === 0) {
      notify('No hay ventas para exportar.');
      return;
    }
    const headers = [
      'Folio',
      'Fecha',
      'Hora',
      'Servicio',
      'Ubicación',
      'Mesero',
      'Clave',
      'Producto',
      'Cantidad',
      'Precio_Unitario_MXN',
      'Subtotal_MXN',
      'Metodo_Pago',
      'Descuento_MXN',
      'Total_MXN',
    ];

    const rows: unknown[][] = [];
    state.sales.forEach((s) => {
      const dateObj = new Date(s.paidAt);
      const d = dateObj.toLocaleDateString('es-MX');
      const t = dateObj.toLocaleTimeString('es-MX');
      s.items.forEach((i) => {
        rows.push([
          s.receipt,
          d,
          t,
          serviceName(s.service),
          s.location,
          s.waiter,
          i.key,
          i.name,
          String(i.qty),
          (i.priceCents / 100).toFixed(2),
          (lineTotalCents(i) / 100).toFixed(2),
          s.paymentMethod.toUpperCase(),
          (s.discountCents / 100).toFixed(2),
          (s.totalCents / 100).toFixed(2),
        ]);
      });
    });

    downloadCsvFile(`barbachu-ventas-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    notify('Reporte de ventas exportado a CSV.');
  };

  // Inventory Stock Adjustment or Intake or MinStock change
  const handleSaveInventoryMovement = () => {
    if (!inventoryModal) return;
    const qtyNum = Number(invQty);
    const costNum = Number(invCost) || 0;
    const now = new Date().toISOString();

    const currentItem = state.inventory[inventoryModal.clave] || {
      clave: inventoryModal.clave,
      descripcion: inventoryModal.descripcion,
      unidad: 'PZA',
      categoria: 'GENERAL',
      costo: costNum,
      stock: 0,
      minStock: 5,
    };

    if (inventoryModal.type === 'minStock') {
      if (!Number.isFinite(qtyNum) || qtyNum < 0) {
        notify('Ingresa un umbral de stock mínimo válido.');
        return;
      }
      const updatedItem: InventoryItem = {
        ...currentItem,
        minStock: qtyNum,
      };
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: state.activeUser.name,
        action: 'Alerta de inventario modificada',
        detail: `${inventoryModal.descripcion}: umbral mínimo fijado a ${qtyNum} ${currentItem.unidad}`,
      };
      setState((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          [inventoryModal.clave]: updatedItem,
        },
        audit: [...prev.audit, auditEntry],
      }));
      if (firebaseUser) {
        void fsSaveInventoryMovement(updatedItem, null, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          notify(`Error actualizando umbral en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
        });
      }
      setInventoryModal(null);
      setInvQty('');
      notify(`Umbral de alerta actualizado a ${qtyNum} ${currentItem.unidad}.`);
      return;
    }

    if (!Number.isFinite(qtyNum) || (inventoryModal.type === 'ajuste' ? qtyNum < 0 : qtyNum <= 0)) {
      notify(inventoryModal.type === 'ajuste' ? 'Ingresa un conteo válido (0 o mayor).' : 'Ingresa una cantidad mayor a 0.');
      return;
    }

    let newStock = currentItem.stock;
    if (inventoryModal.type === 'entrada') {
      newStock += qtyNum;
    } else if (inventoryModal.type === 'merma') {
      newStock = Math.max(0, currentItem.stock - qtyNum);
    } else {
      newStock = qtyNum; // Ajuste directo al stock contado
    }

    const updatedItem: InventoryItem = {
      ...currentItem,
      stock: Math.max(0, newStock),
      costo: costNum > 0 ? costNum : currentItem.costo,
    };

    const mov = {
      id: uid(),
      at: now,
      clave: inventoryModal.clave,
      descripcion: inventoryModal.descripcion,
      type: inventoryModal.type,
      qty: qtyNum,
      costUnit: costNum > 0 ? costNum : currentItem.costo,
      reason: invReason.trim() || (inventoryModal.type === 'merma' ? 'Merma / Desperdicio' : 'Ajuste operativo'),
      user: state.activeUser.name,
    };

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: `Inventario: ${inventoryModal.type.toUpperCase()}`,
      detail: `${inventoryModal.descripcion} (${currentItem.unidad}) · ${inventoryModal.type === 'entrada' ? `+${qtyNum}` : inventoryModal.type === 'merma' ? `-${qtyNum} (Merma)` : `fijado a ${qtyNum}`} · Nuevo stock: ${updatedItem.stock}`,
      reason: invReason,
    };

    setState((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [inventoryModal.clave]: updatedItem,
      },
      inventoryMovements: [...prev.inventoryMovements, mov],
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      const costChanged = isFirebaseAdmin && costNum > 0 && costNum !== currentItem.costo;
      void fsSaveInventoryMovement(updatedItem, mov, firebaseUser, authorizedEmails, auditEntry, {
        updateCost: costChanged,
      }).catch((err) => {
        notify(`Error guardando inventario en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setInventoryModal(null);
    setInvQty('');
    setInvCost('');
    setInvReason('');
    notify(`Inventario actualizado: ${inventoryModal.descripcion} ahora tiene ${updatedItem.stock} ${updatedItem.unidad}.`);
  };

  // Advanced POS Features Handlers (Split Bill, Transfer, Merge, Device Station & Sync)
  const handleUpdateDeviceStation = (station: DeviceStation, stationName: string, autoLock: number) => {
    setState((prev) => ({
      ...prev,
      deviceConfig: { station, stationName, autoLockMinutes: autoLock },
    }));
    if (station === 'cocina') {
      setKitchenStation('cocina');
      setPosStationFilter('cocina');
      if (canViewKitchen) setView('kitchen');
    } else if (station === 'barra') {
      setKitchenStation('barra');
      setPosStationFilter('barra');
      if (canViewKitchen) setView('kitchen');
    } else if (station === 'comandero' && canViewPos) {
      setPosStationFilter('todas');
      setView('pos');
    } else if (station === 'caja' && canViewCash) {
      setView('cash');
    } else {
      setPosStationFilter('todas');
      setKitchenStation('todas');
    }
    if (firebaseUser && workspaceAuthorized) {
      void upsertTerminalHeartbeat(
        {
          deviceId,
          station,
          stationName,
          staffName: employeeAuthenticated ? state.activeUser.name : 'En espera de PIN',
          staffRole: employeeAuthenticated ? state.activeUser.role : 'mesero',
          platform: platformLabel,
          online: isOnline,
        },
        firebaseUser,
        authorizedEmails
      );
    }
    notify(`Estación configurada: ${stationName} (${station.toUpperCase()})`);
  };

  const handleForceSyncHeartbeat = async () => {
    if (!firebaseUser || !workspaceAuthorized) return;
    await upsertTerminalHeartbeat(
      {
        deviceId,
        station: state.deviceConfig?.station || 'todos',
        stationName: state.deviceConfig?.stationName || DEVICE_STATION_NAMES.todos,
        staffName: employeeAuthenticated ? state.activeUser.name : 'En espera de PIN',
        staffRole: employeeAuthenticated ? state.activeUser.role : 'mesero',
        platform: platformLabel,
        online: isOnline,
      },
      firebaseUser,
      authorizedEmails
    );
    setLastSyncMs(Date.now());
  };

  const handleRemoveTerminal = async (targetDeviceId: string) => {
    try {
      await deleteTerminalSession(targetDeviceId);
      notify('Terminal desconectada del registro.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo quitar la terminal.');
    }
  };

  const handleGoogleSignOut = async () => {
    if (firebaseUser && workspaceAuthorized) {
      await upsertTerminalHeartbeat(
        {
          deviceId,
          station: state.deviceConfig?.station || 'todos',
          stationName: state.deviceConfig?.stationName || DEVICE_STATION_NAMES.todos,
          staffName: state.activeUser.name,
          staffRole: state.activeUser.role,
          platform: platformLabel,
          online: false,
        },
        firebaseUser,
        authorizedEmails
      ).catch(() => undefined);
    }
    await signOutFirebase();
  };

  // Permissions & PIN protected navigation: strictly requires role === 'admin'
  const handleNavigateToAdmin = () => {
    if (state.activeUser.role === 'admin') {
      setView('admin');
    } else {
      setPinPadMode('admin');
    }
  };

  const handleOpenUserSwitcher = () => {
    setPinPadMode('switch');
  };

  const handleLockSession = () => {
    setIsSessionLocked(true);
    setPinPadMode('unlock');
  };

  const handleOpenPreCheck = (order: Order) => {
    setActivePreCheckOrder(order);
  };

  const handleOpenDraftPreCheck = () => {
    if (selectedOrder) {
      setActivePreCheckOrder(selectedOrder);
      return;
    }
    if (cart.length === 0) {
      notify('Agrega productos antes de emitir una pre-cuenta.');
      return;
    }
    const now = new Date().toISOString();
    setActivePreCheckOrder({
      id: 'draft-precheck',
      number: state.nextOrderNumber,
      service: currentService,
      location: currentTable,
      table: currentTable,
      waiter,
      note: generalNote,
      items: cart,
      totalCents: totalCents(cart, 0),
      discountCents: 0,
      priority,
      status: 'sent',
      paid: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  // Total sales calculated
  const totalSalesCents = useMemo(() => {
    return state.sales.reduce((sum, s) => sum + s.totalCents, 0);
  }, [state.sales]);

  const todaySalesCount = useMemo(() => {
    const todayStr = toLocalDateKey(new Date());
    return state.sales.filter((s) => toLocalDateKey(s.paidAt) === todayStr).length;
  }, [state.sales]);

  const todaySalesCents = useMemo(() => {
    const todayStr = toLocalDateKey(new Date());
    return state.sales
      .filter((s) => toLocalDateKey(s.paidAt) === todayStr)
      .reduce((sum, s) => sum + s.totalCents, 0);
  }, [state.sales]);

  const todayOrdersCount = useMemo(() => {
    const todayStr = toLocalDateKey(new Date());
    return state.orders.filter(
      (o) => toLocalDateKey(o.createdAt) === todayStr || toLocalDateKey(o.updatedAt) === todayStr
    ).length;
  }, [state.orders]);

  // Tables map overview
  const tableLocations = useMemo(() => {
    return [
      ...Array.from({ length: 8 }, (_, i) => ({ service: 'mesa' as ServiceType, loc: String(i + 1), label: `Mesa ${i + 1}`, section: 'Salón Principal' })),
      ...Array.from({ length: 6 }, (_, i) => ({ service: 'barra_exterior' as ServiceType, loc: String(i + 1), label: `Banco Terraza ${i + 1}`, section: 'Barra Exterior' })),
      ...Array.from({ length: 3 }, (_, i) => ({ service: 'barra_interior' as ServiceType, loc: String(i + 1), label: `Banco Interior ${i + 1}`, section: 'Barra Interior' })),
      { service: 'para_llevar' as ServiceType, loc: '0', label: 'Mostrador / Para llevar', section: 'Mostrador' },
      { service: 'domicilio' as ServiceType, loc: '0', label: 'Pedidos a Domicilio', section: 'Reparto' },
    ];
  }, []);

  const totalOccupiedTables = useMemo(() => {
    const locs = new Set(openOrders.map((o) => `${o.service}-${o.location}`));
    return locs.size;
  }, [openOrders]);

  // Auth loading state
  if (!authReady || cloudBooting) {
    return (
      <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <BarbachuLogo className="w-20 h-auto mx-auto" />
          <p className="text-xs uppercase tracking-widest text-[#c8a84b] font-bold">
            Sincronizando Barbachu Cloud POS...
          </p>
        </div>
      </div>
    );
  }

  // Google Sign-In Gate for Production Multi-Device POS
  if (!firebaseUser) {
    return (
      <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center p-6">
        <div className="max-w-md w-full ios-glass-modal border-[#c8a84b]/35 p-8 space-y-6 text-center">
          <BarbachuLogo className="w-24 h-auto mx-auto drop-shadow-[0_0_24px_rgba(200,168,75,0.25)]" />
          <div className="space-y-1.5">
            <h1 className="font-serif font-bold text-3xl text-white tracking-[-0.02em]">BARBACHU POS</h1>
            <p className="text-xs text-[#c8a84b] uppercase tracking-widest font-semibold">
              Punto de Venta Multi-Dispositivo en la Nube
            </p>
            <p className="text-xs text-[rgba(240,230,211,0.68)] pt-1 leading-relaxed">
              Inicia sesión con tu cuenta de Google autorizada para sincronizar comandas, KDS de cocina/barra, caja e inventario en tiempo real.
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-2xl bg-[#e05252]/15 border border-[#e05252]/40 text-xs text-[#e05252]">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={authLoading}
            onClick={async () => {
              setAuthLoading(true);
              setAuthError(null);
              try {
                await signInWithGoogle();
              } catch (err: unknown) {
                setAuthError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.');
              } finally {
                setAuthLoading(false);
              }
            }}
            className="w-full min-h-[48px] py-3 px-5 rounded-2xl bg-white hover:bg-gray-100 active:scale-[0.98] text-[#1f1f1f] font-bold text-sm shadow-lg flex items-center justify-center gap-3 transition-all duration-150 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
              <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
            </svg>
            <span>{authLoading ? 'Conectando...' : 'Continuar con Google'}</span>
          </button>

          {onSwitchToMenu && (
            <button
              type="button"
              onClick={onSwitchToMenu}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.98] border border-white/10 text-[#e8d090] text-xs font-bold transition-all duration-150 inline-flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> Ver Menú Digital Público (Clientes)
            </button>
          )}
        </div>
      </div>
    );
  }

  // Non-authorized Google account gate
  if (!workspaceAuthorized) {
    return (
      <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] flex items-center justify-center p-6">
        <div className="max-w-md w-full ios-glass-modal border-[#e05252]/40 p-8 space-y-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#e05252]/20 text-[#e05252] flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
            Terminal Pendiente de Autorización
          </h2>
          <p className="text-xs text-[rgba(240,230,211,0.68)] leading-relaxed">
            Iniciaste sesión como <strong className="text-white">{firebaseUser.email}</strong>, pero este correo aún no está autorizado en la terminal de Barbachu.
          </p>
          <p className="text-xs text-[#e8d090]">
            Solicita al administrador (<strong>{BOOTSTRAPPED_ADMIN_EMAIL}</strong>) agregar tu correo en <i>Administración → Gestión de Empleados</i>.
          </p>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => void handleGoogleSignOut()}
              className="w-full min-h-[44px] py-2.5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] active:scale-[0.98] text-[#0a0a0b] font-bold text-xs transition-all duration-150"
            >
              Cambiar cuenta de Google
            </button>
            {onSwitchToMenu && (
              <button
                type="button"
                onClick={onSwitchToMenu}
                className="w-full min-h-[44px] py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.98] text-white border border-white/10 text-xs font-semibold transition-all duration-150 inline-flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Ir al Menú Digital Público
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-app">
      {/* Sidebar Desktop */}
      <aside className="pos-sidebar">
        <div>
          <div className="pos-brand">
            <BarbachuLogo className="w-10 h-auto drop-shadow-[0_0_12px_rgba(200,168,75,0.3)]" />
            <div>
              <h1>BARBACHU</h1>
              <p>Restaurante Bar · POS</p>
            </div>
          </div>

          <nav className="pos-nav">
            <button
              type="button"
              className={`pos-nav-btn ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => setView('dashboard')}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" /> Resumen General
            </button>
            {canViewPos && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'pos' ? 'active' : ''}`}
                onClick={() => setView('pos')}
              >
                <Receipt className="w-4 h-4 shrink-0" /> Comandero POS
              </button>
            )}
            {canViewTables && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'tables' ? 'active' : ''}`}
                onClick={() => setView('tables')}
              >
                <UtensilsCrossed className="w-4 h-4 shrink-0" /> Mapa de Mesas
                {totalOccupiedTables > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#d4af37] text-black font-bold tabular-nums">
                    {totalOccupiedTables}
                  </span>
                )}
              </button>
            )}
            {canViewKitchen && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'kitchen' ? 'active' : ''}`}
                onClick={() => setView('kitchen')}
              >
                <Flame className="w-4 h-4 shrink-0" /> Cocina & Barra KDS
                {openOrders.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#e05252] text-white font-bold tabular-nums">
                    {openOrders.length}
                  </span>
                )}
              </button>
            )}
            {canViewCash && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'cash' ? 'active' : ''}`}
                onClick={() => setView('cash')}
              >
                <DollarSign className="w-4 h-4 shrink-0" /> Caja & Cobros
              </button>
            )}
            {canViewInventory && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'inventory' ? 'active' : ''}`}
                onClick={() => setView('inventory')}
              >
                <Package className="w-4 h-4 shrink-0" /> Control de Inventario
                {lowStockItems.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-[#e05252] text-white font-bold tabular-nums" title={`${lowStockItems.length} insumos con stock bajo`}>
                    {lowStockItems.length}
                  </span>
                )}
              </button>
            )}
            {canViewReports && (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'reports' ? 'active' : ''}`}
                onClick={() => setView('reports')}
              >
                <BarChart3 className="w-4 h-4 shrink-0" /> Reportes de Venta
              </button>
            )}
            {canViewAdmin ? (
              <button
                type="button"
                className={`pos-nav-btn ${view === 'admin' ? 'active' : ''}`}
                onClick={handleNavigateToAdmin}
              >
                <Settings className="w-4 h-4 shrink-0" /> Administración & Personal
              </button>
            ) : (
              <button
                type="button"
                className="pos-nav-btn opacity-75 hover:opacity-100"
                onClick={handleNavigateToAdmin}
              >
                <Lock className="w-4 h-4 shrink-0 text-[#c8a84b]" /> Administración (PIN Admin)
              </button>
            )}
          </nav>
        </div>

        <div className="pt-4 border-t border-white/10 space-y-2.5">
          <PWAInstallButton />
          {onSwitchToMenu && (
            <button
              type="button"
              className="w-full min-h-[44px] py-2 px-3 rounded-2xl border border-[#d4af37]/35 bg-[#1a1b1f] text-[#eed889] text-xs font-bold hover:bg-[#d4af37]/15 transition-colors flex items-center justify-center gap-2"
              onClick={onSwitchToMenu}
            >
              <BookOpen className="w-4 h-4" /> Ver Menú de Clientes
            </button>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleOpenUserSwitcher}
              className="flex-1 min-h-[44px] flex items-center gap-2.5 px-2.5 py-1.5 bg-[#16191f] rounded-2xl border border-white/10 hover:border-[#d4af37]/60 transition-colors text-left min-w-0"
              title="Cambiar usuario con PIN"
            >
              <div className="w-8 h-8 rounded-full bg-[#173c34] text-[#eed889] font-bold text-xs flex items-center justify-center border border-[#d4af37]/40 shrink-0">
                {state.activeUser.avatar}
              </div>
              <div className="overflow-hidden min-w-0">
                <div className="text-xs font-bold text-white truncate">{state.activeUser.name}</div>
                <div className="text-xs text-[#8b92a0] uppercase">{state.activeUser.role} · Cambiar</div>
              </div>
            </button>
            <button
              type="button"
              onClick={handleLockSession}
              aria-label="Bloquear terminal"
              title="Bloquear sesión con PIN"
              className="w-11 min-h-[44px] rounded-2xl bg-[#16191f] border border-white/10 hover:border-[#d4af37]/60 text-[#eed889] flex items-center justify-center transition-colors shrink-0"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
          <div className="px-2.5 py-2 rounded-2xl bg-[#16191f] border border-white/10 flex items-center justify-between gap-2 text-xs">
            <span className="text-[#8b92a0] truncate flex items-center gap-1.5" title={firebaseUser.email || ''}>
              <Cloud className="w-3.5 h-3.5 text-[#25d366] shrink-0" />
              <span className="truncate">{firebaseUser.email}</span>
            </span>
            <button
              type="button"
              onClick={() => void handleGoogleSignOut()}
              className="text-[#e05252] hover:underline font-bold shrink-0 inline-flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Salir
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pos-main">
        {/* Top Operational Bar */}
        <header className="pos-topbar">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setIsNavDrawerOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors shrink-0"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="w-5 h-5 text-[#c8a84b]" />
            </button>
            <h2 className="truncate">
              <span key={view}>
                {view === 'dashboard'
                  ? 'Resumen Operativo'
                  : view === 'pos'
                  ? 'Punto de Venta · Comandas'
                  : view === 'tables'
                  ? 'Salón & Barra · Estado de Ubicaciones'
                  : view === 'kitchen'
                  ? 'Comandero de Cocina & Barra (KDS)'
                  : view === 'cash'
                  ? 'Control de Caja & Movimientos'
                  : view === 'inventory'
                  ? 'Inventario de Insumos SoftRestaurant'
                  : view === 'reports'
                  ? 'Reportes & Estadísticas de Ventas'
                  : 'Administración · Catálogo y Personal'}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[34px] ${
                isOnline
                  ? 'bg-[#122822] hover:bg-[#122822]/80 text-[#25d366] border-[#25d366]/30'
                  : 'bg-[#e5a43b]/15 hover:bg-[#e5a43b]/25 text-[#eed889] border-[#e5a43b]/40'
              }`}
              title="Gestionar Conexión de Dispositivos y Estaciones"
              aria-label="Conectividad de dispositivos y sincronización"
            >
              {isOnline ? <Cloud className="w-3.5 h-3.5 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
              <span className="hidden sm:inline">{isOnline ? 'SYNC CLOUD' : 'MODO OFFLINE'}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-black/35 text-[10px] font-mono tabular-nums">
                {terminals.filter((t) => t.online).length || 1}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <span className="hidden md:inline-block text-xs font-mono tabular-nums text-[#8b92a0]">
              {new Date(nowMs).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {onSwitchToMenu && (
              <button
                type="button"
                onClick={onSwitchToMenu}
                className="min-h-[44px] px-3 py-1.5 rounded-xl border border-[#d4af37]/50 text-[#eed889] bg-[#1e222b] text-xs font-bold hover:bg-[#d4af37]/20 transition-all sm:hidden inline-flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" /> Menú
              </button>
            )}
            <button
              type="button"
              onClick={handleLockSession}
              aria-label="Bloquear pantalla"
              className="min-h-[44px] px-3 py-1.5 rounded-2xl bg-[#1e222b]/90 border border-white/10 text-xs font-semibold text-[#eed889] hover:border-[#d4af37]/60 inline-flex items-center gap-1.5 transition-colors"
              title="Bloquear pantalla con PIN"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Bloquear</span>
            </button>
            <button
              type="button"
              onClick={handleOpenUserSwitcher}
              className="min-h-[44px] flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#1e222b]/90 border border-white/10 text-xs font-semibold text-white hover:border-[#d4af37]/60 transition-colors"
              title="Cambiar usuario activo con PIN"
            >
              <span className="w-6 h-6 rounded-full bg-[#173c34] text-[#eed889] text-xs font-bold flex items-center justify-center">
                {state.activeUser.avatar}
              </span>
              <span className="hidden sm:inline">{state.activeUser.name.split(' ')[0]}</span>
              <ArrowRightLeft className="w-3 h-3 text-[#d4af37]" />
            </button>
          </div>
        </header>

        {/* View Switcher Container */}
        <div className="pos-content">
          {/* VIEW 1: DASHBOARD */}
          {view === 'dashboard' && (
            <div className="space-y-6">
              {/* Authenticated Employee Session & Role Permissions Card */}
              <div className="p-5 ios-glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-[#173c34] border border-[#c8a84b]/45 text-[#e8d090] font-bold text-sm flex items-center justify-center shrink-0">
                    {state.activeUser.avatar}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em] truncate">
                        {state.activeUser.name}
                      </h3>
                      <span className="text-xs font-semibold text-[#25d366] inline-flex items-center gap-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sesión PIN Firestore
                      </span>
                    </div>
                    <p className="text-xs text-[#e8d090] font-medium">
                      {ROLE_LABELS[activeRole]} · {state.activeUser.area || 'General'}
                    </p>
                    <p className="text-xs text-[rgba(240,230,211,0.68)] leading-relaxed">
                      Funciones habilitadas: {describeRoleCapabilities(activeRole, activePerms).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenUserSwitcher}
                    className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] active:scale-[0.98] text-[#0a0a0b] font-bold text-xs inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
                  >
                    <UserCheck className="w-4 h-4" /> Cambiar Empleado (PIN)
                  </button>
                  <button
                    type="button"
                    onClick={handleLockSession}
                    className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.98] border border-white/10 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
                  >
                    <Lock className="w-4 h-4 text-[#e8d090]" /> Bloquear Terminal
                  </button>
                </div>
              </div>

              {/* Daily Sales Summary Card based on Firestore documents */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
                <div className="p-5 ios-glass-card space-y-2 border-[#25d366]/25">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8b92a0] uppercase tracking-wider">
                    <span>Ventas Totales de Hoy</span>
                    <DollarSign className="w-4 h-4 text-[#25d366]" />
                  </div>
                  <div className="font-serif font-bold text-3xl text-white">
                    {formatMoney(todaySalesCents)}
                  </div>
                  <div className="text-xs text-[#25d366] font-semibold">
                    {isOnline ? 'En vivo desde Firestore' : 'Caché local offline'} · {todaySalesCount} tickets pagados
                  </div>
                </div>

                <div className="p-5 ios-glass-card space-y-2 border-[#c8a84b]/25">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8b92a0] uppercase tracking-wider">
                    <span>Comandas Registradas Hoy</span>
                    <Receipt className="w-4 h-4 text-[#c8a84b]" />
                  </div>
                  <div className="font-serif font-bold text-3xl text-white">
                    {todayOrdersCount}
                  </div>
                  <div className="text-xs text-[#e8d090] font-semibold">
                    Total de cuentas procesadas en la jornada
                  </div>
                </div>

                <div className="p-5 ios-glass-card space-y-2 border-white/15">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8b92a0] uppercase tracking-wider">
                    <span>Turno Actual de Caja</span>
                    <Clock className="w-4 h-4 text-[#e8d090]" />
                  </div>
                  <div className="font-serif font-bold text-3xl text-white">
                    {state.shift.isOpen ? formatMoney(state.shift.expectedCashCents) : 'Turno Cerrado'}
                  </div>
                  <div className="text-xs text-[#eed889] font-semibold">
                    {state.shift.isOpen ? 'Efectivo esperado en caja' : 'Sin turno abierto'}
                  </div>
                </div>
              </div>

              {/* Critical Inventory Alert Banner if low stock exists */}
              {canViewInventory && lowStockItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#e05252]/20 via-[#1e222b] to-[#16191f] border border-[#e05252]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e05252]/20 text-[#e05252] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Alerta de Inventario Crítico</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#e05252] text-white tabular-nums">
                          {lowStockItems.length} insumo{lowStockItems.length > 1 ? 's' : ''} bajo mínimo
                        </span>
                      </h4>
                      <p className="text-xs text-[#eed889] mt-0.5">
                        Insumos en nivel bajo:{' '}
                        {lowStockItems.slice(0, 4).map((i) => `${i.descripcion} (${i.stock} ${i.unidad})`).join(', ')}
                        {lowStockItems.length > 4 ? ` y ${lowStockItems.length - 4} más...` : '.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setView('inventory');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#e05252] hover:bg-[#c93b3b] text-white text-xs font-bold transition-all shadow-md whitespace-nowrap"
                  >
                    Ver Insumos en Alerta →
                  </button>
                </div>
              )}

              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 tabular-nums">
                <div className="p-5 ios-glass-card">
                  <div className="text-xs uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold mb-1.5">Ventas del Día</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#e8d090]">
                    {canViewCash || canViewReports ? formatMoney(totalSalesCents) : `${state.sales.length} cobros`}
                  </div>
                  <div className="text-xs text-[rgba(240,230,211,0.58)] mt-1">
                    {canViewCash || canViewReports ? `${state.sales.length} cobros registrados` : 'Resumen de turno'}
                  </div>
                </div>
                <div className="p-5 ios-glass-card">
                  <div className="text-xs uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold mb-1.5">Cuentas Abiertas</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-white">{openOrders.length}</div>
                  <div className="text-xs text-[rgba(240,230,211,0.58)] mt-1">{totalOccupiedTables} ubicaciones</div>
                </div>
                <div className="p-5 ios-glass-card">
                  <div className="text-xs uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold mb-1.5">Ocupación Salón</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#25d366]">
                    {openOrders.filter((o) => o.service === 'mesa').length} / 8
                  </div>
                  <div className="text-xs text-[rgba(240,230,211,0.58)] mt-1">Mesas en servicio</div>
                </div>
                <div className="p-5 ios-glass-card">
                  <div className="text-xs uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold mb-1.5">Pendientes KDS</div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold text-[#e05252]">
                    {openOrders.filter((o) => ['sent', 'preparing'].includes(o.status)).length}
                  </div>
                  <div className="text-xs text-[rgba(240,230,211,0.58)] mt-1">En cocina y barra</div>
                </div>
              </div>

              {/* Quick Actions & Recent Activity (role-gated) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick actions tailored to role */}
                <div className="p-6 ios-glass-card space-y-3">
                  <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em] mb-4">
                    Accesos Rápidos · {ROLE_LABELS[activeRole]}
                  </h3>

                  {canViewPos && (
                    <button
                      type="button"
                      onClick={() => {
                        startNewAccount();
                        setView('pos');
                      }}
                      className="w-full min-h-[56px] flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-[#173c34] text-[#e8d090] flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Nueva Comanda en Comandero</div>
                          <div className="text-xs text-[rgba(240,230,211,0.62)]">Captura rápida de {state.products.length} productos</div>
                        </div>
                      </div>
                      <span className="text-sm text-[#c8a84b] font-bold">→</span>
                    </button>
                  )}

                  {canViewTables && (
                    <button
                      type="button"
                      onClick={() => setView('tables')}
                      className="w-full min-h-[56px] flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-[#e8d090] flex items-center justify-center shrink-0">
                          <UtensilsCrossed className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Mapa de Mesas y Barra</div>
                          <div className="text-xs text-[rgba(240,230,211,0.62)]">Zonas, tiempos de estancia y acción en 1 toque</div>
                        </div>
                      </div>
                      <span className="text-sm text-[#c8a84b] font-bold">→</span>
                    </button>
                  )}

                  {canViewKitchen && (
                    <button
                      type="button"
                      onClick={() => setView('kitchen')}
                      className="w-full min-h-[56px] flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-[#e5a43b]/15 text-[#e5a43b] flex items-center justify-center shrink-0">
                          <Flame className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Cocina & Barra (KDS)</div>
                          <div className="text-xs text-[rgba(240,230,211,0.62)]">Tablero en vivo de preparación y entregas</div>
                        </div>
                      </div>
                      <span className="text-sm text-[#c8a84b] font-bold">→</span>
                    </button>
                  )}

                  {canViewCash && (
                    <button
                      type="button"
                      onClick={() => setView('cash')}
                      className="w-full min-h-[56px] flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-[#25d366]/15 text-[#25d366] flex items-center justify-center shrink-0">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Cobrar Cuenta & Corte de Caja</div>
                          <div className="text-xs text-[rgba(240,230,211,0.62)]">Efectivo, tarjeta, arqueo de turno e imprimir tickets</div>
                        </div>
                      </div>
                      <span className="text-sm text-[#c8a84b] font-bold">→</span>
                    </button>
                  )}

                  {canViewAdmin && (
                    <button
                      type="button"
                      onClick={handleNavigateToAdmin}
                      className="w-full min-h-[56px] flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-[#c8a84b]/15 text-[#e8d090] flex items-center justify-center shrink-0">
                          <Settings className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Administración, Precios y Empleados</div>
                          <div className="text-xs text-[#e8d090]">Solo rol Administrador · Catálogo y personal</div>
                        </div>
                      </div>
                      <span className="text-sm text-[#c8a84b] font-bold">→</span>
                    </button>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="p-6 ios-glass-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Comandas Activas en Sala</h3>
                    <span className="text-xs text-[rgba(240,230,211,0.62)] tabular-nums">{openOrders.length} pendientes</span>
                  </div>
                  {openOrders.length === 0 ? (
                    <div className="text-center py-12 text-[rgba(240,230,211,0.58)] text-sm">
                      No hay comandas activas en este momento.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                      <AnimatePresence initial={false}>
                        {openOrders.slice().reverse().map((order, idx) => (
                          <motion.div
                            key={order.id}
                            layout
                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            whileTap={{ scale: 0.985 }}
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 32,
                              delay: Math.min(idx * 0.02, 0.12),
                            }}
                            onClick={() => {
                              if (canViewPos) {
                                loadOrderIntoDraft(order);
                              } else if (canViewCash) {
                                setPayOrderId(order.id);
                                setView('cash');
                              } else if (canViewKitchen) {
                                setView('kitchen');
                              }
                            }}
                            className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-[#c8a84b]/60 cursor-pointer transition-colors duration-150"
                          >
                            <div>
                              <div className="text-sm font-bold text-white flex items-center gap-2 tabular-nums">
                                <span>Cuenta #{order.number}</span>
                                <span className="text-xs text-[#e8d090]">· {locationLabel(order.service, order.location)}</span>
                                {order.priority === 'alta' && (
                                  <span className="px-1.5 py-0.5 rounded-lg text-xs bg-[#e05252] text-white font-bold">ALTA</span>
                                )}
                              </div>
                              <div className="text-xs text-[rgba(240,230,211,0.62)] mt-0.5 tabular-nums">
                                {order.waiter} · {order.items.reduce((s, i) => s + i.qty, 0)} productos · {formatElapsedTime(order.createdAt, nowMs)}
                              </div>
                            </div>
                            <div className="text-right tabular-nums">
                              <div className="font-mono font-bold text-sm text-[#e8d090]">{formatMoney(order.totalCents)}</div>
                              <span className="text-xs font-bold text-[rgba(240,230,211,0.58)] uppercase">{order.status}</span>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              {/* POS Operations Dashboard: Inventory Levels & Sales Trends (Recharts) */}
              <div className="pt-2">
                <Suspense fallback={<div className="p-8 text-center text-[#d4af37]">Cargando panel operativo...</div>}>
                  <PosDashboardPanel
                    state={state}
                    canViewInventory={canViewInventory}
                    canViewPos={canViewPos}
                    onOpenInventory={() => setView('inventory')}
                    onOpenPos={() => setView('pos')}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* VIEW 2: FAST iOS COMANDERO */}
          {view === 'pos' && (
            <div className="space-y-4 pb-20 xl:pb-4">
              {/* iOS 1-Tap Service & Location Selector Bar */}
              <div className="p-4 ios-glass-card space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Segmented Service Type Pills */}
                  <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 overflow-x-auto">
                    {(
                      [
                        { id: 'mesa', label: 'Salón (Mesa)' },
                        { id: 'barra_exterior', label: 'Terraza' },
                        { id: 'barra_interior', label: 'Barra Int.' },
                        { id: 'para_llevar', label: 'Para Llevar' },
                        { id: 'domicilio', label: 'Domicilio' },
                      ] as const
                    ).map((svc) => (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => {
                          setCurrentService(svc.id);
                          const opts = locationOptions(svc.id);
                          const firstLoc = opts[0].value;
                          setCurrentTable(firstLoc);
                          const existing = state.orders.find(
                            (o) => o.status !== 'closed' && o.service === svc.id && String(o.location) === firstLoc
                          );
                          if (existing) {
                            loadOrderIntoDraft(existing);
                          } else {
                            setCurrentOrderId(null);
                            setCart([]);
                          }
                        }}
                        className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          currentService === svc.id
                            ? 'bg-[#c8a84b] text-[#0a0a0b]'
                            : 'text-[rgba(240,230,211,0.72)] hover:text-white'
                        }`}
                      >
                        {svc.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick Open-Accounts Jump Strip */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                    <button
                      type="button"
                      onClick={startNewAccount}
                      className={`flex-none min-h-[40px] px-3.5 py-1.5 rounded-2xl border text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        !currentOrderId
                          ? 'bg-[#173c34] text-[#e8d090] border-[#c8a84b]'
                          : 'bg-white/[0.04] text-[#e8d090] border-white/15 hover:border-[#c8a84b]'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" /> Nueva Cuenta
                    </button>
                    {openOrders.map((o) => {
                      const active = currentOrderId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => loadOrderIntoDraft(o)}
                          className={`flex-none min-h-[40px] px-3 py-1.5 rounded-2xl border text-xs transition-colors flex items-center gap-1.5 tabular-nums whitespace-nowrap ${
                            active
                              ? 'bg-[#173c34] border-[#25d366]/70 text-white font-bold shadow-md'
                              : 'bg-white/[0.04] border-white/10 text-[#f0e6d3] hover:border-[#c8a84b]/60'
                          }`}
                        >
                          <span className="font-bold">#{o.number}</span>
                          <span className="text-[rgba(240,230,211,0.55)]">·</span>
                          <span>{locationLabel(o.service, o.location)}</span>
                          <span className="font-mono font-bold text-[#e8d090]">{formatMoney(o.totalCents)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1-Tap Clickable Locations Grid for Selected Service */}
                <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
                  {locationOptions(currentService).map((opt) => {
                    const locOrders = state.orders.filter(
                      (o) => o.status !== 'closed' && o.service === currentService && String(o.location) === opt.value
                    );
                    const isSelectedLoc = String(currentTable) === opt.value;
                    const locSum = locOrders.reduce((s, o) => s + o.totalCents, 0);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setCurrentTable(opt.value);
                          if (locOrders.length > 0) {
                            loadOrderIntoDraft(locOrders[0]);
                          } else {
                            setCurrentOrderId(null);
                            setCart([]);
                          }
                        }}
                        className={`flex-none min-h-[44px] px-3.5 py-1.5 rounded-2xl border text-xs transition-all flex items-center gap-2 tabular-nums whitespace-nowrap ${
                          isSelectedLoc
                            ? 'bg-[#c8a84b]/20 border-[#c8a84b] text-white font-bold'
                            : locOrders.length > 0
                            ? 'bg-[#173c34]/50 border-[#25d366]/40 text-white hover:border-[#c8a84b]'
                            : 'bg-[#0a0a0b]/55 border-white/10 text-[rgba(240,230,211,0.72)] hover:border-white/30'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {locOrders.length > 0 ? (
                          <span className="font-mono font-bold text-[#25d366]">{formatMoney(locSum)}</span>
                        ) : (
                          <span className="text-xs text-[rgba(240,230,211,0.45)]">Libre</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Split Layout: Fast Catalog + CategorySidebar (Left) + Sticky Comandero Cart (Right) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Product catalog column */}
                <div className="xl:col-span-8 space-y-4 min-w-0">
                  {/* Search Bar */}
                  <div className="p-3.5 ios-glass-card">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar platillo, bebida o clave (ej. 701, 729)..."
                        aria-label="Buscar producto en catálogo POS"
                        className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-sm text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
                      />
                      <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[rgba(240,230,211,0.55)]" />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Limpiar búsqueda"
                          className="absolute right-2 top-1.5 w-8 h-8 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.55)] hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick-Fire Favorites Strip ("Más Pedidos") */}
                  {quickFireProducts.length > 0 && !searchQuery && (
                    <div className="p-4 ios-glass-card space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs uppercase tracking-[0.06em] font-bold text-[#e8d090] inline-flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" /> Más Pedidos (1 Toque)
                        </span>
                        <span className="text-xs text-[rgba(240,230,211,0.52)]">Acceso instantáneo</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {quickFireProducts.map((qp) => {
                          const qtyInCart = cartQtyMap.get(qp.key) || 0;
                          return (
                            <button
                              key={qp.key}
                              type="button"
                              onClick={() => handleAddProduct(qp)}
                              className={`flex-none min-h-[54px] px-3.5 py-2 rounded-2xl border text-left transition-all active:scale-[0.97] ${
                                qtyInCart > 0
                                  ? 'bg-[#173c34]/85 border-[#c8a84b] text-white'
                                  : 'bg-white/[0.04] border-white/10 hover:border-[#c8a84b]/60 text-white'
                              }`}
                            >
                              <div className="text-xs font-bold truncate max-w-[140px]">
                                {qtyInCart > 0 && <span className="text-[#25d366] mr-1 tabular-nums">×{qtyInCart}</span>}
                                {qp.name}
                              </div>
                              <div className="text-xs font-mono font-bold text-[#e8d090] tabular-nums mt-0.5">
                                {formatMoney(qp.priceCents)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hierarchical CategorySidebar + Auto-Layout CSS Grid */}
                  <div className="flex flex-col md:flex-row gap-4 items-start min-w-0">
                    <CategorySidebar
                      hierarchy={catalogTree}
                      selectedCategory={selectedMainCategory}
                      selectedSubcategory={selectedSubcategory}
                      selectedGroup={selectedGroupFilter}
                      onSelectCategory={(cat) => {
                        setSelectedMainCategory(cat);
                        setSelectedSubcategory('Todas');
                        setSelectedGroupFilter('Todos');
                      }}
                      onSelectSubcategory={(sub) => {
                        setSelectedSubcategory(sub);
                        setSelectedGroupFilter('Todos');
                      }}
                      onSelectGroup={(grp) => setSelectedGroupFilter(grp)}
                      stationFilter={posStationFilter}
                      onChangeStationFilter={setPosStationFilter}
                      totalCatalogCount={saleableCatalogProducts.length}
                      searchActive={Boolean(searchQuery.trim())}
                      onClearSearch={() => setSearchQuery('')}
                    />

                    <div className="flex-1 w-full min-w-0 p-3.5 sm:p-4 ios-glass-card">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-[rgba(240,230,211,0.68)]">
                        <span className="font-semibold truncate min-w-0">
                          {searchQuery.trim()
                            ? `Búsqueda: "${searchQuery.trim()}" (${filteredProducts.length})`
                            : `${selectedMainCategory}${
                                selectedSubcategory !== 'Todas' ? ` › ${selectedSubcategory}` : ''
                              }${selectedGroupFilter !== 'Todos' ? ` › ${selectedGroupFilter}` : ''} (${filteredProducts.length})`}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          {(selectedSubcategory !== 'Todas' || selectedGroupFilter !== 'Todos' || searchQuery.trim()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setSelectedSubcategory('Todas');
                                setSelectedGroupFilter('Todos');
                              }}
                              className="text-xs font-bold text-[#25d366] hover:underline"
                            >
                              Ver toda {selectedMainCategory}
                            </button>
                          )}
                          {canViewAdmin && (
                            <button
                              type="button"
                              onClick={handleNavigateToAdmin}
                              className="text-[#e8d090] hover:underline font-semibold inline-flex items-center gap-1"
                            >
                              <Settings className="w-3.5 h-3.5" /> Administrar
                            </button>
                          )}
                        </div>
                      </div>

                      {filteredProducts.length === 0 ? (
                        <div className="py-16 text-center text-[rgba(240,230,211,0.58)] text-sm">
                          {searchQuery.trim()
                            ? `No se encontraron productos con "${searchQuery}".`
                            : 'No hay productos en este grupo con el filtro de estación actual.'}
                        </div>
                      ) : (
                        <div className="pos-product-grid">
                          {filteredProducts.map((p, idx) => {
                            const qtyInCart = cartQtyMap.get(p.key) || 0;
                            return (
                              <motion.div
                                key={p.key}
                                role="button"
                                tabIndex={p.saleEnabled ? 0 : -1}
                                aria-label={`Agregar ${p.name}`}
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                whileTap={p.saleEnabled ? { scale: 0.96 } : undefined}
                                transition={{
                                  type: 'spring',
                                  stiffness: 450,
                                  damping: 32,
                                  delay: Math.min(idx * 0.01, 0.12),
                                }}
                                onClick={() => handleAddProduct(p)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleAddProduct(p);
                                  }
                                }}
                                className={`pos-prod-card ${!p.saleEnabled ? 'opacity-40 cursor-not-allowed' : ''} ${
                                  qtyInCart > 0 ? '!border-[#c8a84b] ring-1 ring-[#c8a84b]/40' : ''
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="prod-key flex-1 min-w-0">
                                      {p.key} · {p.category}
                                    </span>
                                    {qtyInCart > 0 && (
                                      <span className="text-xs font-mono font-bold text-[#25d366] tabular-nums shrink-0">
                                        ×{qtyInCart}
                                      </span>
                                    )}
                                  </div>
                                  <div className="prod-name">{p.name}</div>
                                </div>
                                <div className="mt-auto pt-2 border-t border-white/10 space-y-1.5">
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="prod-price truncate">
                                      {p.saleEnabled ? formatMoney(p.priceCents) : 'Sin precio'}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {qtyInCart > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDecrementProductByKey(p.key);
                                          }}
                                          aria-label={`Quitar uno de ${p.name}`}
                                          className="w-7 h-7 rounded-lg bg-[#e05252]/20 hover:bg-[#e05252] text-[#e05252] hover:text-white font-bold flex items-center justify-center transition-colors"
                                        >
                                          <Minus className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <span className="w-7 h-7 rounded-lg bg-[#173c34] text-[#25d366] font-bold flex items-center justify-center text-xs">
                                        +
                                      </span>
                                    </div>
                                  </div>
                                  {p.saleEnabled && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenNewProductModifiers(p);
                                      }}
                                      aria-label={`Modificar ${p.name}`}
                                      title="Agregar con modificadores"
                                      className="w-full min-h-[30px] px-2 rounded-xl bg-[#c8a84b]/15 hover:bg-[#c8a84b] text-[#e8d090] hover:text-[#0a0a0b] border border-[#c8a84b]/35 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <Tag className="w-3 h-3 shrink-0" /> Modificar
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order builder / Sticky Cart sidebar */}
                <div
                  id="pos-comanda-panel"
                  className="xl:col-span-4 xl:sticky xl:top-20 p-5 ios-glass-card space-y-4 min-w-0"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                        {currentOrderId ? `Cuenta #${selectedOrder?.number || ''}` : 'Nueva Comanda'}
                      </h3>
                      <p className="text-xs text-[#e8d090] font-medium">
                        {locationLabel(currentService, currentTable)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={startNewAccount}
                        className="min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10"
                        title="Crear nueva cuenta independiente"
                      >
                        + Nueva
                      </button>
                      {cart.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCart([])}
                          className="min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold bg-[#e05252]/15 text-[#e05252] hover:bg-[#e05252]/25"
                        >
                          Vaciar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Account switcher in location if multiple accounts exist */}
                  {currentLocOrders.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      <button
                        type="button"
                        onClick={startNewAccount}
                        className={`flex-none min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                          !currentOrderId
                            ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
                            : 'bg-white/[0.04] text-[#e8d090] border-white/10'
                        }`}
                      >
                        + Nueva aquí
                      </button>
                      {currentLocOrders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => loadOrderIntoDraft(o)}
                          className={`flex-none min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold border tabular-nums transition-colors ${
                            currentOrderId === o.id
                              ? 'bg-[#173c34] text-white border-[#25d366]'
                              : 'bg-white/[0.04] text-[#f0e6d3] border-white/10'
                          }`}
                        >
                          #{o.number} · {formatMoney(o.totalCents)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Waiter & 1-Tap Priority */}
                  <div className="grid grid-cols-12 gap-2 text-xs">
                    <div className="col-span-7">
                      <label className="block text-[rgba(240,230,211,0.58)] mb-1 font-semibold">Mesero / Atiende</label>
                      <input
                        type="text"
                        value={waiter}
                        onChange={(e) => setWaiter(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                      />
                    </div>
                    <div className="col-span-5">
                      <label className="block text-[rgba(240,230,211,0.58)] mb-1 font-semibold">Prioridad</label>
                      <button
                        type="button"
                        onClick={() => setPriority((p) => (p === 'normal' ? 'alta' : 'normal'))}
                        className={`w-full min-h-[42px] px-3 py-1.5 rounded-2xl border font-bold text-xs transition-all flex items-center justify-center gap-1 ${
                          priority === 'alta'
                            ? 'bg-[#e05252]/20 border-[#e05252] text-[#e05252]'
                            : 'bg-[#0a0a0b]/70 border-white/10 text-[#f0e6d3]'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        {priority === 'alta' ? 'ALTA' : 'Normal'}
                      </button>
                    </div>
                  </div>

                  {/* Domicilio customer data fields if delivery service is chosen */}
                  {currentService === 'domicilio' && (
                    <div className="p-3 bg-[#0a0a0b]/60 rounded-2xl border border-white/10 space-y-2 text-xs">
                      <div className="font-bold text-[#e8d090]">Datos de Entrega a Domicilio</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Nombre del cliente *"
                          value={deliveryData.name}
                          onChange={(e) => setDeliveryData((prev) => ({ ...prev, name: e.target.value }))}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-white"
                        />
                        <input
                          placeholder="Teléfono *"
                          value={deliveryData.phone}
                          onChange={(e) => setDeliveryData((prev) => ({ ...prev, phone: e.target.value }))}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-white"
                        />
                      </div>
                      <input
                        placeholder="Dirección completa y calle *"
                        value={deliveryData.address}
                        onChange={(e) => setDeliveryData((prev) => ({ ...prev, address: e.target.value }))}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-white"
                      />
                      <input
                        placeholder="Referencia (ej. Portón negro, entre calle X e Y)"
                        value={deliveryData.reference}
                        onChange={(e) => setDeliveryData((prev) => ({ ...prev, reference: e.target.value }))}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-white"
                      />
                    </div>
                  )}

                  {/* Cart items list */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="py-10 text-center text-[rgba(240,230,211,0.5)] text-xs">
                        Toca productos del catálogo para armar la comanda.
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {cart.map((item, idx) => {
                          const targetId = item.lineId || item.key;
                          return (
                            <motion.div
                              key={item.lineId || `${item.key}-${idx}`}
                              layout
                              initial={{ opacity: 0, y: 10, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -18, scale: 0.95 }}
                              transition={{ type: 'spring', stiffness: 440, damping: 30 }}
                              className="p-3 rounded-2xl bg-[#0a0a0b]/55 border border-white/10 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white leading-snug">{item.name}</div>
                                  <div className="text-xs text-[rgba(240,230,211,0.58)] tabular-nums mt-0.5">
                                    {modifiersTotalCents(item) > 0
                                      ? `${formatMoney(item.priceCents)} + ${formatMoney(modifiersTotalCents(item))} extras = ${formatMoney(unitTotalCents(item))} c/u`
                                      : `${formatMoney(item.priceCents)} c/u`}{' '}
                                    · {(item.station || 'cocina').toUpperCase()}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQty(targetId, -1)}
                                    aria-label={`Restar uno de ${item.name}`}
                                    className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white font-bold flex items-center justify-center"
                                  >
                                    −
                                  </button>
                                  <span className="font-bold text-xs text-white min-w-[20px] text-center tabular-nums">{item.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQty(targetId, 1)}
                                    aria-label={`Sumar uno de ${item.name}`}
                                    className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-white font-bold flex items-center justify-center"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {(item.modifiers || item.modificadores || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(item.modifiers || item.modificadores || []).map((mod, mi) => (
                                    <span key={mi} className="px-2 py-0.5 rounded-lg bg-[#c8a84b]/15 text-[#e8d090] text-[10px] font-semibold border border-[#c8a84b]/30">
                                      {mod.name} {mod.priceCents > 0 ? `(+${formatMoney(mod.priceCents)})` : ''}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {item.note && (
                                <div className="text-xs text-[#e8d090] bg-white/[0.04] px-2.5 py-1 rounded-xl">
                                  Nota: {item.note}
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCartItemModifiers(item, idx)}
                                    className="text-[#c8a84b] hover:underline font-semibold"
                                  >
                                    ⚙️ Modificar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditItemNote(targetId)}
                                    className="text-[rgba(240,230,211,0.68)] hover:text-[#e8d090] font-semibold"
                                  >
                                    {item.note ? 'Editar nota' : '+ Nota'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelItem(targetId)}
                                    className="text-[#e05252] hover:underline font-semibold"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                                <span className="font-mono font-bold text-white tabular-nums">
                                  {formatMoney(lineTotalCents(item))}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </div>

                  {/* General order note */}
                  <div>
                    <input
                      type="text"
                      value={generalNote}
                      onChange={(e) => setGeneralNote(e.target.value)}
                      placeholder="Nota general para cocina o barra..."
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
                    />
                  </div>

                  {/* Subtotals & Total */}
                  <div className="pt-3 border-t border-white/10 space-y-1 text-xs tabular-nums">
                    <div className="flex justify-between text-[rgba(240,230,211,0.62)]">
                      <span>Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} art.)</span>
                      <span>{formatMoney(subtotalCents(cart))}</span>
                    </div>
                    {selectedOrder && selectedOrder.discountCents > 0 && (
                      <div className="flex justify-between text-[#25d366] font-bold">
                        <span>Descuento autorizado</span>
                        <span>- {formatMoney(selectedOrder.discountCents)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-white pt-1">
                      <span>Total a pagar</span>
                      <span className="font-mono text-[#e8d090]">
                        {formatMoney(totalCents(cart, selectedOrder?.discountCents || 0))}
                      </span>
                    </div>
                  </div>

                  {/* Primary Action Button: Send to kitchen */}
                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={handleSendOrder}
                    className="w-full min-h-[48px] py-3.5 rounded-2xl bg-[#173c34] hover:bg-[#28584c] active:scale-[0.98] text-white font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-[#c8a84b]/45 flex items-center justify-center gap-2"
                  >
                    <Flame className="w-4 h-4 text-[#e8d090]" />
                    {currentOrderId ? 'Actualizar Comanda en Cocina/Barra' : 'Enviar Comanda a Cocina/Barra'}
                  </button>

                  {/* Secondary management actions (role-gated) */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <button
                      type="button"
                      onClick={handleMoveTable}
                      className="min-h-[44px] py-2 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-[#e8d090]" /> Mover / Unir
                    </button>
                    <button
                      type="button"
                      onClick={handleSplitOrder}
                      className="min-h-[44px] py-2 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Scissors className="w-3.5 h-3.5 text-[#e8d090]" /> Dividir Cuenta
                    </button>
                    {canApplyDiscount && (
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        className="min-h-[44px] py-2 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-[#e8d090] border border-white/10 font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Tag className="w-3.5 h-3.5" /> Descuento
                      </button>
                    )}
                    {canCancelOrders && (
                      <button
                        type="button"
                        onClick={handleCancelAccount}
                        className="min-h-[44px] py-2 px-3 rounded-2xl bg-[#e05252]/10 hover:bg-[#e05252]/20 text-[#e05252] border border-[#e05252]/25 font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" /> Cancelar Cuenta
                      </button>
                    )}
                  </div>

                  {/* Pay & Pre-check buttons */}
                  {(currentOrderId || cart.length > 0) && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleOpenDraftPreCheck}
                        className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-[#e8d090] font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-4 h-4" /> Pre-cuenta
                      </button>
                      {currentOrderId && canCollectPayment ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayOrderId(currentOrderId);
                            setView('cash');
                          }}
                          className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                          <DollarSign className="w-4 h-4" /> Cobrar en Caja
                        </button>
                      ) : (
                        <div className="flex items-center justify-center text-xs text-[rgba(240,230,211,0.52)] px-2 text-center">
                          {currentOrderId ? 'Cobro exclusivo de Caja' : 'Envía primero para cobrar'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile / Tablet Floating Comanda Summary Bar */}
              {cart.length > 0 && (
                <div className="xl:hidden fixed bottom-[70px] left-3 right-3 z-40 ios-glass-modal px-4 py-2.5 flex items-center justify-between gap-3 border-[#c8a84b]/45">
                  <div className="min-w-0 tabular-nums">
                    <div className="text-xs font-bold text-white truncate">
                      {cart.reduce((s, i) => s + i.qty, 0)} art. · {locationLabel(currentService, currentTable)}
                    </div>
                    <div className="text-sm font-mono font-bold text-[#e8d090]">
                      {formatMoney(totalCents(cart, selectedOrder?.discountCents || 0))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById('pos-comanda-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-2xl bg-white/[0.08] text-white text-xs font-semibold"
                    >
                      Ver Comanda
                    </button>
                    <button
                      type="button"
                      onClick={handleSendOrder}
                      className="min-h-[40px] px-4 py-1.5 rounded-2xl bg-[#25d366] text-[#0a0a0b] text-xs font-bold"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: FAST iOS TABLES MAP */}
          {view === 'tables' && (
            <div className="space-y-5">
              {/* Top Filter & Stats Bar */}
              <div className="p-4 sm:p-5 ios-glass-card space-y-3.5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                      Mapa de Mesas y Barra
                    </h3>
                    <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums mt-0.5">
                      {totalOccupiedTables} ocupadas · {openOrders.filter((o) => o.status === 'ready').length} listas para servir · {formatMoney(openOrders.reduce((s, o) => s + o.totalCents, 0))} acumulado activo
                    </p>
                  </div>

                  {/* Search Table / Waiter / #Order */}
                  <div className="relative w-full md:w-64">
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Buscar mesa, mesero o #..."
                      className="w-full min-h-[42px] pl-9 pr-8 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
                    />
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-[rgba(240,230,211,0.55)]" />
                    {tableSearch && (
                      <button
                        type="button"
                        onClick={() => setTableSearch('')}
                        className="absolute right-2 top-1.5 w-7 h-7 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Zone & Status Segmented Controls */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 overflow-x-auto">
                    {(
                      [
                        { id: 'todas', label: 'Todas las Zonas' },
                        { id: 'mesa', label: 'Salón' },
                        { id: 'barra_exterior', label: 'Terraza' },
                        { id: 'barra_interior', label: 'Barra Int.' },
                        { id: 'para_llevar', label: 'Mostrador' },
                        { id: 'domicilio', label: 'Domicilio' },
                      ] as const
                    ).map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => setTableZoneFilter(z.id)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          tableZoneFilter === z.id
                            ? 'bg-[#c8a84b] text-[#0a0a0b]'
                            : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                        }`}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 shrink-0 overflow-x-auto">
                    {(
                      [
                        { id: 'todas', label: 'Todas' },
                        { id: 'free', label: 'Disponibles' },
                        { id: 'busy', label: 'Ocupadas' },
                        { id: 'ready', label: 'Listas KDS' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setTableStatusFilter(st.id)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          tableStatusFilter === st.id
                            ? 'bg-white/15 text-white'
                            : 'text-[rgba(240,230,211,0.62)] hover:text-white'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {['Salón Principal', 'Barra Exterior', 'Barra Interior', 'Mostrador', 'Reparto'].map((sec) => {
                const q = tableSearch.trim().toLowerCase();
                const locs = tableLocations.filter((t) => {
                  if (tableZoneFilter !== 'todas' && t.service !== tableZoneFilter) return false;
                  if (t.section !== sec) return false;

                  const ordersAtLoc = state.orders.filter(
                    (o) => o.status !== 'closed' && o.service === t.service && String(o.location) === t.loc
                  );
                  const isBusy = ordersAtLoc.length > 0;
                  const hasReady = ordersAtLoc.some((o) => o.status === 'ready');

                  if (tableStatusFilter === 'free' && isBusy) return false;
                  if (tableStatusFilter === 'busy' && !isBusy) return false;
                  if (tableStatusFilter === 'ready' && !hasReady) return false;

                  if (q) {
                    const matchLabel = t.label.toLowerCase().includes(q) || t.section.toLowerCase().includes(q);
                    const matchOrder = ordersAtLoc.some(
                      (o) =>
                        String(o.number).includes(q) ||
                        o.waiter.toLowerCase().includes(q)
                    );
                    if (!matchLabel && !matchOrder) return false;
                  }
                  return true;
                });

                if (locs.length === 0) return null;

                return (
                  <div key={sec} className="space-y-3">
                    <h4 className="text-xs uppercase tracking-[0.08em] font-bold text-[rgba(240,230,211,0.58)] px-1">{sec}</h4>
                    <div className="table-map-grid">
                      {locs.map((loc) => {
                        const ordersAtLoc = state.orders.filter(
                          (o) => o.status !== 'closed' && o.service === loc.service && String(o.location) === loc.loc
                        );
                        const isBusy = ordersAtLoc.length > 0;
                        const hasReady = ordersAtLoc.some((o) => o.status === 'ready');
                        const totalLoc = ordersAtLoc.reduce((sum, o) => sum + o.totalCents, 0);
                        const oldestOrder = ordersAtLoc.reduce<Order | null>((oldest, cur) => {
                          if (!oldest) return cur;
                          return new Date(cur.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? cur : oldest;
                        }, null);

                        const tileStateClass = hasReady ? 'ready' : isBusy ? 'busy' : 'free';

                        return (
                          <div
                            key={`${loc.service}-${loc.loc}`}
                            onClick={() => {
                              if (isBusy) {
                                setTableSheetLoc(loc);
                              } else if (canViewPos) {
                                setCurrentService(loc.service);
                                setCurrentTable(loc.loc);
                                setCurrentOrderId(null);
                                setCart([]);
                                setView('pos');
                                notify(`${loc.label} lista para tomar comanda.`);
                              } else {
                                notify('Esta ubicación está disponible.');
                              }
                            }}
                            className={`table-tile ${tileStateClass}`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-sm text-white truncate">{loc.label}</span>
                                <span
                                  className={`text-xs font-bold uppercase tracking-wide shrink-0 ${
                                    hasReady
                                      ? 'text-[#25d366]'
                                      : isBusy
                                      ? 'text-[#e8d090]'
                                      : 'text-[rgba(240,230,211,0.52)]'
                                  }`}
                                >
                                  {hasReady ? 'Lista' : isBusy ? 'Ocupada' : 'Libre'}
                                </span>
                              </div>

                              <p className="text-xs text-[rgba(240,230,211,0.68)] truncate tabular-nums">
                                {isBusy
                                  ? `${ordersAtLoc.length} cuenta${ordersAtLoc.length > 1 ? 's' : ''} · ${ordersAtLoc[0].waiter.split(' ')[0]}`
                                  : canViewPos
                                  ? 'Tocar para abrir'
                                  : 'Disponible'}
                              </p>

                              {isBusy && oldestOrder && (
                                <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#e8d090] tabular-nums">
                                  <Clock className="w-3 h-3" /> {formatElapsedTime(oldestOrder.createdAt, nowMs)}
                                </div>
                              )}
                            </div>

                            <div className="pt-3 border-t border-white/10 flex items-end justify-between gap-2">
                              <div>
                                <div className="text-xs text-[rgba(240,230,211,0.52)]">Total</div>
                                <div className="font-mono font-bold text-sm text-[#e8d090] tabular-nums">
                                  {isBusy ? formatMoney(totalLoc) : '$0.00'}
                                </div>
                              </div>
                              {isBusy && (
                                <span className="text-xs font-bold text-white/80">Gestionar →</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 4: KITCHEN / KDS */}
          {view === 'kitchen' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 ios-glass-card">
                <div>
                  <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                    Comandero de Producción (KDS)
                  </h3>
                  <p className="text-xs text-[rgba(240,230,211,0.62)]">
                    Avanza cada ticket conforme se prepara y entrega al comensal.
                  </p>
                </div>
                <div className="flex gap-1.5 text-xs p-1 rounded-2xl bg-white/[0.04] border border-white/10">
                  {(['todas', 'cocina', 'barra'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setKitchenStation(st)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold uppercase transition-all duration-150 ${
                        kitchenStation === st
                          ? 'bg-[#c8a84b] text-[#0a0a0b]'
                          : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kanban Columns */}
              <div className="kds-board">
                {/* Column 1: Recibida */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#e5a43b] tracking-tight">
                      RECIBIDAS
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                      {openOrders.filter((o) => o.status === 'sent').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'sent').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en espera</div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {openOrders
                          .filter((o) => o.status === 'sent')
                          .map((order, orderIdx) => (
                            <motion.div
                              key={order.id}
                              layout
                              initial={{ opacity: 0, y: 14, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 30,
                                delay: Math.min(orderIdx * 0.03, 0.15),
                              }}
                              className={`kds-ticket ${order.priority === 'alta' ? 'priority-alta' : ''}`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                    <span>Cuenta #{order.number}</span>
                                    <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                  </div>
                                  <div className="text-xs text-[#8b92a0]">
                                    {order.waiter} · {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                                {order.priority === 'alta' && (
                                  <span className="px-2 py-0.5 rounded text-xs bg-[#e05252] text-white font-bold">ALTA</span>
                                )}
                              </div>

                              <div className="my-3 py-2 border-y border-[#2b303c] space-y-2 text-xs">
                                {order.items
                                  .filter((i) => kitchenStation === 'todas' || (i.station || 'cocina') === kitchenStation)
                                  .map((i, idx) => {
                                    const st = i.itemStatus || 'pending';
                                    const nxt = nextItemStatus(st);
                                    return (
                                      <motion.div
                                        key={i.lineId || `${i.key}-${idx}`}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ type: 'spring', stiffness: 440, damping: 32, delay: Math.min(idx * 0.02, 0.1) }}
                                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#16191f]/70"
                                      >
                                        <div className="min-w-0">
                                          <div className="font-bold text-white truncate">{i.qty} × {i.name}</div>
                                          <div className="text-xs text-[#8b92a0] uppercase">{i.station || 'cocina'} · {st}</div>
                                          {(i.modifiers || i.modificadores || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {(i.modifiers || i.modificadores || []).map((mod, mi) => (
                                                <span key={mi} className="px-1.5 py-0.5 rounded bg-[#c8a84b]/15 text-[#eed889] text-[10px] font-semibold">
                                                  {mod.name}{mod.priceCents > 0 ? ` (+${formatMoney(mod.priceCents)})` : ''}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {i.note && <span className="text-xs text-[#eed889] block">Nota: {i.note}</span>}
                                        </div>
                                        {nxt && (
                                          <button
                                            type="button"
                                            onClick={() => handleAdvanceItemStatus(order.id, i.lineId || i.key, nxt)}
                                            className="px-2 py-1 rounded bg-[#e5a43b]/20 hover:bg-[#e5a43b] hover:text-black text-[#e5a43b] font-bold text-xs shrink-0"
                                          >
                                            ▶ Preparar
                                          </button>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                              </div>

                              {order.note && (
                                <p className="text-xs text-[#8b92a0] mb-3 italic">Nota general: {order.note}</p>
                              )}

                              <button
                                type="button"
                                onClick={() => handleAdvanceOrderStatus(order.id, 'sent')}
                                className="w-full py-2 rounded-xl bg-[#e5a43b] hover:bg-[#d4af37] text-black font-bold text-xs"
                              >
                                ▶ Iniciar Preparación Completa
                              </button>
                            </motion.div>
                          ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>

                {/* Column 2: Preparando */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#3b82f6] tracking-tight">
                      EN PREPARACIÓN
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                      {openOrders.filter((o) => o.status === 'preparing').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'preparing').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en cocción</div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {openOrders
                          .filter((o) => o.status === 'preparing')
                          .map((order, orderIdx) => (
                            <motion.div
                              key={order.id}
                              layout
                              initial={{ opacity: 0, y: 14, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 30,
                                delay: Math.min(orderIdx * 0.03, 0.15),
                              }}
                              className={`kds-ticket ${order.priority === 'alta' ? 'priority-alta' : ''}`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                    <span>Cuenta #{order.number}</span>
                                    <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                  </div>
                                  <div className="text-xs text-[#8b92a0]">
                                    {order.waiter} · {new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>

                              <div className="my-3 py-2 border-y border-[#2b303c] space-y-2 text-xs">
                                {order.items
                                  .filter((i) => kitchenStation === 'todas' || (i.station || 'cocina') === kitchenStation)
                                  .map((i, idx) => {
                                    const st = i.itemStatus || 'pending';
                                    const nxt = nextItemStatus(st);
                                    return (
                                      <motion.div
                                        key={i.lineId || `${i.key}-${idx}`}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ type: 'spring', stiffness: 440, damping: 32, delay: Math.min(idx * 0.02, 0.1) }}
                                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#16191f]/70"
                                      >
                                        <div className="min-w-0">
                                          <div className="font-bold text-white truncate">{i.qty} × {i.name}</div>
                                          <div className="text-xs text-[#8b92a0] uppercase">{i.station || 'cocina'} · {st}</div>
                                          {(i.modifiers || i.modificadores || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {(i.modifiers || i.modificadores || []).map((mod, mi) => (
                                                <span key={mi} className="px-1.5 py-0.5 rounded bg-[#c8a84b]/15 text-[#eed889] text-[10px] font-semibold">
                                                  {mod.name}{mod.priceCents > 0 ? ` (+${formatMoney(mod.priceCents)})` : ''}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {i.note && <span className="text-xs text-[#eed889] block">Nota: {i.note}</span>}
                                        </div>
                                        {nxt && (
                                          <button
                                            type="button"
                                            onClick={() => handleAdvanceItemStatus(order.id, i.lineId || i.key, nxt)}
                                            className="px-2 py-1 rounded bg-[#25d366]/20 hover:bg-[#25d366] hover:text-black text-[#25d366] font-bold text-xs shrink-0"
                                          >
                                            {nxt === 'ready' ? '✓ Listo' : nxt === 'served' ? '🍽️ Servido' : '▶ Preparar'}
                                          </button>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAdvanceOrderStatus(order.id, 'preparing')}
                                className="w-full py-2 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-xs"
                              >
                                ✓ Marcar Estación Lista
                              </button>
                            </motion.div>
                          ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>

                {/* Column 3: Lista / Entregada */}
                <div className="kds-column">
                  <div className="kds-column-header">
                    <span className="font-bold text-sm text-[#25d366] tracking-tight">
                      LISTA PARA ENTREGAR
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                      {openOrders.filter((o) => o.status === 'ready' || o.status === 'served').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {openOrders.filter((o) => o.status === 'ready' || o.status === 'served').length === 0 ? (
                      <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes por servir</div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {openOrders
                          .filter((o) => o.status === 'ready' || o.status === 'served')
                          .map((order, orderIdx) => (
                            <motion.div
                              key={order.id}
                              layout
                              initial={{ opacity: 0, y: 14, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 30,
                                delay: Math.min(orderIdx * 0.03, 0.15),
                              }}
                              className="kds-ticket border-[#25d366]/40"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                    <span>Cuenta #{order.number}</span>
                                    <span className="text-xs text-[#eed889]">· {locationLabel(order.service, order.location)}</span>
                                  </div>
                                  <div className="text-xs text-[#8b92a0]">
                                    Mesero: {order.waiter} · Estado: <span className="text-[#25d366] font-bold uppercase">{order.status}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="my-3 py-2 border-y border-[#2b303c] space-y-1.5 text-xs">
                                {order.items
                                  .filter((i) => kitchenStation === 'todas' || (i.station || 'cocina') === kitchenStation)
                                  .map((i, idx) => {
                                    const st = i.itemStatus || 'pending';
                                    const nxt = nextItemStatus(st);
                                    return (
                                      <motion.div
                                        key={i.lineId || `${i.key}-${idx}`}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ type: 'spring', stiffness: 440, damping: 32, delay: Math.min(idx * 0.02, 0.1) }}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <span className="font-medium text-white truncate">
                                          {i.qty} × {i.name} <span className="text-xs text-[#8b92a0]">({st})</span>
                                        </span>
                                        {nxt === 'served' && (
                                          <button
                                            type="button"
                                            onClick={() => handleAdvanceItemStatus(order.id, i.lineId || i.key, 'served')}
                                            className="px-2 py-0.5 rounded bg-[#173c34] text-[#25d366] font-bold text-xs"
                                          >
                                            🍽️ Servir
                                          </button>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                              </div>

                              {order.status !== 'served' ? (
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceOrderStatus(order.id, 'ready')}
                                  className="w-full py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-xs"
                                >
                                  🤝 Marcar Todo Entregado en Mesa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayOrderId(order.id);
                                    setView('cash');
                                  }}
                                  className="w-full py-2 rounded-xl bg-[#d4af37] text-black font-bold text-xs"
                                >
                                  💵 Lista para Cobrar en Caja
                                </button>
                              )}
                            </motion.div>
                          ))}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: CASH & SETTLEMENT */}
          {view === 'cash' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Payment Processing Form */}
              <div className="lg:col-span-6 p-6 ios-glass-card space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Módulo de Cobro en Caja</h3>
                  <span className={`text-xs font-bold ${state.shift.isOpen ? 'text-[#25d366]' : 'text-[#e5a43b]'}`}>
                    {state.shift.isOpen ? 'Turno Abierto' : 'Turno Cerrado'}
                  </span>
                </div>

                <form onSubmit={handleExecutePayment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8b92a0] mb-1">
                      Seleccionar Cuenta Pendiente de Cobro
                    </label>
                    <select
                      value={payOrderId}
                      onChange={(e) => {
                        setPayOrderId(e.target.value);
                        setConfirmUnservedPay(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-sm text-white focus:outline-none focus:border-[#d4af37]"
                    >
                      <option value="">-- Elige una cuenta por cobrar --</option>
                      {openOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          Cuenta #{o.number} · {locationLabel(o.service, o.location)} · {formatMoney(o.totalCents)} ({o.items.length} productos)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Summary of chosen order */}
                  {payOrderId && (
                    <div className="p-4 rounded-xl bg-[#1e222b] border border-[#2b303c] space-y-2 text-xs">
                      {(() => {
                        const ord = state.orders.find((o) => o.id === payOrderId);
                        if (!ord) return null;
                        return (
                          <>
                            <div className="flex justify-between items-center font-bold text-white text-sm">
                              <span>Cuenta #{ord.number} ({locationLabel(ord.service, ord.location)})</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPreCheck(ord)}
                                  className="px-2.5 py-1 rounded-lg bg-[#16191f] border border-white/15 text-[#eed889] text-xs font-semibold hover:border-[#d4af37] inline-flex items-center gap-1"
                                >
                                  <FileText className="w-3.5 h-3.5" /> Pre-cuenta
                                </button>
                                <span className="font-mono text-[#eed889] tabular-nums">{formatMoney(ord.totalCents)}</span>
                              </div>
                            </div>
                            <div className="text-[#8b92a0]">Mesero responsable: {ord.waiter}</div>
                            <div className="pt-2 border-t border-[#2b303c] space-y-1">
                              {ord.items.map((i, idx) => (
                                <div key={idx} className="flex justify-between gap-2 text-[#8b92a0]">
                                  <div className="min-w-0">
                                    <span>
                                      {i.qty} × {i.name}{' '}
                                      <span className="text-xs uppercase text-[#d4af37]">
                                        [{i.itemStatus || 'pending'}]
                                      </span>
                                    </span>
                                    {(i.modifiers || i.modificadores || []).length > 0 && (
                                      <div className="text-[11px] text-[#eed889]/85 truncate">
                                        Extras: {(i.modifiers || i.modificadores || []).map((m) => `${m.name}${m.priceCents > 0 ? ` (+${formatMoney(m.priceCents)})` : ''}`).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                  <span className="tabular-nums shrink-0">{formatMoney(lineTotalCents(i))}</span>
                                </div>
                              ))}
                            </div>
                            {ord.discountCents > 0 && (
                              <div className="flex justify-between text-[#25d366] font-bold pt-1 tabular-nums">
                                <span>Descuento aplicado</span>
                                <span>- {formatMoney(ord.discountCents)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {confirmUnservedPay && payOrderId && (
                    <div className="p-3.5 rounded-xl bg-[#e5a43b]/15 border border-[#e5a43b]/50 text-xs space-y-2">
                      <div className="font-bold text-[#eed889]">
                        ⚠️ Hay productos en esta orden aún no marcados como servidos en KDS.
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const ord = state.orders.find((o) => o.id === payOrderId && !o.paid);
                            if (ord) executePaymentConfirmed(ord, true);
                          }}
                          className="flex-1 py-2 px-3 rounded-lg bg-[#25d366] text-black font-bold"
                        >
                          ✓ Marcar Servido y Cobrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmUnservedPay(false)}
                          className="px-3 py-2 rounded-lg bg-[#16191f] text-[#8b92a0]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Payment method selector */}
                  <div>
                    <label className="block text-xs font-semibold text-[#8b92a0] mb-2">Método de Pago</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentMethod(m)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all border ${
                            paymentMethod === m
                              ? 'bg-[#d4af37] text-black border-[#d4af37]'
                              : 'bg-[#1e222b] text-[#8b92a0] border-[#2b303c] hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cash Change Calculator */}
                  {paymentMethod === 'efectivo' && payOrderId && (
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2">
                      <label className="block text-xs font-semibold text-[#8b92a0]">Efectivo Entregado por Cliente ($)</label>
                      <input
                        type="number"
                        placeholder="Monto entregado (ej. 200, 500)"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white text-sm font-mono"
                      />
                      <div className="flex gap-1.5 pt-1">
                        {[50, 100, 200, 500, 1000].map((billete) => (
                          <button
                            key={billete}
                            type="button"
                            onClick={() => setCashTendered(String(billete))}
                            className="px-2 py-1 rounded-lg text-xs bg-[#16191f] border border-[#2b303c] text-[#8b92a0] hover:text-white"
                          >
                            ${billete}
                          </button>
                        ))}
                      </div>

                      {(() => {
                        const ord = state.orders.find((o) => o.id === payOrderId);
                        const val = Number(cashTendered);
                        if (!ord || !val) return null;
                        const change = val * 100 - ord.totalCents;
                        return (
                          <div className="pt-2 border-t border-[#2b303c] flex justify-between font-mono font-bold text-sm">
                            <span className="text-[#8b92a0]">Cambio a Devolver:</span>
                            <span className={change >= 0 ? 'text-[#25d366]' : 'text-[#e05252]'}>
                              {change >= 0 ? formatMoney(change) : `Faltan ${formatMoney(-change)}`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Mixed Payment Split Input */}
                  {paymentMethod === 'mixto' && payOrderId && (
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-2 text-xs">
                      <label className="block font-semibold text-[#8b92a0]">
                        Monto pagado en EFECTIVO ($ MXN) — el resto va a Tarjeta
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={mixedCashInput}
                        onChange={(e) => setMixedCashInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white text-sm font-mono"
                      />
                      {(() => {
                        const ord = state.orders.find((o) => o.id === payOrderId);
                        if (!ord) return null;
                        const cashCents = Math.min(
                          ord.totalCents,
                          Math.max(0, Math.round((Number(mixedCashInput) || 0) * 100))
                        );
                        const cardCents = ord.totalCents - cashCents;
                        return (
                          <div className="flex justify-between font-mono font-bold pt-1 text-[#eed889]">
                            <span>Efectivo: {formatMoney(cashCents)}</span>
                            <span>Tarjeta: {formatMoney(cardCents)}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!payOrderId}
                    className="w-full py-3.5 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-sm transition-all shadow-lg disabled:opacity-40"
                  >
                    Confirmar Cobro e Imprimir Ticket
                  </button>
                </form>

                {/* Operations: Reopen last sale & Export CSV */}
                <div className="pt-4 border-t border-[#2b303c] flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleExportSalesCsv}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold"
                  >
                    📥 Exportar Ventas (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={handleReopenLastSale}
                    className="py-2 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-[#eed889] font-bold"
                  >
                    🔄 Reabrir Última Venta
                  </button>
                </div>
              </div>

              {/* Cash Shift Summary & Cut (Corte de Turno) */}
              <div className="lg:col-span-6 space-y-6">
                <div className="p-6 ios-glass-card space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Arqueo y Corte de Caja</h3>
                    <span className="text-xs text-[#8b92a0] tabular-nums">
                      Turno iniciado: {new Date(state.shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs tabular-nums">
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                      <div className="text-[#8b92a0]">Fondo Inicial</div>
                      <div className="text-base font-mono font-bold text-white mt-1">
                        {formatMoney(state.shift.initialCashCents)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                      <div className="text-[#8b92a0]">Ventas Efectivo</div>
                      <div className="text-base font-mono font-bold text-[#25d366] mt-1">
                        {formatMoney(state.shift.cashSalesCents)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                      <div className="text-[#8b92a0]">Ventas Tarjeta</div>
                      <div className="text-base font-mono font-bold text-[#eed889] mt-1">
                        {formatMoney(state.shift.cardSalesCents)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                      <div className="text-[#8b92a0]">Depósitos (+)</div>
                      <div className="text-base font-mono font-bold text-[#25d366] mt-1">
                        +{formatMoney(state.shift.depositosCents || 0)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c]">
                      <div className="text-[#8b92a0]">Retiros (-)</div>
                      <div className="text-base font-mono font-bold text-[#e05252] mt-1">
                        -{formatMoney(state.shift.retirosCents || 0)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#1e222b] rounded-xl border border-[#d4af37]/40">
                      <div className="text-[#eed889] font-semibold">Esperado en Cajón</div>
                      <div className="text-base font-mono font-bold text-[#eed889] mt-1">
                        {formatMoney(state.shift.expectedCashCents)}
                      </div>
                    </div>
                  </div>

                  {/* Cash Drawer Movements (Ingreso / Retiro) */}
                  {state.shift.isOpen && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerModalType('deposito');
                          setDrawerAmount('');
                          setDrawerReason('');
                        }}
                        className="min-h-[44px] py-2 px-3 rounded-xl bg-[#122822] hover:bg-[#173c34] border border-[#25d366]/40 text-[#25d366] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ArrowDownCircle className="w-4 h-4" /> Ingreso de Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerModalType('retiro');
                          setDrawerAmount('');
                          setDrawerReason('');
                        }}
                        className="min-h-[44px] py-2 px-3 rounded-xl bg-[#e05252]/10 hover:bg-[#e05252]/20 border border-[#e05252]/40 text-[#e05252] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ArrowUpCircle className="w-4 h-4" /> Retiro de Efectivo
                      </button>
                    </div>
                  )}

                  {/* Physical count input / Open New Shift with real cash fund */}
                  <div className="p-4 bg-[#1e222b] rounded-xl border border-[#2b303c] space-y-3 text-xs">
                    {state.shift.isOpen ? (
                      <>
                        <label className="block text-[#8b92a0] font-semibold">
                          Conteo Físico de Dinero en Cajón ($ MXN)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={physicalCashCount}
                            onChange={(e) => setPhysicalCashCount(e.target.value)}
                            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white font-mono tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={handlePerformCashCut}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#d4af37] text-black font-bold hover:bg-[#eed889]"
                          >
                            Hacer Corte Z
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="block text-[#eed889] font-semibold">
                          Fondo Inicial de Caja ($ MXN) para Nuevo Turno
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={openingCashInput}
                            onChange={(e) => setOpeningCashInput(e.target.value)}
                            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#16191f] border border-[#2b303c] text-white font-mono tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={handleOpenNewShift}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#25d366] text-black font-bold hover:bg-[#20b858]"
                          >
                            Abrir Nuevo Turno
                          </button>
                        </div>
                      </>
                    )}
                    {state.shift.closedAt && (
                      <div className="text-xs pt-1">
                        <span className="text-[#8b92a0]">Último corte registrado: </span>
                        <span className="font-bold text-white tabular-nums">
                          Diferencia: {formatMoney(state.shift.differenceCents || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sales history of current shift */}
                <div className="p-6 ios-glass-card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">Historial de Ventas</h3>
                    <span className="text-xs text-[rgba(240,230,211,0.58)] tabular-nums">{state.sales.length} cobros</span>
                  </div>
                  {state.sales.length === 0 ? (
                    <div className="py-8 text-center text-[#8b92a0] text-xs">Sin ventas cobradas aún en este turno.</div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {state.sales.slice().reverse().map((sale) => (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{sale.receipt}</span>
                              <span className="text-[#8b92a0]">· {locationLabel(sale.service, sale.location)}</span>
                            </div>
                            <div className="text-xs text-[#8b92a0]">
                              {sale.paymentMethod.toUpperCase()} · {sale.waiter} · {new Date(sale.paidAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-sm text-[#eed889]">{formatMoney(sale.totalCents)}</span>
                            <button
                              type="button"
                              onClick={() => setActiveReceiptSale(sale)}
                              className="px-2 py-1 rounded bg-[#16191f] border border-[#2b303c] text-[#8b92a0] hover:text-white"
                            >
                              Ticket
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: INVENTORY & STOCK */}
          {view === 'inventory' && (
            <Suspense fallback={<div className="p-8 text-center text-[#d4af37]">Cargando inventario...</div>}>
              <InventoryManagementView
                state={state}
                setState={setState}
                firebaseUser={firebaseUser}
                authorizedEmails={authorizedEmails}
                notify={notify}
                isFirebaseAdmin={isFirebaseAdmin}
              />
            </Suspense>
          )}

          {/* VIEW 7: REPORTS & PERFORMANCE ANALYTICS WITH RECHARTS */}
          {view === 'reports' && (
            <Suspense fallback={<div className="p-8 text-center text-[#d4af37]">Cargando reportes...</div>}>
              <PosAnalyticsDashboard state={state} />
            </Suspense>
          )}

          {/* VIEW 8: ADMIN DASHBOARD */}
          {view === 'admin' && (
            <Suspense fallback={<div className="p-8 text-center text-[#d4af37]">Cargando panel admin...</div>}>
              <AdminDashboard
                state={state}
                setState={setState}
                onClose={() => setView('pos')}
                notify={notify}
                firebaseUser={firebaseUser}
                isFirebaseAdmin={isFirebaseAdmin}
                workspaceOwnerUid={workspaceOwnerUid}
              />
            </Suspense>
          )}
        </div>
      </main>

      {/* Role-Filtered Mobile Bottom Navigation Bar */}
      <nav className="pos-mobile-bar flex items-center justify-around">
        <button
          type="button"
          className={`pos-mobile-btn flex-1 ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Resumen</span>
        </button>
        {canViewPos && (
          <button
            type="button"
            className={`pos-mobile-btn flex-1 ${view === 'pos' ? 'active' : ''}`}
            onClick={() => setView('pos')}
          >
            <Receipt className="w-4 h-4" />
            <span>Comanda</span>
          </button>
        )}
        {canViewTables && (
          <button
            type="button"
            className={`pos-mobile-btn flex-1 ${view === 'tables' ? 'active' : ''}`}
            onClick={() => setView('tables')}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Mesas</span>
          </button>
        )}
        {canViewKitchen && (
          <button
            type="button"
            className={`pos-mobile-btn flex-1 ${view === 'kitchen' ? 'active' : ''}`}
            onClick={() => setView('kitchen')}
          >
            <ChefHat className="w-4 h-4" />
            <span>Cocina</span>
          </button>
        )}
        {canViewCash && (
          <button
            type="button"
            className={`pos-mobile-btn flex-1 ${view === 'cash' ? 'active' : ''}`}
            onClick={() => setView('cash')}
          >
            <DollarSign className="w-4 h-4" />
            <span>Caja</span>
          </button>
        )}
      </nav>

      {/* Printable Receipt Modal (Sale Ticket) */}
      {activeReceiptSale && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white/95 backdrop-blur-xl text-black rounded-[28px] max-w-sm w-full p-6 shadow-2xl border border-white/40 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="font-bold text-base tracking-tight">Ticket de Venta</h3>
              <button
                type="button"
                onClick={() => setActiveReceiptSale(null)}
                className="w-11 h-11 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-gray-600 hover:text-black font-bold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre
              id="printable-receipt"
              className="text-xs leading-tight font-mono bg-gray-50 p-4 rounded-2xl border border-gray-200 overflow-x-auto whitespace-pre"
            >
              {printReceiptText(activeReceiptSale, state.config)}
            </pre>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 min-h-[44px] py-2.5 rounded-2xl bg-[#173c34] hover:bg-[#28584c] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> Imprimir Ticket (80mm)
              </button>
              <button
                type="button"
                onClick={() => setActiveReceiptSale(null)}
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-gray-200 hover:bg-gray-300 text-black font-bold text-xs transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Pre-Check Proforma Modal */}
      {activePreCheckOrder && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white/95 backdrop-blur-xl text-black rounded-[28px] max-w-sm w-full p-6 shadow-2xl border border-white/40 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="font-bold text-base tracking-tight">Pre-cuenta (Proforma)</h3>
              <button
                type="button"
                onClick={() => setActivePreCheckOrder(null)}
                className="w-11 h-11 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-gray-600 hover:text-black font-bold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre
              id="printable-receipt"
              className="text-xs leading-tight font-mono bg-gray-50 p-4 rounded-2xl border border-gray-200 overflow-x-auto whitespace-pre"
            >
              {printPreCheckText(activePreCheckOrder, state.config)}
            </pre>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 min-h-[44px] py-2.5 rounded-2xl bg-[#173c34] hover:bg-[#28584c] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> Imprimir Pre-cuenta
              </button>
              <button
                type="button"
                onClick={() => setActivePreCheckOrder(null)}
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-gray-200 hover:bg-gray-300 text-black font-bold text-xs transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason Modal (Audited cancellation / discount) */}
      {modalReason && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">{modalReason.title}</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)] leading-relaxed">
              Por trazabilidad y control de auditoría, escribe el motivo justificado de esta acción:
            </p>
            <textarea
              autoFocus
              rows={3}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Escribe el motivo aquí..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white text-xs placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalReason(null);
                  setReasonInput('');
                }}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reasonInput.trim()}
                onClick={() => {
                  modalReason.onConfirm(reasonInput.trim());
                  setModalReason(null);
                  setReasonInput('');
                }}
                className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] disabled:opacity-40 transition-colors"
              >
                Confirmar y Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal (Split / Discount) */}
      {promptModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">{promptModal.title}</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">{promptModal.label}</p>
            <input
              autoFocus
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white text-xs focus:outline-none focus:border-[#c8a84b]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPromptModal(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  promptModal.onConfirm(promptValue);
                  setPromptModal(null);
                }}
                className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] transition-colors"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Note Modal with 1-Tap Modifier Chips */}
      {itemNoteModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">Modificadores de Preparación</h3>
              <button
                type="button"
                onClick={() => setItemNoteModal(null)}
                className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#e8d090] font-semibold">{itemNoteModal.name}</p>

            <div className="flex flex-wrap gap-2">
              {QUICK_ITEM_MODIFIERS.map((chip) => {
                const active = itemNoteValue
                  .split(',')
                  .map((s) => s.trim().toLowerCase())
                  .includes(chip.toLowerCase());
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleToggleQuickModifier(chip)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
                        : 'bg-white/[0.05] text-[#f0e6d3] border-white/15 hover:border-[#c8a84b]/60'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            {catalogModifiers.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-xs uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold">
                  Modificadores de carta
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {catalogModifiers.map((mod) => {
                    const active = itemNoteValue
                      .split(',')
                      .map((s) => s.trim().toLowerCase())
                      .includes(mod.name.toLowerCase());
                    return (
                      <button
                        key={mod.key}
                        type="button"
                        onClick={() => handleToggleQuickModifier(mod.name)}
                        className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
                            : 'bg-white/[0.04] text-[#e8d090] border-white/15 hover:border-[#c8a84b]/60'
                        }`}
                      >
                        {mod.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold mb-1.5">
                Nota personalizada
              </label>
              <input
                type="text"
                value={itemNoteValue}
                onChange={(e) => setItemNoteValue(e.target.value)}
                placeholder="Ej. Sin verdura, término medio..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white text-xs focus:outline-none focus:border-[#c8a84b]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setItemNoteModal(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCart((prev) =>
                    prev.map((i) =>
                      (i.lineId || i.key) === itemNoteModal.targetId ? { ...i, note: itemNoteValue.trim() } : i
                    )
                  );
                  setItemNoteModal(null);
                  notify('Nota de cocina actualizada.');
                }}
                className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] transition-colors"
              >
                Guardar Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer / Merge Table Modal */}
      {moveTableModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">
                Mover o Unir Cuenta #{selectedOrder.number}
              </h3>
              <button
                type="button"
                onClick={() => setMoveTableModalOpen(false)}
                className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">
              Ubicación actual: <strong className="text-white">{locationLabel(selectedOrder.service, selectedOrder.location)}</strong>
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Nuevo Servicio</label>
                <select
                  value={moveTargetService}
                  onChange={(e) => {
                    const s = e.target.value as ServiceType;
                    setMoveTargetService(s);
                    const opts = locationOptions(s);
                    setMoveTargetLocation(opts[0].value);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white"
                >
                  <option value="mesa">Mesa (Salón)</option>
                  <option value="barra_exterior">Barra Exterior</option>
                  <option value="barra_interior">Barra Interior</option>
                  <option value="para_llevar">Para Llevar</option>
                  <option value="domicilio">A Domicilio</option>
                </select>
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Destino</label>
                <select
                  value={moveTargetLocation}
                  onChange={(e) => setMoveTargetLocation(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white"
                >
                  {locationOptions(moveTargetService).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Check existing orders on target location for optional Merge */}
            {(() => {
              const targetExisting = state.orders.filter(
                (o) =>
                  o.status !== 'closed' &&
                  o.id !== selectedOrder.id &&
                  o.service === moveTargetService &&
                  String(o.location) === String(moveTargetLocation)
              );
              if (targetExisting.length === 0) return null;
              return (
                <div className="p-3.5 rounded-2xl bg-white/[0.05] border border-[#c8a84b]/35 space-y-2 text-xs">
                  <div className="font-bold text-[#e8d090]">
                    Ya hay {targetExisting.length} cuenta(s) abierta(s) en {locationLabel(moveTargetService, moveTargetLocation)}:
                  </div>
                  {targetExisting.map((targetOrd) => (
                    <div key={targetOrd.id} className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-white tabular-nums">
                        Cuenta #{targetOrd.number} · {formatMoney(targetOrd.totalCents)}
                      </span>
                      {isFirebaseAdmin && (
                        <button
                          type="button"
                          onClick={() => handleConfirmMergeOrders(targetOrd)}
                          className="min-h-[38px] px-3 py-1 rounded-xl bg-[#c8a84b] text-[#0a0a0b] font-bold inline-flex items-center gap-1"
                        >
                          <Merge className="w-3.5 h-3.5" /> Unir cuentas
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMoveTableModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveTable}
                className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#173c34] hover:bg-[#28584c] border border-[#25d366]/40 text-white transition-colors"
              >
                Mover Ubicación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Movement Modal (Ingreso / Retiro) */}
      {drawerModalType && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">
                {drawerModalType === 'deposito' ? 'Ingreso de Efectivo a Caja' : 'Retiro Parcial de Caja'}
              </h3>
              <button
                type="button"
                onClick={() => setDrawerModalType(null)}
                className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDrawerMovement} className="space-y-3 text-xs">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Monto ($ MXN) *</label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={drawerAmount}
                  onChange={(e) => setDrawerAmount(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono text-sm tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Concepto / Motivo</label>
                <input
                  type="text"
                  placeholder={drawerModalType === 'deposito' ? 'Ej. Cambio en monedas / fondo adicional' : 'Ej. Pago a proveedor / corte parcial'}
                  value={drawerReason}
                  onChange={(e) => setDrawerReason(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDrawerModalType(null)}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] font-semibold text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[44px] px-5 py-2 rounded-2xl font-bold transition-colors ${
                    drawerModalType === 'deposito'
                      ? 'bg-[#25d366] text-[#0a0a0b]'
                      : 'bg-[#e05252] text-white'
                  }`}
                >
                  Registrar {drawerModalType === 'deposito' ? 'Ingreso' : 'Retiro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Intake / Adjust / MinStock Modal */}
      {inventoryModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">
              {inventoryModal.type === 'entrada'
                ? 'Registrar Compra / Entrada de Insumo'
                : inventoryModal.type === 'merma'
                ? 'Registrar Merma / Baja de Insumo'
                : inventoryModal.type === 'ajuste'
                ? 'Ajustar Existencia Física'
                : 'Configurar Umbral de Alerta de Stock Mínimo'}
            </h3>
            <p className="text-xs text-[#e8d090] font-bold">{inventoryModal.descripcion}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1">
                  {inventoryModal.type === 'entrada'
                    ? 'Cantidad a ingresar'
                    : inventoryModal.type === 'merma'
                    ? 'Cantidad a descontar (merma)'
                    : inventoryModal.type === 'ajuste'
                    ? 'Nueva existencia contada'
                    : 'Cantidad mínima para activar alerta'}
                </label>
                <input
                  type="number"
                  placeholder="Cantidad"
                  value={invQty}
                  onChange={(e) => setInvQty(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              {inventoryModal.type !== 'minStock' && (
                <>
                  <div>
                    <label className="block text-[rgba(240,230,211,0.68)] mb-1">Costo Unitario ($ MXN)</label>
                    <input
                      type="number"
                      placeholder="Costo"
                      value={invCost}
                      onChange={(e) => setInvCost(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[rgba(240,230,211,0.68)] mb-1">Motivo / Proveedor</label>
                    <input
                      type="text"
                      placeholder="Ej. Factura o conteo semanal..."
                      value={invReason}
                      onChange={(e) => setInvReason(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInventoryModal(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInventoryMovement}
                className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#25d366] text-[#0a0a0b] transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Table Quick-Action Sheet Modal */}
      {tableSheetLoc && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal w-full sm:max-w-lg rounded-b-none sm:rounded-[28px] p-6 space-y-4 text-left max-h-[85dvh] overflow-y-auto">
            {(() => {
              const ordersHere = state.orders.filter(
                (o) =>
                  o.status !== 'closed' &&
                  o.service === tableSheetLoc.service &&
                  String(o.location) === tableSheetLoc.loc
              );
              const totalHere = ordersHere.reduce((s, o) => s + o.totalCents, 0);
              return (
                <>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                    <div>
                      <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                        {tableSheetLoc.label}
                      </h3>
                      <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums mt-0.5">
                        {tableSheetLoc.section} · {ordersHere.length} cuenta{ordersHere.length !== 1 ? 's' : ''} · {formatMoney(totalHere)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTableSheetLoc(null)}
                      className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {ordersHere.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-2xl bg-[#0a0a0b]/60 border border-white/10 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 tabular-nums">
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>Cuenta #{ord.number}</span>
                              <span className="text-xs text-[#e8d090] uppercase">{ord.status}</span>
                            </div>
                            <div className="text-xs text-[rgba(240,230,211,0.62)] mt-0.5">
                              {ord.waiter} · {ord.items.reduce((s, i) => s + i.qty, 0)} art. · {formatElapsedTime(ord.createdAt, nowMs)}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-base text-[#e8d090]">
                            {formatMoney(ord.totalCents)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {canViewPos && (
                            <button
                              type="button"
                              onClick={() => {
                                setTableSheetLoc(null);
                                loadOrderIntoDraft(ord);
                              }}
                              className="flex-1 min-h-[42px] px-3 py-2 rounded-2xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-white text-xs font-bold whitespace-nowrap"
                            >
                              Editar / Agregar
                            </button>
                          )}
                          {ord.status === 'ready' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceOrderStatus(ord.id, 'ready')}
                              className="min-h-[42px] px-3 py-2 rounded-2xl bg-[#25d366]/20 hover:bg-[#25d366] text-[#25d366] hover:text-[#0a0a0b] text-xs font-bold whitespace-nowrap transition-colors"
                            >
                              Marcar Servido
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setTableSheetLoc(null);
                              handleOpenPreCheck(ord);
                            }}
                            className="min-h-[42px] px-3 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#e8d090] text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> Pre-cuenta
                          </button>
                          {canCollectPayment && (
                            <button
                              type="button"
                              onClick={() => {
                                setTableSheetLoc(null);
                                setPayOrderId(ord.id);
                                setView('cash');
                              }}
                              className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1"
                            >
                              <DollarSign className="w-3.5 h-3.5" /> Cobrar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canViewPos && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = tableSheetLoc;
                        setTableSheetLoc(null);
                        setCurrentService(target.service);
                        setCurrentTable(target.loc);
                        setCurrentOrderId(null);
                        setCart([]);
                        setView('pos');
                        notify(`Nueva cuenta independiente en ${target.label}.`);
                      }}
                      className="w-full min-h-[46px] py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-[#e8d090] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Abrir Otra Cuenta Independiente en {tableSheetLoc.label}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Employee Firestore PIN Authentication Module (Gate / Switch / Lock) */}
      {(!employeeAuthenticated || pinPadMode === 'switch' || pinPadMode === 'unlock' || isSessionLocked) && (
        <EmployeePinAuthPanel
          users={state.users || []}
          activeUser={state.activeUser}
          permissions={state.permissions || DEFAULT_PERMISSIONS}
          firebaseUser={firebaseUser}
          isFirebaseAdmin={isFirebaseAdmin}
          authorizedEmails={authorizedEmails}
          mode={isSessionLocked || pinPadMode === 'unlock' ? 'unlock' : pinPadMode === 'switch' ? 'switch' : 'gate'}
          onSyncUsers={(freshUsers) => setState((prev) => ({ ...prev, users: freshUsers }))}
          onCancel={
            employeeAuthenticated && pinPadMode === 'switch' && !isSessionLocked
              ? () => setPinPadMode(null)
              : undefined
          }
          onSwitchToMenu={!employeeAuthenticated ? onSwitchToMenu : undefined}
          onSignOutGoogle={!employeeAuthenticated ? () => void handleGoogleSignOut() : undefined}
          onAuthenticated={(verifiedUser) => {
            const rolePerms =
              state.permissions?.[verifiedUser.role] ||
              DEFAULT_PERMISSIONS[verifiedUser.role] ||
              DEFAULT_PERMISSIONS.mesero;
            setState((prev) => ({ ...prev, activeUser: verifiedUser }));
            setEmployeeAuthenticated(true);
            setIsSessionLocked(false);
            setPinPadMode(null);
            if (!isSessionLocked) {
              setView(defaultViewForRole(verifiedUser.role, rolePerms));
            }
            if (verifiedUser.mustChangePin && !(verifiedUser.role === 'admin' && isFirebaseAdmin)) {
              notify('Tu PIN inicial es 0000. Solicita al Administrador actualizarlo por seguridad.');
            } else {
              notify(
                `Bienvenido, ${verifiedUser.name} (${ROLE_LABELS[verifiedUser.role]} · ${verifiedUser.area}).`
              );
            }
          }}
        />
      )}

      {/* Mandatory 0000 Admin PIN Replacement Modal */}
      {employeeAuthenticated &&
        !isSessionLocked &&
        !pinPadMode &&
        state.activeUser?.mustChangePin &&
        state.activeUser?.role === 'admin' &&
        isFirebaseAdmin && (
          <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!firebaseUser) return;
                if (!isValidFourDigitPin(forcePinNew)) {
                  setForcePinError('El nuevo PIN debe tener exactamente 4 dígitos numéricos.');
                  return;
                }
                if (isWeakDefaultPin(forcePinNew)) {
                  setForcePinError('Por seguridad, elige un PIN distinto a 0000.');
                  return;
                }
                if (forcePinNew !== forcePinConfirm) {
                  setForcePinError('Los PIN ingresados no coinciden.');
                  return;
                }
                setSavingForcedPin(true);
                setForcePinError(null);
                const now = new Date().toISOString();
                const auditEntry: AuditLogEntry = {
                  id: uid(),
                  at: now,
                  user: state.activeUser.name,
                  action: 'PIN inicial actualizado',
                  detail: `${state.activeUser.name} reemplazó el PIN inicial 0000 por un código personal`,
                };
                try {
                  const newHash = await fsUpdateStaffPin(
                    state.activeUser.id,
                    forcePinNew,
                    firebaseUser,
                    authorizedEmails,
                    auditEntry
                  );
                  setState((prev) => ({
                    ...prev,
                    activeUser: { ...prev.activeUser, pin: '****', pinHash: newHash, mustChangePin: false },
                    users: prev.users.map((u) =>
                      u.id === prev.activeUser.id
                        ? { ...u, pin: '****', pinHash: newHash, mustChangePin: false }
                        : u
                    ),
                    audit: [...prev.audit, auditEntry],
                  }));
                  setForcePinNew('');
                  setForcePinConfirm('');
                  notify('PIN personal de administrador actualizado con éxito.');
                } catch (err) {
                  setForcePinError(err instanceof Error ? err.message : 'No se pudo actualizar el PIN.');
                } finally {
                  setSavingForcedPin(false);
                }
              }}
              className="w-full max-w-md ios-glass-modal border-[#c8a84b]/40 p-6 space-y-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#f2a93b]/15 border border-[#f2a93b]/40 flex items-center justify-center text-[#f2a93b] shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Cambia el PIN Inicial (0000)</h3>
                  <p className="text-xs text-[rgba(240,230,211,0.68)]">
                    Por seguridad, asigna un PIN personal de 4 dígitos para {state.activeUser.name} antes de operar.
                  </p>
                </div>
              </div>

              {forcePinError && (
                <div className="p-3 rounded-2xl bg-[#e05252]/15 border border-[#e05252]/40 text-xs text-[#e05252]">
                  {forcePinError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[rgba(240,230,211,0.75)] mb-1">
                    Nuevo PIN (4 dígitos)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={forcePinNew}
                    onChange={(e) => {
                      setForcePinNew(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setForcePinError(null);
                    }}
                    placeholder="••••"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/15 text-white font-mono text-center text-lg tracking-[0.4em] focus:outline-none focus:border-[#c8a84b]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[rgba(240,230,211,0.75)] mb-1">
                    Confirmar PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={forcePinConfirm}
                    onChange={(e) => {
                      setForcePinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setForcePinError(null);
                    }}
                    placeholder="••••"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/15 text-white font-mono text-center text-lg tracking-[0.4em] focus:outline-none focus:border-[#c8a84b]"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingForcedPin}
                className="w-full min-h-[46px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] disabled:opacity-50 text-[#0a0a0b] font-bold text-xs uppercase tracking-wider transition-colors"
              >
                {savingForcedPin ? 'Guardando PIN...' : 'Guardar Nuevo PIN y Continuar'}
              </button>
            </form>
          </div>
        )}

      {/* Tactile iOS PIN Pad Modal for Admin Elevation (verified against Firestore) */}
      <IosPinPadModal
        open={pinPadMode === 'admin'}
        title="Autorización de Administrador"
        subtitle={`El usuario actual (${state.activeUser.name}) requiere PIN de Administrador verificado en Firestore.`}
        rateLimitScope="admin-elevation"
        allowCancel={true}
        onCancel={() => setPinPadMode(null)}
        onValidatePin={async (enteredPin) => {
          if (!firebaseUser) return false;
          const res = await fsVerifyAnyAdminPinFromFirestore(
            enteredPin,
            firebaseUser,
            authorizedEmails
          );
          if (!res.ok || !res.user) return false;
          setState((prev) => ({ ...prev, activeUser: res.user! }));
          setEmployeeAuthenticated(true);
          setPinPadMode(null);
          setView('admin');
          notify(`Acceso administrativo autorizado (${res.user.name}).`);
          return true;
        }}
      />

      {/* iOS Navigation Drawer (Menú Desplegable de Navegación) */}
      {isNavDrawerOpen && (
        <div className="fixed inset-0 z-50 ios-scrim flex justify-start" role="dialog" aria-modal="true">
          <div className="w-80 max-w-[85vw] h-full bg-[#16191f]/95 backdrop-blur-2xl border-r border-[#d4af37]/30 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <BarbachuLogo className="w-8 h-auto" />
                  <div>
                    <h3 className="font-serif font-bold text-lg text-white">BARBACHU</h3>
                    <p className="text-xs text-[#c8a84b] uppercase tracking-wider">Menú iOS · Navegación</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNavDrawerOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Operator info card */}
              <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#173c34] text-[#eed889] font-bold text-xs flex items-center justify-center border border-[#d4af37]/40 shrink-0">
                  {state.activeUser.avatar}
                </div>
                <div className="overflow-hidden min-w-0">
                  <div className="text-xs font-bold text-white truncate">{state.activeUser.name}</div>
                  <div className="text-xs text-[#c8a84b] uppercase">{ROLE_LABELS[state.activeUser.role]} · {state.activeUser.area}</div>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5">
                {[
                  { id: 'dashboard', label: 'Resumen General', icon: LayoutDashboard, show: true },
                  { id: 'pos', label: 'Comandero POS', icon: Receipt, show: canViewPos },
                  { id: 'tables', label: 'Mapa de Mesas', icon: UtensilsCrossed, badge: totalOccupiedTables, show: canViewTables },
                  { id: 'kitchen', label: 'Cocina & Barra KDS', icon: Flame, badge: openOrders.length, show: canViewKitchen },
                  { id: 'cash', label: 'Caja & Cobros', icon: DollarSign, show: canViewCash },
                  { id: 'inventory', label: 'Control de Inventario', icon: Package, badge: lowStockItems.length, show: canViewInventory },
                  { id: 'reports', label: 'Reportes de Venta', icon: BarChart3, show: canViewReports },
                  { id: 'admin', label: 'Administración & Personal', icon: Settings, show: canViewAdmin },
                ].filter(i => i.show).map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setView(item.id as PosViewRoute);
                        setIsNavDrawerOpen(false);
                      }}
                      className={`w-full min-h-[46px] px-4 rounded-2xl flex items-center gap-3 text-xs font-bold transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-[#d4af37] to-[#eed889] text-black shadow-lg'
                          : 'bg-white/[0.03] hover:bg-white/[0.08] text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-black text-white' : 'bg-[#d4af37] text-black'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions in Drawer */}
            <div className="pt-4 border-t border-white/10 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsNavDrawerOpen(false);
                  setIsDeviceModalOpen(true);
                }}
                className="w-full min-h-[44px] px-4 rounded-2xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Server className="w-4 h-4" /> Conexión de Dispositivos (Sync)
              </button>
              {onSwitchToMenu && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNavDrawerOpen(false);
                    onSwitchToMenu();
                  }}
                  className="w-full min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-[#eed889] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> Menú Digital Clientes
                </button>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNavDrawerOpen(false);
                    handleOpenUserSwitcher();
                  }}
                  className="flex-1 min-h-[42px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold"
                >
                  Cambiar Usuario
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsNavDrawerOpen(false);
                    handleLockSession();
                  }}
                  className="min-h-[42px] px-3 rounded-xl bg-[#e05252]/20 hover:bg-[#e05252] text-[#e05252] hover:text-white text-xs font-semibold transition-colors"
                >
                  Bloquear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Connection & Sync Manager Modal */}
      <DeviceSyncModal
        open={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        isOnline={isOnline}
        openOrdersCount={openOrders.length}
        deviceId={deviceId}
        deviceConfig={state.deviceConfig}
        terminals={terminals}
        lastSyncMs={lastSyncMs}
        isAdmin={isFirebaseAdmin || isAdminRole}
        onUpdateDeviceStation={handleUpdateDeviceStation}
        onForceSyncHeartbeat={handleForceSyncHeartbeat}
        onRemoveTerminal={handleRemoveTerminal}
      />

      {/* Product Modifiers Modal (Add with modifiers via useModifiers) */}
      {modifierModalProduct && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal w-full max-w-md rounded-[28px] p-6 space-y-4 text-left max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                  Modificar: {modifierModalProduct.name}
                </h3>
                <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5 tabular-nums">
                  Base: {formatMoney(modifierModalProduct.priceCents)} · Extras: +{formatMoney(calculateModifierTotal(selectedModifiers))} ·{' '}
                  <strong className="text-[#e8d090]">
                    Total: {formatMoney(modifierModalProduct.priceCents + calculateModifierTotal(selectedModifiers))}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModifierModalProduct(null)}
                aria-label="Cerrar modal de modificadores"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#c8a84b] uppercase tracking-wider">
                Modificadores e Ingredientes
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {modifiers.map((mod) => {
                  const isSelected = !!selectedModifiers[mod.id];
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setSelectedModifiers((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                      className={`w-full min-h-[42px] px-3.5 py-2 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-[#c8a84b]/20 border-[#c8a84b] text-white font-bold'
                          : 'bg-white/[0.04] border-white/10 text-[rgba(240,230,211,0.78)] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${isSelected ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b] font-bold' : 'border-white/30'}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        {mod.name}
                      </span>
                      <span className="font-mono text-[#e8d090] tabular-nums">
                        {mod.priceCents > 0 ? `+ ${formatMoney(mod.priceCents)}` : 'Incluido'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Define custom modifier inline */}
              <div className="p-3 rounded-2xl bg-[#0a0a0b]/55 border border-white/10 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[rgba(240,230,211,0.7)]">
                  Definir extra personalizado
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customModName}
                    onChange={(e) => {
                      setCustomModName(e.target.value);
                      setCustomModError('');
                    }}
                    placeholder="Ej. Extra aderezo"
                    aria-label="Nombre del extra personalizado"
                    className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-xs text-white focus:outline-none focus:border-[#c8a84b]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={customModPrice}
                    onChange={(e) => setCustomModPrice(e.target.value)}
                    placeholder="$0"
                    aria-label="Costo extra en pesos"
                    className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-xs text-white font-mono text-right focus:outline-none focus:border-[#c8a84b]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const res = addCustomModifier(customModName, Number(customModPrice) || 0);
                      if (res.error) {
                        setCustomModError(res.error);
                        return;
                      }
                      setSelectedModifiers((prev) => ({ ...prev, [res.id]: true }));
                      setCustomModName('');
                      setCustomModPrice('0');
                      setCustomModError('');
                    }}
                    className="min-h-[38px] px-3 rounded-xl bg-[#173c34] hover:bg-[#28584c] text-[#25d366] font-bold text-xs shrink-0"
                  >
                    + Crear
                  </button>
                </div>
                {customModError && (
                  <p className="text-[11px] text-[#e05252] font-semibold">{customModError}</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModifierModalProduct(null);
                  setSelectedModifiers({});
                }}
                className="flex-1 min-h-[44px] rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const modsArray = getModifiersArray(selectedModifiers);
                  const station = modifierModalProduct.station || classifyProductStation(modifierModalProduct.category);

                  setCart((prev) => [
                    ...prev,
                    {
                      lineId: uid(),
                      key: modifierModalProduct.key,
                      name: modifierModalProduct.name,
                      priceCents: modifierModalProduct.priceCents,
                      qty: 1,
                      note: '',
                      station,
                      itemStatus: 'pending',
                      modifiers: modsArray,
                    },
                  ]);
                  notify(`+1 ${modifierModalProduct.name} (${modsArray.length} modificadores)`);
                  setModifierModalProduct(null);
                  setSelectedModifiers({});
                }}
                className="flex-1 min-h-[44px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs uppercase tracking-wider"
              >
                Añadir con Modificadores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Item Modifiers Modal */}
      {editingCartItemIndex !== null && cart[editingCartItemIndex] && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal w-full max-w-md rounded-[28px] p-6 space-y-4 text-left max-h-[90dvh] overflow-y-auto">
            {(() => {
              const currentItem = cart[editingCartItemIndex];
              const baseProd = state.products.find((p) => p.key === currentItem.key);
              const basePrice = baseProd ? baseProd.priceCents : currentItem.priceCents;
              const extraCents = calculateModifierTotal(editingItemModifiers);
              return (
                <>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                    <div>
                      <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                        Modificar ítem: {currentItem.name}
                      </h3>
                      <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5 tabular-nums">
                        Base: {formatMoney(basePrice)} · Extras: +{formatMoney(extraCents)} ·{' '}
                        <strong className="text-[#e8d090]">Total unitario: {formatMoney(basePrice + extraCents)}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCartItemIndex(null)}
                      aria-label="Cerrar modal de modificadores de ítem"
                      className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-[#c8a84b] uppercase tracking-wider">
                      Modificadores e Ingredientes
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                      {modifiers.map((mod) => {
                        const isSelected = !!editingItemModifiers[mod.id];
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => setEditingItemModifiers((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                            className={`w-full min-h-[42px] px-3.5 py-2 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              isSelected
                                ? 'bg-[#c8a84b]/20 border-[#c8a84b] text-white font-bold'
                                : 'bg-white/[0.04] border-white/10 text-[rgba(240,230,211,0.78)] hover:bg-white/[0.08]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${isSelected ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b] font-bold' : 'border-white/30'}`}>
                                {isSelected ? '✓' : ''}
                              </span>
                              {mod.name}
                            </span>
                            <span className="font-mono text-[#e8d090] tabular-nums">
                              {mod.priceCents > 0 ? `+ ${formatMoney(mod.priceCents)}` : 'Incluido'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Define custom modifier inline */}
                    <div className="p-3 rounded-2xl bg-[#0a0a0b]/55 border border-white/10 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[rgba(240,230,211,0.7)]">
                        Definir extra personalizado
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customModName}
                          onChange={(e) => {
                            setCustomModName(e.target.value);
                            setCustomModError('');
                          }}
                          placeholder="Ej. Extra aderezo"
                          aria-label="Nombre del extra personalizado"
                          className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-xs text-white focus:outline-none focus:border-[#c8a84b]"
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={customModPrice}
                          onChange={(e) => setCustomModPrice(e.target.value)}
                          placeholder="$0"
                          aria-label="Costo extra en pesos"
                          className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#161618] border border-white/10 text-xs text-white font-mono text-right focus:outline-none focus:border-[#c8a84b]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = addCustomModifier(customModName, Number(customModPrice) || 0);
                            if (res.error) {
                              setCustomModError(res.error);
                              return;
                            }
                            setEditingItemModifiers((prev) => ({ ...prev, [res.id]: true }));
                            setCustomModName('');
                            setCustomModPrice('0');
                            setCustomModError('');
                          }}
                          className="min-h-[38px] px-3 rounded-xl bg-[#173c34] hover:bg-[#28584c] text-[#25d366] font-bold text-xs shrink-0"
                        >
                          + Crear
                        </button>
                      </div>
                      {customModError && (
                        <p className="text-[11px] text-[#e05252] font-semibold">{customModError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingCartItemIndex(null)}
                      className="flex-1 min-h-[44px] rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const modsArray = getModifiersArray(editingItemModifiers);
                        setCart((prev) => {
                          const copy = [...prev];
                          const updatedItem: OrderItem = {
                            ...currentItem,
                            priceCents: basePrice,
                            modifiers: modsArray,
                          };
                          delete updatedItem.modificadores;
                          copy[editingCartItemIndex] = updatedItem;
                          return copy;
                        });

                        notify(`Modificadores actualizados para ${currentItem.name}`);
                        setEditingCartItemIndex(null);
                      }}
                      className="flex-1 min-h-[44px] rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs uppercase tracking-wider"
                    >
                      Guardar Modificadores
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-[#173c34]/95 backdrop-blur-xl text-white border border-[#25d366]/40 text-xs font-bold shadow-2xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
