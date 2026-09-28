# Unified retrieval A/B: legacy split against the unified pipeline

Source `63a7186a` (clean; product code equals `67674231` plus the MDX fix `63a7186a` that the production build needed), one
production build, two servers from that build: `retrieval-legacy` (`AGENT_BENCHMARK_RETRIEVAL=legacy`) and
`retrieval-unified` (variable unset), run one after the other. Campaign `af15ccc7`, cap 8 USD, shipped arm only.
Docs embedded with `yarn docs:index` (`google/gemini-embedding-001`, 1,027 chunks). Gateway key taken from the process
environment in every process (the `.env` placeholder never won; checked with a free authenticated credits call before
the first paid call and by the first episode's trace: Jev answered, embeddings measured).

Spend 3.22 USD (Gateway usage delta): episodes 2.89 (legacy 1.40, unified 1.49), gold-fact judge 0.14, retrieval-only
eval 0.10 (two docs passes, Wiki debugging and the final run at 0.05), docs indexing 0.035.

## Gate: unified ships

| Gate | Legacy | Unified | Result |
| --- | ---: | ---: | --- |
| (a) Docs live pass >= 93 % and not significantly worse | 92.5 % | 94.2 % | pass; McNemar 4 vs 2, p = 0.69 |
| (b) `search_docs` p95 <= legacy p95 + 0.5 s | 0.59 s | 0.98 s | pass (+0.39 s) |
| (c) Wiki R@1 / final-section hit not significantly worse | 100 % / 100 % | 97.1 % / 100 % | pass; R@1 McNemar 0 vs 2, p = 0.50 |

The known typo regression stands. With embeddings and Jev, unified passes 6 of 8 typo queries against legacy's 8 of 8.
Without credits or self-hosted (full text only), unified passes 2 of 8 against legacy keyword's 7 of 8.

## Live A/B (DH01-DH30 and DE01-DE30, 60 cases x 2 repetitions, 120 pairs per arm)

The registry holds 60 live docs cases (30 DH, 30 DE), not 100. The 100 DH and DE questions exist only as retrieval
labels, so both repetitions ran on the 60 live cases. An episode passes when the deterministic oracle passes and the
gold-fact judge (`google/gemini-3-flash`, the unchanged stage-4 prompt, arm-blind) answers yes.

| Measure | retrieval-legacy | retrieval-unified |
| --- | ---: | ---: |
| Pass | 92.5 % (111/120) [86.4, 96.0] | 94.2 % (113/120) [88.4, 97.1] |
| DH / DE pass | 53/60 / 58/60 | 56/60 / 57/60 |
| Gold-fact verdicts (yes / partial / no) | 112 / 4 / 4 | 115 / 4 / 1 |
| Oracle pass | 118/120 | 118/120 |
| Credits per turn | 1.169 | 1.239 (+6.0 %) |
| USD per turn | 0.0117 | 0.0124 |
| `search_docs` calls | 109 | 125 |
| `search_docs` p50 / p95 | 0.42 s / 0.59 s | 0.85 s / 0.98 s |
| All docs retrieval calls p50 / p95 | 0.39 s / 0.52 s | 0.82 s / 0.95 s |
| First output p50 / p95 | 1.61 s / 2.28 s | 1.68 s / 2.30 s |
| Docs calls with query embedding used / timed out | - | 22.6 % / 77.4 % |
| Docs calls re-ranked by Jev | 100 % | 99.1 % |

Paired McNemar on pass: unified only 4, legacy only 2, p = 0.69. DH 3 vs 0 (p = 0.25), DE 1 vs 2 (p = 1.00). The two
oracle failures per arm are both `DH14` (the model attempts the declined rename). No episode was lost.

## Retrieval only (real query embedding, real Jev, no agent turns)

`retrieval-eval.ts`, one wall-clock measurement per call including embedding and re-rank, pipelines alternated per
question. Final section is the first result after the re-rank.

| Docs set | Pipeline | Page R@1 | Page R@5 | MRR | Final-section hit | p50 | p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| D (10) | legacy | 100.0 % | 100.0 % | 1.000 | 80.0 % | 0.45 s | 0.54 s |
| D (10) | unified | 90.0 % | 100.0 % | 0.950 | 80.0 % | 0.83 s | 1.17 s |
| DH (40) | legacy | 85.0 % | 85.0 % | 0.850 | 82.5 % | 0.41 s | 0.48 s |
| DH (40) | unified | 87.5 % | 87.5 % | 0.875 | 87.5 % | 0.80 s | 0.90 s |
| DE (60) | legacy | 71.7 % | 76.7 % | 0.742 | 66.7 % | 0.40 s | 0.51 s |
| DE (60) | unified | 78.3 % | 80.0 % | 0.792 | 76.7 % | 0.79 s | 0.84 s |
| all (110) | legacy | 79.1 % | 81.8 % | 0.805 | 73.6 % | 0.41 s | 0.52 s |
| all (110) | unified | 82.7 % | 84.5 % | 0.836 | 80.9 % | 0.80 s | 0.90 s |
| all (110) | legacy keyword, no Jev | 50.0 % | 76.4 % | 0.595 | 27.3 % | 0.04 s | 0.05 s |
| all (110) | unified full text, no Jev | 40.9 % | 72.7 % | 0.537 | 23.6 % | 0.02 s | 0.03 s |

Final-section hit McNemar (unified only / legacy only): D 0 / 0, DH 3 / 1 (p = 0.63), DE 10 / 4 (p = 0.18), all 13 / 5
(p = 0.10). Page R@1: all 10 / 6 (p = 0.45). The unified query embedding arrived inside its 450 ms wait for 22.7 % of
the docs questions, and Jev answered all 265 calls.

| Wiki (70 labelled + 5 no-match) | R@1 | R@5 | MRR | Final-section hit (29) | No-match empty | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| legacy (hybrid embedding, no Jev) | 100.0 % | 100.0 % | 1.000 | 100.0 % | 0 / 5 | 0.42 s | 0.92 s |
| unified (embedding + Jev) | 97.1 % | 97.1 % | 0.971 | 100.0 % | 3 / 5 | 0.68 s | 0.88 s |
| legacy keyword only | 98.6 % | 98.6 % | 0.986 | 100.0 % | 5 / 5 | 0.01 s | 0.02 s |
| unified full text only | 92.9 % | 94.3 % | 0.933 | 96.6 % | 4 / 5 | 0.01 s | 0.04 s |

Every category is at 100 % in all four configurations except typo (legacy 8/8, unified 6/8, legacy keyword 7/8, unified
full text 2/8) and no-match. Wiki McNemar: R@1 0 vs 2 (p = 0.50), final-section hit 0 vs 0.

## Caveats and anomalies

- The query embedding misses its 450 ms wait on 77 % of live docs calls and 55 % of Wiki queries from this machine, so
  locally the unified arm is mostly full text plus Jev. Its latency is dominated by that wait plus Jev. Hosted latency to
  the Gateway may differ.
- `integrity:correctRoute` failed on 113 of 120 unified episodes because the query-embedding charge is a usage event under
  the embedding model. Turn and round routing was correct (checked in `AgentRunRound`); the analysis recomputed the check
  with embedding usage excluded.
- `WikiPageRepo.claimStaleSemanticPages` returned more pages than its limit, so a workspace backfill stopped early.
- The arms ran one after the other on the same build, not interleaved, so provider-load drift is part of the latency
  difference. First output is unchanged.
- Credits per turn rose by 6 %, which the gate does not cover. The unified arm issued 15 % more `search_docs` calls and
  adds the query-embedding charge.
