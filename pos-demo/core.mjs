const ALLOWED_TRANSITIONS = Object.freeze({
  sent: "ready",
  ready: "served",
});

function requireDemoCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.products) || !Array.isArray(catalog.ingredients) || !Array.isArray(catalog.recipes)) {
    throw new TypeError("El catálogo demo no tiene el formato esperado.");
  }
}

function requireOrder(state, orderId) {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error("No se encontró la comanda.");
  return order;
}

function validateItems(items, catalog) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Agrega al menos un producto a la comanda.");
  }

  return items.map((item) => {
    const product = catalog.products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new Error("No se encontró el producto demo.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new Error("La cantidad del producto debe ser un entero mayor que cero.");
    }
    if (!Number.isSafeInteger(product.priceCents) || product.priceCents <= 0) {
      throw new Error("El producto demo no tiene un precio válido.");
    }

    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
    };
  });
}

export function createInitialState(catalog) {
  requireDemoCatalog(catalog);
  const stock = Object.fromEntries(
    catalog.ingredients.map((ingredient) => [ingredient.id, ingredient.initialQuantity]),
  );

  return {
    schemaVersion: 1,
    orders: [],
    sales: [],
    stock,
    nextOrderNumber: 1,
  };
}

export function createOrder(state, catalog, { table, waiter, note = "", items } = {}) {
  requireDemoCatalog(catalog);
  if (!Number.isInteger(table) || table < 1) throw new Error("Selecciona una mesa demo válida.");
  if (typeof waiter !== "string" || waiter.trim() === "") throw new Error("Escribe el nombre del mesero demo.");

  const lines = validateItems(items, catalog);
  const orderNumber = Number(state.nextOrderNumber);
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) throw new Error("No se pudo asignar un folio demo.");

  const order = {
    id: `DEMO-${String(orderNumber).padStart(3, "0")}`,
    table,
    waiter: waiter.trim(),
    note: typeof note === "string" ? note.trim() : "",
    status: "sent",
    items: lines,
    totalCents: lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0),
  };

  return {
    ...state,
    orders: [...state.orders, order],
    nextOrderNumber: orderNumber + 1,
  };
}

export function transitionOrder(state, orderId, nextStatus) {
  const order = requireOrder(state, orderId);
  const expectedStatus = ALLOWED_TRANSITIONS[order.status];
  if (nextStatus !== expectedStatus) {
    throw new Error(`Transición no permitida para la comanda demo: ${order.status} → ${nextStatus}.`);
  }

  return {
    ...state,
    orders: state.orders.map((candidate) =>
      candidate.id === orderId ? { ...candidate, status: nextStatus } : candidate,
    ),
  };
}

export function closeOrder(state, catalog, orderId, paymentMethod) {
  requireDemoCatalog(catalog);
  const order = requireOrder(state, orderId);
  if (order.status !== "served") throw new Error("La comanda demo debe marcarse entregada antes de cobrar.");
  if (!["cash", "card"].includes(paymentMethod)) throw new Error("Selecciona efectivo o tarjeta demo.");

  const usage = new Map();
  for (const item of order.items) {
    const recipeRows = catalog.recipes.filter((recipe) => recipe.productId === item.productId);
    if (recipeRows.length === 0) throw new Error("El producto no tiene receta demo para simular inventario.");
    for (const recipe of recipeRows) {
      const ingredient = catalog.ingredients.find((candidate) => candidate.id === recipe.ingredientId);
      if (!ingredient || !Number.isFinite(recipe.quantityPerUnit) || recipe.quantityPerUnit <= 0) {
        throw new Error("La receta demo tiene un insumo o cantidad inválida.");
      }
      usage.set(ingredient.id, (usage.get(ingredient.id) ?? 0) + recipe.quantityPerUnit * item.quantity);
    }
  }

  const nextStock = { ...state.stock };
  for (const [ingredientId, quantity] of usage) {
    const available = nextStock[ingredientId];
    if (!Number.isFinite(available) || available < quantity) {
      throw new Error("No hay suficientes existencias demo para completar esta venta simulada.");
    }
    nextStock[ingredientId] = available - quantity;
  }

  const sale = {
    id: `DEMO-SALE-${String(state.sales.length + 1).padStart(3, "0")}`,
    orderId,
    totalCents: order.totalCents,
    paymentMethod,
  };

  return {
    ...state,
    stock: nextStock,
    orders: state.orders.map((candidate) =>
      candidate.id === orderId ? { ...candidate, status: "closed" } : candidate,
    ),
    sales: [...state.sales, sale],
  };
}

export function resetDemo(catalog) {
  return createInitialState(catalog);
}
