import { describe, expect, it } from "vitest";

import type { ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageTool, searchDocsTool } from "../docs.mcp-tools";
import { GET_STARTED_PROMPT } from "../server-instructions";

function search(args: { query: string; locale?: ContentLocale; source?: "docs" | "api" | "all" }) {
  return searchDocsTool.execute({ locale: "en", source: "docs", ...args });
}

function getPage(args: { slug: string; locale?: ContentLocale; source?: "docs" | "api" }) {
  return getDocsPageTool.execute({ locale: "en", source: "docs", ...args });
}

describe("search_docs", () => {
  it("ranks the webhooks page first for a webhook signature query", () => {
    const result = search({ query: "webhook signature" });
    expect(result).toContain("webhooks");
    expect(result.indexOf("webhooks")).toBeLessThan(result.indexOf("total"));
    expect(result).toContain("/en/docs/webhooks");
  });

  it("searches the German corpus when locale is de", () => {
    const result = search({ query: "Webhook", locale: "de" });
    expect(result).toContain("/de/docs/");
  });

  it("finds REST operations when source is api", () => {
    const result = search({ query: "contact", source: "api" });
    expect(result).toContain("/en/docs/openapi/");
  });

  it("returns an empty result with a hint for gibberish", () => {
    const result = search({ query: "zzqxvhjkwpl" });
    expect(result).toContain("total: 0");
    expect(result).toContain("hint");
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
    const result = getPage({ slug: "does-not-exist" });
    expect(result.startsWith("Validation error:")).toBe(true);
    expect(result).toContain("quickstart");
  });

  it("normalizes slugs with path prefix and extension", () => {
    const result = getPage({ slug: "/docs/webhooks.mdx" });
    expect(result).toContain("/en/docs/webhooks");
  });
});
