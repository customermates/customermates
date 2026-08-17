import type { MetadataRoute } from "next";

import { headers } from "next/headers";

import { env } from "@/env";
import { isSubdomainHost } from "@/core/seo/public-host";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || headersList.get("x-forwarded-host") || "";

  const isSubdomainRequest = isSubdomainHost(host);

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
        allow: "/",
      },
    ],
    sitemap: `${env.BASE_URL}/sitemap.xml`,
  };
}
