# Agent benchmark report 20b638eb-20c5-452f-ad7f-c9af925105f2

Generated 2026-09-28T12:50:13.527Z. Total spend $0.0588. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 6d4c558b6cd1fc14af38c6ac6e7209cd8d47b517.

## Suite coverage

6 episodes across 1 distinct case and 6 actual user turns (0 skipped).
6 episodes across 1 case and 6 turns feed comparative quality metrics; 1 case is a strict release contract.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge/shipped | 6 | 4/6 | 66.7 % | 0.0 % | n/a | 0/0 | n/a | $0.0098 | $0.0098 | 1.5 | $0.0147 | 100.0 % | 69.3 % | 0.0 % | 3.5 | 1.9 s | 3.1 s | 8.4 s | 11.6 s | 9.3 s | 13.8 s | 0.0 % | 0.0 % | - |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| merge/shipped | $0.0000 | 0.0 % | 0.00 | 0.00 |

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
| U44 | 4/6 |

## Checks that never passed anywhere

- none

## Selection rule

Default: none
Deep mode: none

- merge/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage true, complete judges 0/0, current clean source true)
- no eligible arm
