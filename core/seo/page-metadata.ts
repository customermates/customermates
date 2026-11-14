import type { Metadata } from "next";

import { env } from "@/env";
import { brandedTitle } from "@/core/seo/branded-title";
import { buildLocalePath } from "@/i18n/locale-registry";

export type PageMetadataInput = {
  description: string;
  languages?: Record<string, string>;
  locale: string;
  noindex?: boolean;
  publicPath: string;
  title: string;
  type?: "article" | "website";
};

export function buildPageMetadata({
  description,
  languages,
  locale,
  noindex = false,
  publicPath,
  title,
  type = "website",
}: PageMetadataInput): Metadata {
  const canonical = `${env.BASE_URL}${buildLocalePath(locale, publicPath)}`;
  const ogImageParams = new URLSearchParams({ title });

  if (description) ogImageParams.set("description", description);

  const image = {
    alt: title,
    height: 630,
    url: `/og/image.png?${ogImageParams.toString()}`,
    width: 1200,
  };

  const metadata: Metadata = {
    alternates: languages && !noindex ? { canonical, languages } : { canonical },
    ...(noindex ? { robots: { follow: true, index: false } } : {}),
    openGraph: {
      description,
      images: [image],
      siteName: "Customermates",
      title,
      type,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: [image],
      title,
    },
    title: brandedTitle(title),
  };

  if (description) metadata.description = description;

  return metadata;
}
