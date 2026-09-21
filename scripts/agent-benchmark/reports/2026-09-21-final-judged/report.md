# Agent benchmark report 979a3577-6c47-4891-b3d1-8436d2e7ed35

Generated 2026-09-21T17:24:45.252Z. Total spend $2.0253. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| final/flash-lite-low | 118 | 89.0 % | 72.2 % | 4.33 | $0.0172 | $0.0156 | 2.1 | $0.0193 | 96.6 % | 70.2 % | 0.0 % | 4.2 | 7.6 s | 24.7 s | 7.9 s | 24.9 s | 0.0 % | - |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | final/flash-lite-low |
| --- | ---: |
| C25 | 3/3 |
| C26 | 2/3 |
| C27 | 3/3 |
| C28 | 3/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 7/8 |
| C33 | 3/3 |
| C34 | 2/3 |
| C35 | 2/3 |
| C36 | 3/3 |
| H10 | 4/8 |
| H11 | 3/3 |
| H12 | 2/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 2/3 |
| M8 | 2/3 |
| N13 | 3/3 |
| N14 | 2/3 |
| N15 | 3/3 |
| N16 | 3/3 |
| N17 | 3/3 |
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

Default: final/flash-lite-low
Deep mode: none

- final/flash-lite-low: below the speed floor (wall p50 7.9 s, TTFT p50 7.6 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.1 credits per turn
- deep mode omitted: it would be the default arm
