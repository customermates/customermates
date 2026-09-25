import { describe, expect, it } from "vitest";

import type { ContentLocale } from "@/i18n/locale-registry";

import { getDocsPageTool, searchDocsTool, type DocsSearchHit } from "../docs.mcp-tools";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";

function bestHit(query: string, locale: ContentLocale): DocsSearchHit | undefined {
  const result = searchDocsTool.execute({ query, locale, source: "docs" }) as {
    structuredContent: { results: DocsSearchHit[] };
  };
  return result.structuredContent.results[0];
}

function excerpt(slug: string, query: string, locale: ContentLocale) {
  return mcpToolResultText(getDocsPageTool.execute({ slug, query, locale, source: "docs" }) as McpToolResult);
}

describe("docs answers about API keys and invitation links", () => {
  it.each([
    ["en", "how long do quick connection keys last", "do-keys-expire"],
    ["en", "how long is a quick connection API key valid", "do-keys-expire"],
    ["en", "how long is an API key valid", "do-keys-expire"],
    ["en", "how long does an API key last", "do-keys-expire"],
    ["de", "Wie lange gilt ein Schnellverbindungs-Schlüssel?", "laufen-keys-ab"],
    ["de", "Wie lange ist ein API-Key gültig", "laufen-keys-ab"],
  ] as const)("answers the %s key lifetime question %j with the 365-day expiry", (locale, query, anchor) => {
    const best = bestHit(query, locale);

    expect([best?.slug, best?.anchor]).toEqual(["api-keys", anchor]);
    expect(excerpt("api-keys", query, locale)).toContain("365");
  });

  it.each([
    ["en", "API key name length", "what-is-the-key-format"],
    ["en", "how long can an API key name be", "what-is-the-key-format"],
    ["de", "Wie lang darf der Name eines API-Keys sein", "welches-format-hat-ein-key"],
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
