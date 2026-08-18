import "dotenv/config";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
      BASE_URL: process.env.BASE_URL ?? "http://localhost:4000",
    },
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
