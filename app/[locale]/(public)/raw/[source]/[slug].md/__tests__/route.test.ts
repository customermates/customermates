import type { NextRequest } from "next/server";

import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://crm.example.com" } };
});

import { GET } from "../route";

async function getRaw(locale: string, source: string, slug: string) {
  const response = await GET(new Request(`https://crm.example.com/${locale}/raw/${source}/${slug}`) as NextRequest, {
    params: Promise.resolve({ locale, slug, source }),
  });
  return { status: response.status, text: await response.text() };
}

describe("raw markdown twin route", () => {
  it.each(CONTENT_LOCALES)(
    "expands the install snippets with the runtime address and the key placeholder the prose names (%s)",
    async (locale) => {
      const { status, text } = await getRaw(locale, "docs", "connect-cli.md");

      expect(status).toBe(200);
      expect(text).not.toContain("<McpInstallSnippet");
      expect(text).toContain("claude mcp add --transport http customermates https://crm.example.com/api/v1/mcp");
      expect(text).toContain('--header "x-api-key: YOUR_KEY"');
      expect(text).toContain("`YOUR_KEY`");
      expect(text).not.toContain("<your-api-key>");
    },
  );

  it("serves agent-ready markdown: a title heading, no frontmatter and no MDX components", async () => {
    const { text } = await getRaw("en", "docs", "mcp.md");

    expect(text.startsWith("# ")).toBe(true);
    expect(text).not.toMatch(/^title:/m);
    expect(text).not.toMatch(/<\/?(Steps|Step|Faq|FaqItem)\b/);
    expect(text).not.toContain("{/*");
  });

  it.each(CONTENT_LOCALES)(
    "serves REST operation twins that name the endpoint, without an APIPage stub or a build-time origin (%s)",
    async (locale) => {
      const { status, text } = await getRaw(locale, "openapi", "createContact.md");

      expect(status).toBe(200);
      expect(text.startsWith("# Create a contact\n")).toBe(true);
      expect(text).toContain("**Endpoint:** `POST /api/v1/contacts`, operationId `createContact`.");
      expect(text).toContain("Parameters and schemas: `/api/v1/openapi`.");
      expect(text).not.toContain("<APIPage");
      expect(text).not.toContain("{/*");
      expect(text).not.toMatch(/https?:\/\//);
    },
  );

  it("serves webhook twins that name the event and how it is delivered", async () => {
    const { status, text } = await getRaw("en", "openapi", "webhookContactCreated.md");

    expect(status).toBe(200);
    expect(text).toContain(
      "**Webhook:** `contactCreated`, sent as `POST` to your webhook URL, operationId `webhookContactCreated`.",
    );
    expect(text).not.toContain("<APIPage");
  });

  it.each([
    ["en", "docs", "does-not-exist.md"],
    ["en", "blog", "connect-cli.md"],
    ["xx", "docs", "connect-cli.md"],
    ["en", "docs", "constructor.md"],
  ])("answers 404 for %s/%s/%s", async (locale, source, slug) => {
    const { status } = await getRaw(locale, source, slug);

    expect(status).toBe(404);
  });
});
