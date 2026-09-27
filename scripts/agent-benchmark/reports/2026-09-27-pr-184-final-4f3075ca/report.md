# Agent benchmark report 4f3075ca-01da-4b84-8cf1-941ea37fd9c1

Generated 2026-09-27T07:55:50.545Z. Total spend $1.8981. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source e3bccaaf9d407296f4efa2a48900bd15e5716fcf.

## Suite coverage

62 episodes across 62 distinct cases and 69 actual user turns (0 skipped).
56 episodes across 56 cases and 62 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 62 cases and 69 user turns at source e3bccaaf9d407296f4efa2a48900bd15e5716fcf.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 56 | 18/18 | 96.4 % | n/a | 4.54 | 45/45 | 17.8 % | $0.0132 | $0.0119 | 1.7 | $0.0136 | 96.4 % | 69.2 % | 0.0 % | 3.4 | 2.3 s | 4.2 s | 5.7 s | 12.4 s | 6.1 s | 12.8 s | 0.0 % | 0.0 % | C27 C28 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 45/45 | 4.34 |
| openai/gpt-5.6-sol | 45/45 | 4.74 |

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
| C27 | 0/1 |
| C28 | 0/1 |
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

- merge/shipped: below the speed floor (wall p50 6.1 s, TTFT p50 5.7 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.7 credits per turn
- deep mode omitted: it would be the default arm
