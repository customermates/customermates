import type { NextConfig } from "next";

import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";
import { withWorkflow } from "workflow/next";

import { env } from "@/env";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_INTL_CONFIG_PATH: "i18n/request.ts",
  },

  htmlLimitedBots: /.*/,

  devIndicators: {
    position: "bottom-right",
  },

  compress: true,

  experimental: {
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

export default env.NEXT_PUBLIC_SENTRY_DSN ? withSentryConfig(composed, sentryOptions) : composed;
