import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

import type { EpisodeArtifact } from "./episode";

import {
  armById,
  benchmarkArmsOverlayJson,
  BENCHMARK_ARMS,
  defaultBenchmarkArmIds,
  type BenchmarkArm,
} from "./arms";
import {
  campaignEpisodes,
  campaignSpendUsd,
  createCampaign,
  existingEpisode,
  loadCampaign,
  recoverInterruptedEpisode,
  worstCaseEpisodeCredits,
} from "./campaign";
import { requireLocalBenchmarkDatabase, requireLocalBenchmarkEnvironment } from "./env";
import {
  ARTIFACT_SCHEMA_VERSION,
  benchmarkCaseModelSelection,
  benchmarkSourceIdentity,
  persist,
  runEpisode,
} from "./episode";
import {
  BENCHMARK_CASES,
  createBenchmarkDb,
  FIXTURE_VERSION,
  type CaseId,
} from "./fixtures";
import {
  artifactCompatibilityIssues,
  benchmarkPathSegment,
  exactMatrixIssues,
  mergeGateFailureIds,
  type MergeCheckFailure,
} from "./gate";
import { judgeArtifact, judgeVerdictIsComplete } from "./judge";
import { validateJudgePreflight } from "./judge-preflight";
import {
  benchmarkReportDirectoryName,
  buildReport,
  persistMergeCheckSummary,
  renderReport,
  selectArms,
} from "./report";

const RUNS_DIR = resolve(process.cwd(), "scripts/agent-benchmark/.runs");
const REPORTS_DIR = resolve(process.cwd(), "scripts/agent-benchmark/reports");
const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const [command = "help", ...rest] = argv;
  const flags: Flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return { command, flags };
}

function list(flag: string | boolean | undefined, fallback: string[]): string[] {
  if (typeof flag !== "string" || !flag.trim()) return fallback;
  return flag.split(",").map((value) => value.trim()).filter(Boolean);
}

type ArmVerification = { arm: string; modelId: string; provider: string; eligible: boolean; hasZdr: boolean | null; hasNoTraining: boolean | null; reason: string | null; promptUsd: string | null; completionUsd: string | null };

async function verifyArms(arms: readonly BenchmarkArm[]): Promise<ArmVerification[]> {
  const results: ArmVerification[] = [];
  for (const arm of arms) {
    const response = await fetch(`${GATEWAY_MODELS_URL}/${arm.modelId}/endpoints`);
    if (!response.ok) {
      results.push({ arm: arm.id, modelId: arm.modelId, provider: arm.servingProvider, eligible: false, hasZdr: null, hasNoTraining: null, reason: `gateway ${response.status}`, promptUsd: null, completionUsd: null });
      continue;
    }
    const body = (await response.json()) as { data?: { endpoints?: { provider_name?: string; name?: string; has_zdr?: boolean; has_no_training?: boolean; pricing?: { prompt?: string; completion?: string } }[] } };
    const endpoint = body.data?.endpoints?.find((candidate) => (candidate.provider_name ?? candidate.name) === arm.servingProvider);
    if (!endpoint) {
      results.push({ arm: arm.id, modelId: arm.modelId, provider: arm.servingProvider, eligible: false, hasZdr: null, hasNoTraining: null, reason: "provider no longer serves the model", promptUsd: null, completionUsd: null });
      continue;
    }
    const eligible = endpoint.has_zdr === true && endpoint.has_no_training === true;
    results.push({
      arm: arm.id,
      modelId: arm.modelId,
      provider: arm.servingProvider,
      eligible,
      hasZdr: endpoint.has_zdr ?? null,
      hasNoTraining: endpoint.has_no_training ?? null,
      reason: eligible ? null : "endpoint reports no ZDR or no prompt-training opt-out",
      promptUsd: endpoint.pricing?.prompt ?? null,
      completionUsd: endpoint.pricing?.completion ?? null,
    });
  }
  return results;
}

async function withPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: requireLocalBenchmarkDatabase(), max: 4 });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

function gitPathList(args: readonly string[]): string[] {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" })
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);
}

function changedRepositoryPaths(): string[] {
  return [
    ...gitPathList(["diff", "--no-renames", "--name-only"]),
    ...gitPathList(["diff", "--cached", "--no-renames", "--name-only"]),
    ...gitPathList(["ls-files", "--others", "--exclude-standard"]),
  ];
}

async function runMatrix(input: {
  pool: Pool;
  db: Awaited<ReturnType<typeof createBenchmarkDb>>;
  appUrl: string;
  campaign: Awaited<ReturnType<typeof loadCampaign>>;
  armIds: string[];
  caseIds: CaseId[];
  reps: number;
  runtimeVariant: string;
  excluded: Set<string>;
}): Promise<MergeCheckFailure[]> {
  const failures: MergeCheckFailure[] = [];
  const outputDir = resolve(RUNS_DIR, input.campaign.id);
  for (let repetition = 1; repetition <= input.reps; repetition += 1)
    for (const caseId of input.caseIds)
      for (const armId of input.armIds) {
        const arm = armById(armId);
        if (input.excluded.has(arm.id)) {
          const reason = "excluded by verify-arms";
          failures.push({ arm: arm.id, caseId, repetition, reason });
          console.log(`skip ${arm.id} ${caseId} r${repetition}: ${reason}`);
          continue;
        }
        const existing = await existingEpisode(
          input.pool,
          input.campaign.id,
          arm.id,
          caseId,
          repetition,
          input.runtimeVariant,
        );
        if (existing && existing.state !== "failed") {
          if (existing.state === "scored" && existing.artifact_path) {
            const artifact = JSON.parse(await readFile(existing.artifact_path, "utf8")) as EpisodeArtifact;
            const definition = BENCHMARK_CASES.find(
              (candidate) => candidate.id === caseId,
            )!;
            const compatibility = artifactCompatibilityIssues(
              artifact,
              {
                schemaVersion: ARTIFACT_SCHEMA_VERSION,
                fixtureVersion: FIXTURE_VERSION,
                source: benchmarkSourceIdentity(),
                armConfig: arm,
                effectiveModelConfig:
                  benchmarkCaseModelSelection(caseId, arm).modelConfig,
                campaignId: input.campaign.id,
                arm: arm.id,
                caseId,
                repetition,
                runtimeVariant: input.runtimeVariant,
                creditCeiling: worstCaseEpisodeCredits(
                  { ...arm, ...benchmarkCaseModelSelection(caseId, arm).modelConfig },
                  definition.prompts.length,
                ),
                prompts: definition.prompts,
              },
            );
            if (compatibility.length) {
              const reason = `stale artifact: ${compatibility.join(", ")}`;
              failures.push({ arm: arm.id, caseId, repetition, reason });
              console.log(`have ${arm.id} ${caseId} r${repetition}: STALE ${reason}`);
              continue;
            }
            const gateFailures = mergeGateFailureIds(artifact);
            if (gateFailures.length)
              failures.push({ arm: arm.id, caseId, repetition, reason: `merge gate failed: ${gateFailures.join(",")}` });
            console.log(
              `have ${arm.id} ${caseId} r${repetition}: ${
                artifact.oracle?.passed
                  ? "PASS"
                  : gateFailures.length
                    ? `FAIL ${gateFailures.join(",")}`
                    : "QUALITY_MISS"
              }`,
            );
          } else {
            failures.push({ arm: arm.id, caseId, repetition, reason: `existing episode is ${existing.state}` });
            console.log(`have ${arm.id} ${caseId} r${repetition}: ${existing.state}`);
          }
          continue;
        }
        const startedAt = Date.now();
        try {
          const artifact = await runEpisode({
            db: input.db,
            pool: input.pool,
            appUrl: input.appUrl,
            campaign: input.campaign,
            arm,
            caseId,
            repetition,
            runtimeVariant: input.runtimeVariant,
            outputDir,
          });
          const verdict = artifact.skipped
            ? `SKIPPED ${artifact.skipped}`
            : artifact.oracle?.passed
              ? "PASS"
              : mergeGateFailureIds(artifact).length
                ? `FAIL ${mergeGateFailureIds(artifact).join(",")}`
                : `QUALITY_MISS ${artifact.oracle?.checks
                    .filter((check) => !check.passed)
                    .map((check) => check.id)
                    .join(",")}`;
          if (artifact.skipped || mergeGateFailureIds(artifact).length)
            failures.push({ arm: arm.id, caseId, repetition, reason: verdict });
          console.log(
            `${arm.id} ${caseId} r${repetition}: ${verdict} usd=${artifact.usd.toFixed(4)} ${(
              (Date.now() - startedAt) /
              1000
            ).toFixed(0)}s`,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const stranded = await existingEpisode(
            input.pool,
            input.campaign.id,
            arm.id,
            caseId,
            repetition,
            input.runtimeVariant,
          );
          failures.push({ arm: arm.id, caseId, repetition, reason });
          const recovery =
            stranded?.state === "prepared" || stranded?.state === "running"
              ? `; ledger remains ${stranded.state}, use the explicit recover command only after verifying no live work remains`
              : "";
          console.log(
            `${arm.id} ${caseId} r${repetition}: ERROR ${reason}${recovery}`,
          );
        }
      }
  return failures;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === "overlay") {
    process.stdout.write(benchmarkArmsOverlayJson() + "\n");
    return;
  }

  if (command === "arms") {
    for (const arm of BENCHMARK_ARMS) console.log(`${arm.id.padEnd(22)} ${arm.modelId.padEnd(34)} ${arm.servingProvider.padEnd(10)} ${arm.inferenceRegion ?? "global"}  ${arm.label}`);
    return;
  }

  if (command === "cases") {
    for (const definition of BENCHMARK_CASES) console.log(`${definition.id.padEnd(5)} ${definition.prompts.length} turn(s)  ${definition.title}`);
    return;
  }

  if (command === "verify-arms") {
    const results = await verifyArms(BENCHMARK_ARMS);
    await mkdir(RUNS_DIR, { recursive: true });
    await writeFile(resolve(RUNS_DIR, "arms-verified.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2) + "\n");
    for (const result of results) console.log(`${result.eligible ? "ok      " : "EXCLUDED"} ${result.arm.padEnd(22)} ${result.modelId.padEnd(34)} ${result.provider.padEnd(10)} zdr=${result.hasZdr} noTraining=${result.hasNoTraining} ${result.reason ?? ""}`);
    return;
  }

  if (command === "campaign") {
    const label = String(flags.label ?? "campaign");
    const cap = Number(flags.cap ?? 10);
    const campaign = await withPool((pool) => createCampaign(pool, label, cap));
    console.log(JSON.stringify(campaign));
    return;
  }

  if (command === "recover") {
    const required = (name: string) => {
      const value = flags[name];
      if (typeof value !== "string" || !value.trim())
        throw new Error(`recover requires a nonempty --${name} value.`);
      return value.trim();
    };
    const campaignId = required("campaign");
    const arm = required("arm");
    const caseId = required("case");
    const runtimeVariant = benchmarkPathSegment(
      required("variant"),
      "",
      "variant",
    );
    const repetition = Number(required("repetition"));
    if (!Number.isSafeInteger(repetition) || repetition < 1)
      throw new Error("recover requires --repetition to be a positive safe integer.");
    armById(arm);
    if (!BENCHMARK_CASES.some((definition) => definition.id === caseId))
      throw new Error(`Unknown benchmark case ${caseId}.`);
    const recovered = await withPool(async (pool) => {
      await loadCampaign(pool, campaignId);
      return recoverInterruptedEpisode(pool, {
        campaignId,
        arm,
        caseId,
        repetition,
        runtimeVariant,
      });
    });
    console.log(
      `recovered ${runtimeVariant}/${arm}/${caseId}/r${repetition} from ${recovered.previousState}; conservative charges were preserved`,
    );
    return;
  }

  if (command === "status") {
    const campaignId = String(flags.campaign ?? "");
    await withPool(async (pool) => {
      const campaign = await loadCampaign(pool, campaignId);
      const spent = await campaignSpendUsd(pool, campaignId);
      const episodes = await campaignEpisodes(pool, campaignId);
      const byState = episodes.reduce<Record<string, number>>((acc, episode) => ({ ...acc, [episode.state]: (acc[episode.state] ?? 0) + 1 }), {});
      console.log(JSON.stringify({ campaign, spentUsd: spent, episodes: byState }, null, 2));
    });
    return;
  }

  if (command === "run") {
    const env = requireLocalBenchmarkEnvironment();
    const campaignId = String(flags.campaign ?? "");
    const armIds = list(flags.arms, defaultBenchmarkArmIds());
    const defaultCases = armIds.length === 1 && armIds[0] === "shipped"
      ? BENCHMARK_CASES
      : BENCHMARK_CASES.filter((definition) => definition.comparative !== false);
    const caseIds = list(flags.cases, defaultCases.map((definition) => definition.id)) as CaseId[];
    const reps = Number(flags.reps ?? 1);
    const runtimeVariant = benchmarkPathSegment(
      flags.variant,
      "default",
      "variant",
    );
    const verified = JSON.parse(await readFile(resolve(RUNS_DIR, "arms-verified.json"), "utf8").catch(() => '{"results":[]}')) as { results: ArmVerification[] };
    const excluded = new Set(verified.results.filter((result) => !result.eligible).map((result) => result.arm));
    const db = await createBenchmarkDb(env.databaseUrl, env.appUrl);
    await withPool(async (pool) => {
      const campaign = await loadCampaign(pool, campaignId);
      await runMatrix({
        pool,
        db,
        appUrl: env.appUrl,
        campaign,
        armIds,
        caseIds,
        reps,
        runtimeVariant,
        excluded,
      });
    });
    await db.prisma.$disconnect();
    return;
  }

  if (command === "check") {
    const env = requireLocalBenchmarkEnvironment();
    const sourceAtStart = benchmarkSourceIdentity({ refresh: true });
    if (sourceAtStart.sourceDirty)
      throw new Error(
        "Agent benchmark merge checks require a clean Git worktree so their evidence is attributable.",
      );
    const label = benchmarkPathSegment(flags.label, "merge-check", "label");
    const cap = Number(flags.cap ?? 10);
    const runtimeVariant = benchmarkPathSegment(
      flags.variant,
      "merge",
      "variant",
    );
    const db = await createBenchmarkDb(env.databaseUrl, env.appUrl);
    const result = await withPool(async (pool) => {
      const campaign = typeof flags.campaign === "string"
        ? await loadCampaign(pool, flags.campaign)
        : await createCampaign(pool, label, cap);
      console.log(`campaign ${campaign.id}`);
      const failures = await runMatrix({
        pool,
        db,
        appUrl: env.appUrl,
        campaign,
        armIds: defaultBenchmarkArmIds(),
        caseIds: BENCHMARK_CASES.map((definition) => definition.id),
        reps: 1,
        runtimeVariant,
        excluded: new Set(),
      });
      const episodes = await campaignEpisodes(pool, campaign.id);
      const matrixIssues = exactMatrixIssues(
        episodes,
        BENCHMARK_CASES.map((definition) => definition.id),
        runtimeVariant,
        "shipped",
      );
      for (const reason of matrixIssues)
        failures.push({
          arm: "shipped",
          caseId: BENCHMARK_CASES[0]!.id,
          repetition: 1,
          reason: `matrix incomplete: ${reason}`,
        });
      const sourceAtEnd = benchmarkSourceIdentity({ refresh: true });
      if (
        sourceAtEnd.sourceDirty ||
        sourceAtEnd.sourceCommit !== sourceAtStart.sourceCommit
      )
        failures.push({
          arm: "shipped",
          caseId: BENCHMARK_CASES[0]!.id,
          repetition: 1,
          reason:
            "source changed while the merge check was running; rebuild and start a fresh campaign from a clean tree",
        });
      return { campaign, failures, totalUsd: await campaignSpendUsd(pool, campaign.id) };
    });
    await db.prisma.$disconnect();
    await persistMergeCheckSummary(resolve(RUNS_DIR, result.campaign.id), {
      status: result.failures.length ? "failed" : "passed",
      expectedCases: BENCHMARK_CASES.length,
      expectedTurns: BENCHMARK_CASES.reduce((total, definition) => total + definition.prompts.length, 0),
      runtimeVariant,
      sourceCommit: sourceAtStart.sourceCommit,
      failures: result.failures,
    });
    const report = await buildReport(
      result.campaign.id,
      resolve(RUNS_DIR, result.campaign.id),
      result.totalUsd,
    );
    const reportDir = resolve(
      REPORTS_DIR,
      benchmarkReportDirectoryName(
        new Date().toISOString().slice(0, 10),
        label,
        result.campaign.id,
      ),
    );
    await mkdir(reportDir, { recursive: true });
    await writeFile(resolve(reportDir, "report.md"), renderReport(report));
    await writeFile(resolve(reportDir, "report.json"), JSON.stringify({ report }, null, 2) + "\n");
    console.log(`written ${reportDir}`);
    if (result.failures.length) {
      console.error(`merge check failed (${result.failures.length}):`);
      for (const failure of result.failures)
        console.error(`- ${failure.arm} ${failure.caseId} r${failure.repetition}: ${failure.reason}`);
      throw new Error(`Agent benchmark merge check failed for campaign ${result.campaign.id}.`);
    }
    console.log(`merge check passed: ${BENCHMARK_CASES.length} cases in campaign ${result.campaign.id}`);
    return;
  }

  if (command === "judge") {
    const campaignId = typeof flags.campaign === "string" ? flags.campaign.trim() : "";
    if (!campaignId) throw new Error("judge requires a nonempty --campaign ID.");
    const env = requireLocalBenchmarkEnvironment();
    const outputDir = resolve(RUNS_DIR, campaignId);
    await withPool(async (pool) => {
      await loadCampaign(pool, campaignId);
      const { readdir } = await import("node:fs/promises");
      async function walk(path: string): Promise<string[]> {
        const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
        const files: string[] = [];
        for (const entry of entries) {
          const full = resolve(path, entry.name);
          if (entry.isDirectory()) files.push(...(await walk(full)));
          else if (entry.name.endsWith(".json")) files.push(full);
        }
        return files;
      }
      const files = await walk(outputDir);
      const ledgerEpisodes = await campaignEpisodes(pool, campaignId);
      const candidates = await Promise.all(
        files.map(async (path) => ({
          path,
          value: JSON.parse(await readFile(path, "utf8")) as unknown,
        })),
      );
      const preflight = validateJudgePreflight({
        campaignId,
        campaignDirectory: outputDir,
        sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: process.cwd(),
          encoding: "utf8",
        }).trim(),
        changedPaths: changedRepositoryPaths(),
        ledgerEpisodes,
        artifactCandidates: candidates,
      });
      if (preflight.issues.length)
        throw new Error(
          `Judge preflight failed (${preflight.issues.length}):\n${preflight.issues
            .map((issue) => `- ${issue}`)
            .join("\n")}`,
        );
      const judgeConcurrency = Number(flags.concurrency ?? 6);
      if (!Number.isInteger(judgeConcurrency) || judgeConcurrency < 1)
        throw new Error("--concurrency must be a positive integer.");
      let cursor = 0;
      const judgeFailures: string[] = [];
      const judgeNext = async (): Promise<void> => {
        while (cursor < preflight.selected.length) {
          const selected = preflight.selected[cursor];
          cursor += 1;
          if (!selected) continue;
          const { path: file, artifact } = selected;
          if (judgeVerdictIsComplete(artifact.judge) || (flags.force !== true && artifact.observed.length === 0))
            continue;
          try {
            artifact.judge = await judgeArtifact(
              pool,
              env.gatewayApiKey,
              artifact,
              async (progress) => {
                artifact.judge = progress;
                await persist(file, artifact);
              },
            );
            await persist(file, artifact);
            console.log(`judged ${artifact.arm} ${artifact.caseId} r${artifact.repetition}: ${(artifact.judge as { mean: number | null }).mean?.toFixed(2)}`);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            judgeFailures.push(`${artifact.arm} ${artifact.caseId} r${artifact.repetition}: ${reason}`);
            console.log(`judge failed ${artifact.arm} ${artifact.caseId}: ${reason}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, judgeConcurrency) }, () => judgeNext()));
      for (const { path: file } of preflight.selected) {
        const artifact = JSON.parse(await readFile(file, "utf8")) as EpisodeArtifact;
        if (artifact.observed.length === 0) continue;
        if (!judgeVerdictIsComplete(artifact.judge))
          judgeFailures.push(
            `${artifact.arm} ${artifact.caseId} r${artifact.repetition}: incomplete judge verdict`,
          );
      }
      if (judgeFailures.length)
        throw new Error(
          `Judge run incomplete (${judgeFailures.length}):\n${judgeFailures
            .map((failure) => `- ${failure}`)
            .join("\n")}`,
        );
    });
    return;
  }

  if (command === "report") {
    const campaignId = String(flags.campaign ?? "");
    const label = benchmarkPathSegment(
      flags.label,
      campaignId.slice(0, 8),
      "label",
    );
    const totalUsd = await withPool((pool) => campaignSpendUsd(pool, campaignId));
    const report = await buildReport(campaignId, resolve(RUNS_DIR, campaignId), totalUsd);
    const verified = JSON.parse(await readFile(resolve(RUNS_DIR, "arms-verified.json"), "utf8").catch(() => '{"results":[]}')) as { results: ArmVerification[] };
    const eligible = new Set(verified.results.filter((result) => result.eligible).map((result) => result.arm));
    const selection = selectArms(report, eligible.size ? eligible : new Set(BENCHMARK_ARMS.map((arm) => arm.id)));
    const dir = resolve(
      REPORTS_DIR,
      benchmarkReportDirectoryName(
        new Date().toISOString().slice(0, 10),
        label,
        campaignId,
      ),
    );
    await mkdir(dir, { recursive: true });
    const markdown = [renderReport(report), "## Selection rule", "", `Default: ${selection.defaultArm ? `${selection.defaultArm.runtimeVariant}/${selection.defaultArm.arm}` : "none"}`, `Deep mode: ${selection.deepArm ? `${selection.deepArm.runtimeVariant}/${selection.deepArm.arm}` : "none"}`, "", ...selection.reasoning.map((line) => `- ${line}`), ""].join("\n");
    await writeFile(resolve(dir, "report.md"), markdown);
    await writeFile(resolve(dir, "report.json"), JSON.stringify({ report, selection, armsVerified: verified }, null, 2) + "\n");
    console.log(markdown);
    console.log(`written ${dir}`);
    return;
  }

  console.log("Commands: arms | cases | overlay | verify-arms | check [--label L] [--cap USD] [--campaign ID] [--variant merge] | campaign --label L --cap USD | status --campaign ID | run --campaign ID [--arms a,b (default: shipped)] [--cases S1,S2] [--reps N] [--variant current] | recover --campaign ID --arm A --case C --repetition N --variant V | judge --campaign ID | report --campaign ID [--label L]");
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
