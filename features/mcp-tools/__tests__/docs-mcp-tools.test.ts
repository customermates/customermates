import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { docsCorpusSections } from "../docs-manifest";

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
    expect(searchDocsTool.description).toMatch(/App routes in a snippet, such as `\/settings\/billing`, are relative/);
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
    const raw = docsPageResult({
      locale: "en",
      source: "docs",
      slug: "does-not-exist",
    });
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
      /App routes in the markdown, such as `\/settings\/billing`, are relative/,
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

  it("describes the workspace menu as the way into the settings pages in its tips for agents", () => {
    for (const [locale, toggle] of [
      ["en", "`#nav-workspace-menu` opens the workspace menu; it is not a navigation target"],
      ["de", "`#nav-workspace-menu` öffnet das Workspace-Menü und ist kein Navigationsziel"],
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
      /app routes in text, such as `\/settings\/billing`, are relative: for a full link, put the route after the origin of url/,
    );
    expect(description("search")).toMatch(
      /App routes in the docs text that fetch returns, such as `\/settings\/billing`, are relative/,
    );
  });

  it("carry the same relative-route sentence in both catalog summaries", () => {
    for (const locale of CONTENT_LOCALES) {
      const summaries = JSON.parse(
        readFileSync(join(process.cwd(), "content", "docs", locale, "mcp-catalog-summaries.json"), "utf8"),
      ) as Record<string, string>;
      for (const tool of ["search_docs", "get_docs_page", "search", "fetch"]) {
        expect(summaries[tool], `${tool} (${locale})`).toContain("`/settings/billing`");
        expect(summaries[tool], `${tool} (${locale})`).toContain("`BASE_URL`");
      }
    }
  });
});

describe("stateless documentation section handoff", () => {
  it.each(CONTENT_LOCALES)("reads a normalized page path with an exact %s section anchor", (locale) => {
    const section = docsCorpusSections("docs", locale).find((value) => value.slug === "webhooks" && value.anchor);
    if (!section) throw new Error("Missing webhook section");
    const result = docsPageResult({ slug: "/docs/webhooks.mdx", anchor: section.anchor, locale, source: "docs" });
    expect(result).toMatchObject({
      structuredContent: { excerpt: true, url: expect.stringContaining("/docs/webhooks") },
    });
    expect(mcpToolResultText(result)).toContain(section.headingPath.at(-1));
    expect(
      (result as { structuredContent: { markdown: string } }).structuredContent.markdown.length,
    ).toBeLessThanOrEqual(1_400);
  });

  it("rejects out-of-page and out-of-corpus anchors and unknown anchors in each locale", () => {
    const section = docsCorpusSections("docs", "en").find((value) => value.slug === "webhooks" && value.anchor);
    if (!section) throw new Error("Missing webhook section");
    for (const input of [
      { slug: "quickstart", locale: "en", source: "docs", anchor: section.anchor },
      { slug: "webhooks", locale: "en", source: "api", anchor: section.anchor },
      ...CONTENT_LOCALES.map((locale) => ({
        slug: "webhooks",
        locale,
        source: "docs" as const,
        anchor: "not-a-real-section",
      })),
    ] as const) {
      const result = docsPageResult(input);
      expect(result).toMatchObject({ failure: { kind: "validation" } });
      expect(mcpToolResultText(result)).toMatch(/^Validation error:/u);
    }
  });

  it("validates anchors separately from the original question and retains legacy anchor queries", () => {
    const input = getDocsPageTool.inputSchema.parse({
      slug: "webhooks",
      anchor: "  how-do-i-create-a-webhook  ",
      query: "  How do I create a webhook?  ",
    });
    expect(input.anchor).toBe("how-do-i-create-a-webhook");
    expect(input.query).toBe("How do I create a webhook?");
    for (const anchor of ["", "  ", "a".repeat(201)])
      expect(getDocsPageTool.inputSchema.safeParse({ slug: "webhooks", anchor }).success).toBe(false);
    expect(getDocsPageTool.inputSchema.safeParse({ slug: "webhooks", anchor: "a".repeat(200) }).success).toBe(true);
    expect(getDocsPageTool.inputSchema.parse({ slug: "webhooks", query: "how-do-i-create-a-webhook" }).query).toBe(
      "how-do-i-create-a-webhook",
    );
  });

  it("directs search and get to pass the selected anchor and allows an empty-anchor full read", () => {
    expect(searchDocsTool.description).toContain(
      "nonempty returned anchor as anchor and the original question as query",
    );
    expect(searchDocsTool.description).toContain("omit anchor and query for an empty anchor");
    expect(getDocsPageTool.description).toContain(
      "nonempty anchor returned by search_docs as anchor and the original question as query",
    );
    expect(getDocsPageTool.description).toContain("For an empty anchor, omit anchor and query");
    const section = getDocsPageTool.inputSchema.parse({
      slug: "webhooks",
      query: "how-do-i-create-a-webhook",
    });
    expect(section.query).toBe("how-do-i-create-a-webhook");
    const introduction = getDocsPageTool.inputSchema.parse({
      slug: "webhooks",
    });
    expect(introduction.query).toBeUndefined();
    expect(getDocsPageTool.inputSchema.safeParse({ slug: "webhooks", query: "" }).success).toBe(false);
  });
});
