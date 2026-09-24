# Agent benchmark report 01ca0d9b-ada3-40c5-a9bb-6415d7982b26

Generated 2026-09-23T20:14:16.923Z. Total spend $1.8770. Arms are keyed runtime/arm.
Cohort: schema 4, fixture chat-benchmark-fixture-v5, source 5cc668dac5ead0969b034f6a1a425781bf91942a.

## Suite coverage

52 episodes across 52 distinct cases and 58 actual user turns (0 skipped).
46 episodes across 46 cases and 51 turns feed comparative quality metrics; 17 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 52 cases and 58 user turns at source 5cc668dac5ead0969b034f6a1a425781bf91942a.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 46 | 17/17 | 95.7 % | n/a | 4.56 | 36/36 | $0.0183 | $0.0165 | 2.2 | $0.0191 | 97.8 % | 66.8 % | 0.0 % | 4.2 | 10.4 s | 28.7 s | 10.7 s | 29.1 s | 0.0 % | N13 N14 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | merge/shipped |
| --- | ---: |
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
| N13 | 0/1 |
| N14 | 0/1 |
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

## Selection rule

Default: merge/shipped
Deep mode: none

- merge/shipped: below the speed floor (wall p50 10.7 s, TTFT p50 10.4 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.2 credits per turn
- deep mode omitted: it would be the default arm
