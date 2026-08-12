import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./web/korg-editor/tests",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true
  },
  webServer: {
    command: "python3 -m http.server 4173 --directory web/korg-editor",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
});
