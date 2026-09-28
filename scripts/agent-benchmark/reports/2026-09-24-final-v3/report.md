# Agent benchmark report 8da8e891-79ca-470e-89c2-9c98c31f838a

Generated 2026-09-24T21:23:37.736Z. Total spend $3.7559. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | Judged | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| final-head/flash-lite-low | 10 | 100.0 % | 0.0 % | 4.69 | 100.0 % | 20.0 % | $0.0142 | $0.0142 | 1.9 | $0.0142 | 100.0 % | 58.6 % | 0.0 % | 3.3 | 3.3 s | 5.0 s | 8.0 s | 12.5 s | 8.7 s | 12.8 s | 0.0 % | 0.0 % | - |
| final-v3/flash-lite-low | 204 | 95.6 % | 88.9 % | 4.56 | 100.0 % | 17.2 % | $0.0151 | $0.0141 | 1.9 | $0.0158 | 98.0 % | 62.7 % | 0.0 % | 3.4 | 2.1 s | 5.7 s | 6.5 s | 14.6 s | 6.9 s | 15.4 s | 0.0 % | 0.5 % | - |
| final-head-2/flash-lite-low | 10 | 90.0 % | 0.0 % | 4.37 | 100.0 % | 10.0 % | $0.0116 | $0.0116 | 1.6 | $0.0129 | 100.0 % | 71.2 % | 0.0 % | 3.6 | 2.8 s | 4.1 s | 5.8 s | 14.8 s | 6.1 s | 15.0 s | 0.0 % | 0.0 % | - |
| cross-provider/haiku45 | 5 | 80.0 % | 0.0 % | 4.88 | 100.0 % | 0.0 % | $0.0671 | $0.0671 | 7.2 | $0.0839 | 100.0 % | 76.1 % | 23.9 % | 4.6 | 1.5 s | 2.8 s | 1.5 s | 2.8 s | 15.0 s | 21.8 s | 0.0 % | 0.0 % | N13 |
| final-head-2/nano-low | 10 | 20.0 % | 0.0 % | 2.15 | 100.0 % | 0.0 % | $0.0032 | $0.0032 | 1.0 | $0.0161 | 100.0 % | 89.3 % | 0.0 % | 5.6 | 11.3 s | 28.9 s | 73.8 s | 179.8 s | 74.7 s | 180.2 s | 0.0 % | 0.0 % | A1 A3 A4 N13 |
| cross-provider/nano-low | 5 | 20.0 % | 0.0 % | 2.12 | 100.0 % | 0.0 % | $0.0036 | $0.0036 | 1.0 | $0.0181 | 100.0 % | 85.7 % | 0.0 % | 5.8 | 14.6 s | 25.1 s | 65.6 s | 193.5 s | 66.2 s | 194.1 s | 0.0 % | 0.0 % | A1 A3 A4 N13 |
| final-head/nano-low | 10 | 10.0 % | 0.0 % | 2.24 | 100.0 % | 0.0 % | $0.0031 | $0.0031 | 1.0 | $0.0315 | 100.0 % | 90.2 % | 0.0 % | 6.1 | 17.4 s | 52.4 s | 55.0 s | 180.9 s | 55.6 s | 181.5 s | 0.0 % | 0.0 % | A1 A3 A4 N13 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 254/254 | 4.15 |
| openai/gpt-5.6-sol | 254/254 | 4.52 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | final-head/flash-lite-low | final-v3/flash-lite-low | final-head-2/flash-lite-low | cross-provider/haiku45 | final-head-2/nano-low | cross-provider/nano-low | final-head/nano-low |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 2/2 | 10/10 | 2/2 | 1/1 | 0/2 | 0/1 | 0/2 |
| A2 | 2/2 | 9/10 | 2/2 | 1/1 | 2/2 | 1/1 | 1/2 |
| A3 | 2/2 | 10/10 | 2/2 | 1/1 | 0/2 | 0/1 | 0/2 |
| A4 | 2/2 | 9/10 | 1/2 | 1/1 | 0/2 | 0/1 | 0/2 |
| B1 | - | 5/5 | - | - | - | - | - |
| B2 | - | 4/5 | - | - | - | - | - |
| B3 | - | 8/10 | - | - | - | - | - |
| B4 | - | 5/5 | - | - | - | - | - |
| B5 | - | 3/3 | - | - | - | - | - |
| C25 | - | 3/3 | - | - | - | - | - |
| C26 | - | 2/3 | - | - | - | - | - |
| C27 | - | 3/3 | - | - | - | - | - |
| C28 | - | 3/3 | - | - | - | - | - |
| C29 | - | 3/3 | - | - | - | - | - |
| C30 | - | 3/3 | - | - | - | - | - |
| C31 | - | 3/3 | - | - | - | - | - |
| C32 | - | 3/3 | - | - | - | - | - |
| C33 | - | 3/3 | - | - | - | - | - |
| C34 | - | 3/3 | - | - | - | - | - |
| C35 | - | 3/3 | - | - | - | - | - |
| C36 | - | 3/3 | - | - | - | - | - |
| H10 | - | 3/3 | - | - | - | - | - |
| H11 | - | 3/3 | - | - | - | - | - |
| H12 | - | 2/3 | - | - | - | - | - |
| H9 | - | 3/3 | - | - | - | - | - |
| M5 | - | 3/3 | - | - | - | - | - |
| M6 | - | 3/3 | - | - | - | - | - |
| M7 | - | 8/10 | - | - | - | - | - |
| M8 | - | 3/3 | - | - | - | - | - |
| N13 | 2/2 | 10/10 | 2/2 | 0/1 | 0/2 | 0/1 | 0/2 |
| N14 | - | 10/10 | - | - | - | - | - |
| N15 | - | 10/10 | - | - | - | - | - |
| N16 | - | 3/3 | - | - | - | - | - |
| N17 | - | 3/3 | - | - | - | - | - |
| N18 | - | 3/3 | - | - | - | - | - |
| N19 | - | 3/3 | - | - | - | - | - |
| N20 | - | 3/3 | - | - | - | - | - |
| N21 | - | 3/3 | - | - | - | - | - |
| N22 | - | 3/3 | - | - | - | - | - |
| N23 | - | 3/3 | - | - | - | - | - |
| N24 | - | 3/3 | - | - | - | - | - |
| S1 | - | 3/3 | - | - | - | - | - |
| S2 | - | 3/3 | - | - | - | - | - |
| S3 | - | 3/3 | - | - | - | - | - |
| S4 | - | 3/3 | - | - | - | - | - |

## Checks that never passed anywhere

- none

## Selection rule

Default: final-v3/flash-lite-low
Deep mode: none

- final-head/flash-lite-low: ineligible (zdr/no-training true, measured 100 %, episodes 10 for 45 cases)
- final-head-2/flash-lite-low: ineligible (zdr/no-training true, measured 100 %, episodes 10 for 45 cases)
- cross-provider/haiku45: ineligible (zdr/no-training true, measured 100 %, episodes 5 for 45 cases)
- final-head-2/nano-low: ineligible (zdr/no-training true, measured 100 %, episodes 10 for 45 cases)
- cross-provider/nano-low: ineligible (zdr/no-training true, measured 100 %, episodes 5 for 45 cases)
- final-head/nano-low: ineligible (zdr/no-training true, measured 100 %, episodes 10 for 45 cases)
- final-v3/flash-lite-low: below the speed floor (wall p50 6.9 s, TTFT p50 6.5 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.9 credits per turn
- deep mode omitted: it would be the default arm
