// NOTE: trigger.dev's CLI uses jiti to evaluate this config before `.env` is loaded,
// so importing `./env` (which runs strict validation) fails at config-load time.
// Load .env manually with dotenv, then read raw process.env — this file is the
// boot bootstrap, not application code.
import "dotenv/config";

import { defineConfig } from "@trigger.dev/sdk/v3";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";

const sentryConfigured = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

if (!process.env.TRIGGER_PROJECT_REF)
  throw new Error("TRIGGER_PROJECT_REF is not set. Add it to your .env (see .env.cloud.template).");

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF,
  runtime: "node",
  logLevel: "info",
  maxDuration: 300,
  dirs: ["./trigger"],
  build: {
    conditions: ["react-server"],
    extensions: sentryConfigured
      ? [
          esbuildPlugin(
            sentryEsbuildPlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              telemetry: false,
            }),
            { placement: "last", target: "deploy" },
          ),
        ]
      : [],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
});
