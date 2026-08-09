import type { HomepageRootMetadata } from "@/core/fumadocs/schemas/homepage";

import { describe, expect, it } from "vitest";

import { buildHomepageMetadata, GLOBAL_METADATA } from "../homepage-metadata";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

const BASE_URL = "http://localhost:4000";
const ROOT_METADATA: HomepageRootMetadata = {
  defaultDescription: "Deutsche Beschreibung",
  defaultTitle: "Customermates: Der vollständige deutsche SEO-Titel",
};

describe("global metadata", () => {
  it("contains only route-neutral defaults", () => {
    expect(GLOBAL_METADATA).toEqual({
      icons: { icon: "/favicon.ico" },
      metadataBase: new URL(BASE_URL),
      title: { default: "Customermates", template: "%s" },
    });
  });
});

describe("homepage metadata", () => {
  it("owns the localized long title, description, canonical, alternates, and social cards", () => {
    const metadata = buildHomepageMetadata({
      locale: "de",
      rootMetadata: ROOT_METADATA,
      translatedLocales: CONTENT_LOCALES,
    });
    const image =
      "/og/image.png?description=Deutsche+Beschreibung&title=Customermates%3A+Der+vollst%C3%A4ndige+deutsche+SEO-Titel";

    expect(metadata).toEqual({
      alternates: {
        canonical: `${BASE_URL}/de`,
        languages: {
          de: `${BASE_URL}/de`,
          en: `${BASE_URL}/en`,
          "x-default": `${BASE_URL}/en`,
        },
      },
      description: ROOT_METADATA.defaultDescription,
      openGraph: {
        description: ROOT_METADATA.defaultDescription,
        images: [image],
        siteName: "Customermates",
        title: ROOT_METADATA.defaultTitle,
        type: "website",
        url: `${BASE_URL}/de`,
      },
      title: { absolute: ROOT_METADATA.defaultTitle },
      twitter: {
        card: "summary_large_image",
        description: ROOT_METADATA.defaultDescription,
        images: [image],
        title: ROOT_METADATA.defaultTitle,
      },
    });
  });

  it("keeps the canonical without advertising a non-reciprocal one-locale alternate set", () => {
    const metadata = buildHomepageMetadata({
      locale: "en",
      rootMetadata: ROOT_METADATA,
      translatedLocales: [DEFAULT_LOCALE],
    });

    expect(metadata.alternates).toEqual({ canonical: `${BASE_URL}/en` });
  });
});
