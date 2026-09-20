# Agent benchmark report c9983948-05cf-40e9-af1c-e66301912436

Generated 2026-09-20T08:44:47.751Z. Total spend $0.4344. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| v2/flash-lite-low | 24 (+6 skipped) | 95.8 % | 87.5 % | n/a | $0.0181 | $0.0181 | 2.4 | $0.0189 | 100.0 % | 69.7 % | 0.0 % | 4.4 | 9.5 s | 15.1 s | 10.2 s | 15.7 s | 0.0 % | - |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | v2/flash-lite-low |
| --- | ---: |
| C25 | 3/3 |
| C26 | 2/3 |
| C29 | 3/3 |
| C31 | 3/3 |
| C32 | 3/3 |
| H10 | 3/3 |
| H11 | 3/3 |
| M8 | 0/0 |
| N24 | 0/0 |
| S3 | 3/3 |

## Checks that never passed anywhere

- none

## Skipped episodes

- v2/flash-lite-low M8 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.
- v2/flash-lite-low M8 r2: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.
- v2/flash-lite-low M8 r3: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.
- v2/flash-lite-low N24 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.
- v2/flash-lite-low N24 r2: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.
- v2/flash-lite-low N24 r3: the benchmark responder failed, so this episode observes the harness and not the assistant: `getLocale` is not supported in Client Components.

## Selection rule

Default: v2/flash-lite-low
Deep mode: none

- v2/flash-lite-low: below the speed floor (wall p50 10.2 s, TTFT p50 9.5 s)
- no other arm passes the quality floor; the best arm ships because it costs 2.4 credits per turn
- deep mode omitted: it would be the default arm
