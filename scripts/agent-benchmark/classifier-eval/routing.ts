import {
  RUNS,
  percentile,
  pool,
  readRaw,
  runClassifier,
  spendByUse,
  spentUsd,
  writeRaw,
  writeReport,
} from "./shared";

import type { ClassifierModel } from "@/ee/agent-chat/classifier";
import type { AgentOnDemandToolset } from "@/ee/agent-chat/agent-toolset-routing";
import type { RoutingItem, RoutingLanguage } from "./fixtures/routing-items";

import { ROUTING_ITEMS } from "./fixtures/routing-items";

import { agentToolDefinitionsForTurn } from "@/ee/agent-chat/agent-tools";
import {
  AGENT_ON_DEMAND_TOOLSETS,
  AGENT_TOOLSET_SUMMARY,
  toolsetsForRequest,
} from "@/ee/agent-chat/agent-toolset-routing";
import {
  predictedToolsets,
  toolsetPreloadSpec,
} from "@/ee/agent-chat/toolset-preload";
import {
  MODEL_CATALOG,
  SHIPPED_AGENT_MODEL_KEY,
} from "@/ee/agent-chat/model-catalog";

const LANGUAGES: RoutingLanguage[] = [
  ...new Set(ROUTING_ITEMS.map((item) => item.lang)),
];
const MODELS: ClassifierModel[] = ["jev", "gemini"];

const PROBE_TUNED_SUMMARY: Record<AgentOnDemandToolset, string> = {
  ...AGENT_TOOLSET_SUMMARY,
  views:
    "opening, creating or changing saved views, or changing how the current table is filtered, sorted, grouped or laid out; not computing or comparing figures",
  routines:
    "routines: the user wants something to happen automatically later, on a schedule or whenever an event occurs inside the CRM",
  webhooks:
    "webhooks: sending event notifications to an external URL, and their deliveries",
  messaging:
    "reading, drafting or sending email, chat or WhatsApp messages, the inbox, the calendar and connected messaging accounts; not a summary the CRM sends by itself",
  admin:
    "inviting or managing team members, renaming terminology, changing workspace settings or the user's own profile; not questions about how the product works",
};

const WORDINGS = {
  product: AGENT_TOOLSET_SUMMARY,
  probeTuned: PROBE_TUNED_SUMMARY,
} as const;
type Wording = keyof typeof WORDINGS;

const routingSpec = toolsetPreloadSpec;

const definitions = agentToolDefinitionsForTurn({
  servingProvider: MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY].servingProvider,
  surface: "chat",
});
const bytesOf = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const TOOLSET_BYTES = Object.fromEntries(
  AGENT_ON_DEMAND_TOOLSETS.map((toolset) => [
    toolset,
    bytesOf(
      definitions
        .filter((d) => d.toolset === toolset)
        .map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
    ),
  ]),
) as Record<AgentOnDemandToolset, number>;

type Prediction = {
  id: string;
  run: number;
  predicted: AgentOnDemandToolset[] | null;
  ms: number;
};

function score(
  items: readonly RoutingItem[],
  predictions: readonly Prediction[],
) {
  let positives = 0;
  let truePositives = 0;
  let falseHits = 0;
  let falseHitBytes = 0;
  let exact = 0;
  let failed = 0;
  let counted = 0;
  for (const p of predictions) {
    const item = items.find((i) => i.id === p.id);
    if (!item) continue;
    counted += 1;
    const predicted = p.predicted ?? [];
    if (!p.predicted) failed += 1;
    positives += item.toolsets.length;
    truePositives += item.toolsets.filter((t) => predicted.includes(t)).length;
    const extra = predicted.filter((t) => !item.toolsets.includes(t));
    falseHits += extra.length;
    falseHitBytes += extra.reduce((sum, t) => sum + TOOLSET_BYTES[t], 0);
    if (extra.length === 0 && item.toolsets.every((t) => predicted.includes(t)))
      exact += 1;
  }
  const runs = new Set(predictions.map((p) => p.run)).size || 1;
  return {
    positives: positives / runs,
    recallPct: positives
      ? Number(((100 * truePositives) / positives).toFixed(1))
      : null,
    falseHitsPerRun: Number((falseHits / runs).toFixed(2)),
    falseHitBytesPerRun: Math.round(falseHitBytes / runs),
    exactSetPct: Number(((100 * exact) / counted).toFixed(1)),
    failedCalls: failed,
  };
}

async function main() {
  const lexicon: Prediction[] = ROUTING_ITEMS.map((item) => ({
    id: item.id,
    run: 0,
    predicted: [...toolsetsForRequest({ text: item.text, pageRoute: null })],
    ms: 0,
  }));
  const cached = process.env.FRESH
    ? null
    : readRaw<{ arms: Record<string, Prediction[]> }>("routing-arms.json");
  const arms: Record<string, Prediction[]> = cached?.arms ?? {};
  for (const wording of Object.keys(WORDINGS) as Wording[])
    for (const model of MODELS) {
      if (arms[`${model}:${wording}`]) continue;
      const spec = routingSpec(WORDINGS[wording]);
      const tasks = Array.from({ length: RUNS }, (_, run) =>
        ROUTING_ITEMS.map((item) => ({ item, run })),
      ).flat();
      arms[`${model}:${wording}`] = await pool(
        tasks,
        4,
        async ({ item, run }) => {
          const call = await runClassifier(
            `routing:${model}`,
            spec,
            { latest_user_message: item.text },
            model,
          );
          const predicted = predictedToolsets(call.result);
          return { id: item.id, run, predicted, ms: call.ms };
        },
      );
      console.log(model, wording, "done, spend", spentUsd().toFixed(4));
    }
  writeRaw("routing-arms.json", { lexicon, arms });

  const table: Record<string, Record<string, ReturnType<typeof score>>> = {};
  for (const lang of [...LANGUAGES, "all"] as const) {
    const items = ROUTING_ITEMS.filter(
      (i) => lang === "all" || i.lang === lang,
    );
    table[lang] = { lexicon: score(items, lexicon) };
    for (const [name, predictions] of Object.entries(arms))
      table[lang][name] = score(items, predictions);
  }
  const gates: Record<string, unknown> = {};
  for (const name of Object.keys(arms)) {
    const betterLanguages = LANGUAGES.filter(
      (lang) =>
        (table[lang][name]!.recallPct ?? 0) >
        (table[lang].lexicon!.recallPct ?? 0),
    );
    const bytes = table.all[name]!.falseHitBytesPerRun;
    const lexiconBytes = table.all.lexicon!.falseHitBytesPerRun;
    gates[name] = {
      betterLanguages,
      falseHitBytesPerRun: bytes,
      lexiconFalseHitBytesPerRun: lexiconBytes,
      pass: betterLanguages.length >= 2 && bytes <= lexiconBytes,
    };
  }
  const latency = Object.fromEntries(
    Object.entries(arms).map(([name, predictions]) => [
      name,
      {
        p50: Math.round(
          percentile(
            predictions.map((p) => p.ms),
            0.5,
          ) ?? 0,
        ),
        p95: Math.round(
          percentile(
            predictions.map((p) => p.ms),
            0.95,
          ) ?? 0,
        ),
      },
    ]),
  );
  const perItem = ROUTING_ITEMS.map((item) => ({
    id: item.id,
    lang: item.lang,
    gold: item.toolsets,
    lexicon: lexicon.find((p) => p.id === item.id)!.predicted,
    ...Object.fromEntries(
      Object.entries(arms).map(([name, predictions]) => [
        name,
        predictions.filter((p) => p.id === item.id).map((p) => p.predicted),
      ]),
    ),
  }));
  writeReport("routing.json", {
    rule: "Primary arms use the product toolset summaries (not tuned on these items). Keep only if recall beats the lexicon in >= 2 languages and false-hit bytes per run do not exceed the lexicon's. probeTuned arms use wording tuned on the 40 multilingual items and are optimistic.",
    toolsetBytes: TOOLSET_BYTES,
    table,
    gates,
    latencyMs: latency,
    perItem,
    spendSoFarUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify(gates, null, 2));
}

await main();
