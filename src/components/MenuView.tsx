import React, { useState, useEffect, useRef } from 'react';
import { RESTAURANT_MENU_SECTIONS } from '../data/restaurantMenu';
import { MenuItemData } from '../types';
import { BarbachuLogo } from './BarbachuLogo';

interface MenuViewProps {
  onSwitchToPos?: () => void;
}

export const MenuView: React.FC<MenuViewProps> = ({ onSwitchToPos }) => {
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [activeSection, setActiveSection] = useState<string>('espec');
  const [isBarStuck, setIsBarStuck] = useState<boolean>(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const chips = [
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

  // Detect sticky bar state
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsBarStuck(scrollY > 120);

      const scrollPos = scrollY + 140;
      for (let i = chips.length - 1; i >= 0; i--) {
        const el = document.getElementById(chips[i].id);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(chips[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [chips]);

  const handleScrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const topOffset = 90;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  const getWhatsAppUrl = (item: MenuItemData) => {
    const msg = `Hola, quiero pedir: ${item.name} (${item.price})`;
    return `https://wa.me/523314456850?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#f0e6d3] selection:bg-[#c8a84b] selection:text-[#0a0a0b]">
      {/* Top Banner & Quick Switcher */}
      <div className="bg-[#141416]/90 backdrop-blur-md border-b border-[#2a2a2d] px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-40">
        <span className="text-[#c8a84b] font-medium tracking-wide flex items-center gap-2">
          <BarbachuLogo className="w-4 h-4" />
          <span>Barbachu · Restaurante Bar</span>
        </span>
        {onSwitchToPos && (
          <button
            type="button"
            onClick={onSwitchToPos}
            className="px-3 py-1.5 rounded-full bg-[#173c34] text-[#eed889] border border-[#c8a84b]/40 font-bold hover:bg-[#28584c] transition-all flex items-center gap-1.5 shadow"
          >
            <span>💼</span> Sistema POS / Administración
          </button>
        )}
      </div>

      <main className="max-w-[640px] mx-auto px-4 pb-28" id="main">
        {/* Hero Section */}
        <header className="hero text-center pt-8 pb-6">
          <div className="flex justify-center mb-4">
            <BarbachuLogo className="w-24 h-auto drop-shadow-[0_0_24px_rgba(240,230,211,0.18)]" />
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

        {/* Sticky frosted glass navigation bar */}
        <div className={`bar sticky top-[41px] z-30 transition-all ${isBarStuck ? 'stuck bg-[rgba(22,22,24,0.78)] backdrop-blur-xl shadow-lg border-b border-[rgba(240,230,211,0.1)]' : 'bg-transparent'}`}>
          <div className={`bar-title flex items-center gap-2.5 overflow-hidden transition-all duration-300 font-serif font-bold uppercase text-sm ${isBarStuck ? 'max-h-12 py-2 opacity-100' : 'max-h-0 py-0 opacity-0'}`}>
            <BarbachuLogo className="w-6 h-6 inline-block" />
            <span>Barbachu</span>
          </div>

          <nav className="chips flex gap-2 overflow-x-auto no-scrollbar py-2.5" aria-label="Secciones del menú">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleScrollToSection(chip.id)}
                className={`flex-none min-h-[40px] px-4 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap border ${
                  activeSection === chip.id
                    ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b] font-bold shadow-md'
                    : 'bg-[#161618] text-[rgba(240,230,211,0.72)] border-[rgba(200,168,75,0.28)] hover:border-[#c8a84b] hover:text-[#f0e6d3]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Menu Sections Content */}
        <div className="mt-8 space-y-12">
          {RESTAURANT_MENU_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 sec">
              {section.part && (
                <h2 className="part font-serif font-bold text-2xl sm:text-3xl text-[#c8a84b] mb-4 mt-8">
                  {section.part}
                </h2>
              )}

              {section.id !== 'espec' && (
                <div className="mb-3">
                  <h3 className="font-serif font-bold text-xl text-[#f0e6d3]">
                    {section.title}
                  </h3>
                  {section.note && (
                    <p className="text-xs text-[rgba(240,230,211,0.72)] mt-0.5">{section.note}</p>
                  )}
                </div>
              )}

              {/* Cards for Especialidades */}
              {section.id === 'espec' && (
                <div className="cards flex gap-3 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4 scroll-pl-4">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="card flex-none w-[220px] text-left p-4 rounded-2xl bg-gradient-to-br from-[#c8a84b]/15 via-[#161618] to-[#121215] border border-[rgba(200,168,75,0.28)] hover:border-[#c8a84b] transition-all transform active:scale-95 shadow-lg group"
                    >
                      <span className="c-ico text-2xl block mb-2">{item.icon}</span>
                      <strong className="c-name block font-serif font-bold text-base text-[#f0e6d3] group-hover:text-[#c8a84b] transition-colors">
                        {item.name}
                      </strong>
                      <span className="c-price text-sm font-bold text-[#e8d090] block mt-1 font-mono">
                        {item.price} {item.sub && `· ${item.sub}`}
                      </span>
                      {item.desc && (
                        <p className="c-desc text-xs text-[rgba(240,230,211,0.72)] mt-2 line-clamp-2">
                          {item.desc}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Standard List Items */}
              {section.items.length > 0 && section.id !== 'espec' && (
                <div className="list bg-[#161618] border border-[rgba(240,230,211,0.1)] rounded-2xl divide-y divide-[rgba(240,230,211,0.08)] overflow-hidden shadow-sm">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="row w-full flex items-center justify-between p-4 text-left hover:bg-[#1f1f22] active:bg-[#25252a] transition-colors"
                    >
                      <div className="pr-4">
                        <span className="r-name block font-medium text-sm text-[#f0e6d3]">
                          {item.name}
                        </span>
                        {item.sub && (
                          <span className="r-sub block text-xs text-[rgba(240,230,211,0.72)] mt-0.5">
                            {item.sub}
                          </span>
                        )}
                        {item.desc && (
                          <span className="r-sub block text-xs text-[rgba(240,230,211,0.72)] mt-0.5">
                            {item.desc}
                          </span>
                        )}
                      </div>
                      <span className="r-price flex-none font-bold text-sm text-[#e8d090] font-mono">
                        {item.price}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Subcategories (like Alas, Botana Barbachu, Cubetas, Sabores) */}
              {section.subcategories && section.subcategories.length > 0 && (
                <div className="space-y-5 mt-4">
                  {section.subcategories.map((sub, idx) => (
                    <div key={idx}>
                      <p className="cap text-xs uppercase tracking-wider font-bold text-[rgba(240,230,211,0.72)] mb-1.5 px-1">
                        {sub.caption}
                      </p>
                      {sub.description && (
                        <p className="desc text-xs text-[rgba(240,230,211,0.72)] mb-2 px-1">
                          {sub.description}
                        </p>
                      )}
                      <div className="list bg-[#161618] border border-[rgba(240,230,211,0.1)] rounded-2xl divide-y divide-[rgba(240,230,211,0.08)] overflow-hidden">
                        {sub.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="row w-full flex items-center justify-between p-4 text-left hover:bg-[#1f1f22] active:bg-[#25252a] transition-colors"
                          >
                            <div className="pr-4">
                              <span className="r-name block font-medium text-sm text-[#f0e6d3]">
                                {item.name}
                              </span>
                              {item.sub && (
                                <span className="r-sub block text-xs text-[rgba(240,230,211,0.72)] mt-0.5">
                                  {item.sub}
                                </span>
                              )}
                            </div>
                            <span className="r-price flex-none font-bold text-sm text-[#e8d090] font-mono">
                              {item.price}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Michelada Flavors Pill List */}
              {section.id === 'sec-mich' && (
                <div className="mt-4">
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

      {/* WhatsApp Floating Action Button */}
      <a
        href="https://wa.me/523314456850?text=Hola%2C%20quiero%20hacer%20un%20pedido"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Pedir por WhatsApp"
        className="fab fixed right-4 bottom-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-[#25d366] text-[#0a0a0b] font-bold text-xs shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-transform"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.82L2 22l5.4-1.42a9.9 9.9 0 0 0 4.64 1.18h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.07c-.24.68-1.4 1.3-1.93 1.37-.5.07-1.1.1-1.77-.11a16 16 0 0 1-1.6-.59c-2.8-1.21-4.63-4.04-4.77-4.23-.14-.18-1.14-1.52-1.14-2.9s.72-2.06.97-2.34c.25-.28.55-.35.73-.35h.53c.17 0 .4-.03.62.48.24.56.8 1.95.87 2.09.07.14.12.3.02.49-.1.18-.15.3-.3.46-.14.16-.3.36-.43.48-.14.14-.3.29-.13.57.17.28.76 1.25 1.63 2.03 1.12 1 2.06 1.3 2.34 1.45.28.14.44.12.6-.07.17-.19.72-.84.91-1.13.19-.28.38-.23.63-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
        </svg>
        <span>WhatsApp</span>
      </a>

      {/* Item Detail Modal / Sheet */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full sm:max-w-md bg-[#161618] border-t sm:border border-[rgba(240,230,211,0.14)] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.2)] mx-auto mb-4 sm:hidden"></div>
            {selectedItem.icon && (
              <span className="text-3xl block mb-2">{selectedItem.icon}</span>
            )}
            <h2 className="font-serif font-bold text-2xl text-[#f0e6d3]">
              {selectedItem.name}
            </h2>
            <p className="font-mono font-bold text-xl text-[#e8d090] mt-1">
              {selectedItem.price}
            </p>
            <p className="text-xs text-[rgba(240,230,211,0.72)] uppercase tracking-wider font-semibold mt-2">
              {selectedItem.group}
            </p>
            {selectedItem.sub && (
              <p className="text-sm text-[#f0e6d3] mt-2">
                {selectedItem.sub}
              </p>
            )}
            {selectedItem.desc && (
              <p className="text-sm text-[rgba(240,230,211,0.72)] mt-1">
                {selectedItem.desc}
              </p>
            )}

            <a
              href={getWhatsAppUrl(selectedItem)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 w-full min-h-[50px] rounded-xl bg-[#25d366] text-[#0a0a0b] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#20b858] transition-colors"
            >
              Pedir por WhatsApp
            </a>

            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="mt-2.5 w-full min-h-[44px] rounded-xl text-sm font-semibold text-[rgba(240,230,211,0.72)] hover:bg-[#1f1f22] transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
