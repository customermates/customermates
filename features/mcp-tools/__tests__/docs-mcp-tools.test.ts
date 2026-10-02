import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageTool, listDocsSlugs, searchDocsTool, docsPageResult } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";
import { GET_STARTED_PROMPT } from "../server-instructions";
import { MCP_ALWAYS_ON_TOOLS } from "../tool-registry";

function getPage(args: { slug: string; locale?: ContentLocale; source?: "docs" | "api" }) {
  return mcpToolResultText(docsPageResult({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

describe("search_docs", () => {
  it("tells agents how to complete the relative app routes it returns", () => {
    expect(searchDocsTool.description).toMatch(
      /App routes in a snippet, such as `\/company\/subscription`, are relative/,
    );
  });

  it("describes its text result", () => {
    expect(searchDocsTool.description).toContain("the best page's url and its snippet in text");
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
    const raw = docsPageResult({ locale: "en", source: "docs", slug: "does-not-exist" });
    const result = mcpToolResultText(raw);
    expect(result.startsWith("Validation error:")).toBe(true);
    expect(result).toContain("quickstart");
    expect(raw).toMatchObject({ failure: { kind: "validation" } });
  });

  it("normalizes slugs with path prefix and extension", () => {
    const result = getPage({ slug: "/docs/webhooks.mdx" });
    expect(result).toContain("/en/docs/webhooks");
  });

  it("names only valid slugs in the slug examples", () => {
    const description = getDocsPageTool.inputSchema.shape.slug.description ?? "";
    const examples = [...description.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
    expect(examples.length).toBeGreaterThan(0);
    expect(listDocsSlugs("en", "docs")).toEqual(expect.arrayContaining(examples));
  });

  it("tells agents how to complete the relative app routes in the markdown", () => {
    expect(getDocsPageTool.description).toMatch(
      /App routes in the markdown, such as `\/company\/subscription`, are relative/,
    );
  });

  it("names every widget editor target of the Dashboard page in its tips for agents", () => {
    for (const locale of CONTENT_LOCALES) {
      const { markdown } = (
        docsPageResult({ slug: "app-dashboard", locale, source: "docs" }) as {
          structuredContent: { markdown: string };
        }
      ).structuredContent;
      const tipsStart = markdown.search(/^## (?:Tips for agents|Tipps für Agents)/m);
      const tipsEnd = markdown.indexOf("\n## ", tipsStart + 1);
      const tips = markdown.slice(tipsStart, tipsEnd === -1 ? undefined : tipsEnd);
      const targets = new Set(markdown.match(/widget-modal-[a-z-]+/g));
      expect(tipsStart, locale).toBeGreaterThan(-1);
      expect(targets.size, locale).toBeGreaterThan(0);
      for (const target of targets) expect(tips, `${locale} ${target}`).toContain(`#${target}`);
    }
  });

  it("describes the My Company sidebar entry as a toggle in its tips for agents", () => {
    for (const [locale, toggle] of [
      ["en", "`#nav-company` only expands or collapses the sidebar group"],
      ["de", "`#nav-company` klappt die Sidebar-Gruppe nur auf oder zu"],
    ] as const) {
      const { markdown } = (
        docsPageResult({ slug: "app-company", locale, source: "docs" }) as {
          structuredContent: { markdown: string };
        }
      ).structuredContent;
      expect(markdown, locale).toContain(toggle);
    }
  });

  it("keeps full-page behavior when no focused query is supplied", () => {
    const result = getPage({ slug: "app-profile" });

    expect(result).toContain("## What lives on the Profile screen?");
    expect(result).toContain("## Related");
  });
});

describe("search and fetch", () => {
  const description = (name: string) => MCP_ALWAYS_ON_TOOLS.find((tool) => tool.name === name)?.description ?? "";

  it("tell deep-research connectors how to complete the relative app routes in fetched docs", () => {
    expect(description("fetch")).toMatch(
      /app routes in text, such as `\/company\/subscription`, are relative: for a full link, put the route after the origin of url/,
    );
    expect(description("search")).toMatch(
      /App routes in the docs text that fetch returns, such as `\/company\/subscription`, are relative/,
    );
  });

  it("carry the same relative-route sentence in both catalog summaries", () => {
    for (const locale of CONTENT_LOCALES) {
      const summaries = JSON.parse(
        readFileSync(join(process.cwd(), "content", "docs", locale, "mcp-catalog-summaries.json"), "utf8"),
      ) as Record<string, string>;
      for (const tool of ["search_docs", "get_docs_page", "search", "fetch"])
        expect(summaries[tool], `${tool} (${locale})`).toMatch(/`\/company\/subscription`, (are|sind) relati/);
    }
  });
});

describe("stateless documentation section handoff", () => {
  it("directs search and get to pass the selected anchor and allows an empty-anchor full read", () => {
    expect(searchDocsTool.description).toContain("nonempty returned anchor as query");
    expect(searchDocsTool.description).toContain("omit query for an empty anchor");
    expect(getDocsPageTool.description).toContain("nonempty anchor returned by search_docs as query");
    expect(getDocsPageTool.description).toContain("For an empty anchor, omit query");
    const section = getDocsPageTool.inputSchema.parse({ slug: "webhooks", query: "how-do-i-create-a-webhook" });
    expect(section.query).toBe("how-do-i-create-a-webhook");
    const introduction = getDocsPageTool.inputSchema.parse({ slug: "webhooks" });
    expect(introduction.query).toBeUndefined();
    expect(getDocsPageTool.inputSchema.safeParse({ slug: "webhooks", query: "" }).success).toBe(false);
  });
});
