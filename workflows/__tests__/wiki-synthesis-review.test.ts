import { describe, expect, it } from "vitest";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import { WikiCrawlSynthesisCreateSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";
import { classifierSpecProblems, type ClassifierResult } from "@/ee/agent-chat/classifier/spec";
import { jevRequestBody } from "@/ee/agent-chat/classifier/jev-runner";
import {
  prepareWikiSynthesisReview,
  wikiSynthesisReviewDecision,
  wikiSynthesisReviewPassages,
  parseWikiSynthesisReviewReceipt,
  recordWikiSynthesisReviewCharge,
  type WikiSynthesisReviewEvaluation,
  type WikiSynthesisReviewRequest,
} from "../wiki-synthesis-review";

const sourceId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const quotation = "We support the ongoing migration. Some older functions are only partly transferable.";
const create = (content = "The source describes ongoing migration support and partial applicability.") =>
  WikiCrawlSynthesisCreateSchema.parse({
    action: "create",
    pages: [
      {
        title: "Migration support",
        kind: "knowledge",
        sourceIds: [sourceId],
        gaps: ["Which internal approvals apply?"],
        sections: [{ heading: "Scope", content, evidence: [{ sourceId, quote: quotation }] }],
      },
    ],
  });
const sources = () => new Map([[sourceId, { text: quotation, contentHash: "current-source-version" }]]);
const ready = (input = create(), data = sources(), savedPages: Array<{ id: string; title: string }> = []) => {
  const prepared = prepareWikiSynthesisReview(input, data, savedPages, "en", 198_000);
  if (!prepared.ok) throw new Error("Expected a complete review request.");
  return prepared.request;
};
const answer = (request: WikiSynthesisReviewRequest, choices: Record<string, string> = {}): ClassifierResult => ({
  model: "jev",
  costMicrocents: 0,
  latencyMs: 1,
  answers: Object.fromEntries(
    request.locations.map(({ id }) => [
      id,
      {
        type: "choice",
        choice: choices[id] ?? "supported",
        confidence: 0.99,
        probabilities: null,
      },
    ]),
  ),
});

describe("website synthesis semantic review preparation", () => {
  it("sends complete section wording, own evidence and full canonical source context with valid question identifiers", () => {
    const input = create("The company completed the whole migration.");
    const request = ready(input);
    expect(classifierSpecProblems(request.spec)).toEqual([]);
    expect(request.locations).toEqual([
      { id: "p0_metadata", path: ["pages", 0], pageTitle: "Migration support" },
      { id: "p0_s0", path: ["pages", 0, "sections", 0, "content"], pageTitle: "Migration support" },
    ]);
    expect(request.state).toMatchObject({
      locale: "en",
      sources: { [sourceId]: { text: quotation } },
      candidates: {
        p0_s0: { content: "The company completed the whole migration.", evidence: [{ sourceId, quote: quotation }] },
        p0_metadata: { gaps: ["Which internal approvals apply?"] },
      },
    });
  });

  it("validates canonical quotations beyond the first 12,000-character source frame", () => {
    const text = "Earlier material.\n\n".repeat(1_000) + quotation + "\n\nNo completed delivery is described.";
    const request = ready(create(), new Map([[sourceId, { text, contentHash: "later-passage" }]]));
    expect(JSON.stringify(jevRequestBody(request.spec, request.state))).toContain(quotation);
    expect(JSON.stringify(request.state)).toContain("No completed delivery is described.");
  });

  it("rejects every wrong or borrowed quotation before a provider can be called", () => {
    const input = create();
    input.pages.push({ ...create().pages[0], title: "Second page" });
    input.pages[0].sections[0].evidence = [
      { sourceId, quote: "A claim that is not present in this source." },
      { sourceId: otherId, quote: quotation },
    ];
    input.pages[1].sections[0].evidence = [{ sourceId, quote: "Another invented supporting passage." }];
    expect(
      prepareWikiSynthesisReview(
        input,
        new Map([...sources(), [otherId, { text: quotation, contentHash: "other" }]]),
        [],
        "en",
        198_000,
      ),
    ).toEqual({
      ok: false,
      reason: "evidence",
      paths: [
        ["pages", 0, "sections", 0, "evidence", 0],
        ["pages", 0, "sections", 0, "evidence", 1],
        ["pages", 1, "sections", 0, "evidence", 0],
      ],
    });
  });

  it("selects whole quote paragraphs and both neighboring qualification paragraphs, preserving Unicode and line breaks", () => {
    const text =
      "Unrelated introduction.\n\nCondition: available only for the older platform.\n\nWe support the ongoing migration. 😀\n\nLimit: transfer is partial.\n\nUnrelated appendix.";
    const quote = "We support the ongoing migration. 😀";
    const contexts = wikiSynthesisReviewPassages(text, [quote]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].text).toBe(
      "Condition: available only for the older platform.\n\nWe support the ongoing migration. 😀\n\nLimit: transfer is partial.\n\n",
    );
    expect(text.slice(contexts[0].start, contexts[0].end)).toBe(contexts[0].text);
  });

  it("includes all ambiguous quote occurrences with their own conditions", () => {
    const text =
      "Case A ongoing.\n\nCommon capability.\n\nCase A conditions.\n\nSeparate section.\n\nCase B completed.\n\nCommon capability.\n\nCase B conditions.";
    const contexts = wikiSynthesisReviewPassages(text, ["Common capability."]);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].text).toContain("Case A ongoing.");
    expect(contexts[1].text).toContain("Case B completed.");
  });

  it("never truncates a large required paragraph or accepts a Gemini-sized request outside the pinned Jev window", () => {
    const input = create();
    const text = quotation + " " + "x".repeat(80_000);
    expect(
      prepareWikiSynthesisReview(input, new Map([[sourceId, { text, contentHash: "large" }]]), [], "en", 198_000),
    ).toEqual({
      ok: false,
      reason: "size",
      paths: [["pages", 0]],
    });
    expect(prepareWikiSynthesisReview(input, sources(), [], "en", 100)).toEqual({
      ok: false,
      reason: "size",
      paths: [["pages", 0]],
    });
  });

  it("uses complete local source paragraphs when long unrelated material does not fit, without clipping the required condition", () => {
    const text =
      "Unrelated material. ".repeat(5_000) +
      "\n\nCondition: this work is ongoing.\n\n" +
      quotation +
      "\n\nLimitation: transfer remains partial.";
    const request = ready(create(), new Map([[sourceId, { text, contentHash: "large-with-boundaries" }]]));
    const wire = JSON.stringify(request.state);
    expect(wire).toContain(quotation);
    expect(wire).toContain("Condition: this work is ongoing.");
    expect(wire).toContain("Limitation: transfer remains partial.");
    expect(wire).not.toContain("Unrelated material.");
  });

  it("binds saved page linkage and the canonical source version into a reusable approval identity", () => {
    const request = ready(create(), sources(), [{ id: otherId, title: "Published overview" }]);
    expect(request.state.savedPages).toEqual([{ id: otherId, title: "Published overview" }]);
    const updated = ready(create(), new Map([[sourceId, { text: quotation, contentHash: "new-version" }]]), [
      { id: otherId, title: "Published overview" },
    ]);
    expect(JSON.stringify(updated.state)).not.toBe(JSON.stringify(request.state));
  });
});

describe("website synthesis explicit semantic decisions", () => {
  it("accepts only complete explicit supported answers, independently of probability or confidence", () => {
    const request = ready();
    const result = answer(request);
    result.answers.p0_s0.confidence = null;
    expect(wikiSynthesisReviewDecision(request, result)).toEqual({ kind: "supported" });
  });

  it("reports all qualified and unsupported locations atomically even when confidence is high", () => {
    const input = create();
    input.pages.push({ ...input.pages[0], title: "Second page" });
    const request = ready(input);
    expect(
      wikiSynthesisReviewDecision(
        request,
        answer(request, { p0_s0: "qualified", p1_metadata: "unsupported", p1_s0: "unsupported" }),
      ),
    ).toEqual({
      kind: "rejected",
      issues: [
        {
          id: "p0_s0",
          path: ["pages", 0, "sections", 0, "content"],
          pageTitle: "Migration support",
          decision: "qualified",
        },
        { id: "p1_metadata", path: ["pages", 1], pageTitle: "Second page", decision: "unsupported" },
        {
          id: "p1_s0",
          path: ["pages", 1, "sections", 0, "content"],
          pageTitle: "Second page",
          decision: "unsupported",
        },
      ],
    });
  });

  it.each(["missing", "unknown", "null"])(
    "fails closed on a %s decision instead of treating unavailable review as permission",
    (mode) => {
      const request = ready();
      const result = answer(request);
      if (mode === "missing") delete result.answers.p0_s0;
      if (mode === "unknown") result.answers.p0_s0.choice = "probably";
      expect(wikiSynthesisReviewDecision(request, mode === "null" ? null : result)).toEqual({ kind: "unavailable" });
    },
  );
});

describe("durable website synthesis review accounting", () => {
  const requestSha256 = "a".repeat(64);
  const unknown = () => ({
    schemaVersion: 1,
    requestSha256,
    result: null,
    charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 9_000, measured: false, answered: false },
  });
  const reviewedAnswer = (costMicrocents: number | null) =>
    parseWikiSynthesisReviewReceipt(
      {
        ...unknown(),
        result: { ...answer(ready()), costMicrocents },
        charge: {
          ...unknown().charge,
          costMicrocents: costMicrocents ?? 400,
          measured: costMicrocents !== null,
          answered: true,
        },
      },
      requestSha256,
    ).result;

  it("recovers the full conservative unknown receipt and validates the complete review identity", () => {
    expect(parseWikiSynthesisReviewReceipt(unknown(), requestSha256)).toEqual(unknown());
    expect(() => parseWikiSynthesisReviewReceipt(unknown(), "b".repeat(64))).toThrow("identity changed");
    expect(() => parseWikiSynthesisReviewReceipt({ ...unknown(), schemaVersion: 2 }, requestSha256)).toThrow();
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY])(
    "rejects an invalid persisted charge %s instead of authorizing a candidate",
    (costMicrocents) => {
      const receipt = unknown();
      receipt.charge.costMicrocents = costMicrocents;
      expect(() => parseWikiSynthesisReviewReceipt(receipt, requestSha256)).toThrow();
    },
  );

  it("counts a replayed attempt once and upgrades only its settled measured charge", () => {
    const charges: ClassifierCharge[] = [
      { use: "docs_rerank", model: "jev", costMicrocents: 100, measured: true, answered: true },
    ];
    const indices = new Map<string, number>();
    const saved = parseWikiSynthesisReviewReceipt(unknown(), requestSha256);
    const replay: WikiSynthesisReviewEvaluation = { receiptKey: requestSha256, settled: false, ...saved };
    recordWikiSynthesisReviewCharge(charges, indices, replay);
    recordWikiSynthesisReviewCharge(charges, indices, replay);
    expect(charges.map(({ costMicrocents }) => costMicrocents)).toEqual([100, 9_000]);
    const actual: WikiSynthesisReviewEvaluation = {
      receiptKey: requestSha256,
      settled: true,
      result: reviewedAnswer(600),
      charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 600, measured: true, answered: true },
    };
    recordWikiSynthesisReviewCharge(charges, indices, actual);
    recordWikiSynthesisReviewCharge(charges, indices, replay);
    recordWikiSynthesisReviewCharge(charges, indices, actual);
    expect(charges.map(({ costMicrocents }) => costMicrocents)).toEqual([100, 600]);
    recordWikiSynthesisReviewCharge(charges, indices, { ...actual, receiptKey: "b".repeat(64) });
    expect(charges.map(({ costMicrocents }) => costMicrocents)).toEqual([100, 600, 600]);
  });

  it("does not replace the unknown reserve with another unmeasured estimate", () => {
    const charges: ClassifierCharge[] = [];
    const indices = new Map<string, number>();
    const saved = parseWikiSynthesisReviewReceipt(unknown(), requestSha256);
    recordWikiSynthesisReviewCharge(charges, indices, { receiptKey: requestSha256, settled: false, ...saved });
    recordWikiSynthesisReviewCharge(charges, indices, {
      receiptKey: requestSha256,
      settled: true,
      result: reviewedAnswer(null),
      charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 400, measured: false, answered: true },
    });
    expect(charges).toEqual([saved.charge]);
  });

  it("removes a proven-unstarted reserve without corrupting other charge indices or reviving late unknown replay", () => {
    const charges: ClassifierCharge[] = [
      { use: "docs_rerank", model: "jev", costMicrocents: 100, measured: true, answered: true },
    ];
    const indices = new Map<string, number>();
    const saved = parseWikiSynthesisReviewReceipt(unknown(), requestSha256);
    const first: WikiSynthesisReviewEvaluation = { receiptKey: requestSha256, settled: false, ...saved };
    const second: WikiSynthesisReviewEvaluation = { ...first, receiptKey: "b".repeat(64) };
    recordWikiSynthesisReviewCharge(charges, indices, first);
    recordWikiSynthesisReviewCharge(charges, indices, second);
    recordWikiSynthesisReviewCharge(charges, indices, {
      receiptKey: requestSha256,
      settled: true,
      result: null,
      charge: null,
    });
    recordWikiSynthesisReviewCharge(charges, indices, first);
    expect(charges.map(({ costMicrocents }) => costMicrocents)).toEqual([100, 9_000]);
    recordWikiSynthesisReviewCharge(charges, indices, {
      receiptKey: second.receiptKey,
      settled: true,
      result: reviewedAnswer(600),
      charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 600, measured: true, answered: true },
    });
    expect(charges.map(({ costMicrocents }) => costMicrocents)).toEqual([100, 600]);
  });

  it.each(["missing", "unanswered", "unmeasured", "different_amount", "no_result"])(
    "rejects a persisted %s charge/result combination instead of authorizing an unpaid replay",
    (mode) => {
      const result = { ...answer(ready()), costMicrocents: 600 };
      const charge = {
        use: "wiki_synthesis_review",
        model: "jev",
        costMicrocents: 600,
        measured: true,
        answered: true,
      };
      if (mode === "unanswered") charge.answered = false;
      if (mode === "unmeasured") charge.measured = false;
      if (mode === "different_amount") charge.costMicrocents = 601;
      expect(() =>
        parseWikiSynthesisReviewReceipt(
          {
            schemaVersion: 1,
            requestSha256,
            result: mode === "no_result" ? null : result,
            charge: mode === "missing" ? null : charge,
          },
          requestSha256,
        ),
      ).toThrow();
    },
  );

  it("accepts proven-unstarted and estimated sent-failure receipts without inventing a supported result", () => {
    expect(parseWikiSynthesisReviewReceipt({ ...unknown(), charge: null }, requestSha256).charge).toBeNull();
    expect(parseWikiSynthesisReviewReceipt(unknown(), requestSha256).result).toBeNull();
  });
});
