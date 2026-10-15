import { describe, expect, it } from "vitest";

import { RETRIEVAL_CHUNK_MAX_LENGTH } from "@/core/retrieval/retrieval-chunks";
import { wikiSemanticChunks } from "@/features/wiki/wiki-chunks";
import { WIKI_SECTION_MAX_LENGTH } from "@/features/wiki/wiki-markdown-sections";

import { RECORD_FILE_MAX_CHUNKS, recordFileChunks } from "../record-file-chunks";

describe("record file chunks", () => {
  it("labels each section with the file name and heading path, exactly like Knowledge Base chunks", () => {
    const text =
      "Overview of the deal.\n\n## Page 1\n\nRenewal every twelve months.\n\n## Page 2\n\nCancellation terms.";
    const chunks = recordFileChunks("Contract.pdf", text);

    expect(chunks).toEqual(
      wikiSemanticChunks("Contract.pdf", text).map((chunk) => ({
        ordinal: chunk.ordinal,
        offset: chunk.offset,
        heading: chunk.section,
        text: chunk.text,
        contentHash: chunk.contentHash,
      })),
    );
    expect(chunks.map(({ text: body, offset, heading }) => ({ body, offset, heading }))).toEqual([
      { body: "Contract.pdf\n\nOverview of the deal.", offset: 0, heading: null },
      {
        body: "Contract.pdf > Page 1\n\nRenewal every twelve months.",
        offset: text.indexOf("## Page 1"),
        heading: "Page 1",
      },
      { body: "Contract.pdf > Page 2\n\nCancellation terms.", offset: text.indexOf("## Page 2"), heading: "Page 2" },
    ]);
  });

  it("opens later windows of a long section at the line where they start", () => {
    const rows = Array.from({ length: 400 }, (_, index) => `Row ${index};Acme;Berlin;${index * 7}`);
    const text = `# Leads\n\n${rows.join("\n")}`;
    const chunks = recordFileChunks("leads.csv", text);

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].offset).toBe(0);
    for (const chunk of chunks.slice(1)) {
      const body = chunk.text.slice(chunk.text.indexOf("\n\n") + 2);
      const firstLine = body.split("\n", 1)[0];
      expect(text.slice(chunk.offset)).toMatch(
        new RegExp(`^[^\\n]*${firstLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
      expect(text[chunk.offset - 1]).toBe("\n");
    }
    const offsets = chunks.map(({ offset }) => offset);
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(
      chunks.every((chunk) => chunk.text.length <= RETRIEVAL_CHUNK_MAX_LENGTH + "leads.csv > Leads\n\n".length),
    ).toBe(true);
  });

  it("lands inside a single very long line when no line start is near", () => {
    const text = Array.from({ length: 3_000 }, (_, index) => `w${index}`).join(" ");
    const [, second] = recordFileChunks("minified.json", text);

    expect(second.offset).toBeGreaterThan(0);
    expect(text.slice(second.offset)).toMatch(/^w\d+|^\d+/);
  });

  it("stops at the file chunk cap", () => {
    const text = Array.from(
      { length: RECORD_FILE_MAX_CHUNKS + 50 },
      (_, index) => `## Part ${index}\n\nText ${index}`,
    ).join("\n\n");
    expect(recordFileChunks("parts.md", text)).toHaveLength(RECORD_FILE_MAX_CHUNKS);
  });

  it("caps a long heading in every chunk of a file, while Knowledge Base chunks keep the whole heading", () => {
    const heading = Array.from({ length: 40_000 }, (_, index) => `w${index}`).join(" ");
    const text = `# ${heading}\n\n${"The renewal terms apply to every plan. ".repeat(200)}`;
    const chunks = recordFileChunks("notes.md", text);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.heading?.length).toBeLessThanOrEqual(WIKI_SECTION_MAX_LENGTH);
      expect(chunk.heading?.endsWith("…")).toBe(true);
      expect(chunk.text.startsWith(`notes.md > ${chunk.heading}\n\n`)).toBe(true);
      expect(chunk.text.length).toBeLessThanOrEqual(
        `notes.md > \n\n`.length + WIKI_SECTION_MAX_LENGTH + RETRIEVAL_CHUNK_MAX_LENGTH,
      );
    }
    expect(wikiSemanticChunks("notes.md", text)[0].section).toBe(heading);
  });
});
