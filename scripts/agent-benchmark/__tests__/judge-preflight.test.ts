import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { EpisodeArtifact } from "../episode";
import type { JudgeLedgerEpisode } from "../judge-preflight";

import { armById } from "../arms";
import { worstCaseEpisodeCredits } from "../campaign";
import { ARTIFACT_SCHEMA_VERSION, benchmarkCaseModelSelection } from "../episode";
import { BENCHMARK_CASES, FIXTURE_VERSION, type CaseId } from "../fixtures";
import { judgeWorkspaceIssues, validateJudgePreflight } from "../judge-preflight";

const campaignId = "10000000-0000-4000-8000-000000000001";
const campaignDirectory = resolve("scripts/agent-benchmark/.runs", campaignId);
const sourceCommit = "current-commit";

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function artifactPath(ledger: JudgeLedgerEpisode): string {
  return required(ledger.artifact_path, `Missing artifact path for ${ledger.id}.`);
}

function episode(caseId: CaseId = "S1", id = "20000000-0000-4000-8000-000000000001"): JudgeLedgerEpisode {
  return {
    id,
    arm: "shipped",
    case_id: caseId,
    repetition: 1,
    runtime_variant: "merge",
    state: "scored",
    artifact_path: resolve(campaignDirectory, "merge", "shipped", `${caseId}-r1.json`),
  };
}

function artifact(ledger: JudgeLedgerEpisode): EpisodeArtifact {
  const definition = required(
    BENCHMARK_CASES.find((candidate) => candidate.id === ledger.case_id),
    `Unknown test case ${ledger.case_id}.`,
  );
  const arm = armById(ledger.arm);
  const model = benchmarkCaseModelSelection(ledger.case_id as CaseId, arm);
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    sourceCommit,
    sourceDirty: false,
    armConfig: arm,
    effectiveModelConfig: model.modelConfig,
    campaignId,
    episodeId: ledger.id,
    arm: ledger.arm,
    modelKey: model.modelKey,
    caseId: ledger.case_id as CaseId,
    title: definition.title,
    repetition: ledger.repetition,
    runtimeVariant: ledger.runtime_variant,
    namespace: "namespace",
    companyId: "30000000-0000-4000-8000-000000000001",
    actorUserId: "40000000-0000-4000-8000-000000000001",
    creditCeiling: worstCaseEpisodeCredits(
      { ...arm, ...model.modelConfig },
      definition.prompts.length,
    ),
    prompts: definition.prompts,
    judgeFacts: definition.judgeFacts ?? [],
    comparative: definition.comparative !== false,
    judgeable: definition.judgeable !== false,
    mergeRequired: definition.mergeRequired === true,
    turns: [],
    observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    metrics: { turns: [], rounds: [] },
    usage: [],
    usd: 0,
    measuredShare: 1,
    oracle: { caseId: ledger.case_id as CaseId, passed: true, checks: [] },
    eligibility: {
      exactPrompts: true,
      oneConversation: true,
      expectedTurnCount: true,
      correctRoute: true,
      allTurnsTerminal: true,
      accountingBalanced: true,
      withinCreditCeiling: true,
      streamSequenceUnique: true,
      noActiveLease: true,
    },
    skipped: null,
    capturedAt: "2026-09-23T00:00:00.000Z",
  };
}

function preflight(
  ledgerEpisodes: JudgeLedgerEpisode[],
  artifacts: { path: string; value: unknown }[],
  changedPaths: string[] = [],
) {
  return validateJudgePreflight({
    campaignId,
    campaignDirectory,
    sourceCommit,
    changedPaths,
    ledgerEpisodes,
    artifactCandidates: artifacts,
  });
}

describe("judge preflight", () => {
  it("reconciles a scored ledger episode to one current clean artifact", () => {
    const ledger = episode();
    const result = preflight(
      [ledger],
      [{ path: artifactPath(ledger), value: artifact(ledger) }],
      ["scripts/agent-benchmark/reports/2026-09-23-check/report.json"],
    );

    expect(result.issues).toEqual([]);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.artifact.episodeId).toBe(ledger.id);
  });

  it("allows only generated report dirt", () => {
    expect(
      judgeWorkspaceIssues([
        "scripts/agent-benchmark/reports/check/report.md",
        "scripts/agent-benchmark/reports/check/report.json",
      ]),
    ).toEqual([]);
    expect(
      judgeWorkspaceIssues(["scripts/agent-benchmark/reports/check/report.md", "scripts/agent-benchmark/judge.ts"]),
    ).toEqual([
      "working tree changes outside generated benchmark reports could alter judge behavior: scripts/agent-benchmark/judge.ts",
    ]);
  });

  it("rejects missing, duplicate, extra, and wrong-ledger artifacts", () => {
    const first = episode();
    const second = episode("S2", "20000000-0000-4000-8000-000000000002");
    const duplicate = artifact(first);
    const extra = {
      ...artifact(second),
      episodeId: "20000000-0000-4000-8000-000000000099",
    };
    const result = preflight(
      [first, second],
      [
        { path: artifactPath(first), value: artifact(first) },
        {
          path: resolve(campaignDirectory, "duplicate.json"),
          value: duplicate,
        },
        { path: artifactPath(second), value: extra },
      ],
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("has 2 matching campaign artifacts"),
        expect.stringContaining("has 0 matching campaign artifacts"),
        expect.stringContaining("extra artifact references no ledger episode"),
      ]),
    );
  });

  it("rejects stale, dirty, incompatible, and wrong-campaign artifacts", () => {
    const ledger = episode();
    const stale = {
      ...artifact(ledger),
      sourceCommit: "old-commit",
      sourceDirty: true,
      campaignId: "other-campaign",
      prompts: ["old prompt"],
    };
    const result = preflight([ledger], [{ path: artifactPath(ledger), value: stale }]);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("artifact belongs to campaign other-campaign"),
        expect.stringContaining("incompatible artifact: source commit changed"),
        expect.stringContaining("incompatible artifact: dirty-tree artifacts cannot be resumed"),
        expect.stringContaining("incompatible artifact: prompts changed"),
        expect.stringContaining("artifact source commit is not current HEAD"),
        expect.stringContaining("artifact was captured from a dirty source tree"),
      ]),
    );
  });

  it("reconciles nonjudgeable episodes but selects only comparative judgeable artifacts", () => {
    const judged = episode();
    const nonjudgeableDefinition = required(
      BENCHMARK_CASES.find((candidate) => candidate.comparative !== false && candidate.judgeable === false),
      "Expected a comparative nonjudgeable benchmark case.",
    );
    const nonjudgeable = episode(nonjudgeableDefinition.id, "20000000-0000-4000-8000-000000000003");
    const result = preflight(
      [judged, nonjudgeable],
      [
        { path: artifactPath(judged), value: artifact(judged) },
        {
          path: artifactPath(nonjudgeable),
          value: artifact(nonjudgeable),
        },
      ],
    );

    expect(result.issues).toEqual([]);
    expect(result.selected.map(({ artifact: value }) => value.episodeId)).toEqual([judged.id]);
  });
});
