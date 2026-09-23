import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import type { BenchmarkArm } from "./arms";
import type { EpisodeArtifact } from "./episode";

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export function benchmarkPathSegment(
  value: string | boolean | undefined,
  fallback: string,
  flag: "label" | "variant",
): string {
  const segment = typeof value === "string" ? value.trim() : value === undefined ? fallback : "";
  if (!SAFE_PATH_SEGMENT.test(segment))
    throw new Error(
      `--${flag} must be a nonempty path-safe value containing only letters, numbers, dots, underscores, or hyphens (80 characters maximum).`,
    );
  return segment;
}

export function mergeGateFailureIds(artifact: EpisodeArtifact): string[] {
  const failed = artifact.oracle?.checks.filter((check) => !check.passed) ?? [];
  if (artifact.mergeRequired) return failed.map((check) => check.id);
  return failed
    .filter(
      (check) =>
        check.gate === "runtime" ||
        check.gate === "safety" ||
        // Artifacts captured before typed gates were added only encoded runtime
        // integrity in the id. Keep them resumable without guessing any other
        // check's semantics from its name.
        (check.gate === undefined && check.id.startsWith("integrity:")),
    )
    .map((check) => check.id);
}

export function artifactCompatibilityIssues(
  artifact: EpisodeArtifact,
  expected: {
    schemaVersion: number;
    fixtureVersion: string;
    source: { sourceCommit: string; sourceDirty: boolean };
    armConfig: BenchmarkArm;
    effectiveModelConfig: AgentModelEntry;
    campaignId: string;
    arm: string;
    caseId: string;
    repetition: number;
    runtimeVariant: string;
    creditCeiling: number;
    prompts: readonly string[];
  },
): string[] {
  const issues: string[] = [];
  if (artifact.schemaVersion !== expected.schemaVersion) issues.push("schema version changed");
  if (artifact.fixtureVersion !== expected.fixtureVersion) issues.push("fixture version changed");
  if (artifact.sourceCommit !== expected.source.sourceCommit) issues.push("source commit changed");
  if (artifact.sourceDirty || expected.source.sourceDirty) issues.push("dirty-tree artifacts cannot be resumed");
  if (JSON.stringify(artifact.armConfig) !== JSON.stringify(expected.armConfig))
    issues.push("arm configuration changed");
  if (JSON.stringify(artifact.effectiveModelConfig) !== JSON.stringify(expected.effectiveModelConfig))
    issues.push("effective model configuration changed");
  if (
    artifact.campaignId !== expected.campaignId ||
    artifact.arm !== expected.arm ||
    artifact.caseId !== expected.caseId ||
    artifact.repetition !== expected.repetition ||
    artifact.runtimeVariant !== expected.runtimeVariant
  )
    issues.push("logical episode identity does not match");
  if (JSON.stringify(artifact.prompts) !== JSON.stringify(expected.prompts)) issues.push("prompts changed");
  if (artifact.creditCeiling !== expected.creditCeiling)
    issues.push("episode credit ceiling changed");
  if (!artifact.oracle) issues.push("oracle result is missing");
  return issues;
}

export type MatrixEpisode = {
  arm: string;
  case_id: string;
  repetition: number;
  runtime_variant: string;
  state: string;
};

export function exactMatrixIssues(
  episodes: readonly MatrixEpisode[],
  expectedCaseIds: readonly string[],
  runtimeVariant: string,
  arm: string,
): string[] {
  const expected = new Set(expectedCaseIds);
  const relevant = episodes.filter((episode) => episode.runtime_variant === runtimeVariant && episode.arm === arm);
  const issues: string[] = [];
  for (const episode of relevant) {
    if (episode.repetition !== 1 || !expected.has(episode.case_id))
      issues.push(`unexpected episode ${episode.case_id} r${episode.repetition} (${episode.state})`);
  }
  for (const caseId of expected) {
    const matches = relevant.filter((episode) => episode.case_id === caseId && episode.repetition === 1);
    if (matches.length !== 1) issues.push(`${caseId} has ${matches.length} logical episodes`);
    else if (matches[0]?.state !== "scored") issues.push(`${caseId} is ${matches[0]?.state ?? "missing"}`);
  }
  return issues;
}
