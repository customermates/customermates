import { relative, resolve } from "node:path";

import type { EpisodeArtifact } from "./episode";

import { armById } from "./arms";
import { worstCaseEpisodeCredits } from "./campaign";
import { ARTIFACT_SCHEMA_VERSION, benchmarkCaseModelSelection } from "./episode";
import { BENCHMARK_CASES, FIXTURE_VERSION, type CaseId } from "./fixtures";
import { artifactCompatibilityIssues } from "./gate";

export type JudgeLedgerEpisode = {
  id: string;
  arm: string;
  case_id: string;
  repetition: number;
  runtime_variant: string;
  state: string;
  artifact_path: string | null;
};

export type JudgeArtifactCandidate = {
  path: string;
  value: unknown;
};

export type JudgeArtifactFile = {
  path: string;
  artifact: EpisodeArtifact;
};

export type JudgePreflightResult = {
  selected: JudgeArtifactFile[];
  issues: string[];
};

function normalizedRepositoryPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function judgeWorkspaceIssues(changedPaths: readonly string[]): string[] {
  const disallowed = [...new Set(changedPaths.map(normalizedRepositoryPath))]
    .filter(
      (path) => path !== "scripts/agent-benchmark/reports" && !path.startsWith("scripts/agent-benchmark/reports/"),
    )
    .sort();
  return disallowed.length
    ? [`working tree changes outside generated benchmark reports could alter judge behavior: ${disallowed.join(", ")}`]
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function artifactShapeIssues(path: string, value: unknown): string[] {
  if (!isRecord(value)) return [`${path}: artifact is not a JSON object`];
  const issues: string[] = [];
  for (const field of [
    "fixtureVersion",
    "sourceCommit",
    "campaignId",
    "episodeId",
    "arm",
    "caseId",
    "runtimeVariant",
    "modelKey",
    "title",
  ])
    if (typeof value[field] !== "string" || !value[field]) issues.push(`${path}: ${field} is missing or invalid`);

  for (const field of ["schemaVersion", "repetition"])
    if (!Number.isInteger(value[field])) issues.push(`${path}: ${field} is missing or invalid`);
  if (!Number.isSafeInteger(value.creditCeiling) || Number(value.creditCeiling) < 1)
    issues.push(`${path}: creditCeiling is missing or invalid`);

  for (const field of ["sourceDirty", "comparative", "judgeable", "mergeRequired"])
    if (typeof value[field] !== "boolean") issues.push(`${path}: ${field} is missing or invalid`);

  for (const field of ["prompts", "judgeFacts", "observed"])
    if (!Array.isArray(value[field])) issues.push(`${path}: ${field} is missing or invalid`);

  if (!isRecord(value.armConfig)) issues.push(`${path}: armConfig is missing or invalid`);
  if (!isRecord(value.effectiveModelConfig)) issues.push(`${path}: effectiveModelConfig is missing or invalid`);
  return issues;
}

function pathInside(directory: string, path: string) {
  const relation = relative(resolve(directory), resolve(path));
  return relation === "" || (!relation.startsWith("..") && !relation.startsWith("/"));
}

function logicalEpisode(episode: JudgeLedgerEpisode) {
  return `${episode.runtime_variant}/${episode.arm}/${episode.case_id}/r${episode.repetition}`;
}

export function validateJudgePreflight(input: {
  campaignId: string;
  campaignDirectory: string;
  sourceCommit: string;
  changedPaths: readonly string[];
  ledgerEpisodes: readonly JudgeLedgerEpisode[];
  artifactCandidates: readonly JudgeArtifactCandidate[];
}): JudgePreflightResult {
  const issues = judgeWorkspaceIssues(input.changedPaths);
  const scored = input.ledgerEpisodes.filter((episode) => episode.state === "scored");
  if (scored.length === 0) issues.push(`campaign ${input.campaignId} has no scored episodes`);

  const artifacts: JudgeArtifactFile[] = [];
  for (const candidate of input.artifactCandidates) {
    const shapeIssues = artifactShapeIssues(candidate.path, candidate.value);
    issues.push(...shapeIssues);
    if (shapeIssues.length) continue;
    artifacts.push({
      path: resolve(candidate.path),
      artifact: candidate.value as EpisodeArtifact,
    });
  }

  const scoredById = new Map(scored.map((episode) => [episode.id, episode]));
  for (const episode of scored) {
    const label = logicalEpisode(episode);
    const matches = artifacts.filter(({ artifact }) => artifact.episodeId === episode.id);
    if (matches.length !== 1)
      issues.push(`${label}: scored ledger episode ${episode.id} has ${matches.length} matching campaign artifacts`);

    if (!episode.artifact_path) {
      issues.push(`${label}: scored ledger episode ${episode.id} has no artifact path`);
      continue;
    }
    if (!pathInside(input.campaignDirectory, episode.artifact_path))
      issues.push(`${label}: ledger artifact path is outside the campaign directory`);

    if (matches.length === 1 && resolve(episode.artifact_path) !== matches[0].path)
      issues.push(`${label}: artifact path does not match the scored ledger row`);
  }

  for (const file of artifacts) {
    const { artifact } = file;
    const episode = scoredById.get(artifact.episodeId);
    if (!episode) {
      const ledger = input.ledgerEpisodes.find((candidate) => candidate.id === artifact.episodeId);
      issues.push(
        `${file.path}: extra artifact references ${ledger ? `${ledger.state} ledger episode` : "no ledger episode"} ${artifact.episodeId}`,
      );
      continue;
    }
    if (artifact.campaignId !== input.campaignId)
      issues.push(`${file.path}: artifact belongs to campaign ${artifact.campaignId}`);

    if (
      artifact.arm !== episode.arm ||
      artifact.caseId !== episode.case_id ||
      artifact.repetition !== episode.repetition ||
      artifact.runtimeVariant !== episode.runtime_variant
    )
      issues.push(`${file.path}: artifact identity does not match its scored ledger row`);

    const definition = BENCHMARK_CASES.find((candidate) => candidate.id === episode.case_id);
    if (!definition) {
      issues.push(`${file.path}: unknown benchmark case ${episode.case_id}`);
      continue;
    }
    let arm;
    try {
      arm = armById(episode.arm);
    } catch {
      issues.push(`${file.path}: unknown benchmark arm ${episode.arm}`);
      continue;
    }
    const model = benchmarkCaseModelSelection(episode.case_id as CaseId, arm);
    const compatibility = artifactCompatibilityIssues(artifact, {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      fixtureVersion: FIXTURE_VERSION,
      source: { sourceCommit: input.sourceCommit, sourceDirty: false },
      armConfig: arm,
      effectiveModelConfig: model.modelConfig,
      campaignId: input.campaignId,
      arm: episode.arm,
      caseId: episode.case_id,
      repetition: episode.repetition,
      runtimeVariant: episode.runtime_variant,
      creditCeiling: worstCaseEpisodeCredits(
        { ...arm, ...model.modelConfig },
        definition.prompts.length,
      ),
      prompts: definition.prompts,
    });
    for (const issue of compatibility) issues.push(`${file.path}: incompatible artifact: ${issue}`);
    if (artifact.sourceCommit !== input.sourceCommit)
      issues.push(`${file.path}: artifact source commit is not current HEAD`);
    if (artifact.sourceDirty) issues.push(`${file.path}: artifact was captured from a dirty source tree`);
    if (artifact.modelKey !== model.modelKey) issues.push(`${file.path}: artifact model key changed`);
    if (artifact.title !== definition.title) issues.push(`${file.path}: artifact title changed`);
    if (JSON.stringify(artifact.judgeFacts) !== JSON.stringify(definition.judgeFacts ?? []))
      issues.push(`${file.path}: artifact judge facts changed`);
    if (artifact.comparative !== (definition.comparative !== false))
      issues.push(`${file.path}: artifact comparative policy changed`);
    if (artifact.judgeable !== (definition.judgeable !== false))
      issues.push(`${file.path}: artifact judgeable policy changed`);
    if (artifact.mergeRequired !== (definition.mergeRequired === true))
      issues.push(`${file.path}: artifact merge policy changed`);
    if (artifact.skipped) issues.push(`${file.path}: scored artifact is marked skipped`);
  }

  const selected = artifacts.filter(
    ({ artifact }) => artifact.comparative === true && artifact.judgeable === true && !artifact.skipped,
  );
  if (scored.length > 0 && selected.length === 0)
    issues.push(`campaign ${input.campaignId} has no comparative, judgeable artifacts`);

  return { selected, issues: [...new Set(issues)] };
}
