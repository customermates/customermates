# Agent benchmark report 1c7fa8d3-61cb-4067-8d7b-5d46a958ac66

Generated 2026-09-25T09:48:09.632Z. Total spend $1.8886. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 2d93cbc861f5380219aac42927f31c363e1b78c7.

## Suite coverage

62 episodes across 62 distinct cases and 69 actual user turns (0 skipped).
56 episodes across 56 cases and 62 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

**PASS** for merge/shipped: expected 62 cases and 69 user turns at source 2d93cbc861f5380219aac42927f31c363e1b78c7.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 56 | 18/18 | 98.2 % | n/a | 4.64 | 44/45 | 18.2 % | $0.0127 | $0.0114 | 1.7 | $0.0129 | 98.2 % | 75.5 % | 0.0 % | 3.5 | 2.2 s | 5.3 s | 7.3 s | 14.5 s | 7.7 s | 14.7 s | 0.0 % | 0.0 % | H12 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 44/45 | 4.43 |
| openai/gpt-5.6-sol | 45/45 | 4.84 |

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

Default: none
Deep mode: none

- merge/shipped: ineligible (zdr/no-training true, measured 98 %, exact repetition coverage true, complete judges 44/45, current clean source true)
- no eligible arm
