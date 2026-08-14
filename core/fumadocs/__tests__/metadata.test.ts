import { describe, expect, it, vi } from "vitest";

vi.mock("../route-source-map", () => {
  const pages = new Map([
    ["pricing|en", { data: { description: "Plans and pricing", title: "Pricing" } }],
    ["pricing|de", { data: { description: "Pläne und Preise", title: "Preise" } }],
    ["best-crm|en", { data: { description: "", title: "Best CRM" } }],
    ["untitled|en", { data: { description: "Body without a title", title: "   " } }],
  ]);
  const source = {
    getPage: (path: string[], locale: string) => pages.get(`${path.join("/")}|${locale}`),
    getPages: () => [],
  };

  return {
    ROUTE_SOURCE_MAP: {
      "/blog/:slug": { path: [":slug"], source },
      "/pricing": { path: ["pricing"], source },
    },
  };
});

import { generateMetadataFromMeta } from "../metadata";

const BASE_URL = "http://localhost:4000";

describe("generateMetadataFromMeta", () => {
  it("emits the canonical, reciprocal alternates, and social cards for a translated static route", () => {
    const image = {
      alt: "Pricing",
      height: 630,
      url: "/og/image.png?title=Pricing&description=Plans+and+pricing",
      width: 1200,
    };

    expect(generateMetadataFromMeta({ locale: "en", route: "/pricing" })).toEqual({
      alternates: {
        canonical: `${BASE_URL}/en/pricing`,
        languages: {
          de: `${BASE_URL}/de/pricing`,
          en: `${BASE_URL}/en/pricing`,
          "x-default": `${BASE_URL}/en/pricing`,
        },
      },
      description: "Plans and pricing",
      openGraph: {
        description: "Plans and pricing",
        images: [image],
        title: "Pricing",
        type: "website",
      },
      title: "Pricing",
      twitter: {
        card: "summary_large_image",
        description: "Plans and pricing",
        images: [image],
        title: "Pricing",
      },
    });
  });

  it("keeps the canonical on the requested locale", () => {
    const metadata = generateMetadataFromMeta({
      locale: "de",
      route: "/pricing",
    });

    expect(metadata.alternates?.canonical).toBe(`${BASE_URL}/de/pricing`);
  });

  it("applies a paginated public path to the canonical and every alternate", () => {
    const metadata = generateMetadataFromMeta({
      canonicalPath: "/pricing?page=2",
      locale: "en",
      route: "/pricing",
    });

    expect(metadata.alternates).toEqual({
      canonical: `${BASE_URL}/en/pricing?page=2`,
      languages: {
        de: `${BASE_URL}/de/pricing?page=2`,
        en: `${BASE_URL}/en/pricing?page=2`,
        "x-default": `${BASE_URL}/en/pricing?page=2`,
      },
    });
  });

  it("substitutes params into dynamic routes and drops non-reciprocal alternates", () => {
    const metadata = generateMetadataFromMeta({
      locale: "en",
      params: { slug: "best-crm" },
      route: "/blog/:slug",
    });

    expect(metadata.alternates).toEqual({
      canonical: `${BASE_URL}/en/blog/best-crm`,
    });
    expect(metadata.title).toBe("Best CRM");
    expect(metadata.description).toBeUndefined();
  });

  it("returns empty metadata when the localized page is missing", () => {
    expect(
      generateMetadataFromMeta({
        locale: "de",
        params: { slug: "best-crm" },
        route: "/blog/:slug",
      }),
    ).toEqual({});
    expect(
      generateMetadataFromMeta({
        locale: "en",
        params: { slug: "nope" },
        route: "/blog/:slug",
      }),
    ).toEqual({});
  });

  it("returns empty metadata for a dynamic route invoked without its params", () => {
    expect(generateMetadataFromMeta({ locale: "en", route: "/blog/:slug" })).toEqual({});
  });

  it("returns empty metadata when the page title is blank", () => {
    expect(
      generateMetadataFromMeta({
        locale: "en",
        params: { slug: "untitled" },
        route: "/blog/:slug",
      }),
    ).toEqual({});
  });
});
