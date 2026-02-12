import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "tsx server.ts",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: "postgresql://chess:chess@localhost:5432/chess_test",
      REDIS_URL: "redis://localhost:6379",
      RATE_LIMIT_GAME_CREATE_MAX: "1000",
    },
  },
});
