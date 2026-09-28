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

  it("completes only a trailing bare letter or number token so no tsquery syntax reaches the prefix path", () => {
    const hostile = [
      "refund'",
      "refund:*",
      "refund:* | policy:*",
      "o'neil",
      "refund&",
      "!refund",
      "'refund'",
      '"refund"',
      "(refund)",
      "refund\\",
      "re fund <->",
      "a",
      "go-live",
      "AES-256",
      "30%",
      "退款",
    ];
    for (const query of hostile) {
      const { prefix } = parseWikiSearchQuery(query);
      expect(prefix === null || /^[\p{L}\p{N}]{2,}$/u.test(prefix), query).toBe(true);
    }
    expect(parseWikiSearchQuery("o'neil").prefix).toBeNull();
    expect(parseWikiSearchQuery('"refund"').prefix).toBeNull();
    expect(parseWikiSearchQuery("refund:*").prefix).toBeNull();
    expect(parseWikiSearchQuery("!refund").prefix).toBe("refund");
    expect(parseWikiSearchQuery("退款").prefix).toBeNull();
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

  it("matches Korean Hangul and voiced Japanese kana against the section they appear in, without an empty anchor", () => {
    const korean = "## 소개\n\n이 페이지는 팀 안내입니다.\n\n## 환불 정책\n\n환불은 30일 이내에 요청할 수 있습니다.";
    const koreanMatch = wikiSearchMatch(korean, parseWikiSearchQuery("환불"));
    expect(koreanMatch).toEqual({
      offset: korean.indexOf("## 환불 정책"),
      section: "환불 정책",
      snippet: "**환불**은 30일 이내에 요청할 수 있습니다.",
    });
    expect(koreanMatch).not.toHaveProperty("anchor");

    const japanese =
      "## 概要\n\nチームの案内です。\n\n## がくしゅう\n\n新しいメンバーはがくしゅう計画に従います。\n\n## データベース\n\nデータベースは毎晩バックアップされます。";
    expect(wikiSearchMatch(japanese, parseWikiSearchQuery("がくしゅう"))).toMatchObject({
      offset: japanese.indexOf("## がくしゅう"),
      section: "がくしゅう",
    });
    expect(wikiSearchMatch(japanese, parseWikiSearchQuery("データベース"))).toMatchObject({
      offset: japanese.indexOf("## データベース"),
      section: "データベース",
      snippet: "**データベース**は毎晩バックアップされます。",
    });
    const decomposed = japanese.normalize("NFD");
    expect(wikiSearchMatch(decomposed, parseWikiSearchQuery("データベース")).offset).toBe(
      decomposed.indexOf("## データベース".normalize("NFD")),
    );
  });

  it("highlights substring matches at their original positions when lowercasing changes the text length", () => {
    const markdown = "Die İstanbul Straße liegt nahe dem Bahnhof, 東京 test.";
    const snippet = wikiSearchMatch(markdown, parseWikiSearchQuery("東京")).snippet;
    expect(snippet).toBe("Die İstanbul Straße liegt nahe dem Bahnhof, **東京** test.");
    expect(wikiSearchMatch(markdown, parseWikiSearchQuery("東京 test")).snippet).toBe(
      "Die İstanbul Straße liegt nahe dem Bahnhof, **東京** **test**.",
    );
  });
});
