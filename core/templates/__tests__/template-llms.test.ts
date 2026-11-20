import { describe, expect, it } from "vitest";

import { templateLlmsLines } from "@/core/templates/template-llms";

import { entryOf, indexOf, localeOf } from "./template-publication-fixtures";

describe("llms.txt template entries", () => {
  it("adds nothing while no template page is indexed", () => {
    expect(
      templateLlmsLines("https://example.com", {
        index: indexOf(entryOf("a", { locales: { en: localeOf({ publication: "none" }) } })),
      }),
    ).toEqual([]);
  });

  it("lists indexed pages in English and leaves noindex pages out", () => {
    const lines = templateLlmsLines("https://example.com", {
      index: indexOf(
        entryOf("tracker", { locales: { en: localeOf({ name: "Client tracker" }) } }),
        entryOf("quiet", { locales: { en: localeOf({ publication: "noindex" }) } }),
      ),
    });

    expect(lines).toEqual([
      "## Templates",
      "- [Client tracker](https://example.com/en/templates/tracker): A description that is long enough to read as a real search snippet for the fixture page.",
      "",
    ]);
  });
});
