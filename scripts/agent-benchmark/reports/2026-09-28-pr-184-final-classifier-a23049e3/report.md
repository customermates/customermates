# Agent benchmark report a23049e3-8781-4690-99c6-1ae7c427c542

Generated 2026-09-28T06:40:48.794Z. Total spend $2.0283. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 52c1377e6ef64a316092b06208cc32c338c669ee.

## Suite coverage

72 episodes across 72 distinct cases and 79 actual user turns (0 skipped).
66 episodes across 66 cases and 72 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 72 cases and 79 user turns at source 52c1377e6ef64a316092b06208cc32c338c669ee.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 66 | 18/18 | 93.9 % | n/a | 4.51 | 55/55 | 12.7 % | $0.0099 | $0.0091 | 1.4 | $0.0106 | 98.5 % | 82.5 % | 0.0 % | 3.3 | 2.0 s | 4.4 s | 6.2 s | 14.8 s | 6.5 s | 16.0 s | 0.0 % | 0.0 % | A4 D2 D5 M5 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| merge/shipped | $0.0000 | 0.5 % | 0.25 | 0.25 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 55/55 | 4.36 |
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
| A4 | 0/1 |
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
| D2 | 0/1 |
| D3 | 1/1 |
| D4 | 1/1 |
| D5 | 0/1 |
| D6 | 1/1 |
| D7 | 1/1 |
| D8 | 1/1 |
| D9 | 1/1 |
| H10 | 1/1 |
| H11 | 1/1 |
| H12 | 1/1 |
| H9 | 1/1 |
| M5 | 0/1 |
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

- merge/shipped: below the speed floor (wall p50 6.5 s, TTFT p50 6.2 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.4 credits per turn
- deep mode omitted: it would be the default arm
