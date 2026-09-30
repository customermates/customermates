import type { NextConfig } from "next";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";
import { withWorkflow } from "workflow/next";

import { env } from "@/env";
import { permanentAliasRedirects } from "@/core/seo/route-aliases";
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

  devIndicators: {
    position: "top-left",
  },

  compress: true,

  images: {
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
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
  // clean 308 rather than chaining through locale negotiation. Every entry comes from
  // PERMANENT_ROUTE_ALIASES, which the sitemap and its test read from the same declaration.
  redirects() {
    return Promise.resolve(permanentAliasRedirects());
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

export default async function configure(phase: string, context: { defaultConfig: NextConfig }) {
  // The production runner serves built CSS and does not ship the source graph.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    const { generateStyleSources, generatePublicStyles } = await import("@/scripts/generate-style-sources.mjs");
    generateStyleSources(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
    await generatePublicStyles(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
  }
  const provider = process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER ?? "sentry";
  if (provider !== "sentry" && provider !== "vercel")
    throw new Error("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER must be sentry or vercel");
  let config = nextConfig;
  if (provider === "vercel") {
    const buildId =
      phase === PHASE_PRODUCTION_BUILD
        ? (process.env.ERROR_REPORTING_BUILD_ID ??= randomUUID())
        : phase === PHASE_DEVELOPMENT_SERVER
          ? "local-development"
          : readFileSync(".next/BUILD_ID", "utf8").trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(buildId)) throw new Error("Invalid error reporting build ID");
    if (
      process.env.VERCEL &&
      (!process.env.BLOB_READ_WRITE_TOKEN ||
        !process.env.ERROR_REPORTING_NOTIFICATION_EMAIL ||
        !env.RESEND_API_KEY ||
        !env.RESEND_OPERATOR_EMAIL)
    )
      throw new Error("Vercel error reporting requires private Blob storage and notification email configuration");
    config = {
      ...nextConfig,
      experimental: { ...nextConfig.experimental, serverSourceMaps: true },
      productionBrowserSourceMaps: true,
      generateBuildId: () => Promise.resolve(buildId),
      env: {
        ...nextConfig.env,
        NEXT_PUBLIC_ERROR_REPORTING_PROVIDER: provider,
        NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID: buildId,
      },
    };
  }
  const composed = withWorkflow(withMDX(withNextIntl(config)));
  const configured =
    provider === "sentry" && env.NEXT_PUBLIC_SENTRY_DSN ? withSentryConfig(composed, sentryOptions) : composed;
  return configured(phase, context);
}
