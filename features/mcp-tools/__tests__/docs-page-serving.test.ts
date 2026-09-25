import { describe, expect, it } from "vitest";

import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageRaw, getDocsPageTool, listDocsSlugs } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

function getPage(args: { slug: string; locale?: ContentLocale }) {
  return mcpToolResultText(getDocsPageTool.execute({ locale: "en", source: "docs", ...args }) as McpToolResult);
}

describe("docs pages served to agents", () => {
  it.each(CONTENT_LOCALES)("fills the install snippets with the key placeholder the prose names (%s)", (locale) => {
    const result = getPage({ slug: "connect-cli", locale });

    expect(result).toContain("`YOUR_KEY`");
    expect(result).toContain('--header "x-api-key: YOUR_KEY"');
    expect(result).toContain('"x-api-key": "YOUR_KEY"');
    expect(result).not.toContain("<your-api-key>");
  });

  it("gives the introduction its canonical URL, not the redirecting intro-page alias", () => {
    expect(getDocsPageRaw("intro-page", "de", "docs")?.url).toBe(`${env.BASE_URL}/de/docs`);
    expect(getPage({ slug: "intro-page" })).toContain(`Canonical URL: ${env.BASE_URL}/en/docs\n`);
    expect(getDocsPageRaw("quickstart", "en", "docs")?.url).toBe(`${env.BASE_URL}/en/docs/quickstart`);
  });

  it("names the endpoint or webhook of every REST reference page under the spec's server path", () => {
    const server = generateOpenApiSpec().servers?.[0]?.url;
    const pages = CONTENT_LOCALES.flatMap((locale) =>
      listDocsSlugs(locale, "api").map((slug) => ({ slug, markdown: getDocsPageRaw(slug, locale, "api")?.markdown })),
    );

    expect(server).toBe("/api");
    expect(pages.length).toBeGreaterThan(0);
    for (const { slug, markdown } of pages) {
      expect(markdown).toMatch(
        new RegExp(
          `^\\*\\*(Endpoint|Webhook):\\*\\* \`[^\`]+\`, .*operationId \`${slug}\`\\. .*: \`${server}/v1/openapi\`\\.$`,
          "m",
        ),
      );
      expect(markdown).not.toContain("<APIPage");
    }
    expect(
      mcpToolResultText(
        getDocsPageTool.execute({ slug: "getContactById", locale: "en", source: "api" }) as McpToolResult,
      ),
    ).toContain("**Endpoint:** `GET /api/v1/contacts/{id}`, operationId `getContactById`.");
  });

  it("treats inherited object keys as unknown slugs", () => {
    expect(getDocsPageRaw("constructor", "en", "docs")).toBeNull();
    expect(getPage({ slug: "toString" }).startsWith("Validation error:")).toBe(true);
  });
});
