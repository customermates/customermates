import path from "path";

import { defineConfig } from "vitest/config";

const aliases = {
  "@": path.resolve(__dirname, "."),
  "@api": path.resolve(__dirname, "./app/api"),
};
const testEnvironment = {
  APP_MODE: "self-hosted",
  BASE_URL: "http://localhost:4000",
};

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
    exclude: ["node_modules", ".next", "generated"],
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          env: testEnvironment,
          include: ["**/__tests__/**/*.test.ts", "tests/conventions/*.test.ts"],
          exclude: [
            "node_modules",
            ".next",
            "generated",
            "app/[locale]/(protected)/company/components/company-settings/__tests__/company-settings-form.test.ts",
          ],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: "company-settings-dom",
          globals: true,
          environment: "jsdom",
          env: testEnvironment,
          include: [
            "app/[locale]/(protected)/company/components/company-settings/__tests__/company-settings-form.test.ts",
          ],
          exclude: ["node_modules", ".next", "generated"],
        },
      },
    ],
    env: testEnvironment,
  },
  resolve: {
    alias: aliases,
  },
});
