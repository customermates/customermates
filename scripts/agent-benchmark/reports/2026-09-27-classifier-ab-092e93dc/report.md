# Agent benchmark report 092e93dc-10e6-4e03-9c69-d428c76d92a3

Generated 2026-09-27T17:17:39.377Z. Total spend $15.8562. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 046fe488d4051f1f05c52f92a5af65db6328d786.

## Suite coverage

522 episodes across 72 distinct cases and 552 actual user turns (0 skipped).
495 episodes across 66 cases and 522 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| docs-jev/shipped | 132 | 31/32 | 93.9 % | 84.8 % | 4.56 | 109/109 | 12.8 % | $0.0128 | $0.0120 | 1.7 | $0.0136 | 98.5 % | 63.8 % | 0.0 % | 3.2 | 2.1 s | 5.3 s | 5.8 s | 13.2 s | 6.3 s | 14.5 s | 0.0 % | 0.0 % | C25 H12 |
| off/shipped | 132 | 32/32 | 92.4 % | 87.9 % | 4.46 | 109/109 | 11.9 % | $0.0128 | $0.0121 | 1.6 | $0.0138 | 98.5 % | 64.1 % | 0.0 % | 3.3 | 2.2 s | 5.4 s | 6.4 s | 15.2 s | 6.7 s | 16.4 s | 0.0 % | 0.0 % | C32 C35 D8 H12 |
| preload-gemini/shipped | 132 | 32/32 | 91.7 % | 87.9 % | 4.40 | 109/109 | 12.8 % | $0.0134 | $0.0126 | 1.8 | $0.0146 | 97.7 % | 63.5 % | 0.0 % | 3.2 | 2.9 s | 5.5 s | 6.8 s | 12.6 s | 7.1 s | 13.8 s | 0.0 % | 0.0 % | C36 D5 D8 N21 |
| preload-jev/shipped | 99 | 20/21 | 90.9 % | 84.8 % | 4.44 | 81/81 | 11.1 % | $0.0135 | $0.0131 | 1.8 | $0.0148 | 99.0 % | 63.1 % | 0.0 % | 3.5 | 2.6 s | 4.6 s | 6.5 s | 13.2 s | 7.0 s | 13.9 s | 0.0 % | 0.0 % | D8 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn | Turns with toolset preload |
| --- | ---: | ---: | ---: | ---: | ---: |
| docs-jev/shipped | $0.0000 | 0.3 % | 0.49 | 0.26 | 0.0 % |
| off/shipped | $0.0000 | 0.0 % | 0.50 | 0.00 | 0.0 % |
| preload-gemini/shipped | $0.0005 | 4.3 % | 0.50 | 0.00 | 8.6 % |
| preload-jev/shipped | $0.0000 | 0.3 % | 0.77 | 0.00 | 9.8 % |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 408/408 | 4.37 |
| openai/gpt-5.6-sol | 408/408 | 4.56 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| off/shipped vs docs-jev/shipped | 66 | 4 | 6 | 56 | -2.0 pts | 0.754 | 1.000 | 0.002 |
| preload-gemini/shipped vs docs-jev/shipped | 66 | 4 | 5 | 57 | -1.5 pts | 1.000 | 1.000 | 0.004 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | docs-jev/shipped | off/shipped | preload-gemini/shipped | preload-jev/shipped |
| --- | ---: | ---: | ---: | ---: |
| A1 | 3/3 | 3/3 | 3/3 | 3/3 |
| A2 | 3/3 | 3/3 | 3/3 | 3/3 |
| A3 | 3/3 | 3/3 | 3/3 | 3/3 |
| A4 | 2/3 | 3/3 | 2/3 | 3/3 |
| B1 | 3/3 | 3/3 | 3/3 | 3/3 |
| B2 | 3/3 | 3/3 | 3/3 | 3/3 |
| B3 | 3/3 | 2/3 | 3/3 | 2/3 |
| B4 | 3/3 | 3/3 | 3/3 | 3/3 |
| B5 | 3/3 | 3/3 | 3/3 | 3/3 |
| C25 | 0/1 | 1/1 | 1/1 | - |
| C26 | 2/3 | 3/3 | 3/3 | 3/3 |
| C27 | 1/1 | 1/1 | 1/1 | - |
| C28 | 1/1 | 1/1 | 1/1 | - |
| C29 | 1/1 | 1/1 | 1/1 | - |
| C30 | 1/1 | 1/1 | 1/1 | - |
| C31 | 1/1 | 1/1 | 1/1 | - |
| C32 | 1/1 | 0/1 | 1/1 | - |
| C33 | 3/3 | 3/3 | 3/3 | 3/3 |
| C34 | 1/1 | 1/1 | 1/1 | - |
| C35 | 1/1 | 0/1 | 1/1 | - |
| C36 | 1/1 | 1/1 | 0/1 | - |
| D1 | 3/3 | 3/3 | 3/3 | 3/3 |
| D10 | 3/3 | 3/3 | 3/3 | 3/3 |
| D2 | 3/3 | 3/3 | 3/3 | 3/3 |
| D3 | 3/3 | 3/3 | 3/3 | 3/3 |
| D4 | 3/3 | 3/3 | 3/3 | 3/3 |
| D5 | 2/3 | 1/3 | 0/3 | 1/3 |
| D6 | 3/3 | 3/3 | 3/3 | 3/3 |
| D7 | 3/3 | 2/3 | 1/3 | 1/3 |
| D8 | 1/3 | 0/3 | 0/3 | 0/3 |
| D9 | 3/3 | 3/3 | 3/3 | 3/3 |
| H10 | 1/1 | 1/1 | 1/1 | - |
| H11 | 1/1 | 1/1 | 1/1 | - |
| H12 | 0/1 | 0/1 | 1/1 | - |
| H9 | 1/1 | 1/1 | 1/1 | - |
| M5 | 1/1 | 1/1 | 1/1 | - |
| M6 | 1/1 | 1/1 | 1/1 | - |
| M7 | 3/3 | 3/3 | 3/3 | 3/3 |
| M8 | 1/1 | 1/1 | 1/1 | - |
| N13 | 3/3 | 3/3 | 3/3 | 3/3 |
| N14 | 3/3 | 3/3 | 3/3 | 3/3 |
| N15 | 3/3 | 3/3 | 3/3 | 3/3 |
| N16 | 3/3 | 3/3 | 3/3 | 3/3 |
| N17 | 1/1 | 1/1 | 1/1 | - |
| N18 | 1/1 | 1/1 | 1/1 | - |
| N19 | 1/1 | 1/1 | 1/1 | - |
| N20 | 1/1 | 1/1 | 1/1 | - |
| N21 | 1/1 | 1/1 | 0/1 | - |
| N22 | 3/3 | 3/3 | 3/3 | 3/3 |
| N23 | 1/1 | 1/1 | 1/1 | - |
| N24 | 1/1 | 1/1 | 1/1 | - |
| R43 | 1/1 | 1/1 | 1/1 | - |
| R47 | 1/1 | 1/1 | 1/1 | - |
| R48 | 1/1 | 1/1 | 1/1 | - |
| R49 | 1/1 | 1/1 | 1/1 | - |
| R50 | 1/1 | 1/1 | 1/1 | - |
| R51 | 1/1 | 1/1 | 1/1 | - |
| R52 | 1/1 | 1/1 | 1/1 | - |
| R53 | 3/3 | 3/3 | 3/3 | 3/3 |
| S1 | 1/1 | 1/1 | 1/1 | - |
| S2 | 1/1 | 1/1 | 1/1 | - |
| S3 | 1/1 | 1/1 | 1/1 | - |
| S4 | 1/1 | 1/1 | 1/1 | - |
| U44 | 1/1 | 1/1 | 1/1 | - |
| U45 | 1/1 | 1/1 | 1/1 | - |
| U46 | 1/1 | 1/1 | 1/1 | - |
| V37 | 3/3 | 3/3 | 3/3 | 3/3 |
| V38 | 2/3 | 3/3 | 3/3 | 2/3 |
| V39 | 3/3 | 3/3 | 3/3 | 3/3 |
| V40 | 3/3 | 3/3 | 3/3 | 3/3 |
| V41 | 3/3 | 3/3 | 3/3 | 3/3 |
| V42 | 3/3 | 3/3 | 3/3 | 3/3 |

## Checks that never passed anywhere

- none

## Selection rule

Default: docs-jev/shipped
Deep mode: none

- preload-jev/shipped: ineligible (zdr/no-training true, measured 99 %, exact repetition coverage false, complete judges 81/81, current clean source true)
- off/shipped: below the quality floor (pass 92.4 % vs best 93.9 %, judge 4.46 vs 4.56, never solved C32 C35 D8 H12)
- preload-gemini/shipped: below the quality floor (pass 91.7 % vs best 93.9 %, judge 4.40 vs 4.56, never solved C36 D5 D8 N21)
- docs-jev/shipped: below the speed floor (wall p50 6.3 s, TTFT p50 5.8 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.7 credits per turn
- deep mode omitted: it would be the default arm
