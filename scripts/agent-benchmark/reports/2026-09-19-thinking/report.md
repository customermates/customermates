# Agent benchmark report 1389e2d4-8c0b-423a-9c0a-a53dd37b5773

Generated 2026-09-19T15:39:59.822Z. Total spend $11.0282. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| v2/flash-lite-high | 108 | 67.6 % | 61.1 % | 4.21 | $0.0412 | $0.0371 | 4.2 | $0.0610 | 92.6 % | 74.7 % | 0.0 % | 7.5 | 10.9 s | 38.1 s | 11.6 s | 38.7 s | 0.1 % | C29 C30 C31 C32 H10 H11 H12 M8 N13 N24 |
| v2/flash-lite-low | 108 | 63.9 % | 61.1 % | 4.15 | $0.0210 | $0.0189 | 2.3 | $0.0329 | 93.5 % | 72.5 % | 0.0 % | 5.0 | 8.3 s | 29.2 s | 8.9 s | 29.7 s | 0.0 % | C26 C29 C30 C31 C32 C34 H10 H11 M8 N21 N24 |
| v2/flash-lite-medium | 108 | 62.0 % | 55.6 % | 4.20 | $0.0225 | $0.0203 | 2.5 | $0.0363 | 93.5 % | 72.9 % | 0.0 % | 5.2 | 9.9 s | 33.0 s | 10.3 s | 33.4 s | 0.0 % | C26 C29 C30 C31 C32 C34 H10 H11 M8 N13 N21 N24 |
| v2/flash-lite-minimal | 108 | 44.4 % | 36.1 % | 4.04 | $0.0173 | $0.0156 | 2.1 | $0.0390 | 92.6 % | 71.5 % | 0.0 % | 5.1 | 6.4 s | 14.4 s | 6.8 s | 14.9 s | 0.0 % | C25 C26 C29 C30 C31 C32 C34 H10 H11 M8 N13 N14 N15 N20 N21 N24 S1 S3 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | v2/flash-lite-high | v2/flash-lite-low | v2/flash-lite-medium | v2/flash-lite-minimal |
| --- | ---: | ---: | ---: | ---: |
| C25 | 3/3 | 3/3 | 3/3 | 0/3 |
| C26 | 1/3 | 0/3 | 0/3 | 0/3 |
| C27 | 3/3 | 3/3 | 3/3 | 2/3 |
| C28 | 3/3 | 3/3 | 3/3 | 2/3 |
| C29 | 0/3 | 0/3 | 0/3 | 0/3 |
| C30 | 0/3 | 0/3 | 0/3 | 0/3 |
| C31 | 0/3 | 0/3 | 0/3 | 0/3 |
| C32 | 0/3 | 0/3 | 0/3 | 0/3 |
| C33 | 3/3 | 3/3 | 3/3 | 3/3 |
| C34 | 2/3 | 0/3 | 0/3 | 0/3 |
| C35 | 3/3 | 3/3 | 2/3 | 1/3 |
| C36 | 3/3 | 3/3 | 2/3 | 2/3 |
| H10 | 0/3 | 0/3 | 0/3 | 0/3 |
| H11 | 0/3 | 0/3 | 0/3 | 0/3 |
| H12 | 0/3 | 1/3 | 1/3 | 3/3 |
| H9 | 3/3 | 3/3 | 3/3 | 3/3 |
| M5 | 3/3 | 3/3 | 3/3 | 3/3 |
| M6 | 3/3 | 1/3 | 3/3 | 3/3 |
| M7 | 2/3 | 3/3 | 3/3 | 3/3 |
| M8 | 0/3 | 0/3 | 0/3 | 0/3 |
| N13 | 0/3 | 1/3 | 0/3 | 0/3 |
| N14 | 3/3 | 3/3 | 2/3 | 0/3 |
| N15 | 3/3 | 3/3 | 3/3 | 0/3 |
| N16 | 3/3 | 3/3 | 3/3 | 2/3 |
| N17 | 3/3 | 3/3 | 3/3 | 3/3 |
| N18 | 3/3 | 3/3 | 3/3 | 3/3 |
| N19 | 3/3 | 3/3 | 3/3 | 3/3 |
| N20 | 3/3 | 3/3 | 3/3 | 0/3 |
| N21 | 2/3 | 0/3 | 0/3 | 0/3 |
| N22 | 3/3 | 3/3 | 3/3 | 3/3 |
| N23 | 3/3 | 3/3 | 3/3 | 3/3 |
| N24 | 0/3 | 0/3 | 0/3 | 0/3 |
| S1 | 3/3 | 3/3 | 3/3 | 0/3 |
| S2 | 3/3 | 3/3 | 3/3 | 3/3 |
| S3 | 3/3 | 3/3 | 3/3 | 0/3 |
| S4 | 3/3 | 3/3 | 3/3 | 3/3 |

## Checks that never passed anywhere

- discloses-injection-attempt
- read-actual-activities
- records-untouched
- rejection-respected
- turn-terminated-with-a-report

## Selection rule

Default: v2/flash-lite-high
Deep mode: none

- v2/flash-lite-high: below the quality floor (pass 67.6 % vs best 67.6 %, judge 4.21 vs 4.21, never solved C29 C30 C31 C32 H10 H11 H12 M8 N13 N24)
- v2/flash-lite-low: below the quality floor (pass 63.9 % vs best 67.6 %, judge 4.15 vs 4.21, never solved C26 C29 C30 C31 C32 C34 H10 H11 M8 N21 N24)
- v2/flash-lite-medium: below the quality floor (pass 62.0 % vs best 67.6 %, judge 4.20 vs 4.21, never solved C26 C29 C30 C31 C32 C34 H10 H11 M8 N13 N21 N24)
- v2/flash-lite-minimal: below the quality floor (pass 44.4 % vs best 67.6 %, judge 4.04 vs 4.21, never solved C25 C26 C29 C30 C31 C32 C34 H10 H11 M8 N13 N14 N15 N20 N21 N24 S1 S3)
- no other arm passes the quality floor; the best arm ships because it costs 4.2 credits per turn
- deep mode omitted: it would be the default arm
