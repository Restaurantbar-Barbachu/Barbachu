import React, { useState, useMemo, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderArchive,
  History,
  Lock,
  Plus,
  QrCode,
  Search,
  Settings,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  FullPosState,
  SoftProduct,
  UserRole,
  RolePermissions,
  PosUser,
  DeviceStation,
  AuditLogEntry,
  InventoryItem,
  RestaurantConfig,
} from '../types';
import { formatMoney } from '../storage';
import { classifyProductStation, uid } from '../core';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';
import {
  ensureEmailList,
  fsBatchUpdateProducts,
  fsCleanupDemoData,
  fsDeleteProduct,
  fsDeleteStaffUser,
  fsSaveInventoryMovement,
  fsSaveProduct,
  fsSaveStaffUser,
  fsSaveTimeClock,
  fsUpdatePosPermissionsAndEmails,
  fsUpdateRestaurantConfig,
  sanitizeFirestoreId,
} from '../lib/firestoreSync';
import { BarbachuLogo } from './BarbachuLogo';
import { IosPinPadModal } from './IosPinPadModal';

interface AdminDashboardProps {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  onClose?: () => void;
  notify: (msg: string) => void;
  firebaseUser: User | null;
  isFirebaseAdmin: boolean;
  workspaceOwnerUid: string;
}

type AdminTab =
  | 'catalogo'
  | 'usuarios'
  | 'permisos'
  | 'dispositivos'
  | 'alertas'
  | 'asistencia'
  | 'configuracion'
  | 'archivos';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  state,
  setState,
  onClose,
  notify,
  firebaseUser,
  isFirebaseAdmin,
  workspaceOwnerUid,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('catalogo');
  // Strict Admin-role validation: only active 'admin' role or explicit Admin PIN override unlocks Admin
  const [unlockedByAdmin, setUnlockedByAdmin] = useState<PosUser | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(
    () => state.activeUser.role === 'admin'
  );

  useEffect(() => {
    if (state.activeUser.role === 'admin') {
      setIsAdminUnlocked(true);
      setUnlockedByAdmin(null);
    } else if (!unlockedByAdmin || unlockedByAdmin.role !== 'admin') {
      setIsAdminUnlocked(false);
    }
  }, [state.activeUser.id, state.activeUser.role, unlockedByAdmin]);

  const isAdminAuthorized =
    isAdminUnlocked && (state.activeUser.role === 'admin' || unlockedByAdmin?.role === 'admin');
  const actingAdminName =
    state.activeUser.role === 'admin'
      ? state.activeUser.name
      : unlockedByAdmin?.name || state.activeUser.name;

  // Catalog management state
  const [search, setSearch] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<string>('TODOS');
  const [inlinePrices, setInlinePrices] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdKey, setNewProdKey] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdCat, setNewProdCat] = useState<string>('BOTANAS');
  const [customCat, setCustomCat] = useState<string>('');
  const [batchPercent, setBatchPercent] = useState<string>('');
  const [confirmDeleteProd, setConfirmDeleteProd] = useState<SoftProduct | null>(null);

  // Gestión de Empleados filters + Create / Full Edit / Delete state (PIN always hidden by default)
  const [employeeSearch, setEmployeeSearch] = useState<string>('');
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<'todos' | UserRole>('todos');
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newUserName, setNewUserName] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('mesero');
  const [newUserPin, setNewUserPin] = useState<string>('');
  const [showNewUserPin, setShowNewUserPin] = useState<boolean>(false);
  const [newUserArea, setNewUserArea] = useState<string>('');
  const [newUserEmail, setNewUserEmail] = useState<string>('');

  const [editingUser, setEditingUser] = useState<PosUser | null>(null);
  const [editUserName, setEditUserName] = useState<string>('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('mesero');
  const [editUserArea, setEditUserArea] = useState<string>('');
  const [editUserAvatar, setEditUserAvatar] = useState<string>('');
  const [editUserPin, setEditUserPin] = useState<string>('');
  const [showEditPin, setShowEditPin] = useState<boolean>(false);
  const [editUserEmail, setEditUserEmail] = useState<string>('');

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<PosUser | null>(null);

  // Authorized Google emails
  const [newAuthEmail, setNewAuthEmail] = useState<string>('');

  // Attendance & MinStock modals
  const [clockModalOpen, setClockModalOpen] = useState<boolean>(false);
  const [clockSelectedUserId, setClockSelectedUserId] = useState<string>(state.users[0]?.id || '');
  const [editingMinStockItem, setEditingMinStockItem] = useState<InventoryItem | null>(null);
  const [editingMinStockVal, setEditingMinStockVal] = useState<string>('');

  // Restaurant Settings & Demo Cleanup & Audit Search
  const [cfgName, setCfgName] = useState<string>(state.config.name || 'Barbachu');
  const [cfgTagline, setCfgTagline] = useState<string>(state.config.tagline || 'Restaurante Bar');
  const [cfgAddress, setCfgAddress] = useState<string>(state.config.address || '');
  const [cfgPhone, setCfgPhone] = useState<string>(state.config.phone || '');
  const [cfgFooter, setCfgFooter] = useState<string>(
    state.config.receiptFooter || '¡Gracias por su preferencia!'
  );
  const [cfgTipPct, setCfgTipPct] = useState<string>(String(state.config.suggestedTipPct ?? 10));
  const [cfgAutoLock, setCfgAutoLock] = useState<string>(
    String(state.config.autoLockMinutes ?? state.deviceConfig?.autoLockMinutes ?? 0)
  );
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  useEffect(() => {
    setCfgName(state.config.name || 'Barbachu');
    setCfgTagline(state.config.tagline || 'Restaurante Bar');
    setCfgAddress(state.config.address || '');
    setCfgPhone(state.config.phone || '');
    setCfgFooter(state.config.receiptFooter || '¡Gracias por su preferencia!');
    setCfgTipPct(String(state.config.suggestedTipPct ?? 10));
    setCfgAutoLock(String(state.config.autoLockMinutes ?? state.deviceConfig?.autoLockMinutes ?? 0));
  }, [state.config, state.deviceConfig?.autoLockMinutes]);

  const [cleanLegacyStaff, setCleanLegacyStaff] = useState<boolean>(true);
  const [cleanInventory, setCleanInventory] = useState<boolean>(true);
  const [cleanTestOrders, setCleanTestOrders] = useState<boolean>(false);
  const [cleaningDemo, setCleaningDemo] = useState<boolean>(false);
  const [confirmCleanupModal, setConfirmCleanupModal] = useState<boolean>(false);
  const [auditFilter, setAuditFilter] = useState<string>('');

  // Device / Station configuration
  const [stationConfig, setStationConfig] = useState<DeviceStation>(
    state.deviceConfig?.station || 'todos'
  );
  const authorizedEmails = useMemo(
    () => ensureEmailList(state.authorizedEmails, firebaseUser?.email),
    [state.authorizedEmails, firebaseUser?.email]
  );

  const categories = useMemo(() => {
    const set = new Set(state.products.map((p) => p.category).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [state.products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.products.filter((p) => {
      const matchCat = selectedCat === 'TODOS' || p.category === selectedCat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [state.products, search, selectedCat]);

  const lowStockItems = useMemo(() => {
    return Object.values(state.inventory).filter((i) => i.minStock > 0 && i.stock <= i.minStock);
  }, [state.inventory]);

  const filteredAudit = useMemo(() => {
    const q = auditFilter.trim().toLowerCase();
    const list = (state.audit || []).slice().reverse();
    if (!q) return list.slice(0, 100);
    return list
      .filter(
        (a) =>
          a.action.toLowerCase().includes(q) ||
          a.detail.toLowerCase().includes(q) ||
          a.user.toLowerCase().includes(q) ||
          (a.reason || '').toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [state.audit, auditFilter]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return (state.users || []).filter((u) => {
      const matchRole = employeeRoleFilter === 'todos' || u.role === employeeRoleFilter;
      const matchQ =
        !q ||
        u.name.toLowerCase().includes(q) ||
        (u.area || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      return matchRole && matchQ;
    });
  }, [state.users, employeeSearch, employeeRoleFilter]);

  // Inline price save
  const handleSaveInlinePrice = (prod: SoftProduct) => {
    if (!isAdminAuthorized) {
      notify('Acceso restringido: se requiere rol de Administrador.');
      return;
    }
    const inputVal = inlinePrices[prod.key];
    if (inputVal === undefined) return;
    const priceNum = Number(inputVal);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      notify('Ingresa un precio válido en pesos.');
      return;
    }

    const priceCents = Math.round(priceNum * 100);
    const oldPriceStr = formatMoney(prod.priceCents);
    const newPriceStr = formatMoney(priceCents);
    const now = new Date().toISOString();

    const updatedProd: SoftProduct = {
      ...prod,
      sourcePrice: priceNum,
      priceCents,
      saleEnabled: priceCents > 0,
      station: prod.station || classifyProductStation(prod.category),
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Precio modificado',
      detail: `Clave ${prod.key} (${prod.name}): ${oldPriceStr} → ${newPriceStr}`,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.key === prod.key ? updatedProd : p)),
      audit: [...prev.audit, auditEntry],
    }));

    setInlinePrices((prev) => {
      const copy = { ...prev };
      delete copy[prod.key];
      return copy;
    });

    if (firebaseUser) {
      void fsSaveProduct(updatedProd, firebaseUser, auditEntry, authorizedEmails, workspaceOwnerUid).catch((err) => {
        notify(`Error guardando precio en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    notify(`Precio de "${prod.name}" actualizado a ${newPriceStr}.`);
  };

  const handleToggleProductSale = (prod: SoftProduct) => {
    if (!isAdminAuthorized) {
      notify('Acceso restringido: se requiere rol de Administrador.');
      return;
    }
    const nextEnabled = !prod.saleEnabled;
    const now = new Date().toISOString();
    const updatedProd: SoftProduct = {
      ...prod,
      saleEnabled: nextEnabled,
      station: prod.station || classifyProductStation(prod.category),
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: nextEnabled ? 'Producto habilitado' : 'Producto deshabilitado',
      detail: `Clave ${prod.key} (${prod.name})`,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.key === prod.key ? updatedProd : p)),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsSaveProduct(updatedProd, firebaseUser, auditEntry, authorizedEmails, workspaceOwnerUid).catch((err) => {
        notify(`Error actualizando producto en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    notify(`Producto "${prod.name}" ${nextEnabled ? 'habilitado' : 'deshabilitado'} para venta.`);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminAuthorized) {
      notify('Acceso restringido: se requiere rol de Administrador.');
      return;
    }
    const name = newProdName.trim();
    if (!name) {
      notify('Ingresa el nombre del producto.');
      return;
    }
    const priceNum = Number(newProdPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      notify('Ingresa un precio mayor a 0.');
      return;
    }
    const category = newProdCat === '__OTRA__' ? customCat.trim().toUpperCase() : newProdCat;
    if (!category) {
      notify('Especifica la categoría.');
      return;
    }

    const rawKey = newProdKey.trim() || String(Math.floor(1000 + Math.random() * 9000));
    const key = sanitizeFirestoreId(rawKey, 'prod').slice(0, 64);
    if (state.products.some((p) => p.key === key)) {
      notify(`La clave ${key} ya existe. Elige otra.`);
      return;
    }

    const priceCents = Math.round(priceNum * 100);
    const newProduct: SoftProduct = {
      key,
      name,
      group: '1',
      category,
      station: classifyProductStation(category),
      sourcePrice: priceNum,
      priceCents,
      saleEnabled: true,
    };

    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Producto agregado',
      detail: `Clave ${key}: ${name} (${category}) por ${formatMoney(priceCents)}`,
    };

    setState((prev) => ({
      ...prev,
      products: [newProduct, ...prev.products],
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsSaveProduct(newProduct, firebaseUser, auditEntry, authorizedEmails, workspaceOwnerUid).catch((err) => {
        notify(`Error guardando platillo en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setShowAddModal(false);
    setNewProdName('');
    setNewProdKey('');
    setNewProdPrice('');
    setCustomCat('');
    notify(`Platillo "${name}" agregado al catálogo.`);
  };

  const handleConfirmDeleteProduct = (prod: SoftProduct) => {
    if (!isAdminAuthorized) {
      notify('Acceso restringido: se requiere rol de Administrador.');
      setConfirmDeleteProd(null);
      return;
    }
    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Producto eliminado',
      detail: `Clave ${prod.key}: ${prod.name}`,
    };

    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.key !== prod.key),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsDeleteProduct(prod.key, firebaseUser, auditEntry, authorizedEmails).catch((err) => {
        notify(`Error eliminando en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setConfirmDeleteProd(null);
    notify(`Producto "${prod.name}" eliminado del catálogo.`);
  };

  const handleApplyBatchAdjustment = () => {
    if (!isAdminAuthorized) {
      notify('Acceso restringido: se requiere rol de Administrador.');
      return;
    }
    const pct = Number(batchPercent);
    if (!Number.isFinite(pct) || pct === 0) {
      notify('Ingresa un porcentaje válido (ej. 5 o -10).');
      return;
    }

    const multiplier = 1 + pct / 100;
    const catLabel = selectedCat === 'TODOS' ? 'todos los productos' : `categoría ${selectedCat}`;
    const now = new Date().toISOString();
    const changedProducts: SoftProduct[] = [];
    const updated = state.products.map((p) => {
      if (selectedCat !== 'TODOS' && p.category !== selectedCat) return p;
      if (!p.saleEnabled || p.priceCents <= 0) return p;
      const newCents = Math.round(p.priceCents * multiplier);
      const nextProd = {
        ...p,
        priceCents: newCents,
        sourcePrice: Math.round(newCents / 100),
      };
      changedProducts.push(nextProd);
      return nextProd;
    });

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Ajuste de precios masivo',
      detail: `${pct > 0 ? `+${pct}%` : `${pct}%`} en ${catLabel}`,
    };

    setState((prev) => ({
      ...prev,
      products: updated,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser && changedProducts.length > 0) {
      void fsBatchUpdateProducts(changedProducts, firebaseUser, auditEntry, authorizedEmails, workspaceOwnerUid).catch((err) => {
        notify(`Error en ajuste masivo Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setBatchPercent('');
    notify(`Precios ajustados (${pct > 0 ? `+${pct}%` : `${pct}%`}) en ${catLabel}.`);
  };

  // Create Employee (strict Admin role guard)
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminAuthorized) {
      notify('Solo usuarios con rol de Administrador pueden crear empleados.');
      return;
    }
    const name = newUserName.trim();
    if (!name) {
      notify('Ingresa el nombre del empleado.');
      return;
    }
    const pin = newUserPin.trim();
    if (!/^\d{4}$/.test(pin)) {
      notify('Define un PIN numérico de exactamente 4 dígitos.');
      return;
    }
    if ((state.users || []).some((u) => u.pin === pin)) {
      notify('Ese PIN ya está asignado a otro empleado. Elige un código único.');
      return;
    }

    const emailNormalized = newUserEmail.trim().toLowerCase();
    const newUser: PosUser = {
      id: `usr-${Date.now().toString(36)}`,
      name,
      role: newUserRole,
      avatar: name.slice(0, 2).toUpperCase(),
      pin,
      area: newUserArea.trim() || (newUserRole === 'cocina' ? 'Cocina' : newUserRole === 'caja' ? 'Caja' : 'Salón'),
      email: emailNormalized || undefined,
    };

    const nextEmails = emailNormalized ? ensureEmailList([...authorizedEmails, emailNormalized]) : authorizedEmails;
    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Empleado creado',
      detail: `${name} (${newUserRole.toUpperCase()}) en ${newUser.area}`,
    };

    setState((prev) => ({
      ...prev,
      users: [...(prev.users || []), newUser],
      authorizedEmails: nextEmails,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsSaveStaffUser(newUser, firebaseUser, nextEmails, workspaceOwnerUid, auditEntry).catch((err) => {
        notify(`Error guardando empleado en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
      if (emailNormalized) {
        void fsUpdatePosPermissionsAndEmails(state.permissions, nextEmails, firebaseUser, {
          id: uid(),
          at: now,
          user: actingAdminName,
          action: 'Acceso Google autorizado',
          detail: `Correo ${emailNormalized} autorizado para terminal multi-dispositivo`,
        });
      }
    }

    setShowAddUserModal(false);
    setNewUserName('');
    setNewUserPin('');
    setShowNewUserPin(false);
    setNewUserArea('');
    setNewUserEmail('');
    notify(`Empleado "${name}" registrado y sincronizado.`);
  };

  // Open Full Edit Employee Modal (PIN masked by default)
  const openEditUserModal = (u: PosUser) => {
    if (!isAdminAuthorized) {
      notify('Solo usuarios con rol de Administrador pueden editar empleados.');
      return;
    }
    setEditingUser(u);
    setEditUserName(u.name);
    setEditUserRole(u.role);
    setEditUserArea(u.area || '');
    setEditUserAvatar(u.avatar || u.name.slice(0, 2).toUpperCase());
    setEditUserPin(u.pin || '');
    setShowEditPin(false);
    setEditUserEmail(u.email || '');
  };

  // Save Full Edit Employee (strict Admin role guard)
  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!isAdminAuthorized) {
      notify('Solo usuarios con rol de Administrador pueden actualizar empleados.');
      return;
    }

    const cleanName = editUserName.trim();
    if (!cleanName) {
      notify('El nombre es obligatorio.');
      return;
    }
    const cleanPin = editUserPin.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      notify('El PIN debe tener exactamente 4 dígitos numéricos.');
      return;
    }
    if ((state.users || []).some((u) => u.id !== editingUser.id && u.pin === cleanPin)) {
      notify('Ese PIN ya está asignado a otro empleado. Elige un código único.');
      return;
    }

    const cleanAvatar = (editUserAvatar.trim() || cleanName.slice(0, 2)).toUpperCase().slice(0, 4);
    const cleanArea = editUserArea.trim() || 'General';
    const cleanEmail = editUserEmail.trim().toLowerCase();

    const updatedUser: PosUser = {
      ...editingUser,
      name: cleanName,
      role: editUserRole,
      avatar: cleanAvatar,
      pin: cleanPin,
      area: cleanArea,
      email: cleanEmail || undefined,
    };

    const nextEmails = cleanEmail
      ? ensureEmailList([...authorizedEmails, cleanEmail])
      : authorizedEmails;
    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Empleado actualizado',
      detail: `${cleanName} · Rol: ${editUserRole.toUpperCase()} · Área: ${cleanArea}`,
    };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((x) => (x.id === editingUser.id ? updatedUser : x)),
      activeUser: prev.activeUser.id === editingUser.id ? updatedUser : prev.activeUser,
      authorizedEmails: nextEmails,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsSaveStaffUser(updatedUser, firebaseUser, nextEmails, workspaceOwnerUid, auditEntry).catch((err) => {
        notify(`Error actualizando empleado en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
      if (cleanEmail && cleanEmail !== (editingUser.email || '').toLowerCase()) {
        void fsUpdatePosPermissionsAndEmails(state.permissions, nextEmails, firebaseUser, {
          id: uid(),
          at: now,
          user: actingAdminName,
          action: 'Acceso Google autorizado',
          detail: `Correo ${cleanEmail} vinculado a ${cleanName}`,
        });
      }
    }

    setShowEditPin(false);
    setEditingUser(null);
    notify(`Datos de "${cleanName}" actualizados.`);
  };

  // Delete Employee (strict Admin role guard)
  const handleConfirmDeleteUser = (u: PosUser) => {
    if (!isAdminAuthorized) {
      notify('Solo usuarios con rol de Administrador pueden eliminar empleados.');
      setConfirmDeleteUser(null);
      return;
    }
    if (u.id === state.activeUser.id) {
      notify('No puedes eliminar al usuario con sesión activa.');
      setConfirmDeleteUser(null);
      return;
    }
    if (u.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL || u.id === 'usr-admin') {
      notify('El administrador principal no puede ser eliminado.');
      setConfirmDeleteUser(null);
      return;
    }

    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: actingAdminName,
      action: 'Empleado eliminado',
      detail: `${u.name} (${u.role.toUpperCase()}) removido del directorio`,
    };

    setState((prev) => ({
      ...prev,
      users: prev.users.filter((x) => x.id !== u.id),
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsDeleteStaffUser(u.id, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error eliminando empleado en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setConfirmDeleteUser(null);
    notify(`Empleado "${u.name}" eliminado permanentemente.`);
  };

  const handleTogglePermission = (role: UserRole, permKey: keyof RolePermissions) => {
    if (!isAdminAuthorized) {
      notify('Solo un Administrador puede modificar permisos.');
      return;
    }
    const current = state.permissions?.[role]?.[permKey] ?? false;
    const updatedRolePerms = {
      ...(state.permissions?.[role] || {}),
      [permKey]: !current,
    };
    const nextPermissions = {
      ...state.permissions,
      [role]: updatedRolePerms as RolePermissions,
    };
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: actingAdminName,
      action: 'Permiso actualizado',
      detail: `Rol ${role.toUpperCase()}: ${String(permKey)} = ${!current ? 'SI' : 'NO'}`,
    };

    setState((prev) => ({
      ...prev,
      permissions: nextPermissions,
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsUpdatePosPermissionsAndEmails(nextPermissions, authorizedEmails, firebaseUser, auditEntry).catch((err) => {
        notify(`Error actualizando permisos en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    notify(`Permiso actualizado para rol ${role.toUpperCase()}.`);
  };

  const handleAddAuthorizedEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminAuthorized) {
      notify('Solo un Administrador puede autorizar cuentas de Google.');
      return;
    }
    const emailClean = newAuthEmail.trim().toLowerCase();
    if (!emailClean || !emailClean.includes('@')) {
      notify('Ingresa un correo de Google válido.');
      return;
    }
    const nextEmails = ensureEmailList([...authorizedEmails, emailClean]);
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: actingAdminName,
      action: 'Operador Google autorizado',
      detail: `Correo ${emailClean} agregado a lista autorizada`,
    };
    setState((prev) => ({ ...prev, authorizedEmails: nextEmails, audit: [...prev.audit, auditEntry] }));
    if (firebaseUser) {
      void fsUpdatePosPermissionsAndEmails(state.permissions, nextEmails, firebaseUser, auditEntry).catch((err) => {
        notify(`Error sincronizando autorización: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    setNewAuthEmail('');
    notify(`Correo ${emailClean} autorizado.`);
  };

  const handleRemoveAuthorizedEmail = (emailToRemove: string) => {
    if (!isAdminAuthorized) {
      notify('Solo un Administrador puede revocar cuentas autorizadas.');
      return;
    }
    if (emailToRemove === BOOTSTRAPPED_ADMIN_EMAIL) {
      notify('El administrador principal no puede ser removido.');
      return;
    }
    const nextEmails = ensureEmailList(authorizedEmails.filter((em) => em !== emailToRemove));
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: actingAdminName,
      action: 'Operador Google revocado',
      detail: `Correo ${emailToRemove} removido de terminales POS`,
    };
    setState((prev) => ({ ...prev, authorizedEmails: nextEmails, audit: [...prev.audit, auditEntry] }));
    if (firebaseUser) {
      void fsUpdatePosPermissionsAndEmails(state.permissions, nextEmails, firebaseUser, auditEntry).catch((err) => {
        notify(`Error revocando autorización: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }
    notify(`Acceso de ${emailToRemove} revocado.`);
  };

  const handleSaveDeviceStation = (st: DeviceStation) => {
    setStationConfig(st);
    const stationNames: Record<DeviceStation, string> = {
      todos: 'Estación Central / Multi-Área',
      comandero: 'Comandero Móvil (Mesero)',
      caja: 'Caja Principal (Cobros)',
      cocina: 'Cocina Caliente (KDS)',
      barra: 'Barra de Bebidas (KDS)',
    };

    setState((prev) => ({
      ...prev,
      deviceConfig: {
        station: st,
        stationName: stationNames[st],
        autoLockMinutes: prev.deviceConfig?.autoLockMinutes || 0,
      },
    }));
    notify(`Dispositivo configurado como: ${stationNames[st]}.`);
  };

  // Save Restaurant & Receipt Settings
  const handleSaveRestaurantConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminAuthorized) {
      notify('Solo un Administrador puede guardar la configuración.');
      return;
    }
    const tip = Math.min(30, Math.max(0, Math.round(Number(cfgTipPct) || 0)));
    const lockMins = Math.min(120, Math.max(0, Math.round(Number(cfgAutoLock) || 0)));

    const nextConfig: RestaurantConfig = {
      ...state.config,
      name: cfgName.trim() || 'Barbachu',
      tagline: cfgTagline.trim() || 'Restaurante Bar',
      address: cfgAddress.trim(),
      phone: cfgPhone.trim(),
      receiptFooter: cfgFooter.trim() || '¡Gracias por su preferencia!',
      suggestedTipPct: tip,
      autoLockMinutes: lockMins,
    };

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: actingAdminName,
      action: 'Configuración actualizada',
      detail: `Negocio: ${nextConfig.name} · Propina sugerida: ${tip}% · Auto-bloqueo: ${lockMins} min`,
    };

    setState((prev) => ({
      ...prev,
      config: nextConfig,
      deviceConfig: { ...prev.deviceConfig, autoLockMinutes: lockMins },
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      setSavingConfig(true);
      try {
        await fsUpdateRestaurantConfig(nextConfig, firebaseUser, authorizedEmails, auditEntry);
        notify('Configuración del restaurante guardada en Cloud Firestore.');
      } catch (err) {
        notify(`Error guardando configuración: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      } finally {
        setSavingConfig(false);
      }
    } else {
      notify('Configuración guardada.');
    }
  };

  // Retroactive Firestore Demo-Data Cleanup
  const handleRunDemoCleanup = async () => {
    if (!isAdminAuthorized) {
      notify('Solo un Administrador puede ejecutar limpieza de datos.');
      return;
    }
    if (!cleanLegacyStaff && !cleanInventory && !cleanTestOrders) {
      notify('Selecciona al menos una opción de limpieza.');
      return;
    }

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      user: actingAdminName,
      action: 'Limpieza de datos de prueba',
      detail: `Personal: ${cleanLegacyStaff ? 'Sí' : 'No'} · Inventario en ceros: ${cleanInventory ? 'Sí' : 'No'} · Ventas/Turno: ${cleanTestOrders ? 'Sí' : 'No'}`,
    };

    setCleaningDemo(true);
    try {
      if (firebaseUser) {
        const res = await fsCleanupDemoData(
          {
            removeLegacyUsers: cleanLegacyStaff,
            resetInventoryStock: cleanInventory,
            resetShiftAndTestOrders: cleanTestOrders,
          },
          firebaseUser,
          authorizedEmails,
          auditEntry
        );
        notify(
          `Limpieza completada (${res.removedStaff} perfiles demo, ${res.resetInventory} insumos en cero, ${res.resetOrdersAndSales} registros reiniciados).`
        );
      }

      const legacyIds = new Set([
        'usr-caja',
        'usr-mesero1',
        'usr-mesero2',
        'usr-mesero3',
        'usr-cocina',
        'usr-barra',
      ]);

      setState((prev) => {
        const nextInv = { ...prev.inventory };
        if (cleanInventory) {
          for (const key of Object.keys(nextInv)) {
            const k = Number(key);
            nextInv[k] = { ...nextInv[k], stock: 0, minStock: 0 };
          }
        }
        return {
          ...prev,
          users: cleanLegacyStaff ? prev.users.filter((u) => !legacyIds.has(u.id)) : prev.users,
          staffClock: cleanLegacyStaff
            ? prev.staffClock.filter((c) => c.id !== 'clk-1' && !legacyIds.has(c.userId))
            : prev.staffClock,
          inventory: nextInv,
          orders: cleanTestOrders ? [] : prev.orders,
          sales: cleanTestOrders ? [] : prev.sales,
          nextOrderNumber: cleanTestOrders ? 1 : prev.nextOrderNumber,
          audit: [...prev.audit, auditEntry],
        };
      });
      setConfirmCleanupModal(false);
    } catch (err) {
      notify(`Error en limpieza: ${err instanceof Error ? err.message : 'Sin permisos'}`);
    } finally {
      setCleaningDemo(false);
    }
  };

  // CSV Downloads
  const downloadProductsCsv = () => {
    const headers = ['Clave', 'Descripción', 'Categoría', 'Grupo', 'Precio_MXN', 'Estado_Venta'];
    const rows = [headers];
    state.products.forEach((p) => {
      rows.push([
        p.key,
        p.name,
        p.category,
        p.group,
        (p.priceCents / 100).toFixed(2),
        p.saleEnabled ? 'HABILITADO' : 'DESHABILITADO',
      ]);
    });
    const csvContent =
      '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barbachu-catalogo-productos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Catálogo de productos descargado en CSV.');
  };

  const downloadIngredientsCsv = () => {
    const headers = ['Clave', 'Descripción', 'Unidad', 'Categoría', 'Costo_Unitario_MXN', 'Stock_Actual', 'Alerta_Minima'];
    const rows = [headers];
    Object.values(state.inventory).forEach((i) => {
      rows.push([
        String(i.clave),
        i.descripcion,
        i.unidad,
        i.categoria,
        i.costo.toFixed(2),
        String(i.stock),
        String(i.minStock),
      ]);
    });
    const csvContent =
      '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barbachu-catalogo-insumos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Catálogo de insumos descargado en CSV.');
  };

  const appUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://barbachu-pos.web.app';

  // Admin PIN lock gate: strictly enforces role === 'admin' (no non-admin bypass)
  if (!isAdminAuthorized) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full ios-glass-card p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#e05252]/15 border border-[#e05252]/30 flex items-center justify-center text-[#e05252]">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
              Acceso Exclusivo de Administrador
            </h3>
            <p className="text-xs text-[rgba(240,230,211,0.72)] leading-relaxed">
              Operador actual: <strong className="text-white">{state.activeUser.name}</strong> ({state.activeUser.role.toUpperCase()}).
              Solo cuentas con rol de Administrador pueden acceder al catálogo, empleados y configuración.
            </p>
          </div>
          <IosPinPadModal
            open={true}
            title="Autorización de Administrador"
            subtitle={`Operador activo: ${state.activeUser.name} (${state.activeUser.role.toUpperCase()}). Ingresa el PIN de un Administrador para continuar.`}
            allowCancel={Boolean(onClose)}
            onCancel={onClose}
            cancelLabel="Volver al TPV"
            onValidatePin={(pinVal) => {
              const matched = state.users.find((u) => u.role === 'admin' && u.pin === pinVal);
              if (matched) {
                setUnlockedByAdmin(matched);
                setIsAdminUnlocked(true);
                notify(`Acceso administrativo concedido (${matched.name}).`);
                return true;
              }
              return false;
            }}
          />
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; count?: number; icon: React.ReactNode }[] = [
    { id: 'catalogo', label: 'Catálogo', count: state.products.length, icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'usuarios', label: 'Gestión de Empleados', count: state.users?.length || 0, icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'permisos', label: 'Permisos', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'dispositivos', label: 'Dispositivos & QR', icon: <Smartphone className="w-3.5 h-3.5" /> },
    { id: 'alertas', label: 'Alertas', count: lowStockItems.length, icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    {
      id: 'asistencia',
      label: 'Asistencia',
      count: state.staffClock?.filter((c) => c.status === 'activo').length || 0,
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    { id: 'configuracion', label: 'Ajustes & Limpieza', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'archivos', label: 'Respaldos', icon: <FolderArchive className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6 text-left">
      {/* Top Apple Frosted Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 ios-glass-card">
        <div className="flex items-center gap-3.5">
          <BarbachuLogo className="w-9 h-9 drop-shadow" />
          <div>
            <h2 className="font-serif font-bold text-xl text-white tracking-[-0.02em] text-balance">
              Panel de Administración y Control
            </h2>
            <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5">
              Autorizado como <span className="text-[#e8d090] font-semibold">{actingAdminName}</span> · Rol Admin
              {isFirebaseAdmin ? ' · Cloud Sync' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {state.activeUser.role !== 'admin' && (
            <button
              type="button"
              onClick={() => {
                setUnlockedByAdmin(null);
                setIsAdminUnlocked(false);
                notify('Panel administrativo bloqueado.');
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#e05252]/15 hover:bg-[#e05252]/25 text-[#e05252] text-xs font-semibold border border-[#e05252]/30 transition-all active:scale-95 inline-flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Bloquear Admin</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold border border-white/10 transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al TPV</span>
            </button>
          )}
        </div>
      </div>

      {/* iOS Frosted Tab Bar */}
      <div className="flex flex-wrap gap-1.5 p-1.5 ios-glass-card">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all duration-150 active:scale-[0.98] flex items-center gap-2 ${
                active
                  ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold shadow-md'
                  : 'text-[rgba(240,230,211,0.72)] hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs tabular-nums font-bold ${
                    active ? 'bg-black/15 text-[#0a0a0b]' : 'bg-white/10 text-white'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CATALOGO & PRECIOS */}
      {activeTab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Precios y Productos Operativos</h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Edita precios en línea o agrega nuevos platillos al menú digital y comandero.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#25d366] hover:bg-[#20b858] text-[#0a0a0b] font-bold text-xs shadow-md whitespace-nowrap inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Producto</span>
            </button>
          </div>

          <div className="p-4 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[rgba(240,230,211,0.5)] absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Buscar platillo por nombre, clave o categoría..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Ajuste % (ej. 5)"
                  value={batchPercent}
                  onChange={(e) => setBatchPercent(e.target.value)}
                  className="w-36 min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
                <button
                  type="button"
                  onClick={handleApplyBatchAdjustment}
                  className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#e8d090] whitespace-nowrap inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Ajustar %</span>
                </button>
                <button
                  type="button"
                  onClick={downloadProductsCsv}
                  className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white whitespace-nowrap inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    selectedCat === cat
                      ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b] font-bold'
                      : 'bg-white/[0.04] text-[rgba(240,230,211,0.72)] border-white/10 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 overflow-x-auto">
            <div className="flex justify-between items-center mb-3 text-xs text-[rgba(240,230,211,0.6)]">
              <span className="tabular-nums">Mostrando {filteredProducts.length} productos</span>
              <span className="text-[#e8d090]">Edita el monto y pulsa Guardar para sincronizar</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[rgba(240,230,211,0.6)]">
                  <th className="pb-3 pl-2">Clave</th>
                  <th className="pb-3">Producto</th>
                  <th className="pb-3">Categoría</th>
                  <th className="pb-3">Precio Actual</th>
                  <th className="pb-3">Nuevo Precio ($ MXN)</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3 pr-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredProducts.map((prod) => {
                  const basePriceStr = String(prod.priceCents / 100);
                  const isDirty =
                    inlinePrices[prod.key] !== undefined &&
                    inlinePrices[prod.key] !== basePriceStr;
                  const currentVal =
                    inlinePrices[prod.key] !== undefined
                      ? inlinePrices[prod.key]
                      : basePriceStr;

                  return (
                    <tr key={prod.key} className="hover:bg-white/[0.03]">
                      <td className="py-2.5 pl-2 tabular-nums text-[rgba(240,230,211,0.6)]">{prod.key}</td>
                      <td className="py-2.5 font-semibold text-white max-w-xs truncate">{prod.name}</td>
                      <td className="py-2.5 text-[rgba(240,230,211,0.68)]">{prod.category}</td>
                      <td className="py-2.5 tabular-nums font-bold text-[#e8d090]">
                        {formatMoney(prod.priceCents)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#e8d090] font-bold">$</span>
                          <input
                            type="number"
                            step="0.5"
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInlinePrices((prev) => ({ ...prev, [prod.key]: val }));
                            }}
                            className={`w-24 min-h-[38px] px-2.5 py-1 rounded-xl bg-[#0a0a0b]/80 border text-white tabular-nums font-semibold text-xs focus:outline-none ${
                              isDirty ? 'border-[#c8a84b]' : 'border-white/10'
                            }`}
                          />
                          {isDirty && (
                            <button
                              type="button"
                              onClick={() => handleSaveInlinePrice(prod)}
                              className="w-9 h-9 rounded-xl bg-[#25d366] text-[#0a0a0b] font-bold flex items-center justify-center shadow"
                              title="Guardar precio"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleProductSale(prod)}
                          className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold uppercase transition-all ${
                            prod.saleEnabled
                              ? 'bg-[#122822] text-[#25d366] border border-[#25d366]/40'
                              : 'bg-[#e05252]/15 text-[#e05252] border border-[#e05252]/40'
                          }`}
                        >
                          {prod.saleEnabled ? 'Activo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="py-2.5 pr-2 text-right space-x-1.5 whitespace-nowrap">
                        {isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveInlinePrice(prod)}
                            className="min-h-[36px] px-3 py-1 rounded-xl bg-[#c8a84b] text-[#0a0a0b] font-bold text-xs hover:bg-[#e8d090]"
                          >
                            Guardar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProd(prod)}
                          className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[#e05252]/15 hover:bg-[#e05252]/30 text-[#e05252] font-semibold text-xs border border-[#e05252]/30 inline-flex items-center gap-1"
                          title="Eliminar producto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: GESTIÓN DE EMPLEADOS (FULL CRUD + HIDDEN PINS + ADMIN GUARD) */}
      {activeTab === 'usuarios' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 ios-glass-card">
            <div>
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Gestión de Empleados
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5">
                Administra perfiles, roles, áreas y correos. Los PINs permanecen ocultos por defecto para proteger los accesos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewUserName('');
                setNewUserRole('mesero');
                setNewUserArea('');
                setNewUserPin('');
                setShowNewUserPin(false);
                setNewUserEmail('');
                setShowAddUserModal(true);
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#25d366] hover:bg-[#20b858] active:scale-[0.98] text-[#0a0a0b] font-bold text-xs shadow-md whitespace-nowrap inline-flex items-center gap-2 transition-all duration-150"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Empleado</span>
            </button>
          </div>

          {(state.users || []).some((u) => u.role === 'admin' && u.pin === '0000') && (
            <div className="p-3.5 rounded-2xl bg-[#e5a43b]/15 border border-[#e5a43b]/45 text-xs text-[#e8d090] flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#e5a43b]" />
              <span>
                Seguridad: Hay una cuenta de Administrador con el PIN predeterminado <strong>0000</strong>. Edítala para asignar un PIN secreto.
              </span>
            </div>
          )}

          {/* Search & Apple Role Segmented Filter */}
          <div className="p-4 ios-glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[rgba(240,230,211,0.5)] absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Buscar empleado por nombre, área o correo..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
              />
              {employeeSearch && (
                <button
                  type="button"
                  onClick={() => setEmployeeSearch('')}
                  aria-label="Limpiar búsqueda de empleados"
                  className="absolute right-2 top-1.5 w-8 h-8 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-[#0a0a0b]/75 border border-white/10">
              {(['todos', 'admin', 'caja', 'mesero', 'cocina'] as const).map((roleOpt) => {
                const active = employeeRoleFilter === roleOpt;
                return (
                  <button
                    key={roleOpt}
                    type="button"
                    onClick={() => setEmployeeRoleFilter(roleOpt)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all duration-150 ${
                      active
                        ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold shadow-sm'
                        : 'text-[rgba(240,230,211,0.72)] hover:text-white'
                    }`}
                  >
                    {roleOpt === 'todos' ? 'Todos' : roleOpt}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="p-10 ios-glass-card text-center text-xs text-[rgba(240,230,211,0.68)]">
              No hay empleados registrados que coincidan con el filtro actual.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((u) => {
                const isPrimaryAdmin =
                  u.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL || u.id === 'usr-admin';
                const isCurrentSession = u.id === state.activeUser.id;
                return (
                  <div
                    key={u.id}
                    className="p-5 ios-glass-card space-y-4 transition-all duration-150 hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-[#173c34] text-[#e8d090] font-bold text-sm flex items-center justify-center border border-[#c8a84b]/40 shrink-0">
                          {u.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white text-[15px] truncate tracking-[-0.01em]">
                            {u.name}
                          </div>
                          <div className="text-xs text-[rgba(240,230,211,0.68)] uppercase font-semibold tracking-[0.03em]">
                            {u.role} · {u.area || 'General'}
                          </div>
                          <div className="text-xs text-[#e8d090]/85 truncate mt-0.5">
                            {u.email || 'Sin correo vinculado'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[rgba(240,230,211,0.55)] block text-xs uppercase tracking-[0.06em]">
                          PIN de Acceso
                        </span>
                        <span
                          aria-label="PIN oculto por seguridad"
                          className="font-mono font-bold text-[#e8d090] tracking-[0.28em] text-sm select-none"
                        >
                          ••••
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[rgba(240,230,211,0.55)] block text-xs uppercase tracking-[0.06em]">
                          Estado
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isCurrentSession ? 'text-[#25d366]' : 'text-white'
                          }`}
                        >
                          {isCurrentSession ? 'Sesión Activa' : 'Registrado'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openEditUserModal(u)}
                        className="flex-1 min-h-[44px] px-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.98] border border-white/10 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all duration-150"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setState((prev) => ({ ...prev, activeUser: u }));
                          notify(`Sesión cambiada a: ${u.name}`);
                        }}
                        className="min-h-[44px] px-3 rounded-2xl bg-[#173c34] text-[#e8d090] text-xs font-bold hover:bg-[#28584c] active:scale-[0.98] inline-flex items-center justify-center gap-1.5 transition-all duration-150"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Activar</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPrimaryAdmin || isCurrentSession}
                        onClick={() => setConfirmDeleteUser(u)}
                        title={
                          isPrimaryAdmin
                            ? 'El administrador principal está protegido'
                            : isCurrentSession
                            ? 'No puedes eliminar el usuario activo'
                            : 'Eliminar empleado'
                        }
                        className="w-[44px] h-[44px] rounded-2xl bg-[#e05252]/15 hover:bg-[#e05252]/30 active:scale-[0.96] text-[#e05252] border border-[#e05252]/30 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Authorized Google Accounts */}
          <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-4">
            <div>
              <h4 className="font-serif font-bold text-base text-white">
                Cuentas Google Autorizadas (Sincronización Firestore)
              </h4>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Solo estos correos verificados pueden abrir sesión en tablets, comandero y caja.
              </p>
            </div>
            <form onSubmit={handleAddAuthorizedEmail} className="flex flex-col sm:flex-row gap-2 text-xs">
              <input
                type="email"
                placeholder="operador@gmail.com"
                value={newAuthEmail}
                onChange={(e) => setNewAuthEmail(e.target.value)}
                className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold whitespace-nowrap"
              >
                + Autorizar Correo
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {authorizedEmails.map((em) => (
                <div
                  key={em}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.05] border border-white/10 text-xs text-white"
                >
                  <span className="font-mono">{em}</span>
                  {em === BOOTSTRAPPED_ADMIN_EMAIL ? (
                    <span className="text-xs font-bold text-[#c8a84b] uppercase">Admin</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveAuthorizedEmail(em)}
                      className="text-[#e05252] hover:text-white font-bold px-1"
                      title="Revocar acceso"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MATRIZ DE PERMISOS */}
      {activeTab === 'permisos' && (
        <div className="space-y-4">
          <div className="p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10 space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Matriz de Permisos por Rol</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">
              Configura qué operaciones puede autorizar cada perfil operativo dentro del POS.
            </p>
          </div>

          <div className="p-4 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[rgba(240,230,211,0.6)]">
                  <th className="pb-3 pl-2">Acción / Permiso Operativo</th>
                  {(['admin', 'caja', 'mesero', 'cocina'] as UserRole[]).map((r) => (
                    <th key={r} className="pb-3 text-center uppercase font-bold text-white">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {[
                  { key: 'canTakeOrders', label: 'Tomar comandas y agregar productos en TPV' },
                  { key: 'canCollectPayment', label: 'Cobrar cuentas y registrar formas de pago' },
                  { key: 'canCashShiftCut', label: 'Realizar corte de caja Z y movimientos de efectivo' },
                  { key: 'canApplyDiscount', label: 'Aplicar descuentos a cuentas' },
                  { key: 'canCancelOrders', label: 'Cancelar productos o cuentas completas' },
                  { key: 'canAccessKds', label: 'Acceder a pantalla KDS de Cocina y Barra' },
                  { key: 'canEditCatalog', label: 'Cambiar precios y agregar productos al catálogo' },
                  { key: 'canViewReports', label: 'Consultar reportes financieros y métricas' },
                  { key: 'canManageUsers', label: 'Administrar empleados, áreas y PINs' },
                ].map((row) => (
                  <tr key={row.key} className="hover:bg-white/[0.03]">
                    <td className="py-3.5 pl-2 font-semibold text-white">{row.label}</td>
                    {(['admin', 'caja', 'mesero', 'cocina'] as UserRole[]).map((role) => {
                      const isAllowed =
                        state.permissions?.[role]?.[row.key as keyof RolePermissions] ?? false;
                      const isAdmin = role === 'admin';
                      return (
                        <td key={role} className="py-3 text-center">
                          <input
                            type="checkbox"
                            disabled={isAdmin}
                            checked={isAllowed}
                            onChange={() =>
                              handleTogglePermission(role, row.key as keyof RolePermissions)
                            }
                            className="w-5 h-5 rounded accent-[#c8a84b] bg-[#0a0a0b] border-white/20 cursor-pointer disabled:opacity-50"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DISPOSITIVOS & QR LOCAL */}
      {activeTab === 'dispositivos' && (
        <div className="space-y-6">
          <div className="p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10 space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">
              Conexión de Dispositivos por Área de Trabajo
            </h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">
              Vincula tablets de meseros, KDS de cocina/barra y caja usando código QR local sin exponer datos a servidores externos.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 text-center space-y-4">
              <div className="inline-flex items-center gap-2 text-white font-serif font-bold text-base">
                <QrCode className="w-4 h-4 text-[#c8a84b]" />
                <span>Código QR Local</span>
              </div>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Escanea con cualquier celular o tablet en la misma red para abrir la terminal:
              </p>

              <div className="flex justify-center my-3">
                <div className="p-4 bg-[#0a0a0b] rounded-3xl border border-[#c8a84b]/40 shadow-xl inline-block">
                  <QRCodeSVG
                    value={appUrl}
                    size={176}
                    bgColor="#0a0a0b"
                    fgColor="#e8d090"
                    level="M"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#0a0a0b]/80 rounded-2xl border border-white/10 text-xs font-mono text-[#e8d090] break-all">
                {appUrl}
              </div>

              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(appUrl);
                  notify('Enlace copiado al portapapeles.');
                }}
                className="w-full min-h-[44px] py-2.5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs transition-all shadow-md inline-flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copiar Enlace Directo</span>
              </button>
            </div>

            <div className="lg:col-span-7 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-4">
              <h4 className="font-serif font-bold text-base text-white">
                Perfil de Estación de ESTE Dispositivo
              </h4>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Define qué vistas prioriza esta tablet o pantalla dentro del restaurante:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  {
                    id: 'todos' as DeviceStation,
                    label: 'Estación Central',
                    desc: 'Acceso completo a comandero, caja, mesas, KDS e informes.',
                  },
                  {
                    id: 'comandero' as DeviceStation,
                    label: 'Comandero Móvil',
                    desc: 'Enfocado en toma ágil de órdenes en mesas.',
                  },
                  {
                    id: 'caja' as DeviceStation,
                    label: 'Caja Mostrador',
                    desc: 'Optimizado para cobros, cambio y corte Z.',
                  },
                  {
                    id: 'cocina' as DeviceStation,
                    label: 'KDS Cocina Caliente',
                    desc: 'Tickets exclusivos de cocina y platillos.',
                  },
                  {
                    id: 'barra' as DeviceStation,
                    label: 'KDS Barra de Bebidas',
                    desc: 'Órdenes de cerveza, micheladas y bebidas.',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSaveDeviceStation(item.id)}
                    className={`min-h-[76px] p-4 rounded-2xl border text-left transition-all ${
                      stationConfig === item.id
                        ? 'bg-[#173c34] border-[#c8a84b] shadow-lg'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="font-bold text-white mb-1">{item.label}</div>
                    <div className="text-xs text-[rgba(240,230,211,0.68)]">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ALERTAS DE INVENTARIO */}
      {activeTab === 'alertas' && (
        <div className="space-y-4">
          <div className="p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10 space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Alertas de Stock Mínimo</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">
              Insumos con umbral mínimo configurado (&gt; 0) cuya existencia actual requiere resurtido.
            </p>
          </div>

          <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-3">
            {lowStockItems.length === 0 ? (
              <div className="py-12 text-center text-[rgba(240,230,211,0.68)] text-sm">
                Sin alertas activas. Configura umbrales mínimos en Inventario conforme recibas mercancía real.
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockItems.map((item) => (
                  <div
                    key={item.clave}
                    className="p-3.5 rounded-2xl bg-white/[0.04] border border-[#e05252]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#e05252]" />
                        <span>{item.descripcion}</span>
                        <span className="text-[rgba(240,230,211,0.55)] tabular-nums">(Clave {item.clave})</span>
                      </div>
                      <div className="text-[rgba(240,230,211,0.65)] mt-0.5 tabular-nums">
                        Categoría: {item.categoria} · Costo: ${item.costo.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right tabular-nums">
                        <div className="font-bold text-sm text-[#e05252]">
                          {item.stock} {item.unidad}
                        </div>
                        <div className="text-xs text-[rgba(240,230,211,0.55)]">
                          Mínimo: {item.minStock} {item.unidad}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMinStockItem(item);
                          setEditingMinStockVal(String(item.minStock));
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.06] text-white border border-white/10 font-semibold hover:border-[#c8a84b]"
                      >
                        Ajustar Mínimo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ASISTENCIA */}
      {activeTab === 'asistencia' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Reloj Checador & Asistencia</h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">
                Registro real de entradas y salidas del personal activo en turno.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setClockSelectedUserId(state.users[0]?.id || '');
                setClockModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#25d366] hover:bg-[#20b858] text-[#0a0a0b] font-bold text-xs shadow-md whitespace-nowrap inline-flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              <span>Registrar Entrada</span>
            </button>
          </div>

          <div className="p-4 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 overflow-x-auto">
            {(state.staffClock || []).length === 0 ? (
              <div className="py-12 text-center text-xs text-[rgba(240,230,211,0.6)]">
                Sin registros de asistencia todavía. Pulsa "Registrar Entrada" cuando llegue el personal.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[rgba(240,230,211,0.6)]">
                    <th className="pb-3 pl-2">Empleado</th>
                    <th className="pb-3">Rol</th>
                    <th className="pb-3">Entrada</th>
                    <th className="pb-3">Salida</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3 pr-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {(state.staffClock || []).map((rec) => (
                    <tr key={rec.id} className="hover:bg-white/[0.03]">
                      <td className="py-3 pl-2 font-bold text-white">{rec.userName}</td>
                      <td className="py-3 text-[rgba(240,230,211,0.68)] uppercase">{rec.role}</td>
                      <td className="py-3 tabular-nums text-[#e8d090]">
                        {new Date(rec.clockIn).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <span className="block text-xs text-[rgba(240,230,211,0.55)]">
                          {new Date(rec.clockIn).toLocaleDateString('es-MX')}
                        </span>
                      </td>
                      <td className="py-3 tabular-nums text-[rgba(240,230,211,0.68)]">
                        {rec.clockOut
                          ? new Date(rec.clockOut).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            rec.status === 'activo'
                              ? 'bg-[#122822] text-[#25d366] border border-[#25d366]/40'
                              : 'bg-white/[0.06] text-[rgba(240,230,211,0.6)]'
                          }`}
                        >
                          {rec.status === 'activo' ? 'En Turno' : 'Finalizado'}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        {rec.status === 'activo' ? (
                          <button
                            type="button"
                            onClick={() => {
                              const now = new Date().toISOString();
                              const updatedRec = { ...rec, clockOut: now, status: 'finalizado' as const };
                              const auditEntry: AuditLogEntry = {
                                id: uid(),
                                at: now,
                                user: state.activeUser.name,
                                action: 'Reloj Checador: Salida',
                                detail: `${rec.userName} finalizó turno`,
                              };
                              setState((prev) => ({
                                ...prev,
                                staffClock: (prev.staffClock || []).map((r) =>
                                  r.id === rec.id ? updatedRec : r
                                ),
                                audit: [...prev.audit, auditEntry],
                              }));
                              if (firebaseUser) {
                                void fsSaveTimeClock(
                                  updatedRec,
                                  false,
                                  firebaseUser,
                                  authorizedEmails,
                                  auditEntry
                                );
                              }
                              notify(`Salida registrada para ${rec.userName}.`);
                            }}
                            className="min-h-[36px] px-3 py-1 rounded-xl bg-[#e05252]/20 hover:bg-[#e05252]/30 text-[#e05252] font-bold text-xs border border-[#e05252]/40"
                          >
                            Registrar Salida
                          </button>
                        ) : (
                          <span className="text-[rgba(240,230,211,0.5)]">Completado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: AJUSTES, LIMPIEZA DE DATOS DE PRUEBA Y BITACORA */}
      {activeTab === 'configuracion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Business & Ticket Settings */}
            <form
              onSubmit={handleSaveRestaurantConfig}
              className="lg:col-span-7 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-4"
            >
              <div className="pb-3 border-b border-white/10">
                <h3 className="font-serif font-bold text-lg text-white">
                  Configuración del Restaurante y Ticket
                </h3>
                <p className="text-xs text-[rgba(240,230,211,0.68)]">
                  Personaliza encabezados de ticket 80mm, propina sugerida y auto-bloqueo por inactividad.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Nombre Comercial
                  </label>
                  <input
                    value={cfgName}
                    onChange={(e) => setCfgName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Subtítulo / Giro
                  </label>
                  <input
                    value={cfgTagline}
                    onChange={(e) => setCfgTagline(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Dirección del Establecimiento (para Ticket)
                </label>
                <input
                  value={cfgAddress}
                  onChange={(e) => setCfgAddress(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Teléfono en Ticket (opcional)
                  </label>
                  <input
                    placeholder="Opcional"
                    value={cfgPhone}
                    onChange={(e) => setCfgPhone(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Propina Sugerida Pre-cuenta (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={cfgTipPct}
                    onChange={(e) => setCfgTipPct(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white tabular-nums focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Auto-Bloqueo POS
                  </label>
                  <select
                    value={cfgAutoLock}
                    onChange={(e) => setCfgAutoLock(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  >
                    <option value="0">Desactivado</option>
                    <option value="2">2 minutos</option>
                    <option value="5">5 minutos</option>
                    <option value="10">10 minutos</option>
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                  </select>
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Mensaje al Pie del Ticket
                </label>
                <input
                  value={cfgFooter}
                  onChange={(e) => setCfgFooter(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold text-xs shadow-md disabled:opacity-50"
              >
                {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </form>

            {/* Retroactive Demo Cleanup Tool */}
            <div className="lg:col-span-5 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-[#e05252]/30 space-y-4">
              <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                <div className="w-9 h-9 rounded-2xl bg-[#e05252]/15 border border-[#e05252]/30 flex items-center justify-center text-[#e05252] shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-white">
                    Limpiar Datos de Prueba en Firestore
                  </h3>
                  <p className="text-xs text-[rgba(240,230,211,0.68)]">
                    Elimina registros ficticios guardados anteriormente dejando intacto tu catálogo SoftRestaurant.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanLegacyStaff}
                    onChange={(e) => setCleanLegacyStaff(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#c8a84b]"
                  />
                  <span>
                    <strong className="text-white block">Eliminar personal y checadas ficticias</strong>
                    <span className="text-[rgba(240,230,211,0.6)]">
                      Remueve cuentas demo iniciales (Caja Mostrador, Andrea, Diego, Mariana, Jefe de Cocina, Bartender).
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanInventory}
                    onChange={(e) => setCleanInventory(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#c8a84b]"
                  />
                  <span>
                    <strong className="text-white block">Reiniciar existencias de inventario a 0</strong>
                    <span className="text-[rgba(240,230,211,0.6)]">
                      Pone en ceros los 121 insumos para capturar tu conteo físico real sin alertas falsas.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanTestOrders}
                    onChange={(e) => setCleanTestOrders(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#e05252]"
                  />
                  <span>
                    <strong className="text-white block">Reiniciar comandas, tickets y turno en $0.00</strong>
                    <span className="text-[rgba(240,230,211,0.6)]">
                      Opcional: limpia pedidos y ventas de prueba y abre turno limpio en $0.00 MXN.
                    </span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setConfirmCleanupModal(true)}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-[#e05252]/20 hover:bg-[#e05252]/30 text-[#e05252] border border-[#e05252]/40 font-bold text-xs"
              >
                Ejecutar Limpieza en Firestore
              </button>
            </div>
          </div>

          {/* Audit Log Viewer */}
          <div className="p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-[#c8a84b]" />
                <div>
                  <h3 className="font-serif font-bold text-lg text-white">Bitácora de Auditoría Operativa</h3>
                  <p className="text-xs text-[rgba(240,230,211,0.68)]">
                    Historial inmutable de acciones críticas, descuentos, cobros y cambios de personal.
                  </p>
                </div>
              </div>
              <input
                type="text"
                placeholder="Filtrar por usuario, acción o detalle..."
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] sm:w-72 focus:outline-none focus:border-[#c8a84b]"
              />
            </div>

            {filteredAudit.length === 0 ? (
              <div className="py-10 text-center text-xs text-[rgba(240,230,211,0.6)]">
                Sin eventos registrados que coincidan con el filtro.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[rgba(240,230,211,0.6)]">
                      <th className="pb-2.5 pl-2">Fecha / Hora</th>
                      <th className="pb-2.5">Usuario</th>
                      <th className="pb-2.5">Acción</th>
                      <th className="pb-2.5">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredAudit.map((entry) => (
                      <tr key={entry.id} className="hover:bg-white/[0.03]">
                        <td className="py-2.5 pl-2 tabular-nums text-[rgba(240,230,211,0.6)] whitespace-nowrap">
                          {new Date(entry.at).toLocaleString('es-MX', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 font-semibold text-white whitespace-nowrap">{entry.user}</td>
                        <td className="py-2.5 font-semibold text-[#e8d090] whitespace-nowrap">
                          {entry.action}
                        </td>
                        <td className="py-2.5 text-[rgba(240,230,211,0.78)]">
                          {entry.detail}
                          {entry.reason && (
                            <span className="block text-xs text-[#e05252]">Motivo: {entry.reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: ARCHIVOS Y RESPALDOS */}
      {activeTab === 'archivos' && (
        <div className="space-y-4">
          <div className="p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10 space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Exportaciones y Respaldos Locales</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">
              Descarga tus catálogos en formato CSV compatible con Excel o un respaldo completo en JSON.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <button
              type="button"
              onClick={downloadProductsCsv}
              className="min-h-[84px] p-5 rounded-[22px] bg-[#161618]/80 hover:bg-white/[0.06] border border-white/10 text-left flex items-center justify-between transition-all"
            >
              <div>
                <div className="font-bold text-white text-sm mb-1">Catálogo de Productos</div>
                <div className="text-[rgba(240,230,211,0.6)]">Formato CSV · {state.products.length} registros</div>
              </div>
              <FileSpreadsheet className="w-6 h-6 text-[#c8a84b] shrink-0" />
            </button>

            <button
              type="button"
              onClick={downloadIngredientsCsv}
              className="min-h-[84px] p-5 rounded-[22px] bg-[#161618]/80 hover:bg-white/[0.06] border border-white/10 text-left flex items-center justify-between transition-all"
            >
              <div>
                <div className="font-bold text-white text-sm mb-1">Insumos e Inventario</div>
                <div className="text-[rgba(240,230,211,0.6)]">
                  Formato CSV · {Object.keys(state.inventory).length} insumos
                </div>
              </div>
              <FileSpreadsheet className="w-6 h-6 text-[#25d366] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                const sanitizedBackup = {
                  ...state,
                  users: (state.users || []).map((u) => ({ ...u, pin: '••••' })),
                  activeUser: { ...state.activeUser, pin: '••••' },
                };
                const dataStr =
                  'data:text/json;charset=utf-8,' +
                  encodeURIComponent(JSON.stringify(sanitizedBackup, null, 2));
                const a = document.createElement('a');
                a.href = dataStr;
                a.download = `barbachu-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                notify('Respaldo JSON descargado (PINs protegidos).');
              }}
              className="min-h-[84px] p-5 rounded-[22px] bg-[#161618]/80 hover:bg-white/[0.06] border border-white/10 text-left flex items-center justify-between transition-all"
            >
              <div>
                <div className="font-bold text-white text-sm mb-1">Respaldo Completo (JSON)</div>
                <div className="text-[rgba(240,230,211,0.6)]">Con enmascaramiento de PINs</div>
              </div>
              <Download className="w-6 h-6 text-[#e8d090] shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* ADD NEW PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Agregar Producto Nuevo
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[rgba(240,230,211,0.72)] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Nombre del Platillo / Bebida *
                </label>
                <input
                  required
                  placeholder="Ej. Tacos de Rib Eye"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Clave (opcional)
                  </label>
                  <input
                    placeholder="Auto"
                    value={newProdKey}
                    onChange={(e) => setNewProdKey(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white tabular-nums focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Precio ($ MXN) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.5"
                    placeholder="0.00"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-[#c8a84b]/60 text-white tabular-nums font-bold focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Categoría *</label>
                <select
                  value={newProdCat}
                  onChange={(e) => setNewProdCat(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                >
                  {categories
                    .filter((c) => c !== 'TODOS')
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  <option value="__OTRA__">+ Nueva Categoría...</option>
                </select>
              </div>

              {newProdCat === '__OTRA__' && (
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    Nueva Categoría *
                  </label>
                  <input
                    required
                    placeholder="EJ. POSTRES"
                    value={customCat}
                    onChange={(e) => setCustomCat(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-[#c8a84b]/60 text-white uppercase font-bold focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#25d366] hover:bg-[#20b858] active:scale-[0.98] text-[#0a0a0b] transition-all duration-150"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD NEW EMPLOYEE MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Registrar Nuevo Empleado
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowNewUserPin(false);
                  setShowAddUserModal(false);
                }}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[rgba(240,230,211,0.72)] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Nombre Completo *
                </label>
                <input
                  required
                  placeholder="Nombre y apellido"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Rol *</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                  >
                    <option value="mesero">Mesero / Comandero</option>
                    <option value="caja">Cajero / Mostrador</option>
                    <option value="cocina">Cocina / Barra KDS</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    PIN de 4 Dígitos *
                  </label>
                  <div className="relative">
                    <input
                      required
                      type={showNewUserPin ? 'text' : 'password'}
                      autoComplete="new-password"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={newUserPin}
                      onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full min-h-[44px] pl-3 pr-10 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-[#c8a84b]/60 text-white font-mono font-bold tracking-widest text-center focus:outline-none focus:border-[#c8a84b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewUserPin((v) => !v)}
                      className="absolute right-1.5 top-1 w-9 h-9 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                      title={showNewUserPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    >
                      {showNewUserPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Área Asignada
                </label>
                <input
                  placeholder="Salón Principal, Terraza, Barra, Cocina..."
                  value={newUserArea}
                  onChange={(e) => setNewUserArea(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Correo Google (opcional para acceso multi-dispositivo)
                </label>
                <input
                  type="email"
                  placeholder="operador@gmail.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewUserPin(false);
                    setShowAddUserModal(false);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#25d366] hover:bg-[#20b858] active:scale-[0.98] text-[#0a0a0b] transition-all duration-150"
                >
                  Guardar Empleado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL EDIT EMPLOYEE MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Editar Empleado
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditPin(false);
                  setEditingUser(null);
                }}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[rgba(240,230,211,0.72)] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-4 gap-2.5">
                <div className="col-span-3">
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Nombre *</label>
                  <input
                    required
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Iniciales</label>
                  <input
                    maxLength={4}
                    value={editUserAvatar}
                    onChange={(e) => setEditUserAvatar(e.target.value.toUpperCase())}
                    className="w-full min-h-[44px] px-2 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white text-center font-bold uppercase focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Rol *</label>
                  <select
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
                  >
                    <option value="mesero">Mesero / Comandero</option>
                    <option value="caja">Cajero / Mostrador</option>
                    <option value="cocina">Cocina / Barra KDS</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">PIN (4 dígitos) *</label>
                  <div className="relative">
                    <input
                      required
                      type={showEditPin ? 'text' : 'password'}
                      autoComplete="new-password"
                      inputMode="numeric"
                      maxLength={4}
                      value={editUserPin}
                      onChange={(e) => setEditUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full min-h-[44px] pl-3 pr-10 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-[#c8a84b]/60 text-white font-mono font-bold tracking-widest text-center focus:outline-none focus:border-[#c8a84b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPin((v) => !v)}
                      className="absolute right-1.5 top-1 w-9 h-9 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                      title={showEditPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    >
                      {showEditPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Área / Estación</label>
                <input
                  value={editUserArea}
                  onChange={(e) => setEditUserArea(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                  Correo Google vinculado
                </label>
                <input
                  type="email"
                  placeholder="operador@gmail.com"
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditPin(false);
                    setEditingUser(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] active:scale-[0.98] text-[#0a0a0b] transition-all duration-150"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE EMPLOYEE MODAL */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal border-[#e05252]/40 max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Eliminar Empleado</h3>
            <p className="text-xs text-[rgba(240,230,211,0.72)] leading-relaxed">
              ¿Eliminar permanentemente a <strong className="text-white">{confirmDeleteUser.name}</strong> ({confirmDeleteUser.role.toUpperCase()}) del directorio operativo en Firestore?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteUser(confirmDeleteUser)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold bg-[#e05252] hover:bg-[#c93b3b] active:scale-[0.98] text-white transition-all duration-150"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE PRODUCT MODAL */}
      {confirmDeleteProd && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal border-[#e05252]/40 max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Eliminar Producto</h3>
            <p className="text-xs text-[rgba(240,230,211,0.72)] leading-relaxed">
              ¿Eliminar permanentemente <strong className="text-white">{confirmDeleteProd.name}</strong> (Clave {confirmDeleteProd.key}) del catálogo en Firestore?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProd(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteProduct(confirmDeleteProd)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold bg-[#e05252] hover:bg-[#c93b3b] active:scale-[0.98] text-white transition-all duration-150"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DEMO CLEANUP MODAL */}
      {confirmCleanupModal && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal border-[#e05252]/40 max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">Confirmar Limpieza</h3>
            <p className="text-xs text-[rgba(240,230,211,0.72)] leading-relaxed">
              Esta acción limpiará los datos seleccionados en Cloud Firestore y sincronizará todos los dispositivos al instante.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCleanupModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={cleaningDemo}
                onClick={() => void handleRunDemoCleanup()}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold bg-[#e05252] hover:bg-[#c93b3b] active:scale-[0.98] text-white disabled:opacity-50 transition-all duration-150"
              >
                {cleaningDemo ? 'Limpiando...' : 'Confirmar y Limpiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TIME CLOCK CHECK-IN MODAL */}
      {clockModalOpen && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">Registrar Entrada</h3>
            <select
              value={clockSelectedUserId}
              onChange={(e) => setClockSelectedUserId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2.5 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-[#c8a84b]"
            >
              {(state.users || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toUpperCase()} · {u.area})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClockModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const user = state.users.find((u) => u.id === clockSelectedUserId) || state.users[0];
                  if (!user) return;
                  const now = new Date().toISOString();
                  const newRecord = {
                    id: uid(),
                    userId: user.id,
                    userName: user.name,
                    role: user.role || 'mesero',
                    clockIn: now,
                    status: 'activo' as const,
                  };
                  const auditEntry: AuditLogEntry = {
                    id: uid(),
                    at: now,
                    user: actingAdminName,
                    action: 'Reloj Checador: Entrada',
                    detail: `${user.name} (${user.role}) checó entrada`,
                  };
                  setState((prev) => ({
                    ...prev,
                    staffClock: [newRecord, ...(prev.staffClock || [])],
                    audit: [...prev.audit, auditEntry],
                  }));
                  if (firebaseUser) {
                    void fsSaveTimeClock(newRecord, true, firebaseUser, authorizedEmails, auditEntry);
                  }
                  setClockModalOpen(false);
                  notify(`Entrada registrada para ${user.name}.`);
                }}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold bg-[#25d366] hover:bg-[#20b858] active:scale-[0.98] text-[#0a0a0b] transition-all duration-150"
              >
                Confirmar Entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MIN STOCK MODAL */}
      {editingMinStockItem && (
        <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-white tracking-[-0.02em]">Umbral Mínimo de Alerta</h3>
            <p className="text-xs text-[#e8d090]">
              {editingMinStockItem.descripcion} ({editingMinStockItem.unidad})
            </p>
            <input
              type="number"
              min="0"
              value={editingMinStockVal}
              onChange={(e) => setEditingMinStockVal(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl bg-[#0a0a0b]/80 border border-[#c8a84b]/60 text-white tabular-nums text-sm focus:outline-none focus:border-[#c8a84b]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMinStockItem(null)}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold text-[rgba(240,230,211,0.68)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const num = Number(editingMinStockVal);
                  if (!Number.isFinite(num) || num < 0) {
                    notify('Ingresa un umbral mínimo válido.');
                    return;
                  }
                  const updatedItem = { ...editingMinStockItem, minStock: num };
                  const auditEntry: AuditLogEntry = {
                    id: uid(),
                    at: new Date().toISOString(),
                    user: actingAdminName,
                    action: 'Alerta de inventario modificada',
                    detail: `${editingMinStockItem.descripcion}: umbral fijado a ${num} ${editingMinStockItem.unidad}`,
                  };
                  setState((prev) => ({
                    ...prev,
                    inventory: {
                      ...prev.inventory,
                      [editingMinStockItem.clave]: updatedItem,
                    },
                    audit: [...prev.audit, auditEntry],
                  }));
                  if (firebaseUser) {
                    void fsSaveInventoryMovement(
                      updatedItem,
                      null,
                      firebaseUser,
                      authorizedEmails,
                      auditEntry
                    );
                  }
                  setEditingMinStockItem(null);
                  notify(`Umbral de ${editingMinStockItem.descripcion} actualizado a ${num}.`);
                }}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] active:scale-[0.98] text-[#0a0a0b] transition-all duration-150"
              >
                Guardar Umbral
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
