import { describe, expect, it } from "vitest";

import { templateLlmsLines } from "@/core/templates/template-llms";

import { ALL_CAPABILITIES, entryOf, indexOf, localeOf } from "./template-publication-fixtures";

describe("llms.txt template entries", () => {
  it("adds nothing while no template page is public", () => {
    expect(
      templateLlmsLines("https://example.com", {
        index: indexOf(entryOf("a", { locales: { en: localeOf({ status: "draft" }) } })),
        shipped: ALL_CAPABILITIES,
      }),
    ).toEqual([]);
  });

  it("lists published own pages in English and leaves proof pages out", () => {
    const lines = templateLlmsLines("https://example.com", {
      index: indexOf(
        entryOf("tracker", { locales: { en: localeOf({ name: "Client tracker" }) } }),
        entryOf("proof", { locales: { en: localeOf({ publicPage: "proof" }) } }),
      ),
      shipped: ALL_CAPABILITIES,
    });

    expect(lines).toEqual([
      "## Templates",
      "- [Client tracker](https://example.com/en/templates/tracker): A description that is long enough to read as a real search snippet for the fixture page.",
      "",
    ]);
  });
});
