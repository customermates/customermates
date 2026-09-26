import { describe, expect, it } from "vitest";

import type { JudgeScore, JudgeVerdict } from "../judge";

import { JUDGE_MODELS, judgeVerdictIsComplete } from "../judge";

const score = (model: string): JudgeScore => ({
  model,
  scores: {
    grounding: 5,
    completeness: 5,
    reasoning: 5,
    actionability: 5,
    fabricationFree: 5,
  },
  overall: 5,
  rationale: "ok",
  usd: 0.01,
  raw: "{}",
});

const verdict = (judges: JudgeScore[]): JudgeVerdict => ({
  judges,
  mean: 5,
  disagreement: false,
  judgedAt: "2026-09-23T00:00:00.000Z",
});

describe("judge verdict completeness", () => {
  it("requires each configured judge model exactly once", () => {
    expect(
      judgeVerdictIsComplete(
        verdict(JUDGE_MODELS.map((model) => score(model.id))),
      ),
    ).toBe(true);
    expect(
      judgeVerdictIsComplete(
        verdict([
          score(JUDGE_MODELS[0].id),
          score(JUDGE_MODELS[0].id),
        ]),
      ),
    ).toBe(false);
    expect(
      judgeVerdictIsComplete(
        verdict([
          ...JUDGE_MODELS.map((model) => score(model.id)),
          score(JUDGE_MODELS[0].id),
        ]),
      ),
    ).toBe(false);
  });
});
