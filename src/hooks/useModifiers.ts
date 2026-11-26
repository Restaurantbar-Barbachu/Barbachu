import { useCallback, useRef, useState } from 'react';
import { OrderItem, OrderItemModifier } from '../types';

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

export interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
}

export const DEFAULT_MODIFIER_OPTIONS: ModifierOption[] = [
  { id: 'sin_cebolla', name: 'Sin cebolla', priceCents: 0 },
  { id: 'sin_tomate', name: 'Sin tomate', priceCents: 0 },
  { id: 'sin_chile', name: 'Sin chile', priceCents: 0 },
  { id: 'sin_mayonesa', name: 'Sin mayonesa', priceCents: 0 },
  { id: 'salsa_aparte', name: 'Salsa aparte', priceCents: 0 },
  { id: 'para_llevar', name: 'Para llevar', priceCents: 0 },
  { id: 'extra_queso', name: 'Extra queso', priceCents: 1500 },
  { id: 'tocino_extra', name: 'Tocino extra', priceCents: 2000 },
  { id: 'aguacate_extra', name: 'Aguacate extra', priceCents: 2500 },
  { id: 'carne_extra', name: 'Carne extra', priceCents: 3500 },
  { id: 'termino_medio', name: 'Término: Medio', priceCents: 0 },
  { id: 'termino_3_4', name: 'Término: Tres cuartos', priceCents: 0 },
  { id: 'termino_bien', name: 'Término: Bien cocido', priceCents: 0 },
];

export function useModifiers(initialModifiers: ModifierOption[] = DEFAULT_MODIFIER_OPTIONS) {
  const [modifiers, setModifiers] = useState<ModifierOption[]>(initialModifiers);
  const modifiersRef = useRef(modifiers);
  modifiersRef.current = modifiers;

  const addCustomModifier = useCallback(
    (rawName: string, pricePesos: number): { id: string; error?: string } => {
      const cleanName = rawName.trim().slice(0, 50);
      if (!cleanName) {
        return { id: '', error: 'Escribe el nombre del modificador o extra.' };
      }
      const safePesos = Number.isFinite(pricePesos) ? Math.max(0, pricePesos) : 0;
      const priceCents = Math.round(safePesos * 100);

      const existing = modifiersRef.current.find(
        (m) => m.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (existing) {
        if (existing.priceCents !== priceCents) {
          setModifiers((prev) =>
            prev.map((m) => (m.id === existing.id ? { ...m, priceCents } : m))
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
      setModifiers((prev) => [...prev, { id, name: cleanName, priceCents }]);
      return { id };
    },
    []
  );

  const calculateModifierTotal = useCallback(
    (selected: Record<string, boolean>): number => {
      return modifiers
        .filter((m) => selected[m.id])
        .reduce((sum, m) => sum + m.priceCents, 0);
    },
    [modifiers]
  );

  const getModifiersArray = useCallback(
    (selected: Record<string, boolean>): OrderItemModifier[] => {
      return modifiers
        .filter((m) => selected[m.id])
        .map((m) => ({ name: m.name, priceCents: m.priceCents }));
    },
    [modifiers]
  );

  const buildSelectionFromItem = useCallback((item: OrderItem): Record<string, boolean> => {
    const itemMods = item.modifiers || item.modificadores || [];
    const selectedMap: Record<string, boolean> = {};
    const missingMods: ModifierOption[] = [];

    for (const mod of itemMods) {
      const existing = modifiersRef.current.find(
        (m) => m.name.toLowerCase() === mod.name.toLowerCase()
      );
      if (existing) {
        selectedMap[existing.id] = true;
      } else {
        const customId = `custom_loaded_${mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${missingMods.length}`;
        missingMods.push({ id: customId, name: mod.name, priceCents: mod.priceCents || 0 });
        selectedMap[customId] = true;
      }
    }

    if (missingMods.length > 0) {
      setModifiers((prev) => [...prev, ...missingMods]);
    }
    return selectedMap;
  }, []);

  return {
    modifiers,
    addCustomModifier,
    calculateModifierTotal,
    getModifiersArray,
    buildSelectionFromItem,
  };
}
