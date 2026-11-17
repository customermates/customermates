import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { WikiPageEditSchema, applyWikiPageEdits } from "../wiki-page-edits";

const lines = (...parts: string[]) => parts.join("\n");

const PAGE = lines(
  "Intro paragraph.",
  "",
  "## Pricing",
  "",
  "Standard plan: 20 EUR.",
  "",
  "### Discounts",
  "",
  "Up to 5 %.",
  "",
  "## Contact",
  "",
  "Write to support. Standard plan questions go to sales.",
);

function applied(source: string, ...edits: Parameters<typeof applyWikiPageEdits>[1]) {
  const result = applyWikiPageEdits(source, edits);
  if (!result.ok) throw new Error(`Edit ${result.index} failed with ${result.error}`);
  return result.markdown;
}

describe("page edit shapes", () => {
  it.each([
    { find: "old", replace: "new" },
    { find: "old", replace: "" },
    { find: "old", replace: "new", anchor: "pricing" },
    { anchor: "pricing", markdown: "## Pricing\n\nNew." },
    { anchor: "pricing", markdown: "Text.", placement: "replace" },
    { anchor: "pricing", markdown: "Text.", placement: "before" },
    { anchor: "pricing", markdown: "Text.", placement: "after" },
    { anchor: "pricing", markdown: "" },
    { markdown: "Text." },
    { markdown: "Text.", placement: "start" },
    { markdown: "Text.", placement: "end" },
  ])("accepts %j", (edit) => {
    expect(WikiPageEditSchema.safeParse(edit).success).toBe(true);
  });

  it.each([
    {},
    { find: "old" },
    { replace: "new" },
    { find: "", replace: "new" },
    { find: "old", replace: "new", markdown: "Text." },
    { find: "old", replace: "new", placement: "after" },
    { anchor: "pricing" },
    { anchor: "   ", markdown: "Text." },
    { markdown: "Text.", placement: "before" },
    { anchor: "pricing", markdown: "Text.", placement: "end" },
    { markdown: "Text.", placement: "middle" },
    { markdown: "Text.", section: "pricing" },
  ])("rejects %j", (edit) => {
    expect(WikiPageEditSchema.safeParse(edit).success).toBe(false);
  });

  it("names the invalid edit shape so a writer can correct it", () => {
    const result = WikiPageEditSchema.safeParse({ find: "old" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(CustomErrorCode.wikiEditInvalid);
  });
});

describe("applying page edits", () => {
  it("swaps the one exact occurrence of a text", () => {
    expect(applied(PAGE, { find: "Up to 5 %.", replace: "Up to 10 %." })).toBe(
      PAGE.replace("Up to 5 %.", "Up to 10 %."),
    );
  });

  it("deletes a text when the replacement is empty", () => {
    expect(applied(PAGE, { find: " Standard plan questions go to sales.", replace: "" })).toBe(
      PAGE.replace(" Standard plan questions go to sales.", ""),
    );
  });

  it("refuses a text that occurs more than once, and takes it once a section narrows it down", () => {
    expect(applyWikiPageEdits(PAGE, [{ find: "Standard plan", replace: "Basic plan" }])).toEqual({
      ok: false,
      index: 0,
      error: CustomErrorCode.wikiEditTextAmbiguous,
    });
    expect(applied(PAGE, { find: "Standard plan", replace: "Basic plan", anchor: "pricing" })).toBe(
      PAGE.replace("Standard plan: 20 EUR.", "Basic plan: 20 EUR."),
    );
  });

  it("refuses a text the page, or the named section, does not contain", () => {
    expect(applyWikiPageEdits(PAGE, [{ find: "Enterprise plan", replace: "x" }])).toEqual({
      ok: false,
      index: 0,
      error: CustomErrorCode.wikiEditTextNotFound,
    });
    expect(applyWikiPageEdits(PAGE, [{ find: "Up to 5 %.", replace: "x", anchor: "pricing" }])).toEqual({
      ok: false,
      index: 0,
      error: CustomErrorCode.wikiEditTextNotFound,
    });
  });

  it("refuses a section the page does not have", () => {
    expect(applyWikiPageEdits(PAGE, [{ anchor: "refunds", markdown: "Text." }])).toEqual({
      ok: false,
      index: 0,
      error: CustomErrorCode.wikiEditSectionNotFound,
    });
  });

  it("replaces a section from its heading to the next heading and keeps its subsections", () => {
    expect(applied(PAGE, { anchor: "pricing", markdown: "## Pricing\n\nAsk sales." })).toBe(
      lines(
        "Intro paragraph.",
        "",
        "## Pricing",
        "",
        "Ask sales.",
        "",
        "### Discounts",
        "",
        "Up to 5 %.",
        "",
        "## Contact",
        "",
        "Write to support. Standard plan questions go to sales.",
      ),
    );
  });

  it("removes a section when it is replaced with nothing", () => {
    expect(applied(PAGE, { anchor: "discounts", markdown: "" })).toBe(
      lines(
        "Intro paragraph.",
        "",
        "## Pricing",
        "",
        "Standard plan: 20 EUR.",
        "",
        "## Contact",
        "",
        "Write to support. Standard plan questions go to sales.",
      ),
    );
  });

  it("inserts before a section and after a section", () => {
    const before = applied(PAGE, {
      anchor: "contact",
      markdown: "## Refunds\n\nWithin 14 days.\n",
      placement: "before",
    });
    expect(before).toBe(PAGE.replace("## Contact", "## Refunds\n\nWithin 14 days.\n\n## Contact"));

    const after = applied(PAGE, { anchor: "pricing", markdown: "Prices are net.", placement: "after" });
    expect(after).toBe(PAGE.replace("### Discounts", "Prices are net.\n\n### Discounts"));
  });

  it("adds to the end of the page by default and to its beginning on request", () => {
    expect(applied(PAGE, { markdown: "\n## Changelog\n\nNew.\n" })).toBe(`${PAGE}\n\n## Changelog\n\nNew.`);
    expect(applied(PAGE, { markdown: "Read this first.", placement: "start" })).toBe(`Read this first.\n\n${PAGE}`);
    expect(applied("", { markdown: "First text." })).toBe("First text.");
  });

  it("finds a section by the anchor a read of the page returns for its heading", () => {
    const page = lines("## Help *first*", "", "Old.", "", "## Help first, again", "", "Other.");
    expect(applied(page, { anchor: "help-first", find: "Old.", replace: "New." })).toBe(page.replace("Old.", "New."));
  });

  it("reaches each of two sections with the same heading by its own anchor", () => {
    const page = lines("## Inbox", "", "### Limits", "", "Twenty.", "", "## Signals", "", "### Limits", "", "Five.");

    expect(applied(page, { anchor: "limits", markdown: "### Limits\n\nThirty." })).toBe(
      page.replace("Twenty.", "Thirty."),
    );
    expect(applied(page, { anchor: "limits-2", markdown: "### Limits\n\nTen." })).toBe(page.replace("Five.", "Ten."));
    expect(applied(page, { anchor: "limits-2", find: "Five.", replace: "Six." })).toBe(page.replace("Five.", "Six."));
    expect(applyWikiPageEdits(page, [{ anchor: "limits-3", markdown: "Text." }])).toMatchObject({
      ok: false,
      error: CustomErrorCode.wikiEditSectionNotFound,
    });
  });

  it("does not take a heading inside a code block for a section", () => {
    const page = lines("## Setup", "", "```", "## Not a heading", "```");
    expect(applyWikiPageEdits(page, [{ anchor: "not-a-heading", markdown: "Text." }])).toMatchObject({
      ok: false,
      error: CustomErrorCode.wikiEditSectionNotFound,
    });
  });

  it("applies the edits in order, each to the result of the one before", () => {
    expect(
      applied(
        PAGE,
        { markdown: "## Changelog\n\nDraft." },
        { anchor: "changelog", find: "Draft.", replace: "Prices raised." },
        { find: "20 EUR", replace: "25 EUR" },
      ),
    ).toBe(`${PAGE.replace("20 EUR", "25 EUR")}\n\n## Changelog\n\nPrices raised.`);
  });

  it("reports which edit failed and returns no partly edited page", () => {
    const result = applyWikiPageEdits(PAGE, [
      { find: "20 EUR", replace: "25 EUR" },
      { anchor: "refunds", markdown: "Text." },
      { markdown: "Never applied." },
    ]);
    expect(result).toEqual({ ok: false, index: 1, error: CustomErrorCode.wikiEditSectionNotFound });
  });

  it("returns the page unchanged for no edits", () => {
    expect(applyWikiPageEdits(PAGE, [])).toEqual({ ok: true, markdown: PAGE });
  });
});
