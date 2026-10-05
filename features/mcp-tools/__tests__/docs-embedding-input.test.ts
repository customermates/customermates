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
  it("removes only canonical navigation metadata and keeps raw searchable bodies and routes", () => {
    const text = "Private conversations stay private.\n\n**Link:** `/inbox`. **Mate:** `navigate` with `nav-inbox`.";
    const [chunk] = docsSectionChunks("en", section(text));
    expect(chunk.body).toBe(text);
    expect(chunk.embeddingBody).toBe("Private conversations stay private.");
    expect(docsEmbeddingText(chunk)).toBe("Example > Privacy\n\nPrivate conversations stay private.");
    expect(chunk.contentHash).toBe(hash(docsEmbeddingText(chunk)));
    expect(chunk.contentHash).not.toBe(hash(retrievalChunkText(chunk.label, chunk.body)));
  });

  it("removes metadata even when raw SQL chunk windows start inside a long metadata line", () => {
    const prose = `Verified user-facing fact. ${"Evidence ".repeat(190)}`;
    const metadata = `**Link:** \`/example\`. **Mate:** ${"machine_only_fragment ".repeat(170)}`;
    const text = `${prose}\n\n${metadata}\n\nAnother verified fact.`;
    const chunks = docsSectionChunks("en", section(text));
    expect(chunks.length).toBeGreaterThan(2);
    expect(
      chunks.some((chunk) => !chunk.body.startsWith("**Link:") && chunk.body.includes("machine_only_fragment")),
    ).toBe(true);
    expect(chunks.some((chunk) => chunk.embeddingBody.includes("Another verified fact."))).toBe(true);
    for (const chunk of chunks) {
      expect(chunk.body).toBe(text.slice(chunk.charOffset, chunk.charOffset + chunk.body.length));
      expect(chunk.embeddingBody).not.toContain("machine_only_fragment");
      expect(chunk.embeddingBody).not.toContain("**Mate:**");
      expect(chunk.contentHash).toBe(hash(docsEmbeddingText(chunk)));
    }
  });

  it("preserves code examples, identifiers and prose that discuss Link or Mate", () => {
    const text =
      "Link: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```\n\n**Link:** `/actual-route`. **Mate:** `navigate`.";
    const body = docsEmbeddingBody(text, { offset: 0, text });
    expect(body).toBe(
      "Link: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```",
    );
  });

  it("changes the corpus build for navigation-only edits while reusing only identical semantic inputs", () => {
    const first = docsSectionChunks("en", section("Verified fact.\n\n**Link:** `/first`. **Mate:** `navigate`."));
    const second = docsSectionChunks(
      "en",
      section("Verified fact.\n\n**Link:** `/other`. **Mate:** `highlight_element`."),
    );
    expect(first[0].body).not.toBe(second[0].body);
    expect(first[0].contentHash).toBe(second[0].contentHash);
    expect(docsCorpusBuildHash(first)).not.toBe(docsCorpusBuildHash(second));
    const changedFact = docsSectionChunks(
      "en",
      section("A changed verified fact.\n\n**Link:** `/first`. **Mate:** `navigate`."),
    );
    expect(changedFact[0].contentHash).not.toBe(first[0].contentHash);
  });

  it("uses the versioned corpus input for every pending hash and rejects unrelated durable rows", () => {
    const chunks = docsSectionChunks("en", section("Verified fact.\n\n**Link:** `/example`. **Mate:** `navigate`."));
    expect(docsPendingEmbeddingTexts({ chunks }, chunks)).toEqual(chunks.map(docsEmbeddingText));
    expect(() => docsPendingEmbeddingTexts({ chunks }, [{ contentHash: "foreign" }])).toThrow(
      "Pending documentation embedding is absent from the current corpus.",
    );
  });
});
