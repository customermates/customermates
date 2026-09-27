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

describe("sitemap.xml", () => {
  it("renders per request, so a self-hosted image lists its runtime BASE_URL", () => {
    const urls = route
      .default()
      .flatMap((entry) => [entry.url, ...Object.values(entry.alternates?.languages ?? {}).map(String)]);

    expect(route.dynamic).toBe("force-dynamic");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => !url.startsWith("https://crm.example.com/"))).toEqual([]);
  });
});
