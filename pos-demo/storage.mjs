import { createInitialState } from "./core.mjs";

export const DEMO_STORAGE_KEY = "barbachu.pos-demo.v1";

function isSafeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function isValidState(state, catalog) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.orders) || !Array.isArray(state.sales)) return false;
  if (!Number.isSafeInteger(state.nextOrderNumber) || state.nextOrderNumber < 1) return false;
  if (!state.stock || typeof state.stock !== "object" || Array.isArray(state.stock)) return false;

  for (const ingredient of catalog.ingredients) {
    if (!isSafeInteger(state.stock[ingredient.id])) return false;
  }

  const productIds = new Set(catalog.products.map((product) => product.id));
  const orderIds = new Set();
  for (const order of state.orders) {
    if (!order || typeof order.id !== "string" || orderIds.has(order.id)) return false;
    if (!Number.isInteger(order.table) || order.table < 1 || typeof order.waiter !== "string" || typeof order.note !== "string") return false;
    if (!["sent", "ready", "served", "closed"].includes(order.status) || !Array.isArray(order.items)) return false;
    if (!isSafeInteger(order.totalCents)) return false;
    for (const item of order.items) {
      if (!item || !productIds.has(item.productId) || typeof item.name !== "string") return false;
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || !isSafeInteger(item.unitPriceCents, 1)) return false;
    }
    orderIds.add(order.id);
  }

  for (const sale of state.sales) {
    if (!sale || typeof sale.id !== "string" || !orderIds.has(sale.orderId)) return false;
    if (!isSafeInteger(sale.totalCents) || !["cash", "card"].includes(sale.paymentMethod)) return false;
  }
  return true;
}

export function loadDemoState(storage, catalog) {
  const freshState = () => createInitialState(catalog);
  try {
    const stored = storage.getItem(DEMO_STORAGE_KEY);
    if (!stored) return freshState();
    const state = JSON.parse(stored);
    return isValidState(state, catalog) ? state : freshState();
  } catch {
    return freshState();
  }
}

export function saveDemoState(storage, state) {
  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function resetDemoStorage(storage, catalog) {
  storage.removeItem(DEMO_STORAGE_KEY);
  return createInitialState(catalog);
}
