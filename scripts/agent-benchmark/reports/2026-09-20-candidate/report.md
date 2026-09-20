# Agent benchmark report ddadb1ab-ec64-4176-8c78-012e68138b0d

Generated 2026-09-20T14:18:31.242Z. Total spend $2.0998. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| candidate/flash-lite-low | 108 | 90.7 % | 77.8 % | 4.48 | $0.0194 | $0.0175 | 2.2 | $0.0214 | 99.1 % | 72.8 % | 0.0 % | 4.2 | 11.3 s | 43.2 s | 11.8 s | 44.8 s | 0.0 % | N21 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | candidate/flash-lite-low |
| --- | ---: |
| C25 | 3/3 |
| C26 | 2/3 |
| C27 | 3/3 |
| C28 | 3/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| C33 | 3/3 |
| C34 | 3/3 |
| C35 | 3/3 |
| C36 | 2/3 |
| H10 | 2/3 |
| H11 | 2/3 |
| H12 | 2/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 3/3 |
| M8 | 3/3 |
| N13 | 2/3 |
| N14 | 3/3 |
| N15 | 3/3 |
| N16 | 3/3 |
| N17 | 3/3 |
| N18 | 3/3 |
| N19 | 2/3 |
| N20 | 3/3 |
| N21 | 0/3 |
| N22 | 3/3 |
| N23 | 3/3 |
| N24 | 3/3 |
| S1 | 3/3 |
| S2 | 3/3 |
| S3 | 3/3 |
| S4 | 3/3 |

## Checks that never passed anywhere

- due-date-is-the-monday-after

## Selection rule

Default: candidate/flash-lite-low
Deep mode: none

- candidate/flash-lite-low: below the quality floor (pass 90.7 % vs best 90.7 %, judge 4.48 vs 4.48, never solved N21)
- no other arm passes the quality floor; the best arm ships because it costs 2.2 credits per turn
- deep mode omitted: it would be the default arm
