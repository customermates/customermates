import "reflect-metadata";

import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import { createMDX } from "fumadocs-mdx/next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withMDX = createMDX({
  configPath: "./core/fumadocs/source.config.ts",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_INTL_CONFIG_PATH: "i18n/request.ts",
  },

  htmlLimitedBots: /.*/,

  devIndicators: {
    position: "top-left",
  },

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  compress: true,

  experimental: {
    optimizePackageImports: [
      "@heroui/react",
      "@heroicons/react",
      "recharts",
      "react-grid-layout",
      "mobx",
      "mobx-react-lite",
      "zod",
      "framer-motion",
      "@sentry/nextjs",
      "fumadocs-ui",
      "lodash",
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors https://customermates.com https://test.customermates.com`,
          },
        ],
      },
    ];
  },
};

const config = withMDX(withNextIntl(nextConfig));

export default withSentryConfig(config, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/error-monitoring",
  disableLogger: true,
  telemetry: false,
});
