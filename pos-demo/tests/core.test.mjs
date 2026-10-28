import test from "node:test";
import assert from "node:assert/strict";
import {
  closeOrder,
  createInitialState,
  createOrder,
  resetDemo,
  transitionOrder,
} from "../core.mjs";

const catalog = {
  products: [
    { id: "DEMO-PROD-01", name: "Tostada Demo", category: "Prueba", priceCents: 6500 },
    { id: "DEMO-PROD-02", name: "Agua Demo", category: "Prueba", priceCents: 2000 },
  ],
  ingredients: [
    { id: "DEMO-ING-01", name: "Maíz Demo", unit: "pieza", initialQuantity: 10 },
    { id: "DEMO-ING-02", name: "Queso Demo", unit: "g", initialQuantity: 500 },
  ],
  recipes: [
    { productId: "DEMO-PROD-01", ingredientId: "DEMO-ING-01", quantityPerUnit: 1 },
    { productId: "DEMO-PROD-01", ingredientId: "DEMO-ING-02", quantityPerUnit: 30 },
  ],
};

function sendDemoOrder(state) {
  return createOrder(state, catalog, {
    table: 1,
    waiter: "Mesero Demo",
    note: "Sin picante",
    items: [{ productId: "DEMO-PROD-01", quantity: 2 }],
  });
}

test("initial state clones the synthetic opening stock", () => {
  const state = createInitialState(catalog);

  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.stock, { "DEMO-ING-01": 10, "DEMO-ING-02": 500 });
  assert.equal(state.orders.length, 0);
  assert.equal(state.sales.length, 0);
  assert.notEqual(state.stock, createInitialState(catalog).stock);
});

test("new orders snapshot product name and integer price totals", () => {
  const initial = createInitialState(catalog);
  const state = sendDemoOrder(initial);
  const order = state.orders[0];

  assert.equal(order.id, "DEMO-001");
  assert.equal(order.status, "sent");
  assert.equal(order.items[0].name, "Tostada Demo");
  assert.equal(order.items[0].unitPriceCents, 6500);
  assert.equal(order.totalCents, 13000);
  assert.equal(initial.orders.length, 0);
});

test("commands advance sent to ready to served and reject skipped states", () => {
  const state = sendDemoOrder(createInitialState(catalog));
  const orderId = state.orders[0].id;

  assert.throws(() => transitionOrder(state, orderId, "served"), /transici[oó]n/i);
  const ready = transitionOrder(state, orderId, "ready");
  const served = transitionOrder(ready, orderId, "served");
  assert.equal(served.orders[0].status, "served");
  assert.equal(state.orders[0].status, "sent");
});

test("closing a served order records a demo sale and deducts recipe quantities", () => {
  const sent = sendDemoOrder(createInitialState(catalog));
  const ready = transitionOrder(sent, sent.orders[0].id, "ready");
  const served = transitionOrder(ready, ready.orders[0].id, "served");
  const closed = closeOrder(served, catalog, served.orders[0].id, "cash");

  assert.equal(closed.orders[0].status, "closed");
  assert.equal(closed.sales.length, 1);
  assert.equal(closed.sales[0].totalCents, 13000);
  assert.equal(closed.sales[0].paymentMethod, "cash");
  assert.equal(closed.stock["DEMO-ING-01"], 8);
  assert.equal(closed.stock["DEMO-ING-02"], 440);
  assert.equal(served.stock["DEMO-ING-01"], 10);
});

test("insufficient synthetic stock rejects the sale without mutating state", () => {
  const sent = sendDemoOrder(createInitialState(catalog));
  const ready = transitionOrder(sent, sent.orders[0].id, "ready");
  const served = transitionOrder(ready, ready.orders[0].id, "served");
  const shortStock = { ...served, stock: { ...served.stock, "DEMO-ING-01": 1 } };
  const before = structuredClone(shortStock);

  assert.throws(() => closeOrder(shortStock, catalog, shortStock.orders[0].id, "cash"), /existencias/i);
  assert.deepEqual(shortStock, before);
});

test("unknown products and invalid quantities cannot create orders", () => {
  const initial = createInitialState(catalog);

  assert.throws(() => createOrder(initial, catalog, {
    table: 1, waiter: "Mesero Demo", note: "", items: [{ productId: "NO-EXISTE", quantity: 1 }],
  }), /producto/i);
  assert.throws(() => createOrder(initial, catalog, {
    table: 1, waiter: "Mesero Demo", note: "", items: [{ productId: "DEMO-PROD-01", quantity: 0 }],
  }), /cantidad/i);
});

test("reset restores synthetic opening stock and clears all demo transactions", () => {
  const sent = sendDemoOrder(createInitialState(catalog));
  const ready = transitionOrder(sent, sent.orders[0].id, "ready");
  const served = transitionOrder(ready, ready.orders[0].id, "served");
  const closed = closeOrder(served, catalog, served.orders[0].id, "cash");
  const reset = resetDemo(catalog);

  assert.deepEqual(reset.stock, { "DEMO-ING-01": 10, "DEMO-ING-02": 500 });
  assert.equal(reset.orders.length, 0);
  assert.equal(reset.sales.length, 0);
  assert.equal(closed.sales.length, 1);
});
