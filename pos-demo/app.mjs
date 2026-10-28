import { closeOrder, createInitialState, createOrder, transitionOrder } from "./core.mjs";
import { DEMO_STORAGE_KEY, loadDemoState, resetDemoStorage, saveDemoState } from "./storage.mjs";

const root = document.querySelector("#app-view");
const catalogResponse = await fetch("./data/demo-catalog.json");
if (!catalogResponse.ok) throw new Error("No se pudo cargar el catálogo sintético.");
const catalog = await catalogResponse.json();
let state = loadDemoState(window.localStorage, catalog);
let view = "sale";
let cart = [];
let toastTimer;

const pesos = (cents) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
function persist() { saveDemoState(window.localStorage, state); }
function notify(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function statusLabel(status) { return ({ sent: "Enviada", ready: "Lista", served: "Entregada", closed: "Cobrada" })[status]; }
function refresh() {
  document.querySelector("#order-count").textContent = String(state.orders.filter((order) => order.status !== "closed").length);
  document.querySelectorAll("[role=tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.view === view)));
  document.querySelector("#view-title").textContent = ({ sale: "Nueva venta", orders: "Comandas", cash: "Caja demo", stock: "Inventario demo" })[view];
  ({ sale: renderSale, orders: renderOrders, cash: renderCash, stock: renderStock })[view]();
}
function renderSale() {
  const total = cart.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  root.innerHTML = `<div class="sale-layout"><div><section class="panel"><h3>Datos de la comanda</h3><div class="field-grid"><div class="field"><label for="table">Mesa</label><select id="table">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Mesa ${i + 1}</option>`).join("")}</select></div><div class="field"><label for="waiter">Mesero</label><input id="waiter" value="Mesero Demo" autocomplete="off" /></div></div><div class="field" style="margin-top:10px"><label for="note">Nota para cocina (opcional)</label><input id="note" placeholder="Ej. Sin cebolla" /></div></section><section class="panel"><h3>Productos de prueba</h3><div class="product-grid">${catalog.products.map((product) => `<button class="product-card" type="button" data-add="${escapeHtml(product.id)}"><strong>${escapeHtml(product.name)}</strong><span>${pesos(product.priceCents)}</span></button>`).join("")}</div></section></div><section class="panel"><h3>Resumen</h3><div id="cart-lines">${cart.length ? cart.map((line) => `<div class="cart-line"><div><strong>${escapeHtml(line.name)}</strong><span class="secondary">${pesos(line.unitPriceCents)} c/u</span></div><div class="quantity-control"><button type="button" aria-label="Quitar ${escapeHtml(line.name)}" data-qty="${escapeHtml(line.productId)}" data-delta="-1">−</button><strong>${line.quantity}</strong><button type="button" aria-label="Agregar ${escapeHtml(line.name)}" data-qty="${escapeHtml(line.productId)}" data-delta="1">+</button></div></div>`).join("") : `<p class="empty">Agrega un producto para iniciar.</p>`}</div><div class="total-row"><span>Total</span><strong data-testid="cart-total">${pesos(total)}</strong></div><button id="send-order" class="primary-button" type="button" ${cart.length ? "" : "disabled"}>Enviar comanda</button></section></div>`;
  root.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => {
    const product = catalog.products.find((item) => item.id === button.dataset.add);
    const line = cart.find((item) => item.productId === product.id);
    if (line) line.quantity += 1;
    else cart.push({ productId: product.id, name: product.name, unitPriceCents: product.priceCents, quantity: 1 });
    renderSale();
  }));
  root.querySelectorAll("[data-qty]").forEach((button) => button.addEventListener("click", () => {
    const line = cart.find((item) => item.productId === button.dataset.qty);
    line.quantity += Number(button.dataset.delta);
    cart = cart.filter((item) => item.quantity > 0);
    renderSale();
  }));
  root.querySelector("#send-order").addEventListener("click", () => {
    try {
      state = createOrder(state, catalog, { table: Number(root.querySelector("#table").value), waiter: root.querySelector("#waiter").value, note: root.querySelector("#note").value, items: cart });
      persist(); cart = []; view = "orders"; refresh(); notify("Comanda demo enviada.");
    } catch (error) { notify(error.message); }
  });
}
function renderOrders() {
  const active = state.orders.filter((order) => order.status !== "closed").slice().reverse();
  const closed = state.orders.filter((order) => order.status === "closed").slice().reverse();
  root.innerHTML = active.length || closed.length ? [...active, ...closed].map((order) => `<article class="panel"><div class="order-line" style="padding-top:0"><div><strong>${escapeHtml(order.id)} · Mesa ${order.table}</strong><span class="secondary">${escapeHtml(order.waiter)} · ${pesos(order.totalCents)}</span></div><span class="status ${order.status}">${statusLabel(order.status)}</span></div><div class="secondary">${order.items.map((item) => `${item.quantity} × ${escapeHtml(item.name)}`).join(" · ")}</div>${order.note ? `<p class="note">Nota: ${escapeHtml(order.note)}</p>` : ""}<div class="action-row">${order.status === "sent" ? `<button class="action-button light" data-next="ready" data-order="${escapeHtml(order.id)}">Marcar lista</button>` : ""}${order.status === "ready" ? `<button class="action-button light" data-next="served" data-order="${escapeHtml(order.id)}">Marcar entregada</button>` : ""}${order.status === "served" ? `<button class="action-button gold" data-pay="cash" data-order="${escapeHtml(order.id)}">Cobrar efectivo</button><button class="action-button gold" data-pay="card" data-order="${escapeHtml(order.id)}">Cobrar tarjeta</button>` : ""}</div></article>`).join("") : `<section class="panel empty">Aún no hay comandas demo.</section>`;
  root.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => runAction(() => transitionOrder(state, button.dataset.order, button.dataset.next), "Estado de comanda actualizado.")));
  root.querySelectorAll("[data-pay]").forEach((button) => button.addEventListener("click", () => runAction(() => closeOrder(state, catalog, button.dataset.order, button.dataset.pay), "Cobro y descuento de receta simulados.")));
}
function renderCash() {
  const total = state.sales.reduce((sum, sale) => sum + sale.totalCents, 0);
  root.innerHTML = `<section class="panel"><h3>Resumen de caja · ficticio</h3><div class="summary-grid"><div class="metric"><span>Ventas demo</span><strong>${state.sales.length}</strong></div><div class="metric"><span>Total cobrado demo</span><strong>${pesos(total)}</strong></div></div></section><section class="panel"><h3>Movimientos</h3>${state.sales.length ? state.sales.slice().reverse().map((sale) => { const order = state.orders.find((item) => item.id === sale.orderId); return `<div class="sale-row"><div><strong>${escapeHtml(sale.id)}</strong><span class="secondary">${escapeHtml(sale.orderId)} · ${sale.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}</span></div><strong>${pesos(sale.totalCents)}</strong></div>`; }).join("") : `<p class="empty">Sin cobros demo por ahora.</p>`}</section>`;
}
function renderStock() {
  root.innerHTML = `<section class="panel"><h3>Existencias de prueba</h3>${catalog.ingredients.map((ingredient) => `<div class="stock-row"><div><strong>${escapeHtml(ingredient.name)}</strong><span class="stock-id">${escapeHtml(ingredient.id)}</span></div><div class="stock-qty">${state.stock[ingredient.id]} ${escapeHtml(ingredient.unit)}</div></div>`).join("")}<p class="note">El descuento ocurre al cobrar una comanda entregada, según la receta sintética.</p></section>`;
}
function runAction(action, message) {
  try { state = action(); persist(); refresh(); notify(message); }
  catch (error) { notify(error.message); }
}
document.querySelectorAll("[role=tab]").forEach((tab) => tab.addEventListener("click", () => { view = tab.dataset.view; refresh(); }));
document.querySelector("#reset-demo").addEventListener("click", () => {
  if (!window.confirm("¿Reiniciar todas las comandas, cobros e inventario ficticios de esta demo?")) return;
  state = resetDemoStorage(window.localStorage, catalog);
  cart = [];
  view = "sale";
  refresh();
  notify("Demo reiniciada.");
});
window.addEventListener("storage", (event) => {
  if (event.key === DEMO_STORAGE_KEY) { state = loadDemoState(window.localStorage, catalog); refresh(); }
});
if (!state || !state.stock) state = createInitialState(catalog);
refresh();
