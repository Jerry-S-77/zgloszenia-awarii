import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8081", trace: "retain-on-failure" },
  projects: [{ name: "telefon", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
