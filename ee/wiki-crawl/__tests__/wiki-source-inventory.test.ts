import { describe, expect, it } from "vitest";

import { wikiSourceHeadings } from "../wiki-source-inventory";
import type { WikiSourceRecord } from "../wiki-website-crawl.service";

const source = (index: number): WikiSourceRecord => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  url: `https://example.com/offering-${index}`,
  qaPairs: [],
  title: `Offering ${index}`,
  text: `# Offering ${index}\n\n## Capabilities\n\nFull factual source body ${index}.`,
  contentHash: `hash-${index}`,
  category: "product",
  fetchedAt: new Date(0),
});

describe("crawl source inventory", () => {
  it("preserves heading order when navigation and topics occur on the same number of pages", () => {
    const sources = [
      { ...source(1), text: "# Navigation\n\n## First offering\n\n## Second offering" },
      { ...source(2), text: "# Navigation\n\n## Second offering\n\n## First offering" },
    ];
    const headings = wikiSourceHeadings(sources);
    expect(headings.get(sources[0].id)).toEqual(["Navigation", "First offering", "Second offering"]);
    expect(headings.get(sources[1].id)).toEqual(["Navigation", "Second offering", "First offering"]);
  });

  it("leads with page-specific topics before shared menu headings", () => {
    const menu = Array.from({ length: 20 }, (_, index) => `# Shared navigation heading ${index}`).join("\n");
    const sources = Array.from({ length: 5 }, (_, index) => ({
      ...source(index),
      text: `${menu}\n\n# Distinct service ${index}\n\nUseful source facts.`,
    }));
    const headings = wikiSourceHeadings(sources);
    for (const [index, item] of sources.entries()) expect(headings.get(item.id)?.[0]).toBe(`Distinct service ${index}`);
  });
});
