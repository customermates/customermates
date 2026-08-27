import { describe, expect, it } from "vitest";

import type { ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageTool, searchDocsTool, type DocsSearchHit } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";
import { GET_STARTED_PROMPT } from "../server-instructions";

function search(args: { query: string; locale?: ContentLocale; source?: "docs" | "api" | "all" }) {
  return mcpToolResultText(searchDocsTool.execute({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

function getPage(args: { slug: string; query?: string; locale?: ContentLocale; source?: "docs" | "api" }) {
  return mcpToolResultText(getDocsPageTool.execute({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

describe("search_docs", () => {
  it("ranks the webhooks page first for a webhook signature query", () => {
    const result = search({ query: "webhook signature" });
    const raw = searchDocsTool.execute({ query: "webhook signature", locale: "en", source: "docs" });
    expect(result).toContain("webhooks");
    expect(result.indexOf("webhooks")).toBeLessThan(result.indexOf("total"));
    expect(raw).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining("/en/docs/webhooks") }),
        ]),
      },
    });
  });

  it("searches the German corpus when locale is de", () => {
    const result = searchDocsTool.execute({ query: "Webhook", locale: "de", source: "docs" });
    expect(result).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("/de/docs/") })]),
      },
    });
  });

  it("finds REST operations when source is api", () => {
    const result = searchDocsTool.execute({ query: "contact", locale: "en", source: "api" });
    expect(result).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining("/en/docs/openapi/") }),
        ]),
      },
    });
  });

  it("keeps every leading page candidate visible for a natural walkthrough query", () => {
    const result = search({ query: "Walk me through connecting WhatsApp to the Customermates inbox." }).slice(0, 512);

    expect(result).toContain("app-inbox");
    expect(result).toContain("app-profile");
  });

  it("returns an empty result with a hint for gibberish", () => {
    const result = search({ query: "zzqxvhjkwpl" });
    expect(result).toContain("total=0");
    expect(result).toContain("hint");
  });

  it("keeps full ranked hits in structured content while bounding model-facing text", () => {
    const result = searchDocsTool.execute({ query: "webhook", locale: "en", source: "docs" });

    expect(mcpToolResultText(result as McpToolResult).length).toBeLessThanOrEqual(500);
    expect(result).toMatchObject({ structuredContent: { total: expect.any(Number) } });
    const hits = (result as { structuredContent: { results: DocsSearchHit[] } }).structuredContent.results;
    expect(hits.slice(0, 2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("/en/docs/webhooks") })]),
    );
  });
});

describe("get_docs_page", () => {
  it("returns markdown with title, canonical url, and no frontmatter", () => {
    const result = getPage({ slug: "webhooks" });
    expect(result.startsWith("# ")).toBe(true);
    expect(result).toContain("Canonical URL: ");
    expect(result).toContain("/en/docs/webhooks");
    expect(result).not.toMatch(/^---/m);
  });

  it("strips JSX components and no longer inlines the removed setup prompt", () => {
    const result = getPage({ slug: "connect-cli" });
    expect(result).not.toContain("<McpSetupPrompt");
    expect(result).not.toContain("<McpInstallSnippet");
    expect(result).not.toContain("Connected to my Customermates CRM via MCP");
  });

  it("exposes the get-started kickoff as a server-side prompt constant", () => {
    expect(GET_STARTED_PROMPT).toContain("Connected to my Customermates CRM via MCP");
  });

  it("lists valid slugs for an unknown slug", () => {
    const raw = getDocsPageTool.execute({ locale: "en", source: "docs", slug: "does-not-exist" });
    const result = mcpToolResultText(raw as McpToolResult);
    expect(result.startsWith("Validation error:")).toBe(true);
    expect(result).toContain("quickstart");
    expect(raw).toMatchObject({ failure: { kind: "validation" } });
  });

  it("normalizes slugs with path prefix and extension", () => {
    const result = getPage({ slug: "/docs/webhooks.mdx" });
    expect(result).toContain("/en/docs/webhooks");
  });

  it("puts the requested detail inside the bounded agent-visible prefix", () => {
    const result = getPage({
      slug: "app-profile",
      query: "Walk me through connecting WhatsApp to the Customermates inbox.",
    });
    const bounded = result.slice(0, 512);

    expect(bounded).toContain("nav-profile-connected-accounts");
    expect(bounded).toContain("profile-connected-accounts-connect");
    expect(bounded).toContain("WhatsApp");
  });

  it("keeps full-page behavior when no focused query is supplied", () => {
    const result = getPage({ slug: "app-profile" });

    expect(result).toContain("## Purpose");
    expect(result).toContain("## Related");
  });
});
