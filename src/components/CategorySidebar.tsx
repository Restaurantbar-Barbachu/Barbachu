import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Layers, Tag } from 'lucide-react';
import type { CatalogCategoryNode, MainCatalogCategory } from '../utils/catalogHierarchy';

interface CategorySidebarProps {
  hierarchy: CatalogCategoryNode[];
  selectedCategory: MainCatalogCategory;
  selectedSubcategory: string;
  selectedGroup: string;
  onSelectCategory: (category: MainCatalogCategory) => void;
  onSelectSubcategory: (subcategory: string) => void;
  onSelectGroup: (group: string) => void;
  stationFilter: 'todas' | 'cocina' | 'barra';
  onChangeStationFilter: (station: 'todas' | 'cocina' | 'barra') => void;
  totalCatalogCount: number;
  searchActive?: boolean;
  onClearSearch?: () => void;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  hierarchy,
  selectedCategory,
  selectedSubcategory,
  selectedGroup,
  onSelectCategory,
  onSelectSubcategory,
  onSelectGroup,
  stationFilter,
  onChangeStationFilter,
  totalCatalogCount,
  searchActive = false,
  onClearSearch,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const activeCategoryNode =
    hierarchy.find((cat) => cat.name === selectedCategory) || hierarchy[0] || null;
  const activeSubcategoryNode =
    activeCategoryNode?.subcategories.find((sub) => sub.name === selectedSubcategory) || null;

  const renderTreeNodes = (closeMobileOnPick: boolean) => (
    <div className="space-y-1.5">
      {hierarchy.map((cat) => {
        const isCatActive = !searchActive && selectedCategory === cat.name;
        return (
          <div
            key={cat.id}
            className={`rounded-2xl border transition-colors ${
              isCatActive
                ? 'bg-[#c8a84b]/10 border-[#c8a84b]/45'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                onSelectCategory(cat.name);
                if (searchActive && onClearSearch) onClearSearch();
              }}
              aria-expanded={isCatActive}
              className="w-full min-h-[40px] px-3 py-2 flex items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                {isCatActive ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#c8a84b] shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[rgba(240,230,211,0.5)] shrink-0" />
                )}
                <span
                  className={`text-xs font-bold truncate ${
                    isCatActive ? 'text-[#e8d090]' : 'text-[#f0e6d3]'
                  }`}
                >
                  {cat.name}
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums shrink-0 ${
                  isCatActive
                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                    : 'bg-white/[0.07] text-[rgba(240,230,211,0.68)]'
                }`}
              >
                {cat.count}
              </span>
            </button>

            {isCatActive && (
              <div className="px-2 pb-2.5 pt-0.5 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSubcategory('Todas');
                    if (closeMobileOnPick) setMobileDrawerOpen(false);
                  }}
                  className={`w-full min-h-[34px] px-2.5 py-1 rounded-xl text-left text-[11px] font-semibold flex items-center justify-between gap-1.5 transition-colors ${
                    selectedSubcategory === 'Todas'
                      ? 'bg-[#173c34] text-[#25d366] border border-[#25d366]/50 font-bold'
                      : 'text-[rgba(240,230,211,0.72)] hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="truncate">Todas las subcategorías</span>
                  <span className="font-mono text-[10px] opacity-80 shrink-0">{cat.count}</span>
                </button>

                {cat.subcategories.map((sub) => {
                  const isSubActive = selectedSubcategory === sub.name;
                  return (
                    <div key={sub.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSubcategory(sub.name);
                          if (closeMobileOnPick && sub.groups.length <= 1) {
                            setMobileDrawerOpen(false);
                          }
                        }}
                        className={`w-full min-h-[34px] px-2.5 py-1 rounded-xl text-left text-[11px] flex items-center justify-between gap-1.5 transition-colors ${
                          isSubActive
                            ? 'bg-[#173c34] text-[#25d366] border border-[#25d366]/50 font-bold'
                            : 'text-[rgba(240,230,211,0.78)] hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Layers className="w-3 h-3 shrink-0 opacity-70" />
                          <span className="truncate">{sub.name}</span>
                        </span>
                        <span className="font-mono text-[10px] opacity-80 shrink-0">{sub.count}</span>
                      </button>

                      {isSubActive && sub.groups.length > 1 && (
                        <div className="pl-3 ml-2 border-l border-[#25d366]/30 space-y-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectGroup('Todos');
                              if (closeMobileOnPick) setMobileDrawerOpen(false);
                            }}
                            className={`w-full min-h-[30px] px-2 py-1 rounded-lg text-left text-[11px] flex items-center justify-between gap-1 transition-colors ${
                              selectedGroup === 'Todos'
                                ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                                : 'text-[rgba(240,230,211,0.68)] hover:bg-white/[0.05]'
                            }`}
                          >
                            <span className="truncate">Todos los grupos</span>
                            <span className="font-mono text-[10px] shrink-0">{sub.count}</span>
                          </button>

                          {sub.groups.map((grp) => {
                            const isGrpActive = selectedGroup === grp.name;
                            return (
                              <button
                                key={grp.id}
                                type="button"
                                onClick={() => {
                                  onSelectGroup(grp.name);
                                  if (closeMobileOnPick) setMobileDrawerOpen(false);
                                }}
                                className={`w-full min-h-[30px] px-2 py-1 rounded-lg text-left text-[11px] flex items-center justify-between gap-1 transition-colors ${
                                  isGrpActive
                                    ? 'bg-[#c8a84b] text-[#0a0a0b] font-bold'
                                    : 'text-[rgba(240,230,211,0.72)] hover:bg-white/[0.05]'
                                }`}
                              >
                                <span className="flex items-center gap-1 min-w-0">
                                  <Tag className="w-2.5 h-2.5 shrink-0 opacity-75" />
                                  <span className="truncate">{grp.name}</span>
                                </span>
                                <span className="font-mono text-[10px] shrink-0">{grp.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <aside aria-label="Navegación de categorías del catálogo" className="w-full md:w-60 lg:w-64 shrink-0">
      {/* Desktop / Tablet Vertical Tree Sidebar */}
      <div className="hidden md:flex flex-col gap-3 p-3.5 ios-glass-card md:sticky md:top-20 max-h-[calc(100dvh-110px)] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <FolderTree className="w-4 h-4 text-[#c8a84b] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white truncate">
              Categorías
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.07] text-[11px] font-mono text-[#e8d090] tabular-nums shrink-0">
            {totalCatalogCount}
          </span>
        </div>

        {/* Station quick filter */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0a0a0b]/70 border border-white/10">
          {(['todas', 'cocina', 'barra'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onChangeStationFilter(st)}
              className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors truncate ${
                stationFilter === st
                  ? 'bg-[#c8a84b] text-[#0a0a0b]'
                  : 'text-[rgba(240,230,211,0.68)] hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {renderTreeNodes(false)}
      </div>

      {/* Mobile Compact Collapsible Bar + Quick Category/Subcategory Pills */}
      <div className="md:hidden p-3 ios-glass-card space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            aria-expanded={mobileDrawerOpen}
            className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0a0a0b]/75 border border-[#c8a84b]/40 flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              <FolderTree className="w-4 h-4 text-[#c8a84b] shrink-0" />
              <span className="text-xs font-bold text-[#e8d090] truncate">
                {searchActive
                  ? 'Resultados de búsqueda'
                  : `${selectedCategory}${selectedSubcategory !== 'Todas' ? ` › ${selectedSubcategory}` : ''}${
                      selectedGroup !== 'Todos' ? ` › ${selectedGroup}` : ''
                    }`}
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#c8a84b] shrink-0 transition-transform ${
                mobileDrawerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0a0a0b]/70 border border-white/10 shrink-0">
            {(['todas', 'cocina', 'barra'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => onChangeStationFilter(st)}
                className={`min-h-[32px] px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  stationFilter === st
                    ? 'bg-[#c8a84b] text-[#0a0a0b]'
                    : 'text-[rgba(240,230,211,0.68)]'
                }`}
              >
                {st === 'todas' ? 'Todo' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Fast 1-tap Categoría & Subcategoría Horizontal Strips */}
        {!searchActive && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {hierarchy.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.name)}
                  className={`flex-none min-h-[34px] px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                    selectedCategory === cat.name
                      ? 'bg-[#c8a84b] text-[#0a0a0b] border-[#c8a84b]'
                      : 'bg-[#161618] text-[rgba(240,230,211,0.78)] border-white/15'
                  }`}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>

            {activeCategoryNode && activeCategoryNode.subcategories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => onSelectSubcategory('Todas')}
                  className={`flex-none min-h-[30px] px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap ${
                    selectedSubcategory === 'Todas'
                      ? 'bg-[#173c34] text-[#25d366] border-[#25d366]/55'
                      : 'bg-white/[0.04] text-[rgba(240,230,211,0.72)] border-white/10'
                  }`}
                >
                  Todas
                </button>
                {activeCategoryNode.subcategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onSelectSubcategory(sub.name)}
                    className={`flex-none min-h-[30px] px-2.5 py-1 rounded-xl text-[11px] font-semibold border whitespace-nowrap ${
                      selectedSubcategory === sub.name
                        ? 'bg-[#173c34] text-[#25d366] border-[#25d366]/55 font-bold'
                        : 'bg-white/[0.04] text-[rgba(240,230,211,0.72)] border-white/10'
                    }`}
                  >
                    {sub.name} ({sub.count})
                  </button>
                ))}
              </div>
            )}

            {activeSubcategoryNode && activeSubcategoryNode.groups.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => onSelectGroup('Todos')}
                  className={`flex-none min-h-[28px] px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${
                    selectedGroup === 'Todos'
                      ? 'bg-[#c8a84b]/25 text-[#e8d090] border-[#c8a84b]'
                      : 'bg-white/[0.03] text-[rgba(240,230,211,0.68)] border-white/10'
                  }`}
                >
                  Todos los grupos
                </button>
                {activeSubcategoryNode.groups.map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => onSelectGroup(grp.name)}
                    className={`flex-none min-h-[28px] px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${
                      selectedGroup === grp.name
                        ? 'bg-[#c8a84b]/25 text-[#e8d090] border-[#c8a84b]'
                        : 'bg-white/[0.03] text-[rgba(240,230,211,0.68)] border-white/10'
                    }`}
                  >
                    {grp.name} ({grp.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Full Expandable Tree Drawer on Mobile */}
        {mobileDrawerOpen && (
          <div className="pt-2 border-t border-white/10 max-h-72 overflow-y-auto">
            {renderTreeNodes(true)}
          </div>
        )}
      </div>
    </aside>
  );
};
