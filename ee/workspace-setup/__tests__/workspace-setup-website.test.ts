import { describe, expect, it } from "vitest";

import { setupWebsiteSources, setupWebsiteText } from "../workspace-setup-website";

const source = (path: string, category: string, text = `${path} text`) => ({
  url: `https://studio.example${path}`,
  title: path,
  text,
  category,
});

describe("website text for setup drafts", () => {
  const crawl = [
    source("/", "about"),
    ...Array.from({ length: 18 }, (_value, index) => source(`/docs/${index}`, "help")),
    source("/privacy", "policy"),
    source("/features", "product"),
    source("/features/inbox", "product"),
    source("/pricing", "pricing"),
    source("/customers", "customers"),
    source("/imprint", "other"),
    source("/blog/launch", "blog"),
  ];

  it("reads the homepage, pricing, product, customer and company pages before help, blog and policy pages", () => {
    expect(setupWebsiteSources(crawl).map(({ title }) => title)).toEqual([
      "/",
      "/pricing",
      "/features",
      "/customers",
      "/imprint",
      "/features/inbox",
      ...Array.from({ length: 18 }, (_value, index) => `/docs/${index}`),
      "/blog/launch",
      "/privacy",
    ]);
  });

  it("caps each page and the whole text so many pages fit instead of a few long ones", () => {
    const long = crawl.map((entry) => ({ ...entry, text: "x".repeat(5_000) }));
    const text = setupWebsiteText(long, { characters: 10_000, perSource: 3_000 });
    expect(text.length).toBeLessThanOrEqual(10_000 + 3 * 2);
    expect(text.match(/^# /gmu)).toHaveLength(4);
    expect(text).toContain("# /pricing");
    expect(text).not.toContain("# /docs/0");
  });
});
