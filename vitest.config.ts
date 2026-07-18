import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
    exclude: ["node_modules", ".next", "generated"],
    env: {
      APP_MODE: "self-hosted",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@api": path.resolve(__dirname, "./app/api"),
    },
  },
});
