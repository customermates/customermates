import { REPORT_DIR, spendByUse, spentUsd, writeReport } from "./shared";

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Gate = { pass: boolean } & Record<string, unknown>;

const read = <T>(name: string) =>
  JSON.parse(readFileSync(join(REPORT_DIR, name), "utf8")) as T;

const firstDocs = read<{ gates: Record<string, Gate> }>("docs-rerank.json");
const docs = read<{
  gates: Record<string, Gate>;
  spendThisCampaignUsd: number;
}>("docs-rerank-en-extended.json");
const routing = read<{ gates: Record<string, Gate> }>("routing.json");
const figures = read<{ results: Record<string, Gate> }>("figure-check.json");

const docsModel = (model: string) =>
  docs.gates[`${model}:en`]!.pass && docs.gates[`${model}:de`]!.pass;

const uses = {
  docsRerank: {
    gate: "Per language on the blind bank: page-first +5 points, paired sign test p < 0.05, added p95 <= 1 s.",
    pass: { jev: docsModel("jev"), gemini: docsModel("gemini") },
    detail: docs.gates,
    firstRunDetail: firstDocs.gates,
    winner: "jev",
    note: "Re-tested with the gate unchanged after the English bank grew from 60 to 180 blind questions (docs-rerank-en-extended.json). English now clears it for both models (Jev +7.8 points, 23 wins and 9 losses, p 0.020; Gemini +7.4, p 0.016); German is unchanged from the first run, where Gemini's p95 exceeds 1 s. The 120 new questions alone do not reach significance, and the golden set loses 2 (Jev) or 4 (Gemini) of 67 English questions. Jev is about 7.5x cheaper and 2x faster at equal quality.",
  },
  routingShadow: {
    gate: "Recall above the lexicon in >= 2 languages at no more false-hit bytes; primary arms use the product toolset summaries.",
    pass: {
      jev: routing.gates["jev:product"]!.pass,
      gemini: routing.gates["gemini:product"]!.pass,
    },
    detail: routing.gates,
    winner: "gemini",
    note: "Gemini makes 5.7 false hits per run against Jev's 18 (Jev adds views to widget and analysis requests), which is not within noise. The live A/B required by the keep-or-drop rule was not run.",
  },
  figureSelfCheck: {
    gate: ">= 1 real catch and 0 false alarms on passing episodes.",
    pass: {
      jev: figures.results.jev!.pass,
      gemini: figures.results.gemini!.pass,
    },
    detail: figures.results,
    winner: "tie",
    note: "Evidence is the expected facts because stored episodes keep no tool outputs; the false alarms are legitimate intermediate figures missing from those facts.",
  },
};

const removed = {
  textChecks: {
    gate: "Per check: >= 98% agreement with gold and at least one regex error fixed.",
    pass: { jev: false, gemini: false },
    evidence: "text-checks.json",
    decision:
      "Removed on 2026-09-27 by owner decision: no check met both conditions, so the regex oracles stay; the evaluation code is deleted and its report kept.",
  },
  advisoryJudge: {
    gate: "At least one low classifier score on an oracle-failed episode that both judges scored >= 4.",
    pass: { jev: false, gemini: false },
    evidence: "advisory-judge.json",
    decision:
      "Removed on 2026-09-27 by owner decision: both models track the judges but flag none of the 9 oracle failures the judges scored high; the evaluation code is deleted and its report kept.",
  },
};

writeReport("report.json", {
  date: "2026-09-27",
  module: "ee/agent-chat/classifier",
  spendCapUsd: 5,
  spendUsd: Number(spentUsd().toFixed(4)),
  docsRetestSpendUsd: docs.spendThisCampaignUsd,
  spendNote:
    "Model cost is the gateway's measured cost per call; the ZDR fee is estimated at 0.0001 USD per request because the per-request cost omits it.",
  spendByUse: spendByUse(),
  uses,
  removed,
});
console.log(
  JSON.stringify(
    Object.fromEntries(Object.entries(uses).map(([k, v]) => [k, v.pass])),
    null,
    2,
  ),
);
