import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.mjs",
  reporter: [["list"], ["html", { outputFolder: "test-results/html", open: "never" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: { width: 360, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python -m http.server 4173 --directory ..",
    url: "http://127.0.0.1:4173/pos-demo/",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
