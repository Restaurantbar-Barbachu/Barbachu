import React, { useMemo, useState } from 'react';
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
import { ArrowRight, BarChart3, TrendingUp, UtensilsCrossed } from 'lucide-react';
import type { FullPosState } from '../types';
import { formatMoney } from '../storage';
import {
  buildDailySalesSummary,
  buildSalesPerformanceMetrics,
  buildSalesTrend,
} from '../utils/dashboardMetrics';

interface SalesDashboardProps {
  state: FullPosState;
  isLiveCloud?: boolean;
  onOpenReports?: () => void;
  onOpenPos?: () => void;
}

const SalesVolumeTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { tickets?: number } }>;
  label?: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const amount = typeof payload[0]?.value === 'number' ? payload[0].value : 0;
  const tickets = payload[0]?.payload?.tickets ?? 0;

  return (
    <div className="rounded-2xl bg-[#161618]/95 backdrop-blur-xl border border-white/15 px-3.5 py-2.5 text-xs shadow-2xl space-y-1">
      <p className="font-serif font-bold text-white">{label}</p>
      <p className="font-mono font-bold text-[#e8d090] tabular-nums">
        ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
      </p>
      <p className="text-[rgba(240,230,211,0.68)] tabular-nums">
        {tickets} {tickets === 1 ? 'ticket cobrado' : 'tickets cobrados'}
      </p>
    </div>
  );
};

const ProductPerformanceTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      fullName: string;
      categoria: string;
      ingresos: number;
      unidades: number;
    };
  }>;
}) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="rounded-2xl bg-[#161618]/95 backdrop-blur-xl border border-white/15 px-3.5 py-2.5 text-xs shadow-2xl space-y-1">
      <p className="font-semibold text-white">{row.fullName}</p>
      <p className="text-[rgba(240,230,211,0.62)]">{row.categoria}</p>
      <p className="font-mono font-bold text-[#e8d090] tabular-nums">
        ${row.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
        {' · '}
        {row.unidades} {row.unidades === 1 ? 'unidad' : 'unidades'}
      </p>
    </div>
  );
};

export const SalesDashboard: React.FC<SalesDashboardProps> = ({
  state,
  isLiveCloud = true,
  onOpenReports,
  onOpenPos,
}) => {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [chartStyle, setChartStyle] = useState<'area' | 'bar'>('area');
  const [productMetric, setProductMetric] = useState<'revenue' | 'units'>('revenue');

  const summary = useMemo(
    () => buildDailySalesSummary(state.sales, state.products),
    [state.sales, state.products]
  );

  const dailyVolume = useMemo(
    () => buildSalesTrend(state.sales, rangeDays),
    [state.sales, rangeDays]
  );

  const rangeSales = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (rangeDays - 1));
    return state.sales.filter((s) => new Date(s.paidAt) >= cutoff);
  }, [state.sales, rangeDays]);

  const { topProducts } = useMemo(
    () => buildSalesPerformanceMetrics(rangeSales, state.products, productMetric),
    [rangeSales, state.products, productMetric]
  );

  const rangeTotalCents = useMemo(
    () => Math.round(dailyVolume.reduce((acc, pt) => acc + pt.ventas * 100, 0)),
    [dailyVolume]
  );

  const hasRangeSales = dailyVolume.some((pt) => pt.ventas > 0);
  const totalTopRevenue = topProducts.reduce((acc, p) => acc + p.ingresos, 0);

  return (
    <section
      aria-label="Analítica ejecutiva de ventas en tiempo real"
      className="ios-glass-card p-5 sm:p-6 space-y-6 text-left"
    >
      {/* Header & Range Switch */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#c8a84b]/15 border border-[#c8a84b]/30 flex items-center justify-center text-[#e8d090] shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-lg text-white tracking-[-0.02em]">
              Analítica de Ventas en Tiempo Real
            </h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5 tabular-nums">
              {isLiveCloud ? 'Sincronizado en vivo con Firestore' : 'Modo caché local'}
              {' · '}
              {rangeDays} días: {formatMoney(rangeTotalCents)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Rango de días para volumen de ventas"
            className="inline-flex p-1 rounded-2xl bg-[#0a0a0b]/80 border border-white/10"
          >
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  rangeDays === days
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                {days} Días
              </button>
            ))}
          </div>

          {onOpenReports && (
            <button
              type="button"
              onClick={onOpenReports}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#e8d090] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              Ver Reportes Completos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Real-time KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="p-4 rounded-2xl bg-[#0a0a0b]/55 border border-white/10">
          <div className="text-xs text-[rgba(240,230,211,0.62)] font-medium">Ventas de Hoy</div>
          <div className="text-xl lg:text-2xl font-mono font-bold text-[#e8d090] mt-1">
            {formatMoney(summary.todayRevenueCents)}
          </div>
          <div className="text-[11px] text-[rgba(240,230,211,0.55)] mt-1">
            {summary.todayUnits} unidades cobradas
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0a0a0b]/55 border border-white/10">
          <div className="text-xs text-[rgba(240,230,211,0.62)] font-medium">Tickets Cobrados Hoy</div>
          <div className="text-xl lg:text-2xl font-mono font-bold text-white mt-1">
            {summary.todayTickets}
          </div>
          <div className="text-[11px] text-[rgba(240,230,211,0.55)] mt-1">
            Cuentas cerradas en caja
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0a0a0b]/55 border border-white/10">
          <div className="text-xs text-[rgba(240,230,211,0.62)] font-medium">Ticket Promedio</div>
          <div className="text-xl lg:text-2xl font-mono font-bold text-white mt-1">
            {formatMoney(summary.averageTicketCents)}
          </div>
          <div className="text-[11px] text-[rgba(240,230,211,0.55)] mt-1">
            Consumo medio por cuenta
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0a0a0b]/55 border border-white/10">
          <div className="text-xs text-[rgba(240,230,211,0.62)] font-medium">Producto Líder</div>
          <div className="text-sm lg:text-base font-bold text-[#25d366] mt-1.5 truncate">
            {summary.topProductName || 'Sin registros aún'}
          </div>
          <div className="text-[11px] text-[rgba(240,230,211,0.55)] mt-1">
            {summary.topProductName
              ? `${summary.topProductUnits} uds vendidas`
              : 'Esperando primer cobro'}
          </div>
        </div>
      </div>

      {/* Charts Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Daily Sales Volume */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#c8a84b]" />
              <h4 className="font-serif font-bold text-base text-white">
                Volumen de Ventas Diarias ($ MXN)
              </h4>
            </div>
            <div
              role="group"
              aria-label="Tipo de gráfica de ventas diarias"
              className="inline-flex p-1 rounded-xl bg-[#0a0a0b]/80 border border-white/10 text-xs"
            >
              <button
                type="button"
                onClick={() => setChartStyle('area')}
                className={`min-h-[32px] px-2.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  chartStyle === 'area'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Área
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('bar')}
                className={`min-h-[32px] px-2.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  chartStyle === 'bar'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Barras
              </button>
            </div>
          </div>

          <div className="h-72 w-full">
            {!hasRangeSales ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 gap-3">
                <p className="text-sm font-semibold text-white">
                  Sin ventas registradas en los últimos {rangeDays} días
                </p>
                <p className="text-xs text-[rgba(240,230,211,0.62)] max-w-sm">
                  Al cobrar la primera comanda en Caja verás aquí el volumen diario en tiempo real.
                </p>
                {onOpenPos && (
                  <button
                    type="button"
                    onClick={onOpenPos}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#c8a84b] hover:bg-[#e8d090] text-[#0a0a0b] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    Ir al Comandero <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chartStyle === 'area' ? (
                  <AreaChart data={dailyVolume} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesDashboardGold" x1="0" y1="0" x2="0" y2="1">
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
                    <Tooltip content={<SalesVolumeTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="ventas"
                      name="Ventas Diarias"
                      stroke="#c8a84b"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#salesDashboardGold)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={dailyVolume} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
                    <Tooltip content={<SalesVolumeTooltip />} />
                    <Bar
                      dataKey="ventas"
                      name="Ventas Diarias"
                      fill="#c8a84b"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top-Selling Products Performance */}
        <div className="xl:col-span-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-[#c8a84b]" />
              <h4 className="font-serif font-bold text-base text-white">
                Productos Más Vendidos
              </h4>
            </div>
            <div
              role="group"
              aria-label="Métrica de rendimiento de productos"
              className="inline-flex p-1 rounded-xl bg-[#0a0a0b]/80 border border-white/10 text-xs"
            >
              <button
                type="button"
                onClick={() => setProductMetric('revenue')}
                className={`min-h-[32px] px-2.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  productMetric === 'revenue'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Ingresos
              </button>
              <button
                type="button"
                onClick={() => setProductMetric('units')}
                className={`min-h-[32px] px-2.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  productMetric === 'units'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Unidades
              </button>
            </div>
          </div>

          {topProducts.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10">
              <p className="text-sm font-semibold text-white">
                Sin productos vendidos en este rango
              </p>
              <p className="text-xs text-[rgba(240,230,211,0.62)] mt-1 max-w-xs">
                El ranking de platillos y bebidas se actualizará automáticamente tras cada cobro.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={topProducts.slice(0, 5)}
                    margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                    <XAxis
                      type="number"
                      stroke="rgba(240,230,211,0.45)"
                      tick={{ fill: 'rgba(240,230,211,0.72)', fontSize: 11 }}
                      tickFormatter={(v) => (productMetric === 'revenue' ? `$${v}` : `${v}`)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      stroke="rgba(240,230,211,0.45)"
                      tick={{ fill: '#f0e6d3', fontSize: 11 }}
                    />
                    <Tooltip content={<ProductPerformanceTooltip />} />
                    <Bar
                      dataKey={productMetric === 'revenue' ? 'ingresos' : 'unidades'}
                      radius={[0, 6, 6, 0]}
                    >
                      {topProducts.slice(0, 5).map((_, idx) => (
                        <Cell
                          key={`top-prod-${idx}`}
                          fill={idx === 0 ? '#25d366' : idx === 1 ? '#e8d090' : '#c8a84b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-white/10 rounded-2xl bg-[#0a0a0b]/50 border border-white/10 overflow-hidden text-xs tabular-nums">
                {topProducts.slice(0, 5).map((item, idx) => {
                  const sharePct =
                    totalTopRevenue > 0 ? Math.round((item.ingresos / totalTopRevenue) * 100) : 0;
                  return (
                    <div
                      key={`${item.fullName}-${idx}`}
                      className="flex items-center justify-between gap-2 px-3.5 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-[#e8d090] w-5 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-white truncate">{item.fullName}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-white">
                          ${item.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                        </span>
                        <span className="text-[rgba(240,230,211,0.62)] ml-2">
                          {item.unidades} uds · {sharePct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
