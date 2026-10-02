import { createHash } from "node:crypto";
import { wikiSourceText } from "../wiki-source-text";
import type { McpToolResult } from "@/features/mcp-tools/mcp-tool";
import { executeMcpTool } from "@/features/mcp-tools/mcp-tool";
import { agentToolOutcomeStatus } from "@/ee/agent-chat/agent-durable-stream";
import { encodeToToon } from "@/features/mcp-tools/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import messages from "@/i18n/locales/en.json";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const harness = vi.hoisted(() => ({
  create: vi.fn(),
  crawl: vi.fn(),
  sources: vi.fn(),
  count: vi.fn(),
  createdPages: vi.fn(),
  imported: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("@/core/di", async () => {
  const { CreateWikiPagesFromCrawlInteractor } = await import("../create-wiki-pages-from-crawl.interactor");
  const { ReadWikiWebsiteSourcesInteractor } = await import("../read-wiki-website-sources.interactor");
  const repo = {
    getCrawl: harness.crawl,
    listSources: harness.sources,
    countSynthesizedPages: harness.count,
    listSynthesizedPages: harness.createdPages,
    findImportedPage: harness.imported,
    advanceSourceReads: harness.advance,
  };
  return {
    ...createMockDiModule(() => createMockUser()),
    getCreateWikiPagesFromCrawlInteractor: () =>
      new CreateWikiPagesFromCrawlInteractor(repo as never, { invoke: harness.create } as never),
    getReadWikiWebsiteSourcesInteractor: () => new ReadWikiWebsiteSourcesInteractor(repo as never),
  };
});
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => key),
}));

import { createWikiFromCrawlTool, readWebsiteSourceTool } from "../wiki-crawl-synthesis-tools";
import { WIKI_SOURCE_RESULT_MAX_CHARS } from "../wiki-source-coverage";
import { WIKI_SYNTHESIS_FOUNDATION_ROLES } from "../wiki-crawl-synthesis.schema";

function structured(result: McpToolResult) {
  if (typeof result === "string" || !("structuredContent" in result))
    throw new Error("Expected structured tool result");
  return result.structuredContent;
}

const ENGLISH =
  "Customers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. The customer can request a refund within thirty days after purchasing the annual subscription.";
const GERMAN =
  "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.";
const SOURCE_ID = "00000000-0000-4000-8000-000000000001";
const foundations = [...WIKI_SYNTHESIS_FOUNDATION_ROLES, "operating_guide" as const].map((role) => ({
  title: role.replaceAll("_", " "),
  role,
  sourceIds: [SOURCE_ID],
}));
const omittedFoundations = WIKI_SYNTHESIS_FOUNDATION_ROLES.map((role) => ({
  role,
  reason: "No usable company evidence",
}));
const page = (content: string, kind: "knowledge" | "guide" = "knowledge", quote = GERMAN) => ({
  title: "Company",
  kind,
  gaps: [] as string[],
  sections: [{ heading: "Support", content, evidence: [{ sourceId: SOURCE_ID, quote }] }],
  sourceIds: [SOURCE_ID],
});

function nonSubstantiveExclusion(sourceId: string, reason: string, evidenceQuote = GERMAN) {
  return { sourceIds: [sourceId], basis: "not_substantive" as const, reason, evidenceQuote };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.crawl.mockResolvedValue({
    locale: "en",
    mode: "initial",
    startedAt: new Date(),
  });
  harness.count.mockResolvedValue(0);
  harness.createdPages.mockResolvedValue([]);
  harness.imported.mockResolvedValue(null);
  harness.sources.mockResolvedValue([
    {
      id: SOURCE_ID,
      url: "https://example.com/de/help",
      category: "help",
      title: "Support",
      text: GERMAN,
      contentHash: "hash-1",
      fetchedAt: new Date(),
      readAt: new Date(),
      readOffset: GERMAN.length,
    },
  ]);
  harness.create.mockResolvedValue({ ok: true, data: [] });
});

describe("single language Wiki synthesis", () => {
  it.each([undefined, []])("refuses a section without supporting evidence (%j)", async (evidence) => {
    const value = {
      ...page(ENGLISH),
      sections: [{ heading: "Support", content: ENGLISH, evidence }],
    };
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [value] as never,
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("validates all page evidence before writing any member of a batch", async () => {
    const valid = page(ENGLISH);
    const invalid = page(ENGLISH);
    invalid.sections[0].evidence[0].quote = "Refunds are always approved automatically.";
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [valid, invalid],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [
          expect.objectContaining({
            path: ["pages", 1, "sections", 0, "evidence", 0],
          }),
        ],
      },
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("accepts English synthesis from German evidence without saving the raw quotations", async () => {
    await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(harness.create).toHaveBeenCalledOnce();
    const markdown = harness.create.mock.calls[0][0].pages[0].markdown;
    expect(markdown).toContain(ENGLISH);
    expect(markdown).not.toContain(GERMAN);
    expect(markdown).not.toContain("evidence");
  });

  it("preserves product names and technical identifiers in German synthesis", async () => {
    harness.crawl.mockResolvedValue({
      locale: "de",
      mode: "initial",
      startedAt: new Date(),
    });
    const content = `${GERMAN}\n\n"SAP Analytics Cloud", "Microsoft Dynamics 365", "Minimum Viable Product", "ABAP Stack", "REST API".`;
    await createWikiFromCrawlTool("de", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(content)],
    });
    expect(harness.create).toHaveBeenCalledOnce();
  });

  it("excludes code examples and link destinations from quoted-prose language checks", async () => {
    const content = `${ENGLISH}\n\n\`"${GERMAN}"\`\n\n\`\`\`text\n"${GERMAN}"\n\`\`\`\n\n[Support](https://example.com/"${encodeURIComponent(GERMAN)}")`;
    await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(content)],
    });
    expect(harness.create).toHaveBeenCalledOnce();
  });

  it.each(["fabricated_quote", "other_source", "uncited_source"])(
    "refuses %s section evidence before persisting a generated page",
    async (kind) => {
      const otherId = "00000000-0000-4000-8000-000000000002";
      const sources = await harness.sources();
      harness.sources.mockResolvedValue([
        ...sources,
        {
          ...sources[0],
          id: otherId,
          text: ENGLISH,
          contentHash: "english-source",
          readOffset: ENGLISH.length,
        },
      ]);
      const value = {
        ...page(ENGLISH),
        sections: [
          {
            heading: "Support",
            content: ENGLISH,
            evidence: [
              {
                sourceId: kind === "uncited_source" ? otherId : SOURCE_ID,
                quote: kind === "fabricated_quote" ? "Every request receives an unconditional refund." : ENGLISH,
              },
            ],
          },
        ],
      };
      const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
        action: "create",
        pages: [value],
      });
      expect(result).toMatchObject({
        failure: {
          kind: "validation",
          issues: [
            expect.objectContaining({
              customCode: "wikiSourceEvidenceInvalid",
            }),
          ],
        },
      });
      expect(harness.create).not.toHaveBeenCalled();
    },
  );

  it("refuses untranslated prose examples concealed by a mostly English page", async () => {
    const content = `${ENGLISH}\n\n${ENGLISH}\n\nExamples: "${GERMAN}"`;
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(content)],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [expect.objectContaining({ customCode: "wikiImportLanguageRequired" })],
      },
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it.each(["emphasis", "link", "softbreak"])("checks quoted prose containing Markdown %s", async (format) => {
    const quotation = GERMAN.replace(
      "Vertrag",
      format === "emphasis" ? "**Vertrag**" : format === "link" ? "[Vertrag](https://example.com)" : "Vertrag\n",
    );
    const content = `${ENGLISH}\n\n${ENGLISH}\n\nExample: “${quotation}”`;
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(content)],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [
          expect.objectContaining({
            customCode: "wikiImportLanguageRequired",
          }),
        ],
      },
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("explains overlapping accounting and missing sources without claiming a known id is unknown", async () => {
    const sources = await harness.sources();
    const missing = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: missing, contentHash: "distinct" }]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [nonSubstantiveExclusion(SOURCE_ID, "No additional company facts")],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [
          expect.objectContaining({
            customCode: "wikiSourcePlanAccountingInvalid",
          }),
        ],
      },
    });
    expect(JSON.stringify(result)).toContain(SOURCE_ID);
    expect(JSON.stringify(result)).toContain(missing);
    expect(JSON.stringify(result)).not.toContain("Cite only ids");
    expect(harness.advance).not.toHaveBeenCalled();
  });
  it("rejects an overlap that names a foundation while claiming an offering role", async () => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: otherId, contentHash: "distinct-source" }]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [
        {
          sourceIds: [otherId],
          reason: "Covered by the overview.",
          basis: "overlap",
          coveredByTitle: foundations[0].title,
          coveredByRole: "offering",
        },
      ],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [expect.objectContaining({ customCode: "wikiSourceExclusionOverlapInvalid" })],
      },
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it.each(["missing_title", "guide", "procedure"])("rejects an overlap with a %s coverage identity", async (kind) => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: otherId, contentHash: "distinct-source" }]);
    const topic = { title: "Coverage anchor", role: "procedure" as const, sourceIds: [SOURCE_ID] };
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: kind === "procedure" ? [...foundations, topic] : foundations,
      excluded: [
        {
          sourceIds: [otherId],
          reason: "Covered by a retained page.",
          basis: "overlap",
          coveredByTitle: kind === "guide" ? foundations[foundations.length - 1].title : topic.title,
          coveredByRole: "offering",
        },
      ],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [expect.objectContaining({ customCode: "wikiSourceExclusionOverlapInvalid" })],
      },
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("accepts a source-specific overlap with the exact retained offering identity", async () => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: otherId, contentHash: "translated-source" }]);
    const offering = { title: "Support", role: "offering" as const, sourceIds: [SOURCE_ID] };
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [offering, ...foundations],
      excluded: [
        {
          sourceIds: [otherId],
          reason: "Translated evidence for the same offering.",
          basis: "overlap",
          coveredByTitle: offering.title,
          coveredByRole: "offering",
        },
      ],
    });
    expect(structured(result)).toMatchObject({ topicPlan: [offering, ...foundations] });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it.each(["different_hash", "same_source", "unknown_anchor", "unrepresented_anchor"])(
    "rejects an exact duplicate with %s evidence",
    async (kind) => {
      const sources = await harness.sources();
      const otherId = "00000000-0000-4000-8000-000000000002";
      const thirdId = "00000000-0000-4000-8000-000000000003";
      const duplicateOfSourceId = kind === "same_source" ? otherId : kind === "unknown_anchor" ? thirdId : SOURCE_ID;
      harness.sources.mockResolvedValue([
        ...sources,
        { ...sources[0], id: otherId, contentHash: kind === "different_hash" ? "different" : sources[0].contentHash },
      ]);
      const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
        action: "plan",
        topics: kind === "unrepresented_anchor" ? [] : foundations,
        omittedFoundations: kind === "unrepresented_anchor" ? omittedFoundations : undefined,
        excluded: [
          ...(kind === "unrepresented_anchor"
            ? [
                {
                  sourceIds: [SOURCE_ID],
                  basis: "not_substantive" as const,
                  reason: "No useful company evidence.",
                  evidenceQuote: GERMAN.slice(0, 100),
                },
              ]
            : []),
          { sourceIds: [otherId], basis: "exact_duplicate", duplicateOfSourceId, reason: "Exact stored duplicate." },
        ],
      });
      expect(result).toMatchObject({
        failure: {
          kind: "validation",
          issues: [expect.objectContaining({ customCode: "wikiSourceExclusionDuplicateInvalid" })],
        },
      });
      expect(harness.advance).not.toHaveBeenCalled();
    },
  );

  it("keeps an identical homepage duplicate valid when its anchor supports only foundations", async () => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: otherId }]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [
        {
          sourceIds: [otherId],
          basis: "exact_duplicate",
          duplicateOfSourceId: SOURCE_ID,
          reason: "Identical homepage content.",
        },
      ],
    });
    expect(structured(result)).toMatchObject({ topicPlan: foundations });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("rejects a claimed imported source without an authoritative unchanged import", async () => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: otherId, contentHash: "distinct-source" }]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [{ sourceIds: [otherId], basis: "already_imported", reason: "Already saved." }],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [expect.objectContaining({ customCode: "wikiSourceExclusionImportedInvalid" })],
      },
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("accepts an excluded unchanged imported source without manufacturing a new offering", async () => {
    const sources = await harness.sources();
    const otherId = "00000000-0000-4000-8000-000000000002";
    const importedAt = new Date();
    const url = "https://example.com/imported-help";
    harness.sources.mockResolvedValue([
      ...sources,
      { ...sources[0], id: otherId, url, contentHash: "imported-source" },
    ]);
    harness.imported.mockImplementation((candidate: string) =>
      Promise.resolve(
        candidate === url
          ? {
              sourceContentHash: "imported-source",
              updatedAt: importedAt,
              sourceImportedUpdatedAt: importedAt,
            }
          : null,
      ),
    );
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [
        {
          sourceIds: [otherId],
          basis: "already_imported",
          reason: "Already saved unchanged.",
        },
      ],
    });
    expect(structured(result)).toMatchObject({
      topicPlan: foundations,
      importedSources: 1,
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("rejects a non-substantive exclusion with a quote absent from that source", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [],
      omittedFoundations,
      excluded: [
        {
          sourceIds: [SOURCE_ID],
          basis: "not_substantive",
          reason: "No company information.",
          evidenceQuote: "This invented quotation is not present in the named source.",
        },
      ],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [expect.objectContaining({ customCode: "wikiSourceExclusionEvidenceInvalid" })],
      },
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("reports every invalid exclusion with its index and repair-specific typed failure", async () => {
    const sources = await harness.sources();
    const ids = [2, 3, 4, 5].map((index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    harness.sources.mockResolvedValue([
      ...sources,
      ...ids.map((id, index) => ({ ...sources[0], id, contentHash: `distinct-source-${index}` })),
    ]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
      excluded: [
        { sourceIds: [ids[0]], basis: "already_imported", reason: "Already saved." },
        { sourceIds: [ids[1]], basis: "exact_duplicate", duplicateOfSourceId: SOURCE_ID, reason: "Translated text." },
        {
          sourceIds: [ids[2]],
          basis: "overlap",
          coveredByTitle: foundations[0].title,
          coveredByRole: "offering",
          reason: "Covered by a foundation.",
        },
        {
          sourceIds: [ids[3]],
          basis: "not_substantive",
          reason: "No useful evidence.",
          evidenceQuote: "This quotation is absent from the source.",
        },
      ],
    });
    expect(result).toMatchObject({
      failure: {
        kind: "validation",
        issues: [
          expect.objectContaining({ path: ["excluded", 0, "basis"], customCode: "wikiSourceExclusionImportedInvalid" }),
          expect.objectContaining({
            path: ["excluded", 1, "duplicateOfSourceId"],
            customCode: "wikiSourceExclusionDuplicateInvalid",
          }),
          expect.objectContaining({
            path: ["excluded", 2, "coveredByTitle"],
            customCode: "wikiSourceExclusionOverlapInvalid",
          }),
          expect.objectContaining({
            path: ["excluded", 3, "evidenceQuote"],
            customCode: "wikiSourceExclusionEvidenceInvalid",
          }),
        ],
      },
    });
    for (const id of ids) expect(JSON.stringify(result)).toContain(id);
    expect(JSON.stringify(result)).not.toContain("Cite only ids returned");
    expect(harness.advance).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it.each(["literal_newline", "translated_quote", "ellipsis", "wrong_case"])(
    "rejects a %s alteration to exclusion evidence without normalizing it",
    async (kind) => {
      const text = "First exact factual sentence.\nSecond exact factual sentence.";
      const source = (await harness.sources())[0];
      harness.sources.mockResolvedValue([{ ...source, text, readOffset: text.length }]);
      const evidenceQuote =
        kind === "literal_newline"
          ? text.replaceAll("\n", "\\n")
          : kind === "translated_quote"
            ? "Primera frase factual exacta."
            : kind === "ellipsis"
              ? "First exact...Second exact factual sentence."
              : "FIRST exact factual sentence.";
      const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
        action: "plan",
        topics: [],
        omittedFoundations,
        excluded: [
          { sourceIds: [SOURCE_ID], basis: "not_substantive", reason: "No useful company evidence.", evidenceQuote },
        ],
      });
      expect(result).toMatchObject({
        failure: {
          kind: "validation",
          issues: [
            expect.objectContaining({
              path: ["excluded", 0, "evidenceQuote"],
              customCode: "wikiSourceExclusionEvidenceInvalid",
            }),
          ],
        },
      });
      expect(harness.advance).not.toHaveBeenCalled();
      expect(harness.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a free-text coverage exclusion without a source-specific basis", async () => {
    const result = await executeMcpTool(readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001"), [
      {
        action: "plan",
        topics: [],
        omittedFoundations,
        excluded: [{ sourceIds: [SOURCE_ID], reason: "Covered by the overview." }],
      },
    ]);
    expect(result).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("accepts a fully accounted plan without advancing source cursors", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [{ title: "Support", role: "offering", sourceIds: [SOURCE_ID] }, ...foundations],
      excluded: [],
    });
    expect(structured(result)).toMatchObject({
      topicPlan: expect.arrayContaining([expect.objectContaining({ title: "Support", sourceIds: [SOURCE_ID] })]),
      remainingSources: 0,
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("can explicitly reclassify an unusable thin source using its complete nonempty stored text", async () => {
    const sources = await harness.sources();
    const thinText = "# Home\nWelcome.";
    harness.sources.mockResolvedValue([
      { ...sources[0], text: thinText, contentHash: "thin-source", readOffset: thinText.length },
    ]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [],
      excluded: [
        nonSubstantiveExclusion(SOURCE_ID, "A welcome alone does not establish a substantive offering.", thinText),
      ],
      omittedFoundations,
      reclassifiedOfferings: [
        {
          title: "Home",
          sourceId: SOURCE_ID,
          reason: "This source is a welcome without substantive offering information.",
          evidenceQuote: thinText,
        },
      ],
    });

    expect(structured(result)).toMatchObject({ topicPlan: [], remainingSources: 0 });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("accepts an explicit offering reclassification only with an exact quote from its named stored source", async () => {
    const input = {
      action: "plan" as const,
      topics: foundations,
      reclassifiedOfferings: [
        {
          title: "Support",
          sourceId: SOURCE_ID,
          reason: "The source supports company guidance rather than a separate offering.",
          evidenceQuote: GERMAN.slice(0, 100),
        },
      ],
    };
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute(input);

    expect(structured(result)).toMatchObject({ topicPlan: foundations, remainingSources: 0 });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it.each(["absent", "blank", "invented", "unknown_source", "different_source", "short_partial"])(
    "rejects offering reclassification with %s source evidence",
    async (kind) => {
      const otherId = "00000000-0000-4000-8000-000000000002";
      const otherText = "The archive contains public articles without a separate product or service offer.";
      const sources = await harness.sources();
      if (kind === "different_source") {
        harness.sources.mockResolvedValue([
          ...sources,
          { ...sources[0], id: otherId, text: otherText, contentHash: "other-source", readOffset: otherText.length },
        ]);
      }
      const reclassification: Record<string, unknown> = {
        title: "Support",
        sourceId:
          kind === "unknown_source"
            ? "00000000-0000-4000-8000-000000000099"
            : kind === "different_source"
              ? otherId
              : SOURCE_ID,
        reason: "The source supports company guidance rather than a separate offering.",
        evidenceQuote:
          kind === "invented"
            ? "An invented claim not present anywhere in the stored sources."
            : kind === "blank"
              ? "   "
              : GERMAN.slice(0, 100),
      };
      if (kind === "short_partial") reclassification.evidenceQuote = GERMAN.slice(0, 10);
      if (kind === "absent") delete reclassification.evidenceQuote;
      const input = {
        action: "plan",
        topics: foundations,
        excluded:
          kind === "different_source"
            ? [nonSubstantiveExclusion(otherId, "No distinct offering in this archive.", otherText)]
            : [],
        reclassifiedOfferings: [reclassification],
      };
      const result = await executeMcpTool(readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001"), [input]);

      expect(result).toMatchObject({ ok: false, failure: { kind: "validation" } });
      expect(harness.advance).not.toHaveBeenCalled();
    },
  );

  it("does not admit a quoted reclassification before complete source coverage", async () => {
    const sources = await harness.sources();
    harness.sources.mockResolvedValue(sources.map((source: object) => ({ ...source, readOffset: 0 })));
    const input = {
      action: "plan",
      topics: foundations,
      reclassifiedOfferings: [
        { title: "Support", sourceId: SOURCE_ID, reason: "No separate offering.", evidenceQuote: GERMAN.slice(0, 100) },
      ],
    };
    const result = await executeMcpTool(readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001"), [input]);

    expect(result).toMatchObject({
      ok: false,
      failure: { issues: [expect.objectContaining({ customCode: "wikiSourceCoverageRequired" })] },
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("accepts omitted exclusions when every source is already accounted for", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations,
    });
    expect(structured(result)).toMatchObject({ topicPlan: foundations });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("identifies the exact unaccounted sources and accepts the repaired plan", async () => {
    const sources = await harness.sources();
    const missingId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: missingId }]);
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    const result = await reader.execute({ action: "plan", topics: foundations });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(JSON.stringify(result)).toContain(missingId);
    expect(
      structured(
        await reader.execute({
          action: "plan",
          topics: foundations,
          excluded: [
            {
              sourceIds: [missingId],
              basis: "exact_duplicate",
              duplicateOfSourceId: SOURCE_ID,
              reason: "Exact duplicate evidence",
            },
          ],
        }),
      ),
    ).toMatchObject({ topicPlan: foundations });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("identifies the missing role and accepts the repaired plan", async () => {
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    const result = await reader.execute({ action: "plan", topics: foundations.slice(1) });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(JSON.stringify(result)).toContain("company_overview");
    expect(structured(await reader.execute({ action: "plan", topics: foundations }))).toMatchObject({
      topicPlan: foundations,
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("identifies omitted topics even when every source is excluded", async () => {
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    const excluded = [nonSubstantiveExclusion(SOURCE_ID, "No usable company evidence")];
    const result = await reader.execute({ action: "plan", excluded, omittedFoundations });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(JSON.stringify(result)).toContain("Send a topics list");
    expect(
      structured(await reader.execute({ action: "plan", topics: [], excluded, omittedFoundations })),
    ).toMatchObject({
      topicPlan: [],
    });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it.each(["missing", "unknown", "duplicate"])("rejects a plan with %s source accounting", async (kind) => {
    const topics =
      kind === "missing"
        ? []
        : [
            {
              title: "Support",
              role: "offering" as const,
              sourceIds: [kind === "unknown" ? "00000000-0000-4000-8000-000000000099" : SOURCE_ID],
            },
          ];
    const excluded = kind === "duplicate" ? [nonSubstantiveExclusion(SOURCE_ID, "Duplicate")] : [];
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics,
      excluded,
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("rejects topic planning before full source reading", async () => {
    const sources = await harness.sources();
    harness.sources.mockResolvedValue(sources.map((source: object) => ({ ...source, readOffset: 0 })));
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [],
      excluded: [nonSubstantiveExclusion(SOURCE_ID, "Foundation evidence")],
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(harness.advance).not.toHaveBeenCalled();
  });

  it("allows no pages for unusable evidence only with reasoned source and foundation omissions", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [],
      excluded: [nonSubstantiveExclusion(SOURCE_ID, "No usable company evidence")],
      omittedFoundations,
    });
    expect(structured(result)).toMatchObject({ topicPlan: [] });
  });

  it.each(["initial", "extend"])("reserves foundation slots only for %s setup", async (mode) => {
    harness.crawl.mockResolvedValue({ locale: "en", mode, startedAt: new Date() });
    const sources = Array.from({ length: 12 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      url: `https://example.com/${index}`,
      text: "Verified source",
      contentHash: `hash-${index}`,
      readOffset: 100,
      title: `Service ${index}`,
      category: "other",
    }));
    harness.sources.mockResolvedValue(sources);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [
        ...sources.map((source) => ({ title: source.title, role: "offering" as const, sourceIds: [source.id] })),
        ...(mode === "initial" ? foundations : []),
      ],
      excluded: [],
    });
    if (mode === "initial") expect(result).toMatchObject({ failure: { kind: "validation" } });
    else {
      expect(structured(result)).toMatchObject({
        topicPlan: expect.arrayContaining([
          expect.objectContaining({ title: "Service 11", sourceIds: [sources[11].id] }),
        ]),
      });
    }
  });

  it("rejects duplicate planned titles even with distinct cited sources", async () => {
    const sources = await harness.sources();
    const secondId = "00000000-0000-4000-8000-000000000002";
    harness.sources.mockResolvedValue([...sources, { ...sources[0], id: secondId, contentHash: "hash-2" }]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [
        { title: "Support", role: "offering", sourceIds: [SOURCE_ID] },
        { title: "support", role: "offering", sourceIds: [secondId] },
      ],
      excluded: [],
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
  });

  it("permits distinct offerings and foundations to cite the same source", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: [
        { title: "Service A", role: "offering", sourceIds: [SOURCE_ID] },
        { title: "Service B", role: "offering", sourceIds: [SOURCE_ID] },
        ...foundations,
      ],
      excluded: [],
    });
    expect(structured(result)).toMatchObject({
      topicPlan: expect.arrayContaining([
        expect.objectContaining({ title: "Service A" }),
        expect.objectContaining({ title: "Service B" }),
      ]),
    });
  });

  it.each(["missing", "duplicate", "guide_missing", "guide_duplicate"])(
    "rejects %s initial role accounting",
    async (kind) => {
      const topics =
        kind === "missing"
          ? foundations.slice(1)
          : kind === "duplicate"
            ? [...foundations, foundations[0]]
            : kind === "guide_missing"
              ? foundations.slice(0, -1)
              : [...foundations, { ...foundations[4], title: "Another guide" }];
      const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
        action: "plan",
        topics,
        excluded: [],
      });
      expect(result).toMatchObject({ failure: { kind: "validation" } });
    },
  );

  it("permits unsupported foundations to be omitted without inventing content", async () => {
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
      action: "plan",
      topics: foundations.filter(({ role }) => role === "company_overview" || role === "operating_guide"),
      excluded: [],
      omittedFoundations: omittedFoundations.filter(({ role }) => role !== "company_overview"),
    });
    expect(structured(result)).toMatchObject({
      topicPlan: expect.arrayContaining([expect.objectContaining({ role: "operating_guide" })]),
    });
  });

  it("allows imported evidence for foundations without planning a duplicate offering", async () => {
    const importedAt = new Date();
    harness.imported.mockResolvedValue({
      sourceContentHash: "hash-1",
      updatedAt: importedAt,
      sourceImportedUpdatedAt: importedAt,
    });
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    expect(structured(await reader.execute({ action: "plan", topics: foundations, excluded: [] }))).toMatchObject({
      importedSources: 1,
    });
    const duplicate = await reader.execute({
      action: "plan",
      topics: [{ title: "Support", role: "offering", sourceIds: [SOURCE_ID] }, ...foundations],
      excluded: [],
    });
    expect(duplicate).toMatchObject({ failure: { kind: "validation" } });
  });

  it.each(["bad_title", "duplicate_citation"])(
    "rejects a plan with %s before accepting uncreatable work",
    async (kind) => {
      const invalid =
        kind === "bad_title"
          ? { title: "Sales Messaging and FAQs},{gaps:[", sourceIds: [SOURCE_ID] }
          : { title: "Service A", sourceIds: [SOURCE_ID, SOURCE_ID] };
      const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({
        action: "plan",
        topics: [{ ...invalid, role: "offering" }, ...foundations],
        excluded: [],
      });
      expect(result).toMatchObject({ failure: { kind: "validation" } });
    },
  );

  it.each(["content", "heading", "gap"])("rejects placeholder page links in generated %s", async (field) => {
    const value = { ...page(ENGLISH), gaps: [] as string[] };
    const invalid = "[Support](/wiki?page=...)";
    if (field === "content") value.sections[0].content = `${ENGLISH}\\n\\n${invalid}`;
    if (field === "heading") value.sections[0].heading = invalid;
    if (field === "gap") value.gaps = [invalid];
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [value],
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(JSON.stringify(result)).toContain("exact Knowledge Base page links");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects serialized tool fields accidentally included in a generated title", async () => {
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [{ ...page(ENGLISH), title: "Sales Messaging and FAQs},{gaps:[" }],
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("carries previously saved topics into every create result after conversation compaction", async () => {
    harness.count.mockResolvedValue(1);
    harness.createdPages.mockResolvedValue([{ id: SOURCE_ID, title: "Product A" }]);
    harness.create.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          title: "Company",
          kind: "knowledge",
          markdown: ENGLISH,
          whenToUse: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(structured(result)).toMatchObject({ createdPageTitles: ["Product A", "Company"], remainingPageSlots: 14 });
    expect(harness.createdPages).toHaveBeenCalledWith(expect.any(Date), 16);
  });

  it("keeps the source topic inventory and actual import count available after reading completes", async () => {
    harness.sources.mockResolvedValue([
      {
        id: SOURCE_ID,
        title: "Company",
        url: "https://example.com/products",
        category: "product",
        text: "# Product A\n\n## Integrations\n\nVerified facts.\n\n# Product B",
        contentHash: "hash-1",
        readOffset: 1000,
      },
    ]);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "list" });
    expect(structured(result)).toMatchObject({
      remainingSources: 0,
      importedSources: 0,
      items: [{ headings: ["Product A", "Integrations", "Product B"], imported: false, read: true }],
    });
  });

  it("recovers exact saved links on every reread after prior tool results are compacted", async () => {
    harness.createdPages.mockResolvedValue([{ id: SOURCE_ID, title: "Product A" }]);
    const tool = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    for (let round = 0; round < 4; round += 1) {
      const result = await tool.execute({ action: "get", id: SOURCE_ID, offset: 0 });
      expect(structured(result)).toMatchObject({
        createdPageLinks: [{ title: "Product A", path: `/wiki?page=${SOURCE_ID}` }],
        items: [{ text: GERMAN }],
      });
    }
    expect(harness.createdPages).toHaveBeenCalledWith(expect.any(Date), 16);
  });

  it("keeps maximum-length saved links intact while shrinking large source chunks", async () => {
    const created = Array.from({ length: 16 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: "文".repeat(120),
    }));
    harness.createdPages.mockResolvedValue(created);
    harness.sources.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: "Source",
        url: `https://example.com/${index}`,
        category: "other",
        text: "文".repeat(12_000),
        contentHash: `hash-${index}`,
        readOffset: 0,
      })),
    );
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "next" });
    expect(structured(result)).toMatchObject({
      createdPageLinks: created.map(({ id, title }) => ({
        title,
        path: `/wiki?page=${id}`,
      })),
    });
    const encoded = encodeToToon(structured(result));
    expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS - 1_000,
    );
    expect(harness.advance).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ offset: 0, end: expect.any(Number) })]),
    );
  });

  it("reports actual persisted imports, including quota and failed-create omissions", async () => {
    const tool = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    harness.sources.mockResolvedValue([
      {
        id: SOURCE_ID,
        url: "https://example.com/help",
        title: "Help",
        category: "help",
        text: ENGLISH,
        contentHash: "hash-1",
        readAt: null,
        readOffset: 0,
      },
    ]);
    for (const existing of [null, { sourceContentHash: "older-version" }]) {
      harness.imported.mockResolvedValue(existing);
      expect(await tool.execute({ action: "list" })).toMatchObject({
        structuredContent: { items: [{ imported: false }] },
      });
    }
    harness.imported.mockResolvedValue({
      sourceContentHash: "hash-1",
      updatedAt: new Date(1000),
      sourceImportedUpdatedAt: new Date(1000),
    });
    expect(await tool.execute({ action: "list" })).toMatchObject({
      structuredContent: { items: [{ imported: true }] },
    });
    expect(harness.imported).toHaveBeenCalledWith("https://example.com/help");
  });

  it("rejects a substantive foreign trigger even when section bodies match", async () => {
    const value = { ...page(ENGLISH), kind: "procedure" as const, whenToUse: GERMAN };
    const result = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [value],
    });
    expect(JSON.stringify(result)).toContain("Write every page in en");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects confidently foreign output using the persisted target even when tool locale differs", async () => {
    const result = await createWikiFromCrawlTool("de", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(GERMAN)],
    });
    expect(JSON.stringify(result)).toContain("Write every page in en");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects a foreign section hidden inside otherwise target-language content", async () => {
    const value = page(ENGLISH);
    value.sections.push({
      heading: "Details",
      content: GERMAN,
      evidence: [{ sourceId: SOURCE_ID, quote: GERMAN }],
    });
    await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [value],
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("accepts target-language synthesis grounded in foreign sources", async () => {
    await createWikiFromCrawlTool("de", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            markdown: expect.stringContaining(ENGLISH),
          }),
        ],
      }),
    );
  });

  it("an extension can add translated knowledge but cannot duplicate guides", async () => {
    harness.crawl.mockResolvedValue({
      locale: "en",
      mode: "extend",
      startedAt: new Date(),
    });
    const tool = createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001");
    const result = await tool.execute({
      action: "create",
      pages: [page(ENGLISH, "guide")],
    });
    expect(JSON.stringify(result)).toContain("knowledge pages only");
    expect(harness.create).not.toHaveBeenCalled();
    await tool.execute({ action: "create", pages: [page(ENGLISH)] });
    expect(harness.create).toHaveBeenCalledOnce();
  });
});

describe("complete stored source coverage", () => {
  const source = (index: number, text: string, readOffset = 0) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    url: `https://example.com/page-${index}`,
    category: "other",
    title: `Topic ${index}`,
    text,
    contentHash: `hash-${index}`,
    fetchedAt: new Date(),
    readAt: null as Date | null,
    readOffset,
  });

  function stored(sources: ReturnType<typeof source>[]) {
    harness.sources.mockImplementation(() => Promise.resolve(sources));
    harness.advance.mockImplementation((_crawlId, chunks: Array<{ id: string; offset: number; end: number }>) => {
      for (const chunk of chunks) {
        const entry = sources.find(({ id }) => id === chunk.id);
        if (!entry) throw new Error("Missing fixture");
        expect(chunk.offset).toBeLessThanOrEqual(entry.readOffset);
        entry.readOffset = Math.max(entry.readOffset, chunk.end);
        entry.readAt = entry.readOffset === entry.text.length ? new Date() : null;
      }
      return Promise.resolve();
    });
  }

  it("reads forty rich sources completely in at most twelve bounded batches and resumes persisted cursors", async () => {
    const sources = Array.from({ length: 40 }, (_, i) => source(i + 1, ENGLISH.repeat(30)));
    stored(sources);
    let calls = 0;
    const delivered = new Map<string, string>();
    while (sources.some(({ readOffset, text }) => readOffset < text.length)) {
      const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "next" });
      const value = structured(result) as {
        items: Array<{ id: string; text: string }>;
        remainingSources: number;
      };
      expect(value.items.length).toBeLessThanOrEqual(8);
      expect(value.items[0]).toMatchObject({
        title: expect.stringContaining("Topic"),
        url: expect.stringContaining("https://example.com/page-"),
        category: "other",
      });
      const encoded = encodeToToon(structured(result));
      expect(encoded.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
      expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThanOrEqual(
        WIKI_SOURCE_RESULT_MAX_CHARS,
      );
      expect(value.items.reduce((sum, item) => sum + item.text.length, 0)).toBeGreaterThan(6_000);
      for (const item of value.items) delivered.set(item.id, (delivered.get(item.id) ?? "") + item.text);
      calls += 1;
      expect(calls).toBeLessThanOrEqual(12);
    }
    expect(sources.every(({ readAt }) => readAt !== null)).toBe(true);
    expect(harness.advance).toHaveBeenCalledTimes(calls);
    for (const source of sources) expect(delivered.get(source.id)).toBe(source.text);
  });

  it("delivers actual source-body newlines in next/get without changing structured evidence or cursors", async () => {
    const text = '# Service A\n\nAn exact source sentence.\n\t"Quoted" public evidence and 🌍知識.';
    const sources = [source(1, text)];
    stored(sources);
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    for (const request of [{ action: "next" as const }, { action: "get" as const, id: sources[0].id, offset: 0 }]) {
      const outcome = await executeMcpTool(reader, [request]);
      if (!outcome.ok) throw new Error("Expected a successful source read");
      expect(outcome.result).toContain(text);
      expect(outcome.result).toContain('\n\nAn exact source sentence.\n\t"Quoted"');
      expect(outcome.result).not.toContain(text.replaceAll("\n", "\\n"));
      expect(outcome.structuredContent).toMatchObject({
        remainingSources: 0,
        items: [{ id: sources[0].id, offset: 0, nextOffset: null, text }],
      });
      expect(new TextEncoder().encode(JSON.stringify(outcome.result)).byteLength).toBeLessThanOrEqual(
        WIKI_SOURCE_RESULT_MAX_CHARS,
      );
      expect(sources[0].readOffset).toBe(text.length);
    }
  });

  it("includes canonical FAQ evidence in the stored hash and reads through the appended answer before completion", async () => {
    const pair = {
      question: "Does this offering support incremental retrieval?",
      answer: "Incremental retrieval requires the documented remote API capability.",
    };
    const body = `# Service A\n${"Evidence paragraph. ".repeat(650)}`;
    const text = wikiSourceText({ text: body, qaPairs: [pair] });
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const canonical = { ...source(1, text), contentHash: hash(text) };
    stored([canonical]);
    const reader = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    const first = structured(await reader.execute({ action: "next" })) as {
      items: Array<{ offset: number; text: string; nextOffset: number | null }>;
      remainingSources: number;
    };

    expect(first).toMatchObject({ remainingSources: 1, items: [{ offset: 0, nextOffset: 12_000 }] });
    expect(first.items[0].text).not.toContain(pair.answer);
    expect(canonical.readOffset).toBe(12_000);
    expect(canonical.readAt).toBeNull();
    const premature = await reader.execute({ action: "plan", topics: foundations });
    expect(premature).toMatchObject({
      failure: { issues: [expect.objectContaining({ customCode: "wikiSourceCoverageRequired" })] },
    });
    const second = structured(await reader.execute({ action: "next" })) as {
      items: Array<{ offset: number; text: string; nextOffset: number | null }>;
      remainingSources: number;
    };

    expect(second).toMatchObject({ remainingSources: 0, items: [{ offset: 12_000, nextOffset: null }] });
    expect(second.items[0].text).toContain(pair.question);
    expect(second.items[0].text).toContain(pair.answer);
    expect(first.items[0].text + second.items[0].text).toBe(text);
    expect(canonical.readOffset).toBe(text.length);
    expect(canonical.readAt).not.toBeNull();
    for (const result of [first, second]) {
      expect(new TextEncoder().encode(JSON.stringify(encodeToToon(result))).byteLength).toBeLessThanOrEqual(
        WIKI_SOURCE_RESULT_MAX_CHARS,
      );
    }
    expect(hash(wikiSourceText({ text, qaPairs: [pair] }))).toBe(canonical.contentHash);
    expect(
      hash(wikiSourceText({ text: body, qaPairs: [{ ...pair, answer: "Incremental retrieval is not available." }] })),
    ).not.toBe(canonical.contentHash);
  });

  it("finishes initial coverage before allowing citation rereads and preserves completed cursors", async () => {
    const sources = [source(1, ENGLISH, ENGLISH.length), source(2, GERMAN)];
    stored(sources);
    const tool = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    for (const id of sources.map((item) => item.id)) {
      const denied = await executeMcpTool(tool, [{ action: "get", id, offset: 0 }]);
      expect(denied).toMatchObject({ ok: false, failure: { kind: "validation" } });
      expect(JSON.stringify(denied)).toContain("action=next");
    }
    expect(harness.advance).not.toHaveBeenCalled();
    expect(structured(await tool.execute({ action: "next" }))).toMatchObject({ remainingSources: 0 });
    const reread = await tool.execute({ action: "get", id: sources[0].id, offset: 0 });
    expect(structured(reread)).toMatchObject({ remainingSources: 0, items: [{ text: ENGLISH, offset: 0 }] });
    expect(sources.map(({ readOffset, text }) => readOffset === text.length)).toEqual([true, true]);
  });

  it("returns a forty-page topic inventory without extra pagination calls", async () => {
    stored(Array.from({ length: 40 }, (_, i) => source(i + 1, `# Topic ${i}\n\n${ENGLISH}`)));
    const result = structured(
      await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "list" }),
    ) as { items: unknown[]; nextOffset: number | null };
    expect(result.items).toHaveLength(40);
    expect(result.nextOffset).toBeNull();
  });

  it("keeps multibyte evidence within the provider byte bound and advances only delivered text", async () => {
    const sources = Array.from({ length: 8 }, (_, i) => source(i + 1, "🌍知識".repeat(4000)));
    stored(sources);
    const result = structured(
      await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "next" }),
    ) as { items: Array<{ id: string; offset: number; text: string }> };
    expect(new TextEncoder().encode(JSON.stringify(encodeToToon(result))).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS,
    );
    for (const chunk of result.items)
      expect(sources.find(({ id }) => id === chunk.id)?.readOffset).toBe(chunk.offset + chunk.text.length);
  });

  it("rejects skipped text and premature creation even after the first chunk was read", async () => {
    const sources = [source(1, ENGLISH.repeat(80))];
    stored(sources);
    const tool = readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001");
    expect(JSON.stringify(await tool.execute({ action: "get", id: SOURCE_ID, offset: 100 }))).toContain(
      "without skipping",
    );
    expect(harness.advance).not.toHaveBeenCalled();
    await tool.execute({ action: "next" });
    expect(sources[0].readAt).toBeNull();
    const premature = await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(premature).toMatchObject({
      failure: { issues: [expect.objectContaining({ customCode: "wikiSourceCoverageRequired" })] },
    });
    expect(JSON.stringify(premature)).toContain("1 sources remain");
    const outcome = await executeMcpTool(createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001"), [
      { action: "create", pages: [page(ENGLISH)] },
    ]);
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(agentToolOutcomeStatus(outcome)).toMatchObject({ failed: true, status: "error" });
    expect(harness.create).not.toHaveBeenCalled();
    await tool.execute({ action: "next" });
    await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
      action: "create",
      pages: [page(ENGLISH, "knowledge", ENGLISH)],
    });
    expect(harness.create).toHaveBeenCalledOnce();
  });

  it("shares complete exact-content coverage and excludes only actual imported revisions", async () => {
    const original = source(1, ENGLISH, ENGLISH.length);
    const duplicate = { ...source(2, ENGLISH), contentHash: original.contentHash };
    const imported = source(3, GERMAN);
    const stale = source(4, GERMAN);
    stored([original, duplicate, imported, stale]);
    harness.imported.mockImplementation((url) =>
      Promise.resolve(
        url === imported.url
          ? {
              sourceContentHash: imported.contentHash,
              updatedAt: new Date(1000),
              sourceImportedUpdatedAt: new Date(1000),
            }
          : { sourceContentHash: "stale" },
      ),
    );
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "list" });
    expect(structured(result)).toMatchObject({
      remainingSources: 1,
      items: [{ read: true }, { read: true }, { imported: true }, { imported: false }],
    });
  });

  it("requires reading manually edited imported pages even when their source hash still matches", async () => {
    stored([source(1, ENGLISH)]);
    for (const baseline of [null, new Date(1000)]) {
      harness.imported.mockResolvedValue({
        sourceContentHash: "hash-1",
        updatedAt: new Date(2000),
        sourceImportedUpdatedAt: baseline,
      });
      expect(
        structured(await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "list" })),
      ).toMatchObject({
        remainingSources: 1,
        items: [{ imported: false }],
      });
      await createWikiFromCrawlTool("en", "00000000-0000-4000-8000-00000000c001").execute({
        action: "create",
        pages: [page(ENGLISH)],
      });
      expect(harness.create).not.toHaveBeenCalled();
    }
  });

  it("does not treat legacy readAt as complete coverage", async () => {
    stored([{ ...source(1, ENGLISH), readAt: new Date() }]);
    expect(
      structured(await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "list" })),
    ).toMatchObject({
      remainingSources: 1,
      items: [{ read: false, nextOffset: 0 }],
    });
  });

  it("bounds escaped source output without advancing beyond returned text", async () => {
    const sources = Array.from({ length: 4 }, (_, i) => source(i + 1, '\n\t"'.repeat(4000)));
    stored(sources);
    const result = await readWebsiteSourceTool("00000000-0000-4000-8000-00000000c001").execute({ action: "next" });
    const value = structured(result) as {
      items: Array<{ id: string; offset: number; text: string }>;
    };
    const encoded = encodeToToon(structured(result));
    expect(encoded.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
    expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS,
    );
    for (const chunk of value.items)
      expect(sources.find(({ id }) => id === chunk.id)?.readOffset).toBe(chunk.offset + chunk.text.length);
  });
});
