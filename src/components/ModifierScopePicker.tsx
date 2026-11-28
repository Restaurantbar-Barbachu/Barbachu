import React, { useMemo, useState } from 'react';
import { Check, Layers, Search, Tag, X } from 'lucide-react';
import type { ModifierScope, SoftProduct } from '../types';
import {
  formatModifierScopeSummary,
  isModifierScopeValid,
  normalizeModifierScope,
} from '../utils/modifiers';

interface ModifierScopePickerProps {
  scope: ModifierScope;
  onChange: (next: ModifierScope) => void;
  products: SoftProduct[];
  compact?: boolean;
  currentProduct?: Pick<SoftProduct, 'key' | 'name' | 'category'> | null;
}

export const ModifierScopePicker: React.FC<ModifierScopePickerProps> = ({
  scope,
  onChange,
  products,
  compact = false,
  currentProduct = null,
}) => {
  const [search, setSearch] = useState<string>('');
  const [tab, setTab] = useState<'productos' | 'categorias'>('productos');

  const normalized = useMemo(() => normalizeModifierScope(scope), [scope]);
  const selectedKeys = useMemo(
    () => new Set(normalized.productKeys || []),
    [normalized.productKeys]
  );
  const selectedCats = useMemo(
    () => new Set(normalized.categories || []),
    [normalized.categories]
  );

  const saleProducts = useMemo(
    () =>
      (products || [])
        .filter((p) => p.category && p.category !== 'MODIFICADORES')
        .slice()
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, 'es') ||
            a.key.localeCompare(b.key, 'es')
        ),
    [products]
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of saleProducts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [saleProducts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? saleProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        )
      : saleProducts;
    return list;
  }, [saleProducts, search]);

  const toggleProductKey = (key: string) => {
    const nextKeys = new Set(selectedKeys);
    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }
    onChange(
      normalizeModifierScope({
        mode: 'specific',
        productKeys: Array.from(nextKeys),
        categories: Array.from(selectedCats),
      })
    );
  };

  const toggleCategory = (cat: string) => {
    const nextCats = new Set(selectedCats);
    if (nextCats.has(cat)) {
      nextCats.delete(cat);
    } else {
      nextCats.add(cat);
    }
    onChange(
      normalizeModifierScope({
        mode: 'specific',
        productKeys: Array.from(selectedKeys),
        categories: Array.from(nextCats),
      })
    );
  };

  const handleSelectVisibleProducts = () => {
    const nextKeys = new Set(selectedKeys);
    for (const p of filteredProducts) {
      if (nextKeys.size >= 200) break;
      nextKeys.add(p.key);
    }
    onChange(
      normalizeModifierScope({
        mode: 'specific',
        productKeys: Array.from(nextKeys),
        categories: Array.from(selectedCats),
      })
    );
  };

  const handleClearSpecific = () => {
    onChange({
      mode: 'specific',
      productKeys: [],
      categories: [],
    });
  };

  const isOnlyCurrentProduct =
    Boolean(currentProduct) &&
    normalized.mode === 'specific' &&
    selectedKeys.size === 1 &&
    selectedKeys.has(currentProduct!.key) &&
    selectedCats.size === 0;

  const isValid = isModifierScopeValid(normalized);
  const summaryText = formatModifierScopeSummary(normalized, products);

  return (
    <div
      className={`rounded-2xl bg-[#0a0a0b]/60 border border-white/10 ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#e8d090]">
          Aplicación del Modificador
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
            normalized.mode === 'all'
              ? 'bg-white/10 text-[rgba(240,230,211,0.8)]'
              : isValid
              ? 'bg-[#c8a84b]/20 text-[#e8d090]'
              : 'bg-[#e05252]/20 text-[#e05252]'
          }`}
        >
          {summaryText}
        </span>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ mode: 'all', productKeys: [], categories: [] })}
          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
            normalized.mode === 'all'
              ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
              : 'bg-white/[0.04] text-[rgba(240,230,211,0.75)] border-white/10 hover:bg-white/[0.08]'
          }`}
        >
          <span>Todos los productos</span>
        </button>
        <button
          type="button"
          onClick={() =>
            onChange(
              normalized.mode === 'specific'
                ? normalized
                : {
                    mode: 'specific',
                    productKeys: currentProduct ? [currentProduct.key] : [],
                    categories: [],
                  }
            )
          }
          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
            normalized.mode === 'specific'
              ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
              : 'bg-white/[0.04] text-[rgba(240,230,211,0.75)] border-white/10 hover:bg-white/[0.08]'
          }`}
        >
          <span>Productos específicos</span>
        </button>
      </div>

      {/* Quick preset for active Comandero product */}
      {currentProduct && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              onChange({
                mode: 'specific',
                productKeys: [currentProduct.key],
                categories: [],
              })
            }
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
              isOnlyCurrentProduct
                ? 'bg-[#25d366]/20 border-[#25d366]/60 text-[#25d366]'
                : 'bg-white/[0.04] border-white/10 text-[rgba(240,230,211,0.78)] hover:bg-white/[0.08]'
            }`}
          >
            <span>Solo este producto ({currentProduct.name})</span>
          </button>
        </div>
      )}

      {normalized.mode === 'specific' && (
        <div className="space-y-2 pt-1 border-t border-white/10">
          {/* Sub-tabs: Products vs Categories */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab('productos')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border ${
                  tab === 'productos'
                    ? 'bg-white/15 text-white border-white/25'
                    : 'bg-transparent text-[rgba(240,230,211,0.6)] border-transparent hover:text-white'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>Productos ({selectedKeys.size})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('categorias')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border ${
                  tab === 'categorias'
                    ? 'bg-white/15 text-white border-white/25'
                    : 'bg-transparent text-[rgba(240,230,211,0.6)] border-transparent hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Categorías ({selectedCats.size})</span>
              </button>
            </div>
            {(selectedKeys.size > 0 || selectedCats.size > 0) && (
              <button
                type="button"
                onClick={handleClearSpecific}
                className="text-[10px] font-semibold text-[#e05252] hover:underline"
              >
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {tab === 'productos' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-[rgba(240,230,211,0.45)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto o categoría..."
                    aria-label="Buscar producto para asignar modificador"
                    className="w-full min-h-[32px] pl-7 pr-7 py-1 rounded-lg bg-[#161618] border border-white/10 text-[11px] text-white placeholder-[rgba(240,230,211,0.4)] focus:outline-none focus:border-[#c8a84b]"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Limpiar búsqueda de productos"
                      className="absolute right-1.5 top-1.5 w-5 h-5 rounded flex items-center justify-center text-[rgba(240,230,211,0.6)] hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectVisibleProducts}
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-semibold text-[#e8d090] whitespace-nowrap"
                  >
                    <span>+ Visibles</span>
                  </button>
                )}
              </div>

              <div
                className={`${
                  compact ? 'max-h-36' : 'max-h-44'
                } overflow-y-auto pr-1 space-y-1`}
              >
                {filteredProducts.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-[rgba(240,230,211,0.5)]">
                    No se encontraron productos.
                  </p>
                ) : (
                  filteredProducts.map((prod) => {
                    const checked = selectedKeys.has(prod.key);
                    return (
                      <button
                        key={prod.key}
                        type="button"
                        onClick={() => toggleProductKey(prod.key)}
                        className={`w-full px-2.5 py-1.5 rounded-xl border text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                          checked
                            ? 'bg-[#c8a84b]/15 border-[#c8a84b]/70 text-white'
                            : 'bg-white/[0.03] border-white/10 text-[rgba(240,230,211,0.8)] hover:bg-white/[0.07]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                              checked
                                ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b]'
                                : 'border-white/30'
                            }`}
                          >
                            {checked ? <Check className="w-2.5 h-2.5" /> : null}
                          </span>
                          <span className="font-semibold truncate">{prod.name}</span>
                        </span>
                        <span className="text-[10px] text-[rgba(240,230,211,0.55)] shrink-0">
                          {prod.category} · #{prod.key}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-wrap gap-1.5 ${
                compact ? 'max-h-36' : 'max-h-44'
              } overflow-y-auto pr-1`}
            >
              {availableCategories.length === 0 ? (
                <p className="py-2 text-[11px] text-[rgba(240,230,211,0.5)]">
                  Sin categorías disponibles.
                </p>
              ) : (
                availableCategories.map((cat) => {
                  const checked = selectedCats.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        checked
                          ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b] font-bold'
                          : 'bg-white/[0.04] border-white/10 text-[rgba(240,230,211,0.78)] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span>{cat}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {!isValid && (
            <p className="text-[11px] font-semibold text-[#e05252]">
              Selecciona al menos un producto o categoría específica.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
