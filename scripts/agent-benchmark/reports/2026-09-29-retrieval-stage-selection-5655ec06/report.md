# Retrieval stage selection

Run on 2026-09-29 against harness commit `5655ec06`, under the rule pre-registered in `91354ca5`
(`scripts/agent-benchmark/README.md`, "Retrieval stage selection"). Local only: a temporary PostgreSQL database in the
worktree's container, the documentation indexed with `yarn docs:index`, the blind Wiki corpus seeded into a fresh
workspace and indexed with real embeddings. Real query embeddings (`google/gemini-embedding-001`) and the real Jev
re-rank through the Gateway.

## Decision

| Corpus | E-450 (shipped wait)                                                              | E-unbounded                                                | Shipped decision                               |
| ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Docs   | **FTS+J** (best FTS+E+J 86/110 against FTS+J 83/110, discordant 0 / 3, p = 0.250) | **FTS+E+J** (108/110 against FTS+J 83/110, p = 6.0e-8)     | FTS+J while the embedding wait stays at 450 ms |
| Wiki   | **FTS+E+J** (80/160; next best FTS+E 69/160, p = 9.8e-4)                          | **FTS+E+J** (136/160; next best FTS+E 94/160, p = 5.1e-12) | FTS+E+J                                        |

The docs decisions differ between the two modes. Under the shipped 450 ms wait only 36 % of docs query vectors arrived
in time from this machine, so the embedding stage added about 0.43 s at p50 without a significant hit@1 gain; with an
unbounded wait the embedding is the largest single gain (FTS+J 75.5 % to FTS+E+J 98.2 %). The shipped decision uses
E-450 unless the owner changes the embedding wait. The Wiki selects all stages in both modes.

## Method

- Primary metric: final-section hit@1, the first returned section is a gold section; for a Wiki no-match query a hit is
  an empty result list. Docs have no no-match items.
- Each distinct query was embedded once; the vector was reused across combinations and modes. E-unbounded always used
  the vector; E-450 treated a vector whose measured call took over 450 ms as unavailable (the pipeline's timeout path).
- Jev ran once per (query, candidate set) and was cached; FTS+J and FTS+E+J are separate calls whenever their candidate
  sets differ.
- Latency is modelled per call: local pipeline time (full-text, fusion, section location), plus the embedding wait
  beyond the full-text stage (capped at 450 ms under E-450), plus the measured Jev call. It is not a wall-clock trace.
- Decision: per corpus and mode, the cheapest of FTS < FTS+E < FTS+J < FTS+E+J whose hit@1 is not significantly worse
  than the best combination's (exact two-sided McNemar on paired queries, p < 0.05). "vs best" counts queries only the
  combination hit / only the best hit.
- The docs per-language tables group by the query's language (D items by their docs locale). The harness run grouped
  docs by docs locale; these tables were recomputed from the same run's per-query outcomes, and the committed harness
  now groups by query language.

## Docs results (110 labelled questions)

### E-450

| Combo   | Items | Final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match empty | Embedding used | Re-rank used |    p50 |    p95 | vs best (only combo / only best) | McNemar p |
| ------- | ----: | ------------------: | -------: | -------: | -------: | -------------: | -------------: | -----------: | -----: | -----: | -------------------------------: | --------: |
| FTS     |   110 |         26 (23.6 %) |   40.9 % |   72.7 % |    0.535 |              - |          0.0 % |        0.0 % | 0.02 s | 0.03 s |                           0 / 60 |   1.7e-18 |
| FTS+E   |   110 |         34 (30.9 %) |   50.9 % |   78.2 % |    0.625 |              - |         36.4 % |        0.0 % | 0.45 s | 0.45 s |                           1 / 53 |   6.1e-15 |
| FTS+J   |   110 |         83 (75.5 %) |   77.3 % |   79.1 % |    0.782 |              - |          0.0 % |       96.4 % | 0.34 s | 0.47 s |                            0 / 3 |     0.250 |
| FTS+E+J |   110 |         86 (78.2 %) |   79.1 % |   80.9 % |    0.800 |              - |         36.4 % |       96.4 % | 0.77 s | 0.90 s |                             best |         - |

Decision (E-450): best FTS+E+J; chosen **FTS+J**.

| Set | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| --- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| D   |    10 |    40.0 % |      50.0 % |      80.0 % |        80.0 % |       60.0 % |         80.0 % |         90.0 % |           90.0 % |
| DH  |    40 |    25.0 % |      32.5 % |      87.5 % |        87.5 % |       45.0 % |         52.5 % |         87.5 % |           87.5 % |
| DE  |    60 |    20.0 % |      26.7 % |      66.7 % |        71.7 % |       35.0 % |         45.0 % |         68.3 % |           71.7 % |

| Query language | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| en             |    25 |    20.0 % |      28.0 % |      80.0 % |        80.0 % |       40.0 % |         48.0 % |         80.0 % |           80.0 % |
| de             |    25 |    44.0 % |      48.0 % |      96.0 % |        96.0 % |       64.0 % |         76.0 % |        100.0 % |          100.0 % |
| es             |    20 |    20.0 % |      20.0 % |      60.0 % |        60.0 % |       30.0 % |         30.0 % |         60.0 % |           60.0 % |
| fr             |    20 |    15.0 % |      30.0 % |      65.0 % |        70.0 % |       25.0 % |         45.0 % |         70.0 % |           70.0 % |
| it             |    20 |    15.0 % |      25.0 % |      70.0 % |        80.0 % |       40.0 % |         50.0 % |         70.0 % |           80.0 % |

### E-unbounded

| Combo   | Items | Final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match empty | Embedding used | Re-rank used |    p50 |    p95 | vs best (only combo / only best) | McNemar p |
| ------- | ----: | ------------------: | -------: | -------: | -------: | -------------: | -------------: | -----------: | -----: | -----: | -------------------------------: | --------: |
| FTS     |   110 |         26 (23.6 %) |   40.9 % |   72.7 % |    0.535 |              - |          0.0 % |        0.0 % | 0.01 s | 0.02 s |                           0 / 82 |   4.1e-25 |
| FTS+E   |   110 |         51 (46.4 %) |   67.3 % |   99.1 % |    0.810 |              - |        100.0 % |        0.0 % | 0.85 s | 1.10 s |                           1 / 58 |   2.1e-16 |
| FTS+J   |   110 |         83 (75.5 %) |   77.3 % |   79.1 % |    0.782 |              - |          0.0 % |       96.4 % | 0.34 s | 0.46 s |                           0 / 25 |    6.0e-8 |
| FTS+E+J |   110 |        108 (98.2 %) |   99.1 % |  100.0 % |    0.995 |              - |        100.0 % |      100.0 % | 1.19 s | 1.48 s |                             best |         - |

Decision (E-unbounded): best FTS+E+J; chosen **FTS+E+J**.

| Set | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| --- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| D   |    10 |    40.0 % |      50.0 % |      80.0 % |        80.0 % |       60.0 % |         80.0 % |         90.0 % |           90.0 % |
| DH  |    40 |    25.0 % |      55.0 % |      87.5 % |       100.0 % |       45.0 % |         77.5 % |         87.5 % |          100.0 % |
| DE  |    60 |    20.0 % |      40.0 % |      66.7 % |       100.0 % |       35.0 % |         58.3 % |         68.3 % |          100.0 % |

| Query language | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| en             |    25 |    20.0 % |      44.0 % |      80.0 % |        96.0 % |       40.0 % |         72.0 % |         80.0 % |           96.0 % |
| de             |    25 |    44.0 % |      56.0 % |      96.0 % |        96.0 % |       64.0 % |         80.0 % |        100.0 % |          100.0 % |
| es             |    20 |    20.0 % |      45.0 % |      60.0 % |       100.0 % |       30.0 % |         55.0 % |         60.0 % |          100.0 % |
| fr             |    20 |    15.0 % |      45.0 % |      65.0 % |       100.0 % |       25.0 % |         60.0 % |         70.0 % |          100.0 % |
| it             |    20 |    15.0 % |      40.0 % |      70.0 % |       100.0 % |       40.0 % |         65.0 % |         70.0 % |          100.0 % |

## Wiki results (blind benchmark, 160 queries)

### E-450

| Combo   | Items | Final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match empty | Embedding used | Re-rank used |    p50 |    p95 | vs best (only combo / only best) | McNemar p |
| ------- | ----: | ------------------: | -------: | -------: | -------: | -------------: | -------------: | -----------: | -----: | -----: | -------------------------------: | --------: |
| FTS     |   160 |         61 (38.1 %) |   44.7 % |   62.0 % |    0.505 |          0.0 % |          0.0 % |        0.0 % | 0.04 s | 0.06 s |                           0 / 19 |    3.8e-6 |
| FTS+E   |   160 |         69 (43.1 %) |   49.3 % |   66.0 % |    0.553 |          0.0 % |         24.4 % |        0.0 % | 0.47 s | 0.47 s |                           0 / 11 |    9.8e-4 |
| FTS+J   |   160 |         66 (41.3 %) |   63.3 % |   69.3 % |    0.663 |          0.0 % |          0.0 % |       95.6 % | 0.33 s | 0.44 s |                           0 / 14 |    1.2e-4 |
| FTS+E+J |   160 |         80 (50.0 %) |   69.3 % |   72.7 % |    0.710 |          0.0 % |         24.4 % |       95.6 % | 0.77 s | 0.88 s |                             best |         - |

Decision (E-450): best FTS+E+J; chosen **FTS+E+J**.

| Category       | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| lexical        |    40 |   100.0 % |     100.0 % |     100.0 % |       100.0 % |      100.0 % |        100.0 % |        100.0 % |          100.0 % |
| paraphrase     |    45 |     0.0 % |      15.6 % |       4.4 % |        31.1 % |        6.7 % |         20.0 % |         44.4 % |           62.2 % |
| cross-language |    40 |    15.0 % |      15.0 % |      17.5 % |        20.0 % |       17.5 % |         17.5 % |         40.0 % |           40.0 % |
| typo           |    15 |    93.3 % |      93.3 % |      93.3 % |        93.3 % |      100.0 % |        100.0 % |        100.0 % |          100.0 % |
| multi-hop      |    10 |    10.0 % |      20.0 % |      30.0 % |        40.0 % |       20.0 % |         30.0 % |         40.0 % |           50.0 % |
| no-match       |    10 |     0.0 % |       0.0 % |       0.0 % |         0.0 % |            - |              - |              - |                - |

| Language | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| de       |    71 |    46.5 % |      54.9 % |      50.7 % |        64.8 % |       53.6 % |         60.9 % |         71.0 % |           81.2 % |
| en       |    51 |    43.1 % |      47.1 % |      45.1 % |        52.9 % |       46.9 % |         51.0 % |         63.3 % |           67.3 % |
| es       |    13 |     7.7 % |       7.7 % |      15.4 % |        15.4 % |        9.1 % |          9.1 % |         54.5 % |           54.5 % |
| fr       |    12 |    25.0 % |      25.0 % |      25.0 % |        25.0 % |       30.0 % |         30.0 % |         50.0 % |           50.0 % |
| it       |    13 |    15.4 % |      15.4 % |      15.4 % |        15.4 % |       27.3 % |         27.3 % |         36.4 % |           36.4 % |

### E-unbounded

| Combo   | Items | Final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match empty | Embedding used | Re-rank used |    p50 |    p95 | vs best (only combo / only best) | McNemar p |
| ------- | ----: | ------------------: | -------: | -------: | -------: | -------------: | -------------: | -----------: | -----: | -----: | -------------------------------: | --------: |
| FTS     |   160 |         61 (38.1 %) |   44.7 % |   62.0 % |    0.505 |          0.0 % |          0.0 % |        0.0 % | 0.03 s | 0.04 s |                           1 / 76 |   1.0e-21 |
| FTS+E   |   160 |         94 (58.8 %) |   62.7 % |   82.7 % |    0.704 |          0.0 % |        100.0 % |        0.0 % | 0.88 s | 1.02 s |                           1 / 43 |   5.1e-12 |
| FTS+J   |   160 |         66 (41.3 %) |   63.3 % |   69.3 % |    0.663 |          0.0 % |          0.0 % |       95.6 % | 0.33 s | 0.44 s |                           1 / 71 |   3.1e-20 |
| FTS+E+J |   160 |        136 (85.0 %) |   90.7 % |   92.0 % |    0.912 |          0.0 % |        100.0 % |      100.0 % | 1.19 s | 1.39 s |                             best |         - |

Decision (E-unbounded): best FTS+E+J; chosen **FTS+E+J**.

| Category       | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| lexical        |    40 |   100.0 % |     100.0 % |     100.0 % |        97.5 % |      100.0 % |        100.0 % |        100.0 % |           97.5 % |
| paraphrase     |    45 |     0.0 % |      37.8 % |       4.4 % |        95.6 % |        6.7 % |         37.8 % |         44.4 % |           95.6 % |
| cross-language |    40 |    15.0 % |      45.0 % |      17.5 % |        80.0 % |       17.5 % |         45.0 % |         40.0 % |           80.0 % |
| typo           |    15 |    93.3 % |     100.0 % |      93.3 % |       100.0 % |      100.0 % |        100.0 % |        100.0 % |          100.0 % |
| multi-hop      |    10 |    10.0 % |      40.0 % |      30.0 % |        70.0 % |       20.0 % |         40.0 % |         40.0 % |           70.0 % |
| no-match       |    10 |     0.0 % |       0.0 % |       0.0 % |         0.0 % |            - |              - |              - |                - |

| Language | Items | FTS hit@1 | FTS+E hit@1 | FTS+J hit@1 | FTS+E+J hit@1 | FTS page R@1 | FTS+E page R@1 | FTS+J page R@1 | FTS+E+J page R@1 |
| -------- | ----: | --------: | ----------: | ----------: | ------------: | -----------: | -------------: | -------------: | ---------------: |
| de       |    71 |    46.5 % |      66.2 % |      50.7 % |        88.7 % |       53.6 % |         68.1 % |         71.0 % |           91.3 % |
| en       |    51 |    43.1 % |      56.9 % |      45.1 % |        84.3 % |       46.9 % |         59.2 % |         63.3 % |           87.8 % |
| es       |    13 |     7.7 % |      46.2 % |      15.4 % |        76.9 % |        9.1 % |         54.5 % |         54.5 % |           90.9 % |
| fr       |    12 |    25.0 % |      50.0 % |      25.0 % |        75.0 % |       30.0 % |         60.0 % |         50.0 % |           90.0 % |
| it       |    13 |    15.4 % |      46.2 % |      15.4 % |        84.6 % |       27.3 % |         54.5 % |         36.4 % |          100.0 % |

## Query embedding latency (this machine)

| Corpus | Queries |    p50 |     p95 |     Max | Within 450 ms | Failed |
| ------ | ------: | -----: | ------: | ------: | ------------: | -----: |
| Docs   |     110 | 845 ms | 1094 ms | 1365 ms |   40 (36.4 %) |      0 |
| Wiki   |     160 | 873 ms | 1017 ms | 1223 ms |   39 (24.4 %) |      0 |
| Both   |     270 | 860 ms | 1028 ms | 1365 ms |   79 (29.3 %) |      0 |

One call per distinct query after three warm-up calls, run sequentially from a local machine. The share arriving within
450 ms decides every E-450 result above, so the E-450 decision depends on where the caller runs.

## Spend

Real Gateway spend by usage delta (`/v1/credits` `total_used`): **0.2453 USD** in total.

| Step                                                             | Gateway delta | Harness-metered |
| ---------------------------------------------------------------- | ------------: | --------------: |
| `yarn docs:index` (932 of 1036 chunks embedded)                  |    0.0593 USD |               - |
| Docs run (113 query embeddings, 216 Jev calls)                   |    0.0656 USD |      0.0500 USD |
| Wiki run (40 pages indexed, 163 query embeddings, 313 Jev calls) |    0.1203 USD |      0.0162 USD |

The key is shared, so the delta is an upper bound; the Wiki run's delta exceeds its metered cost by about 0.10 USD,
which this run cannot attribute.

## Anomalies and caveats

- **No-match never passes.** Every Wiki no-match query returned results in every combination, including FTS alone: the
  full-text stage finds some page for each of them (for example "how do i book a meeting room" returns the international
  onboarding page), so no relevance floor rejects anything. Stage selection does not address this.
- **Wiki re-rank without embedding picks pages, not sections.** FTS+J reaches 63.3 % page R@1 but only 41.3 % hit@1:
  the Wiki re-rank chooses among one pre-located section per page, and without the embedding's section offsets the
  full-text section choice stands. Paraphrase queries show it most (page R@1 44.4 %, hit@1 4.4 %).
- **One lexical regression.** Under E-unbounded, FTS+E+J missed one lexical Wiki query that every other combination hit
  (97.5 % against 100 %).
- **Re-rank coverage.** Without the embedding, 4 docs and 7 Wiki queries had fewer than two candidates, so the re-rank
  did not run for them (96.4 % and 95.6 % re-rank used).
- These are offline retrieval metrics on labelled sections, not live answer quality; the earlier live pass rates in
  `reports/2026-09-28-retrieval-ab-63a7186a/report.md` measure a different outcome.
