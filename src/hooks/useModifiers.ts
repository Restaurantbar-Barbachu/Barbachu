import { useCallback, useMemo, useRef, useState } from 'react';
import { ModifierScope, OrderItem, OrderItemModifier, SoftProduct } from '../types';
import {
  buildCatalogModifierOptions,
  calculateModifierSelectionTotal,
  getSelectedModifiersArray,
  matchItemModifiersToOptions,
  normalizeModifierName,
  normalizeModifierScope,
  type ModifierOption,
} from '../utils/modifiers';

export type { ModifierOption };

export const QUICK_ITEM_MODIFIERS = [
  'Sin cebolla',
  'Sin picante',
  'Salsa aparte',
  'Bien cocido',
  'Con hielo',
  'Sin hielo',
  'Extra limón',
  'Para llevar',
];

export function useModifiers(catalogProducts: SoftProduct[] = []) {
  const [customModifiers, setCustomModifiers] = useState<ModifierOption[]>([]);

  const modifiers = useMemo(
    () => buildCatalogModifierOptions(catalogProducts, customModifiers),
    [catalogProducts, customModifiers]
  );

  const modifiersRef = useRef(modifiers);
  modifiersRef.current = modifiers;

  const addCustomModifier = useCallback(
    (rawName: string, pricePesos: number, scope?: ModifierScope): { id: string; error?: string } => {
      const cleanName = normalizeModifierName(rawName).slice(0, 60);
      if (!cleanName) {
        return { id: '', error: 'Escribe el nombre del modificador o extra.' };
      }
      const safePesos = Number.isFinite(pricePesos) ? Math.max(0, pricePesos) : 0;
      const priceCents = Math.round(safePesos * 100);
      const normalizedScope = scope ? normalizeModifierScope(scope) : undefined;

      const existing = modifiersRef.current.find(
        (m) => m.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (existing) {
        if (existing.source === 'custom' && (existing.priceCents !== priceCents || normalizedScope)) {
          setCustomModifiers((prev) =>
            prev.map((m) =>
              m.id === existing.id
                ? { ...m, priceCents, scope: normalizedScope ?? m.scope }
                : m
            )
          );
        }
        return { id: existing.id };
      }

      const slug = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const id = `custom_${slug || 'extra'}_${Date.now().toString(36)}`;
      setCustomModifiers((prev) => [
        ...prev,
        {
          id,
          name: cleanName,
          priceCents,
          source: 'custom',
          saleEnabled: true,
          scope: normalizedScope,
        },
      ]);
      return { id };
    },
    []
  );

  const updateCustomModifier = useCallback(
    (
      id: string,
      rawName: string,
      pricePesos: number,
      scope?: ModifierScope
    ): { ok: boolean; error?: string } => {
      const cleanName = normalizeModifierName(rawName).slice(0, 60);
      if (!cleanName) {
        return { ok: false, error: 'El nombre del modificador es obligatorio.' };
      }
      const safePesos = Number.isFinite(pricePesos) ? Math.max(0, pricePesos) : 0;
      const priceCents = Math.round(safePesos * 100);
      const normalizedScope = scope ? normalizeModifierScope(scope) : undefined;

      setCustomModifiers((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, name: cleanName, priceCents, scope: normalizedScope ?? m.scope }
            : m
        )
      );
      return { ok: true };
    },
    []
  );

  const removeCustomModifier = useCallback((id: string) => {
    setCustomModifiers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const calculateModifierTotal = useCallback(
    (selected: Record<string, boolean>): number => {
      return calculateModifierSelectionTotal(modifiers, selected);
    },
    [modifiers]
  );

  const getModifiersArray = useCallback(
    (selected: Record<string, boolean>): OrderItemModifier[] => {
      return getSelectedModifiersArray(modifiers, selected);
    },
    [modifiers]
  );

  const buildSelectionFromItem = useCallback((item: OrderItem): Record<string, boolean> => {
    const { selected, unmatchedCustom } = matchItemModifiersToOptions(
      item,
      modifiersRef.current
    );
    if (unmatchedCustom.length > 0) {
      setCustomModifiers((prev) => {
        const existingNames = new Set(prev.map((m) => m.name.toLowerCase()));
        const additions = unmatchedCustom.filter(
          (m) => !existingNames.has(m.name.toLowerCase())
        );
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }
    return selected;
  }, []);

  return {
    modifiers,
    addCustomModifier,
    updateCustomModifier,
    removeCustomModifier,
    calculateModifierTotal,
    getModifiersArray,
    buildSelectionFromItem,
  };
}
