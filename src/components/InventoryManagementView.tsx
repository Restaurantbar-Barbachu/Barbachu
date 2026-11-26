import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Download,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { FullPosState, InventoryItem, InventoryMovement, AuditLogEntry } from '../types';
import { formatMoney } from '../storage';
import { uid } from '../core';
import {
  fsCreateInventoryItem,
  fsDeleteInventoryItem,
  fsSaveInventoryMovement,
  fsVerifyAnyAdminPinFromFirestore,
} from '../lib/firestoreSync';
import { downloadCsvFile } from '../utils/csv';
import { verifyPinSecret } from '../utils/pinSecurity';
import { IosPinPadModal } from './IosPinPadModal';

interface InventoryManagementViewProps {
  state: FullPosState;
  setState: React.Dispatch<React.SetStateAction<FullPosState>>;
  firebaseUser: User | null;
  authorizedEmails: string[];
  notify: (msg: string) => void;
  isFirebaseAdmin: boolean;
}

export const InventoryManagementView: React.FC<InventoryManagementViewProps> = ({
  state,
  setState,
  firebaseUser,
  authorizedEmails,
  notify,
  isFirebaseAdmin,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'insumos' | 'nuevo' | 'alertas' | 'historial'>('insumos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODOS');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);

  // New Insumo / Product form state
  const [newClave, setNewClave] = useState<string>(() => String(Date.now().toString().slice(-5)));
  const [newDesc, setNewDesc] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Bebidas y Licores');
  const [newUnit, setNewUnit] = useState<string>('Pza');
  const [newCost, setNewCost] = useState<string>('0');
  const [newStock, setNewStock] = useState<string>('10');
  const [newMinStock, setNewMinStock] = useState<string>('3');

  // Modal action state
  const [modalAction, setModalAction] = useState<{
    item: InventoryItem;
    type: 'entrada' | 'ajuste' | 'merma' | 'minStock';
  } | null>(null);
  const [modalQty, setModalQty] = useState<string>('');
  const [modalCost, setModalCost] = useState<string>('');
  const [modalReason, setModalReason] = useState<string>('');
  const [pendingMermaAuth, setPendingMermaAuth] = useState<{
    item: InventoryItem;
    type: 'merma' | 'ajuste';
    qtyVal: number;
    costVal: number;
    reasonText: string;
  } | null>(null);

  // Delete confirmation
  const [confirmDeleteClave, setConfirmDeleteClave] = useState<number | null>(null);

  const openActionModal = (item: InventoryItem, type: 'entrada' | 'ajuste' | 'merma' | 'minStock') => {
    setModalQty(type === 'minStock' ? String(item.minStock ?? 0) : type === 'ajuste' ? String(item.stock ?? 0) : '');
    setModalCost(item.costo > 0 ? String(item.costo) : '');
    setModalReason('');
    setModalAction({ item, type });
  };

  useEffect(() => {
    if (!modalAction && confirmDeleteClave === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalAction(null);
        setConfirmDeleteClave(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalAction, confirmDeleteClave]);

  const inventoryList = useMemo(() => Object.values(state.inventory || {}), [state.inventory]);

  const categories = useMemo(() => {
    const set = new Set(inventoryList.map((i) => i.categoria).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [inventoryList]);

  const lowStockItems = useMemo(() => {
    return inventoryList.filter((i) => i.minStock > 0 && i.stock <= i.minStock);
  }, [inventoryList]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryList.filter((item) => {
      const matchCat = categoryFilter === 'TODOS' || item.categoria === categoryFilter;
      const matchLow = !onlyLowStock || (item.minStock > 0 && item.stock <= item.minStock);
      const matchQ =
        !q ||
        item.descripcion.toLowerCase().includes(q) ||
        String(item.clave).includes(q) ||
        item.categoria.toLowerCase().includes(q) ||
        item.unidad.toLowerCase().includes(q);
      return matchCat && matchLow && matchQ;
    });
  }, [inventoryList, searchQuery, categoryFilter, onlyLowStock]);

  const handleRegisterItem = (e: React.FormEvent) => {
    e.preventDefault();
    const claveNum = Number(newClave);
    const costNum = Number(newCost);
    const stockNum = Number(newStock);
    const minStockNum = Number(newMinStock);

    if (!newDesc.trim()) {
      notify('Ingresa la descripción del insumo o producto.');
      return;
    }
    if (!Number.isFinite(claveNum) || claveNum <= 0) {
      notify('Ingresa una clave numérica válida.');
      return;
    }
    if (state.inventory[claveNum]) {
      notify(`La clave ${claveNum} ya existe en el inventario.`);
      return;
    }

    if (firebaseUser && !isFirebaseAdmin) {
      notify('Solo un Administrador puede registrar nuevos insumos en Firestore.');
      return;
    }

    const newItem: InventoryItem = {
      clave: claveNum,
      descripcion: newDesc.trim(),
      categoria: newCategory.trim(),
      unidad: newUnit.trim(),
      costo: Number.isFinite(costNum) && costNum >= 0 ? costNum : 0,
      stock: Number.isFinite(stockNum) && stockNum >= 0 ? stockNum : 0,
      minStock: Number.isFinite(minStockNum) && minStockNum >= 0 ? minStockNum : 0,
    };

    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Insumo registrado',
      detail: `Nuevo insumo: ${newItem.descripcion} (Clave ${newItem.clave}) · Stock inicial: ${newItem.stock} ${newItem.unidad}`,
    };

    setState((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [newItem.clave]: newItem,
      },
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      void fsCreateInventoryItem(newItem, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error guardando insumo en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    notify(`Insumo "${newItem.descripcion}" registrado con éxito.`);
    setNewDesc('');
    setNewClave(String(Math.floor(10000 + Math.random() * 90000)));
    setActiveSubTab('insumos');
  };

  const commitInventoryMovement = (
    payload: {
      item: InventoryItem;
      type: 'entrada' | 'ajuste' | 'merma';
      qtyVal: number;
      costVal: number;
      reasonText: string;
    },
    authorizingAdminName?: string
  ) => {
    const { item, type, qtyVal, costVal, reasonText } = payload;
    const now = new Date().toISOString();

    let nextStock = item.stock;
    if (type === 'entrada') {
      nextStock += qtyVal;
    } else if (type === 'merma') {
      nextStock = Math.max(0, item.stock - qtyVal);
    } else {
      nextStock = qtyVal; // Ajuste directo
    }

    const updatedItem: InventoryItem = {
      ...item,
      stock: Math.max(0, nextStock),
      costo: costVal > 0 ? costVal : item.costo,
    };

    const defaultReason =
      type === 'entrada'
        ? 'Compra / Recepción'
        : type === 'merma'
        ? 'Merma / Desperdicio'
        : 'Ajuste de inventario físico';

    const baseReason = reasonText.trim() || defaultReason;
    const finalReason = authorizingAdminName
      ? `${baseReason} (Autorizado por Admin: ${authorizingAdminName})`
      : baseReason;

    const mov: InventoryMovement = {
      id: uid(),
      at: now,
      clave: item.clave,
      descripcion: item.descripcion,
      type,
      qty: qtyVal,
      costUnit: costVal > 0 ? costVal : item.costo,
      reason: finalReason,
      user: state.activeUser.name,
    };

    const actionVerb =
      type === 'entrada'
        ? `+${qtyVal}`
        : type === 'merma'
        ? `-${qtyVal} (Merma)`
        : `ajustado a ${qtyVal}`;

    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: `Inventario: ${type.toUpperCase()}`,
      detail: `${item.descripcion} (${item.unidad}) · ${actionVerb} · Stock final: ${updatedItem.stock}${
        authorizingAdminName ? ` · Autorizó: ${authorizingAdminName}` : ''
      }`,
      reason: finalReason,
    };

    setState((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, [item.clave]: updatedItem },
      inventoryMovements: [...(prev.inventoryMovements || []), mov],
      audit: [...prev.audit, auditEntry],
    }));

    if (firebaseUser) {
      const costChanged = isFirebaseAdmin && costVal > 0 && costVal !== item.costo;
      void fsSaveInventoryMovement(updatedItem, mov, firebaseUser, authorizedEmails, auditEntry, {
        updateCost: costChanged,
      })
        .then((committedStock) => {
          setState((prev) => {
            const current = prev.inventory[item.clave];
            if (!current || current.stock === committedStock) return prev;
            return {
              ...prev,
              inventory: { ...prev.inventory, [item.clave]: { ...current, stock: committedStock } },
            };
          });
        })
        .catch((err) => {
          notify(`Error guardando movimiento en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
        });
    }

    setModalAction(null);
    setModalQty('');
    setModalCost('');
    setModalReason('');
    notify(`Inventario actualizado: ${item.descripcion} (${updatedItem.stock} ${item.unidad}).`);
  };

  const handleExecuteModalAction = () => {
    if (!modalAction) return;
    const { item, type } = modalAction;
    const qtyVal = Number(modalQty);
    const costVal = Number(modalCost);
    const now = new Date().toISOString();

    if (type === 'minStock') {
      if (!Number.isFinite(qtyVal) || qtyVal < 0) {
        notify('Ingresa un umbral de stock mínimo válido.');
        return;
      }
      const updatedItem: InventoryItem = { ...item, minStock: qtyVal };
      const auditEntry: AuditLogEntry = {
        id: uid(),
        at: now,
        user: state.activeUser.name,
        action: 'Umbral mínimo actualizado',
        detail: `${item.descripcion}: umbral fijado a ${qtyVal} ${item.unidad}`,
      };

      setState((prev) => ({
        ...prev,
        inventory: { ...prev.inventory, [item.clave]: updatedItem },
        audit: [...prev.audit, auditEntry],
      }));

      if (firebaseUser) {
        void fsSaveInventoryMovement(updatedItem, null, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
          notify(`Error actualizando umbral en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
        });
      }

      setModalAction(null);
      setModalQty('');
      notify(`Umbral de ${item.descripcion} actualizado a ${qtyVal} ${item.unidad}.`);
      return;
    }

    if (!Number.isFinite(qtyVal) || (type === 'ajuste' ? qtyVal < 0 : qtyVal <= 0)) {
      notify(type === 'ajuste' ? 'Ingresa un conteo válido (0 o mayor).' : 'Ingresa una cantidad mayor a 0.');
      return;
    }

    if ((type === 'merma' || type === 'ajuste') && state.activeUser.role !== 'admin') {
      setPendingMermaAuth({
        item,
        type,
        qtyVal,
        costVal: Number.isFinite(costVal) ? costVal : 0,
        reasonText: modalReason.trim(),
      });
      return;
    }

    commitInventoryMovement(
      {
        item,
        type,
        qtyVal,
        costVal: Number.isFinite(costVal) ? costVal : 0,
        reasonText: modalReason.trim(),
      },
      type === 'merma' || type === 'ajuste' ? state.activeUser.name : undefined
    );
  };

  const handleDeleteItem = (clave: number) => {
    const item = state.inventory[clave];
    if (!item) return;
    if (firebaseUser && !isFirebaseAdmin) {
      notify('Solo un Administrador puede eliminar insumos.');
      setConfirmDeleteClave(null);
      return;
    }

    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: uid(),
      at: now,
      user: state.activeUser.name,
      action: 'Insumo eliminado',
      detail: `Insumo eliminado: ${item.descripcion} (Clave ${item.clave})`,
    };

    setState((prev) => {
      const copy = { ...prev.inventory };
      delete copy[clave];
      return {
        ...prev,
        inventory: copy,
        audit: [...prev.audit, auditEntry],
      };
    });

    if (firebaseUser) {
      void fsDeleteInventoryItem(clave, firebaseUser, authorizedEmails, auditEntry).catch((err) => {
        notify(`Error eliminando insumo en Firestore: ${err instanceof Error ? err.message : 'Sin permisos'}`);
      });
    }

    setConfirmDeleteClave(null);
    notify(`Insumo "${item.descripcion}" eliminado del inventario.`);
  };

  const handleExportCsv = () => {
    const headers = ['Clave', 'Descripcion', 'Categoria', 'Unidad', 'Costo_Unitario', 'Stock_Actual', 'Stock_Minimo'];
    const rows = inventoryList.map((i) => [
      i.clave,
      i.descripcion,
      i.categoria,
      i.unidad,
      i.costo.toFixed(2),
      i.stock,
      i.minStock,
    ]);
    downloadCsvFile(`inventario_barbachu_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    notify('Inventario exportado en CSV.');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Card */}
      <div className="p-5 ios-glass-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-[#c8a84b]/15 text-[#c8a84b] flex items-center justify-center font-bold">
                <Package className="w-5 h-5" />
              </span>
              <h2 className="font-serif font-bold text-2xl text-white tracking-[-0.02em]">
                Gestión de Inventario y Alertas
              </h2>
            </div>
            <p className="text-xs text-[rgba(240,230,211,0.68)] mt-1">
              Control total de insumos, costos de reposición, umbrales de stock mínimo y registro de entradas y salidas.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-[#e8d090] border border-white/15 text-xs font-semibold flex items-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('nuevo')}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Nuevo Insumo / Producto
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/60 border border-white/10">
            <div className="text-xs text-[rgba(240,230,211,0.58)] font-semibold">Total Insumos</div>
            <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">{inventoryList.length}</div>
          </div>
          <div className={`p-3.5 rounded-2xl border ${lowStockItems.length > 0 ? 'bg-[#e05252]/15 border-[#e05252]/40' : 'bg-[#0a0a0b]/60 border-white/10'}`}>
            <div className="text-xs text-[rgba(240,230,211,0.58)] font-semibold flex items-center gap-1">
              {lowStockItems.length > 0 && <span className="text-[#e05252]">⚠️</span>} Alertas Stock Bajo
            </div>
            <div className={`text-lg font-bold font-mono mt-1 tabular-nums ${lowStockItems.length > 0 ? 'text-[#e05252]' : 'text-[#25d366]'}`}>
              {lowStockItems.length}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/60 border border-white/10">
            <div className="text-xs text-[rgba(240,230,211,0.58)] font-semibold">Valor Total Inventario</div>
            <div className="text-lg font-bold font-mono text-[#e8d090] mt-1 tabular-nums">
              {formatMoney(inventoryList.reduce((sum, i) => sum + i.stock * i.costo * 100, 0))}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#0a0a0b]/60 border border-white/10">
            <div className="text-xs text-[rgba(240,230,211,0.58)] font-semibold">Movimientos Registrados</div>
            <div className="text-lg font-bold font-mono text-white mt-1 tabular-nums">
              {(state.inventoryMovements || []).length}
            </div>
          </div>
        </div>

        {/* Segmented Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 overflow-x-auto">
          {(
            [
              { id: 'insumos', label: 'Catálogo de Insumos', count: inventoryList.length },
              { id: 'alertas', label: `Alertas de Stock (${lowStockItems.length})`, count: lowStockItems.length },
              { id: 'nuevo', label: 'Registrar Insumo' },
              { id: 'historial', label: 'Historial de Movimientos' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeSubTab === tab.id
                  ? 'bg-[#c8a84b] text-[#0a0a0b] shadow-md'
                  : 'text-[rgba(240,230,211,0.68)] hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SUBTAB 1 & 2: INSUMOS CATALOG / ALERTS */}
      {(activeSubTab === 'insumos' || activeSubTab === 'alertas') && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 ios-glass-card flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por descripción, clave o unidad..."
                className="w-full min-h-[44px] pl-10 pr-9 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
              />
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[rgba(240,230,211,0.55)]" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda de insumos"
                  className="absolute right-2 top-2 w-7 h-7 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      categoryFilter === cat ? 'bg-white/15 text-white' : 'text-[rgba(240,230,211,0.62)] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setOnlyLowStock(!onlyLowStock)}
                className={`min-h-[42px] px-4 py-2 rounded-2xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                  onlyLowStock || activeSubTab === 'alertas'
                    ? 'bg-[#e05252] text-white border-[#e05252]'
                    : 'bg-white/[0.05] text-[rgba(240,230,211,0.72)] border-white/10 hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Solo Stock Bajo ({lowStockItems.length})
              </button>
            </div>
          </div>

          {/* Table / Cards Grid */}
          <div className="p-4 ios-glass-card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/15 text-[rgba(240,230,211,0.58)] uppercase tracking-wider text-xs">
                  <th className="pb-3 pl-2">Clave</th>
                  <th className="pb-3">Descripción</th>
                  <th className="pb-3">Categoría</th>
                  <th className="pb-3">Costo Unitario</th>
                  <th className="pb-3">Existencia</th>
                  <th className="pb-3">Umbral Mínimo</th>
                  <th className="pb-3 pr-2 text-right">Acciones Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(activeSubTab === 'alertas' ? lowStockItems : filteredItems).map((item) => {
                  const isLow = item.minStock > 0 && item.stock <= item.minStock;
                  return (
                    <tr key={item.clave} className={`hover:bg-white/[0.03] transition-colors ${isLow ? 'bg-[#e05252]/10' : ''}`}>
                      <td className="py-3.5 pl-2 font-mono text-[rgba(240,230,211,0.65)]">{item.clave}</td>
                      <td className="py-3.5 font-bold text-white">
                        <div className="flex items-center gap-2">
                          {isLow && <span className="text-[#e05252] text-sm" title="Stock en nivel crítico">⚠️</span>}
                          <span>{item.descripcion}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-[rgba(240,230,211,0.68)]">{item.categoria}</td>
                      <td className="py-3.5 font-mono text-[#e8d090]">${item.costo.toFixed(2)}</td>
                      <td className="py-3.5 font-mono font-bold">
                        <span className={`px-2.5 py-1 rounded-xl ${isLow ? 'bg-[#e05252]/20 text-[#e05252] border border-[#e05252]/40' : 'bg-[#25d366]/15 text-[#25d366]'}`}>
                          {item.stock} {item.unidad}
                        </span>
                      </td>
                      <td className="py-3.5 font-mono text-[rgba(240,230,211,0.68)]">
                        {item.minStock} {item.unidad}
                      </td>
                      <td className="py-3.5 pr-2 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openActionModal(item, 'minStock')}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] text-[#e8d090] border border-white/15 font-semibold"
                          title="Establecer umbral de alerta"
                        >
                          🔔 Mínimo
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(item, 'entrada')}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#173c34] hover:bg-[#28584c] text-[#25d366] border border-[#25d366]/40 font-bold"
                          title="Registrar compra / entrada"
                        >
                          + Compra
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(item, 'merma')}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#e05252]/15 hover:bg-[#e05252]/25 text-[#e05252] border border-[#e05252]/40 font-bold"
                          title="Registrar merma o salida por desperdicio (requiere autorización de Admin)"
                        >
                          − Merma
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(item, 'ajuste')}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] text-white border border-white/15 font-semibold"
                          title="Ajustar conteo físico (requiere autorización de Admin)"
                        >
                          Ajustar
                        </button>
                        {isFirebaseAdmin && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteClave(item.clave)}
                            aria-label={`Eliminar ${item.descripcion}`}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-[#e05252]/15 hover:bg-[#e05252]/25 text-[#e05252] border border-[#e05252]/30"
                            title="Eliminar insumo"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: REGISTRAR NUEVO INSUMO / PRODUCTO */}
      {activeSubTab === 'nuevo' && (
        <div className="max-w-2xl mx-auto p-6 ios-glass-card space-y-5 text-left">
          <div>
            <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">Registrar Nuevo Insumo o Producto</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)] mt-1">
              Añade un nuevo ingrediente, bebida o artículo al inventario del restaurante con su respectiva unidad, costo y umbral de alerta.
            </p>
          </div>

          <form onSubmit={handleRegisterItem} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Clave Numérica de Control *</label>
                <input
                  type="number"
                  value={newClave}
                  onChange={(e) => setNewClave(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                  required
                />
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Nombre / Descripción *</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Ej. Tequila Don Julio 750ml, Limón, Carne..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Categoría *</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Ej. Bebidas, Alimentos..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                  required
                />
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Unidad de Medida *</label>
                <select
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                >
                  <option value="Pza">Pieza (Pza)</option>
                  <option value="Botella">Botella</option>
                  <option value="Kg">Kilogramo (Kg)</option>
                  <option value="Lt">Litro (Lt)</option>
                  <option value="Porción">Porción</option>
                  <option value="Paquete">Paquete</option>
                </select>
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Costo Unitario ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newCost}
                  onChange={(e) => setNewCost(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Stock Inicial en Existencia</label>
                <input
                  type="number"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
              <div>
                <label className="block text-[rgba(240,230,211,0.68)] mb-1.5 font-semibold">Umbral Mínimo de Alerta (Stock Bajo)</label>
                <input
                  type="number"
                  value={newMinStock}
                  onChange={(e) => setNewMinStock(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveSubTab('insumos')}
                className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] font-bold shadow-lg transition-all active:scale-95"
              >
                Registrar Insumo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 4: HISTORIAL DE MOVIMIENTOS */}
      {activeSubTab === 'historial' && (
        <div className="p-4 ios-glass-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Historial de Movimientos de Inventario</h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">Registro de entradas por compra, ajustes físicos y consumo operativo.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/15 text-[rgba(240,230,211,0.58)] uppercase tracking-wider text-xs">
                  <th className="pb-3 pl-2">Fecha / Hora</th>
                  <th className="pb-3">Insumo</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Cantidad</th>
                  <th className="pb-3">Costo Unit.</th>
                  <th className="pb-3">Motivo / Proveedor</th>
                  <th className="pb-3 pr-2">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {(!state.inventoryMovements || state.inventoryMovements.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[rgba(240,230,211,0.5)]">
                      No hay movimientos de inventario registrados aún.
                    </td>
                  </tr>
                ) : (
                  state.inventoryMovements.slice().reverse().map((mov) => (
                    <tr key={mov.id} className="hover:bg-white/[0.03]">
                      <td className="py-3 pl-2 font-mono text-[rgba(240,230,211,0.68)]">
                        {new Date(mov.at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 font-bold text-white">{mov.descripcion}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase ${
                            mov.type === 'entrada'
                              ? 'bg-[#25d366]/20 text-[#25d366]'
                              : mov.type === 'merma'
                              ? 'bg-[#e05252]/20 text-[#e05252]'
                              : 'bg-[#e8d090]/20 text-[#e8d090]'
                          }`}
                        >
                          {mov.type}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-bold text-white tabular-nums">
                        {mov.type === 'entrada' ? `+${mov.qty}` : mov.type === 'merma' ? `-${mov.qty}` : mov.qty}
                      </td>
                      <td className="py-3 font-mono text-[#e8d090]">${mov.costUnit.toFixed(2)}</td>
                      <td className="py-3 text-[rgba(240,230,211,0.75)]">{mov.reason}</td>
                      <td className="py-3 pr-2 text-[rgba(240,230,211,0.68)]">{mov.user}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ACCIÓN EN INSUMO (ENTRADA / MERMA / AJUSTE / MÍNIMO) */}
      {modalAction &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-base text-white">
                  {modalAction.type === 'entrada'
                    ? 'Registrar Compra / Entrada'
                    : modalAction.type === 'merma'
                    ? 'Registrar Merma / Baja'
                    : modalAction.type === 'ajuste'
                    ? 'Ajustar Conteo Físico'
                    : 'Configurar Umbral de Alerta'}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  aria-label="Cerrar modal de inventario"
                  className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="text-sm font-bold text-[#e8d090]">{modalAction.item.descripcion}</div>
                <div className="text-xs text-[rgba(240,230,211,0.68)]">
                  Stock actual: <strong className="text-white">{modalAction.item.stock} {modalAction.item.unidad}</strong>
                </div>
              </div>

              {(modalAction.type === 'merma' || modalAction.type === 'ajuste') && state.activeUser.role !== 'admin' && (
                <div className="p-2.5 rounded-2xl bg-[#f2a93b]/15 border border-[#f2a93b]/40 text-[11px] text-[#f2a93b] flex items-center gap-2 font-semibold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Al guardar se solicitará el PIN de un Administrador para autorizar la baja.</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">
                    {modalAction.type === 'entrada'
                      ? 'Cantidad a sumar (Compra)'
                      : modalAction.type === 'merma'
                      ? 'Cantidad a descontar (Merma)'
                      : modalAction.type === 'ajuste'
                      ? 'Nueva existencia física total'
                      : 'Umbral mínimo para alerta'}
                  </label>
                  <input
                    type="number"
                    autoFocus
                    min="0"
                    step="any"
                    value={modalQty}
                    onChange={(e) => setModalQty(e.target.value)}
                    placeholder="Cantidad..."
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                  />
                </div>

                {modalAction.type !== 'minStock' && (
                  <>
                    <div>
                      <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Costo Unitario ($ MXN)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={modalCost}
                        onChange={(e) => setModalCost(e.target.value)}
                        placeholder={String(modalAction.item.costo || 0)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white font-mono tabular-nums focus:outline-none focus:border-[#c8a84b]"
                      />
                    </div>
                    <div>
                      <label className="block text-[rgba(240,230,211,0.68)] mb-1 font-semibold">Motivo / Factura / Proveedor</label>
                      <input
                        type="text"
                        value={modalReason}
                        onChange={(e) => setModalReason(e.target.value)}
                        placeholder={
                          modalAction.type === 'merma'
                            ? 'Ej. Producto caducado, derrame o merma de preparación...'
                            : 'Ej. Factura #492, Conteo semanal...'
                        }
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-white focus:outline-none focus:border-[#c8a84b]"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteModalAction}
                  className="min-h-[42px] px-5 py-2 rounded-2xl text-xs font-bold bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] transition-colors"
                >
                  {modalAction.type === 'merma' && state.activeUser.role !== 'admin'
                    ? 'Autorizar y Guardar'
                    : 'Guardar'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteClave !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 ios-scrim flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="ios-glass-modal max-w-sm w-full p-6 space-y-4 text-left">
              <h3 className="font-serif font-bold text-base text-[#e05252]">Eliminar Insumo</h3>
              <p className="text-xs text-[rgba(240,230,211,0.8)]">
                ¿Estás seguro de eliminar este insumo del sistema? Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteClave(null)}
                  className="min-h-[40px] px-4 py-2 rounded-2xl bg-white/[0.06] text-white text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(confirmDeleteClave)}
                  className="min-h-[40px] px-4 py-2 rounded-2xl bg-[#e05252] text-white text-xs font-bold"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ADMIN PIN AUTHORIZATION FOR MERMA / AJUSTE */}
      <IosPinPadModal
        open={Boolean(pendingMermaAuth)}
        title="Autorización de Administrador — Merma"
        subtitle={`Confirma el registro de ${pendingMermaAuth?.type === 'merma' ? 'merma' : 'ajuste'} para "${pendingMermaAuth?.item.descripcion || ''}" (${pendingMermaAuth?.qtyVal ?? ''} ${pendingMermaAuth?.item.unidad || ''}).`}
        rateLimitScope="inventory-merma-admin"
        allowCancel={true}
        onCancel={() => setPendingMermaAuth(null)}
        onValidatePin={async (enteredPin) => {
          if (!pendingMermaAuth) return false;
          let adminName: string | null = null;
          if (firebaseUser) {
            const res = await fsVerifyAnyAdminPinFromFirestore(enteredPin, firebaseUser, authorizedEmails);
            if (res.ok && res.user) {
              adminName = res.user.name;
            }
          } else {
            for (const u of (state.users || []).filter((usr) => usr.role === 'admin')) {
              const ok = await verifyPinSecret(enteredPin, u.pinHash, u.pin);
              if (ok) {
                adminName = u.name;
                break;
              }
            }
          }
          if (!adminName) return false;
          const payload = pendingMermaAuth;
          setPendingMermaAuth(null);
          commitInventoryMovement(payload, adminName);
          return true;
        }}
      />
    </div>
  );
};
