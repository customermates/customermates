import { describe, expect, it } from "vitest";

import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { FACT_JUDGE_MAX_OUTPUT_TOKENS, FACT_JUDGE_MODEL, factJudgeMaximumMicrocents } from "../fact-judge-budget";
import { RetrievalBudget } from "../retrieval-budget";

const model = FACT_JUDGE_MODEL;

describe("gold-fact judge admission", () => {
  it("covers the full output and UTF-8 input bound instead of a fixed cent", () => {
    const system = "Judge the supplied facts.";
    const prompt = "😀".repeat(10_000);
    const maximum = factJudgeMaximumMicrocents(model, system, prompt);
    const possible = computeCostMicrocents(model, {
      inputTokens: Buffer.byteLength(system + prompt, "utf8"),
      outputTokens: FACT_JUDGE_MAX_OUTPUT_TOKENS,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }, "vertex", "eu");
    expect(maximum).toBeGreaterThan(possible);
    expect(maximum).toBeGreaterThan(1_000_000);
    let requests = 0;
    const budget = new RetrievalBudget("0.01");
    expect(() => { budget.reserve(maximum); requests += 1; }).toThrow("cannot admit");
    expect(requests).toBe(0);
  });
});
