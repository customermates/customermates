import { HELDOUT_REPORT_DIR, writeHeldoutReport } from "./common";
import { spendByUse, spentUsd } from "../shared";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Json = Record<string, any>;

const read = (name: string) => JSON.parse(readFileSync(join(HELDOUT_REPORT_DIR, name), "utf8")) as Json;

const guard = read("guard.json");
const routing = read("routing.json");
const docs = read("docs.json");

const commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();

const guardSummary = Object.fromEntries(
  (["a", "b", "c"] as const).map((arm) => {
    const all = guard.perArm[arm].all;
    return [
      arm,
      {
        mode: guard.arms[arm],
        missedDangerous: `${all.missed}/${all.dangerous}`,
        missedExcludingExactPrefix: `${all.missedExcludingExactPrefix}/${all.dangerousExcludingExactPrefix}`,
        falseBlocks: `${all.falseBlocks}/${all.allow}`,
        falseBlockMcNemarVsA: arm === "a" ? null : guard.falseBlockMcNemarVsA[arm],
        offlineGate: guard.verdicts[arm].offlinePass ? "pass" : "fail",
      },
    ];
  }),
);

const routingSummary = Object.fromEntries(
  ["lexicon", "jev:raw", "jev:v2", "gemini:raw", "gemini:v2"].map((arm) => {
    const all = routing.table.all[arm];
    const paired = routing.pairedVsLexicon.all[arm];
    return [
      arm,
      {
        recallPct: all.recallPct,
        precisionPct: all.precisionPct,
        exactSetPct: all.exactSetPct,
        falseHitBytesPerTurn: all.falseHitBytesPerTurn,
        missingSetsPerTurn: all.missingSetsPerTurn,
        setsAddedPerTurn: all.setsAddedPerTurn,
        setsRemovedPerTurn: all.setsRemovedPerTurn,
        ...(paired
          ? {
              exactSetMcNemar: paired.exactSetMcNemarMajority,
              exactSetDiffPts: paired.exactSetDiffPts,
              falseHitBytesDiff: paired.falseHitBytesPerTurnDiff,
              missingSetsDiff: paired.missingSetsPerTurnDiff,
            }
          : {}),
      },
    ];
  }),
);

const docsPooled = docs.table.pooled;
const docsSummary = {
  keyword: docsPooled.keyword,
  ...Object.fromEntries(
    ["jev", "gemini"].map((model) => [
      model,
      Object.fromEntries(
        ["pageFirst", "sectionFirst", "sectionFirstStrict", "answer"]
          .map((metric) => [
            metric,
            {
              meanPct: docsPooled[model][metric].meanPct,
              winsLosses: `${docsPooled[model][metric].majorityWins}/${docsPooled[model][metric].majorityLosses}`,
              signTestP: docsPooled[model][metric].signTestP,
              holmP: docs.pooledSignTestHolm[metric][model],
              diffPts: docsPooled[model][metric].diffPtsVsKeyword,
            },
          ])
          .concat([
            ["addedMsP50", docsPooled[model].addedMsP50],
            ["addedMsP95", docsPooled[model].addedMsP95],
            ["failedOrTimedOut", `${docsPooled[model].failedOrTimedOut}/${docsPooled[model].calls}`],
            ["usdPerQueryMeasured", docsPooled[model].usdPerQueryMeasured],
          ]),
      ),
    ]),
  ),
};

writeHeldoutReport("report.json", {
  date: "2026-09-27",
  stage: "Fair classifier retest, stage 3: rules and classifiers scored on the frozen held-out sets",
  preRegistration: "scripts/agent-benchmark/classifier-eval/heldout/PREREGISTRATION.md (with Amendment 1)",
  harness: "scripts/agent-benchmark/classifier-eval/heldout-run/ (committed before any run)",
  scoredCommit: commit,
  freeze: "heldout-freeze.test.ts passes; fixtures, gates, thresholds and methods unchanged; nothing tuned.",
  runs: 3,
  spendCapUsd: 8,
  spendUsd: Number(spentUsd().toFixed(4)),
  spendNote:
    "Model cost is the gateway's measured cost per answered call; the ZDR fee is estimated at 0.0001 USD per request; timed-out calls are not charged in the ledger.",
  spendByUse: spendByUse(),
  tracks: {
    guard: {
      file: "guard.json",
      preRegisteredOfflineGate: guard.gate,
      summary: guardSummary,
      verdict:
        "Fail for every arm, the shipped word lists included: 58 of 67 dangerous mentions (58 of 59 without the exact-prefix ones) would be written unguarded in every arm. The guard only arms on a candidate name nested in another candidate and written in the message, so it catches the 8 exact-prefix mentions and 1 negated mention, and never the short names (23), identical names (12), negations (16 of 17) or ambiguous clarification replies (7). False blocks are 4 of 112 in every arm (1 exact-prefix allow, 3 rule mentions), McNemar p = 1 for (b) and (c) against (a); the classifier in (c) never reached 0.8 (42 calls, 4 timeouts at 800 ms, highest 0.67), so (c) equals (b), and (b) equals (a) on this set.",
      liveStageWarranted:
        "No. Live Gate C runs only arms that passed the offline gate, and none did. The held-out set shows that the missing protection is in the structural core shared by all three arms, not in the word lists or the bulk classifier.",
    },
    routing: {
      file: "routing.json",
      preRegisteredOffline: routing.preRegisteredOffline,
      summary: routingSummary,
      verdict:
        "No offline gate is pre-registered; descriptive. The lexicon recalls 43.6% of needed sets (80 turns); the simulated v2 decision recalls 95.8% (Jev) and 97.6% (Gemini), exact-set accuracy rises 28 and 32 points (McNemar p < 0.001, bootstrap intervals above 0), and missing sets per turn, the proxy for load_toolset calls, fall by 0.36 and 0.37 (intervals below 0). False-hit bytes do not fall: Jev v2 -485 bytes per turn (95% CI -3,339 to +2,184), Gemini v2 +254 (+24 to +529). Gemini returns no probabilities, so its v2 decision never removes a set and keeps 11 of 12 English trap turns' false hits; Jev removes 0.67 sets per trap turn. The raw classifiers are more precise than the v2 decision because v2 keeps the lexicon's sets unless they are rejected at 0.1 or less.",
      liveStageWarranted:
        "Yes for the Jev arm: the offline evidence supports testing held-out pass non-inferiority and fewer load_toolset calls live; prompt bytes must be watched against the +3% limit. The Gemini arm adds bytes offline and cannot remove sets.",
    },
    docs: {
      file: "docs.json",
      preRegisteredOffline: docs.preRegisteredOffline,
      agentQueryRule: docs.method.agentQuery,
      summary: docsSummary,
      verdict:
        "No offline gate is pre-registered; descriptive with the exact sign test. Pooled over 40 questions, v2 has no losses against the keyword ranker on any metric: Jev page-first 60 -> 80% (8 wins, 0 losses, p 0.0078, Holm 0.016), section-first 37.5 -> 77.5% (16/0), judged answer in the first returned section 37.5 -> 72.5% (14/0, p 0.00012); Gemini is similar (answer 67.5%) but slower (p95 801 ms, 6 of 105 calls timed out at 800 ms) and 5x dearer. Per language only English reaches p < 0.05 (section-first 7/0, answer 6/0 with Jev); German is at ceiling on page-first; Spanish and Italian gain little because their untranslated agent queries often yield fewer than 2 English candidates, so no re-rank happens.",
      liveStageWarranted:
        "Yes for Jev: consistent gains with no losses, added p95 491 ms; the live gate (30 DH cases x k = 10, paired p < 0.05, credits within +3%, first output p95 within +0.5 s) decides.",
    },
  },
  caveats: [
    "Offline guard scoring models the proposed writes as pre-registered and the agent's reads as every family candidate; the live agent may ask before writing, which the offline count does not credit.",
    "Routing assumes no tool activity in earlier turns and a context that always fits; the v2 decision is simulated with the product function, not run in a live turn.",
    "Docs uses a deterministic agent query in the user's language; a live agent may translate or rephrase, which would help the keyword ranker for es, fr and it.",
  ],
});
console.log("report written");
