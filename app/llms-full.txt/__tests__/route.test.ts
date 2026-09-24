import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://crm.example.com" } };
});

import * as route from "../route";

import { PERMANENT_ROUTE_ALIASES } from "@/core/seo/route-aliases";

describe("llms-full.txt", () => {
  it("renders per request, so a self-hosted image advertises its runtime BASE_URL", async () => {
    const text = await route.GET().text();

    expect((route as Record<string, unknown>).dynamic).not.toBe("force-static");
    expect(text).toContain("https://crm.example.com/llms.txt");
    expect(text).not.toContain("http://localhost:4000/api/v1/mcp");
    expect(text).not.toContain("http://localhost:4000/en/");
  }, 30_000);

  it("carries the expanded install snippets and agent-ready markdown instead of MDX components", async () => {
    const text = await route.GET().text();

    expect(text).not.toContain("<McpInstallSnippet");
    expect(text).not.toMatch(/<\/?(Steps|Step|Faq|FaqItem)\b/);
    expect(text).not.toContain("{/*");
    expect(text).toContain("claude mcp add --transport http customermates https://crm.example.com/api/v1/mcp");
    expect(text).toContain('"x-api-key": "YOUR_KEY"');
    expect(text).not.toContain("<your-api-key>");
  }, 30_000);

  it("names canonical page URLs as sources, never a redirecting alias", async () => {
    const text = await route.GET().text();
    const sources = [...text.matchAll(/^Source: (.+)$/gm)].map((match) => new URL(match[1]));

    expect(sources.length).toBeGreaterThan(1);
    expect(sources.map((url) => url.origin)).toEqual(sources.map(() => "https://crm.example.com"));
    expect(sources[0].pathname).toBe("/en/docs");
    for (const url of sources) expect(Object.keys(PERMANENT_ROUTE_ALIASES)).not.toContain(url.pathname.slice(3));
  }, 30_000);
});
