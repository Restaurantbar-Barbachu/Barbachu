import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { BarChart3, Clock, CreditCard, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { FullPosState } from '../types';
import { formatMoney } from '../storage';
import { buildSalesPerformanceMetrics, buildSalesTrend, toLocalDateKey } from '../utils/dashboardMetrics';

interface PosAnalyticsDashboardProps {
  state: FullPosState;
  onRefresh?: () => void;
}

const PAYMENT_COLORS: Record<string, string> = {
  efectivo: '#25d366',
  tarjeta: '#c8a84b',
  transferencia: '#3b82f6',
  mixto: '#e8d090',
};

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; fill?: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#161618]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-3 shadow-2xl text-xs space-y-1">
        <p className="font-serif font-bold text-white border-b border-white/10 pb-1 mb-1">{label}</p>
        {payload.map((entry, index) => {
          const nameLower = String(entry.name || '').toLowerCase();
          const isMoney =
            nameLower.includes('venta') ||
            nameLower.includes('ingreso') ||
            nameLower.includes('total');
          return (
            <p key={index} className="flex items-center justify-between gap-4 tabular-nums">
              <span style={{ color: entry.color || entry.fill }}>{entry.name}:</span>
              <span className="font-bold text-white">
                {typeof entry.value === 'number' && isMoney
                  ? `$${entry.value.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : entry.value}
              </span>
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

export const PosAnalyticsDashboard: React.FC<PosAnalyticsDashboardProps> = ({ state }) => {
  const [timeRange, setTimeRange] = useState<'hoy' | 'semana' | 'mes'>('hoy');
  const [productMetric, setProductMetric] = useState<'revenue' | 'units'>('revenue');
  const [salesChartType, setSalesChartType] = useState<'daily' | 'hourly'>('daily');

  const filteredSales = useMemo(() => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    if (timeRange === 'hoy') {
      return state.sales.filter((s) => toLocalDateKey(s.paidAt) === todayKey);
    }
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (timeRange === 'semana' ? 7 : 30));
    return state.sales.filter((s) => new Date(s.paidAt) >= cutoff);
  }, [state.sales, timeRange]);

  const totalRevenueCents = useMemo(
    () => filteredSales.reduce((acc, s) => acc + s.totalCents, 0),
    [filteredSales]
  );

  const averageTicketCents = useMemo(() => {
    if (filteredSales.length === 0) return 0;
    return Math.round(totalRevenueCents / filteredSales.length);
  }, [filteredSales.length, totalRevenueCents]);

  const totalUnitsSold = useMemo(
    () => filteredSales.reduce((acc, s) => acc + s.items.reduce((sum, item) => sum + item.qty, 0), 0),
    [filteredSales]
  );

  const activeTablesCount = useMemo(() => {
    const tableOrders = state.orders.filter((o) => o.status !== 'closed' && o.service === 'mesa');
    return new Set(tableOrders.map((o) => o.location)).size;
  }, [state.orders]);

  // Real 7-day daily sales history (zero fake baselines)
  const dailySalesData = useMemo(() => buildSalesTrend(state.sales, 7), [state.sales]);

  // Real hourly sales data (zero mock curves)
  const hourlySalesData = useMemo(() => {
    const hours = Array.from({ length: 14 }, (_, idx) => `${String((idx + 10) % 24).padStart(2, '0')}:00`);
    const hourMap: Record<string, number> = {};
    hours.forEach((h) => {
      hourMap[h] = 0;
    });

    filteredSales.forEach((s) => {
      const hour = new Date(s.paidAt).getHours();
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      if (hourMap[hourStr] !== undefined) {
        hourMap[hourStr] += s.totalCents / 100;
      }
    });

    return hours.map((h) => ({
      hora: h,
      ventas: Math.round(hourMap[h] * 100) / 100,
    }));
  }, [filteredSales]);

  // Real Top Selling Products & Category Sales (O(N), modifier & discount aware)
  const { topProducts: topProductsData, categorySales: categorySalesData } = useMemo(
    () => buildSalesPerformanceMetrics(filteredSales, state.products, productMetric),
    [filteredSales, state.products, productMetric]
  );

  // Real Payment Methods Breakdown (zero mock percentages)
  const paymentBreakdownData = useMemo(() => {
    let cash = 0;
    let card = 0;
    let transfer = 0;
    let mixed = 0;

    filteredSales.forEach((s) => {
      if (s.paymentMethod === 'efectivo') cash += s.totalCents;
      else if (s.paymentMethod === 'tarjeta') card += s.totalCents;
      else if (s.paymentMethod === 'transferencia') transfer += s.totalCents;
      else if (s.paymentMethod === 'mixto') mixed += s.totalCents;
    });

    const total = cash + card + transfer + mixed;
    if (total === 0) return [];

    return [
      { name: 'Efectivo', value: Math.round((cash / total) * 100), amountCents: cash, key: 'efectivo' },
      { name: 'Tarjeta', value: Math.round((card / total) * 100), amountCents: card, key: 'tarjeta' },
      { name: 'Transferencia', value: Math.round((transfer / total) * 100), amountCents: transfer, key: 'transferencia' },
      { name: 'Mixto', value: Math.round((mixed / total) * 100), amountCents: mixed, key: 'mixto' },
    ].filter((d) => d.amountCents > 0);
  }, [filteredSales]);

  const topCategory = categorySalesData[0];

  return (
    <div className="space-y-6 text-left">
      {/* Header & iOS Segmented Range Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[#161618]/80 backdrop-blur-xl rounded-[22px] border border-white/10 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#c8a84b]/15 border border-[#c8a84b]/30 flex items-center justify-center text-[#e8d090] shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-xl text-white tracking-tight">
              Panel de Desempeño en Tiempo Real
            </h2>
            <p className="text-xs text-[rgba(240,230,211,0.68)] mt-0.5">
              Métricas operativas calculadas exclusivamente con tickets y comandas reales en Firestore.
            </p>
          </div>
        </div>

        {/* iOS Segmented Control */}
        <div className="inline-flex p-1 rounded-2xl bg-[#0a0a0b]/80 border border-white/10">
          {(['hoy', 'semana', 'mes'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                timeRange === r
                  ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold shadow-sm'
                  : 'text-[rgba(240,230,211,0.68)] hover:text-white'
              }`}
            >
              {r === 'hoy' ? 'Hoy' : r === 'semana' ? '7 Días' : '30 Días'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Performance Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="text-xs uppercase tracking-wider text-[rgba(240,230,211,0.6)] font-semibold mb-1.5">
            Ventas ({timeRange === 'hoy' ? 'Hoy' : timeRange === 'semana' ? '7 días' : '30 días'})
          </div>
          <div className="text-2xl lg:text-3xl font-semibold text-[#e8d090] tabular-nums">
            {formatMoney(totalRevenueCents)}
          </div>
          <div className="text-xs text-[rgba(240,230,211,0.68)] mt-1.5 tabular-nums">
            {filteredSales.length} {filteredSales.length === 1 ? 'ticket cobrado' : 'tickets cobrados'}
          </div>
        </div>

        <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="text-xs uppercase tracking-wider text-[rgba(240,230,211,0.6)] font-semibold mb-1.5">
            Ticket Promedio
          </div>
          <div className="text-2xl lg:text-3xl font-semibold text-white tabular-nums">
            {formatMoney(averageTicketCents)}
          </div>
          <div className="text-xs text-[rgba(240,230,211,0.68)] mt-1.5">
            Promedio por cuenta cerrada
          </div>
        </div>

        <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="text-xs uppercase tracking-wider text-[rgba(240,230,211,0.6)] font-semibold mb-1.5">
            Productos Vendidos
          </div>
          <div className="text-2xl lg:text-3xl font-semibold text-[#e8d090] tabular-nums">
            {totalUnitsSold}
          </div>
          <div className="text-xs text-[rgba(240,230,211,0.68)] mt-1.5">
            Unidades cobradas en periodo
          </div>
        </div>

        <div className="p-5 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="text-xs uppercase tracking-wider text-[rgba(240,230,211,0.6)] font-semibold mb-1.5">
            Ocupación de Salón
          </div>
          <div className="text-2xl lg:text-3xl font-semibold text-[#25d366] tabular-nums">
            {activeTablesCount} / 8{' '}
            <span className="text-xs text-[rgba(240,230,211,0.68)] font-normal">mesas</span>
          </div>
          <div className="text-xs text-[rgba(240,230,211,0.68)] mt-1.5 tabular-nums">
            {Math.round((activeTablesCount / 8) * 100)}% de ocupación actual
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              {salesChartType === 'daily' ? (
                <TrendingUp className="w-4 h-4 text-[#c8a84b]" />
              ) : (
                <Clock className="w-4 h-4 text-[#c8a84b]" />
              )}
              <div>
                <h3 className="font-serif font-bold text-lg text-white">
                  {salesChartType === 'daily'
                    ? 'Tendencia de Ventas Diarias ($ MXN)'
                    : 'Distribución por Hora ($ MXN)'}
                </h3>
                <p className="text-xs text-[rgba(240,230,211,0.68)]">
                  {salesChartType === 'daily'
                    ? 'Historial real de últimos 7 días'
                    : 'Comportamiento real por hora en el rango elegido'}
                </p>
              </div>
            </div>

            <div className="inline-flex p-1 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSalesChartType('daily')}
                className={`min-h-[36px] px-3 rounded-xl font-semibold transition-all ${
                  salesChartType === 'daily'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Diario
              </button>
              <button
                type="button"
                onClick={() => setSalesChartType('hourly')}
                className={`min-h-[36px] px-3 rounded-xl font-semibold transition-all ${
                  salesChartType === 'hourly'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Por Hora
              </button>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            {state.sales.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/10">
                <p className="text-sm font-semibold text-white">Sin ventas registradas aún en este periodo</p>
                <p className="text-xs text-[rgba(240,230,211,0.6)] mt-1 max-w-sm">
                  Las gráficas reflejarán automáticamente tus ingresos en cuanto se cobre la primera comanda en Caja.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {salesChartType === 'daily' ? (
                  <AreaChart data={dailySalesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c8a84b" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#c8a84b" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10, color: 'rgba(240,230,211,0.7)' }} />
                    <Area
                      type="monotone"
                      dataKey="ventas"
                      name="Ventas ($ MXN)"
                      stroke="#c8a84b"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#goldGradient)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={hourlySalesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                    <XAxis
                      dataKey="hora"
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="ventas" name="Ventas en la Hora ($)" fill="#c8a84b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Method Distribution */}
        <div className="lg:col-span-4 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-xl space-y-4">
          <div className="pb-3 border-b border-white/10 flex items-center gap-2.5">
            <CreditCard className="w-4 h-4 text-[#c8a84b]" />
            <div>
              <h3 className="font-serif font-bold text-lg text-white">Métodos de Pago</h3>
              <p className="text-xs text-[rgba(240,230,211,0.68)]">Participación porcentual real</p>
            </div>
          </div>

          {paymentBreakdownData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-center px-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-xs text-[rgba(240,230,211,0.6)]">
              Sin cobros registrados en este periodo.
            </div>
          ) : (
            <>
              <div className="h-52 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {paymentBreakdownData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PAYMENT_COLORS[entry.key] || '#c8a84b'}
                          stroke="#0a0a0b"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown, name: unknown, props: { payload?: { amountCents?: number } }) => [
                        `${String(value)}% (${formatMoney(props.payload?.amountCents || 0)})`,
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10 text-xs">
                {paymentBreakdownData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PAYMENT_COLORS[d.key] || '#c8a84b' }}
                      />
                      <span className="text-white font-semibold">{d.name}</span>
                    </div>
                    <div className="tabular-nums text-[rgba(240,230,211,0.72)]">
                      <b className="text-white">{d.value}%</b> · {formatMoney(d.amountCents)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Second Charts Row: Top Selling Products & Sales by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <UtensilsCrossed className="w-4 h-4 text-[#c8a84b]" />
              <div>
                <h3 className="font-serif font-bold text-lg text-white">Productos Más Vendidos</h3>
                <p className="text-xs text-[rgba(240,230,211,0.68)]">Ranking real por ventas cobradas</p>
              </div>
            </div>

            <div className="inline-flex p-1 rounded-2xl bg-[#0a0a0b]/80 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setProductMetric('revenue')}
                className={`min-h-[36px] px-3 rounded-xl font-semibold transition-all ${
                  productMetric === 'revenue'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Ingreso ($)
              </button>
              <button
                type="button"
                onClick={() => setProductMetric('units')}
                className={`min-h-[36px] px-3 rounded-xl font-semibold transition-all ${
                  productMetric === 'units'
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'text-[rgba(240,230,211,0.68)] hover:text-white'
                }`}
              >
                Unidades
              </button>
            </div>
          </div>

          {topProductsData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-center px-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-xs text-[rgba(240,230,211,0.6)]">
              Sin platillos vendidos aún en este periodo.
            </div>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={topProductsData}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                    <XAxis
                      type="number"
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                      tickFormatter={(val) => (productMetric === 'revenue' ? `$${val}` : `${val}`)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: '#f0e6d3', fontSize: 11, fontWeight: 500 }}
                      width={110}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey={productMetric === 'revenue' ? 'ingresos' : 'unidades'}
                      name={productMetric === 'revenue' ? 'Ingresos ($ MXN)' : 'Unidades Vendidas'}
                      fill="#c8a84b"
                      radius={[0, 6, 6, 0]}
                    >
                      {topProductsData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 0 ? '#e8d090' : index === 1 ? '#c8a84b' : '#a27b1e'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-white/10 rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden text-xs">
                {topProductsData.slice(0, 5).map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold text-[#e8d090] tabular-nums w-5">#{idx + 1}</span>
                      <div className="truncate">
                        <span className="font-semibold text-white">{p.fullName}</span>
                        <span className="text-xs text-[rgba(240,230,211,0.6)] ml-2 uppercase">
                          {p.categoria}
                        </span>
                      </div>
                    </div>
                    <div className="text-right tabular-nums shrink-0 pl-2">
                      <b className="text-[#e8d090]">${p.ingresos.toLocaleString('es-MX')}</b>
                      <span className="text-xs text-[rgba(240,230,211,0.6)] ml-2">({p.unidades})</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sales by Category */}
        <div className="lg:col-span-5 p-6 rounded-[22px] bg-[#161618]/80 backdrop-blur-xl border border-white/10 shadow-xl space-y-4">
          <div className="pb-3 border-b border-white/10">
            <h3 className="font-serif font-bold text-lg text-white">Ventas por Categoría</h3>
            <p className="text-xs text-[rgba(240,230,211,0.68)]">Familias del catálogo con mayor recaudación</p>
          </div>

          {categorySalesData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-center px-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-xs text-[rgba(240,230,211,0.6)]">
              Sin ventas por categoría registradas aún.
            </div>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categorySalesData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,230,211,0.06)" />
                    <XAxis
                      dataKey="categoria"
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="rgba(240,230,211,0.5)"
                      tick={{ fill: 'rgba(240,230,211,0.7)', fontSize: 11 }}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="ventas"
                      name="Ventas Totales ($)"
                      fill="#173c34"
                      stroke="#c8a84b"
                      strokeWidth={1.5}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {topCategory && (
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-xs space-y-1">
                  <div className="font-semibold text-[#e8d090]">Categoría líder del periodo</div>
                  <p className="text-[rgba(240,230,211,0.72)] text-xs leading-relaxed tabular-nums">
                    <b className="text-white">{topCategory.categoria}</b> lidera con{' '}
                    <b className="text-[#e8d090]">${topCategory.ventas.toLocaleString('es-MX')} MXN</b> recaudados.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
