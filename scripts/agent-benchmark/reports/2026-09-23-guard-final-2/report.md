# Agent benchmark report aadffb7c-1588-4662-b4c6-4c7fe567bd43

Generated 2026-09-23T21:27:05.099Z. Total spend $0.5219. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | Judged | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| guard-final-2/flash-lite-low | 36 | 100.0 % | 100.0 % | 4.68 | 100.0 % | 13.9 % | $0.0145 | $0.0109 | 1.6 | $0.0145 | 100.0 % | 65.6 % | 0.0 % | 3.2 | 1.9 s | 8.5 s | 8.9 s | 19.8 s | 9.2 s | 20.1 s | 0.0 % | 0.0 % | - |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 36/36 | 4.47 |
| openai/gpt-5.6-sol | 36/36 | 4.88 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | guard-final-2/flash-lite-low |
| --- | ---: |
| B5 | 3/3 |
| C29 | 3/3 |
| C34 | 3/3 |
| C35 | 3/3 |
| C36 | 3/3 |
| H9 | 3/3 |
| M6 | 3/3 |
| N20 | 3/3 |
| N21 | 3/3 |
| N24 | 3/3 |
| S2 | 3/3 |
| S3 | 3/3 |

## Checks that never passed anywhere

- none

## Selection rule

Default: guard-final-2/flash-lite-low
Deep mode: none

- guard-final-2/flash-lite-low: below the speed floor (wall p50 9.2 s, TTFT p50 8.9 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.6 credits per turn
- deep mode omitted: it would be the default arm
