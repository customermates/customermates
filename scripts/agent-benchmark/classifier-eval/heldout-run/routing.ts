import { HELDOUT_RUNS, clusterBootstrap, groupBy, mcnemar, pct, round, writeHeldoutReport } from "./common";
import { majority, percentile, pool, readRaw, runClassifier, spendByUse, spentUsd, writeRaw } from "../shared";

import type { ClassifierModel } from "@/ee/agent-chat/classifier";
import type { AgentOnDemandToolset } from "@/ee/agent-chat/agent-toolset-routing";
import type { RoutingHeldoutItem } from "../heldout/routing-heldout";

import { ROUTING_HELDOUT } from "../heldout/routing-heldout";

import { agentToolDefinitionsForTurn } from "@/ee/agent-chat/agent-tools";
import {
  AGENT_ON_DEMAND_TOOLSETS,
  lexiconOnlyToolsets,
  toolsetsForRequest,
} from "@/ee/agent-chat/agent-toolset-routing";
import { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";
import {
  decideParallelToolsetRouting,
  latestUserRequestText,
  predictedToolsets,
  rejectedToolsets,
  TOOLSET_ROUTING_TUNED_SUMMARY,
  toolsetPreloadSpec,
} from "@/ee/agent-chat/toolset-preload";

const MODELS: ClassifierModel[] = ["jev", "gemini"];
const RAW_FILE = "heldout-routing-classifier.json";

const METHOD = {
  turns:
    "Each user turn of each item is one unit (60 items, 80 turns). Gold per turn is perTurn[t] for multi-round items and toolsets otherwise.",
  lexicon:
    "The product's loaded set: toolsetsForRequest over the current and every earlier user turn of the item (no page route, no attached contexts, no prior tool activity).",
  classifier:
    "toolsetPreloadSpec(TOOLSET_ROUTING_TUNED_SUMMARY) on latestUserRequestText of the turn, product default deadlines (Jev 800 ms, Gemini 2000 ms), 3 runs per model. 'raw' scores predictedToolsets alone; a failed call predicts nothing.",
  v2Decision:
    "decideParallelToolsetRouting as applied from round 1: loaded = the lexicon set, removable = lexiconOnlyToolsets over the item's user turns so far with nothing pinned, used = none (the offline turn has no tool activity), fits = always (the offline context is far below the envelope). A failed call leaves the lexicon set unchanged, as the product does.",
  bytes:
    "False-hit bytes are the serialized tool definitions (name, description, input schema) of each loaded set the turn does not need, for the chat surface of the shipped model.",
  missingSets:
    "Missing sets per turn (needed but not loaded) are the offline proxy for load_toolset calls the agent would have to make.",
  paired:
    "Exact-set correctness per turn: exact McNemar against the lexicon on the majority of 3 runs; the difference in exact-set rate, false-hit bytes and missing sets per turn with a 95% item-cluster paired bootstrap over all 3 runs (10,000 resamples, percentile).",
};

const definitions = agentToolDefinitionsForTurn({
  servingProvider: MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY].servingProvider,
  surface: "chat",
});
const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const TOOLSET_BYTES = Object.fromEntries(
  AGENT_ON_DEMAND_TOOLSETS.map((toolset) => [
    toolset,
    bytesOf(
      definitions
        .filter((definition) => definition.toolset === toolset)
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    ),
  ]),
) as Record<AgentOnDemandToolset, number>;

type Turn = {
  key: string;
  item: RoutingHeldoutItem;
  index: number;
  text: string;
  gold: readonly AgentOnDemandToolset[];
  lexicon: AgentOnDemandToolset[];
  removable: AgentOnDemandToolset[];
};

const TURNS: Turn[] = ROUTING_HELDOUT.flatMap((item) =>
  item.prompts.map((prompt, index) => {
    const texts = item.prompts.slice(0, index + 1);
    const loaded = new Set(texts.flatMap((text) => [...toolsetsForRequest({ text, pageRoute: null })]));
    return {
      key: `${item.id}#${index}`,
      item,
      index,
      text: prompt,
      gold: item.perTurn?.[index] ?? item.toolsets,
      lexicon: AGENT_ON_DEMAND_TOOLSETS.filter((toolset) => loaded.has(toolset)),
      removable: lexiconOnlyToolsets({ texts, pinned: [] }),
    };
  }),
);

type ClassifierRow = {
  turn: string;
  model: ClassifierModel;
  run: number;
  predicted: AgentOnDemandToolset[] | null;
  rejected: AgentOnDemandToolset[];
  ms: number;
  costMicrocents: number | null;
};

async function collect(): Promise<ClassifierRow[]> {
  const spec = toolsetPreloadSpec(TOOLSET_ROUTING_TUNED_SUMMARY);
  const stored = readRaw<Record<string, ClassifierRow>>(RAW_FILE) ?? {};
  const tasks = MODELS.flatMap((model) =>
    Array.from({ length: HELDOUT_RUNS }, (_, run) => TURNS.map((turn) => ({ model, run, turn }))).flat(),
  );
  try {
    return await pool(tasks, 4, async ({ model, run, turn }) => {
      const key = `${model}:${turn.key}:${run}`;
      if (stored[key]) return stored[key];
      const text = latestUserRequestText([{ role: "user", text: turn.text }]) ?? "";
      const call = await runClassifier(`heldout-routing:${model}`, spec, { latest_user_message: text }, model);
      const row: ClassifierRow = {
        turn: turn.key,
        model,
        run,
        predicted: predictedToolsets(call.result),
        rejected: rejectedToolsets(call.result),
        ms: call.ms,
        costMicrocents: call.result?.costMicrocents ?? null,
      };
      stored[key] = row;
      return row;
    });
  } finally {
    writeRaw(RAW_FILE, stored);
  }
}

type Prediction = { turn: Turn; run: number; loaded: readonly AgentOnDemandToolset[]; added: number; removed: number };

function v2(turn: Turn, row: ClassifierRow): Prediction {
  if (!row.predicted) return { turn, run: row.run, loaded: turn.lexicon, added: 0, removed: 0 };
  const decision = decideParallelToolsetRouting({
    loaded: turn.lexicon,
    removable: turn.removable,
    used: [],
    predicted: row.predicted,
    rejected: row.rejected,
    fits: () => true,
  });
  return {
    turn,
    run: row.run,
    loaded: decision.toolsets as AgentOnDemandToolset[],
    added: decision.added.length,
    removed: decision.removed.length,
  };
}

const exact = (p: Prediction) =>
  p.loaded.length === p.turn.gold.length && p.turn.gold.every((toolset) => p.loaded.includes(toolset));
const falseHits = (p: Prediction) => p.loaded.filter((toolset) => !p.turn.gold.includes(toolset));
const missing = (p: Prediction) => p.turn.gold.filter((toolset) => !p.loaded.includes(toolset));
const falseHitBytes = (p: Prediction) => falseHits(p).reduce((sum, toolset) => sum + TOOLSET_BYTES[toolset], 0);

function score(predictions: readonly Prediction[]) {
  const runs = new Set(predictions.map((p) => p.run)).size || 1;
  const positives = predictions.reduce((sum, p) => sum + p.turn.gold.length, 0);
  const loaded = predictions.reduce((sum, p) => sum + p.loaded.length, 0);
  const truePositives = predictions.reduce((sum, p) => sum + p.turn.gold.filter((t) => p.loaded.includes(t)).length, 0);
  const recallPerSet = Object.fromEntries(
    AGENT_ON_DEMAND_TOOLSETS.map((toolset) => {
      const needing = predictions.filter((p) => p.turn.gold.includes(toolset));
      return [
        toolset,
        needing.length ? pct(needing.filter((p) => p.loaded.includes(toolset)).length, needing.length) : null,
      ];
    }),
  );
  return {
    turns: predictions.length / runs,
    recallPct: pct(truePositives, positives),
    precisionPct: pct(truePositives, loaded),
    exactSetPct: pct(predictions.filter(exact).length, predictions.length),
    falseHitSetsPerTurn: round(predictions.reduce((sum, p) => sum + falseHits(p).length, 0) / predictions.length, 3),
    falseHitBytesPerTurn: Math.round(predictions.reduce((sum, p) => sum + falseHitBytes(p), 0) / predictions.length),
    missingSetsPerTurn: round(predictions.reduce((sum, p) => sum + missing(p).length, 0) / predictions.length, 3),
    setsAddedPerTurn: round(predictions.reduce((sum, p) => sum + p.added, 0) / predictions.length, 3),
    setsRemovedPerTurn: round(predictions.reduce((sum, p) => sum + p.removed, 0) / predictions.length, 3),
    recallPerSet,
  };
}

const GROUPS: Record<string, (turn: Turn) => boolean> = {
  all: () => true,
  "non-english": (turn) => turn.item.set === "non-english",
  "english-miss": (turn) => turn.item.set === "english-miss",
  "english-trap": (turn) => turn.item.set === "english-false-hit",
  "multi-round": (turn) => turn.item.set === "multi-round",
  ...Object.fromEntries(
    [...new Set(ROUTING_HELDOUT.map((item) => item.lang))].map((lang) => [
      `lang:${lang}`,
      (turn: Turn) => turn.item.lang === lang,
    ]),
  ),
};

function paired(control: readonly Prediction[], candidate: readonly Prediction[]) {
  const controlByTurn = new Map(control.map((p) => [p.turn.key, p]));
  const byTurn = groupBy(candidate, (p) => p.turn.key);
  const majorityPairs = Object.entries(byTurn).map(([key, runs]) => ({
    control: exact(controlByTurn.get(key)!),
    candidate: majority(runs.map(exact)),
  }));
  const units = (metric: (p: Prediction) => number) =>
    candidate.map((p) => ({
      cluster: p.turn.item.id,
      control: metric(controlByTurn.get(p.turn.key)!),
      candidate: metric(p),
    }));
  return {
    exactSetMcNemarMajority: mcnemar(majorityPairs),
    exactSetDiffPts: clusterBootstrap(
      units((p) => (exact(p) ? 1 : 0)),
      100,
    ),
    falseHitBytesPerTurnDiff: clusterBootstrap(units(falseHitBytes)),
    missingSetsPerTurnDiff: clusterBootstrap(units((p) => missing(p).length)),
  };
}

async function main() {
  const rows = await collect();
  const lexicon: Prediction[] = TURNS.map((turn) => ({ turn, run: 0, loaded: turn.lexicon, added: 0, removed: 0 }));
  const turnOf = new Map(TURNS.map((turn) => [turn.key, turn]));
  const arms: Record<string, Prediction[]> = { lexicon };
  for (const model of MODELS) {
    const modelRows = rows.filter((row) => row.model === model);
    arms[`${model}:raw`] = modelRows.map((row) => ({
      turn: turnOf.get(row.turn)!,
      run: row.run,
      loaded: row.predicted ?? [],
      added: 0,
      removed: 0,
    }));
    arms[`${model}:v2`] = modelRows.map((row) => v2(turnOf.get(row.turn)!, row));
  }
  const table: Record<string, Record<string, ReturnType<typeof score>>> = {};
  const pairedTests: Record<string, Record<string, ReturnType<typeof paired>>> = {};
  for (const [group, filter] of Object.entries(GROUPS)) {
    table[group] = {};
    pairedTests[group] = {};
    for (const [arm, predictions] of Object.entries(arms)) {
      const inGroup = predictions.filter((p) => filter(p.turn));
      table[group][arm] = score(inGroup);
      if (arm !== "lexicon") pairedTests[group][arm] = paired(lexicon.filter((p) => filter(p.turn)), inGroup);
    }
  }
  const latency = Object.fromEntries(
    MODELS.map((model) => {
      const modelRows = rows.filter((row) => row.model === model);
      const ms = modelRows.map((row) => row.ms);
      const costs = modelRows.map((row) => row.costMicrocents).filter((cost): cost is number => cost !== null);
      return [
        model,
        {
          calls: modelRows.length,
          failed: modelRows.filter((row) => row.predicted === null).length,
          msP50: round(percentile(ms, 0.5)),
          msP95: round(percentile(ms, 0.95)),
          usdPerCallMeasured: costs.length
            ? Number((costs.reduce((a, b) => a + b, 0) / costs.length / 1e8).toPrecision(3))
            : null,
        },
      ];
    }),
  );
  writeHeldoutReport("routing.json", {
    track: "routing",
    fixture: "heldout/routing-heldout.ts (60 items, 80 turns)",
    method: METHOD,
    preRegisteredOffline:
      "Descriptive only: exact-set accuracy, recall per set, false-hit sets and false-hit prompt bytes per turn for the lexicon and the classifier (3 runs each). The routing gate is judged live (held-out pass non-inferiority at -5 points, rounds or load_toolset calls fall, bytes and credits within +3%, first output p50 within +0.2 s).",
    toolsetBytes: TOOLSET_BYTES,
    table,
    pairedVsLexicon: pairedTests,
    classifierCalls: latency,
    perTurn: TURNS.map((turn) => ({
      turn: turn.key,
      set: turn.item.set,
      lang: turn.item.lang,
      text: turn.text,
      gold: turn.gold,
      lexicon: turn.lexicon,
      removable: turn.removable,
      ...Object.fromEntries(
        MODELS.map((model) => [
          model,
          rows
            .filter((row) => row.model === model && row.turn === turn.key)
            .sort((a, b) => a.run - b.run)
            .map((row) => ({
              predicted: row.predicted,
              rejected: row.rejected,
              v2: v2(turn, row).loaded,
            })),
        ]),
      ),
    })),
    spendAfterTrackUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify(table.all, null, 2));
}

await main();
