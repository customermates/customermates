import type { NextConfig } from "next";

import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";

import { env } from "@/env";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_INTL_CONFIG_PATH: "i18n/request.ts",
    SENTRY_DSN: env.SENTRY_DSN,
  },

  htmlLimitedBots: /.*/,

  devIndicators: {
    position: "bottom-right",
  },

  compress: true,

  experimental: {
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
            value: `frame-ancestors https://customermates.com https://test.customermates.com`,
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
  disableLogger: true,
  hideSourceMaps: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
};

const composed = withMDX(withNextIntl(nextConfig));

export default env.SENTRY_DSN ? withSentryConfig(composed, sentryOptions) : composed;
