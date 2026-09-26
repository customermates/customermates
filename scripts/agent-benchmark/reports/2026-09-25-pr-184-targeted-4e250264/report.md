# Agent benchmark report 4e250264-dee4-4537-a79f-bc9479daf1dc

Generated 2026-09-25T09:48:12.698Z. Total spend $1.5940. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 2d93cbc861f5380219aac42927f31c363e1b78c7.

## Suite coverage

48 episodes across 16 distinct cases and 51 actual user turns (0 skipped).
48 episodes across 16 cases and 51 turns feed comparative quality metrics; 0 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merged/shipped | 48 | 0/0 | 97.9 % | 93.8 % | 4.78 | 48/48 | 12.5 % | $0.0125 | $0.0118 | 1.7 | $0.0128 | 97.9 % | 79.2 % | 0.0 % | 3.5 | 2.3 s | 7.0 s | 6.2 s | 12.0 s | 6.8 s | 13.8 s | 0.0 % | 0.0 % | - |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 48/48 | 4.57 |
| openai/gpt-5.6-sol | 48/48 | 4.99 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | merged/shipped |
| --- | ---: |
| A1 | 3/3 |
| A2 | 3/3 |
| A3 | 3/3 |
| A4 | 3/3 |
| B1 | 3/3 |
| B2 | 2/3 |
| B3 | 3/3 |
| B4 | 3/3 |
| B5 | 3/3 |
| C34 | 3/3 |
| M7 | 3/3 |
| N13 | 3/3 |
| N14 | 3/3 |
| N15 | 3/3 |
| N24 | 3/3 |
| S2 | 3/3 |

## Checks that never passed anywhere

- none

## Selection rule

Default: merged/shipped
Deep mode: none

- merged/shipped: below the speed floor (wall p50 6.8 s, TTFT p50 6.2 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.7 credits per turn
- deep mode omitted: it would be the default arm
