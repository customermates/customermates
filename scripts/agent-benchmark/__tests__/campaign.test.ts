import { describe, expect, it } from "vitest";

import { agentRoundWorstCaseCredits } from "@/ee/agent-chat/agent-budget-policy";

import { armById } from "../arms";
import {
  admissionDecision,
  BENCHMARK_PROVIDER_ROUNDS_PER_PROMPT,
  USD_PER_CREDIT,
  worstCaseEpisodeCredits,
  worstCaseEpisodeUsd,
} from "../campaign";

describe("benchmark campaign cap", () => {
  it("refuses an episode whose worst case would cross the cap and admits one that fits", () => {
    expect(admissionDecision({ capUsd: 200, spentUsd: 199.5, worstCaseUsd: 1 })).toEqual({ admitted: false, headroomUsd: 0.5 });
    expect(admissionDecision({ capUsd: 200, spentUsd: 10, worstCaseUsd: 1 })).toEqual({ admitted: true, headroomUsd: 190 });
  });

  it("reserves 32 full-context provider rounds per prompt in credits and USD", () => {
    const arm = armById("shipped");
    const singleCredits = worstCaseEpisodeCredits(arm, 1);
    expect(singleCredits).toBe(
      agentRoundWorstCaseCredits(arm) *
        BENCHMARK_PROVIDER_ROUNDS_PER_PROMPT,
    );
    expect(worstCaseEpisodeCredits(arm, 2)).toBe(singleCredits * 2);
    expect(worstCaseEpisodeUsd(arm, 2)).toBeCloseTo(
      singleCredits * 2 * USD_PER_CREDIT,
      9,
    );
    expect(() => worstCaseEpisodeCredits(arm, 0)).toThrow(
      /positive safe integer/,
    );
  });
});
