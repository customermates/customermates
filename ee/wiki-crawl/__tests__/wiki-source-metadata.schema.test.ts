import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseWikiCrawlMode, WIKI_CRAWL_MODES } from "@/features/wiki/wiki-crawl-mode.schema";
import { WIKI_CRAWL_CATEGORIES } from "../website-discovery";
import { parseStoredWikiSourceMetadata } from "../wiki-source-metadata.schema";

const pair = { question: "How does this work?", answer: "Use the documented process." };
describe("canonical Wiki crawl record decoding", () => {
  it("preserves every canonical mode instead of introducing a default", () => {
    for (const mode of WIKI_CRAWL_MODES) expect(parseWikiCrawlMode(mode)).toBe(mode);
  });

  it.each([undefined, null, "", "unknown", "INITIAL", 0, {}])("rejects invalid stored mode (%j)", (value) => {
    expect(() => parseWikiCrawlMode(value)).toThrow("Knowledge Base crawl mode is invalid.");
    try {
      parseWikiCrawlMode(value);
    } catch (error) {
      expect(error).toMatchObject({ cause: expect.any(z.ZodError) });
    }
  });

  it("preserves all canonical categories", () => {
    for (const category of WIKI_CRAWL_CATEGORIES)
      expect(parseStoredWikiSourceMetadata({ category, qaPairs: [pair] })).toEqual({ category, qaPairs: [pair] });
    expect(() => parseStoredWikiSourceMetadata({ category: "invalid", qaPairs: [pair] })).toThrow();
  });

  it("retains the nullable no-FAQ contract and legitimate long extracted strings without mutation", () => {
    expect(parseStoredWikiSourceMetadata({ category: "help", qaPairs: null })).toEqual({
      category: "help",
      qaPairs: [],
    });
    const metadata = { category: "help", qaPairs: [{ question: "Q".repeat(400), answer: "A".repeat(4000) }] };
    const before = JSON.stringify(metadata);
    expect(parseStoredWikiSourceMetadata(metadata)).toEqual(metadata);
    expect(JSON.stringify(metadata)).toBe(before);
  });

  it.each(
    [
      { category: "invalid", qaPairs: [] },
      { category: null, qaPairs: [] },
      { category: "help" },
      { category: "help", qaPairs: {} },
      { category: "help", qaPairs: "invalid" },
      { category: "help", qaPairs: [null] },
      { category: "help", qaPairs: [{}] },
      { category: "help", qaPairs: [{ question: null, answer: "answer" }] },
      { category: "help", qaPairs: [{ question: "question", answer: 1 }] },
      { category: "help", qaPairs: [{ ...pair, unknown: "value" }] },
    ].map((value) => ({ value })),
  )("rejects corrupt source metadata without silently dropping FAQ data (%j)", ({ value }) => {
    const before = JSON.stringify(value);
    expect(() => parseStoredWikiSourceMetadata(value)).toThrow("Knowledge Base source metadata is invalid.");
    try {
      parseStoredWikiSourceMetadata(value);
    } catch (error) {
      expect(error).toMatchObject({ cause: expect.any(z.ZodError) });
    }
    expect(JSON.stringify(value)).toBe(before);
  });
});
