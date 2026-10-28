import { test, expect } from "@playwright/test";

test("flujo de venta demo, inventario y reinicio en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/pos-demo/");

  await expect(page.getByRole("heading", { name: "POS Barbachu" })).toBeVisible();
  await expect(page.getByText("DEMO · DATOS FICTICIOS · NO USAR PARA VENTAS")).toBeVisible();
  await page.getByLabel("Mesa").selectOption("4");
  await page.getByLabel("Mesero").fill("Mesero Prueba");
  await page.getByRole("button", { name: /Tostada Demo/ }).click();
  const touchHeights = await page.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.min(...touchHeights)).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("cart-total")).toContainText("$65.00");
  await page.getByRole("button", { name: "Enviar comanda" }).click();

  await page.getByRole("tab", { name: "Comandas" }).click();
  await expect(page.getByText("DEMO-001")).toBeVisible();
  await page.getByRole("button", { name: "Marcar lista" }).click();
  await page.getByRole("button", { name: "Marcar entregada" }).click();
  await page.getByRole("button", { name: "Cobrar efectivo" }).click();

  await page.getByRole("tab", { name: "Caja" }).click();
  await expect(page.getByText("$65.00").first()).toBeVisible();
  await page.getByRole("tab", { name: "Inventario" }).click();
  await expect(page.locator(".stock-row").filter({ hasText: "Maiz Demo" })).toContainText("19 pieza");
  await expect(page.locator(".stock-row").filter({ hasText: "Queso Demo" })).toContainText("770 g");
  await page.locator("#toast").evaluate((toast) => { toast.classList.remove("show"); toast.style.display = "none"; });
  await page.screenshot({ path: "test-results/pos-demo-mobile.png", fullPage: true });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reiniciar demo" }).click();
  await page.getByRole("tab", { name: "Inventario" }).click();
  await expect(page.locator(".stock-row").filter({ hasText: "Maiz Demo" })).toContainText("20 pieza");
  await page.getByRole("tab", { name: "Comandas" }).click();
  await expect(page.getByText("Aún no hay comandas demo.")).toBeVisible();
});

test("la demo conserva un ancho mínimo utilizable sin desbordamiento horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/pos-demo/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
