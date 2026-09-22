# Agent benchmark report 2fc4c968-e867-4f7d-b884-aed1b4b56a40

Generated 2026-09-21T18:18:50.708Z. Total spend $1.8786. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| merge-ready/flash-lite-low | 108 | 87.0 % | 72.2 % | 4.41 | $0.0174 | $0.0157 | 2.1 | $0.0200 | 99.1 % | 70.3 % | 0.0 % | 4.2 | 7.2 s | 16.0 s | 7.7 s | 19.1 s | 0.0 % | - |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | merge-ready/flash-lite-low |
| --- | ---: |
| C25 | 2/3 |
| C26 | 1/3 |
| C27 | 3/3 |
| C28 | 3/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| C33 | 3/3 |
| C34 | 1/3 |
| C35 | 2/3 |
| C36 | 2/3 |
| H10 | 1/3 |
| H11 | 3/3 |
| H12 | 3/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 3/3 |
| M8 | 2/3 |
| N13 | 1/3 |
| N14 | 3/3 |
| N15 | 3/3 |
| N16 | 3/3 |
| N17 | 2/3 |
| N18 | 3/3 |
| N19 | 3/3 |
| N20 | 3/3 |
| N21 | 2/3 |
| N22 | 3/3 |
| N23 | 3/3 |
| N24 | 3/3 |
| S1 | 3/3 |
| S2 | 3/3 |
| S3 | 3/3 |
| S4 | 3/3 |

## Checks that never passed anywhere

- none

## Selection rule

Default: merge-ready/flash-lite-low
Deep mode: none

- merge-ready/flash-lite-low: below the speed floor (wall p50 7.7 s, TTFT p50 7.2 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.1 credits per turn
- deep mode omitted: it would be the default arm
