import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  History,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  User as UserIcon,
  X,
} from 'lucide-react';
import { lineTotalCents, serviceName } from '../core';
import {
  fsFetchClosedOrdersPage,
  fsFetchOrdersByDateRange,
  fsFetchSalesByDateRange,
  fsFetchSalesPage,
} from '../lib/firestoreSync';
import { formatMoney } from '../storage';
import type { FullPosState, Order, Sale, ServiceType } from '../types';
import { downloadCsvFile } from '../utils/csv';
import { mergePaginatedRecords } from '../utils/firestoreQueries';
import {
  buildOrderHistoryEntries,
  filterOrderHistoryEntries,
  resolveDatePresetRange,
  type OrderHistoryDatePreset,
  type OrderHistoryEntry,
  type OrderHistoryStatusFilter,
} from '../utils/orderHistory';
import { PaginatedList } from './PaginatedList';

interface OrderHistoryViewProps {
  state: FullPosState;
  firebaseUser: User | null;
  onOpenReceipt: (sale: Sale) => void;
  onOpenPreCheck: (order: Order) => void;
  onNotify: (msg: string) => void;
}

const DATE_PRESETS: Array<{ id: OrderHistoryDatePreset; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last7', label: 'Últimos 7 días' },
  { id: 'month', label: 'Este mes' },
];

export const OrderHistoryView: React.FC<OrderHistoryViewProps> = React.memo(
  ({ state, firebaseUser, onOpenReceipt, onOpenPreCheck, onNotify }) => {
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [datePreset, setDatePreset] = useState<OrderHistoryDatePreset>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>('all');
    const [serviceFilter, setServiceFilter] = useState<'all' | ServiceType>('all');

    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [expandedUid, setExpandedUid] = useState<string | null>(null);

    // Remote Firestore closed orders + older sales fetched for Order History
    const [remoteClosedOrders, setRemoteClosedOrders] = useState<Order[]>([]);
    const [remoteSales, setRemoteSales] = useState<Sale[]>([]);
    const [loadingInitial, setLoadingInitial] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [hasMoreClosedOrders, setHasMoreClosedOrders] = useState<boolean>(false);
    const [hasMoreRemoteSales, setHasMoreRemoteSales] = useState<boolean>(false);

    const closedOrdersCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
    const salesCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

    const fetchHistoryBatch = useCallback(
      async (opts: { reset: boolean; from?: string; to?: string }) => {
        if (!firebaseUser) return;
        if (opts.reset) {
          setLoadingInitial(true);
          closedOrdersCursorRef.current = null;
          salesCursorRef.current = null;
        } else {
          setLoadingMore(true);
        }

        try {
          const hasDateFilter = Boolean(opts.from || opts.to);
          const [ordersPage, salesPage] = await Promise.all([
            hasDateFilter
              ? fsFetchOrdersByDateRange(firebaseUser, {
                  dateFrom: opts.from,
                  dateTo: opts.to,
                  cursor: opts.reset ? null : closedOrdersCursorRef.current,
                  pageSize: 80,
                })
              : fsFetchClosedOrdersPage(firebaseUser, {
                  cursor: opts.reset ? null : closedOrdersCursorRef.current,
                  pageSize: 60,
                }),
            hasDateFilter
              ? fsFetchSalesByDateRange(firebaseUser, {
                  dateFrom: opts.from,
                  dateTo: opts.to,
                  cursor: opts.reset ? null : salesCursorRef.current,
                  pageSize: 80,
                })
              : fsFetchSalesPage(firebaseUser, {
                  cursor: opts.reset ? null : salesCursorRef.current,
                  pageSize: 60,
                }),
          ]);

          closedOrdersCursorRef.current = ordersPage.nextCursor;
          salesCursorRef.current = salesPage.nextCursor;
          setHasMoreClosedOrders(ordersPage.hasMore);
          setHasMoreRemoteSales(salesPage.hasMore);

          setRemoteClosedOrders((prev) =>
            opts.reset
              ? ordersPage.items
              : mergePaginatedRecords(prev, ordersPage.items, (o) => o.id)
          );
          setRemoteSales((prev) =>
            opts.reset
              ? salesPage.items
              : mergePaginatedRecords(prev, salesPage.items, (s) => s.id)
          );
        } catch (err) {
          onNotify(
            err instanceof Error
              ? err.message
              : 'No se pudo consultar el historial completo en Firestore.'
          );
        } finally {
          setLoadingInitial(false);
          setLoadingMore(false);
        }
      },
      [firebaseUser, onNotify]
    );

    // Load closed orders from Firestore when mounting or changing Firebase user
    useEffect(() => {
      if (!firebaseUser) return;
      void fetchHistoryBatch({ reset: true, from: dateFrom, to: dateTo });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firebaseUser?.uid]);

    const combinedSales = useMemo(
      () => mergePaginatedRecords(state.sales, remoteSales, (s) => s.id),
      [state.sales, remoteSales]
    );

    const combinedClosedOrders = useMemo(() => {
      const localClosed = state.orders.filter((o) => o.paid || o.status === 'closed');
      return mergePaginatedRecords(localClosed, remoteClosedOrders, (o) => o.id);
    }, [state.orders, remoteClosedOrders]);

    const allEntries = useMemo(
      () =>
        buildOrderHistoryEntries({
          openOrders: state.orders.filter((o) => !o.paid && o.status !== 'closed'),
          closedOrders: combinedClosedOrders,
          sales: combinedSales,
        }),
      [state.orders, combinedClosedOrders, combinedSales]
    );

    const filteredEntries = useMemo(
      () =>
        filterOrderHistoryEntries(allEntries, {
          searchQuery,
          dateFrom,
          dateTo,
          status: statusFilter,
          service: serviceFilter,
        }),
      [allEntries, searchQuery, dateFrom, dateTo, statusFilter, serviceFilter]
    );

    // Reset to page 1 when filters or page size change
    useEffect(() => {
      setPage(1);
    }, [searchQuery, dateFrom, dateTo, statusFilter, serviceFilter, pageSize]);

    const summaryStats = useMemo(() => {
      let totalCents = 0;
      let paidCount = 0;
      for (const entry of filteredEntries) {
        totalCents += entry.totalCents;
        if (entry.paid) paidCount += 1;
      }
      const avgCents =
        filteredEntries.length > 0 ? Math.round(totalCents / filteredEntries.length) : 0;
      return {
        count: filteredEntries.length,
        paidCount,
        totalCents,
        avgCents,
      };
    }, [filteredEntries]);

    const handleSelectPreset = (preset: OrderHistoryDatePreset) => {
      setDatePreset(preset);
      const range = resolveDatePresetRange(preset);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
      if (firebaseUser) {
        void fetchHistoryBatch({ reset: true, from: range.dateFrom, to: range.dateTo });
      }
    };

    const handleDateInputChange = (field: 'from' | 'to', value: string) => {
      setDatePreset('all');
      const nextFrom = field === 'from' ? value : dateFrom;
      const nextTo = field === 'to' ? value : dateTo;
      if (field === 'from') setDateFrom(value);
      else setDateTo(value);
      if (firebaseUser && (nextFrom || nextTo || (!nextFrom && !nextTo))) {
        void fetchHistoryBatch({ reset: true, from: nextFrom, to: nextTo });
      }
    };

    const handleClearFilters = () => {
      setSearchQuery('');
      setDatePreset('all');
      setDateFrom('');
      setDateTo('');
      setStatusFilter('all');
      setServiceFilter('all');
      if (firebaseUser) {
        void fetchHistoryBatch({ reset: true });
      }
    };

    const handleExportHistoryCsv = () => {
      if (filteredEntries.length === 0) {
        onNotify('No hay pedidos filtrados para exportar.');
        return;
      }
      const headers = [
        'Folio',
        'Fecha',
        'Hora',
        'Estado',
        'Cliente',
        'Teléfono',
        'Servicio',
        'Ubicación',
        'Mesero',
        'Artículos',
        'Método_Pago',
        'Descuento_MXN',
        'Total_MXN',
      ];
      const rows = filteredEntries.map((entry) => {
        const dt = new Date(entry.dateIso);
        return [
          entry.folio,
          Number.isNaN(dt.getTime()) ? entry.dateKey : dt.toLocaleDateString('es-MX'),
          Number.isNaN(dt.getTime())
            ? ''
            : dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          entry.statusLabel,
          entry.customerName || 'Público general',
          entry.customerPhone || '',
          serviceName(entry.service),
          entry.locationText,
          entry.waiter,
          String(entry.itemCount),
          entry.paymentMethod ? entry.paymentMethod.toUpperCase() : 'PENDIENTE',
          (entry.discountCents / 100).toFixed(2),
          (entry.totalCents / 100).toFixed(2),
        ];
      });
      downloadCsvFile(
        `barbachu-historial-${new Date().toISOString().slice(0, 10)}.csv`,
        headers,
        rows
      );
      onNotify(`Exportados ${filteredEntries.length} pedidos a CSV.`);
    };

    const renderHistoryRow = (entry: OrderHistoryEntry) => {
      const isExpanded = expandedUid === entry.uid;
      const dt = new Date(entry.dateIso);
      const dateDisplay = Number.isNaN(dt.getTime())
        ? entry.dateKey
        : dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeDisplay = Number.isNaN(dt.getTime())
        ? ''
        : dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

      return (
        <div className="rounded-2xl bg-[#161618]/90 border border-white/10 hover:border-[#c8a84b]/45 transition-colors overflow-hidden">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                <span className="font-mono font-bold text-white tabular-nums">{entry.folio}</span>
                <span className="text-[rgba(240,230,211,0.4)]">·</span>
                <span className="font-semibold text-[#e8d090]">{entry.locationText}</span>
                <span className="text-[rgba(240,230,211,0.4)]">·</span>
                <span
                  className={`text-xs font-bold uppercase tracking-wide ${
                    entry.paid ? 'text-[#25d366]' : 'text-[#e5a43b]'
                  }`}
                >
                  {entry.statusLabel}
                  {entry.paymentMethod ? ` (${entry.paymentMethod.toUpperCase()})` : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[rgba(240,230,211,0.72)] tabular-nums">
                <span className="inline-flex items-center gap-1.5 font-medium text-white">
                  <UserIcon className="w-3.5 h-3.5 text-[#c8a84b] shrink-0" />
                  <span>{entry.customerName || 'Cliente general'}</span>
                </span>
                {entry.customerPhone && (
                  <>
                    <span className="text-[rgba(240,230,211,0.35)]">·</span>
                    <span>{entry.customerPhone}</span>
                  </>
                )}
                <span className="text-[rgba(240,230,211,0.35)]">·</span>
                <span>Mesero: {entry.waiter}</span>
                <span className="text-[rgba(240,230,211,0.35)]">·</span>
                <span>
                  {dateDisplay} {timeDisplay}
                </span>
                <span className="text-[rgba(240,230,211,0.35)]">·</span>
                <span>
                  {entry.itemCount} {entry.itemCount === 1 ? 'artículo' : 'artículos'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
              <div className="text-left lg:text-right tabular-nums mr-1">
                <div className="font-mono font-bold text-base text-[#e8d090]">
                  {formatMoney(entry.totalCents)}
                </div>
                {entry.discountCents > 0 && (
                  <div className="text-[11px] text-[#25d366]">
                    Desc. -{formatMoney(entry.discountCents)}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setExpandedUid(isExpanded ? null : entry.uid)}
                aria-expanded={isExpanded}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <span className="inline-flex shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[#c8a84b]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#c8a84b]" />
                  )}
                </span>
                <span>{isExpanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
              </button>

              {entry.sourceSale ? (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(entry.sourceSale!)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Reimprimir Ticket
                </button>
              ) : (
                entry.sourceOrder && (
                  <button
                    type="button"
                    onClick={() => onOpenPreCheck(entry.sourceOrder!)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-[#e8d090] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> Pre-cuenta
                  </button>
                )
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="px-4 pb-4 pt-3 border-t border-white/10 bg-[#0a0a0b]/55 space-y-3 text-xs">
              {(entry.customerAddress || entry.note) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[rgba(240,230,211,0.78)]">
                  {entry.customerAddress && (
                    <div>
                      <span className="text-[#c8a84b] font-semibold">Dirección: </span>
                      {entry.customerAddress}
                    </div>
                  )}
                  {entry.note && (
                    <div>
                      <span className="text-[#c8a84b] font-semibold">Nota general: </span>
                      {entry.note}
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse tabular-nums">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[rgba(240,230,211,0.55)]">
                      <th className="py-1.5 pr-3 font-semibold">Cant.</th>
                      <th className="py-1.5 pr-3 font-semibold">Producto</th>
                      <th className="py-1.5 pr-3 font-semibold">Estación</th>
                      <th className="py-1.5 text-right font-semibold">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {entry.items.map((item, idx) => {
                      const mods = item.modifiers || item.modificadores || [];
                      return (
                        <tr key={`${entry.uid}-it-${idx}`}>
                          <td className="py-2 pr-3 font-mono font-bold text-white align-top">
                            {item.qty}×
                          </td>
                          <td className="py-2 pr-3 text-white align-top">
                            <div className="font-semibold">{item.name}</div>
                            {mods.length > 0 && (
                              <div className="text-[11px] text-[#e8d090]">
                                {mods
                                  .map((m) =>
                                    m.priceCents > 0
                                      ? `+ ${m.name} (${formatMoney(m.priceCents)})`
                                      : `+ ${m.name}`
                                  )
                                  .join(' · ')}
                              </div>
                            )}
                            {item.note && (
                              <div className="text-[11px] text-[rgba(240,230,211,0.62)]">
                                Nota: {item.note}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-[11px] uppercase text-[rgba(240,230,211,0.62)] align-top">
                            {item.station || 'cocina'}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-[#e8d090] align-top">
                            {formatMoney(lineTotalCents(item))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    };

    const hasActiveFilters = Boolean(
      searchQuery.trim() || dateFrom || dateTo || statusFilter !== 'all' || serviceFilter !== 'all'
    );

    return (
      <div className="space-y-5">
        {/* Header & Summary Strip */}
        <div className="p-5 ios-glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#173c34] border border-[#c8a84b]/40 text-[#e8d090] flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-xl text-white tracking-[-0.02em]">
                Historial de Pedidos y Tickets
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5">
                Consulta comandas pasadas y tickets cobrados por fecha o nombre de cliente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loadingInitial || !firebaseUser}
              onClick={() => void fetchHistoryBatch({ reset: true, from: dateFrom, to: dateTo })}
              className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-45"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInitial ? 'animate-spin' : ''}`} />
              <span>Actualizar nube</span>
            </button>
            <button
              type="button"
              onClick={handleExportHistoryCsv}
              className="min-h-[42px] px-3.5 py-2 rounded-2xl bg-[#173c34] hover:bg-[#28584c] border border-[#c8a84b]/40 text-xs font-bold text-[#e8d090] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" /> <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
          <div className="p-4 ios-glass-card">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold">
              Tickets Encontrados
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {summaryStats.count}
            </div>
            <div className="text-xs text-[rgba(240,230,211,0.62)] mt-0.5">
              {summaryStats.paidCount} pagados · {summaryStats.count - summaryStats.paidCount} activos
            </div>
          </div>

          <div className="p-4 ios-glass-card">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold">
              Monto Acumulado (Filtro)
            </div>
            <div className="text-2xl font-mono font-bold text-[#25d366] mt-1">
              {formatMoney(summaryStats.totalCents)}
            </div>
            <div className="text-xs text-[rgba(240,230,211,0.62)] mt-0.5">
              Suma de resultados visibles
            </div>
          </div>

          <div className="p-4 ios-glass-card">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[rgba(240,230,211,0.58)] font-semibold">
              Ticket Promedio
            </div>
            <div className="text-2xl font-mono font-bold text-[#e8d090] mt-1">
              {formatMoney(summaryStats.avgCents)}
            </div>
            <div className="text-xs text-[rgba(240,230,211,0.62)] mt-0.5">
              Por pedido filtrado
            </div>
          </div>
        </div>

        {/* Search & Date Filter Controls */}
        <div className="p-4 ios-glass-card space-y-3.5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Customer / Folio Search */}
            <div className="lg:col-span-5 relative">
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold mb-1">
                Buscar por Cliente, Folio o Mesero
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej. Juan Pérez, BC-00012, #45, Mesa 3..."
                  aria-label="Buscar tickets por nombre de cliente o folio"
                  className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-sm text-white placeholder-[rgba(240,230,211,0.45)] focus:outline-none focus:border-[#c8a84b]"
                />
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[rgba(240,230,211,0.55)]" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-2 w-7 h-7 rounded-xl flex items-center justify-center text-[rgba(240,230,211,0.65)] hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Date From */}
            <div className="sm:col-span-6 lg:col-span-2">
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold mb-1">
                Fecha Desde
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleDateInputChange('from', e.target.value)}
                  aria-label="Fecha inicial"
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-xs text-white focus:outline-none focus:border-[#c8a84b] tabular-nums"
                />
              </div>
            </div>

            {/* Date To */}
            <div className="sm:col-span-6 lg:col-span-2">
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold mb-1">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateInputChange('to', e.target.value)}
                aria-label="Fecha final"
                className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-xs text-white focus:outline-none focus:border-[#c8a84b] tabular-nums"
              />
            </div>

            {/* Service Filter */}
            <div className="lg:col-span-3">
              <label className="block text-[11px] uppercase tracking-[0.06em] text-[rgba(240,230,211,0.58)] font-semibold mb-1">
                Tipo de Servicio
              </label>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value as 'all' | ServiceType)}
                aria-label="Filtrar por tipo de servicio"
                className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-[#0a0a0b]/75 border border-white/10 text-xs text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
              >
                <option value="all">Todos los servicios</option>
                <option value="mesa">Mesa (Salón)</option>
                <option value="barra_exterior">Barra Exterior / Terraza</option>
                <option value="barra_interior">Barra Interior</option>
                <option value="para_llevar">Para Llevar</option>
                <option value="domicilio">A Domicilio</option>
              </select>
            </div>
          </div>

          {/* Date Presets + Status Filter Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[rgba(240,230,211,0.58)] mr-1">
                <Calendar className="w-3.5 h-3.5 text-[#c8a84b]" /> Rango rápido:
              </span>
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                    datePreset === p.id &&
                    (p.id !== 'all' || (!dateFrom && !dateTo))
                      ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b]'
                      : 'bg-white/[0.04] border-white/10 text-[rgba(240,230,211,0.78)] hover:border-[#c8a84b]/60'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0a0a0b]/75 border border-white/10">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'paid', label: 'Pagados' },
                    { id: 'active', label: 'Abiertos' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      statusFilter === tab.id
                        ? 'bg-[#173c34] text-[#e8d090] border border-[#c8a84b]/40'
                        : 'text-[rgba(240,230,211,0.65)] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#e8d090] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Paginated Order History List */}
        <PaginatedList
          items={filteredEntries}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 20, 50]}
          keyExtractor={(item) => item.uid}
          renderItem={renderHistoryRow}
          loading={loadingInitial}
          loadingLabel="Consultando historial de pedidos en Firestore..."
          itemLabel="tickets"
          hasMoreRemote={hasMoreClosedOrders || hasMoreRemoteSales}
          loadingMoreRemote={loadingMore}
          onLoadMoreRemote={() =>
            void fetchHistoryBatch({ reset: false, from: dateFrom, to: dateTo })
          }
          emptyState={
            <div className="p-10 ios-glass-card text-center space-y-3">
              <History className="w-8 h-8 mx-auto text-[#c8a84b]/60" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">
                  No se encontraron tickets con los filtros actuales
                </p>
                <p className="text-xs text-[rgba(240,230,211,0.62)]">
                  Prueba ajustando la fecha o buscando otro nombre de cliente, folio o mesero.
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restablecer filtros
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }
);
