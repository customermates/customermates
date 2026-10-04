import { describe, expect, it } from "vitest";

import {
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
} from "@/ee/agent-chat/agent-model";
import { classifierContextTokens, ovhClassifierRequestBytes } from "@/ee/agent-chat/classifier/ovh-runner";

import {
  WIKI_SYNTHESIS_REVIEW_MODEL,
  wikiSynthesisReviewDecision,
  wikiSynthesisReviewRequest,
  type WikiSynthesisCandidate,
} from "../wiki-synthesis-review";

const QUOTE = "Scheduling assigns technicians by skills and location.";

function candidate(): WikiSynthesisCandidate {
  return {
    title: "Scheduling",
    kind: "knowledge",
    sourceIds: ["s1"],
    sections: [
      {
        heading: "How it works",
        content: "The module assigns technicians by skills and location.",
        evidence: [{ sourceId: "s1", quote: QUOTE }],
      },
    ],
    gaps: [],
  };
}

function sourceOf(bytes: number) {
  const filler = "Unrelated paragraph about the company history.\n\n";
  return { text: `${filler.repeat(Math.ceil(bytes / filler.length))}${QUOTE}\n\n${filler}` };
}

function requiredRequest(request: ReturnType<typeof wikiSynthesisReviewRequest>) {
  if (!request) throw new Error("expected a review request");
  return request;
}

function requestTokens(request: ReturnType<typeof wikiSynthesisReviewRequest>) {
  const { spec, state } = requiredRequest(request);
  return (
    Math.ceil(
      ovhClassifierRequestBytes(spec, state, WIKI_SYNTHESIS_REVIEW_MODEL) / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
    ) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS
  );
}

describe("website import review request", () => {
  it("reviews with an OVHcloud classifier model and sends whole sources while they fit its context", () => {
    const request = wikiSynthesisReviewRequest(candidate(), new Map([["s1", sourceOf(10_000)]]), "en");

    expect(WIKI_SYNTHESIS_REVIEW_MODEL.startsWith("ovh/")).toBe(true);
    expect(request?.spec.questions.map(({ id }) => id)).toEqual(["page", "s0"]);
    expect(request?.state.sources).toEqual({ s1: sourceOf(10_000) });
    expect(requestTokens(request)).toBeLessThan(classifierContextTokens(WIKI_SYNTHESIS_REVIEW_MODEL));
  });

  it("falls back to the cited passages when a whole source exceeds the model's context", () => {
    const bytes = classifierContextTokens(WIKI_SYNTHESIS_REVIEW_MODEL) * AGENT_MIN_BYTES_PER_PROVIDER_TOKEN;
    const request = wikiSynthesisReviewRequest(candidate(), new Map([["s1", sourceOf(bytes)]]), "en");

    const sources = request?.state.sources as Record<string, { passages: Array<{ text: string }> }>;
    expect(sources.s1.passages.some(({ text }) => text.includes(QUOTE))).toBe(true);
    expect(requestTokens(request)).toBeLessThan(classifierContextTokens(WIKI_SYNTHESIS_REVIEW_MODEL));
  });

  it("accepts answers only from the review model", () => {
    const request = requiredRequest(wikiSynthesisReviewRequest(candidate(), new Map([["s1", sourceOf(1_000)]]), "en"));
    const answers = {
      page: { type: "choice" as const, choice: "supported", probabilities: null, confidence: null, runnerUps: [] },
      s0: { type: "choice" as const, choice: "qualified", probabilities: null, confidence: null, runnerUps: [] },
    };
    const result = { model: WIKI_SYNTHESIS_REVIEW_MODEL, answers, costMicrocents: 1, latencyMs: 1 };

    expect(wikiSynthesisReviewDecision(request, result)).toEqual({
      kind: "rejected",
      issues: [{ section: 0, decision: "qualified" }],
    });
    expect(wikiSynthesisReviewDecision(request, { ...result, model: "jev" })).toEqual({ kind: "unavailable" });
    expect(wikiSynthesisReviewDecision(request, null)).toEqual({ kind: "unavailable" });
  });
});
