import { describe, expect, it } from "vitest";

import type { EpisodeArtifact } from "../episode";

import { armById } from "../arms";
import {
  artifactCompatibilityIssues,
  benchmarkPathSegment,
  exactMatrixIssues,
  mergeGateFailureIds,
} from "../gate";

const artifact = (overrides: Partial<EpisodeArtifact> = {}) =>
  ({
    schemaVersion: 4,
    fixtureVersion: "chat-benchmark-fixture-v4",
    sourceCommit: "abc",
    sourceDirty: false,
    armConfig: armById("shipped"),
    effectiveModelConfig: armById("shipped"),
    campaignId: "campaign",
    arm: "shipped",
    caseId: "S1",
    repetition: 1,
    runtimeVariant: "merge",
    creditCeiling: 192,
    prompts: ["prompt"],
    mergeRequired: false,
    oracle: {
      caseId: "S1",
      passed: false,
      checks: [
        { id: "quality-answer", passed: false, gate: "quality" },
        {
          id: "integrity:accountingBalanced",
          passed: false,
          gate: "runtime",
        },
      ],
    },
    ...overrides,
  }) as EpisodeArtifact;

describe("benchmark merge gate", () => {
  it("accepts only bounded path-safe labels and variants", () => {
    expect(benchmarkPathSegment(undefined, "merge", "variant")).toBe(
      "merge",
    );
    expect(benchmarkPathSegment("pr-182.final_1", "", "label")).toBe(
      "pr-182.final_1",
    );
    for (const value of ["", "../outside", "/tmp/report", "two words", true])
      expect(() => benchmarkPathSegment(value, "merge", "variant")).toThrow(
        /path-safe/,
      );
    expect(() =>
      benchmarkPathSegment("a".repeat(81), "", "label"),
    ).toThrow(/80 characters/);
  });

  it("blocks runtime integrity everywhere and every check on release regressions", () => {
    expect(mergeGateFailureIds(artifact())).toEqual(["integrity:accountingBalanced"]);
    expect(mergeGateFailureIds(artifact({ mergeRequired: true }))).toEqual([
      "quality-answer",
      "integrity:accountingBalanced",
    ]);
  });

  it("blocks typed same-tenant safety failures but not answer-only misses", () => {
    expect(
      mergeGateFailureIds(
        artifact({
          oracle: {
            caseId: "S1",
            passed: false,
            checks: [
              {
                id: "business-state-unchanged",
                passed: false,
                gate: "safety",
              },
              { id: "answer-grounding", passed: false, gate: "quality" },
            ],
          },
        }),
      ),
    ).toEqual(["business-state-unchanged"]);
  });

  it("keeps the integrity-prefix fallback limited to legacy untyped artifacts", () => {
    expect(
      mergeGateFailureIds(
        artifact({
          oracle: {
            caseId: "S1",
            passed: false,
            checks: [
              { id: "integrity:legacy", passed: false },
              { id: "business-state-unchanged", passed: false },
            ],
          } as EpisodeArtifact["oracle"],
        }),
      ),
    ).toEqual(["integrity:legacy"]);
  });

  it("rejects stale or logically mismatched artifacts", () => {
    const current = artifact();
    expect(
      artifactCompatibilityIssues(current, {
        schemaVersion: 4,
        fixtureVersion: "chat-benchmark-fixture-v4",
        source: { sourceCommit: "abc", sourceDirty: false },
        armConfig: current.armConfig,
        effectiveModelConfig: current.effectiveModelConfig,
        campaignId: "campaign",
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
        creditCeiling: current.creditCeiling,
        prompts: ["prompt"],
      }),
    ).toEqual([]);
    expect(
      artifactCompatibilityIssues(artifact({ sourceCommit: "old", sourceDirty: true, creditCeiling: 1, oracle: null }), {
        schemaVersion: 4,
        fixtureVersion: "chat-benchmark-fixture-v4",
        source: { sourceCommit: "abc", sourceDirty: false },
        armConfig: current.armConfig,
        effectiveModelConfig: current.effectiveModelConfig,
        campaignId: "campaign",
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
        creditCeiling: current.creditCeiling,
        prompts: ["prompt"],
      }),
    ).toEqual(
      expect.arrayContaining([
        "source commit changed",
        "dirty-tree artifacts cannot be resumed",
        "episode credit ceiling changed",
        "oracle result is missing",
      ]),
    );
  });

  it("requires the exact one-repetition matrix", () => {
    const first = {
      arm: "shipped",
      case_id: "S1",
      repetition: 1,
      runtime_variant: "merge",
      state: "scored",
    };
    const second = {
      arm: "shipped",
      case_id: "S2",
      repetition: 1,
      runtime_variant: "merge",
      state: "scored",
    };
    const complete = [first, second];
    expect(exactMatrixIssues(complete, ["S1", "S2"], "merge", "shipped")).toEqual([]);
    expect(
      exactMatrixIssues(
        [first, { ...first, repetition: 2 }, { ...second, state: "failed" }],
        ["S1", "S2"],
        "merge",
        "shipped",
      ),
    ).toEqual(expect.arrayContaining(["unexpected episode S1 r2 (scored)", "S2 is failed"]));
  });
});
