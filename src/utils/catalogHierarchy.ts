import { SoftProduct } from '../types';

export type MainCatalogCategory = 'Alimentos' | 'Bebidas' | 'Alcohol & Barra' | 'Extras';

export const MAIN_CATALOG_CATEGORIES: MainCatalogCategory[] = [
  'Alimentos',
  'Bebidas',
  'Alcohol & Barra',
  'Extras',
];

export interface CatalogGroupNode {
  id: string;
  name: string;
  count: number;
  products: SoftProduct[];
}

export interface CatalogSubcategoryNode {
  id: string;
  name: string;
  count: number;
  groups: CatalogGroupNode[];
}

export interface CatalogCategoryNode {
  id: string;
  name: MainCatalogCategory;
  count: number;
  subcategories: CatalogSubcategoryNode[];
}

export interface CatalogHierarchyFilter {
  category: MainCatalogCategory;
  subcategory: string;
  group: string;
  searchQuery?: string;
}

const CATEGORY_TO_MAIN: Record<string, MainCatalogCategory> = {
  ALAS: 'Alimentos',
  BONELES: 'Alimentos',
  HAMBURGUESA: 'Alimentos',
  CORTES: 'Alimentos',
  CAMARONES: 'Alimentos',
  BOTANAS: 'Alimentos',
  'BEBIDAS S/ALCOHOL': 'Bebidas',
  MICHELADA: 'Bebidas',
  CERVEZA: 'Alcohol & Barra',
  CUBETAS: 'Alcohol & Barra',
  'BEBIDAS C/ALCOHOL': 'Alcohol & Barra',
  DESTILADOS: 'Alcohol & Barra',
  EXTRAS: 'Extras',
};

export function getMainCatalogCategory(groupCategory: string): MainCatalogCategory {
  const norm = (groupCategory || '').toUpperCase().trim();
  return CATEGORY_TO_MAIN[norm] || 'Alimentos';
}

export function getProductSubgroup(product: Pick<SoftProduct, 'category' | 'name'>): string {
  const cat = (product.category || '').toUpperCase().trim();
  const name = (product.name || '').toUpperCase().trim();

  if (cat === 'CAMARONES') {
    if (name.includes('AGUACHILE')) return 'Aguachiles';
    return 'Camarones y Pulpo';
  }

  if (cat === 'BOTANAS') {
    if (name.includes('PAPA') || name.includes('FRANCESA') || name.includes('ELOTE')) {
      return 'Papas y Elotes';
    }
    if (name.includes('BOTANA') || name.includes('CECINA')) {
      return 'Botanas y Cecina';
    }
    return 'Entradas y Otros';
  }

  if (cat === 'CERVEZA') {
    if (name.includes('AMPOLLETA') || name.includes('CAGUAMA')) {
      return 'Ampolleta y Caguama';
    }
    if (name.includes('0.0') || name.includes('LIGHT')) {
      return 'Light y Sin Alcohol';
    }
    return 'Media y Lata';
  }

  if (cat === 'DESTILADOS') {
    if (name.startsWith('VINO ')) return 'Vinos / Copeo';
    if (name.startsWith('SHOT') || name.includes('PALOMA') || name.includes('VAMPIRO') || name.includes('VODKA')) {
      return 'Shots y Preparados';
    }
    return 'Botellas y Destilados';
  }

  if (cat === 'BEBIDAS S/ALCOHOL') {
    if (name.includes('LIMONADA') || name.includes('RUSA')) return 'Limonadas y Rusas';
    if (
      name.includes('JUMEX') ||
      name.includes('JUGO') ||
      name.includes('DEL VALLE') ||
      name.includes('BOOST') ||
      name.includes('REDBULL')
    ) {
      return 'Jugos y Energizantes';
    }
    return 'Refrescos y Agua';
  }

  if (cat === 'EXTRAS') {
    if (name.includes('DEEP') || name.includes('SALSA') || name.includes('FRASCO')) {
      return 'Dips y Salsas';
    }
    if (name.includes('CIGARRO') || name.includes('PRESTAMO') || name.includes('RECARGA')) {
      return 'Cigarros y Servicios';
    }
    return 'Complementos';
  }

  return 'General';
}

export function buildCatalogHierarchy(products: SoftProduct[]): CatalogCategoryNode[] {
  const catMap = new Map<MainCatalogCategory, Map<string, Map<string, SoftProduct[]>>>();

  for (const prod of products) {
    const mainCat = getMainCatalogCategory(prod.category);
    const subCat = (prod.category || 'GENERAL').trim() || 'GENERAL';
    const grp = getProductSubgroup(prod);

    let subMap = catMap.get(mainCat);
    if (!subMap) {
      subMap = new Map();
      catMap.set(mainCat, subMap);
    }

    let grpMap = subMap.get(subCat);
    if (!grpMap) {
      grpMap = new Map();
      subMap.set(subCat, grpMap);
    }

    const list = grpMap.get(grp);
    if (list) {
      list.push(prod);
    } else {
      grpMap.set(grp, [prod]);
    }
  }

  const tree: CatalogCategoryNode[] = [];
  for (const mainCat of MAIN_CATALOG_CATEGORIES) {
    const subMap = catMap.get(mainCat);
    if (!subMap) continue;

    const subcategories: CatalogSubcategoryNode[] = Array.from(subMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([subName, grpMap]) => {
        const groups: CatalogGroupNode[] = Array.from(grpMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0], 'es'))
          .map(([grpName, items]) => ({
            id: `${mainCat}::${subName}::${grpName}`,
            name: grpName,
            count: items.length,
            products: items,
          }));

        const subCount = groups.reduce((acc, g) => acc + g.count, 0);
        return {
          id: `${mainCat}::${subName}`,
          name: subName,
          count: subCount,
          groups,
        };
      });

    const catCount = subcategories.reduce((acc, s) => acc + s.count, 0);
    if (catCount > 0) {
      tree.push({
        id: mainCat,
        name: mainCat,
        count: catCount,
        subcategories,
      });
    }
  }

  return tree;
}

export function filterCatalogProductsByHierarchy(
  products: SoftProduct[],
  filter: CatalogHierarchyFilter
): SoftProduct[] {
  const q = (filter.searchQuery || '').trim().toLowerCase();
  if (q) {
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        getProductSubgroup(p).toLowerCase().includes(q)
    );
  }

  return products.filter((p) => {
    if (getMainCatalogCategory(p.category) !== filter.category) return false;
    if (filter.subcategory && filter.subcategory !== 'Todas' && p.category !== filter.subcategory) {
      return false;
    }
    if (filter.group && filter.group !== 'Todos' && getProductSubgroup(p) !== filter.group) {
      return false;
    }
    return true;
  });
}
