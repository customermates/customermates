import path from "path";

import { defineConfig } from "vitest/config";

const aliases = {
  "@": path.resolve(__dirname, "."),
  "@api": path.resolve(__dirname, "./app/api"),
  "server-only": path.resolve(__dirname, "./tests/helpers/server-only.ts"),
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
            "components/data-view/__tests__/data-view-url-sync.test.ts",
            "app/[locale]/(protected)/__tests__/protected-layout.test.ts",
            "app/components/navigation/__tests__/navigation-switch.test.ts",
          ],
          server: { deps: { inline: [/next-intl/] } },
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: "dom",
          globals: true,
          environment: "jsdom",
          env: testEnvironment,
          include: [
            "app/[locale]/(protected)/company/components/company-settings/__tests__/company-settings-form.test.ts",
            "components/data-view/__tests__/data-view-url-sync.test.ts",
            "app/[locale]/(protected)/__tests__/protected-layout.test.ts",
            "app/components/navigation/__tests__/navigation-switch.test.ts",
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
