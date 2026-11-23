import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Package, TrendingUp } from 'lucide-react';
import type { FullPosState } from '../types';
import { formatMoney } from '../storage';
import {
  buildHourlySalesTrend,
  buildInventoryLevels,
  buildSalesTrend,
  type InventoryHealthStatus,
} from '../utils/dashboardMetrics';

interface PosDashboardPanelProps {
  state: FullPosState;
  canViewInventory: boolean;
  canViewPos: boolean;
  onOpenInventory: () => void;
  onOpenPos: () => void;
}

const INVENTORY_STATUS_META: Record<
  InventoryHealthStatus,
  { label: string; color: string; textClass: string }
> = {
  critico: {
    label: 'Crítico',
    color: '#e05252',
    textClass: 'text-[#e05252]',
  },
  bajo: {
    label: 'Bajo',
    color: '#e5a43b',
    textClass: 'text-[#e5a43b]',
  },
  optimo: {
    label: 'Óptimo',
    color: '#25d366',
    textClass: 'text-[#25d366]',
  },
};

const SalesTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { tickets?: number } }>;
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const amount = typeof point.value === 'number' ? point.value : 0;
  const tickets = point.payload?.tickets ?? 0;

  return (
    <div className="rounded-2xl bg-[#161618]/95 backdrop-blur-xl border border-white/15 px-3.5 py-2.5 text-xs shadow-2xl space-y-1">
      <div className="font-serif font-bold text-white">{label}</div>
      <div className="font-mono font-bold text-[#e8d090] tabular-nums">
        ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
      </div>
      <div className="text-[rgba(240,230,211,0.68)] tabular-nums">
        {tickets} {tickets === 1 ? 'ticket cobrado' : 'tickets cobrados'}
      </div>
    </div>
  );
};

const InventoryTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      fullName: string;
      stock: number;
      minStock: number;
      unidad: string;
      categoria: string;
      status: InventoryHealthStatus;
    };
  }>;
}) => {
  if (!active || !payload || !payload[0]?.payload) return null;
  const item = payload[0].payload;
  const meta = INVENTORY_STATUS_META[item.status];

  return (
    <div className="rounded-2xl bg-[#161618]/95 backdrop-blur-xl border border-white/15 px-3.5 py-2.5 text-xs shadow-2xl space-y-1">
      <div className="font-semibold text-white">{item.fullName}</div>
      <div className="text-[rgba(240,230,211,0.65)]">
        {item.categoria} · Estado: <strong className={meta.textClass}>{meta.label}</strong>
      </div>
      <div className="font-mono text-white tabular-nums pt-0.5">
        Existencia: <strong className="text-[#e8d090]">{item.stock}</strong> {item.unidad}
        {' / '}Mínimo: {item.minStock} {item.unidad}
      </div>
    </div>
  );
};

export const PosDashboardPanel: React.FC<PosDashboardPanelProps> = ({
  state,
  canViewInventory,
  canViewPos,
  onOpenInventory,
  onOpenPos,
}) => {
  const [salesMode, setSalesMode] = useState<'daily' | 'hourly'>('daily');

  const dailyTrend = useMemo(() => buildSalesTrend(state.sales, 7), [state.sales]);
  const hourlyTrend = useMemo(() => buildHourlySalesTrend(state.sales), [state.sales]);
  const inventoryMetrics = useMemo(() => buildInventoryLevels(state.inventory, 8), [state.inventory]);

  const weeklyTotalCents = useMemo(
    () => Math.round(dailyTrend.reduce((acc, p) => acc + p.ventas * 100, 0)),
    [dailyTrend]
  );

  const hasAnySales = useMemo(
    () =>
      salesMode === 'daily'
        ? dailyTrend.some((d) => d.ventas > 0)
        : hourlyTrend.some((h) => h.ventas > 0),
    [salesMode, dailyTrend, hourlyTrend]
  );

  return (
    <motion.section
      aria-label="Panel de control de ventas e inventario"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="grid grid-cols-1 xl:grid-cols-12 gap-6"
    >
      {/* Left: Sales Trends Chart */}
      <div className="xl:col-span-6 p-5 sm:p-6 ios-glass-card flex flex-col justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#c8a84b]/15 border border-[#c8a84b]/30 flex items-center justify-center text-[#e8d090] shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Tendencia de Ventas
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums">
                {salesMode === 'daily'
                  ? `Últimos 7 días · ${formatMoney(weeklyTotalCents)} acumulados`
                  : 'Distribución por hora del día en curso'}
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Periodo de tendencia de ventas"
            className="inline-flex p-1 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => setSalesMode('daily')}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                salesMode === 'daily'
                  ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                  : 'text-[rgba(240,230,211,0.68)] hover:text-white'
              }`}
            >
              7 Días
            </button>
            <button
              type="button"
              onClick={() => setSalesMode('hourly')}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                salesMode === 'hourly'
                  ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                  : 'text-[rgba(240,230,211,0.68)] hover:text-white'
              }`}
            >
              Por Hora
            </button>
          </div>
        </div>

        <div className="h-64 w-full">
          {!hasAnySales ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 gap-3">
              <p className="text-sm font-semibold text-white">Sin ventas registradas en este periodo</p>
              <p className="text-xs text-[rgba(240,230,211,0.62)] max-w-sm">
                Las curvas de ingresos aparecerán automáticamente al cerrar tu primera cuenta en Caja.
              </p>
              {canViewPos && (
                <button
                  type="button"
                  onClick={onOpenPos}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  Abrir Comandero <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {salesMode === 'daily' ? (
                <AreaChart data={dailyTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardGoldArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c8a84b" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#c8a84b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                  <XAxis
                    dataKey="date"
                    stroke="rgba(240,230,211,0.45)"
                    tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="rgba(240,230,211,0.45)"
                    tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip content={<SalesTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ventas"
                    name="Ventas"
                    stroke="#c8a84b"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#dashboardGoldArea)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={hourlyTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                  <XAxis
                    dataKey="hora"
                    stroke="rgba(240,230,211,0.45)"
                    tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="rgba(240,230,211,0.45)"
                    tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip content={<SalesTooltip />} />
                  <Bar dataKey="ventas" name="Ventas por Hora" fill="#c8a84b" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Right: Current Inventory Levels Chart */}
      <div className="xl:col-span-6 p-5 sm:p-6 ios-glass-card flex flex-col justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#173c34] border border-[#25d366]/30 flex items-center justify-center text-[#25d366] shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
                Niveles de Inventario Actuales
              </h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)] tabular-nums">
                {inventoryMetrics.totalItems} insumos · {inventoryMetrics.criticalCount} críticos ·{' '}
                {inventoryMetrics.lowCount} bajos · Valor{' '}
                {formatMoney(Math.round(inventoryMetrics.totalValuation * 100))}
              </p>
            </div>
          </div>

          {canViewInventory && (
            <button
              type="button"
              onClick={onOpenInventory}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#e8d090] inline-flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap shrink-0 transition-colors"
            >
              Gestionar Stock <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="h-64 w-full">
          {inventoryMetrics.chartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 gap-3">
              <p className="text-sm font-semibold text-white">Sin insumos registrados en inventario</p>
              <p className="text-xs text-[rgba(240,230,211,0.62)] max-w-sm">
                Registra insumos y existencias mínimas para monitorear alertas de resurtido aquí.
              </p>
              {canViewInventory && (
                <button
                  type="button"
                  onClick={onOpenInventory}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#25d366] text-[#0a0a0b] text-xs font-bold whitespace-nowrap"
                >
                  Ir a Inventario
                </button>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={inventoryMetrics.chartItems}
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                <XAxis
                  type="number"
                  stroke="rgba(240,230,211,0.45)"
                  tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  width={118}
                  stroke="rgba(240,230,211,0.45)"
                  tick={{ fill: '#f0e6d3', fontSize: 11 }}
                />
                <Tooltip content={<InventoryTooltip />} />
                <Bar dataKey="stock" name="Existencia" radius={[0, 6, 6, 0]}>
                  {inventoryMetrics.chartItems.map((entry) => (
                    <Cell
                      key={entry.clave}
                      fill={INVENTORY_STATUS_META[entry.status].color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Accessible legend with explicit text labels (not color-only) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs text-[rgba(240,230,211,0.72)] tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#e05252]" aria-hidden="true" />
              Crítico ({inventoryMetrics.criticalCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#e5a43b]" aria-hidden="true" />
              Bajo ({inventoryMetrics.lowCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#25d366]" aria-hidden="true" />
              Óptimo ({inventoryMetrics.healthyCount})
            </span>
          </div>
          <span className="text-[rgba(240,230,211,0.55)]">Prioridad de resurtido</span>
        </div>
      </div>
    </motion.section>
  );
};
