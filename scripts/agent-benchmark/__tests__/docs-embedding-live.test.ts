import type { EpisodeArtifact } from "../episode";

import { describe, expect, it } from "vitest";

import {
  binary,
  decideRecheck,
  DOCS_BLOCKS,
  flagFullSuite,
  LIVE,
  liveGate,
  searchSummary,
  type DocsPair,
  type DocsUnit,
} from "../classifier-eval/heldout-live/docs-embedding-live";

const unit = (caseId: string, repetition: number, pass: boolean, extra: Partial<DocsUnit> = {}): DocsUnit => ({
  caseId,
  repetition,
  family: caseId.startsWith("DE") ? "DE" : "DH",
  lang: "en",
  pass,
  oraclePass: true,
  credits: 1,
  usd: 0.005,
  auxUsd: 0.0002,
  firstOutputMs: 2_000,
  searchMs: [400],
  searches: 1,
  hybridSearches: 0,
  embeddingCalls: 0,
  embeddingAnswered: 0,
  embeddingUsd: 0,
  goldPage: true,
  goldAnchor: true,
  ...extra,
});

function pairs(controlPasses: (c: number, r: number) => boolean, candidatePasses: (c: number, r: number) => boolean): DocsPair[] {
  return Array.from({ length: 60 }, (_, c) =>
    Array.from({ length: LIVE.reps }, (_, r) => {
      const caseId = `${c < 30 ? "DE" : "DH"}${String((c % 30) + 1).padStart(2, "0")}`;
      return {
        caseId,
        repetition: r + 1,
        control: unit(caseId, r + 1, controlPasses(c, r)),
        candidate: unit(caseId, r + 1, candidatePasses(c, r)),
      };
    }),
  ).flat();
}

function artifact(caseId: string, repetition: number, checks: { id: string; passed: boolean; gate: string }[], tools: string[] = []) {
  return {
    caseId,
    repetition,
    mergeRequired: false,
    skipped: null,
    oracle: { passed: checks.every((check) => check.passed), checks },
    observed: [{ tools: tools.map((name) => ({ name })) }],
  } as unknown as EpisodeArtifact & { __path: string };
}

describe("hybrid docs candidates live analysis", () => {
  it("fixes ten alternating blocks of two repetitions, five per arm, starting with the keyword control", () => {
    expect(DOCS_BLOCKS).toHaveLength(10);
    expect(DOCS_BLOCKS.slice(0, 4)).toEqual([
      { block: 1, variant: "keyword", reps: [1, 2] },
      { block: 2, variant: "hybrid", reps: [1, 2] },
      { block: 3, variant: "keyword", reps: [3, 4] },
      { block: 4, variant: "hybrid", reps: [3, 4] },
    ]);
    expect(DOCS_BLOCKS.at(-1)).toEqual({ block: 10, variant: "hybrid", reps: [9, 10] });
  });

  it("passes the gate only when hybrid wins the McNemar test without losing pass^10, credits or latency", () => {
    const control = (c: number) => c % 3 !== 0;
    const better = binary(pairs(control, () => true), LIVE.reps);
    expect(better.mcnemar).toMatchObject({ candidateOnly: 200, controlOnly: 0 });
    expect(better.passK.candidate.allPassed).toBe(60);
    expect(liveGate({ pass: better, creditsRelativePct: 2, firstOutputP95DiffS: 0.6, fullSuite: "pass" }).verdict).toBe("pass");
    expect(liveGate({ pass: better, creditsRelativePct: 3.5, firstOutputP95DiffS: 0.6, fullSuite: "pass" }).items.creditsWithin3Pct).toBe(false);
    expect(liveGate({ pass: better, creditsRelativePct: 2, firstOutputP95DiffS: 1.2, fullSuite: "pass" }).verdict).toBe("fail");
    expect(liveGate({ pass: better, creditsRelativePct: 2, firstOutputP95DiffS: 0.6, fullSuite: "incomplete" }).verdict).toBe("incomplete");

    const flaky = binary(pairs(() => true, (c, r) => c % 2 === 0 || r > 0), LIVE.reps);
    expect(liveGate({ pass: flaky, creditsRelativePct: 0, firstOutputP95DiffS: 0, fullSuite: "pass" }).items).toMatchObject({
      passImproves: false,
      passKNotWorse: false,
    });

    const ceiling = binary(pairs((c, r) => !(c === 0 && r < 3), () => true), LIVE.reps);
    expect(liveGate({ pass: ceiling, creditsRelativePct: 0, firstOutputP95DiffS: 0, fullSuite: "pass" })).toMatchObject({
      atCeiling: true,
      verdict: "fail (at ceiling)",
    });
  });

  it("reports search latency percentiles and the hybrid arm's fallback rate", () => {
    const list = pairs(() => true, () => true).map((pair, index) => ({
      ...pair,
      candidate: { ...pair.candidate, searchMs: [900 + (index % 10)], hybridSearches: index % 4 === 0 ? 0 : 1 },
    }));
    const summary = searchSummary(list);
    expect(summary.control).toMatchObject({ searchMsP50: 400, searchMsP95: 400, fallbackPct: 100 });
    expect(summary.candidate).toMatchObject({ searches: 600, hybridSearches: 450, fallbackPct: 25, searchMsP95: 909 });
    expect(summary.searchMsP95DiffMs.point).toBe(509);
  });

  it("flags a safety check the keyword run passed and the hybrid run failed, and decides it by the recheck", () => {
    const safe = { id: "no-mutating-tool-attempt", passed: true, gate: "safety" };
    const broken = { ...safe, passed: false };
    const answer = { id: "answer-mentions-fact", passed: false, gate: "answer" };
    const suite = flagFullSuite(
      [artifact("S1", 1, [safe, answer]), artifact("S2", 1, [safe])],
      [artifact("S1", 1, [broken, answer]), artifact("S2", 1, [safe, { ...answer, passed: false }])],
      ["S1", "S2", "S3"],
    );
    expect(suite.flags).toEqual([{ caseId: "S1", checks: ["no-mutating-tool-attempt"], hybridLost: false, hybridSearched: false }]);
    expect(suite.incomplete).toEqual(["S3 keyword=missing"]);

    const reps = (checks: typeof safe[], tools: string[] = []) =>
      Array.from({ length: LIVE.recheck.reps }, (_, i) => artifact("S1", i + 1, [checks[i % checks.length]!], tools));
    const flag = suite.flags[0]!;
    expect(decideRecheck(flag, reps([safe]), reps([safe]))).toMatchObject({ status: "noise", fisherP: 1 });
    expect(decideRecheck(flag, reps([safe]), reps([broken]))).toMatchObject({ status: "regression", hybridFailures: "10/10" });
    const searchedFail = [...reps([safe]).slice(0, 9), artifact("S1", 10, [broken], ["search_docs"])];
    expect(decideRecheck(flag, reps([safe]), searchedFail)).toMatchObject({ status: "regression", failingHybridSearched: true });
    expect(decideRecheck(flag, reps([safe]).slice(0, 5), reps([safe]))).toMatchObject({ status: "pending" });
  });
});
