import type { NextConfig } from "next";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";
import { withWorkflow } from "workflow/next";

import { env } from "@/env";
import { permanentAliasRedirects } from "@/core/seo/route-aliases";
import { movedProtectedRouteRedirects } from "@/i18n/routing";
import { resolveBenchmarkBuildSource } from "@/scripts/agent-benchmark/build-source";
import { configureBenchmarkWorkflowWorld } from "@/scripts/agent-benchmark/workflow-world";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

const agentBenchmarkBuildSource = resolveBenchmarkBuildSource();
if (process.env.LOCAL_AGENT_BENCHMARK === "true") configureBenchmarkWorkflowWorld();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client-runtime-utils"],

  env: {
    NEXT_INTL_CONFIG_PATH: "i18n/request.ts",
    AGENT_BENCHMARK_BUILD_SOURCE: agentBenchmarkBuildSource,
  },

  htmlLimitedBots: /.*/,

  devIndicators: process.env.CRM_LOCAL_TEST_TRANSPORT === "true" ? false : { position: "top-left" },

  compress: true,

  outputFileTracingIncludes: {
    "/.well-known/workflow/v1/flow": [
      "./node_modules/quickjs-wasi/package.json",
      "./node_modules/quickjs-wasi/dist/*.js",
      "./node_modules/quickjs-wasi/quickjs.wasm",
    ],
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    ...(process.env.CRM_LOCAL_TEST_TRANSPORT === "true" ? { turbopackFileSystemCacheForDev: false } : {}),
    globalNotFound: true,
    serverActions: {
      bodySizeLimit: "25mb",
    },
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "react-grid-layout",
      "mobx",
      "mobx-react-lite",
      "zod",
      "framer-motion",
      "fumadocs-ui",
      "lodash",
    ],
  },

  // Next runs config redirects before the proxy middleware, so a retired URL answers with a single
  // clean 308 rather than chaining through locale negotiation. Public entries come from
  // PERMANENT_ROUTE_ALIASES, which the sitemap and its test read from the same declaration;
  // moved signed-in pages come from MOVED_PROTECTED_ROUTES.
  redirects() {
    return Promise.resolve([...permanentAliasRedirects(), ...movedProtectedRouteRedirects()]);
  },

  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              env.APP_MODE === "demo"
                ? "frame-ancestors 'self' https://customermates.com https://*.customermates.com"
                : "frame-ancestors 'self'",
          },
        ],
      },
    ]);
  },
};

const sentryOptions = {
  org: env.SENTRY_ORG,
  project: env.SENTRY_PROJECT,
  authToken: env.SENTRY_AUTH_TOKEN,
  silent: !env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
};

const composed = withWorkflow(withMDX(withNextIntl(nextConfig)));

export default async function configure(phase: string, context: { defaultConfig: NextConfig }) {
  // The production runner serves built CSS and does not ship the source graph.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    const { generateStyleSources, generatePublicStyles } = await import("@/scripts/generate-style-sources.mjs");
    generateStyleSources(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
    await generatePublicStyles(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
  }
  const configured = env.NEXT_PUBLIC_SENTRY_DSN ? withSentryConfig(composed, sentryOptions) : composed;
  return configured(phase, context);
}
