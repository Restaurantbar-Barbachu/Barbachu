import type { ModifierScope, OrderItem, OrderItemModifier, SoftProduct } from '../types';

export interface ModifierOption {
  id: string;
  key?: string;
  name: string;
  priceCents: number;
  source: 'catalog' | 'custom';
  saleEnabled: boolean;
  scope?: ModifierScope;
}

export function normalizeModifierName(rawName: string): string {
  return String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeModifierScope(scope?: ModifierScope | null): ModifierScope {
  if (!scope || scope.mode !== 'specific') {
    return { mode: 'all', productKeys: [], categories: [] };
  }
  const keySet = new Set<string>();
  for (const rawKey of scope.productKeys || []) {
    const clean = String(rawKey || '').trim().slice(0, 64);
    if (clean) keySet.add(clean);
    if (keySet.size >= 200) break;
  }
  const catSet = new Set<string>();
  for (const rawCat of scope.categories || []) {
    const clean = String(rawCat || '').trim().slice(0, 80);
    if (clean) catSet.add(clean);
    if (catSet.size >= 40) break;
  }
  return {
    mode: 'specific',
    productKeys: Array.from(keySet),
    categories: Array.from(catSet),
  };
}

export function isModifierScopeValid(scope?: ModifierScope | null): boolean {
  const normalized = normalizeModifierScope(scope);
  if (normalized.mode === 'all') return true;
  return (normalized.productKeys?.length || 0) > 0 || (normalized.categories?.length || 0) > 0;
}

export function isModifierApplicableToProduct(
  mod: Pick<ModifierOption, 'scope'>,
  product?: Pick<SoftProduct, 'key' | 'category'> | null
): boolean {
  if (!product) return true;
  const scope = normalizeModifierScope(mod.scope);
  if (scope.mode === 'all') return true;
  if (scope.productKeys?.includes(product.key)) return true;
  if (product.category && scope.categories?.includes(product.category)) return true;
  return false;
}

export function filterModifiersForProduct(
  options: ModifierOption[],
  product?: Pick<SoftProduct, 'key' | 'category'> | null,
  selectedIds?: Record<string, boolean>
): ModifierOption[] {
  if (!product) return options;
  return options.filter(
    (opt) => Boolean(selectedIds?.[opt.id]) || isModifierApplicableToProduct(opt, product)
  );
}

export function formatModifierScopeSummary(
  scope?: ModifierScope | null,
  products?: SoftProduct[]
): string {
  const normalized = normalizeModifierScope(scope);
  if (normalized.mode === 'all') return 'Todos los productos';
  const keys = normalized.productKeys || [];
  const cats = normalized.categories || [];
  if (keys.length === 0 && cats.length === 0) return 'Sin productos asignados';
  if (keys.length === 1 && cats.length === 0) {
    const found = products?.find((p) => p.key === keys[0]);
    return `Solo: ${found?.name || keys[0]}`;
  }
  if (cats.length === 1 && keys.length === 0) {
    return `Cat: ${cats[0]}`;
  }
  const parts: string[] = [];
  if (cats.length > 0) {
    parts.push(`${cats.length} ${cats.length === 1 ? 'categoría' : 'categorías'}`);
  }
  if (keys.length > 0) {
    parts.push(`${keys.length} ${keys.length === 1 ? 'producto' : 'productos'}`);
  }
  return parts.join(' · ');
}

export function isCatalogModifierActive(prod: SoftProduct): boolean {
  if (prod.category !== 'MODIFICADORES') return false;
  return Boolean(prod.saleEnabled) || Math.round(Number(prod.priceCents) || 0) === 0;
}

export function buildCatalogModifierOptions(
  products: SoftProduct[],
  customModifiers: ModifierOption[] = []
): ModifierOption[] {
  const catalogList: ModifierOption[] = (products || [])
    .filter((p) => p.category === 'MODIFICADORES')
    .map((p) => ({
      id: `cat_${p.key}`,
      key: p.key,
      name: normalizeModifierName(p.name) || p.name,
      priceCents: Math.max(0, Math.round(Number(p.priceCents) || 0)),
      source: 'catalog' as const,
      saleEnabled: isCatalogModifierActive(p),
      scope: p.modifierScope ? normalizeModifierScope(p.modifierScope) : undefined,
    }))
    .filter((m) => m.name.length > 0 && m.saleEnabled);

  catalogList.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'es') ||
      String(a.key || '').localeCompare(String(b.key || ''), 'es')
  );

  const seenLower = new Set(catalogList.map((m) => m.name.toLowerCase()));
  const merged = [...catalogList];

  for (const custom of customModifiers) {
    const clean = normalizeModifierName(custom.name);
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    merged.push({
      ...custom,
      name: clean,
      priceCents: Math.max(0, Math.round(Number(custom.priceCents) || 0)),
      source: 'custom',
      saleEnabled: true,
      scope: custom.scope ? normalizeModifierScope(custom.scope) : undefined,
    });
  }

  return merged;
}

export function buildModifierProductKey(name: string, existingKeys: Iterable<string>): string {
  const used = new Set(Array.from(existingKeys, (k) => String(k)));
  const slug = normalizeModifierName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  const base = `mod_${slug || 'extra'}`;
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

export function calculateModifierSelectionTotal(
  options: ModifierOption[],
  selected: Record<string, boolean>
): number {
  return options
    .filter((m) => selected[m.id])
    .reduce((sum, m) => sum + Math.max(0, m.priceCents), 0);
}

export function getSelectedModifiersArray(
  options: ModifierOption[],
  selected: Record<string, boolean>
): OrderItemModifier[] {
  return options
    .filter((m) => selected[m.id])
    .map((m) => ({ name: m.name, priceCents: Math.max(0, m.priceCents) }));
}

export function matchItemModifiersToOptions(
  item: OrderItem,
  options: ModifierOption[]
): { selected: Record<string, boolean>; unmatchedCustom: ModifierOption[] } {
  const itemMods = item.modifiers || item.modificadores || [];
  const selected: Record<string, boolean> = {};
  const unmatchedCustom: ModifierOption[] = [];

  for (const mod of itemMods) {
    const clean = normalizeModifierName(mod.name);
    if (!clean) continue;
    const modPrice = Math.max(0, Math.round(Number(mod.priceCents) || 0));
    const exactMatch = options.find(
      (o) => o.name.toLowerCase() === clean.toLowerCase() && o.priceCents === modPrice
    );
    const nameMatch =
      exactMatch || options.find((o) => o.name.toLowerCase() === clean.toLowerCase());

    if (nameMatch && nameMatch.priceCents === modPrice) {
      selected[nameMatch.id] = true;
    } else {
      const customId = `custom_loaded_${clean.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${unmatchedCustom.length}`;
      unmatchedCustom.push({
        id: customId,
        name: clean,
        priceCents: modPrice,
        source: 'custom',
        saleEnabled: true,
      });
      selected[customId] = true;
    }
  }

  return { selected, unmatchedCustom };
}

export function removeModifierFromItem(
  item: OrderItem,
  indexOrName: number | string
): OrderItem {
  const current = [...(item.modifiers || item.modificadores || [])];
  const nextMods =
    typeof indexOrName === 'number'
      ? current.filter((_, idx) => idx !== indexOrName)
      : current.filter(
          (m) => normalizeModifierName(m.name).toLowerCase() !== normalizeModifierName(indexOrName).toLowerCase()
        );

  const nextItem: OrderItem = { ...item };
  delete nextItem.modificadores;
  if (nextMods.length > 0) {
    nextItem.modifiers = nextMods;
  } else {
    delete nextItem.modifiers;
  }
  return nextItem;
}

export function updateModifierOnItem(
  item: OrderItem,
  modIndex: number,
  nextMod: OrderItemModifier
): OrderItem {
  const current = [...(item.modifiers || item.modificadores || [])];
  if (modIndex < 0 || modIndex >= current.length) return item;
  const cleanName = normalizeModifierName(nextMod.name);
  if (!cleanName) return removeModifierFromItem(item, modIndex);

  current[modIndex] = {
    name: cleanName.slice(0, 60),
    priceCents: Math.max(0, Math.round(Number(nextMod.priceCents) || 0)),
  };

  const nextItem: OrderItem = { ...item, modifiers: current };
  delete nextItem.modificadores;
  return nextItem;
}

export function replaceOrderItemInList(
  items: OrderItem[],
  targetId: string,
  updater: (item: OrderItem) => OrderItem
): OrderItem[] {
  return items.map((item) => ((item.lineId || item.key) === targetId ? updater(item) : item));
}

export function duplicateOrderItemInList(
  items: OrderItem[],
  targetId: string,
  newLineId: string
): OrderItem[] {
  const idx = items.findIndex((item) => (item.lineId || item.key) === targetId);
  if (idx < 0) return items;
  const source = items[idx];
  const mods = source.modifiers || source.modificadores;
  const clone: OrderItem = {
    ...source,
    lineId: newLineId,
    itemStatus: 'pending',
    modifiers: mods ? mods.map((m) => ({ ...m })) : undefined,
  };
  delete clone.modificadores;
  const copy = [...items];
  copy.splice(idx + 1, 0, clone);
  return copy;
}
