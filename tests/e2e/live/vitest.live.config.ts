import path from "node:path";

import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname, "../../..");

// Live Vitest checks against the Unipile development application; scripts/verify/live-checks.mjs starts them with the
// egress guard loaded and the fixture secrets in the environment.
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": root,
      "@api": path.resolve(root, "app/api"),
      "server-only": path.resolve(root, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/live/*.live.test.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: { APP_MODE: "cloud", BASE_URL: "http://localhost:4000", BETTER_AUTH_SECRET: "vitest-live-secret", POSTAL_CODE_DATA_URL: "off" },
    server: { deps: { inline: [/next-intl/] } },
  },
});
