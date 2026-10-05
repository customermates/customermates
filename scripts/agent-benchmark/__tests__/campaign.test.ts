import { describe, expect, it } from "vitest";

import { agentRoundWorstCaseMicrocents } from "@/ee/agent-chat/agent-budget-policy";

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

  it("reserves 32 full-context provider rounds per prompt, rounded up to a whole seeded credit", () => {
    const arm = armById("shipped");
    const perPrompt = agentRoundWorstCaseMicrocents(arm) * BENCHMARK_PROVIDER_ROUNDS_PER_PROMPT;
    expect(worstCaseEpisodeCredits(arm, 1)).toBe(Math.ceil(perPrompt / 1_000_000));
    const twoPrompts = worstCaseEpisodeCredits(arm, 2);
    expect(twoPrompts).toBe(Math.ceil((perPrompt * 2) / 1_000_000));
    expect(USD_PER_CREDIT).toBe(0.01);
    expect(worstCaseEpisodeUsd(arm, 2)).toBeCloseTo(twoPrompts * USD_PER_CREDIT, 9);
    expect(() => worstCaseEpisodeCredits(arm, 0)).toThrow(
      /positive safe integer/,
    );
  });
});
