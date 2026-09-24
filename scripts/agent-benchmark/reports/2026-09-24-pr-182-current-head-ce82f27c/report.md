# Agent benchmark report ce82f27c-034d-4510-a0de-0aae2222d32b

Generated 2026-09-24T18:45:16.770Z. Total spend $0.8984. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v6, source 0246dae027f145cac1e00f6483dedbf0122eee51.

## Suite coverage

52 episodes across 52 distinct cases and 58 actual user turns (0 skipped).
46 episodes across 46 cases and 51 turns feed comparative quality metrics; 17 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 52 cases and 58 user turns at source 0246dae027f145cac1e00f6483dedbf0122eee51.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 46 | 17/17 | 93.5 % | n/a | n/a | 0/36 | $0.0185 | $0.0167 | 2.2 | $0.0198 | 100.0 % | 62.3 % | 0.0 % | 3.9 | 6.6 s | 18.1 s | 7.4 s | 18.4 s | 0.0 % | C26 N14 N15 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | merge/shipped |
| --- | ---: |
| C25 | 1/1 |
| C26 | 0/1 |
| C27 | 1/1 |
| C28 | 1/1 |
| C29 | 1/1 |
| C30 | 1/1 |
| C31 | 1/1 |
| C32 | 1/1 |
| C33 | 1/1 |
| C34 | 1/1 |
| C35 | 1/1 |
| C36 | 1/1 |
| H10 | 1/1 |
| H11 | 1/1 |
| H12 | 1/1 |
| H9 | 1/1 |
| M5 | 1/1 |
| M6 | 1/1 |
| M7 | 1/1 |
| M8 | 1/1 |
| N13 | 1/1 |
| N14 | 0/1 |
| N15 | 0/1 |
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
