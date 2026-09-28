import { describe, expect, it } from "vitest";

import type { ContentLocale } from "@/i18n/locale-registry";

import { type DocsSearchHit, keywordDocsSearch, docsPageResult } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";

function bestHit(query: string, locale: ContentLocale): DocsSearchHit | undefined {
  const result = keywordDocsSearch({ query, locale, source: "docs" }) as {
    structuredContent: { results: DocsSearchHit[] };
  };
  return result.structuredContent.results[0];
}

function hits(query: string, locale: ContentLocale): string[] {
  const result = keywordDocsSearch({ query, locale, source: "docs" }) as {
    structuredContent: { results: DocsSearchHit[] };
  };
  return result.structuredContent.results.map((hit) => `${hit.slug}#${hit.anchor}`);
}

function excerpt(slug: string, query: string, locale: ContentLocale) {
  return mcpToolResultText(docsPageResult({ slug, query, locale, source: "docs" }) as McpToolResult);
}

describe("docs answers about API keys and invitation links", () => {
  it.each([
    ["en", "how long do quick connection keys last", "do-keys-expire"],
    ["en", "how long is a quick connection API key valid", "do-keys-expire"],
    ["en", "how long is an API key valid", "do-keys-expire"],
    ["en", "how long does an API key last", "do-keys-expire"],
    ["de", "Wie lange gilt ein Schnellverbindungs-Schlüssel?", "do-keys-expire"],
    ["de", "Wie lange ist ein API-Key gültig", "do-keys-expire"],
  ] as const)("answers the %s key lifetime question %j with the 365-day expiry", (locale, query, anchor) => {
    const best = bestHit(query, locale);

    expect([best?.slug, best?.anchor]).toEqual(["api-keys", anchor]);
    expect(excerpt("api-keys", query, locale)).toContain("365");
  });

  it("answers both halves of a key lifetime and webhook secret question, without drifting to channel sections", () => {
    const combined = hits("How long does a quick connection key last, and who can see webhook secrets?", "en");

    expect(combined[0]).toBe("api-keys#do-keys-expire");
    expect(combined).toContain("webhooks#who-can-see-and-change-webhooks");
    const keywords = hits("quick connection key webhook secrets", "en");
    expect(keywords[0]).toBe("architecture-security#how-are-webhook-secrets-and-destinations-secured");
    expect(keywords.filter((hit) => hit.startsWith("app-profile#") || hit.startsWith("app-inbox#"))).toEqual([]);
  });

  it.each([
    ["en", "how do I connect a channel", "app-profile#how-do-i-connect-a-channel"],
    ["en", "connect whatsapp", "app-profile#how-do-i-connect-a-channel"],
    ["en", "connected accounts", "app-company#what-happens-to-connected-accounts-when-the-plan-changes"],
    ["en", "how do I connect my email", "app-profile#how-do-i-connect-a-channel"],
    ["en", "can I connect my work email", "app-profile#how-do-i-connect-a-channel"],
    ["en", "connect my e-mail account", "app-profile#how-do-i-connect-a-channel"],
    ["en", "can I connect a shared inbox", "app-inbox#do-i-need-a-connected-channel"],
  ] as const)("keeps the %s channel question %j on its channel section", (locale, query, expected) => {
    expect(hits(query, locale)[0]).toBe(expected);
  });

  it.each([
    ["en", "API key name length", "what-is-the-key-format"],
    ["en", "how long can an API key name be", "what-is-the-key-format"],
    ["de", "Wie lang darf der Name eines API-Keys sein", "what-is-the-key-format"],
  ] as const)("answers the %s key name question %j with the 255-character limit", (locale, query, anchor) => {
    const best = bestHit(query, locale);

    expect([best?.slug, best?.anchor]).toEqual(["api-keys", anchor]);
    expect(excerpt("api-keys", query, locale)).toContain("255");
  });

  it.each([
    ["en", "how long is the invitation link valid", "7 days"],
    ["de", "Wie lange ist der Einladungslink gültig?", "7 Tage"],
    ["de", "Wie lange gilt der Einladungslink?", "7 Tage"],
  ] as const)("answers the %s invitation link question %j with its validity", (locale, query, validity) => {
    const best = bestHit(query, locale);

    expect([best?.slug, best?.anchor]).toEqual(["app-company", "how-do-invitations-work"]);
    expect(excerpt("app-company", query, locale)).toContain(validity);
  });

  it.each([
    ["en", "how long is the OAuth token valid", "connect-custom-connector", "it-syncs-and-stays-connected"],
    ["en", "how long is the refresh token valid", "connect-custom-connector", "it-syncs-and-stays-connected"],
    [
      "en",
      "how long is a webhook secret valid",
      "architecture-security",
      "how-are-webhook-secrets-and-destinations-secured",
    ],
    ["de", "Wie lange gilt das Refresh-Token", "architecture-security", "how-do-clients-authenticate"],
    ["de", "Wie lange gilt das OAuth-Token", "architecture-security", "how-do-clients-authenticate"],
    ["de", "Wie lange ist das Refresh-Token gültig", "connect-custom-connector", "it-syncs-and-stays-connected"],
    [
      "de",
      "Wie lange gilt das Webhook-Secret",
      "architecture-security",
      "how-are-webhook-secrets-and-destinations-secured",
    ],
  ] as const)(
    "keeps the %s lifetime question %j about another credential off the key and invitation sections",
    (locale, query, slug, anchor) => {
      const best = bestHit(query, locale);

      expect([best?.slug, best?.anchor]).toEqual([slug, anchor]);
    },
  );
});
