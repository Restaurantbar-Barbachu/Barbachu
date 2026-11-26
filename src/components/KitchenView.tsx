import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { locationLabel, nextItemStatus } from '../core';
import { formatMoney } from '../storage';
import type { ItemStatus, Order, OrderStatus } from '../types';

interface KitchenViewProps {
  openOrders: Order[];
  kitchenStation: 'todas' | 'cocina' | 'barra';
  onChangeKitchenStation: (station: 'todas' | 'cocina' | 'barra') => void;
  onAdvanceItemStatus: (orderId: string, itemTargetId: string, targetStatus: ItemStatus) => void;
  onAdvanceOrderStatus: (orderId: string, currentStatus: OrderStatus) => void;
  onGoToCash: (orderId: string) => void;
}

export const KitchenView: React.FC<KitchenViewProps> = React.memo(
  ({
    openOrders,
    kitchenStation,
    onChangeKitchenStation,
    onAdvanceItemStatus,
    onAdvanceOrderStatus,
    onGoToCash,
  }) => {
    const sentOrders = useMemo(
      () => openOrders.filter((o) => o.status === 'sent'),
      [openOrders]
    );
    const preparingOrders = useMemo(
      () => openOrders.filter((o) => o.status === 'preparing'),
      [openOrders]
    );
    const readyOrServedOrders = useMemo(
      () => openOrders.filter((o) => o.status === 'ready' || o.status === 'served'),
      [openOrders]
    );

    return (
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
                onClick={() => onChangeKitchenStation(st)}
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
              <span className="font-bold text-sm text-[#e5a43b] tracking-tight">RECIBIDAS</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                {sentOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {sentOrders.length === 0 ? (
                <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en espera</div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {sentOrders.map((order, orderIdx) => (
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
                            <span className="text-xs text-[#eed889]">
                              · {locationLabel(order.service, order.location)}
                            </span>
                          </div>
                          <div className="text-xs text-[#8b92a0]">
                            {order.waiter} ·{' '}
                            {new Date(order.createdAt).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        {order.priority === 'alta' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-[#e05252] text-white font-bold">
                            ALTA
                          </span>
                        )}
                      </div>

                      <div className="my-3 py-2 border-y border-[#2b303c] space-y-2 text-xs">
                        {order.items
                          .filter((i) => kitchenStation === 'todas' || (i.station || 'cocina') === kitchenStation)
                          .map((i, idx) => {
                            const st = i.itemStatus || 'pending';
                            const nxt = nextItemStatus(st);
                            const mods = i.modifiers || i.modificadores || [];
                            return (
                              <motion.div
                                key={i.lineId || `${i.key}-${idx}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 440,
                                  damping: 32,
                                  delay: Math.min(idx * 0.02, 0.1),
                                }}
                                className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#16191f]/70"
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate">
                                    {i.qty} × {i.name}
                                  </div>
                                  <div className="text-xs text-[#8b92a0] uppercase">
                                    {i.station || 'cocina'} · {st}
                                  </div>
                                  {mods.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {mods.map((mod, mi) => (
                                        <span
                                          key={mi}
                                          className="px-1.5 py-0.5 rounded bg-[#c8a84b]/15 text-[#eed889] text-[10px] font-semibold"
                                        >
                                          {mod.name}
                                          {mod.priceCents > 0 ? ` (+${formatMoney(mod.priceCents)})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {i.note && (
                                    <span className="text-xs text-[#eed889] block">Nota: {i.note}</span>
                                  )}
                                </div>
                                {nxt && (
                                  <button
                                    type="button"
                                    onClick={() => onAdvanceItemStatus(order.id, i.lineId || i.key, nxt)}
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
                        onClick={() => onAdvanceOrderStatus(order.id, 'sent')}
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
              <span className="font-bold text-sm text-[#3b82f6] tracking-tight">EN PREPARACIÓN</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                {preparingOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {preparingOrders.length === 0 ? (
                <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes en cocción</div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {preparingOrders.map((order, orderIdx) => (
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
                            <span className="text-xs text-[#eed889]">
                              · {locationLabel(order.service, order.location)}
                            </span>
                          </div>
                          <div className="text-xs text-[#8b92a0]">
                            {order.waiter} ·{' '}
                            {new Date(order.createdAt).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="my-3 py-2 border-y border-[#2b303c] space-y-2 text-xs">
                        {order.items
                          .filter((i) => kitchenStation === 'todas' || (i.station || 'cocina') === kitchenStation)
                          .map((i, idx) => {
                            const st = i.itemStatus || 'pending';
                            const nxt = nextItemStatus(st);
                            const mods = i.modifiers || i.modificadores || [];
                            return (
                              <motion.div
                                key={i.lineId || `${i.key}-${idx}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 440,
                                  damping: 32,
                                  delay: Math.min(idx * 0.02, 0.1),
                                }}
                                className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#16191f]/70"
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate">
                                    {i.qty} × {i.name}
                                  </div>
                                  <div className="text-xs text-[#8b92a0] uppercase">
                                    {i.station || 'cocina'} · {st}
                                  </div>
                                  {mods.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {mods.map((mod, mi) => (
                                        <span
                                          key={mi}
                                          className="px-1.5 py-0.5 rounded bg-[#c8a84b]/15 text-[#eed889] text-[10px] font-semibold"
                                        >
                                          {mod.name}
                                          {mod.priceCents > 0 ? ` (+${formatMoney(mod.priceCents)})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {i.note && (
                                    <span className="text-xs text-[#eed889] block">Nota: {i.note}</span>
                                  )}
                                </div>
                                {nxt && (
                                  <button
                                    type="button"
                                    onClick={() => onAdvanceItemStatus(order.id, i.lineId || i.key, nxt)}
                                    className="px-2 py-1 rounded bg-[#25d366]/20 hover:bg-[#25d366] hover:text-black text-[#25d366] font-bold text-xs shrink-0"
                                  >
                                    {nxt === 'ready'
                                      ? '✓ Listo'
                                      : nxt === 'served'
                                      ? '🍽️ Servido'
                                      : '▶ Preparar'}
                                  </button>
                                )}
                              </motion.div>
                            );
                          })}
                      </div>

                      <button
                        type="button"
                        onClick={() => onAdvanceOrderStatus(order.id, 'preparing')}
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
              <span className="font-bold text-sm text-[#25d366] tracking-tight">LISTA PARA ENTREGAR</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white tabular-nums">
                {readyOrServedOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {readyOrServedOrders.length === 0 ? (
                <div className="py-16 text-center text-[#8b92a0] text-xs">Sin órdenes por servir</div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {readyOrServedOrders.map((order, orderIdx) => (
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
                            <span className="text-xs text-[#eed889]">
                              · {locationLabel(order.service, order.location)}
                            </span>
                          </div>
                          <div className="text-xs text-[#8b92a0]">
                            Mesero: {order.waiter} · Estado:{' '}
                            <span className="text-[#25d366] font-bold uppercase">{order.status}</span>
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
                                transition={{
                                  type: 'spring',
                                  stiffness: 440,
                                  damping: 32,
                                  delay: Math.min(idx * 0.02, 0.1),
                                }}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="font-medium text-white truncate">
                                  {i.qty} × {i.name}{' '}
                                  <span className="text-xs text-[#8b92a0]">({st})</span>
                                </span>
                                {nxt === 'served' && (
                                  <button
                                    type="button"
                                    onClick={() => onAdvanceItemStatus(order.id, i.lineId || i.key, 'served')}
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
                          onClick={() => onAdvanceOrderStatus(order.id, 'ready')}
                          className="w-full py-2 rounded-xl bg-[#1e222b] hover:bg-[#2b303c] border border-[#2b303c] text-white font-bold text-xs"
                        >
                          🤝 Marcar Todo Entregado en Mesa
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onGoToCash(order.id)}
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
    );
  }
);

KitchenView.displayName = 'KitchenView';
