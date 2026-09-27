import { describe, expect, it, vi } from "vitest";

vi.mock("../route-source-map", () => {
  const pages = new Map([
    ["pricing|en", { data: { description: "Plans and pricing", title: "Pricing" } }],
    ["pricing|de", { data: { description: "Pläne und Preise", title: "Preise" } }],
    ["auth/signup|en", { data: { description: "Create an account", title: "Sign up" } }],
    ["docs/openapi/contacts|en", { data: { description: "Contacts API", title: "Contacts" } }],
    ["best-crm|en", { data: { description: "", title: "Best CRM" } }],
    [
      "long-title|en",
      { data: { description: "A long title", title: "Customer Relationship Management for Growing Agencies" } },
    ],
    ["contact|en", { data: { description: "Talk to us", title: "Contact Customermates" } }],
    ["untitled|en", { data: { description: "Body without a title", title: "   " } }],
  ]);
  const source = {
    getPage: (path: string[], locale: string) => pages.get(`${path.join("/")}|${locale}`),
    getPages: () => [],
  };

  return {
    ROUTE_SOURCE_MAP: {
      "/blog/:slug": { path: [":slug"], source },
      "/auth/signup": { path: ["auth", "signup"], source },
      "/docs/openapi/:slug": { path: ["docs", "openapi", ":slug"], source },
      "/imprint": { path: ["imprint"], source },
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
        siteName: "Customermates",
        title: "Pricing",
        type: "website",
        url: `${BASE_URL}/en/pricing`,
      },
      title: "Pricing | Customermates",
      twitter: {
        card: "summary_large_image",
        description: "Plans and pricing",
        images: [image],
        title: "Pricing",
      },
    });
  });

  it("brands the document title only, leaving the social card title to the site name", () => {
    const metadata = generateMetadataFromMeta({ locale: "de", route: "/pricing" });

    expect(metadata.title).toBe("Preise | Customermates");
    expect(metadata.openGraph?.title).toBe("Preise");
    expect(metadata.twitter?.title).toBe("Preise");
  });

  it("leaves a title unbranded when the brand would push it past the search result limit", () => {
    const metadata = generateMetadataFromMeta({ locale: "en", params: { slug: "long-title" }, route: "/blog/:slug" });

    expect(metadata.title).toBe("Customer Relationship Management for Growing Agencies");
  });

  it("never repeats the brand in a title that already names it", () => {
    const metadata = generateMetadataFromMeta({ locale: "en", params: { slug: "contact" }, route: "/blog/:slug" });

    expect(metadata.title).toBe("Contact Customermates");
  });

  it("brands a paginated title after its page suffix", () => {
    const metadata = generateMetadataFromMeta({ locale: "en", route: "/pricing", titleSuffix: "Page 2" });

    expect(metadata.title).toBe("Pricing - Page 2 | Customermates");
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
    expect(metadata.title).toBe("Best CRM | Customermates");
    expect(metadata.description).toBeUndefined();
  });

  it("sends a slug with no page to the 404, never to a canonical-less 200", () => {
    expect(() =>
      generateMetadataFromMeta({
        locale: "de",
        params: { slug: "best-crm" },
        route: "/blog/:slug",
      }),
    ).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    expect(() =>
      generateMetadataFromMeta({
        locale: "en",
        params: { slug: "nope" },
        route: "/blog/:slug",
      }),
    ).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("sends a dynamic route invoked without its params to the 404", () => {
    expect(() => generateMetadataFromMeta({ locale: "en", route: "/blog/:slug" })).toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });

  it("refuses to build metadata for a static route no content page backs", () => {
    expect(
      () => generateMetadataFromMeta({ locale: "en", route: "/imprint" }),
      "a mapped route with no page is a build-time bug; returning {} shipped 206 canonical-less URLs",
    ).toThrow(/No content page backs \/imprint in locale en/);
  });

  it("sends a locale that publishes no content to the 404 rather than failing the build", () => {
    expect(
      () => generateMetadataFromMeta({ locale: "fr", route: "/pricing" }),
      "fr is a routing-only locale, so a request for it is a bad URL and not a build bug",
    ).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("uses default-locale metadata for a noindex app route in a routing-only locale", () => {
    const metadata = generateMetadataFromMeta({ locale: "fr", route: "/auth/signup" });

    expect(metadata.title).toBe("Sign up | Customermates");
    expect(metadata.description).toBe("Create an account");
    expect(metadata.alternates).toEqual({ canonical: `${BASE_URL}/fr/auth/signup` });
    expect(metadata.robots).toEqual({ follow: true, index: false });
  });

  it("refuses a page whose title is blank", () => {
    expect(() =>
      generateMetadataFromMeta({
        locale: "en",
        params: { slug: "untitled" },
        route: "/blog/:slug",
      }),
    ).toThrow(/has no title/);
  });

  it("does not fall back to English for noindex content in an application-only locale", () => {
    expect(() =>
      generateMetadataFromMeta({
        locale: "fr",
        params: { slug: "contacts" },
        route: "/docs/openapi/:slug",
      }),
    ).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
