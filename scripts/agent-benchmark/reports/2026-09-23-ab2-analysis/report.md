# Agent benchmark report 0aadeed5-1787-4f78-8281-f3b0f5e5795a

Generated 2026-09-23T15:48:37.933Z. Total spend $3.6516. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | Judged | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| analysis-on/flash-lite-low | 95 | 94.7 % | 84.2 % | n/a | 0.0 % | 0.0 % | $0.0179 | $0.0170 | 2.2 | $0.0189 | 97.9 % | 72.1 % | 0.0 % | 4.2 | 2.6 s | 9.9 s | 9.0 s | 54.4 s | 9.5 s | 54.9 s | 0.5 % | 0.0 % | - |
| analysis-off/flash-lite-low | 95 | 82.1 % | 73.7 % | n/a | 0.0 % | 0.0 % | $0.0205 | $0.0195 | 2.4 | $0.0250 | 100.0 % | 73.0 % | 0.0 % | 4.3 | 2.5 s | 9.8 s | 10.2 s | 55.1 s | 11.2 s | 55.7 s | 0.0 % | 0.0 % | A3 B4 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | analysis-on/flash-lite-low | analysis-off/flash-lite-low |
| --- | ---: | ---: |
| A1 | 5/5 | 5/5 |
| A2 | 4/5 | 4/5 |
| A3 | 5/5 | 0/5 |
| A4 | 5/5 | 1/5 |
| B1 | 5/5 | 5/5 |
| B2 | 5/5 | 5/5 |
| B3 | 5/5 | 5/5 |
| B4 | 5/5 | 0/5 |
| B5 | 5/5 | 5/5 |
| C26 | 4/5 | 5/5 |
| C28 | 5/5 | 5/5 |
| C34 | 5/5 | 5/5 |
| C35 | 5/5 | 5/5 |
| M7 | 4/5 | 5/5 |
| M8 | 5/5 | 5/5 |
| N13 | 3/5 | 3/5 |
| N14 | 5/5 | 5/5 |
| N24 | 5/5 | 5/5 |
| S2 | 5/5 | 5/5 |

## Checks that never passed anywhere

- none

## Selection rule

Default: analysis-on/flash-lite-low
Deep mode: none

- analysis-off/flash-lite-low: below the quality floor (pass 82.1 % vs best 94.7 %, judge 0.00 vs 0.00, never solved A3 B4)
- analysis-on/flash-lite-low: below the speed floor (wall p50 9.5 s, TTFT p50 9.0 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.2 credits per turn
- deep mode omitted: it would be the default arm
