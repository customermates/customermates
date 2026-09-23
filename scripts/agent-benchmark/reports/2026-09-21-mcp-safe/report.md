# Agent benchmark report bc76181a-1fa0-49d8-831a-4c3c514e8579

Generated 2026-09-21T20:21:38.300Z. Total spend $2.0098. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mcp-safe/flash-lite-low | 108 | 88.0 % | 72.2 % | 4.32 | $0.0186 | $0.0167 | 2.2 | $0.0212 | 96.3 % | 70.3 % | 0.0 % | 4.3 | 9.5 s | 32.5 s | 9.8 s | 34.7 s | 0.0 % | - |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | mcp-safe/flash-lite-low |
| --- | ---: |
| C25 | 3/3 |
| C26 | 2/3 |
| C27 | 3/3 |
| C28 | 2/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| C33 | 3/3 |
| C34 | 2/3 |
| C35 | 3/3 |
| C36 | 3/3 |
| H10 | 1/3 |
| H11 | 1/3 |
| H12 | 3/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 2/3 |
| M8 | 2/3 |
| N13 | 1/3 |
| N14 | 2/3 |
| N15 | 2/3 |
| N16 | 3/3 |
| N17 | 3/3 |
| N18 | 3/3 |
| N19 | 3/3 |
| N20 | 3/3 |
| N21 | 3/3 |
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

Default: mcp-safe/flash-lite-low
Deep mode: none

- mcp-safe/flash-lite-low: below the speed floor (wall p50 9.8 s, TTFT p50 9.5 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.2 credits per turn
- deep mode omitted: it would be the default arm
