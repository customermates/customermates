import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

export const FACT_JUDGE_MAX_OUTPUT_TOKENS = 512;
export const FACT_JUDGE_MODEL = "google/gemini-3.5-flash";

export function factJudgeMaximumMicrocents(model: string, system: string, prompt: string): number {
  return computeCostMicrocents(model, {
    inputTokens: Buffer.byteLength(system, "utf8") + Buffer.byteLength(prompt, "utf8") + 1024,
    outputTokens: FACT_JUDGE_MAX_OUTPUT_TOKENS,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }, "vertex", "eu");
}
