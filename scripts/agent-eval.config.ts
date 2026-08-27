import "dotenv/config";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = process.env.BASE_URL ?? "http://localhost:4105";

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "@api": resolve(root, "app/api"),
      "server-only": resolve(root, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    include: ["scripts/agent-eval.ts"],
    environment: "node",
    env: {
      BASE_URL: appUrl,
      PORT: new URL(appUrl).port,
    },
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
