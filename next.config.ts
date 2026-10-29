import type { NextConfig } from "next";

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withWorkflow } from "workflow/next";

import { env } from "@/env";
import { frameAncestorsPolicy } from "@/core/config/environment";
import { permanentAliasRedirects, retiredAppRouteRedirects } from "@/core/seo/route-aliases";
import { recordFileParserPackages } from "@/features/record-file-index/record-file-parser-packages";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

// The record file text parser runs in a worker thread that loads these packages from node_modules at run time,
// so the workflow function, the route that reads a file given to Mate and the file preview route have to ship them
// and everything they depend on. Turbopack keeps every file an include glob matches, so folders a package never loads
// in Node (the browser bundles of exceljs) are left out here.
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

const recordFileParserTrees = packageTrees(recordFileParserPackages(), { exceljs: ["dist"] });

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client-runtime-utils"],

  env: {
    NEXT_INTL_CONFIG_PATH: "i18n/request.ts",
  },

  htmlLimitedBots: /.*/,

  devIndicators: process.env.CRM_LOCAL_TEST_TRANSPORT === "true" ? false : { position: "top-left" },

  compress: true,

  outputFileTracingIncludes: {
    "/.well-known/workflow/v1/flow": [
      "./node_modules/quickjs-wasi/package.json",
      "./node_modules/quickjs-wasi/dist/*.js",
      "./node_modules/quickjs-wasi/quickjs.wasm",
      ...recordFileParserTrees,
    ],
    "/api/agent/files/*/complete": recordFileParserTrees,
    "/api/v1/files/*/preview": recordFileParserTrees,
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    ...(process.env.CRM_LOCAL_TEST_TRANSPORT === "true" ? { turbopackFileSystemCacheForDev: false } : {}),
    cpus: 2,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    globalNotFound: true,
    serverSourceMaps: false,
    turbopackSourceMaps: false,
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Credential-scoped file content requests bypass body cloning; ordinary request buffering stays bounded.
    proxyClientMaxBodySize: 26 * 1024 * 1024,
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "react-grid-layout",
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
  // clean 308 rather than chaining through locale negotiation. The public entries come from
  // PERMANENT_ROUTE_ALIASES, which the sitemap and its test read from the same declaration; the app
  // entries send the URLs of the pre-record-model app to their current pages.
  redirects() {
    return Promise.resolve([...permanentAliasRedirects(), ...retiredAppRouteRedirects()]);
  },

  rewrites() {
    return Promise.resolve([
      { source: "/api/w/:workspace/v1/files/:id/content", destination: "/api/v1/files/:id/content" },
    ]);
  },

  headers() {
    return Promise.resolve([
      {
        source: "/:path((?!api/v1/files/[^/]+/content$).*)",
        headers: [{ key: "Content-Security-Policy", value: frameAncestorsPolicy(env.APP_MODE) }],
      },
      {
        source: "/maps/v1/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
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
    if (process.env.ERROR_REPORTING_NOTIFICATION_EMAIL && (!env.RESEND_API_KEY || !env.RESEND_OPERATOR_EMAIL))
      throw new Error("Vercel error reporting requires notification email configuration");
    if (Boolean(process.env.ERROR_REPORTING_WEBHOOK_URL) !== Boolean(process.env.ERROR_REPORTING_WEBHOOK_SECRET))
      throw new Error("Error reporting webhooks require both ERROR_REPORTING_WEBHOOK_URL and its signing secret");
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
