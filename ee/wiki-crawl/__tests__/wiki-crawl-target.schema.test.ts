import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseStoredWikiCrawlTargets } from "../wiki-crawl-target.schema";

const target = { url: "https://example.com/help", category: "help", status: "pending" };

describe("stored Wiki crawl targets", () => {
  it("preserves explicit progress for every target and permits undiscovered null or empty targets", () => {
    const targets = ["pending", "reading", "read", "failed"].map((status, index) => ({
      ...target,
      url: `https://example.com/${index}`,
      status,
    }));
    expect(parseStoredWikiCrawlTargets(targets)).toEqual(targets);
    expect(parseStoredWikiCrawlTargets(null)).toBeNull();
    expect(parseStoredWikiCrawlTargets([])).toEqual([]);
  });

  it.each(
    [
      undefined,
      {},
      "invalid",
      [{ url: target.url, category: target.category }],
      [{ ...target, status: "unknown" }],
      [{ ...target, status: "invalid" }],
      [{ ...target, category: "invalid" }],
      [{ ...target, url: "file:///etc/passwd" }],
      [{ ...target, url: "https://127.0.0.1/" }],
      [null],
      [target, target],
    ].map((value) => ({ value })),
  )("rejects corrupt persisted targets without mutating or inventing progress (%j)", ({ value }) => {
    const before = JSON.stringify(value);
    let failure: unknown;
    try {
      parseStoredWikiCrawlTargets(value);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: "Knowledge Base crawl progress is invalid.",
      cause: expect.any(z.ZodError),
    });
    expect(JSON.stringify(value)).toBe(before);
  });
});
