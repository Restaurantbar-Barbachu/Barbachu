import React, { useState, useMemo } from 'react';
import {
  FullPosState,
  SoftProduct,
  UserRole,
  RolePermissions,
  PosUser,
  DeviceStation,
} from '../types';
import { formatMoney } from '../storage';
import { uid } from '../core';
import { BarbachuLogo } from './BarbachuLogo';

interface AdminDashboardProps {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  onClose?: () => void;
  notify: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  state,
  setState,
  onClose,
  notify,
}) => {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'usuarios' | 'permisos' | 'dispositivos' | 'alertas' | 'archivos' | 'asistencia'>('catalogo');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(state.activeUser.role === 'admin');
  const [adminPinInput, setAdminPinInput] = useState<string>('');

  // Product catalog management state
  const [search, setSearch] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<string>('TODOS');
  const [inlinePrices, setInlinePrices] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdKey, setNewProdKey] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdCat, setNewProdCat] = useState<string>('PLATILLOS');
  const [customCat, setCustomCat] = useState<string>('');
  const [batchPercent, setBatchPercent] = useState<string>('');

  // User management state
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newUserName, setNewUserName] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('mesero');
  const [newUserPin, setNewUserPin] = useState<string>('');
  const [newUserArea, setNewUserArea] = useState<string>('');

  // Device / Station configuration
  const [stationConfig, setStationConfig] = useState<DeviceStation>(state.deviceConfig?.station || 'todos');

  // Categories
  const categories = useMemo(() => {
    const set = new Set(state.products.map((p) => p.category).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [state.products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.products.filter((p) => {
      const matchCat = selectedCat === 'TODOS' || p.category === selectedCat;
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [state.products, search, selectedCat]);

  // Low stock inventory items
  const lowStockItems = useMemo(() => {
    return Object.values(state.inventory).filter((i) => i.stock <= i.minStock);
  }, [state.inventory]);

  // Handle inline price update
  const handleSaveInlinePrice = (prod: SoftProduct) => {
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

    const updated = state.products.map((p) => {
      if (p.key === prod.key) {
        return {
          ...p,
          sourcePrice: priceNum,
          priceCents,
          saleEnabled: priceCents > 0,
        };
      }
      return p;
    });

    setState((prev) => ({
      ...prev,
      products: updated,
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: 'Precio modificado',
          detail: `Clave ${prod.key} (${prod.name}): ${oldPriceStr} → ${newPriceStr}`,
        },
      ],
    }));

    setInlinePrices((prev) => {
      const copy = { ...prev };
      delete copy[prod.key];
      return copy;
    });

    notify(`Precio de "${prod.name}" actualizado a ${newPriceStr}.`);
  };

  // Toggle enable/disable product for sale
  const handleToggleProductSale = (prod: SoftProduct) => {
    const nextEnabled = !prod.saleEnabled;
    const now = new Date().toISOString();
    const updated = state.products.map((p) => (p.key === prod.key ? { ...p, saleEnabled: nextEnabled } : p));

    setState((prev) => ({
      ...prev,
      products: updated,
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: nextEnabled ? 'Producto habilitado' : 'Producto deshabilitado',
          detail: `Clave ${prod.key} (${prod.name})`,
        },
      ],
    }));

    notify(`Producto "${prod.name}" ${nextEnabled ? 'habilitado' : 'deshabilitado'} para venta.`);
  };

  // Add new product
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
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

    const key = newProdKey.trim() || String(Math.floor(1000 + Math.random() * 9000));
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
      sourcePrice: priceNum,
      priceCents,
      saleEnabled: true,
    };

    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      products: [newProduct, ...prev.products],
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: 'Producto agregado',
          detail: `Clave ${key}: ${name} (${category}) por ${formatMoney(priceCents)}`,
        },
      ],
    }));

    setShowAddModal(false);
    setNewProdName('');
    setNewProdKey('');
    setNewProdPrice('');
    setCustomCat('');
    notify(`Platillo "${name}" agregado al catálogo con éxito.`);
  };

  // Delete product with admin authorization layer
  const handleDeleteProduct = (prod: SoftProduct) => {
    if (state.activeUser.role !== 'admin') {
      const pin = prompt('Ingresa el PIN de Administrador (ej. 1234) para eliminar este platillo:');
      const matched = state.users.find((u) => u.role === 'admin' && u.pin === pin) || (pin === '1234' ? state.users[0] : null);
      if (!matched) {
        notify('PIN de administrador incorrecto. No se pudo eliminar el producto.');
        return;
      }
    }
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente "${prod.name}" (Clave ${prod.key}) del catálogo?`)) return;

    const now = new Date().toISOString();
    const updated = state.products.filter((p) => p.key !== prod.key);

    setState((prev) => ({
      ...prev,
      products: updated,
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: 'Producto eliminado',
          detail: `Clave ${prod.key}: ${prod.name}`,
        },
      ],
    }));

    notify(`Producto "${prod.name}" eliminado del catálogo.`);
  };

  // Batch price adjustment
  const handleApplyBatchAdjustment = () => {
    const pct = Number(batchPercent);
    if (!Number.isFinite(pct) || pct === 0) {
      notify('Ingresa un porcentaje de ajuste válido (ej. 5 o 10).');
      return;
    }

    const multiplier = 1 + pct / 100;
    const catLabel = selectedCat === 'TODOS' ? 'todos los productos' : `categoría ${selectedCat}`;
    if (!window.confirm(`¿Ajustar precios en ${pct > 0 ? `+${pct}%` : `${pct}%`} para ${catLabel}?`)) return;

    const now = new Date().toISOString();
    const updated = state.products.map((p) => {
      if (selectedCat !== 'TODOS' && p.category !== selectedCat) return p;
      if (!p.saleEnabled || p.priceCents <= 0) return p;
      const newCents = Math.round(p.priceCents * multiplier);
      return {
        ...p,
        priceCents: newCents,
        sourcePrice: Math.round(newCents / 100),
      };
    });

    setState((prev) => ({
      ...prev,
      products: updated,
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: 'Ajuste de precios masivo',
          detail: `${pct > 0 ? `+${pct}%` : `${pct}%`} en ${catLabel}`,
        },
      ],
    }));

    setBatchPercent('');
    notify(`Precios ajustados (${pct > 0 ? `+${pct}%` : `${pct}%`}) en ${catLabel}.`);
  };

  // User management
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newUserName.trim();
    if (!name) {
      notify('Ingresa el nombre del usuario.');
      return;
    }
    const pin = newUserPin.trim() || '1234';
    if (!/^\d{4}$/.test(pin)) {
      notify('El PIN debe ser de 4 dígitos numéricos (ej. 1234).');
      return;
    }

    const newUser: PosUser = {
      id: `usr-${Date.now().toString(36)}`,
      name,
      role: newUserRole,
      avatar: name.slice(0, 2).toUpperCase(),
      pin,
      area: newUserArea.trim() || (newUserRole === 'cocina' ? 'Cocina' : newUserRole === 'caja' ? 'Caja' : 'Salón'),
    };

    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      users: [...(prev.users || []), newUser],
      audit: [
        ...prev.audit,
        {
          id: uid(),
          at: now,
          user: prev.activeUser.name,
          action: 'Usuario creado',
          detail: `${name} (${newUserRole.toUpperCase()}) en ${newUser.area}`,
        },
      ],
    }));

    setShowAddUserModal(false);
    setNewUserName('');
    setNewUserPin('');
    setNewUserArea('');
    notify(`Usuario "${name}" creado exitosamente.`);
  };

  // Toggle role permission
  const handleTogglePermission = (role: UserRole, permKey: keyof RolePermissions) => {
    const current = state.permissions?.[role]?.[permKey] ?? false;
    const updatedRolePerms = {
      ...(state.permissions?.[role] || {}),
      [permKey]: !current,
    };

    setState((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [role]: updatedRolePerms as RolePermissions,
      },
    }));
    notify(`Permiso ${String(permKey)} actualizado para rol ${role.toUpperCase()}.`);
  };

  // Save device station
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
    notify(`Este dispositivo quedó configurado como: ${stationNames[st]}.`);
  };

  // CSV Downloads
  const downloadProductsCsv = () => {
    const headers = ['Clave', 'Descripción', 'Categoría', 'Grupo', 'Precio_MXN', 'Estado_Venta'];
    const rows = [headers];
    state.products.forEach((p) => {
      rows.push([p.key, p.name, p.category, p.group, (p.priceCents / 100).toFixed(2), p.saleEnabled ? 'HABILITADO' : 'DESHABILITADO']);
    });
    const csvContent = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
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
      rows.push([String(i.clave), i.descripcion, i.unidad, i.categoria, i.costo.toFixed(2), String(i.stock), String(i.minStock)]);
    });
    const csvContent = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barbachu-catalogo-insumos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Catálogo de insumos descargado en CSV.');
  };

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-s6mklurfoq4w3tmrdu4ppi-535230888453.us-west2.run.app';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl)}&color=eed889&bgcolor=16191f`;

  if (!isAdminUnlocked) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#16191f] border border-[#d4af37]/40 rounded-2xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#d4af37]/20 text-[#d4af37] flex items-center justify-center text-3xl font-bold border border-[#d4af37]/40 shadow-inner">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="font-serif font-bold text-2xl text-white">Seguridad y Permisos Admin</h2>
            <p className="text-xs text-[#8b92a0]">
              El usuario activo actual (<strong className="text-white">{state.activeUser.name}</strong> · <span className="uppercase text-[#eed889]">{state.activeUser.role}</span>) requiere autorización de Administrador para gestionar el catálogo y precios.
            </p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              maxLength={4}
              placeholder="PIN de Administrador (ej. 1234)"
              value={adminPinInput}
              onChange={(e) => setAdminPinInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#1e222b] border border-[#d4af37] text-center text-xl font-mono text-white tracking-widest focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const matched = state.users.find((u) => u.role === 'admin' && u.pin === adminPinInput) || (adminPinInput === '1234' ? state.users[0] : null);
                if (matched) {
                  setIsAdminUnlocked(true);
                  notify('Acceso de administrador concedido.');
                } else {
                  notify('PIN de Administrador incorrecto.');
                  setAdminPinInput('');
                }
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#eed889] text-black font-bold text-xs uppercase tracking-wider shadow-lg hover:opacity-95 transition-all"
            >
              Desbloquear Panel Admin
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-white text-xs font-bold border border-[#2b303c]"
              >
                ← Regresar al Punto de Venta
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 bg-[#16191f] rounded-2xl border border-[#2b303c]">
        <div>
          <div className="flex items-center gap-3">
            <BarbachuLogo className="w-8 h-8 drop-shadow" />
            <h2 className="font-serif font-bold text-xl text-white">Panel de Administración y Control</h2>
          </div>
          <p className="text-xs text-[#8b92a0] mt-0.5">
            Gestión completa de catálogo, modificación de precios, roles, permisos y enlace de dispositivos por área.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] text-white text-xs font-bold border border-[#2b303c] transition-all"
          >
            ← Volver al Punto de Venta
          </button>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#16191f] rounded-2xl border border-[#2b303c]">
        <button
          type="button"
          onClick={() => setActiveTab('catalogo')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'catalogo' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>🏷️</span> Catálogo y Precios ({state.products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('usuarios')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'usuarios' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>👥</span> Usuarios y PINs ({state.users?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('permisos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'permisos' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>🔐</span> Matriz de Permisos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dispositivos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'dispositivos' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>📱</span> Conexión de Dispositivos & QR
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('alertas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'alertas' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>⚠️</span> Alertas de Inventario ({lowStockItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('archivos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'archivos' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>📁</span> Archivos y Recursos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('asistencia')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'asistencia' ? 'bg-[#d4af37] text-black shadow-md' : 'text-[#8b92a0] hover:text-white'}`}
        >
          <span>⏱️</span> Reloj Checador ({state.staffClock?.filter((c) => c.status === 'activo').length || 0})
        </button>
      </div>

      {/* TAB 1: CATALOGO & PRECIOS */}
      {activeTab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Precios y Productos Operativos</h3>
              <p className="text-xs text-[#8b92a0]">
                Modifica los precios directamente en la tabla o agrega productos nuevos al catálogo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-xs shadow-md whitespace-nowrap flex items-center gap-1.5"
            >
              <span>＋</span> Agregar Producto Nuevo
            </button>
          </div>

          {/* Search, Filter & Batch Adjust Bar */}
          <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="Buscar platillo por nombre, clave (ej. 701, 729) o categoría..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs text-white placeholder-[#8b92a0] focus:outline-none focus:border-[#d4af37]"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Ajuste % (ej. 5 o 10)"
                  value={batchPercent}
                  onChange={(e) => setBatchPercent(e.target.value)}
                  className="w-36 px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-xs text-white placeholder-[#8b92a0] font-mono"
                />
                <button
                  type="button"
                  onClick={handleApplyBatchAdjustment}
                  className="px-3 py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-xs font-bold text-[#eed889] whitespace-nowrap"
                  title="Ajustar masivamente precios"
                >
                  ⚡ Ajustar %
                </button>
                <button
                  type="button"
                  onClick={downloadProductsCsv}
                  className="px-3 py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-xs font-bold text-white whitespace-nowrap"
                >
                  📥 Exportar CSV
                </button>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${selectedCat === cat ? 'bg-[#d4af37] text-black border-[#d4af37]' : 'bg-[#1e222b] text-[#8b92a0] border-[#2b303c] hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Table with Inline Price Editing */}
          <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] overflow-x-auto">
            <div className="flex justify-between items-center mb-3 text-xs text-[#8b92a0]">
              <span>Mostrando {filteredProducts.length} productos</span>
              <span className="text-[#eed889]">Tip: Escribe el nuevo precio en la casilla y presiona Guardar</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#2b303c] text-[#8b92a0]">
                  <th className="pb-3 pl-2">Clave</th>
                  <th className="pb-3">Nombre del Producto</th>
                  <th className="pb-3">Categoría</th>
                  <th className="pb-3">Precio Actual</th>
                  <th className="pb-3">Editar Precio ($ MXN)</th>
                  <th className="pb-3">Venta en TPV</th>
                  <th className="pb-3 pr-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2b303c]/60">
                {filteredProducts.map((prod) => {
                  const isDirty = inlinePrices[prod.key] !== undefined && inlinePrices[prod.key] !== String(prod.sourcePrice || (prod.priceCents / 100));
                  const currentVal = inlinePrices[prod.key] !== undefined ? inlinePrices[prod.key] : String(prod.sourcePrice || (prod.priceCents / 100));

                  return (
                    <tr key={prod.key} className="hover:bg-[#1e222b]/50">
                      <td className="py-2.5 pl-2 font-mono text-[#8b92a0]">{prod.key}</td>
                      <td className="py-2.5 font-bold text-white max-w-xs truncate">{prod.name}</td>
                      <td className="py-2.5 text-[#8b92a0]">{prod.category}</td>
                      <td className="py-2.5 font-mono font-bold text-[#eed889]">
                        {formatMoney(prod.priceCents)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#eed889] font-bold">$</span>
                          <input
                            type="number"
                            step="0.5"
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInlinePrices((prev) => ({ ...prev, [prod.key]: val }));
                            }}
                            className={`w-24 px-2 py-1 rounded-lg bg-[#121419] border text-white font-mono font-bold text-xs focus:outline-none ${isDirty ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-[#2b303c]'}`}
                          />
                          {isDirty && (
                            <button
                              type="button"
                              onClick={() => handleSaveInlinePrice(prod)}
                              className="px-2 py-1 rounded bg-[#25d366] text-black font-bold text-xs shadow"
                              title="Guardar este precio"
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleProductSale(prod)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${prod.saleEnabled ? 'bg-[#122822] text-[#25d366] border border-[#25d366]/40' : 'bg-[#e05252]/15 text-[#e05252] border border-[#e05252]/40'}`}
                        >
                          {prod.saleEnabled ? 'Habilitado' : 'Deshabilitado'}
                        </button>
                      </td>
                      <td className="py-2.5 pr-2 text-right space-x-1.5">
                        {isDirty && (
                          <button
                            type="button"
                            onClick={() => handleSaveInlinePrice(prod)}
                            className="px-2.5 py-1 rounded-lg bg-[#d4af37] text-black font-bold text-xs hover:bg-[#eed889]"
                          >
                            Guardar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(prod)}
                          className="px-2.5 py-1 rounded-lg bg-[#e05252]/15 hover:bg-[#e05252]/30 text-[#e05252] font-bold text-xs border border-[#e05252]/40"
                          title="Eliminar producto"
                        >
                          🗑️ Eliminar
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

      {/* TAB 2: USUARIOS Y PINS */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Usuarios y Control de Acceso con PIN</h3>
              <p className="text-xs text-[#8b92a0]">
                Cada usuario tiene su rol, área de trabajo y PIN de 4 dígitos para firmar comandas y autorizar operaciones.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddUserModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-xs shadow-md whitespace-nowrap flex items-center gap-1.5"
            >
              <span>＋</span> Agregar Usuario
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(state.users || []).map((u) => (
              <div key={u.id} className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#173c34] text-[#eed889] font-bold text-sm flex items-center justify-center border border-[#d4af37]/40">
                      {u.avatar}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{u.name}</div>
                      <div className="text-[11px] text-[#8b92a0] uppercase font-semibold">{u.role}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-[#d4af37] text-black' : u.role === 'caja' ? 'bg-[#25d366]/20 text-[#25d366]' : u.role === 'cocina' ? 'bg-[#e05252]/20 text-[#e05252]' : 'bg-[#1e222b] text-[#eed889]'}`}>
                    {u.role}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#2b303c] grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#8b92a0] block text-[10px]">PIN de Acceso:</span>
                    <span className="font-mono font-bold text-[#eed889] tracking-widest text-sm">•••• ({u.pin})</span>
                  </div>
                  <div>
                    <span className="text-[#8b92a0] block text-[10px]">Área / Estación:</span>
                    <span className="font-semibold text-white truncate block">{u.area || 'General'}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const newPin = prompt(`Nuevo PIN de 4 dígitos para ${u.name}:`, u.pin);
                      if (!newPin || !/^\d{4}$/.test(newPin.trim())) {
                        notify('El PIN debe tener 4 números.');
                        return;
                      }
                      const updated = (state.users || []).map((x) => (x.id === u.id ? { ...x, pin: newPin.trim() } : x));
                      setState((prev) => ({ ...prev, users: updated }));
                      notify(`PIN de ${u.name} actualizado.`);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white text-[11px] font-semibold"
                  >
                    Cambiar PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setState((prev) => ({ ...prev, activeUser: u }));
                      notify(`Sesión activa cambiada a: ${u.name}`);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-[#173c34] text-[#eed889] text-[11px] font-bold hover:bg-[#28584c]"
                  >
                    Ingresar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MATRIZ DE PERMISOS */}
      {activeTab === 'permisos' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#16191f] rounded-2xl border border-[#2b303c] space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Matriz de Permisos por Rol</h3>
            <p className="text-xs text-[#8b92a0]">
              Controla con precisión qué acciones puede realizar cada perfil en el restaurante para evitar fugas de dinero o modificaciones no autorizadas.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#2b303c] text-[#8b92a0]">
                  <th className="pb-3 pl-2">Acción / Permiso Operativo</th>
                  {(['admin', 'caja', 'mesero', 'cocina'] as UserRole[]).map((r) => (
                    <th key={r} className="pb-3 text-center uppercase font-bold text-white">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2b303c]/60">
                {[
                  { key: 'canTakeOrders', label: 'Tomar comandas y agregar productos en TPV' },
                  { key: 'canCollectPayment', label: 'Cobrar cuentas y registrar formas de pago' },
                  { key: 'canCashShiftCut', label: 'Realizar corte de caja Z y arqueo de turno' },
                  { key: 'canApplyDiscount', label: 'Aplicar descuentos a cuentas' },
                  { key: 'canCancelOrders', label: 'Cancelar productos o cuentas completas' },
                  { key: 'canAccessKds', label: 'Acceder a pantalla KDS de Cocina y Barra' },
                  { key: 'canEditCatalog', label: 'Cambiar precios y agregar productos al catálogo' },
                  { key: 'canViewReports', label: 'Consultar reportes financieros y estadísticas' },
                  { key: 'canManageUsers', label: 'Administrar usuarios, áreas y PINs' },
                ].map((row) => (
                  <tr key={row.key} className="hover:bg-[#1e222b]/50">
                    <td className="py-3 pl-2 font-semibold text-white">{row.label}</td>
                    {(['admin', 'caja', 'mesero', 'cocina'] as UserRole[]).map((role) => {
                      const isAllowed = state.permissions?.[role]?.[row.key as keyof RolePermissions] ?? false;
                      const isAdmin = role === 'admin';

                      return (
                        <td key={role} className="py-3 text-center">
                          <input
                            type="checkbox"
                            disabled={isAdmin}
                            checked={isAllowed}
                            onChange={() => handleTogglePermission(role, row.key as keyof RolePermissions)}
                            className="w-4 h-4 rounded text-[#d4af37] bg-[#121419] border-[#2b303c] cursor-pointer disabled:opacity-50"
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

      {/* TAB 4: DISPOSITIVOS Y ESTACIONES POR AREA */}
      {activeTab === 'dispositivos' && (
        <div className="space-y-6">
          <div className="p-4 bg-[#16191f] rounded-2xl border border-[#2b303c] space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Conexión de Dispositivos por Área de Trabajo</h3>
            <p className="text-xs text-[#8b92a0]">
              Guía y configuración para conectar celulares, tablets y computadoras en cada zona del restaurante (Caja, Barra, Cocina, Meseros en Salón).
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* QR Code and Device Link */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] text-center space-y-4">
              <h4 className="font-serif font-bold text-base text-white">Acceso Inmediato por Código QR</h4>
              <p className="text-xs text-[#8b92a0]">
                Apunta la cámara del celular o tablet de cualquier mesero o cocinero para abrir el POS de inmediato:
              </p>

              <div className="flex justify-center my-3">
                <div className="p-3 bg-[#121419] rounded-2xl border border-[#d4af37]/40 shadow-xl inline-block">
                  <img
                    src={qrCodeUrl}
                    alt="Código QR de acceso al POS Barbachu"
                    className="w-44 h-44 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#1e222b] rounded-xl border border-[#2b303c] text-xs font-mono text-[#eed889] break-all">
                {appUrl}
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(appUrl);
                  notify('Enlace copiado al portapapeles.');
                }}
                className="w-full py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#eed889] text-black font-bold text-xs transition-all shadow-md"
              >
                📋 Copiar Enlace Directo
              </button>
            </div>

            {/* Profile of THIS device */}
            <div className="lg:col-span-7 space-y-5">
              <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-4">
                <h4 className="font-serif font-bold text-base text-white">Configurar la Estación de ESTE Dispositivo</h4>
                <p className="text-xs text-[#8b92a0]">
                  Selecciona en qué área está operando este aparato (tablet de mesero, pantalla de cocina, mostrador de caja, etc.):
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { id: 'todos' as DeviceStation, label: '💻 Estación Central (Todas las funciones)', desc: 'Acceso total a comandero, caja, mesas, KDS e informes.' },
                    { id: 'comandero' as DeviceStation, label: '📱 Comandero Móvil (Meseros en Salón)', desc: 'Optimizado para tomar órdenes en mesas y enviar rápido.' },
                    { id: 'caja' as DeviceStation, label: '💵 Caja Mostrador (Cobros y Tickets)', desc: 'Enfocado en cobrar cuentas, cambio y corte Z.' },
                    { id: 'cocina' as DeviceStation, label: '🔥 Pantalla KDS (Cocina Caliente)', desc: 'Muestra únicamente los tickets de alimentos pendientes.' },
                    { id: 'barra' as DeviceStation, label: '🍺 Pantalla KDS (Barra de Bebidas)', desc: 'Muestra órdenes de cervezas, micheladas y preparados.' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSaveDeviceStation(item.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${stationConfig === item.id ? 'bg-[#173c34] border-[#d4af37] shadow-lg' : 'bg-[#1e222b] border-[#2b303c] hover:border-[#8b92a0]'}`}
                    >
                      <div className="font-bold text-white mb-1">{item.label}</div>
                      <div className="text-[11px] text-[#8b92a0]">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="p-6 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3 text-xs">
                <h4 className="font-serif font-bold text-base text-white">Paso a Paso para Cada Dispositivo</h4>
                <div className="space-y-2.5 text-[#8b92a0]">
                  <div className="flex gap-2.5 items-start">
                    <span className="w-5 h-5 rounded-full bg-[#173c34] text-[#eed889] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div><b className="text-white">Conecta al Wi-Fi del restaurante:</b> Asegúrate de que las tablets y celulares estén en la misma red Wi-Fi.</div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="w-5 h-5 rounded-full bg-[#173c34] text-[#eed889] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div><b className="text-white">Escanea el código QR:</b> Abre la cámara del dispositivo y toca la notificación para abrir el POS.</div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="w-5 h-5 rounded-full bg-[#173c34] text-[#eed889] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div><b className="text-white">Instalar como App (PWA):</b> En Safari toca Compartir → <i>"Añadir a pantalla de inicio"</i>. En Android/Chrome toca los 3 puntos → <i>"Instalar aplicación"</i>. Se abrirá a pantalla completa sin barra de navegación.</div>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="w-5 h-5 rounded-full bg-[#173c34] text-[#eed889] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div><b className="text-white">Asigna el perfil del área:</b> En cada tablet elige su estación (ej. Cocina, Barra o Comandero).</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ALERTAS DE INVENTARIO */}
      {activeTab === 'alertas' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#16191f] rounded-2xl border border-[#2b303c] space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Alertas de Stock Bajo</h3>
            <p className="text-xs text-[#8b92a0]">
              Insumos cuyas existencias actuales están en o por debajo del umbral mínimo configurado.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
            {lowStockItems.length === 0 ? (
              <div className="py-12 text-center text-[#25d366] text-sm">
                🎉 No hay alertas críticas de stock en este momento.
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockItems.map((item) => (
                  <div
                    key={item.clave}
                    className="p-3.5 rounded-xl bg-[#1e222b] border border-[#e05252]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span className="text-[#e05252]">⚠️</span>
                        <span>{item.descripcion}</span>
                        <span className="text-[#8b92a0] font-mono">(Clave {item.clave})</span>
                      </div>
                      <div className="text-[#8b92a0] mt-0.5">
                        Categoría: {item.categoria} · Costo unitario: ${item.costo.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm text-[#e05252]">
                          {item.stock} {item.unidad}
                        </div>
                        <div className="text-[10px] text-[#8b92a0]">Mínimo: {item.minStock} {item.unidad}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newMin = prompt(`Umbral mínimo para ${item.descripcion}:`, String(item.minStock));
                          if (newMin !== null && Number.isFinite(Number(newMin)) && Number(newMin) >= 0) {
                            setState((prev) => ({
                              ...prev,
                              inventory: {
                                ...prev.inventory,
                                [item.clave]: { ...prev.inventory[item.clave], minStock: Number(newMin) },
                              },
                            }));
                            notify(`Umbral de ${item.descripcion} actualizado a ${newMin}.`);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#16191f] text-white border border-[#2b303c] font-semibold hover:border-[#d4af37]"
                      >
                        Cambiar Mínimo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ARCHIVOS Y RECURSOS */}
      {activeTab === 'archivos' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#16191f] rounded-2xl border border-[#2b303c] space-y-1">
            <h3 className="font-serif font-bold text-lg text-white">Archivos y Recursos del Proyecto</h3>
            <p className="text-xs text-[#8b92a0]">
              Descarga directa de catálogos oficiales, copias de seguridad y estructura del código fuente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3">
              <h4 className="font-bold text-sm text-[#eed889]">Descargas en 1 Clic</h4>
              <div className="space-y-2 text-xs">
                <a
                  href="/barbachu-pos-proyecto-completo.zip"
                  download="barbachu-pos-proyecto-completo.zip"
                  className="w-full py-3 px-3.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#eed889] hover:from-[#eed889] hover:to-[#d4af37] text-black font-bold text-left flex items-center justify-between shadow-lg transition-all"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">📦</span>
                    <span>
                      <span className="block text-xs font-black">Descargar Código Completo del Proyecto (ZIP)</span>
                      <span className="block text-[10px] font-normal opacity-90">Todo el código fuente, componentes, datos y configuración</span>
                    </span>
                  </span>
                  <span className="px-2 py-1 rounded-md bg-black/15 font-mono text-[11px] font-bold">.ZIP ↓</span>
                </a>
                <button
                  type="button"
                  onClick={downloadProductsCsv}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-left flex items-center justify-between"
                >
                  <span className="flex items-center gap-2"><span>📊</span> Catálogo de Productos SoftRestaurant (CSV)</span>
                  <span className="text-[#d4af37]">Descargar ↓</span>
                </button>
                <button
                  type="button"
                  onClick={downloadIngredientsCsv}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-left flex items-center justify-between"
                >
                  <span className="flex items-center gap-2"><span>📦</span> Catálogo de Insumos SoftRestaurant (CSV)</span>
                  <span className="text-[#d4af37]">Descargar ↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
                    const a = document.createElement('a');
                    a.href = dataStr;
                    a.download = `barbachu-base-de-datos-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    notify('Respaldo descargado.');
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-left flex items-center justify-between"
                >
                  <span className="flex items-center gap-2"><span>💾</span> Respaldo de Base de Datos y Ventas (JSON)</span>
                  <span className="text-[#d4af37]">Descargar ↓</span>
                </button>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#16191f] border border-[#2b303c] space-y-3 text-xs">
              <h4 className="font-bold text-sm text-[#eed889]">Rutas en el Servidor</h4>
              <div className="p-3 bg-[#1e222b] rounded-xl font-mono text-[11px] text-[#eed889] space-y-1">
                <div>📁 /src/components/</div>
                <div className="pl-3 text-white">├── AdminDashboard.tsx (Gestión y Permisos)</div>
                <div className="pl-3 text-white">├── PosView.tsx (Punto de Venta)</div>
                <div className="pl-3 text-white">└── MenuView.tsx (Menú Clientes)</div>
                <div>📁 /src/data/</div>
                <div className="pl-3 text-white">└── softRestaurantCatalog.ts (199 prods + 121 insumos)</div>
                <div>📁 /public/assets/aistudio/</div>
                <div className="pl-3 text-white">└── Proyecto-archivos_f447b32d.zip</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: RELOJ CHECADOR & ASISTENCIA */}
      {activeTab === 'asistencia' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#16191f] rounded-2xl border border-[#2b303c]">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Reloj Checador & Asistencia de Personal</h3>
              <p className="text-xs text-[#8b92a0]">
                Control de entradas y salidas de meseros, cajeros y personal con registro de turnos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const userName = prompt('Nombre del empleado o selecciona de la lista:');
                if (!userName) return;
                const user = state.users.find((u) => u.name.toLowerCase().includes(userName.toLowerCase())) || { id: uid(), name: userName, role: 'mesero' };
                const now = new Date().toISOString();
                const newRecord = {
                  id: uid(),
                  userId: user.id,
                  userName: user.name,
                  role: user.role || 'mesero',
                  clockIn: now,
                  status: 'activo' as const,
                };
                setState((prev) => ({
                  ...prev,
                  staffClock: [newRecord, ...(prev.staffClock || [])],
                  audit: [
                    ...prev.audit,
                    { id: uid(), at: now, user: prev.activeUser.name, action: 'Reloj Checador: Entrada', detail: `${user.name} (${user.role}) checó entrada` },
                  ],
                }));
                notify(`Entrada registrada para ${user.name}.`);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#25d366] hover:bg-[#20b858] text-black font-bold text-xs shadow-md whitespace-nowrap flex items-center gap-1.5"
            >
              <span>⏱️</span> Registrar Entrada
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-[#16191f] border border-[#2b303c] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#2b303c] text-[#8b92a0]">
                  <th className="pb-3 pl-2">Empleado</th>
                  <th className="pb-3">Rol / Área</th>
                  <th className="pb-3">Entrada</th>
                  <th className="pb-3">Salida</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3 pr-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2b303c]/60">
                {(state.staffClock || []).map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#1e222b]/50">
                    <td className="py-3 pl-2 font-bold text-white">{rec.userName}</td>
                    <td className="py-3 text-[#8b92a0] uppercase">{rec.role}</td>
                    <td className="py-3 font-mono text-[#eed889]">
                      {new Date(rec.clockIn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="block text-[10px] text-[#8b92a0]">{new Date(rec.clockIn).toLocaleDateString('es-MX')}</span>
                    </td>
                    <td className="py-3 font-mono text-[#8b92a0]">
                      {rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${rec.status === 'activo' ? 'bg-[#122822] text-[#25d366] border border-[#25d366]/40' : 'bg-[#1e222b] text-[#8b92a0]'}`}>
                        {rec.status === 'activo' ? 'En Turno' : 'Finalizado'}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      {rec.status === 'activo' ? (
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date().toISOString();
                            setState((prev) => ({
                              ...prev,
                              staffClock: (prev.staffClock || []).map((r) => (r.id === rec.id ? { ...r, clockOut: now, status: 'finalizado' } : r)),
                              audit: [
                                ...prev.audit,
                                { id: uid(), at: now, user: prev.activeUser.name, action: 'Reloj Checador: Salida', detail: `${rec.userName} finalizó turno` },
                              ],
                            }));
                            notify(`Salida registrada para ${rec.userName}.`);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#e05252]/20 hover:bg-[#e05252]/30 text-[#e05252] font-bold text-xs border border-[#e05252]/40"
                        >
                          Registrar Salida
                        </button>
                      ) : (
                        <span className="text-[#8b92a0]">Completado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD NEW PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-md w-full p-6 space-y-4 text-left shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2b303c]">
              <h3 className="font-serif font-bold text-lg text-white">Agregar Producto Nuevo</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[#8b92a0] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">Nombre del Platillo / Bebida *</label>
                <input
                  required
                  placeholder="Ej. Tacos de Rib Eye Especiales"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#8b92a0] mb-1 font-semibold">Clave (opcional)</label>
                  <input
                    placeholder="Ej. 805"
                    value={newProdKey}
                    onChange={(e) => setNewProdKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#8b92a0] mb-1 font-semibold">Precio de Venta ($ MXN) *</label>
                  <input
                    required
                    type="number"
                    step="0.5"
                    placeholder="Ej. 140.00"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#d4af37] text-white font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">Categoría *</label>
                <select
                  value={newProdCat}
                  onChange={(e) => setNewProdCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white"
                >
                  {categories.filter((c) => c !== 'TODOS').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__OTRA__">+ Nueva Categoría...</option>
                </select>
              </div>

              {newProdCat === '__OTRA__' && (
                <div>
                  <label className="block text-[#8b92a0] mb-1 font-semibold">Nombre de la nueva categoría *</label>
                  <input
                    required
                    placeholder="Ej. TACOS, POSTRES, COCTELES..."
                    value={customCat}
                    onChange={(e) => setCustomCat(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#d4af37] text-white uppercase font-bold"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#2b303c]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0] hover:bg-[#1e222b]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#25d366] text-black hover:bg-[#20b858] transition-all"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD NEW USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#16191f] border border-[#2b303c] rounded-2xl max-w-md w-full p-6 space-y-4 text-left shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2b303c]">
              <h3 className="font-serif font-bold text-lg text-white">Registrar Nuevo Usuario / Empleado</h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-[#8b92a0] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">Nombre Completo *</label>
                <input
                  required
                  placeholder="Ej. Carlos Mendoza"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#8b92a0] mb-1 font-semibold">Rol del Sistema *</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white font-semibold"
                  >
                    <option value="mesero">Mesero / Comandero</option>
                    <option value="caja">Cajero / Mostrador</option>
                    <option value="cocina">Cocina / Barra KDS</option>
                    <option value="admin">Administrador General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#8b92a0] mb-1 font-semibold">PIN de 4 Dígitos *</label>
                  <input
                    required
                    maxLength={4}
                    placeholder="Ej. 1234"
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#d4af37] text-white font-mono font-bold tracking-widest text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8b92a0] mb-1 font-semibold">Área Asignada (opcional)</label>
                <input
                  placeholder="Ej. Salón Principal, Terraza, Barra, Cocina Caliente..."
                  value={newUserArea}
                  onChange={(e) => setNewUserArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#1e222b] border border-[#2b303c] text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#2b303c]">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8b92a0] hover:bg-[#1e222b]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#25d366] text-black hover:bg-[#20b858] transition-all"
                >
                  Guardar Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
