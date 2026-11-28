import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { paginateListItems } from '../utils/orderHistory';

interface PaginatedListProps<T> {
  items: T[];
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  pageSizeOptions?: number[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyState: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  itemLabel?: string;
  hasMoreRemote?: boolean;
  loadingMoreRemote?: boolean;
  onLoadMoreRemote?: () => void;
  listClassName?: string;
}

function buildPageNumbers(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p += 1) {
    pages.push(p);
  }
  if (right < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function PaginatedList<T>({
  items,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  keyExtractor,
  renderItem,
  emptyState,
  loading = false,
  loadingLabel = 'Cargando registros...',
  itemLabel = 'registros',
  hasMoreRemote = false,
  loadingMoreRemote = false,
  onLoadMoreRemote,
  listClassName = 'space-y-2.5',
}: PaginatedListProps<T>) {
  const { pageItems, safePage, totalPages, totalItems, startIndex, endIndex } = paginateListItems(
    items,
    page,
    pageSize
  );

  if (loading && items.length === 0) {
    return (
      <div className="py-12 px-4 text-center ios-glass-card flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-[#c8a84b] animate-spin" />
        <p className="text-xs text-[rgba(240,230,211,0.72)] font-semibold">{loadingLabel}</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return <>{emptyState}</>;
  }

  const pageNumbers = buildPageNumbers(safePage, totalPages);

  return (
    <div className="space-y-4">
      <div className={listClassName}>
        {pageItems.map((item, idx) => (
          <React.Fragment key={keyExtractor(item)}>{renderItem(item, startIndex - 1 + idx)}</React.Fragment>
        ))}
      </div>

      {/* Pagination Bar */}
      <div className="p-3.5 rounded-2xl bg-[#161618]/85 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs tabular-nums">
        <div className="flex flex-wrap items-center gap-3 text-[rgba(240,230,211,0.72)]">
          <span>
            Mostrando <strong className="text-white">{startIndex}</strong>–
            <strong className="text-white">{endIndex}</strong> de{' '}
            <strong className="text-[#e8d090]">{totalItems}</strong> {itemLabel}
          </span>

          {onPageSizeChange && (
            <label className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-[rgba(240,230,211,0.55)]">Por página:</span>
              <select
                aria-label="Elementos por página"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value) || 10)}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[#0a0a0b] border border-white/15 text-xs text-white font-semibold focus:outline-none focus:border-[#c8a84b]"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Página anterior"
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-35 border border-white/10 text-white font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {pageNumbers.map((entry, idx) =>
            entry === 'ellipsis' ? (
              <span
                key={`el-${idx}`}
                className="px-2 text-[rgba(240,230,211,0.5)] select-none"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === safePage ? 'page' : undefined}
                className={`min-w-[40px] min-h-[40px] px-2.5 rounded-xl font-bold border transition-colors ${
                  entry === safePage
                    ? 'bg-[#c8a84b] border-[#c8a84b] text-[#0a0a0b]'
                    : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-[rgba(240,230,211,0.8)]'
                }`}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Siguiente página"
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-35 border border-white/10 text-white font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {hasMoreRemote && onLoadMoreRemote && (
            <button
              type="button"
              disabled={loadingMoreRemote}
              onClick={onLoadMoreRemote}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#173c34] hover:bg-[#28584c] disabled:opacity-50 border border-[#c8a84b]/40 text-[#e8d090] font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ml-1"
            >
              {loadingMoreRemote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loadingMoreRemote ? 'Cargando nube...' : 'Cargar más historial'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
