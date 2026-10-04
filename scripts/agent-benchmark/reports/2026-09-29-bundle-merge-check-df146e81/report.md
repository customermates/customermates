# Agent benchmark report df146e81-1d60-4cb0-8217-46a1e0d6d8cf

Generated 2026-09-29T00:15:19.881Z. Total spend $1.0073. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 36832544c7e0ed3249963eb0b5016634df9074fd.

## Suite coverage

72 episodes across 72 distinct cases and 79 actual user turns (0 skipped).
66 episodes across 66 cases and 72 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 72 cases and 79 user turns at source 36832544c7e0ed3249963eb0b5016634df9074fd.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 66 | 18/18 | 97.0 % | n/a | n/a | 0/55 | n/a | $0.0133 | $0.0122 | 1.2 | $0.0137 | 100.0 % | 61.0 % | 0.0 % | 3.0 | 1.9 s | 4.6 s | 5.8 s | 11.4 s | 6.3 s | 12.2 s | 0.0 % | 0.0 % | C35 M7 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| merge/shipped | $0.0000 | 0.4 % | 0.24 | 0.24 |

## Retrieval latency

| Arm | Corpus | Calls | Total p50 | Total p95 | Full-text p95 | Embedding p95 | Re-rank p95 | Embedding used | Embedding timeout | Re-rank used | Wiki re-rank calls/turn |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| merge/shipped | docs | 17 | 0.8 s | 1.0 s | 0.0 s | 0.9 s | 0.6 s | 35.3 % | 64.7 % | 100.0 % | 0.00 |

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
| C25 | 1/1 |
| C26 | 1/1 |
| C27 | 1/1 |
| C28 | 1/1 |
| C29 | 1/1 |
| C30 | 1/1 |
| C31 | 1/1 |
| C32 | 1/1 |
| C33 | 1/1 |
| C34 | 1/1 |
| C35 | 0/1 |
| C36 | 1/1 |
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
| M7 | 0/1 |
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
| N23 | 1/1 |
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

## Checks that never passed anywhere

- none
