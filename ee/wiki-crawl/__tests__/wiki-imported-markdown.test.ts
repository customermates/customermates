import { describe, expect, it } from "vitest";

import type { JSONContent } from "@tiptap/core";
import { WikiMarkdownSchema } from "@/features/wiki/wiki.schema";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { extractWikiSourceDocument } from "../website-source-extract";

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
  it("imports source-site heading anchors as clean headings through the editor round trip", async () => {
    const document = extractWikiSourceDocument(
      "# Intro [#intro]\n\n## Pick your client and start [#pick-your-client-and-start]\n\nUseful context.\n\n## Can I start today? {#start}\n\nYes.",
      "https://example.com/intro.md",
      "text/markdown",
    );
    expect(document.title).toBe("Intro");
    const [markdown] = wikiImportedMarkdown({ ...source, ...document }, await wikiImportCopy("en"));
    const saved = WikiMarkdownSchema.parse(markdown);
    expect(saved).not.toMatch(/[\[{]#/u);
    expect(WikiMarkdownSchema.parse(saved)).toBe(saved);
    const headings = (parseMarkdownToJSON(saved) as JSONContent).content?.filter((node) => node.type === "heading");
    expect(headings?.map((node) => node.content?.map((text) => text.text).join(""))).toEqual([
      "Pick your client and start",
      "Can I start today?",
    ]);
  });

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
