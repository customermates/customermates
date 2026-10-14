import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { retrievalEmbeddingText } from "@/core/retrieval/retrieval-sections";
import { docsCorpusBuildHash, docsSectionParts } from "../docs-corpus";
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
    const [part] = docsSectionParts("en", section(text));
    expect(part.text).toBe("Private conversations stay private in the [Inbox].");
    expect(part.embeddingBody).toBe(part.text);
    expect(docsEmbeddingText(part)).toBe("Example > Privacy\n\nPrivate conversations stay private in the [Inbox].");
    expect(part.contentHash).toBe(hash(docsEmbeddingText(part)));
    expect(part.contentHash).toBe(hash(retrievalEmbeddingText(part.label, part.text)));
  });

  it("splits a long section on paragraph boundaries and embeds each part's own text", () => {
    const prose = `Verified user-facing fact. ${"Evidence ".repeat(190)}`;
    const middle = `Open the [Example](app:example) page. ${"searchable_fragment ".repeat(70)}`;
    const text = `${prose}\n\n${middle}\n\nAnother verified fact.`;
    const body = text.replace("](app:example)", "]");
    const parts = docsSectionParts("en", section(text));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(({ partOrdinal }) => partOrdinal)).toEqual(parts.map((_, index) => index));
    expect(parts.map((part) => part.text).join("\n\n")).toBe(body);
    expect(parts.every((part) => part.text.length <= 1_800)).toBe(true);
    expect(parts.some((part) => part.embeddingBody.includes("searchable_fragment"))).toBe(true);
    expect(parts.some((part) => part.embeddingBody.includes("Another verified fact."))).toBe(true);
    for (const part of parts) {
      expect(part.embeddingBody).toBe(part.text.trim());
      expect(part.embeddingBody).not.toContain("app:example");
      expect(part.contentHash).toBe(hash(docsEmbeddingText(part)));
    }
  });

  it("keeps the part's complete text, including code examples and prose that discuss Link or Mate", () => {
    const text =
      "Link: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```\n\n**Link:** `/literal-route`. ";
    expect(docsEmbeddingBody(text)).toBe(
      "Link: a verified relationship. Mate reads __exact_identifier__.\n\n```md\n**Link:** this is literal example content.\n```\n\n**Link:** `/literal-route`.",
    );
  });

  it("reuses identical embedding and build inputs for link-target-only edits and changes them for visible text", () => {
    const first = docsSectionParts("en", section("Verified fact in [Inbox](app:inbox)."));
    const second = docsSectionParts("en", section("Verified fact in [Inbox](app:settings/roles)."));
    expect(first[0].text).toBe(second[0].text);
    expect(first[0].contentHash).toBe(second[0].contentHash);
    expect(docsCorpusBuildHash(first)).toBe(docsCorpusBuildHash(second));
    const changedLabel = docsSectionParts("en", section("Verified fact in [Roles](app:inbox)."));
    expect(changedLabel[0].contentHash).not.toBe(first[0].contentHash);
    expect(docsCorpusBuildHash(changedLabel)).not.toBe(docsCorpusBuildHash(first));
    const changedFact = docsSectionParts("en", section("A changed verified fact in [Inbox](app:inbox)."));
    expect(changedFact[0].contentHash).not.toBe(first[0].contentHash);
  });

  it("uses the versioned corpus input for every pending hash and rejects unrelated durable rows", () => {
    const parts = docsSectionParts("en", section("Verified fact in [Example](app:example)."));
    expect(docsPendingEmbeddingTexts({ parts }, parts)).toEqual(parts.map(docsEmbeddingText));
    expect(() => docsPendingEmbeddingTexts({ parts }, [{ contentHash: "foreign" }])).toThrow(
      "Pending documentation embedding is absent from the current corpus.",
    );
  });
});
