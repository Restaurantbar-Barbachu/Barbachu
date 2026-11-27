import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RESTAURANT_MENU_SECTIONS } from '../data/restaurantMenu';
import { SOFT_PRODUCTS } from '../data/softRestaurantCatalog';
import { MenuItemData, MenuSectionData, SoftProduct } from '../types';
import { BarbachuLogo } from './BarbachuLogo';
import { subscribePublicMenuProducts } from '../lib/firestoreSync';
import { PWAInstallButton } from './PwaControls';

interface MenuViewProps {
  onSwitchToPos?: () => void;
}

const BASE_CHIPS = [
  { id: 'espec', label: 'Especialidades' },
  { id: 'sec-platillos', label: 'Platillos' },
  { id: 'sec-hambur', label: 'Hamburguesas' },
  { id: 'sec-extras', label: 'Extras' },
  { id: 'sec-botana', label: 'Botana' },
  { id: 'sec-cecina', label: 'Cecina' },
  { id: 'sec-mich', label: 'Micheladas' },
  { id: 'sec-cerveza', label: 'Cerveza' },
  { id: 'sec-na', label: 'Sin alcohol' },
];

const DEFAULT_PRODUCT_KEYS = new Set(SOFT_PRODUCTS.map((p) => p.key));

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const KNOWN_CATALOG_NORMS = new Set(SOFT_PRODUCTS.map((p) => normalizeLabel(p.name)));

function formatMenuPrice(priceCents: number): string {
  const pesos = priceCents / 100;
  return Number.isInteger(pesos) ? `$${pesos}` : `$${pesos.toFixed(2)}`;
}

export const MenuView: React.FC<MenuViewProps> = ({ onSwitchToPos }) => {
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [activeChip, setActiveChip] = useState<string>('espec');
  const [isBarStuck, setIsBarStuck] = useState<boolean>(false);
  const [liveProducts, setLiveProducts] = useState<SoftProduct[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribePublicMenuProducts((products) => {
      setLiveProducts(products);
    });
    return unsub;
  }, []);

  const menuSections = useMemo(() => {
    if (liveProducts.length === 0) {
      return RESTAURANT_MENU_SECTIONS;
    }

    const byNormName = new Map<string, SoftProduct>();
    for (const prod of liveProducts) {
      byNormName.set(normalizeLabel(prod.name), prod);
    }

    const mapItem = (item: MenuItemData): MenuItemData | null => {
      const candidates = [
        normalizeLabel(item.name),
        normalizeLabel(`${item.group} ${item.name}`),
      ];
      for (const candidate of candidates) {
        const match = byNormName.get(candidate);
        if (match) {
          return {
            ...item,
            price: match.priceCents > 0 ? formatMenuPrice(match.priceCents) : item.price,
            priceCents: match.priceCents > 0 ? match.priceCents : item.priceCents,
          };
        }
      }
      if (candidates.some((candidate) => KNOWN_CATALOG_NORMS.has(candidate))) {
        return null;
      }
      return item;
    };

    const updatedSections: MenuSectionData[] = RESTAURANT_MENU_SECTIONS.map((sec) => {
      const items = sec.items.map(mapItem).filter((x): x is MenuItemData => x !== null);
      const subcategories = sec.subcategories
        ?.map((sub) => ({
          ...sub,
          items: sub.items.map(mapItem).filter((x): x is MenuItemData => x !== null),
        }))
        .filter((sub) => sub.items.length > 0);
      return {
        ...sec,
        items,
        subcategories,
      };
    }).filter((sec) => sec.items.length > 0 || (sec.subcategories?.length ?? 0) > 0);

    const customProducts = liveProducts.filter(
      (p) => p.saleEnabled && p.category !== 'MODIFICADORES' && !DEFAULT_PRODUCT_KEYS.has(p.key)
    );

    if (customProducts.length > 0) {
      updatedSections.push({
        id: 'sec-nuevos',
        title: 'Nuevos en Carta',
        part: 'Especiales del Día',
        items: customProducts.map((p) => ({
          id: `live-${p.key}`,
          name: p.name,
          price: formatMenuPrice(p.priceCents),
          priceCents: p.priceCents,
          group: p.category || 'Especiales',
          sub: p.category,
        })),
      });
    }

    return updatedSections;
  }, [liveProducts]);

  const chips = useMemo(() => {
    const visible = BASE_CHIPS.filter((c) => menuSections.some((sec) => sec.id === c.id));
    if (menuSections.some((sec) => sec.id === 'sec-nuevos')) {
      visible.push({ id: 'sec-nuevos', label: 'Nuevos' });
    }
    return visible.length > 0 ? visible : BASE_CHIPS;
  }, [menuSections]);

  // Update active section chip on scroll & detect sticky bar
  useEffect(() => {
    const handleScroll = () => {
      setIsBarStuck(window.scrollY > 180);

      let currentId = chips[0]?.id || 'espec';
      for (const chip of chips) {
        const el = document.getElementById(chip.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 165) {
            currentId = chip.id;
          }
        }
      }
      setActiveChip(currentId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chips]);

  const handleScrollToSection = (id: string) => {
    setActiveChip(id);
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -124;
      const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const getWhatsAppUrl = (item?: MenuItemData) => {
    const msg = item
      ? `Hola, quiero pedir: ${item.name} (${item.price})`
      : 'Hola, quiero hacer un pedido';
    const staticWa = String(import.meta.env.VITE_WA_NUMBER || '').replace(/\D/g, '');
    if (staticWa.length >= 10) {
      return `https://wa.me/${staticWa}?text=${encodeURIComponent(msg)}`;
    }
    return `/api/pedir?t=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0b] text-[#f0e6d3] selection:bg-[#c8a84b] selection:text-[#0a0a0b] pb-24">
      {/* Top Banner & Quick Switcher */}
      <header className="min-h-[58px] bg-[#161618]/85 backdrop-blur-2xl backdrop-saturate-[180%] border-b border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs sticky top-0 z-40">
        <span className="text-[#e8d090] font-semibold tracking-wide flex items-center gap-2 min-w-0 flex-1">
          <BarbachuLogo className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Barbachu <span className="hidden md:inline">· Restaurante Bar</span>
          </span>
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton compact />
          {onSwitchToPos && (
            <button
              type="button"
              onClick={onSwitchToPos}
              aria-label="Acceso Personal (POS)"
              className="min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-[#e8d090] border border-white/15 font-semibold transition-all active:scale-95 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span className="sm:hidden">POS</span>
              <span className="hidden sm:inline">Acceso Personal (POS)</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[600px] mx-auto px-4 pb-10" id="main">
        {/* Hero Section */}
        <header className="hero text-center pt-8 pb-6">
          <div className="flex justify-center mb-4">
            <BarbachuLogo className="w-24 sm:w-28 h-auto drop-shadow-[0_0_24px_rgba(240,230,211,0.18)]" />
          </div>
          <h1 className="font-serif font-bold text-4xl sm:text-5xl uppercase tracking-tight text-[#f0e6d3]">
            Barbachu
          </h1>
          <p className="tag text-[#c8a84b] font-semibold text-xs tracking-widest uppercase mt-2">
            Restaurante Bar
          </p>
          <address className="addr not-italic text-sm text-[rgba(240,230,211,0.72)] mt-1.5">
            Poza Rica #4984, San Pedrito
          </address>
        </header>

        <div ref={sentinelRef} id="sentinel" aria-hidden="true"></div>

        {/* Sticky Nav Bar */}
        <nav
          className={`bar sticky top-[58px] z-30 flex gap-2 overflow-x-auto no-scrollbar transition-all duration-200 -mx-4 px-4 ${
            isBarStuck
              ? 'stuck py-2.5 bg-[#161618]/85 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_8px_24px_rgba(0,0,0,0.4)] border-b border-white/[0.08]'
              : 'py-2'
          }`}
          aria-label="Secciones del menú"
        >
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-current={activeChip === chip.id ? 'true' : undefined}
              onClick={() => handleScrollToSection(chip.id)}
              className={`chip flex-none min-h-[40px] px-4 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 active:scale-95 border whitespace-nowrap ${
                activeChip === chip.id
                  ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b] font-bold shadow-md'
                  : 'bg-[#161618]/90 text-[rgba(240,230,211,0.72)] border-white/10 hover:border-[#c8a84b]/60 hover:text-[#f0e6d3]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </nav>

        {/* Sections */}
        <div className="space-y-12 mt-6">
          {menuSections.map((sec) => (
            <section key={sec.id} id={sec.id} className="sec">
              {sec.part && (
                <p className="part font-serif font-bold text-2xl sm:text-3xl text-[#c8a84b] mb-3 tracking-tight">
                  {sec.part}
                </p>
              )}

              {sec.id !== 'espec' && (
                <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#f0e6d3] mb-1">
                  {sec.title}
                </h2>
              )}

              {sec.note && (
                <p className="text-xs text-[rgba(240,230,211,0.72)] mb-3">{sec.note}</p>
              )}

              {/* Especialidades Horizontal Strip */}
              {sec.id === 'espec' && (
                <div className="strip flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 -mx-4 px-4">
                  {sec.items.map((item, itemIdx) => (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      initial={{ opacity: 0, y: 14, scale: 0.97 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ once: true, amount: 0.15 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                        delay: Math.min(itemIdx * 0.04, 0.2),
                      }}
                      className="card flex-none w-[224px] min-h-[168px] snap-start text-left p-4 rounded-[22px] bg-gradient-to-br from-[#c8a84b]/15 via-[#161618]/90 to-[#121215] border border-white/15 hover:border-[#c8a84b]/70 transition-colors duration-150 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] group"
                    >
                      <span className="c-ico text-2xl block mb-2">{item.icon}</span>
                      <strong className="c-name block font-serif font-bold text-base text-[#f0e6d3] group-hover:text-[#c8a84b] transition-colors tracking-[-0.01em]">
                        {item.name}
                      </strong>
                      <span className="c-price block font-semibold text-sm text-[#e8d090] mt-1 tabular-nums">
                        {item.price}
                      </span>
                      {item.desc && (
                        <span className="c-desc block text-xs text-[rgba(240,230,211,0.72)] mt-1.5 leading-snug">
                          {item.desc}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Standard Vertical List Items */}
              {sec.items.length > 0 && sec.id !== 'espec' && (
                <div className="list mt-3 bg-[#161618]/85 backdrop-blur-xl border border-white/10 rounded-[22px] divide-y divide-white/[0.07] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  {sec.items.map((item, itemIdx) => (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{
                        type: 'spring',
                        stiffness: 440,
                        damping: 34,
                        delay: Math.min(itemIdx * 0.02, 0.12),
                      }}
                      className="row w-full min-h-[56px] flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
                    >
                      <div className="pr-4">
                        <span className="r-name block font-medium text-[15px] text-[#f0e6d3] leading-snug">
                          {item.name}
                        </span>
                        {item.sub && (
                          <span className="r-sub block text-xs text-[rgba(240,230,211,0.7)] mt-0.5">
                            {item.sub}
                          </span>
                        )}
                      </div>
                      <span className="r-price flex-none font-bold text-sm text-[#e8d090] tabular-nums">
                        {item.price}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Subcategories (Botana, Cervezas, Sin alcohol) */}
              {sec.subcategories && (
                <div className="space-y-6 mt-3">
                  {sec.subcategories.map((sub, idx) => (
                    <div key={idx}>
                      <p className="cap text-xs uppercase tracking-[0.06em] font-bold text-[rgba(240,230,211,0.72)] mb-1.5 px-1">
                        {sub.caption}
                      </p>
                      {sub.description && (
                        <p className="desc text-xs text-[rgba(240,230,211,0.7)] mb-2 px-1">
                          {sub.description}
                        </p>
                      )}
                      <div className="list bg-[#161618]/85 backdrop-blur-xl border border-white/10 rounded-[22px] divide-y divide-white/[0.07] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        {sub.items.map((item, subItemIdx) => (
                          <motion.button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.1 }}
                            whileTap={{ scale: 0.99 }}
                            transition={{
                              type: 'spring',
                              stiffness: 440,
                              damping: 34,
                              delay: Math.min(subItemIdx * 0.02, 0.12),
                            }}
                            className="row w-full min-h-[56px] flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
                          >
                            <div className="pr-4">
                              <span className="r-name block font-medium text-[15px] text-[#f0e6d3] leading-snug">
                                {item.name}
                              </span>
                              {item.sub && (
                                <span className="r-sub block text-xs text-[rgba(240,230,211,0.7)] mt-0.5">
                                  {item.sub}
                                </span>
                              )}
                            </div>
                            <span className="r-price flex-none font-bold text-sm text-[#e8d090] tabular-nums">
                              {item.price}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Michelada Flavors Pill List */}
              {sec.id === 'sec-mich' && (
                <div className="mt-5">
                  <p className="cap text-xs uppercase tracking-wider font-bold text-[rgba(240,230,211,0.72)] mb-2 px-1">
                    Sabores disponibles
                  </p>
                  <div className="flav flex flex-wrap gap-2 p-3 bg-[#161618] border border-[rgba(240,230,211,0.1)] rounded-2xl">
                    {['Clamato', 'Mango', 'Durazno', 'Piña', 'Tamarindo'].map((flavor) => (
                      <span
                        key={flavor}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[rgba(200,168,75,0.12)] text-[#c8a84b] border border-[rgba(200,168,75,0.28)]"
                      >
                        {flavor}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[rgba(240,230,211,0.1)] text-center text-xs text-[rgba(240,230,211,0.72)]">
          <p className="font-medium text-[#f0e6d3]">Poza Rica #4984, San Pedrito</p>
          <div className="flex items-center justify-center gap-6 mt-3">
            <a
              href="https://www.instagram.com/barbachu__oficial/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c8a84b] hover:underline py-2"
            >
              Instagram
            </a>
            <a
              href="https://www.facebook.com/share/14xz4YsgiW6/?mibextid=wwXIfr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c8a84b] hover:underline py-2"
            >
              Facebook
            </a>
          </div>
          <p className="mt-4 text-[#8b8b94]">
            Barbachu © Restaurante Bar. Todos los derechos reservados.
          </p>
        </footer>
      </main>

      {/* Floating WhatsApp CTA */}
      <a
        href={getWhatsAppUrl()}
        target="_blank"
        rel="noopener noreferrer nofollow"
        aria-label="Pedir por WhatsApp"
        className="fab fixed right-4 bottom-[calc(18px+env(safe-area-inset-bottom,0px))] z-40 flex items-center gap-2 min-h-[48px] px-4 py-3 rounded-full bg-[#25d366] text-[#0a0a0b] font-bold text-xs shadow-[0_12px_28px_rgba(0,0,0,0.55)] hover:scale-[1.03] active:scale-95 transition-transform duration-150"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.82L2 22l5.4-1.42a9.9 9.9 0 0 0 4.64 1.18h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.07c-.24.68-1.4 1.3-1.93 1.37-.5.07-1.1.1-1.77-.11a16 16 0 0 1-1.6-.59c-2.8-1.21-4.63-4.04-4.77-4.23-.14-.18-1.14-1.52-1.14-2.9s.72-2.06.97-2.34c.25-.28.55-.35.73-.35h.53c.17 0 .4-.03.62.48.24.56.8 1.95.87 2.09.07.14.12.3.02.49-.1.18-.15.3-.3.46-.14.16-.3.36-.43.48-.14.14-.3.29-.13.57.17.28.76 1.25 1.63 2.03 1.12 1 2.06 1.3 2.34 1.45.28.14.44.12.6-.07.17-.19.72-.84.91-1.13.19-.28.38-.23.63-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
        </svg>
        <span>Pedir por WhatsApp</span>
      </a>

      {/* Apple Frosted-Glass Bottom Sheet / Modal */}
      {selectedItem &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] ios-scrim flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setSelectedItem(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full sm:max-w-md ios-glass-modal rounded-b-none sm:rounded-[28px] p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] sm:pb-6 text-left max-h-[90dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-[5px] rounded-full bg-white/25 mx-auto mb-5 sm:hidden" />
              {selectedItem.icon && (
                <span className="text-3xl block mb-2">{selectedItem.icon}</span>
              )}
              <h2 className="font-serif font-bold text-2xl text-[#f0e6d3] tracking-[-0.02em] text-balance">
                {selectedItem.name}
              </h2>
              <p className="font-semibold text-xl text-[#e8d090] mt-1 tabular-nums">
                {selectedItem.price}
              </p>
              <p className="text-xs text-[rgba(240,230,211,0.68)] uppercase tracking-[0.06em] font-semibold mt-2">
                {selectedItem.group}
              </p>
              {selectedItem.sub && (
                <p className="text-sm text-[#f0e6d3] mt-2 leading-relaxed">
                  {selectedItem.sub}
                </p>
              )}
              {selectedItem.desc && (
                <p className="text-sm text-[rgba(240,230,211,0.72)] mt-1 leading-relaxed">
                  {selectedItem.desc}
                </p>
              )}

              <a
                href={getWhatsAppUrl(selectedItem)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-6 w-full min-h-[52px] rounded-2xl bg-[#25d366] hover:bg-[#20b858] active:scale-[0.98] text-[#0a0a0b] font-bold text-sm flex items-center justify-center gap-2 transition-all duration-150 shadow-lg"
              >
                Pedir por WhatsApp
              </a>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="mt-2.5 w-full min-h-[46px] rounded-2xl text-sm font-semibold text-[rgba(240,230,211,0.75)] hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150"
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
