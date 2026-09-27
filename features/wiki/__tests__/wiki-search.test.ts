import { describe, expect, it } from "vitest";

import { WIKI_EXCERPT_MAX_LENGTH } from "../wiki-content";
import {
  parseWikiSearchQuery,
  wikiMarkdownSections,
  wikiOutline,
  wikiSearchMatch,
  wikiSectionOffsetIn,
} from "../wiki-search";

const unitTexts = (query: string) => parseWikiSearchQuery(query).units.map((unit) => unit.text);
const plain = (snippet: string) => snippet.replaceAll("**", "");

describe("parseWikiSearchQuery", () => {
  it("keeps only letter and number tokens so no query syntax reaches the database", () => {
    expect(unitTexts("VOICE, voice / Für Kunden? 2026")).toEqual(["voice", "kunden", "2026"]);
    expect(unitTexts("_%!:&|")).toEqual([]);
    expect(unitTexts("'; DROP TABLE WikiPage;--")).toEqual(["drop", "table", "wikipage"]);
    expect(unitTexts("refund:* & !policy | (a <-> b)")).toEqual(["refund", "policy"]);
    expect(unitTexts("AES-256 quokka-7 go-live")).toEqual(["aes-256", "quokka-7", "go-live"]);
    expect(parseWikiSearchQuery("AES-256").units[0]).toEqual({ text: "aes-256", words: ["aes", "256"], phrase: false });
  });

  it("drops multilingual filler words but keeps a lone filler query searchable", () => {
    expect(unitTexts("how do i onboard a customer")).toEqual(["onboard", "customer"]);
    expect(unitTexts("What is our refund policy?")).toEqual(["refund", "policy"]);
    expect(unitTexts("Wie viel Rabatt bekommen Kunden bei jährlicher Vorauszahlung?")).toEqual([
      "rabatt",
      "kunden",
      "jährlicher",
      "vorauszahlung",
    ]);
    expect(unitTexts("a")).toEqual(["a"]);
    expect(unitTexts("a to")).toEqual(["to"]);
  });

  it("turns quoted text into phrase units and completes only a trailing bare token", () => {
    const quoted = parseWikiSearchQuery('"first response" priority');
    expect(quoted.units).toEqual([
      { text: "first response", words: ["first", "response"], phrase: true },
      { text: "priority", words: ["priority"], phrase: false },
    ]);
    expect(quoted.prefix).toBe("priority");
    expect(parseWikiSearchQuery('refund "office hours"').prefix).toBeNull();
    expect(parseWikiSearchQuery("Who approves refunds?").prefix).toBeNull();
    expect(parseWikiSearchQuery("go-live").prefix).toBeNull();
    expect(parseWikiSearchQuery("„Rückerstattung bearbeiten“").units).toEqual([
      { text: "rückerstattung bearbeiten", words: ["rückerstattung", "bearbeiten"], phrase: true },
    ]);
  });

  it("offers only single alphabetic words to typo matching, bound to their unit", () => {
    expect(parseWikiSearchQuery('glosary AES-256 "per diem" q3 milage').fuzzyTerms).toEqual([
      { term: "glosary", unit: 2 },
      { term: "milage", unit: 5 },
    ]);
  });

  it("searches CJK text by substring and bounds long requests to their distinctive terms", () => {
    expect(parseWikiSearchQuery("如何处理支持请求？")).toMatchObject({
      units: [],
      substringTerms: ["如何处理支持请求", "如何", "处理", "支持", "请求"],
    });
    expect(unitTexts(Array.from({ length: 40 }, (_, index) => `word${index}`).join(" "))).toHaveLength(32);
    expect(
      unitTexts(
        `${"a to our ".repeat(20)}${Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")} distinctiveprocess`,
      ),
    ).toContain("distinctiveprocess");
  });
});

const handbook = [
  "Intro paragraph about the handbook.",
  "## Refunds",
  "Refunds are paid within 5 days.",
  "### Approval",
  "Refunds above 500 EUR require approval from the finance lead.",
  "```",
  "# not a heading",
  "```",
  "## Travel",
  "The per diem for Berlin is 28 EUR.",
].join("\n");

describe("wikiMarkdownSections and wikiOutline", () => {
  it("splits canonical Markdown into heading-path sections with exact offsets, ignoring fenced code", () => {
    const sections = wikiMarkdownSections(handbook);
    expect(sections.map((section) => section.path)).toEqual([[], ["Refunds"], ["Refunds", "Approval"], ["Travel"]]);
    for (const section of sections.slice(1))
      expect(handbook.slice(section.offset)).toMatch(new RegExp(`^#+ ${section.path.at(-1)}`));
    expect(sections.at(-1)?.end).toBe(handbook.length);
    expect(wikiOutline(handbook)).toEqual([
      { level: 2, heading: "Refunds", offset: handbook.indexOf("## Refunds") },
      { level: 3, heading: "Approval", offset: handbook.indexOf("### Approval") },
      { level: 2, heading: "Travel", offset: handbook.indexOf("## Travel") },
    ]);
  });

  it("maps a section offset between stored and link-externalized Markdown", () => {
    const stored = "Intro [Other](/wiki?page=1).\n\n## Answer\n\nText";
    const externalized = "Intro [Other](https://example.com/wiki?page=1).\n\n## Answer\n\nText";
    expect(wikiSectionOffsetIn(stored, stored.indexOf("## Answer"), externalized)).toBe(
      externalized.indexOf("## Answer"),
    );
    expect(wikiSectionOffsetIn(stored, 0, externalized)).toBe(0);
  });
});

describe("wikiSearchMatch", () => {
  it("returns the deepest best-matching section with a highlighted snippet", () => {
    const match = wikiSearchMatch(handbook, parseWikiSearchQuery("who approves large refunds"));
    expect(match).toEqual({
      offset: handbook.indexOf("### Approval"),
      section: "Refunds > Approval",
      anchor: "approval",
      snippet: "**Refunds** above 500 EUR require **approval** from the finance lead. # not a heading",
    });
    expect(wikiSearchMatch(handbook, parseWikiSearchQuery('"per diem"'))).toMatchObject({
      section: "Travel",
      snippet: "The **per** **diem** for Berlin is 28 EUR.",
    });
  });

  it("falls back to the opening text when no section matches and handles an empty page", () => {
    expect(wikiSearchMatch(handbook, parseWikiSearchQuery("zzqxv"))).toEqual({
      offset: 0,
      snippet: "Intro paragraph about the handbook.",
    });
    expect(wikiSearchMatch("", parseWikiSearchQuery("anything"))).toEqual({ offset: 0, snippet: "" });
  });

  it("centres a bounded snippet on the matches without splitting astral characters", () => {
    const markdown = `${"Before ".repeat(80)}needle ${"after ".repeat(80)}😀`;
    const snippet = wikiSearchMatch(markdown, parseWikiSearchQuery("needle")).snippet;
    expect(plain(snippet).length).toBeLessThanOrEqual(WIKI_EXCERPT_MAX_LENGTH);
    expect(snippet).toContain("**needle**");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);

    const astral = wikiSearchMatch(
      `${"🌍".repeat(41)}needle${"🌍".repeat(100)}`,
      parseWikiSearchQuery("needle"),
    ).snippet;
    const text = plain(astral);
    const first = text.charCodeAt(text.startsWith("…") ? 1 : 0);
    const last = text.charCodeAt(text.length - (text.endsWith("…") ? 2 : 1));
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  it("matches inflections, typos, and CJK substrings inside sections", () => {
    const markdown =
      "## Mileage\n\nPrivate car use is reimbursed at 0.30 EUR per kilometre.\n\n## 退款\n\n退款申请需要在30天内提交。";
    expect(wikiSearchMatch(markdown, parseWikiSearchQuery("milage reimbursment"))).toMatchObject({
      section: "Mileage",
      snippet: "Private car use is **reimbursed** at 0.30 EUR per kilometre.",
    });
    expect(wikiSearchMatch(markdown, parseWikiSearchQuery("退款申请"))).toMatchObject({ section: "退款" });
  });
});
