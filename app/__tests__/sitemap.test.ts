import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://crm.example.com" } };
});

vi.mock("@/core/fumadocs/route-source-map", () => {
  const source = {
    getPage: () => ({ data: {} }),
    getPages: (locale: string) => [{ url: `/${locale}/blog/first-post`, data: {} }],
  };

  return { ROUTE_SOURCE_MAP: new Proxy({}, { get: () => ({ path: [], source }) }) };
});

import * as route from "../sitemap";

import { PARTIAL_MARKETING_LOCALES, isMarketingPathPublished, stripLocalePrefix } from "@/i18n/locale-registry";

describe("sitemap.xml", () => {
  it("renders per request, so a self-hosted image lists its runtime BASE_URL", () => {
    const urls = route
      .default()
      .flatMap((entry) => [entry.url, ...Object.values(entry.alternates?.languages ?? {}).map(String)]);

    expect(route.dynamic).toBe("force-dynamic");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => !url.startsWith("https://crm.example.com/"))).toEqual([]);
  });

  it("lists a partial marketing locale only on its published paths, with reciprocal alternates there", () => {
    const entries = route.default();

    for (const locale of PARTIAL_MARKETING_LOCALES) {
      const prefix = `https://crm.example.com/${locale}`;
      const localized = entries.filter((entry) => entry.url === prefix || entry.url.startsWith(`${prefix}/`));
      expect(localized.length).toBeGreaterThan(0);

      for (const entry of localized) {
        const path = stripLocalePrefix(new URL(entry.url).pathname);
        expect(isMarketingPathPublished(locale, path), entry.url).toBe(true);
        expect(entry.alternates?.languages?.[locale]).toBe(entry.url);
      }

      for (const entry of entries) {
        const path = stripLocalePrefix(new URL(entry.url).pathname);
        const alternate = entry.alternates?.languages?.[locale];
        if (!isMarketingPathPublished(locale, path)) expect(alternate, entry.url).toBeUndefined();
      }
    }
  });
});
