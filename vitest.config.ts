import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_MODE: "self-hosted",
      BASE_URL: "http://localhost:4000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/customermates_test",
    },
    environment: "node",
    exclude: ["node_modules", ".next", "generated"],
    globals: true,
    include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@api": path.resolve(__dirname, "./app/api"),
    },
  },
});
