# Agent benchmark report d71e401c-c371-45e0-aa08-a6efb406f783

Generated 2026-09-21T23:21:47.753Z. Total spend $1.8680. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| fixes-full/flash-lite-low | 108 | 90.7 % | 75.0 % | 4.33 | $0.0173 | $0.0156 | 2.1 | $0.0191 | 99.1 % | 67.0 % | 0.0 % | 4.1 | 9.4 s | 31.9 s | 10.1 s | 32.2 s | 0.0 % | - |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | fixes-full/flash-lite-low |
| --- | ---: |
| C25 | 3/3 |
| C26 | 1/3 |
| C27 | 3/3 |
| C28 | 3/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| C33 | 3/3 |
| C34 | 2/3 |
| C35 | 3/3 |
| C36 | 3/3 |
| H10 | 2/3 |
| H11 | 3/3 |
| H12 | 3/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 2/3 |
| M8 | 3/3 |
| N13 | 2/3 |
| N14 | 3/3 |
| N15 | 2/3 |
| N16 | 3/3 |
| N17 | 3/3 |
| N18 | 3/3 |
| N19 | 3/3 |
| N20 | 2/3 |
| N21 | 2/3 |
| N22 | 3/3 |
| N23 | 3/3 |
| N24 | 2/3 |
| S1 | 3/3 |
| S2 | 3/3 |
| S3 | 3/3 |
| S4 | 3/3 |

## Checks that never passed anywhere

- none

## Selection rule

Default: fixes-full/flash-lite-low
Deep mode: none

- fixes-full/flash-lite-low: below the speed floor (wall p50 10.1 s, TTFT p50 9.4 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.1 credits per turn
- deep mode omitted: it would be the default arm
