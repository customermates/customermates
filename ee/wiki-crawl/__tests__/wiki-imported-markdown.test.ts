import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { wikiImportCopy, wikiImportedMarkdown, type WikiSourceRecord } from "../wiki-website-crawl.service";

const source: WikiSourceRecord = {
  id: "source-1",
  url: "https://example.com/help/refunds",
  category: "help",
  title: "Refunds",
  text: "# Refunds\n\nRefunds within 30 days.",
  qaPairs: [{ question: "Can I pause instead?", answer: "Yes, for up to three months." }],
  contentHash: "hash",
  fetchedAt: new Date("2026-09-20T08:00:00.000Z"),
};

describe("imported Wiki page copy", () => {
  it("writes the source line and FAQ heading in the workspace language", async () => {
    const [german] = wikiImportedMarkdown(source, await wikiImportCopy("de"));

    expect(german).toContain("## Häufig gestellte Fragen\n\n### Can I pause instead?");
    expect(german.endsWith("Quelle: https://example.com/help/refunds · abgerufen am 2026-09-20")).toBe(true);
    expect(german).not.toMatch(/Frequently asked questions|fetched/u);
  });

  it("has the copy in every app locale and falls back to English for an unknown one", async () => {
    for (const locale of APP_LOCALES) {
      const copy = await wikiImportCopy(locale);
      expect(copy.faqHeading).not.toBe("");
      expect(copy.source({ url: "https://example.com/", date: "2026-09-20" })).toContain("https://example.com/");
    }
    const [fallback] = wikiImportedMarkdown(source, await wikiImportCopy("xx"));
    expect(fallback).toContain("## Frequently asked questions");
    expect(fallback.endsWith("Source: https://example.com/help/refunds · fetched 2026-09-20")).toBe(true);
  });
});
