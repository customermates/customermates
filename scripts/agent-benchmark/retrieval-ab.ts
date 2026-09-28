import "dotenv/config";

import type { RetrievalTiming } from "@/core/retrieval/retrieval-context";
import type { EpisodeArtifact } from "./episode";

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Pool } from "pg";

import { getDocsPageRaw } from "@/features/mcp-tools/docs-manifest";
import { splitSections } from "@/features/mcp-tools/docs-sections";

import {
  campaignSpendUsd,
  reserveCharge,
  settleReservedCharge,
} from "./campaign";
import { requireLocalBenchmarkDatabase } from "./env";
import { usageFollowsRoute } from "./usage-route";
import { HELDOUT_DOCS_CASES } from "./heldout-cases";
import { DOCS_EMBEDDING_HELDOUT } from "./heldout-data/docs-embedding";
import { DOCS_HELDOUT } from "./heldout-data/docs";
import { isEpisodeArtifactFileName } from "./report";
import { mcnemarExact, percentile } from "./stats";

const FACT_JUDGE_MODEL = "google/gemini-3-flash";
const FACT_JUDGE_RESERVE_USD = 0.01;
const FACT_JUDGE_CONCURRENCY = 6;
const SECTION_CHARS = 6_000;
const MICROCENTS_PER_USD = 100_000_000;
const DOCS_RETRIEVAL_TOOLS = new Set(["search_docs", "get_docs_page"]);

const FACT_JUDGE_SYSTEM =
  "You grade answers of the Customermates CRM assistant to documentation questions. You get the user question, a reference answer, the documentation section the reference answer comes from, and the assistant's final answer, which may be in another language. Answer `yes` if the assistant's answer states the reference answer or everything needed to derive it, and does not contradict the reference answer or the section. Answer `partial` if it is on the right topic but misses part of the reference answer. Answer `no` otherwise. Do not use outside knowledge.";

type Verdict = "yes" | "partial" | "no" | "error";
type Artifact = EpisodeArtifact & { path: string };
type Unit = {
  caseId: string;
  repetition: number;
  family: "DH" | "DE";
  pass: boolean;
  oraclePass: boolean;
  routeFlagOnly: boolean;
  verdict: Verdict | null;
  credits: number;
  usd: number;
  turns: number;
  firstOutputMs: number | null;
  searchDocsMs: number[];
  getDocsPageMs: number[];
  unattributedDocsMs: number[];
  docsTimings: RetrievalTiming[];
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const campaignId = flag("campaign");
const control = flag("control") ?? "retrieval-baseline";
const candidate = flag("candidate") ?? "retrieval-candidate";
const judgeEnabled = !process.argv.includes("--no-judge");
if (!campaignId) throw new Error("Pass --campaign <id>.");

const runsDir = resolve(
  process.cwd(),
  "scripts/agent-benchmark/.runs",
  campaignId,
);
const verdictsPath = join(runsDir, "gold-fact-verdicts.json");
const specOf = (caseId: string) =>
  HELDOUT_DOCS_CASES.find((entry) => entry.id === caseId)?.spec;
const items = [...DOCS_HELDOUT, ...DOCS_EMBEDDING_HELDOUT];
const embeddingItemIds = new Set(DOCS_EMBEDDING_HELDOUT.map((item) => item.id));

function loadArtifacts(): Artifact[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        isEpisodeArtifactFileName(entry.name) &&
        entry.name !== "gold-fact-verdicts.json"
      )
        files.push(full);
    }
  };
  if (existsSync(runsDir)) walk(runsDir);
  return files
    .map((path) => ({
      ...(JSON.parse(readFileSync(path, "utf8")) as EpisodeArtifact),
      path,
    }))
    .filter(
      (artifact) =>
        specOf(artifact.caseId) &&
        [control, candidate].includes(artifact.runtimeVariant),
    );
}

const usable = (artifact: Artifact) =>
  !artifact.skipped && artifact.oracle !== null;

function routeHolds(artifact: Artifact) {
  const { modelId, servingProvider } = artifact.effectiveModelConfig;
  return (
    artifact.metrics.turns.length > 0 &&
    artifact.metrics.turns.every(
      (turn) =>
        turn.modelSpec === modelId && turn.servingProvider === servingProvider,
    ) &&
    usageFollowsRoute(artifact.usage, modelId)
  );
}

function oraclePasses(artifact: Artifact) {
  const failed = (artifact.oracle?.checks ?? [])
    .filter((check) => !check.passed)
    .map((check) => check.id);
  if (failed.length === 0) return true;
  return (
    failed.every((id) => id === "integrity:correctRoute") &&
    routeHolds(artifact)
  );
}
const verdictKey = (artifact: Artifact) =>
  `${artifact.runtimeVariant}/${artifact.caseId}/r${artifact.repetition}/${artifact.episodeId}`;

function goldSection(itemId: string): string {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Unknown held-out item ${itemId}`);
  const [slug, anchor] = item.anchors[0].split("#");
  const page = getDocsPageRaw(slug, item.docsLocale, "docs");
  const section = page
    ? splitSections({
        slug,
        source: "docs",
        pageTitle: page.title,
        markdown: page.markdown,
      }).find((entry) => entry.anchor === anchor)
    : undefined;
  if (!section)
    throw new Error(
      `Gold section ${item.docsLocale}:${slug}#${anchor} not found`,
    );
  return `## ${section.headingPath.join(" > ")}\n${section.text}`.slice(
    0,
    SECTION_CHARS,
  );
}

async function judgeAll(
  artifacts: readonly Artifact[],
): Promise<Map<string, Verdict>> {
  const cache = existsSync(verdictsPath)
    ? (JSON.parse(readFileSync(verdictsPath, "utf8")) as Record<
        string,
        Verdict
      >)
    : {};
  const pending = artifacts.filter(
    (artifact) =>
      usable(artifact) &&
      (!cache[verdictKey(artifact)] || cache[verdictKey(artifact)] === "error"),
  );
  if (judgeEnabled && pending.length > 0) {
    const { generateText, jsonSchema, Output } = await import("ai");
    const { readAgentProviderCharge } = await import(
      "@/ee/agent-chat/gateway-cost"
    );
    const pool = new Pool({
      connectionString: requireLocalBenchmarkDatabase(),
      max: 4,
    });
    const judgeOne = async (artifact: Artifact): Promise<Verdict> => {
      const spec = specOf(artifact.caseId)!;
      const reservation = await reserveCharge(
        pool,
        artifact.campaignId,
        artifact.episodeId,
        "judge",
        FACT_JUDGE_RESERVE_USD,
        {
          model: FACT_JUDGE_MODEL,
          use: "heldout-gold-fact",
        },
      );
      if (!reservation)
        throw new Error(
          "The campaign cap cannot admit another gold-fact judge call.",
        );
      try {
        const result = await generateText({
          model: FACT_JUDGE_MODEL,
          system: FACT_JUDGE_SYSTEM,
          prompt: `QUESTION: ${spec.prompt}\n\nREFERENCE ANSWER: ${spec.goldFact}\n\nDOCUMENTATION SECTION:\n${goldSection(spec.itemId)}\n\nASSISTANT ANSWER:\n${artifact.observed.at(-1)?.text.trim() || "(empty)"}`,
          output: Output.object({
            schema: jsonSchema<{ verdict: "yes" | "partial" | "no" }>({
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["yes", "partial", "no"] },
              },
              required: ["verdict"],
              additionalProperties: false,
            }),
          }),
          temperature: 0,
          maxRetries: 2,
          providerOptions: {
            gateway: {
              only: ["vertex"],
              zeroDataRetention: true,
              disallowPromptTraining: true,
            },
            vertex: { thinkingConfig: { thinkingLevel: "low" } },
          },
        });
        const charge = readAgentProviderCharge(
          result.providerMetadata,
          "vertex",
        );
        await settleReservedCharge(
          pool,
          reservation,
          charge.outcome === "measured"
            ? charge.charge.costMicrocents / MICROCENTS_PER_USD
            : FACT_JUDGE_RESERVE_USD,
          {
            model: FACT_JUDGE_MODEL,
            use: "heldout-gold-fact",
            measured: charge.outcome === "measured",
          },
        );
        return result.output.verdict;
      } catch (error) {
        process.stderr.write(
          `gold-fact judge error ${verdictKey(artifact)}: ${String(error).slice(0, 200)}\n`,
        );
        return "error";
      }
    };
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const artifact = pending[cursor++];
          cache[verdictKey(artifact)] = await judgeOne(artifact);
        }
      };
      await Promise.all(Array.from({ length: FACT_JUDGE_CONCURRENCY }, worker));
      process.stderr.write(
        `Campaign spend after judging: ${(await campaignSpendUsd(pool, campaignId!)).toFixed(4)} USD\n`,
      );
    } finally {
      writeFileSync(verdictsPath, `${JSON.stringify(cache, null, 2)}\n`);
      await pool.end();
    }
  }
  return new Map(Object.entries(cache));
}

function docsLatencies(artifact: Artifact) {
  const search: number[] = [];
  const page: number[] = [];
  const unattributed: number[] = [];
  const timings: RetrievalTiming[] = [];
  artifact.observed.forEach((turn, index) => {
    const trace = artifact.metrics.turns[index]?.classifierTrace;
    const docsTimings = (trace?.retrieval ?? []).filter(
      (timing) => timing.corpus === "docs",
    );
    timings.push(...docsTimings);
    const calls = turn.tools.filter(
      (tool) =>
        DOCS_RETRIEVAL_TOOLS.has(tool.name) &&
        (tool.name === "search_docs" ||
          Boolean((tool.input as { query?: string } | undefined)?.query)),
    );
    if (calls.length !== docsTimings.length) {
      unattributed.push(...docsTimings.map((timing) => timing.totalMs));
      return;
    }
    const rounds = [...new Set(calls.map((call) => call.roundIndex ?? -1))];
    let cursor = 0;
    for (const round of rounds) {
      const inRound = calls.filter((call) => (call.roundIndex ?? -1) === round);
      const slice = docsTimings
        .slice(cursor, cursor + inRound.length)
        .map((timing) => timing.totalMs);
      cursor += inRound.length;
      const names = new Set(inRound.map((call) => call.name));
      if (names.size !== 1 || round === -1) unattributed.push(...slice);
      else if (names.has("search_docs")) search.push(...slice);
      else page.push(...slice);
    }
  });
  return { search, page, unattributed, timings };
}

function unitOf(artifact: Artifact, verdict: Verdict | null): Unit {
  const spec = specOf(artifact.caseId)!;
  const latencies = docsLatencies(artifact);
  return {
    caseId: artifact.caseId,
    repetition: artifact.repetition,
    family: embeddingItemIds.has(spec.itemId) ? "DE" : "DH",
    pass: oraclePasses(artifact) && verdict === "yes",
    oraclePass: oraclePasses(artifact),
    routeFlagOnly: !artifact.oracle?.passed && oraclePasses(artifact),
    verdict,
    credits: artifact.usage.reduce(
      (total, entry) => total + entry.chargedCredits,
      0,
    ),
    usd:
      artifact.usage.reduce(
        (total, entry) => total + Number(entry.costMicrocents),
        0,
      ) / MICROCENTS_PER_USD,
    turns: artifact.turns.length,
    firstOutputMs: artifact.turns[0]?.timing.firstOutputMs ?? null,
    searchDocsMs: latencies.search,
    getDocsPageMs: latencies.page,
    unattributedDocsMs: latencies.unattributed,
    docsTimings: latencies.timings,
  };
}

function wilson(successes: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.959964;
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function armSummary(units: readonly Unit[]) {
  const passed = units.filter((unit) => unit.pass).length;
  const turns = units.reduce((total, unit) => total + unit.turns, 0);
  const search = units.flatMap((unit) => unit.searchDocsMs);
  const allDocs = units.flatMap((unit) => [
    ...unit.searchDocsMs,
    ...unit.getDocsPageMs,
    ...unit.unattributedDocsMs,
  ]);
  const timings = units.flatMap((unit) => unit.docsTimings);
  const share = (predicate: (timing: RetrievalTiming) => boolean) =>
    timings.length ? timings.filter(predicate).length / timings.length : null;
  const verdicts = units.reduce<Record<string, number>>((acc, unit) => {
    const key = unit.verdict ?? "missing";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return {
    episodes: units.length,
    passed,
    passRate: units.length ? passed / units.length : 0,
    wilson95: wilson(passed, units.length),
    oraclePass: units.filter((unit) => unit.oraclePass).length,
    routeFlagOnly: units.filter((unit) => unit.routeFlagOnly).length,
    verdicts,
    creditsPerTurn: turns
      ? units.reduce((total, unit) => total + unit.credits, 0) / turns
      : 0,
    usdPerTurn: turns
      ? units.reduce((total, unit) => total + unit.usd, 0) / turns
      : 0,
    usdTotal: units.reduce((total, unit) => total + unit.usd, 0),
    searchDocsCalls: search.length,
    searchDocsP50Ms: percentile(search, 50),
    searchDocsP95Ms: percentile(search, 95),
    docsRetrievalCalls: allDocs.length,
    docsRetrievalP50Ms: percentile(allDocs, 50),
    docsRetrievalP95Ms: percentile(allDocs, 95),
    unattributedCalls: units.reduce(
      (total, unit) => total + unit.unattributedDocsMs.length,
      0,
    ),
    firstOutputP50Ms: percentile(
      units.flatMap((unit) =>
        unit.firstOutputMs === null ? [] : [unit.firstOutputMs],
      ),
      50,
    ),
    firstOutputP95Ms: percentile(
      units.flatMap((unit) =>
        unit.firstOutputMs === null ? [] : [unit.firstOutputMs],
      ),
      95,
    ),
    embeddingUsed: share((timing) => timing.embedding === "used"),
    embeddingTimeout: share((timing) => timing.embedding === "timeout"),
    rerankUsed: share((timing) => timing.rerank === "used"),
  };
}

const pct = (value: number | null) =>
  value === null ? "-" : `${(100 * value).toFixed(1)} %`;
const seconds = (value: number | null) =>
  value === null ? "-" : `${(value / 1000).toFixed(2)} s`;
const pValue = (value: number) =>
  value >= 0.01 ? value.toFixed(2) : value.toExponential(1);

async function main() {
  const artifacts = loadArtifacts();
  const verdicts = await judgeAll(artifacts);
  const units = new Map<string, Unit>();
  for (const artifact of artifacts)
    if (usable(artifact))
      units.set(
        `${artifact.runtimeVariant}/${artifact.caseId}/${artifact.repetition}`,
        unitOf(artifact, verdicts.get(verdictKey(artifact)) ?? null),
      );
  const side = (variant: string) =>
    [...units.entries()]
      .filter(([key]) => key.startsWith(`${variant}/`))
      .map(([, unit]) => unit);
  const pairs = side(control).flatMap((unit) => {
    const other = units.get(`${candidate}/${unit.caseId}/${unit.repetition}`);
    return other ? [{ control: unit, candidate: other }] : [];
  });
  const lost = artifacts
    .filter((artifact) => !usable(artifact))
    .map((artifact) => verdictKey(artifact));
  const summary = {
    campaignId,
    control: armSummary(side(control)),
    candidate: armSummary(side(candidate)),
    pairs: pairs.length,
    mcnemar: mcnemarExact(
      pairs.map((pair) => ({
        control: pair.control.pass,
        candidate: pair.candidate.pass,
      })),
    ),
    byFamily: Object.fromEntries(
      (["DH", "DE"] as const).map((family) => {
        const subset = pairs.filter((pair) => pair.control.family === family);
        return [
          family,
          {
            control: subset.filter((pair) => pair.control.pass).length,
            candidate: subset.filter((pair) => pair.candidate.pass).length,
            pairs: subset.length,
            mcnemar: mcnemarExact(
              subset.map((pair) => ({
                control: pair.control.pass,
                candidate: pair.candidate.pass,
              })),
            ),
          },
        ];
      }),
    ),
    lost,
  };
  writeFileSync(
    join(runsDir, "retrieval-ab.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  const rows: Array<[string, (arm: ReturnType<typeof armSummary>) => string]> =
    [
      ["Episodes (usable)", (arm) => String(arm.episodes)],
      [
        "Pass (oracle + gold-fact yes)",
        (arm) =>
          `${pct(arm.passRate)} (${arm.passed}/${arm.episodes}) [${arm.wilson95 ? arm.wilson95.map((v) => (100 * v).toFixed(1)).join(", ") : "-"}]`,
      ],
      [
        "Oracle pass (embedding usage excluded from the route check)",
        (arm) =>
          `${arm.oraclePass}/${arm.episodes} (${arm.routeFlagOnly} flagged only by correctRoute)`,
      ],
      [
        "Gold-fact verdicts",
        (arm) =>
          Object.entries(arm.verdicts)
            .map(([key, count]) => `${key} ${count}`)
            .join(", "),
      ],
      ["Credits per turn", (arm) => arm.creditsPerTurn.toFixed(3)],
      ["USD per turn", (arm) => `$${arm.usdPerTurn.toFixed(4)}`],
      ["search_docs calls", (arm) => String(arm.searchDocsCalls)],
      ["search_docs p50", (arm) => seconds(arm.searchDocsP50Ms)],
      ["search_docs p95", (arm) => seconds(arm.searchDocsP95Ms)],
      [
        "All docs retrieval calls p50 / p95",
        (arm) =>
          `${seconds(arm.docsRetrievalP50Ms)} / ${seconds(arm.docsRetrievalP95Ms)} (${arm.docsRetrievalCalls}, ${arm.unattributedCalls} unattributed)`,
      ],
      [
        "First output p50 / p95",
        (arm) =>
          `${seconds(arm.firstOutputP50Ms)} / ${seconds(arm.firstOutputP95Ms)}`,
      ],
      [
        "Docs calls: embedding used / timeout",
        (arm) => `${pct(arm.embeddingUsed)} / ${pct(arm.embeddingTimeout)}`,
      ],
      ["Docs calls: re-rank used", (arm) => pct(arm.rerankUsed)],
    ];
  const lines = [
    `| Measure | ${control} | ${candidate} |`,
    "| --- | ---: | ---: |",
    ...rows.map(
      ([label, render]) =>
        `| ${label} | ${render(summary.control)} | ${render(summary.candidate)} |`,
    ),
    "",
    `Paired McNemar on ${summary.pairs} (case, repetition) pairs: ${candidate} only ${summary.mcnemar.candidateOnly}, ${control} only ${summary.mcnemar.controlOnly}, p = ${pValue(summary.mcnemar.p)}.`,
    ...Object.entries(summary.byFamily).map(
      ([family, entry]) =>
        `${family}: ${control} ${entry.control}/${entry.pairs}, ${candidate} ${entry.candidate}/${entry.pairs}, McNemar ${entry.mcnemar.candidateOnly} vs ${entry.mcnemar.controlOnly}, p = ${pValue(entry.mcnemar.p)}.`,
    ),
    lost.length ? `Lost episodes: ${lost.join(", ")}.` : "No lost episodes.",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  },
);
