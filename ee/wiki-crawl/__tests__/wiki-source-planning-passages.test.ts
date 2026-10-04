import { describe, expect, it } from "vitest";

import { wikiSourcePlanningPassages } from "../wiki-source-planning-passages";

describe("stored source planning passages", () => {
  it("leads with each source's own text while preserving its exact wording and whitespace", () => {
    const shared = "Shared privacy information is displayed on every page of this website.";
    const own = 'Only this service supports the stated workflow.\n\tIts "quoted" conditions remain 🌍 unchanged.';
    const sources = [
      { id: "first", text: `${shared}\n\n# Service\n${own}` },
      { id: "second", text: `${shared}\n\n# Another service\n\nA separate source describes its own capabilities.` },
    ];
    const passages = wikiSourcePlanningPassages(sources);
    expect(passages.get("first")?.[0]).toBe(own);
    expect(passages.get("second")?.[0]).toBe("A separate source describes its own capabilities.");
    for (const source of sources)
      for (const passage of passages.get(source.id) ?? []) expect(source.text).toContain(passage);
  });

  it("bounds and deduplicates passages without joining source paragraphs", () => {
    const paragraphs = Array.from(
      { length: 5 },
      (_, index) => `Distinct paragraph ${index} gives complete source facts.`,
    );
    const text = [...paragraphs, paragraphs[0]].join("\n\n");
    const passages = wikiSourcePlanningPassages([{ id: "source", text }]).get("source");
    expect(passages).toHaveLength(3);
    expect(passages).toEqual(paragraphs.slice(0, 3));
  });

  it("omits a truncated whitespace-heavy lead rather than returning invalid short evidence", () => {
    const text = `Short${" ".repeat(500)}A later passage supplies real source information.`;
    expect(wikiSourcePlanningPassages([{ id: "source", text }]).get("source")).toEqual([]);
  });

  it("bounds long multibyte passages at valid source positions without adding ellipses", () => {
    const text = `# Heading\n\n${"知識🌍".repeat(1000)}`;
    const passage = wikiSourcePlanningPassages([{ id: "source", text }]).get("source")?.[0];
    expect(passage).toBeDefined();
    expect(passage?.length).toBeLessThanOrEqual(480);
    expect(passage).not.toContain("…");
    expect(passage?.isWellFormed()).toBe(true);
    expect(text).toContain(passage);
  });

  it("does not invent evidence from headings, isolated links or short labels", () => {
    const text =
      "# A heading that is longer than twenty characters\n\nhttps://example.com/privacy\n\n[Privacy notice](https://example.com/privacy)\n\nShort label";
    expect(wikiSourcePlanningPassages([{ id: "source", text }]).get("source")).toEqual([]);
  });
});
