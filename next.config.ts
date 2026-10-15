import type { NextConfig } from "next";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";
import { withWorkflow } from "workflow/next";

import { env } from "@/env";
import { permanentAliasRedirects } from "@/core/seo/route-aliases";
import { resolveBenchmarkBuildSource } from "@/scripts/agent-benchmark/build-source";
import { configureBenchmarkWorkflowWorld } from "@/scripts/agent-benchmark/workflow-world";
import { recordFileParserPackages } from "@/features/record-file-index/record-file-parser-packages";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

// The record file text parser runs in a worker thread that loads these packages from node_modules at run time,
// so the workflow function has to ship them and everything they depend on. Turbopack keeps every file an include
// glob matches, so folders a package never loads in Node (the browser bundles of exceljs) are left out here.
function packageTrees(names: string[], skipped: Record<string, string[]>, root = process.cwd()): string[] {
  const found = new Map<string, string>();
  const visit = (name: string, from: string) => {
    for (let directory = from; ; directory = dirname(directory)) {
      const candidate = join(directory, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) {
        const path = relative(root, candidate);
        if (path.startsWith("..") || found.has(path)) return;
        found.set(path, name);
        const manifest = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")) as {
          dependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
        };
        for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }))
          visit(dependency, candidate);
        return;
      }
      if (dirname(directory) === directory) return;
    }
  };
  for (const name of names) visit(name, root);
  return [...found].flatMap(([path, name]) => {
    const skip = skipped[name];
    if (!skip) return [`./${path}/**/*`];
    return readdirSync(join(root, path), { withFileTypes: true })
      .filter((entry) => !skip.includes(entry.name))
      .map((entry) => (entry.isDirectory() ? `./${path}/${entry.name}/**/*` : `./${path}/${entry.name}`));
  });
}

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
      ...packageTrees(recordFileParserPackages(), { exceljs: ["dist"] }),
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
    proxyClientMaxBodySize: Math.max(10 * 1024 * 1024, env.FILE_MAX_UPLOAD_BYTES + 1024 * 1024),
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
        source: "/:path((?!api/v1/files/[^/]+/content$).*)",
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
