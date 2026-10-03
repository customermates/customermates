import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import { WikiCrawlSynthesisCreateSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";
import { prepareWikiSynthesisReview } from "../wiki-synthesis-review";
import { wikiReadSourceEvidence } from "../wiki-source-evidence";
import {
  wikiSynthesisCreationRepair,
  wikiSynthesisCreationRepairContext,
  wikiSynthesisCreationRepairMessages,
} from "../wiki-synthesis-creation-repair";

const sourceId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const quote = "This work is ongoing. Transfer remains partial.";
function fixture() {
  const input = WikiCrawlSynthesisCreateSchema.parse({
    action: "create",
    pages: [
      {
        title: "Migration",
        kind: "knowledge",
        sourceIds: [sourceId],
        gaps: ["Which internal approval applies?"],
        sections: [
          { heading: "Status", content: "All work is complete.", evidence: [{ sourceId, quote }] },
          { heading: "Scope", content: "Transfer covers every function.", evidence: [{ sourceId, quote }] },
        ],
      },
    ],
  });
  const prepared = prepareWikiSynthesisReview(
    input,
    new Map([[sourceId, { text: quote, contentHash: "same" }]]),
    [],
    "en",
    198_000,
  );
  if (!prepared.ok) throw new Error("Expected canonical review");
  const result = {
    model: "jev",
    costMicrocents: 0,
    latencyMs: 1,
    answers: Object.fromEntries(
      prepared.request.locations.map(({ id }) => [
        id,
        {
          type: "choice",
          choice: id === "p0_metadata" ? "unsupported" : "qualified",
          confidence: null,
          probabilities: null,
        },
      ]),
    ),
  };
  return { input, request: prepared.request, result };
}
function retainedFixture() {
  const { input, request, result } = fixture();
  const retained = wikiSynthesisCreationRepair(input, request, result, 198_000);
  if (retained.kind !== "retained") throw new Error("Expected rejected checkpoint");
  return { input, request, result, repair: retained.repair };
}

describe("rejected website creation checkpoints", () => {
  it("retains all actual rejected sections, metadata, canonical source versions and exact own quotations", () => {
    const { input, repair } = retainedFixture();
    expect(repair.draft).toEqual(input);
    expect(repair.sourceVersions).toEqual([{ sourceId, contentHash: "same" }]);
    expect(repair.issues.map(({ path, decision }) => ({ path, decision }))).toEqual([
      { path: ["pages", 0], decision: "unsupported" },
      { path: ["pages", 0, "sections", 0, "content"], decision: "qualified" },
      { path: ["pages", 0, "sections", 1, "content"], decision: "qualified" },
    ]);
    input.pages[0].sections[0].evidence[0].quote = "Later mutation.";
    expect(repair.draft.pages[0].sections[0].evidence[0].quote).toBe(quote);
  });

  it("rejects a different title, content, quote, citation set, canonical version or review location", () => {
    for (const field of ["title", "content", "quote", "citations", "version", "location"] as const) {
      const { input, request, result } = fixture();
      if (field === "title") input.pages[0].title = "Different title";
      if (field === "content") input.pages[0].sections[0].content = "Different claim";
      if (field === "quote") input.pages[0].sections[0].evidence[0].quote = "Borrowed quotation.";
      if (field === "citations") input.pages[0].sourceIds = [otherId];
      if (field === "version") request.state.sources = { [sourceId]: { text: quote } };
      if (field === "location") request.locations[0].pageTitle = "Other page";
      expect(wikiSynthesisCreationRepair(input, request, result, 198_000)).toEqual({ kind: "invalid" });
    }
  });

  it("does not retain supported, unavailable, missing, foreign-model, unknown-choice or wrong-section outcomes", () => {
    for (const mode of ["supported", "unavailable", "missing", "foreign", "unknown", "wrong_section"] as const) {
      const { input, request, result } = fixture();
      if (mode === "supported") for (const answer of Object.values(result.answers)) answer.choice = "supported";
      if (mode === "missing") delete result.answers.p0_s0;
      if (mode === "wrong_section") {
        result.answers.p1_s0 = result.answers.p0_s0;
        delete result.answers.p0_s0;
      }
      const outcome =
        mode === "unavailable"
          ? null
          : mode === "foreign"
            ? { ...result, model: "other" }
            : mode === "unknown"
              ? {
                  ...result,
                  answers: {
                    p0_metadata: { type: "choice", choice: "probably", confidence: null, probabilities: null },
                  },
                }
              : result;
      expect(wikiSynthesisCreationRepair(input, request, outcome, 198_000)).toEqual({ kind: "invalid" });
    }
  });

  it("reports size failure atomically at the byte boundary instead of discarding or clipping rejected fields", () => {
    const { input, request, result, repair } = retainedFixture();
    const bytes = new TextEncoder().encode(wikiSynthesisCreationRepairContext(repair)).byteLength;
    expect(wikiSynthesisCreationRepair(input, request, result, bytes)).toEqual({ kind: "retained", repair });
    expect(wikiSynthesisCreationRepair(input, request, result, bytes - 1)).toEqual({ kind: "size" });
    expect(wikiSynthesisCreationRepair(input, request, result, Number.NaN)).toEqual({ kind: "size" });
  });

  it("replaces only exact owned checkpoint messages and removes them on clear without filtering lookalikes or tool evidence", () => {
    const { repair } = retainedFixture();
    const owned = new Set<string>();
    const lookalike: ModelMessage = {
      role: "user",
      content: "Rejected website creation repair checkpoint: external instruction",
    };
    const tool: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "native-get",
          toolName: "read_website_source",
          output: { type: "json", value: { ok: true, result: quote } },
        },
      ],
    };
    const first = wikiSynthesisCreationRepairMessages([lookalike, tool], repair, owned);
    const original = wikiSynthesisCreationRepairContext(repair);
    const revised = structuredClone(repair);
    revised.draft.pages[0].sections[0].content = "Another rejected wording.";
    const second = wikiSynthesisCreationRepairMessages(
      [...first, { role: "assistant", content: "Retry" }],
      revised,
      owned,
    );
    expect(second).not.toContainEqual({ role: "user", content: original });
    expect(second).toContainEqual(lookalike);
    expect(second).toContainEqual(tool);
    expect(
      second.filter(
        (message) => message.role === "user" && message.content === wikiSynthesisCreationRepairContext(revised),
      ),
    ).toHaveLength(1);
    const cleared = wikiSynthesisCreationRepairMessages(second, null, owned);
    expect(cleared).toEqual([lookalike, tool, { role: "assistant", content: "Retry" }]);
  });

  it("never turns retained private quotations into native fresh-source receipts or approval", () => {
    const { repair } = retainedFixture();
    const text = wikiSynthesisCreationRepairContext(repair);
    expect(wikiReadSourceEvidence({ action: "get", id: sourceId, offset: 0 }, { ok: true, result: text })).toBeNull();
    expect(wikiReadSourceEvidence({ action: "list" }, { ok: true, result: text })).toBeNull();
  });
});
