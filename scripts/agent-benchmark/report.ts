import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { EpisodeArtifact } from "./episode";
import type { EpisodeOutcome } from "./stats";

import { BENCHMARK_ARMS } from "./arms";
import { judgeVerdictIsComplete } from "./judge";
import { comparePaired, costPerSuccessfulTask, holmAdjust, mean, passAtLeastK, passRate, percentile, uniformlyFailingChecks } from "./stats";

export function benchmarkReportDirectoryName(
  date: string,
  label: string,
  campaignId: string,
) {
  return `${date}-${label}-${campaignId.slice(0, 8)}`;
}

export type ArmSummary = {
  arm: string;
  label: string;
  runtimeVariant: string;
  sourceCommit: string;
  sourceDirty: boolean;
  episodes: number;
  distinctCases: number;
  coverage: string[];
  skipped: number;
  contractEpisodes: number;
  contractPassed: number;
  passRate: number;
  passAt3: number | null;
  judgeMean: number | null;
  judgeComplete: number;
  judgeEligible: number;
  usdPerEpisode: number;
  usdPerTurn: number;
  creditsPerTurn: number;
  costPerSuccessfulTask: number | null;
  measuredShare: number;
  cacheReadShare: number;
  cacheWriteShare: number;
  roundsPerTurn: number;
  ttftP50Ms: number | null;
  ttftP95Ms: number | null;
  wallP50Ms: number | null;
  wallP95Ms: number | null;
  lengthFinishShare: number;
  neverSolvedCases: string[];
};

export type Comparison = { arm: string; control: string; cases: number; wins: number; losses: number; ties: number; meanDifference: number; p: number; holmP: number; floor: number };

export type BenchmarkReport = {
  campaignId: string;
  generatedAt: string;
  cohort: {
    schemaVersion: string;
    fixtureVersion: string;
    sourceCommits: string[];
    hasDirtyArtifacts: boolean;
  };
  arms: ArmSummary[];
  comparisons: Comparison[];
  caseMatrix: Record<string, Record<string, string>>;
  uniformlyFailingChecks: string[];
  skippedEpisodes: { arm: string; caseId: string; repetition: number; reason: string }[];
  totalUsd: number;
  comparativeCaseCount: number;
};

async function readArtifacts(dir: string): Promise<EpisodeArtifact[]> {
  const artifacts: EpisodeArtifact[] = [];
  async function walk(path: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".json") && !entry.name.startsWith("arms-")) artifacts.push(JSON.parse(await readFile(full, "utf8")) as EpisodeArtifact);
    }
  }
  await walk(dir);
  return artifacts;
}

function outcome(artifact: EpisodeArtifact): EpisodeOutcome {
  return {
    arm: `${artifact.runtimeVariant}/${artifact.arm}`,
    caseId: artifact.caseId,
    repetition: artifact.repetition,
    passed: artifact.oracle?.passed === true,
    usd: artifact.usd,
    judge: judgeVerdictIsComplete(artifact.judge)
      ? artifact.judge?.mean ?? null
      : null,
  };
}

function summarizeArm(key: string, artifacts: EpisodeArtifact[]): ArmSummary {
  const scored = artifacts.filter((artifact) => artifact.comparative !== false && !artifact.skipped);
  const contracts = artifacts.filter((artifact) => artifact.mergeRequired === true);
  const judgeEligible = scored.filter(
    (artifact) => artifact.judgeable !== false && artifact.observed.length > 0,
  );
  const outcomes = scored.map(outcome);
  const rounds = scored.flatMap((artifact) => artifact.metrics.rounds);
  const turns = scored.flatMap((artifact) => artifact.turns.filter((turn) => !turn.error));
  const promptTokens = rounds.reduce((total, round) => total + round.inputTokens + round.cacheReadTokens + round.cacheWriteTokens, 0);
  const cacheRead = rounds.reduce((total, round) => total + round.cacheReadTokens, 0);
  const cacheWrite = rounds.reduce((total, round) => total + round.cacheWriteTokens, 0);
  const totalUsd = scored.reduce((total, artifact) => total + artifact.usd, 0);
  const turnCount = scored.reduce((total, artifact) => total + artifact.metrics.turns.length, 0);
  const judges = outcomes.map((entry) => entry.judge).filter((value): value is number => value !== null);
  const byCase = new Map<string, boolean[]>();
  for (const entry of outcomes) byCase.set(entry.caseId, [...(byCase.get(entry.caseId) ?? []), entry.passed]);
  const [runtimeVariant, arm] = key.split("/");
  return {
    arm,
    label:
      artifacts.find((artifact) => artifact.armConfig)?.armConfig.label ??
      BENCHMARK_ARMS.find((candidate) => candidate.id === arm)?.label ??
      arm,
    runtimeVariant,
    sourceCommit: artifacts[0]?.sourceCommit ?? "legacy",
    sourceDirty: artifacts.some((artifact) => artifact.sourceDirty),
    episodes: scored.length,
    distinctCases: new Set(scored.map((artifact) => artifact.caseId)).size,
    coverage: scored
      .map((artifact) => `${artifact.caseId}:r${artifact.repetition}`)
      .sort(),
    skipped: artifacts.filter((artifact) => artifact.skipped).length,
    contractEpisodes: contracts.length,
    contractPassed: contracts.filter((artifact) => artifact.oracle?.passed).length,
    passRate: passRate(outcomes),
    passAt3: passAtLeastK(outcomes, 3),
    judgeMean: mean(judges),
    judgeComplete: judgeEligible.filter((artifact) =>
      judgeVerdictIsComplete(artifact.judge),
    ).length,
    judgeEligible: judgeEligible.length,
    usdPerEpisode: scored.length ? totalUsd / scored.length : 0,
    usdPerTurn: turnCount ? totalUsd / turnCount : 0,
    creditsPerTurn: turnCount ? scored.reduce((total, artifact) => total + artifact.usage.reduce((sum, event) => sum + event.chargedCredits, 0), 0) / turnCount : 0,
    costPerSuccessfulTask: costPerSuccessfulTask(outcomes),
    measuredShare: scored.length ? scored.reduce((total, artifact) => total + artifact.measuredShare, 0) / scored.length : 0,
    cacheReadShare: promptTokens ? cacheRead / promptTokens : 0,
    cacheWriteShare: promptTokens ? cacheWrite / promptTokens : 0,
    roundsPerTurn: turnCount ? rounds.length / turnCount : 0,
    ttftP50Ms: percentile(turns.map((turn) => turn.timing.firstDeltaMs).filter((value): value is number => value !== null), 50),
    ttftP95Ms: percentile(turns.map((turn) => turn.timing.firstDeltaMs).filter((value): value is number => value !== null), 95),
    wallP50Ms: percentile(turns.map((turn) => turn.wallMs), 50),
    wallP95Ms: percentile(turns.map((turn) => turn.wallMs), 95),
    lengthFinishShare: rounds.length ? rounds.filter((round) => round.finishReason === "length").length / rounds.length : 0,
    neverSolvedCases: [...byCase].filter(([, results]) => results.length > 0 && results.every((passed) => !passed)).map(([caseId]) => caseId).sort(),
  };
}

export async function buildReport(campaignId: string, runsDir: string, ledgerTotalUsd?: number): Promise<BenchmarkReport> {
  const artifacts = (await readArtifacts(runsDir)).filter((artifact) => artifact.campaignId === campaignId);
  const schemaVersions = new Set(
    artifacts.map((artifact) => String(artifact.schemaVersion ?? "legacy")),
  );
  const fixtureVersions = new Set(
    artifacts.map((artifact) => artifact.fixtureVersion ?? "legacy"),
  );
  if (schemaVersions.size > 1 || fixtureVersions.size > 1)
    throw new Error(
      `Campaign ${campaignId} mixes benchmark cohorts (schemas ${[
        ...schemaVersions,
      ].join(", ")}; fixtures ${[...fixtureVersions].join(", ")}).`,
    );
  const groups = new Map<string, EpisodeArtifact[]>();
  for (const artifact of artifacts) {
    const key = `${artifact.runtimeVariant}/${artifact.arm}`;
    groups.set(key, [...(groups.get(key) ?? []), artifact]);
  }
  for (const [key, group] of groups) {
    const sourceCommits = new Set(
      group.map((artifact) => artifact.sourceCommit ?? "legacy"),
    );
    const armConfigs = new Set(
      group.map((artifact) => JSON.stringify(artifact.armConfig ?? null)),
    );
    if (sourceCommits.size > 1 || armConfigs.size > 1)
      throw new Error(
        `Benchmark cohort ${key} mixes source commits or arm configurations.`,
      );
  }
  const byRuntimeVariant = new Map<string, EpisodeArtifact[]>();
  for (const artifact of artifacts)
    byRuntimeVariant.set(artifact.runtimeVariant, [
      ...(byRuntimeVariant.get(artifact.runtimeVariant) ?? []),
      artifact,
    ]);
  for (const [runtimeVariant, group] of byRuntimeVariant) {
    const sourceCommits = new Set(
      group.map((artifact) => artifact.sourceCommit ?? "legacy"),
    );
    if (sourceCommits.size > 1)
      throw new Error(
        `Benchmark runtime variant ${runtimeVariant} mixes source commits.`,
      );
  }
  const arms = [...groups].map(([key, group]) => summarizeArm(key, group)).sort((a, b) => b.passRate - a.passRate || (a.usdPerEpisode - b.usdPerEpisode));
  const shippedKey = [...groups.keys()].find((key) => key.endsWith("/shipped") && key.startsWith("current/")) ?? [...groups.keys()].find((key) => key.endsWith("/shipped"));
  const comparisons: Comparison[] = [];
  if (shippedKey) {
    const controlArtifacts = (groups.get(shippedKey) ?? []).filter(
      (artifact) => artifact.comparative !== false && !artifact.skipped,
    );
    const controlCoverage = JSON.stringify(
      controlArtifacts
        .map((artifact) => `${artifact.caseId}:r${artifact.repetition}`)
        .sort(),
    );
    const control = controlArtifacts.map(outcome);
    const raw = [...groups]
      .filter(([key]) => key !== shippedKey)
      .filter(([, group]) =>
        JSON.stringify(
          group
            .filter(
              (artifact) => artifact.comparative !== false && !artifact.skipped,
            )
            .map((artifact) => `${artifact.caseId}:r${artifact.repetition}`)
            .sort(),
        ) === controlCoverage,
      )
      .map(([key, group]) => {
        const comparison = comparePaired(group.filter((artifact) => artifact.comparative !== false && !artifact.skipped).map(outcome), control);
        return { key, comparison };
      });
    const controlCases = new Set(control.map((entry) => entry.caseId)).size;
    const family = raw.filter(({ comparison }) => comparison.cases === controlCases);
    const holm = holmAdjust(family.map(({ key, comparison }) => ({ key, p: comparison.signTestP })));
    for (const { key, comparison } of raw)
      comparisons.push({ arm: key, control: shippedKey, cases: comparison.cases, wins: comparison.wins, losses: comparison.losses, ties: comparison.ties, meanDifference: comparison.meanDifference, p: comparison.signTestP, holmP: holm.get(key) ?? comparison.signTestP, floor: comparison.floor });
  }
  const caseMatrix: Record<string, Record<string, string>> = {};
  for (const [key, group] of groups)
    for (const artifact of group) {
      caseMatrix[artifact.caseId] ??= {};
      const cell = caseMatrix[artifact.caseId][key] ?? "0/0";
      const [passed, total] = cell.split("/").map(Number);
      caseMatrix[artifact.caseId][key] = artifact.skipped ? cell : `${passed + (artifact.oracle?.passed ? 1 : 0)}/${total + 1}`;
    }
  return {
    campaignId,
    generatedAt: new Date().toISOString(),
    cohort: {
      schemaVersion: [...schemaVersions][0] ?? "unknown",
      fixtureVersion: [...fixtureVersions][0] ?? "unknown",
      sourceCommits: [
        ...new Set(
          artifacts
            .map((artifact) => artifact.sourceCommit)
            .filter((commit): commit is string => Boolean(commit)),
        ),
      ].sort(),
      hasDirtyArtifacts: artifacts.some((artifact) => artifact.sourceDirty === true),
    },
    arms,
    comparisons,
    caseMatrix,
    uniformlyFailingChecks: uniformlyFailingChecks(artifacts.filter((artifact) => artifact.oracle).map((artifact) => artifact.oracle!.checks)),
    skippedEpisodes: artifacts.filter((artifact) => artifact.skipped).map((artifact) => ({ arm: `${artifact.runtimeVariant}/${artifact.arm}`, caseId: artifact.caseId, repetition: artifact.repetition, reason: artifact.skipped ?? "" })),
    totalUsd: ledgerTotalUsd ?? artifacts.reduce((total, artifact) => total + artifact.usd, 0),
    comparativeCaseCount: new Set(artifacts.filter((artifact) => artifact.comparative !== false).map((artifact) => artifact.caseId)).size,
  };
}

const pct = (value: number) => `${(value * 100).toFixed(1)} %`;
const usd = (value: number | null) => (value === null ? "n/a" : `$${value.toFixed(4)}`);
const ms = (value: number | null) => (value === null ? "n/a" : `${(value / 1000).toFixed(1)} s`);

export function renderReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  const sources = report.cohort.sourceCommits.length
    ? report.cohort.sourceCommits.join(", ")
    : "unrecorded";
  lines.push(
    `# Agent benchmark report ${report.campaignId}`,
    "",
    `Generated ${report.generatedAt}. Total spend ${usd(report.totalUsd)}. Arms are keyed runtime/arm.`,
    `Cohort: schema ${report.cohort.schemaVersion}, fixture ${report.cohort.fixtureVersion}, source ${sources}${report.cohort.hasDirtyArtifacts ? " (dirty tree)" : ""}.`,
    "",
  );
  lines.push("## Arms", "", "| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const arm of report.arms)
    lines.push(`| ${arm.runtimeVariant}/${arm.arm} | ${arm.episodes}${arm.skipped ? ` (+${arm.skipped} skipped)` : ""} | ${arm.contractPassed}/${arm.contractEpisodes} | ${pct(arm.passRate)} | ${arm.passAt3 === null ? "n/a" : pct(arm.passAt3)} | ${arm.judgeMean === null ? "n/a" : arm.judgeMean.toFixed(2)} | ${arm.judgeComplete}/${arm.judgeEligible} | ${usd(arm.usdPerEpisode)} | ${usd(arm.usdPerTurn)} | ${arm.creditsPerTurn.toFixed(1)} | ${usd(arm.costPerSuccessfulTask)} | ${pct(arm.measuredShare)} | ${pct(arm.cacheReadShare)} | ${pct(arm.cacheWriteShare)} | ${arm.roundsPerTurn.toFixed(1)} | ${ms(arm.ttftP50Ms)} | ${ms(arm.ttftP95Ms)} | ${ms(arm.wallP50Ms)} | ${ms(arm.wallP95Ms)} | ${pct(arm.lengthFinishShare)} | ${arm.neverSolvedCases.join(" ") || "-"} |`);
  lines.push("", "## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)", "", "| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const comparison of report.comparisons)
    lines.push(`| ${comparison.arm} vs ${comparison.control} | ${comparison.cases} | ${comparison.wins} | ${comparison.losses} | ${comparison.ties} | ${(comparison.meanDifference * 100).toFixed(1)} pts | ${comparison.p.toFixed(3)} | ${comparison.holmP.toFixed(3)} | ${comparison.floor.toFixed(3)} |`);
  lines.push("", "The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.", "");
  const armKeys = report.arms.map((arm) => `${arm.runtimeVariant}/${arm.arm}`);
  lines.push("## Case matrix (passed/run)", "", `| Case | ${armKeys.join(" | ")} |`, `| --- | ${armKeys.map(() => "---:").join(" | ")} |`);
  for (const [caseId, cells] of Object.entries(report.caseMatrix).sort()) lines.push(`| ${caseId} | ${armKeys.map((key) => cells[key] ?? "-").join(" | ")} |`);
  lines.push("", "## Checks that never passed anywhere", "", report.uniformlyFailingChecks.length ? report.uniformlyFailingChecks.map((id) => `- ${id}`).join("\n") : "- none", "");
  if (report.skippedEpisodes.length) {
    lines.push("## Skipped episodes", "");
    for (const skipped of report.skippedEpisodes) lines.push(`- ${skipped.arm} ${skipped.caseId} r${skipped.repetition}: ${skipped.reason}`);
    lines.push("");
  }
  return lines.join("\n");
}

export type SelectionRule = {
  qualityFloorPoints: number;
  judgeFloor: number;
  wallP50MaxMs: number;
  ttftP50MaxMs: number;
  measuredShareMin: number;
  bestArmMaxCreditsPerTurn: number;
  fallbackWithinPoints: number;
  deepModeMaxCreditsPerTurn: number;
};

export const DEFAULT_SELECTION_RULE: SelectionRule = {
  qualityFloorPoints: 0.05,
  judgeFloor: 0.3,
  wallP50MaxMs: 45_000,
  ttftP50MaxMs: 5_000,
  measuredShareMin: 0.9,
  bestArmMaxCreditsPerTurn: 12,
  fallbackWithinPoints: 0.1,
  deepModeMaxCreditsPerTurn: 25,
};

export type Selection = { defaultArm: ArmSummary | null; deepArm: ArmSummary | null; reasoning: string[] };

export function selectArms(report: BenchmarkReport, eligibleArmIds: ReadonlySet<string>, rule: SelectionRule = DEFAULT_SELECTION_RULE): Selection {
  const reasoning: string[] = [];
  const currentShipped =
    report.arms.find(
      (arm) => arm.arm === "shipped" && arm.runtimeVariant === "current",
    ) ?? report.arms.find((arm) => arm.arm === "shipped");
  const shippedNeverSolved = new Set(currentShipped?.neverSolvedCases ?? []);
  const shippedCoverage = currentShipped?.coverage ?? [];
  const selectionSourceCommit = currentShipped?.sourceCommit ?? null;
  const expectedCoverage = JSON.stringify(shippedCoverage);
  const eligible = report.arms.filter((arm) => {
    const coversEveryCase = JSON.stringify(arm.coverage) === expectedCoverage;
    const hasCompleteJudges =
      arm.judgeEligible > 0 && arm.judgeComplete === arm.judgeEligible;
    const currentSource =
      selectionSourceCommit !== null &&
      arm.sourceCommit === selectionSourceCommit &&
      !arm.sourceDirty;
    const allowed = eligibleArmIds.has(arm.arm) && arm.measuredShare >= rule.measuredShareMin && coversEveryCase && hasCompleteJudges && currentSource;
    if (!allowed)
      reasoning.push(
        `${arm.runtimeVariant}/${arm.arm}: ineligible (zdr/no-training ${eligibleArmIds.has(arm.arm)}, measured ${(arm.measuredShare * 100).toFixed(0)} %, exact repetition coverage ${coversEveryCase}, complete judges ${arm.judgeComplete}/${arm.judgeEligible}, current clean source ${currentSource})`,
      );
    return allowed;
  });
  if (eligible.length === 0) return { defaultArm: null, deepArm: null, reasoning: [...reasoning, "no eligible arm"] };
  const solvesWhatShippedSolves = (arm: ArmSummary) => arm.neverSolvedCases.every((caseId) => shippedNeverSolved.has(caseId));
  const ranked = [...eligible].sort((a, b) => b.passRate - a.passRate || (b.judgeMean ?? 0) - (a.judgeMean ?? 0));
  const best = ranked.find(solvesWhatShippedSolves) ?? ranked[0];
  const bestJudge = Math.max(...eligible.map((arm) => arm.judgeMean ?? 0));
  const quality = eligible.filter((arm) => {
    const ok = arm.passRate >= best.passRate - rule.qualityFloorPoints && (arm.judgeMean ?? 0) >= bestJudge - rule.judgeFloor && solvesWhatShippedSolves(arm);
    if (!ok) reasoning.push(`${arm.runtimeVariant}/${arm.arm}: below the quality floor (pass ${pct(arm.passRate)} vs best ${pct(best.passRate)}, judge ${(arm.judgeMean ?? 0).toFixed(2)} vs ${bestJudge.toFixed(2)}, never solved ${arm.neverSolvedCases.join(" ") || "-"})`);
    return ok;
  });
  const fast = quality.filter((arm) => {
    const ok = (arm.wallP50Ms ?? Number.POSITIVE_INFINITY) <= rule.wallP50MaxMs && (arm.ttftP50Ms ?? Number.POSITIVE_INFINITY) <= rule.ttftP50MaxMs;
    if (!ok) reasoning.push(`${arm.runtimeVariant}/${arm.arm}: below the speed floor (wall p50 ${ms(arm.wallP50Ms)}, TTFT p50 ${ms(arm.ttftP50Ms)})`);
    return ok;
  });
  const cheapest = (arms: ArmSummary[]) =>
    [...arms].sort((a, b) => {
      const costA = a.costPerSuccessfulTask ?? Number.POSITIVE_INFINITY;
      const costB = b.costPerSuccessfulTask ?? Number.POSITIVE_INFINITY;
      if (Math.abs(costA - costB) / Math.max(costA, costB, 1e-9) <= 0.15) return (a.wallP50Ms ?? 0) - (b.wallP50Ms ?? 0);
      return costA - costB;
    })[0] ?? null;
  let defaultArm = cheapest(fast);
  if (defaultArm) reasoning.push(`default = cheapest cost per successful task among arms passing both floors: ${defaultArm.runtimeVariant}/${defaultArm.arm}`);
  else if (quality.length > 1) {
    defaultArm = cheapest(quality);
    reasoning.push(
      `no arm passes the speed floor (TTFT is measured after the tool rounds); latency ranks below cost, so default = cheapest cost per successful task among the ${quality.length} arms passing the quality floor: ${defaultArm?.runtimeVariant}/${defaultArm?.arm}`,
    );
  } else if (best.creditsPerTurn <= rule.bestArmMaxCreditsPerTurn) {
    defaultArm = best;
    reasoning.push(`no other arm passes the quality floor; the best arm ships because it costs ${best.creditsPerTurn.toFixed(1)} credits per turn`);
  } else {
    defaultArm = cheapest(eligible.filter((arm) => arm.passRate >= best.passRate - rule.fallbackWithinPoints));
    reasoning.push(`best arm too expensive (${best.creditsPerTurn.toFixed(1)} credits per turn); cheapest arm within ${rule.fallbackWithinPoints * 100} points chosen`);
  }
  const deep =
    [...eligible]
      .filter((arm) => arm.creditsPerTurn <= rule.deepModeMaxCreditsPerTurn && solvesWhatShippedSolves(arm))
      .sort((a, b) => b.passRate - a.passRate || (b.judgeMean ?? 0) - (a.judgeMean ?? 0))[0] ?? null;
  const deepArm = deep && defaultArm && deep.arm === defaultArm.arm && deep.runtimeVariant === defaultArm.runtimeVariant ? null : deep;
  reasoning.push(deepArm ? `deep mode = best-quality arm at most ${rule.deepModeMaxCreditsPerTurn} credits per turn: ${deepArm.runtimeVariant}/${deepArm.arm}` : "deep mode omitted: it would be the default arm");
  return { defaultArm, deepArm, reasoning };
}
