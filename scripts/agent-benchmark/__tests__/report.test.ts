import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EpisodeArtifact } from "../episode";

import { armById } from "../arms";
import { worstCaseEpisodeCredits } from "../campaign";
import { JUDGE_MODELS, type JudgeVerdict } from "../judge";
import {
  benchmarkReportDirectoryName,
  buildReport,
  isEpisodeArtifactFileName,
  persistMergeCheckSummary,
  renderReport,
  selectArms,
} from "../report";

it("keeps same-day report labels distinct by campaign", () => {
  expect(
    benchmarkReportDirectoryName(
      "2026-09-23",
      "merge",
      "12345678-1234-4000-8000-000000000001",
    ),
  ).toBe("2026-09-23-merge-12345678");
});

function completeJudge(mean: number): JudgeVerdict {
  return {
    judges: JUDGE_MODELS.map((model) => ({
      model: model.id,
      scores: {
        grounding: mean,
        completeness: mean,
        reasoning: mean,
        actionability: mean,
        fabricationFree: mean,
      },
      overall: mean,
      rationale: "complete",
      usd: 0.001,
      raw: "{}",
    })),
    mean,
    disagreement: false,
    judgedAt: "2026-09-13T00:00:00.000Z",
  };
}

function artifact(arm: string, caseId: string, repetition: number, passed: boolean, usd: number, wallMs: number, judge: number): EpisodeArtifact {
  const armConfig = { ...armById("shipped"), id: arm, label: arm };
  return {
    schemaVersion: 4,
    fixtureVersion: "chat-benchmark-fixture-v4",
    sourceCommit: "source-commit",
    sourceDirty: false,
    armConfig,
    effectiveModelConfig: armConfig,
    campaignId: "c",
    episodeId: `${arm}-${caseId}-${repetition}`,
    arm,
    modelKey: `bench:${arm}`,
    caseId: caseId as never,
    title: caseId,
    repetition,
    runtimeVariant: "current",
    namespace: `${arm}:${caseId}:${repetition}`,
    companyId: "company",
    actorUserId: "user",
    creditCeiling: worstCaseEpisodeCredits(armConfig, 1),
    prompts: ["p"],
    judgeFacts: [],
    comparative: true,
    judgeable: true,
    mergeRequired: false,
    turns: [{ index: 0, prompt: "p", conversationId: "x", status: 200, timing: { firstFrameMs: 500, firstDeltaMs: 1200, lastFrameMs: wallMs }, wallMs, terminal: null, request: { locale: "en", pageRoute: "/en/contacts", modelKey: "bench:test" }, serverSourceCommit: "source-commit", uiCommands: [], approvals: [], streamEvents: [], frameSeqs: [0, 1, 2], detached: false, reattached: false, resumedFrameCount: 0, resumedDeltaText: "", cancelRequested: false, leaseProbe: null, frameCount: 3, error: null }],
    observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    metrics: { turns: [{ id: "t", status: "completed", terminalCode: "completed", stopReason: null, modelSpec: "m", servingProvider: "p", createdAt: "2026-09-13T00:00:00.000Z", providerStartedAt: null, terminalAt: null }], rounds: [{ turnRequestId: "t", roundIndex: 0, inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 0, reasoningTokens: 0, costMicrocents: "1", finishReason: "stop", createdAt: "2026-09-13T00:00:00.000Z" }] },
    usage: [{ turnRequestId: "t", costMicrocents: String(Math.round(usd * 100_000_000)), costSource: "measured", chargedCredits: Math.max(1, Math.ceil(usd * 100)), state: "settled", model: "m" }],
    usd,
    measuredShare: 1,
    oracle: {
      caseId: caseId as never,
      passed,
      checks: [
        { id: "always-fails", passed: false, gate: "quality" },
        { id: "core", passed, gate: "quality" },
      ],
    },
    eligibility: { exactPrompts: true, oneConversation: true, expectedTurnCount: true, correctRoute: true, allTurnsTerminal: true, accountingBalanced: true, withinCreditCeiling: true, streamSequenceUnique: true, noActiveLease: true },
    skipped: null,
    capturedAt: "2026-09-13T00:00:00.000Z",
    judge: completeJudge(judge),
  };
}

describe("benchmark report", () => {
  it("separates episode artifacts from campaign metadata", () => {
    expect(isEpisodeArtifactFileName("S1-r1.json")).toBe(true);
    expect(isEpisodeArtifactFileName("merge-check.json")).toBe(false);
    expect(isEpisodeArtifactFileName("arms-verified.json")).toBe(false);
    expect(isEpisodeArtifactFileName("notes.md")).toBe(false);
  });

  it("aggregates artifacts, compares against the shipped arm and applies the selection rule", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const artifacts = [
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => artifact("shipped", caseId, rep, caseId !== "S4", 0.02, 20_000, 3.5))),
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => artifact("candidate", caseId, rep, true, 0.03, 15_000, 4.2))),
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => artifact("slow", caseId, rep, true, 0.01, 90_000, 4.4))),
      ...[1, 2, 3, 4].map((rep) => artifact("subset", "S1", rep, true, 0.001, 1_000, 5)),
    ];
    for (const entry of artifacts) {
      const path = join(dir, entry.runtimeVariant, entry.arm);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, `${entry.caseId}-r${entry.repetition}.json`), JSON.stringify(entry));
    }
    const report = await buildReport("c", dir);
    const shipped = report.arms.find((arm) => arm.arm === "shipped");
    const candidate = report.arms.find((arm) => arm.arm === "candidate");
    expect(shipped?.passRate).toBeCloseTo(0.75, 6);
    expect(shipped?.neverSolvedCases).toEqual(["S4"]);
    expect(candidate?.passAt3).toBe(1);
    expect(report.uniformlyFailingChecks).toEqual(["always-fails"]);
    const comparison = report.comparisons.find((entry) => entry.arm === "current/candidate");
    expect(comparison).toMatchObject({ wins: 1, losses: 0, ties: 3, floor: 1 });
    expect(report.comparisons.some((entry) => entry.arm === "current/subset")).toBe(false);
    const selection = selectArms(report, new Set(["shipped", "candidate", "slow", "subset"]));
    expect(selection.defaultArm?.arm).toBe("candidate");
    expect(selection.reasoning.join("\n")).toMatch(/slow: below the speed floor/);
    expect(selection.reasoning.join("\n")).toMatch(/subset: ineligible.*exact repetition coverage false/);
    expect(renderReport(report)).toContain("| current/candidate |");
    expect(report.mergeCheck).toBeNull();
    expect(renderReport(report)).toContain("Not evaluated for this campaign.");
  });

  it("keeps full-suite coverage and the exact merge-check result separate from comparative metrics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const runtimeFailure = artifact("shipped", "H10", 1, false, 0.02, 20_000, 4);
    runtimeFailure.oracle = { caseId: "H10", passed: false, checks: [{ id: "expected-terminal-code", passed: false, gate: "runtime" }] };
    const strict = artifact("shipped", "V42", 1, true, 0.01, 10_000, 4);
    strict.comparative = false;
    strict.judgeable = false;
    strict.mergeRequired = true;
    strict.prompts = ["first", "second"];
    strict.turns = [strict.turns[0]!, { ...strict.turns[0]!, index: 1 }];
    for (const entry of [runtimeFailure, strict]) {
      const path = join(dir, entry.runtimeVariant, entry.arm);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, `${entry.caseId}-r${entry.repetition}.json`), JSON.stringify(entry));
    }
    await persistMergeCheckSummary(dir, {
      status: "failed",
      expectedCases: 52,
      expectedTurns: 58,
      runtimeVariant: "current",
      sourceCommit: "source-commit",
      failures: [{ arm: "shipped", caseId: "H10", repetition: 1, reason: "merge gate failed: expected-terminal-code" }],
    });

    const report = await buildReport("c", dir);
    const markdown = renderReport(report);
    expect(report.suiteCoverage).toMatchObject({ episodes: 2, distinctCases: 2, turns: 3, comparativeEpisodes: 1, comparativeCases: 1, comparativeTurns: 1, strictCases: 1 });
    expect(report.mergeCheck?.failures).toEqual([expect.objectContaining({ caseId: "H10", reason: "merge gate failed: expected-terminal-code" })]);
    expect(markdown).toContain("2 episodes across 2 distinct cases and 3 actual user turns");
    expect(markdown).toContain("1 episode across 1 case and 1 turn feed comparative quality metrics");
    expect(markdown).toContain("**FAIL** for current/shipped");
    expect(markdown).toContain("H10 r1: merge gate failed: expected-terminal-code");
    expect(markdown).toContain("1/1");

    await persistMergeCheckSummary(dir, {
      status: "passed",
      expectedCases: 52,
      expectedTurns: 58,
      runtimeVariant: "current",
      sourceCommit: "source-commit",
      failures: [],
    });
    expect(renderReport(await buildReport("c", dir))).toContain("**PASS** for current/shipped");
  });

  it("does not select a cohort with incomplete judge coverage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const shipped = artifact("shipped", "S1", 1, true, 0.02, 20_000, 4);
    const candidate = artifact("candidate", "S1", 1, true, 0.01, 10_000, 5);
    candidate.judge = {
      ...completeJudge(5),
      judges: completeJudge(5).judges.slice(0, 1),
    };
    for (const entry of [shipped, candidate]) {
      const path = join(dir, entry.runtimeVariant, entry.arm);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, `${entry.caseId}-r${entry.repetition}.json`), JSON.stringify(entry));
    }

    const report = await buildReport("c", dir);
    const selection = selectArms(report, new Set(["shipped", "candidate"]));

    expect(selection.defaultArm?.arm).toBe("shipped");
    expect(selection.reasoning.join("\n")).toMatch(
      /candidate: ineligible.*complete judges 0\/1/,
    );
  });

  it("does not select a complete cohort captured from an older source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const shipped = artifact("shipped", "S1", 1, true, 0.02, 20_000, 4);
    const oldCandidate = artifact("candidate", "S1", 1, true, 0.001, 1_000, 5);
    oldCandidate.runtimeVariant = "baseline";
    oldCandidate.sourceCommit = "older-source";
    for (const entry of [shipped, oldCandidate]) {
      const path = join(dir, entry.runtimeVariant, entry.arm);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, `${entry.caseId}-r${entry.repetition}.json`), JSON.stringify(entry));
    }

    const report = await buildReport("c", dir);
    const selection = selectArms(report, new Set(["shipped", "candidate"]));

    expect(selection.defaultArm?.arm).toBe("shipped");
    expect(selection.reasoning.join("\n")).toMatch(
      /baseline\/candidate: ineligible.*current clean source false/,
    );
  });

  it("rejects source mismatches within one runtime variant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const shipped = artifact("shipped", "S1", 1, true, 0.02, 20_000, 4);
    const candidate = artifact("candidate", "S1", 1, true, 0.01, 10_000, 5);
    candidate.sourceCommit = "different-source";
    for (const entry of [shipped, candidate]) {
      const path = join(dir, entry.runtimeVariant, entry.arm);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, `${entry.caseId}-r${entry.repetition}.json`), JSON.stringify(entry));
    }

    await expect(buildReport("c", dir)).rejects.toThrow(
      /runtime variant current mixes source commits/,
    );
  });

  it("counts skipped strict contracts in the denominator", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const skipped = artifact("shipped", "S1", 1, false, 0, 0, 4);
    skipped.mergeRequired = true;
    skipped.skipped = "campaign cap";
    skipped.oracle = null;
    const path = join(dir, skipped.runtimeVariant, skipped.arm);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "S1-r1.json"), JSON.stringify(skipped));

    const report = await buildReport("c", dir);

    expect(report.arms[0]).toMatchObject({
      contractEpisodes: 1,
      contractPassed: 0,
    });
  });
});
