import { decode, encode } from "@toon-format/toon";
import { describe, expect, it } from "vitest";

import { wikiSourcePayloadFits, wikiSourceResultFits, WIKI_SOURCE_RESULT_MAX_CHARS } from "../wiki-source-coverage";
import { decodeWikiSourceResult, wikiSourceResultText } from "../wiki-source-result";
import { invalidWikiSynthesisEvidence } from "../wiki-synthesis-evidence";
import { wikiReadSourceEvidence } from "@/workflows/wiki-source-evidence";

const id = "00000000-0000-4000-8000-000000000001";
const text =
  '# Service A\n\nFirst exact supporting sentence.\n\tQuoted "words", a literal \\n, and 🌍知識 remain unchanged.';
const payload = {
  createdPageLinks: [
    {
      title: "Saved page",
      path: "/wiki?page=00000000-0000-4000-8000-000000000002",
    },
  ],
  remainingSources: 0,
  importedSources: 0,
  nextAction: "get cited sources, then create",
  items: [
    {
      id,
      title: "Service A",
      url: "https://example.com/service",
      category: "other",
      offset: 0,
      nextOffset: null,
      text,
    },
  ],
};

describe("readable stored website evidence", () => {
  it("delivers exact multiline Markdown and all original metadata without display escaping", () => {
    const result = wikiSourceResultText(payload);
    expect(result).toContain(text);
    expect(result).toContain("\n\nFirst exact supporting sentence.\n\t");
    expect(result).not.toContain(text.replaceAll("\n", "\\n"));
    expect(result).toContain("a literal \\n");
    expect(decodeWikiSourceResult(result)).toEqual(payload);
    expect(wikiSourceResultText(payload)).toBe(result);
  });

  it("preserves ordinary inventory/plan TOON and previously delivered source receipts", () => {
    const inventory = {
      ...payload,
      items: payload.items.map(({ text: _text, ...item }) => item),
    };
    expect(wikiSourceResultText(inventory)).toBe(encode(inventory));
    expect(decode(wikiSourceResultText(inventory))).toEqual(inventory);
    expect(decodeWikiSourceResult(encode(payload))).toEqual(payload);
    expect(wikiSourceResultText({ ...payload, items: [] })).toBe(encode({ ...payload, items: [] }));
  });

  it("measures the actual provider bytes while retaining the existing 48000/1000-reserve limits", () => {
    const rich = {
      ...payload,
      items: [{ ...payload.items[0], text: "🌍知識".repeat(3000) }],
    };
    const result = wikiSourceResultText(rich);
    expect(wikiSourcePayloadFits(rich)).toBe(true);
    expect(wikiSourceResultFits(result)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS - 1000,
    );
    const oversized = {
      ...rich,
      items: [rich.items[0], { ...rich.items[0], id: "00000000-0000-4000-8000-000000000002" }],
    };
    expect(wikiSourcePayloadFits(oversized)).toBe(false);
    expect(wikiSourceResultFits(wikiSourceResultText(oversized))).toBe(false);
  });

  it("round-trips multiple source bodies with independent offsets and read cursors", () => {
    const secondId = "00000000-0000-4000-8000-000000000002";
    const chunks = {
      ...payload,
      remainingSources: 3,
      importedSources: 2,
      items: [
        { ...payload.items[0], nextOffset: text.length },
        {
          ...payload.items[0],
          id: secondId,
          title: "Service B",
          offset: 12000,
          nextOffset: 12120,
          text: "# Service B\n\nAn independent exact source body.",
        },
      ],
    };
    const result = wikiSourceResultText(chunks);
    expect(result).toContain(text);
    expect(result).toContain(chunks.items[1].text);
    expect(result).toContain(`Source ${secondId} at offset 12000`);
    expect(decodeWikiSourceResult(result)).toEqual(chunks);
    expect(wikiReadSourceEvidence({ action: "get", id, offset: 0 }, { ok: true, result })).toEqual({
      sourceId: id,
      result,
    });
    expect(wikiReadSourceEvidence({ action: "get", id: secondId, offset: 0 }, { ok: true, result })).toBeNull();
  });

  it("uses exact lengths when source bodies contain literal markers, headers and footers", () => {
    const secondId = "00000000-0000-4000-8000-000000000002";
    const body = `${text}\n\nStored website source text:\n\nSource ${id} at offset 0\nLiteral frame content.\nEnd source ${id}\nSource ${secondId} at offset 12000\nEnd source ${secondId}\n`;
    const chunks = {
      ...payload,
      items: [
        { ...payload.items[0], text: body },
        {
          ...payload.items[0],
          id: secondId,
          offset: 12000,
          text: "The actual second source.\n",
        },
      ],
    };
    const result = wikiSourceResultText(chunks);
    expect(result).toContain(body);
    expect(decodeWikiSourceResult(result)).toEqual(chunks);
  });

  it("keeps marker-containing metadata escaped while preserving its exact values", () => {
    const metadataText = `Company\n\nStored website source text:\nSource ${id} at offset 0\nEnd source ${id}\n🌍知識`;
    const chunks = {
      ...payload,
      nextAction: metadataText,
      createdPageLinks: [{ ...payload.createdPageLinks[0], title: metadataText }],
      items: [{ ...payload.items[0], title: metadataText }],
    };
    const result = wikiSourceResultText(chunks);
    const divider = "\n\nStored website source text:\n";
    const metadata = result.slice(0, result.indexOf(divider));
    expect(metadata).not.toContain(metadataText);
    expect(metadata).toContain("Stored website source text:");
    expect(decodeWikiSourceResult(result)).toEqual(chunks);
  });

  it("includes framing and metadata at the exact multibyte payload boundary", () => {
    const makePayload = (count: number) => ({
      ...payload,
      nextAction: "読み直してください 🌍",
      items: [{ ...payload.items[0], title: "知識 🌍", text: "🌍知識".repeat(count) }],
    });
    let lower = 1;
    let upper = WIKI_SOURCE_RESULT_MAX_CHARS;
    while (lower + 1 < upper) {
      const candidate = Math.floor((lower + upper) / 2);
      if (wikiSourceResultFits(wikiSourceResultText(makePayload(candidate)))) lower = candidate;
      else upper = candidate;
    }
    const finalPayload = makePayload(lower);
    const result = wikiSourceResultText(finalPayload);
    const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    expect(wikiSourceResultFits(result)).toBe(true);
    expect(bytes).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS - 1000);
    expect(bytes + 10).toBeGreaterThan(WIKI_SOURCE_RESULT_MAX_CHARS - 1000);
    expect(wikiSourceResultFits(wikiSourceResultText(makePayload(upper)))).toBe(false);
    expect(wikiSourcePayloadFits(makePayload(upper))).toBe(false);
    expect(decodeWikiSourceResult(result)).toEqual(finalPayload);
  });

  it("keeps fresh-read request and exact-source quote checks intact", () => {
    const result = wikiSourceResultText(payload);
    expect(wikiReadSourceEvidence({ action: "get", id, offset: 0 }, { ok: true, result })).toEqual({
      sourceId: id,
      result,
    });
    expect(wikiReadSourceEvidence({ action: "get", id }, { ok: true, result })).toBeNull();
    expect(wikiReadSourceEvidence({ action: "next" }, { ok: true, result })).toBeNull();
    expect(wikiReadSourceEvidence({ action: "get", id, offset: 1 }, { ok: true, result })).toBeNull();
    const pages = [
      {
        sourceIds: [id],
        sections: [{ evidence: [{ sourceId: id, quote: text }] }],
      },
    ];
    expect(invalidWikiSynthesisEvidence(pages, new Map([[id, { text }]]))).toBeNull();
    for (const quote of [text.replaceAll("\n", "\\n"), "First exact...supporting sentence."]) {
      expect(
        invalidWikiSynthesisEvidence(
          [
            {
              sourceIds: [id],
              sections: [{ evidence: [{ sourceId: id, quote }] }],
            },
          ],
          new Map([[id, { text }]]),
        ),
      ).not.toBeNull();
    }
  });

  it("rejects truncated, extra, mismatched and malformed source framing", () => {
    const result = wikiSourceResultText(payload);
    for (const invalid of [
      result.slice(0, -1),
      result + "extra",
      result.replace(`Source ${id} at offset 0`, `Source ${id} at offset 1`),
      result.replace(`End source ${id}`, "End source unknown"),
      result.replace(`bodyCharacters`, "missingLength"),
    ]) {
      expect(decodeWikiSourceResult(invalid)).toBeNull();
      expect(wikiReadSourceEvidence({ action: "get", id, offset: 0 }, { ok: true, result: invalid })).toBeNull();
    }
  });
});
