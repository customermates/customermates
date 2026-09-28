import { describe, expect, it } from "vitest";

import { fisherExactTwoSided, M8_RECHECK, summariseM8 } from "../classifier-eval/heldout-live/m8-recheck";

const episode = (variant: string, repetition: number, checkPassed: boolean | null, rerankCalls = 0, docsToolCalls = 0) => ({
  variant,
  repetition,
  checkPassed,
  oraclePassed: checkPassed === true,
  rerankCalls,
  docsToolCalls,
});

describe("M8 recheck analysis", () => {
  it("fixes 30 episodes per arm in alternating blocks of ten", () => {
    expect(M8_RECHECK.blocks.map((block) => block.variant)).toEqual(["off", "docs-v2-jev", "off", "docs-v2-jev", "off", "docs-v2-jev"]);
    for (const variant of [M8_RECHECK.control, M8_RECHECK.candidate]) {
      const reps = M8_RECHECK.blocks.filter((block) => block.variant === variant).reduce((sum, block) => sum + block.reps[1] - block.reps[0] + 1, 0);
      expect(reps).toBe(M8_RECHECK.episodesPerArm);
    }
  });

  it("computes the two-sided Fisher exact p", () => {
    expect(fisherExactTwoSided(1, 2, 0, 3)).toBeCloseTo(1, 6);
    expect(fisherExactTwoSided(3, 1, 1, 3)).toBeCloseTo(0.4857, 3);
    expect(fisherExactTwoSided(8, 22, 1, 29)).toBeCloseTo(0.0257, 3);
    expect(fisherExactTwoSided(0, 30, 0, 30)).toBe(1);
  });

  it("calls a rare failure without a re-rank noise and a re-rank failure a regression", () => {
    const base = [
      ...Array.from({ length: 30 }, (_, i) => episode("off", i + 1, true)),
      ...Array.from({ length: 29 }, (_, i) => episode("docs-v2-jev", i + 1, true)),
    ];
    const noise = summariseM8([...base, episode("docs-v2-jev", 30, false)]);
    expect(noise).toMatchObject({ verdict: "noise", fisherP: 1, candidate: { failures: 1, failuresInvolvingRerank: 0 } });
    const rerank = summariseM8([...base, episode("docs-v2-jev", 30, false, 1)]);
    expect(rerank.verdict).toBe("regression");
    const absent = summariseM8([...base, episode("docs-v2-jev", 30, null, 0, 2)]);
    expect(absent).toMatchObject({ verdict: "regression", candidate: { failures: 1, checkAbsent: 1 } });
  });
});
