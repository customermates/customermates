import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageTool, listDocsSlugs, searchDocsTool, type DocsSearchHit } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";
import { GET_STARTED_PROMPT } from "../server-instructions";
import { MCP_ALWAYS_ON_TOOLS } from "../tool-registry";

function search(args: { query: string; locale?: ContentLocale; source?: "docs" | "api" | "all" }) {
  return mcpToolResultText(searchDocsTool.execute({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

function getPage(args: { slug: string; query?: string; locale?: ContentLocale; source?: "docs" | "api" }) {
  return mcpToolResultText(getDocsPageTool.execute({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

function searchHits(query: string, locale: ContentLocale = "en") {
  const result = searchDocsTool.execute({ query, locale, source: "docs" }) as {
    structuredContent: { results: DocsSearchHit[] };
  };
  return result.structuredContent.results;
}

function excerptOf(slug: string, query: string, locale: ContentLocale = "en") {
  const result = getDocsPageTool.execute({ slug, query, locale, source: "docs" }) as {
    structuredContent: { markdown: string };
  };
  return result.structuredContent.markdown;
}

function firstLinkLine(markdown: string) {
  return markdown.split("\n").find((line) => line.startsWith("**Link:**")) ?? "";
}

const PAGE_LINK_QUESTIONS: [ContentLocale, string, string][] = [
  ["en", "roles page URL", "/company/roles"],
  ["en", "link to the roles page", "/company/roles"],
  ["en", "link to the subscription page", "/company/subscription"],
  ["en", "webhooks page URL", "/company/webhooks"],
  ["en", "API keys page URL", "/profile/api-keys"],
  ["en", "routines page URL", "/routines"],
  ["en", "URL of the routines page", "/routines"],
  ["en", "contacts page URL", "/contacts"],
  ["en", "link to the deals page", "/deals"],
  ["en", "tasks page URL", "/tasks"],
  ["en", "organizations page URL", "/organizations"],
  ["en", "link to the services page", "/services"],
  ["de", "URL der Rollen-Seite", "/company/roles"],
  ["de", "URL der Webhooks-Seite", "/company/webhooks"],
  ["de", "URL der API-Keys-Seite", "/profile/api-keys"],
  ["de", "Link zur Routinen-Seite", "/routines"],
  ["de", "URL der Kontakte-Seite", "/contacts"],
  ["de", "Link zur Aufgaben-Seite", "/tasks"],
  ["de", "URL der Organisationen-Seite", "/organizations"],
  ["de", "URL der Services-Seite", "/services"],
];

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

  it("gives every hit a readable snippet, even when the matching line is longer than the snippet", () => {
    for (const [query, locale] of [
      ["webhooks page link", "en"],
      ["cancel subscription", "en"],
      ["create api key", "en"],
      ["webhook signature", "en"],
      ["Webhooks Seite Link", "de"],
    ] as const) {
      const empty = searchHits(query, locale)
        .filter((hit) => hit.snippet.replace(/^[^:]+: /, "").replace(/[…\s]/g, "") === "")
        .map((hit) => `${hit.slug}#${hit.anchor}: ${hit.snippet}`);
      expect(empty, `${locale} "${query}"`).toEqual([]);
    }
  });

  it("answers a page-link question with a section whose link line names that page", () => {
    const misses = PAGE_LINK_QUESTIONS.flatMap(([locale, query, route]) => {
      const [best] = searchHits(query, locale);
      const excerpt = best ? excerptOf(best.slug, query, locale) : "";
      const routes = excerpt
        .split("\n")
        .filter((line) => line.startsWith("**Link:**"))
        .join(" ");
      return routes.includes(`\`${route}`) ? [] : [`${locale} "${query}" -> ${best?.slug}#${best?.anchor}`];
    });
    expect(misses, misses.join("\n")).toEqual([]);
  });

  it("keeps a question that uses link as a verb on the relationships section, not on a section of record-page links", () => {
    for (const query of ["link a contact to an organization", "how do I link a deal to a service?"]) {
      const [best] = searchHits(query);
      expect(`${best?.slug}#${best?.anchor}`, query).toBe("concepts#how-do-relationships-link-records");
    }
  });

  it("tells agents how to complete the relative app routes it returns", () => {
    expect(searchDocsTool.description).toMatch(
      /App routes in a snippet, such as `\/company\/subscription`, are relative/,
    );
  });

  it("keeps full ranked hits in structured content while bounding model-facing text", () => {
    const result = searchDocsTool.execute({ query: "webhook", locale: "en", source: "docs" });

    expect(mcpToolResultText(result).length).toBeLessThanOrEqual(500);
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
    const result = mcpToolResultText(raw);
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

  it("names only valid slugs in the slug examples", () => {
    const description = getDocsPageTool.inputSchema.shape.slug.description ?? "";
    const examples = [...description.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
    expect(examples.length).toBeGreaterThan(0);
    expect(listDocsSlugs("en", "docs")).toEqual(expect.arrayContaining(examples));
  });

  it("excerpts the section search_docs names, with that section's own link line", () => {
    for (const [locale, query, route] of [
      ["en", "roles page URL", "/company/roles"],
      ["de", "URL der Rollen-Seite", "/company/roles"],
      ["de", "Wie lade ich ein Mitglied ein", "/company/members"],
    ] as const) {
      const excerpt = excerptOf("app-company", query, locale);
      expect(firstLinkLine(excerpt), `${locale} "${query}"`).toContain(`\`${route}\``);
      const best = searchHits(query, locale).find((hit) => hit.slug === "app-company");
      if (best) expect(excerpt.split("\n")[0], `${locale} "${query}"`).toContain(best.section.split(" > ").at(-1));
    }
  });

  it("puts the section a query names first and keeps its link line, steps included", () => {
    for (const [locale, slug, heading, route] of [
      ["en", "connect-custom-connector", "Can ChatGPT use an API key instead of OAuth?", "/profile/api-keys"],
      ["de", "connect-custom-connector", "Kann ChatGPT statt OAuth einen API-Key nutzen?", "/profile/api-keys"],
      ["en", "mcp", "Connect a client", "/profile/api-keys"],
      ["en", "architecture-security", "How are webhook secrets and destinations secured?", "/company/webhooks"],
      ["en", "app-profile", "Settings tab", "/profile/settings"],
    ] as const) {
      const excerpt = excerptOf(slug, heading, locale);
      const [firstLine] = excerpt.split("\n");
      expect(firstLine, `${slug} "${heading}"`).toMatch(/^#+ /);
      expect(firstLine.replace(/^#+ /, ""), `${slug} "${heading}"`).toBe(heading);
      expect(firstLinkLine(excerpt), `${slug} "${heading}"`).toContain(`\`${route}\``);
    }
    expect(excerptOf("app-company", "roles-tab").split("\n")[0]).toBe("## Roles tab");
  });

  it("tells agents how to complete the relative app routes in the markdown", () => {
    expect(getDocsPageTool.description).toMatch(
      /App routes in the markdown, such as `\/company\/subscription`, are relative/,
    );
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
