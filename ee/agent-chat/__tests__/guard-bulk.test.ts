import { describe, expect, it } from "vitest";

import { agentPageContextPrefix } from "../agent-page-context";
import { classifierSpecProblems } from "../classifier/spec";
import {
  GUARD_BULK_MESSAGE_CHARS,
  GUARD_BULK_PREVIOUS_CHARS,
  guardBulkProbability,
  guardBulkSpec,
  guardBulkState,
} from "../guard-bulk";

const TARGET = {
  entity: "deal",
  phrase: "Nova Expansion",
  candidates: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Nova Expansion" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Nova Expansion 2025" },
  ],
  bulkEligible: true,
};

describe("guard bulk classifier", () => {
  it("asks one boolean question: does the user mean every candidate", () => {
    const spec = guardBulkSpec();

    expect(classifierSpecProblems(spec)).toEqual([]);
    expect(spec.questions).toEqual([expect.objectContaining({ id: "covers_every_candidate", type: "boolean" })]);
  });

  it("sends the user's own words, the previous answer, the phrase and the candidate names, never ids", () => {
    const state = guardBulkState({
      latestUserMessage: `${agentPageContextPrefix("/en/deals")}Set both Nova Expansion deals to Won.`,
      previousAssistantMessage: "p".repeat(GUARD_BULK_PREVIOUS_CHARS + 10),
      target: TARGET,
    });

    expect(state).toEqual({
      latest_user_message: "Set both Nova Expansion deals to Won.",
      previous_assistant_message: "p".repeat(GUARD_BULK_PREVIOUS_CHARS),
      entity: "deal",
      phrase: "Nova Expansion",
      candidates: ["Nova Expansion", "Nova Expansion 2025"],
    });
    expect(JSON.stringify(state)).not.toContain("1111");
    expect(
      guardBulkState({ latestUserMessage: "x".repeat(GUARD_BULK_MESSAGE_CHARS + 1), target: TARGET })
        .latest_user_message,
    ).toHaveLength(GUARD_BULK_MESSAGE_CHARS);
  });

  it("reads only a measured probability", () => {
    const result = (probability: number | null) => ({
      model: "jev" as const,
      answers: { covers_every_candidate: { type: "boolean" as const, value: true, probability } },
      costMicrocents: 1,
      latencyMs: 1,
    });

    expect(guardBulkProbability(result(0.91))).toBe(0.91);
    expect(guardBulkProbability(result(null))).toBeNull();
    expect(guardBulkProbability(null)).toBeNull();
  });
});
