# Agent benchmark report 8e474c7c-efde-4caa-bfb5-b4aefb5ed1ed

Generated 2026-09-23T20:56:11.190Z. Total spend $2.4227. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | Judged | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| final-v2/flash-lite-low | 135 | 91.9 % | 80.0 % | 4.53 | 100.0 % | 16.3 % | $0.0179 | $0.0162 | 2.1 | $0.0195 | 98.5 % | 63.3 % | 0.0 % | 3.9 | 2.3 s | 9.0 s | 8.1 s | 26.7 s | 8.6 s | 27.6 s | 0.0 % | 0.7 % | - |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 135/135 | 4.32 |
| openai/gpt-5.6-sol | 135/135 | 4.74 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | final-v2/flash-lite-low |
| --- | ---: |
| A1 | 3/3 |
| A2 | 3/3 |
| A3 | 3/3 |
| A4 | 3/3 |
| B1 | 3/3 |
| B2 | 2/3 |
| B3 | 2/3 |
| B4 | 3/3 |
| B5 | 3/3 |
| C25 | 3/3 |
| C26 | 2/3 |
| C27 | 2/3 |
| C28 | 3/3 |
| C29 | 3/3 |
| C30 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| C33 | 3/3 |
| C34 | 3/3 |
| C35 | 3/3 |
| C36 | 3/3 |
| H10 | 2/3 |
| H11 | 3/3 |
| H12 | 2/3 |
| H9 | 3/3 |
| M5 | 3/3 |
| M6 | 3/3 |
| M7 | 1/3 |
| M8 | 3/3 |
| N13 | 1/3 |
| N14 | 3/3 |
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

Default: final-v2/flash-lite-low
Deep mode: none

- final-v2/flash-lite-low: below the speed floor (wall p50 8.6 s, TTFT p50 8.1 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.1 credits per turn
- deep mode omitted: it would be the default arm
