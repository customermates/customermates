import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

import type { EpisodeArtifact } from "./episode";

import { armById, benchmarkArmsOverlayJson, BENCHMARK_ARMS, type BenchmarkArm } from "./arms";
import { campaignEpisodes, campaignSpendUsd, createCampaign, existingEpisode, loadCampaign } from "./campaign";
import { requireLocalBenchmarkDatabase, requireLocalBenchmarkEnvironment } from "./env";
import { runEpisode } from "./episode";
import { BENCHMARK_CASES, createBenchmarkDb, type CaseId } from "./fixtures";
import { judgeArtifact, judgeVerdictIsComplete } from "./judge";
import { buildReport, renderReport, selectArms } from "./report";

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
    const cap = Number(flags.cap ?? 200);
    const campaign = await withPool((pool) => createCampaign(pool, label, cap));
    console.log(JSON.stringify(campaign));
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
    const armIds = list(flags.arms, BENCHMARK_ARMS.map((arm) => arm.id));
    const caseIds = list(flags.cases, BENCHMARK_CASES.map((definition) => definition.id)) as CaseId[];
    const reps = Number(flags.reps ?? 1);
    const runtimeVariant = String(flags.variant ?? "default");
    const verified = JSON.parse(await readFile(resolve(RUNS_DIR, "arms-verified.json"), "utf8").catch(() => '{"results":[]}')) as { results: ArmVerification[] };
    const excluded = new Set(verified.results.filter((result) => !result.eligible).map((result) => result.arm));
    const db = await createBenchmarkDb(env.databaseUrl, env.appUrl);
    await withPool(async (pool) => {
      const campaign = await loadCampaign(pool, campaignId);
      const outputDir = resolve(RUNS_DIR, campaignId);
      for (let repetition = 1; repetition <= reps; repetition += 1)
        for (const caseId of caseIds)
          for (const armId of armIds) {
            const arm = armById(armId);
            if (excluded.has(arm.id)) {
              console.log(`skip ${arm.id} ${caseId} r${repetition}: excluded by verify-arms`);
              continue;
            }
            const existing = await existingEpisode(pool, campaign.id, arm.id, caseId, repetition, runtimeVariant);
            if (existing && existing.state !== "failed") {
              console.log(`have ${arm.id} ${caseId} r${repetition}: ${existing.state}`);
              continue;
            }
            const startedAt = Date.now();
            try {
              const artifact = await runEpisode({ db, pool, appUrl: env.appUrl, campaign, arm, caseId, repetition, runtimeVariant, outputDir });
              const verdict = artifact.skipped ? `SKIPPED ${artifact.skipped}` : artifact.oracle?.passed ? "PASS" : `FAIL ${artifact.oracle?.checks.filter((check) => !check.passed).map((check) => check.id).join(",")}`;
              console.log(`${arm.id} ${caseId} r${repetition}: ${verdict} usd=${artifact.usd.toFixed(4)} ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
            } catch (error) {
              console.log(`${arm.id} ${caseId} r${repetition}: ERROR ${error instanceof Error ? error.message : String(error)}`);
            }
          }
    });
    await db.prisma.$disconnect();
    return;
  }

  if (command === "judge") {
    const env = requireLocalBenchmarkEnvironment();
    const campaignId = String(flags.campaign ?? "");
    const outputDir = resolve(RUNS_DIR, campaignId);
    await withPool(async (pool) => {
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
      const judgeConcurrency = Number(flags.concurrency ?? 6);
      let cursor = 0;
      const judgeNext = async (): Promise<void> => {
        while (cursor < files.length) {
          const file = files[cursor];
          cursor += 1;
          const artifact = JSON.parse(await readFile(file, "utf8")) as EpisodeArtifact;
          if (artifact.skipped || judgeVerdictIsComplete(artifact.judge) || (flags.force !== true && artifact.observed.length === 0))
            continue;
          try {
            artifact.judge = await judgeArtifact(pool, env.gatewayApiKey, artifact);
            await writeFile(file, JSON.stringify(artifact, null, 2) + "\n");
            console.log(`judged ${artifact.arm} ${artifact.caseId} r${artifact.repetition}: ${(artifact.judge as { mean: number | null }).mean?.toFixed(2)}`);
          } catch (error) {
            console.log(`judge failed ${artifact.arm} ${artifact.caseId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, judgeConcurrency) }, () => judgeNext()));
    });
    return;
  }

  if (command === "report") {
    const campaignId = String(flags.campaign ?? "");
    const label = String(flags.label ?? campaignId.slice(0, 8));
    const report = await buildReport(campaignId, resolve(RUNS_DIR, campaignId));
    const verified = JSON.parse(await readFile(resolve(RUNS_DIR, "arms-verified.json"), "utf8").catch(() => '{"results":[]}')) as { results: ArmVerification[] };
    const eligible = new Set(verified.results.filter((result) => result.eligible).map((result) => result.arm));
    const selection = selectArms(report, eligible.size ? eligible : new Set(BENCHMARK_ARMS.map((arm) => arm.id)));
    const dir = resolve(REPORTS_DIR, `${new Date().toISOString().slice(0, 10)}-${label}`);
    await mkdir(dir, { recursive: true });
    const markdown = [renderReport(report), "## Selection rule", "", `Default: ${selection.defaultArm ? `${selection.defaultArm.runtimeVariant}/${selection.defaultArm.arm}` : "none"}`, `Deep mode: ${selection.deepArm ? `${selection.deepArm.runtimeVariant}/${selection.deepArm.arm}` : "none"}`, "", ...selection.reasoning.map((line) => `- ${line}`), ""].join("\n");
    await writeFile(resolve(dir, "report.md"), markdown);
    await writeFile(resolve(dir, "report.json"), JSON.stringify({ report, selection, armsVerified: verified }, null, 2) + "\n");
    console.log(markdown);
    console.log(`written ${dir}`);
    return;
  }

  console.log("Commands: arms | cases | overlay | verify-arms | campaign --label L --cap USD | status --campaign ID | run --campaign ID [--arms a,b] [--cases S1,S2] [--reps N] [--variant current] | judge --campaign ID | report --campaign ID [--label L]");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
