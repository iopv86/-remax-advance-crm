import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Targets are projects, not env vars: `FOO=bar playwright test` is POSIX syntax
  // that npm hands to cmd.exe on Windows, where it fails outright rather than
  // setting anything. PLAYWRIGHT_BASE_URL still overrides both when it is set.
  projects: [
    { name: "local", use: { ...devices["Desktop Chrome"] } },
    {
      name: "prod",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://remax-advance-crm.vercel.app",
      },
    },
  ],
});
