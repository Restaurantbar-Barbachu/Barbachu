import React, { useMemo, useState } from 'react';
import { Clock, DollarSign, FileText, Plus, Search, X } from 'lucide-react';
import { formatMoney } from '../storage';
import type { Order, OrderStatus, ServiceType } from '../types';

export interface TableLocationOption {
  service: ServiceType;
  loc: string;
  label: string;
  section: string;
}

interface TableMapProps {
  openOrders: Order[];
  openOrdersByLocation: Map<string, Order[]>;
  totalOccupiedTables: number;
  tableLocations: TableLocationOption[];
  nowMs: number;
  canViewPos: boolean;
  canCollectPayment: boolean;
  onOpenEmptyLocation: (
    service: ServiceType,
    loc: string,
    label: string,
    isExtraAccount?: boolean
  ) => void;
  onLoadOrder: (order: Order) => void;
  onAdvanceOrderStatus: (orderId: string, currentStatus: OrderStatus) => void;
  onOpenPreCheck: (order: Order) => void;
  onGoToCash: (orderId: string) => void;
  onNotify: (msg: string) => void;
}

function formatElapsedTime(createdAt: string, nowMs: number): string {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start)) return '0m';
  const mins = Math.max(0, Math.floor((nowMs - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

const SECTIONS = ['Salón Principal', 'Barra Exterior', 'Barra Interior', 'Mostrador', 'Reparto'] as const;

export const TableMap: React.FC<TableMapProps> = React.memo(
  ({
    openOrders,
    openOrdersByLocation,
    totalOccupiedTables,
    tableLocations,
    nowMs,
    canViewPos,
    canCollectPayment,
    onOpenEmptyLocation,
    onLoadOrder,
    onAdvanceOrderStatus,
    onOpenPreCheck,
    onGoToCash,
    onNotify,
  }) => {
    const [tableZoneFilter, setTableZoneFilter] = useState<'todas' | ServiceType>('todas');
    const [tableStatusFilter, setTableStatusFilter] = useState<'todas' | 'free' | 'busy' | 'ready'>('todas');
    const [tableSearch, setTableSearch] = useState<string>('');
    const [tableSheetLoc, setTableSheetLoc] = useState<TableLocationOption | null>(null);

    const readyOrdersCount = useMemo(
      () => openOrders.filter((o) => o.status === 'ready').length,
      [openOrders]
    );
    const activeTotalCents = useMemo(
      () => openOrders.reduce((s, o) => s + o.totalCents, 0),
      [openOrders]
    );

    const sheetOrders = useMemo(() => {
      if (!tableSheetLoc) return [];
      return openOrdersByLocation.get(`${tableSheetLoc.service}::${tableSheetLoc.loc}`) || [];
    }, [openOrdersByLocation, tableSheetLoc]);

    return (
      <div className="space-y-5">
        {/* Top Filter & Stats Bar */}
        <div className="p-4 sm:p-5 ios-glass-card space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Mapa de Mesas y Barra
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums mt-0.5">
                {totalOccupiedTables} ocupadas · {readyOrdersCount} listas para servir · {formatMoney(activeTotalCents)} acumulado activo
              </p>
            </div>

            {/* Search Table / Waiter / #Order */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar mesa, mesero o #..."
                aria-label="Buscar mesa, mesero o número de cuenta"
                className="w-full min-h-[42px] pl-9 pr-8 py-2 rounded-2xl bg-[#0a0a0b]/70 border border-white/10 text-xs text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
              />
              <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-[rgba(240,230,211,0.55)]" />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  aria-label="Limpiar búsqueda de mesas"
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

        {SECTIONS.map((sec) => {
          const q = tableSearch.trim().toLowerCase();
          const locs = tableLocations.filter((t) => {
            if (tableZoneFilter !== 'todas' && t.service !== tableZoneFilter) return false;
            if (t.section !== sec) return false;

            const ordersAtLoc = openOrdersByLocation.get(`${t.service}::${t.loc}`) || [];
            const isBusy = ordersAtLoc.length > 0;
            const hasReady = ordersAtLoc.some((o) => o.status === 'ready');

            if (tableStatusFilter === 'free' && isBusy) return false;
            if (tableStatusFilter === 'busy' && !isBusy) return false;
            if (tableStatusFilter === 'ready' && !hasReady) return false;

            if (q) {
              const matchLabel = t.label.toLowerCase().includes(q) || t.section.toLowerCase().includes(q);
              const matchOrder = ordersAtLoc.some(
                (o) => String(o.number).includes(q) || o.waiter.toLowerCase().includes(q)
              );
              if (!matchLabel && !matchOrder) return false;
            }
            return true;
          });

          if (locs.length === 0) return null;

          return (
            <div key={sec} className="space-y-3">
              <h4 className="text-xs uppercase tracking-[0.08em] font-bold text-[rgba(240,230,211,0.58)] px-1">
                {sec}
              </h4>
              <div className="table-map-grid">
                {locs.map((loc) => {
                  const ordersAtLoc = openOrdersByLocation.get(`${loc.service}::${loc.loc}`) || [];
                  const isBusy = ordersAtLoc.length > 0;
                  const hasReady = ordersAtLoc.some((o) => o.status === 'ready');
                  const totalLoc = ordersAtLoc.reduce((sum, o) => sum + o.totalCents, 0);
                  const oldestOrder = ordersAtLoc.reduce<Order | null>((oldest, cur) => {
                    if (!oldest) return cur;
                    return new Date(cur.createdAt).getTime() < new Date(oldest.createdAt).getTime()
                      ? cur
                      : oldest;
                  }, null);

                  const tileStateClass = hasReady ? 'ready' : isBusy ? 'busy' : 'free';

                  return (
                    <button
                      type="button"
                      key={`${loc.service}-${loc.loc}`}
                      onClick={() => {
                        if (isBusy) {
                          setTableSheetLoc(loc);
                        } else if (canViewPos) {
                          onOpenEmptyLocation(loc.service, loc.loc, loc.label, false);
                        } else {
                          onNotify('Esta ubicación está disponible.');
                        }
                      }}
                      className={`table-tile ${tileStateClass} w-full text-left`}
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
                        {isBusy && <span className="text-xs font-bold text-white/80">Gestionar →</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* iOS Table Quick-Action Sheet Modal */}
        {tableSheetLoc && (
          <div
            className="fixed inset-0 z-50 ios-scrim flex items-end sm:items-center justify-center p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="ios-glass-modal w-full sm:max-w-lg rounded-b-none sm:rounded-[28px] p-6 space-y-4 text-left max-h-[85dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                    {tableSheetLoc.label}
                  </h3>
                  <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums mt-0.5">
                    {tableSheetLoc.section} · {sheetOrders.length} cuenta{sheetOrders.length !== 1 ? 's' : ''} ·{' '}
                    {formatMoney(sheetOrders.reduce((s, o) => s + o.totalCents, 0))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTableSheetLoc(null)}
                  aria-label="Cerrar panel de mesa"
                  className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[rgba(240,230,211,0.72)] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {sheetOrders.map((ord) => (
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
                          {ord.waiter} · {ord.items.reduce((s, i) => s + i.qty, 0)} art. ·{' '}
                          {formatElapsedTime(ord.createdAt, nowMs)}
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
                            onLoadOrder(ord);
                          }}
                          className="flex-1 min-h-[42px] px-3 py-2 rounded-2xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-white text-xs font-bold whitespace-nowrap"
                        >
                          Editar / Agregar
                        </button>
                      )}
                      {ord.status === 'ready' && (
                        <button
                          type="button"
                          onClick={() => onAdvanceOrderStatus(ord.id, 'ready')}
                          className="min-h-[42px] px-3 py-2 rounded-2xl bg-[#25d366]/20 hover:bg-[#25d366] text-[#25d366] hover:text-[#0a0a0b] text-xs font-bold whitespace-nowrap transition-colors"
                        >
                          Marcar Servido
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTableSheetLoc(null);
                          onOpenPreCheck(ord);
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
                            onGoToCash(ord.id);
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
                    onOpenEmptyLocation(target.service, target.loc, target.label, true);
                  }}
                  className="w-full min-h-[46px] py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-[#e8d090] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Abrir Otra Cuenta Independiente en {tableSheetLoc.label}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

TableMap.displayName = 'TableMap';
