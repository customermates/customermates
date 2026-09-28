# Agent benchmark report 7a8e2fce-b5db-482a-a6c5-a52e29c78313

Generated 2026-09-28T11:52:38.935Z. Total spend $2.2406. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 880bd5d14aa0cde9ab245c9673ba6cab9bf3004f.

## Suite coverage

72 episodes across 72 distinct cases and 79 actual user turns (0 skipped).
66 episodes across 66 cases and 72 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 72 cases and 79 user turns at source 880bd5d14aa0cde9ab245c9673ba6cab9bf3004f.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 66 | 18/18 | 97.0 % | n/a | 4.56 | 55/55 | 12.7 % | $0.0124 | $0.0114 | 1.6 | $0.0128 | 100.0 % | 67.0 % | 0.0 % | 3.2 | 2.7 s | 4.9 s | 7.5 s | 12.9 s | 7.9 s | 14.3 s | 0.0 % | 0.0 % | D5 H12 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| merge/shipped | $0.0001 | 0.5 % | 0.28 | 0.28 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 55/55 | 4.48 |
| openai/gpt-5.6-sol | 55/55 | 4.65 |

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
| C35 | 1/1 |
| C36 | 1/1 |
| D1 | 1/1 |
| D10 | 1/1 |
| D2 | 1/1 |
| D3 | 1/1 |
| D4 | 1/1 |
| D5 | 0/1 |
| D6 | 1/1 |
| D7 | 1/1 |
| D8 | 1/1 |
| D9 | 1/1 |
| H10 | 1/1 |
| H11 | 1/1 |
| H12 | 0/1 |
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

## Selection rule

Default: merge/shipped
Deep mode: none

- merge/shipped: below the speed floor (wall p50 7.9 s, TTFT p50 7.5 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.6 credits per turn
- deep mode omitted: it would be the default arm
