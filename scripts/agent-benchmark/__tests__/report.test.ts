import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EpisodeArtifact } from "../episode";
import type { JudgeScore, JudgeVerdict } from "../judge";

import { JUDGE_MODELS } from "../judge";
import { buildReport, renderReport, selectArms } from "../report";

function artifact(arm: string, caseId: string, repetition: number, passed: boolean, usd: number, wallMs: number, judge: number, terminalCode = "completed"): EpisodeArtifact {
  return {
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
    prompts: ["p"],
    judgeFacts: [],
    turns: [{ index: 0, prompt: "p", conversationId: "x", status: 200, timing: { firstFrameMs: 500, firstOutputMs: 800, firstDeltaMs: 1200, lastFrameMs: wallMs }, wallMs, terminal: { type: "turn_done", terminalCode }, uiCommands: [], approvals: [], frameCount: 3, error: null }],
    observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    metrics: { turns: [{ id: "t", status: "completed", terminalCode: "completed", stopReason: null, modelSpec: "m", servingProvider: "p", createdAt: "2026-09-13T00:00:00.000Z", providerStartedAt: null, terminalAt: null }], rounds: [{ turnRequestId: "t", roundIndex: 0, inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 0, reasoningTokens: 0, costMicrocents: "1", finishReason: "stop", createdAt: "2026-09-13T00:00:00.000Z" }] },
    usage: [{ turnRequestId: "t", costMicrocents: String(Math.round(usd * 100_000_000)), costSource: "measured", chargedCredits: Math.max(1, Math.ceil(usd * 100)), state: "settled", model: "m" }],
    usd,
    measuredShare: 1,
    oracle: { caseId: caseId as never, passed, checks: [{ id: "always-fails", passed: false }, { id: "core", passed }] },
    eligibility: { exactPrompts: true, oneConversation: true, expectedTurnCount: true, correctRoute: true, allTurnsTerminal: true },
    skipped: null,
    capturedAt: "2026-09-13T00:00:00.000Z",
    judge: { judges: [], mean: judge, disagreement: false, judgedAt: "2026-09-13T00:00:00.000Z" },
  };
}

function judgeScore(model: string, overall: number): JudgeScore {
  return { model, scores: { grounding: overall, completeness: overall, reasoning: overall, actionability: overall, fabricationFree: overall }, overall, rationale: "r", usd: 0, raw: "{}" };
}

function verdict(caseId: string, repetition: number, mean: number): JudgeVerdict {
  const [first, second] = JUDGE_MODELS.map((model) => model.id);
  const disagreement = repetition === 1 && (caseId === "S1" || caseId === "S2");
  if (repetition === 3) return { judges: [judgeScore(first, 4)], mean, disagreement: false, judgedAt: "2026-09-13T00:00:00.000Z", unavailable: [second] };
  return { judges: [judgeScore(first, disagreement ? 2 : 4), judgeScore(second, 4.5)], mean, disagreement, judgedAt: "2026-09-13T00:00:00.000Z" };
}

describe("benchmark report", () => {
  it("aggregates artifacts, compares against the shipped arm and applies the selection rule", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    const artifacts = [
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => artifact("shipped", caseId, rep, caseId !== "S4", 0.02, 20_000, 3.5))),
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => ({ ...artifact("candidate", caseId, rep, true, 0.03, 15_000, 4.2), judge: verdict(caseId, rep, 4.2) }))),
      ...["S1", "S2", "S3", "S4"].flatMap((caseId) => [1, 2, 3].map((rep) => artifact("slow", caseId, rep, true, 0.01, 90_000, 4.4, rep === 1 && caseId === "S1" ? "partial" : "completed"))),
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
    expect(candidate?.incompleteTurnShare).toBe(0);
    expect(candidate).toMatchObject({ firstOutputP50Ms: 800, ttftP50Ms: 1200 });
    expect(candidate?.judgeCoverage).toBeCloseTo(8 / 12, 6);
    expect(candidate?.judgeDisagreementShare).toBeCloseTo(2 / 8, 6);
    expect(shipped).toMatchObject({ judgeCoverage: 0, judgeDisagreementShare: 0 });
    expect(report.judgeModels).toEqual([
      { model: JUDGE_MODELS[0].id, judged: 12, episodes: 36, mean: 44 / 12 },
      { model: JUDGE_MODELS[1].id, judged: 8, episodes: 36, mean: 4.5 },
    ]);
    expect(report.arms.find((arm) => arm.arm === "slow")?.incompleteTurnShare).toBeCloseTo(1 / 12, 6);
    expect(report.uniformlyFailingChecks).toEqual(["always-fails"]);
    const comparison = report.comparisons.find((entry) => entry.arm === "current/candidate");
    expect(comparison).toMatchObject({ wins: 1, losses: 0, ties: 3, floor: 1 });
    const selection = selectArms(report, new Set(["shipped", "candidate", "slow"]));
    expect(selection.defaultArm?.arm).toBe("candidate");
    expect(selection.reasoning.join("\n")).toMatch(/slow: below the speed floor/);
    const rendered = renderReport(report);
    expect(rendered).toContain("| current/candidate |");
    expect(rendered).toMatch(/\| current\/candidate \| 12 \| 100\.0 % \| 100\.0 % \| 4\.20 \| 66\.7 % \| 25\.0 % \|/);
    expect(rendered).toContain(`| ${JUDGE_MODELS[0].id} | 12/36 | 3.67 |\n| ${JUDGE_MODELS[1].id} | 8/36 | 4.50 |`);
  });
});
