import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_STORAGE_KEY,
  loadDemoState,
  resetDemoStorage,
  saveDemoState,
} from "../storage.mjs";

const catalog = {
  products: [{ id: "DEMO-PROD-01", name: "Tostada Demo", category: "Demo", priceCents: 6500 }],
  ingredients: [{ id: "DEMO-ING-01", name: "Maiz Demo", unit: "pieza", initialQuantity: 10 }],
  recipes: [{ productId: "DEMO-PROD-01", ingredientId: "DEMO-ING-01", quantityPerUnit: 1 }],
};

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

test("missing or malformed demo storage starts a fresh state", () => {
  const storage = new MemoryStorage();

  assert.deepEqual(loadDemoState(storage, catalog), {
    schemaVersion: 1,
    orders: [],
    sales: [],
    stock: { "DEMO-ING-01": 10 },
    nextOrderNumber: 1,
  });

  storage.setItem(DEMO_STORAGE_KEY, "{malformed json");
  assert.deepEqual(loadDemoState(storage, catalog).stock, { "DEMO-ING-01": 10 });
  assert.deepEqual(loadDemoState(storage, catalog).orders, []);
});

test("unsupported or invalid saved schemas fall back to a fresh demo", () => {
  const storage = new MemoryStorage();
  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, orders: [], sales: [], stock: {} }));
  assert.equal(loadDemoState(storage, catalog).schemaVersion, 1);
  assert.deepEqual(loadDemoState(storage, catalog).stock, { "DEMO-ING-01": 10 });

  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, orders: "bad", sales: [], stock: {} }));
  assert.deepEqual(loadDemoState(storage, catalog).orders, []);
});

test("save and load round-trip only demo state", () => {
  const storage = new MemoryStorage();
  const state = {
    schemaVersion: 1,
    orders: [{
      id: "DEMO-001",
      table: 1,
      waiter: "Mesero Demo",
      note: "",
      status: "served",
      items: [{ productId: "DEMO-PROD-01", name: "Tostada Demo", quantity: 1, unitPriceCents: 6500 }],
      totalCents: 6500,
    }],
    sales: [],
    stock: { "DEMO-ING-01": 9 },
    nextOrderNumber: 2,
  };

  saveDemoState(storage, state);
  assert.deepEqual(loadDemoState(storage, catalog), state);
});

test("reset clears only the demo key and returns initial synthetic stock", () => {
  const storage = new MemoryStorage();
  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1 }));
  storage.setItem("other.site.data", "keep me");

  const reset = resetDemoStorage(storage, catalog);

  assert.equal(storage.getItem(DEMO_STORAGE_KEY), null);
  assert.equal(storage.getItem("other.site.data"), "keep me");
  assert.deepEqual(reset.stock, { "DEMO-ING-01": 10 });
  assert.deepEqual(reset.orders, []);
  assert.deepEqual(reset.sales, []);
});
