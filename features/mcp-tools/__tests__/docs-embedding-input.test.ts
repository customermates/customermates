import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { retrievalChunkText } from "@/core/retrieval/retrieval-chunks";
import { docsCorpusBuildHash, docsSectionChunks } from "../docs-corpus";
import { docsEmbeddingBody, docsEmbeddingText, docsPendingEmbeddingTexts } from "../docs-embedding-input";
import type { DocsSection } from "../docs-sections";

const section = (text: string): DocsSection => ({
  source: "docs",
  slug: "example",
  pageTitle: "Example",
  anchor: "privacy",
  headingPath: ["Privacy"],
  text,
  order: 0,
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

describe("documentation embedding input", () => {
  it("embeds the searchable body with inline app link text and without link targets", () => {
    const text = "Private conversations stay private in the [Inbox](app:inbox).";
    const [chunk] = docsSectionChunks("en", section(text));
    expect(chunk.body).toBe("Private conversations stay private in the [Inbox].");
    expect(chunk.embeddingBody).toBe(chunk.body);
    expect(docsEmbeddingText(chunk)).toBe("Example > Privacy\n\nPrivate conversations stay private in the [Inbox].");
    expect(chunk.contentHash).toBe(hash(docsEmbeddingText(chunk)));
    expect(chunk.contentHash).toBe(hash(retrievalChunkText(chunk.label, chunk.body)));
  });

  it("embeds each raw SQL chunk window's own text for long sections", () => {
    const prose = `Verified user-facing fact. ${"Evidence ".repeat(190)}`;
    const middle = `Open the [Example](app:example) page. ${"searchable_fragment ".repeat(170)}`;
    const text = `${prose}\n\n${middle}\n\nAnother verified fact.`;
    const body = text.replace("](app:example)", "]");
    const chunks = docsSectionChunks("en", section(text));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.some((chunk) => chunk.embeddingBody.includes("searchable_fragment"))).toBe(true);
    expect(chunks.some((chunk) => chunk.embeddingBody.includes("Another verified fact."))).toBe(true);
    for (const chunk of chunks) {
      expect(chunk.body).toBe(body.slice(chunk.charOffset, chunk.charOffset + chunk.body.length));
      expect(chunk.embeddingBody).toBe(chunk.body.trim());
      expect(chunk.embeddingBody).not.toContain("app:example");
      expect(chunk.contentHash).toBe(hash(docsEmbeddingText(chunk)));
    }
  });

  it("keeps the window's complete text, including code examples and prose that discuss Link or Mate", () => {
    const text =
      "Intro.\n\nLink: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```\n\n**Link:** `/literal-route`. ";
    const offset = "Intro.\n\n".length;
    const body = docsEmbeddingBody(text, { offset, text: text.slice(offset) });
    expect(body).toBe(
      "Link: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```\n\n**Link:** `/literal-route`.",
    );
  });

  it("reuses identical embedding and build inputs for link-target-only edits and changes them for visible text", () => {
    const first = docsSectionChunks("en", section("Verified fact in [Inbox](app:inbox)."));
    const second = docsSectionChunks("en", section("Verified fact in [Inbox](app:company/roles)."));
    expect(first[0].body).toBe(second[0].body);
    expect(first[0].contentHash).toBe(second[0].contentHash);
    expect(docsCorpusBuildHash(first)).toBe(docsCorpusBuildHash(second));
    const changedLabel = docsSectionChunks("en", section("Verified fact in [Roles](app:inbox)."));
    expect(changedLabel[0].contentHash).not.toBe(first[0].contentHash);
    expect(docsCorpusBuildHash(changedLabel)).not.toBe(docsCorpusBuildHash(first));
    const changedFact = docsSectionChunks("en", section("A changed verified fact in [Inbox](app:inbox)."));
    expect(changedFact[0].contentHash).not.toBe(first[0].contentHash);
  });

  it("uses the versioned corpus input for every pending hash and rejects unrelated durable rows", () => {
    const chunks = docsSectionChunks("en", section("Verified fact in [Example](app:example)."));
    expect(docsPendingEmbeddingTexts({ chunks }, chunks)).toEqual(chunks.map(docsEmbeddingText));
    expect(() => docsPendingEmbeddingTexts({ chunks }, [{ contentHash: "foreign" }])).toThrow(
      "Pending documentation embedding is absent from the current corpus.",
    );
  });
});
