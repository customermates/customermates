import type { NextConfig } from "next";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
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
    cpus: 2,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    globalNotFound: true,
    serverSourceMaps: false,
    turbopackSourceMaps: false,
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

  productionBrowserSourceMaps: false,
  enablePrerenderSourceMaps: false,

  webpack(config, { dev }) {
    if (!dev) config.cache = { type: "memory" };
    return config;
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

export default async function configure(phase: string, context: { defaultConfig: NextConfig }) {
  // The production runner serves built CSS and does not ship the source graph.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    const { generateStyleSources, generatePublicStyles } = await import("@/scripts/generate-style-sources.mjs");
    generateStyleSources(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
    await generatePublicStyles(process.cwd(), phase === PHASE_DEVELOPMENT_SERVER);
  }
  const provider = process.env.NEXT_PUBLIC_ERROR_REPORTING_PROVIDER || "vercel";
  if (provider !== "off" && provider !== "vercel")
    throw new Error("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER must be off or vercel");
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
      (!process.env.ERROR_REPORTING_NOTIFICATION_EMAIL || !env.RESEND_API_KEY || !env.RESEND_OPERATOR_EMAIL)
    )
      throw new Error("Vercel error reporting requires notification email configuration");
    const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.ERROR_REPORTING_RELEASE ?? "";
    if (release && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(release))
      throw new Error("Invalid error reporting release commit");
    config = {
      ...nextConfig,
      generateBuildId: () => Promise.resolve(buildId),
      env: {
        ...nextConfig.env,
        NEXT_PUBLIC_ERROR_REPORTING_PROVIDER: provider,
        NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID: buildId,
        NEXT_PUBLIC_ERROR_REPORTING_RELEASE: release,
      },
    };
  }
  const composed = withWorkflow(withMDX(withNextIntl(config)));
  return composed(phase, context);
}
