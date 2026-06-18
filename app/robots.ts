import type { MetadataRoute } from "next";

import { headers } from "next/headers";

import { env } from "@/env";

function isSubdomain(host: string): boolean {
  const parts = host.split(".");
  const isLocalhost = host.includes("localhost");

  if (isLocalhost) return false;

  return parts.length > 2;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || headersList.get("x-forwarded-host") || "";

  const isSubdomainRequest = isSubdomain(host);

  if (isSubdomainRequest) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        crawlDelay: 10,
      },
    ],
    sitemap: `${env.BASE_URL}/sitemap.xml`,
  };
}
