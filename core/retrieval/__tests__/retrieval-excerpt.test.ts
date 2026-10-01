import { describe, expect, it } from "vitest";

import { retrievalExcerpt } from "../retrieval-excerpt";

describe("bounded retrieval excerpts", () => {
  it("keeps a matching table row with its header and the section's own app link", () => {
    const markdown = [
      "An unrelated introduction. ".repeat(120),
      "| Option | Result |",
      "|---|---|",
      "| Default | Plain text |",
      "| Currency | Changes formatting without converting stored amounts |",
      "**Link:** `/company/settings`.",
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "currency converting amounts",
      heading: "## Settings",
      maxChars: 400,
    });
    expect(excerpt).toContain("| Option | Result |");
    expect(excerpt).toContain("|---|---|");
    expect(excerpt).toContain("without converting stored amounts");
    expect(excerpt).toContain("**Link:** `/company/settings`.");
    expect(excerpt.indexOf("| Option")).toBeLessThan(excerpt.indexOf("| Currency"));
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });

  it("puts the queried sentence inside the bounded prefix of a long paragraph", () => {
    const markdown =
      "General background. ".repeat(130) + "Reactivate reconnects the mailbox. " + "Additional context. ".repeat(80);
    const excerpt = retrievalExcerpt({ markdown, query: "reactivate mailbox", heading: "## Channels", maxChars: 512 });
    expect(excerpt).toContain("Reactivate reconnects the mailbox.");
    expect(excerpt.length).toBeLessThanOrEqual(512);
    expect(excerpt).not.toMatch(/…\s*…/);
  });

  it("retains a matching code fence and does not split Unicode points when truncating", () => {
    const fence = "```sh\nrestore-metadata --reconnect\n```";
    const excerpt = retrievalExcerpt({
      markdown: "Introduction. ".repeat(150) + "\n" + fence,
      query: "restore-metadata",
      maxChars: 100,
    });
    expect(excerpt).toContain(fence);
    const unicode = retrievalExcerpt({ markdown: "😀".repeat(100), query: "", maxChars: 32 });
    expect(unicode.length).toBeLessThanOrEqual(32);
    expect(unicode).not.toMatch(/[\uD800-\uDBFF]…/u);
  });
  it("retains an oversized section link without sacrificing the app route", () => {
    const markdown =
      "Introduction. ".repeat(200) +
      "\nCurrency changes formatting.\n**Link:** `/company/settings`. **Mate:** " +
      "Additional navigation guidance. ".repeat(100);
    const excerpt = retrievalExcerpt({ markdown, query: "currency formatting", heading: "## Settings", maxChars: 400 });
    expect(excerpt).toContain("Currency changes formatting.");
    expect(excerpt).toContain("**Link:** `/company/settings`.");
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });

  it("bounds a heading that consumes the entire remaining excerpt", () => {
    const excerpt = retrievalExcerpt({
      markdown: "A short body.",
      query: "body",
      heading: "## " + "Heading ".repeat(50),
      maxChars: 40,
    });
    expect(excerpt.length).toBeLessThanOrEqual(40);
    expect(retrievalExcerpt({ markdown: "Body", query: "", maxChars: 0 })).toBe("");
  });

  it("closes a matching code fence when its body is too large", () => {
    const markdown = "Introduction. ".repeat(150) + "\n```sh\nrestore-metadata " + "--reconnect ".repeat(100) + "\n```";
    const excerpt = retrievalExcerpt({ markdown, query: "restore-metadata", heading: "## Recovery", maxChars: 100 });
    expect(excerpt).toContain("```sh\n");
    expect(excerpt.endsWith("\n```")).toBe(true);
    expect(excerpt.match(/```/gu)).toHaveLength(2);
    expect(excerpt.length).toBeLessThanOrEqual(100);
  });

  it("preserves the original order of selected procedure steps", () => {
    const markdown = [
      "General context. ".repeat(100),
      "1. Prepare the restore configuration.",
      "2. Restore the mailbox to reconnect safely.",
      "3. Verify the restore result.",
    ].join("\n");
    const excerpt = retrievalExcerpt({ markdown, query: "restore mailbox", maxChars: 250 });
    expect(excerpt).toContain("1. Prepare");
    expect(excerpt).toContain("2. Restore");
    expect(excerpt.indexOf("1. Prepare")).toBeLessThan(excerpt.indexOf("2. Restore"));
    expect(excerpt.indexOf("2. Restore")).toBeLessThan(excerpt.indexOf("3. Verify"));
  });

  it("keeps selected table rows together as one Markdown table", () => {
    const markdown = [
      "General context. ".repeat(100),
      "| Item | Result |",
      "|---|---|",
      "| Restore | Mailbox restored |",
      "| Verify | Mailbox verified |",
    ].join("\n");
    const excerpt = retrievalExcerpt({ markdown, query: "mailbox", maxChars: 250 });
    expect(excerpt).toContain("|---|---|\n| Restore | Mailbox restored |\n| Verify | Mailbox verified |");
  });

  it("keeps short CJK query terms when focusing a long page", () => {
    const markdown = "Unrelated background. ".repeat(100) + "\n修改语言设置。";
    const excerpt = retrievalExcerpt({ markdown, query: "语言", maxChars: 100 });
    expect(excerpt).toContain("修改语言设置。");
    expect(excerpt.length).toBeLessThanOrEqual(100);
  });
});
