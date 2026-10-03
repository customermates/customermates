import { encode } from "@toon-format/toon";
import { describe, expect, it } from "vitest";

import { WIKI_SOURCE_RESULT_MAX_CHARS } from "@/ee/wiki-crawl/wiki-source-coverage";
import { wikiReadSourceEvidence } from "@/workflows/wiki-source-evidence";

const id = "00000000-0000-4000-8000-000000000001";
const input = { action: "get", id, offset: 0 };
const data = {
  createdPageLinks: [],
  remainingSources: 0,
  importedSources: 0,
  nextAction: "create",
  items: [
    {
      id,
      title: "Company",
      url: "https://example.com/",
      category: "other",
      offset: 0,
      nextOffset: null,
      text: "Verified public facts",
    },
  ],
};
const outcome = { ok: true, result: encode(data) };

describe("fresh website source evidence", () => {
  it("accepts only the exact successful get at explicit offset zero", () => {
    expect(wikiReadSourceEvidence(input, outcome)).toEqual({
      sourceId: id,
      result: outcome.result,
    });
    for (const request of [
      { ...input, action: "next" },
      { ...input, action: "list" },
      { ...input, action: "plan" },
      { action: "get", id },
      { ...input, offset: 1 },
      { ...input, id: "unknown" },
    ])
      expect(wikiReadSourceEvidence(request, outcome)).toBeNull();
  });

  it("rejects failed, malformed, wrong-source, wrong-offset, empty and oversized results", () => {
    for (const value of [
      { ...outcome, ok: false },
      { ok: true, result: "not: [valid" },
      { ok: true, result: encode({ items: [] }) },
      ...[
        { ...data.items[0], id: "00000000-0000-4000-8000-000000000002" },
        { ...data.items[0], offset: 1 },
        { ...data.items[0], text: "   " },
      ].map((item) => ({
        ok: true,
        result: encode({ ...data, items: [item] }),
      })),
      { ok: true, result: "x".repeat(WIKI_SOURCE_RESULT_MAX_CHARS + 1) },
    ])
      expect(wikiReadSourceEvidence(input, value)).toBeNull();
  });
});
