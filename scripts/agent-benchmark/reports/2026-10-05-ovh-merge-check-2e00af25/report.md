# Agent benchmark report 2e00af25-f313-4176-af75-63c32212d0b3

Generated 2026-10-05T01:54:58.958Z. Total spend $3.6892. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 05567f93c8a028536d92f2d4faa5633b50084f02.

## Suite coverage

74 episodes across 74 distinct cases and 81 actual user turns (0 skipped).
68 episodes across 68 cases and 74 turns feed comparative quality metrics; 20 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 74 cases and 81 user turns at source 05567f93c8a028536d92f2d4faa5633b50084f02.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 68 | 20/20 | 94.1 % | n/a | n/a | 0/55 | n/a | $0.0510 | $0.0469 | 4.7 | $0.0542 | 100.0 % | 0.0 % | 0.0 % | 3.3 | 6.0 s | 29.7 s | 14.5 s | 45.8 s | 17.8 s | 69.0 s | 0.0 % | 0.0 % | C25 C32 C36 N23 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| merge/shipped | $0.0000 | 0.1 % | 0.26 | 0.14 |

## Retrieval latency

| Arm | Corpus | Calls | Total p50 | Total p95 | Full-text p95 | Embedding p95 | Re-rank p95 | Embedding used | Embedding timeout | Re-rank used | Wiki re-rank calls/turn |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| merge/shipped | docs | 10 | 1.7 s | 2.7 s | 0.2 s | 2.3 s | 1.7 s | 90.0 % | 10.0 % | 100.0 % | 0.00 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | merge/shipped |
| --- | ---: |
| A1 | 1/1 |
| A2 | 1/1 |
| A3 | 1/1 |
| A4 | 1/1 |
| B1 | 1/1 |
| B2 | 1/1 |
| B3 | 1/1 |
| B4 | 1/1 |
| B5 | 1/1 |
| C25 | 0/1 |
| C26 | 1/1 |
| C27 | 1/1 |
| C28 | 1/1 |
| C29 | 1/1 |
| C30 | 1/1 |
| C31 | 1/1 |
| C32 | 0/1 |
| C33 | 1/1 |
| C34 | 1/1 |
| C35 | 1/1 |
| C36 | 0/1 |
| D1 | 1/1 |
| D10 | 1/1 |
| D2 | 1/1 |
| D3 | 1/1 |
| D4 | 1/1 |
| D5 | 1/1 |
| D6 | 1/1 |
| D7 | 1/1 |
| D8 | 1/1 |
| D9 | 1/1 |
| H10 | 1/1 |
| H11 | 1/1 |
| H12 | 1/1 |
| H9 | 1/1 |
| M5 | 1/1 |
| M6 | 1/1 |
| M7 | 1/1 |
| M8 | 1/1 |
| N13 | 1/1 |
| N14 | 1/1 |
| N15 | 1/1 |
| N16 | 1/1 |
| N17 | 1/1 |
| N18 | 1/1 |
| N19 | 1/1 |
| N20 | 1/1 |
| N21 | 1/1 |
| N22 | 1/1 |
| N23 | 0/1 |
| N24 | 1/1 |
| R43 | 1/1 |
| R47 | 1/1 |
| R48 | 1/1 |
| R49 | 1/1 |
| R50 | 1/1 |
| R51 | 1/1 |
| R52 | 1/1 |
| R53 | 1/1 |
| S1 | 1/1 |
| S2 | 1/1 |
| S3 | 1/1 |
| S4 | 1/1 |
| U44 | 1/1 |
| U45 | 1/1 |
| U46 | 1/1 |
| V37 | 1/1 |
| V38 | 1/1 |
| V39 | 1/1 |
| V40 | 1/1 |
| V41 | 1/1 |
| V42 | 1/1 |
| V53 | 1/1 |
| V54 | 1/1 |

## Checks that never passed anywhere

- none
