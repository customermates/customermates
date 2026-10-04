# Agent benchmark report 6b5570b2-4da8-4a60-8942-3d64957ac062

Generated 2026-09-27T22:51:15.671Z. Total spend $30.2746. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source e450d6d0f795b786651e588873c66866651618b4.

## Suite coverage

1848 episodes across 162 distinct cases and 2111 actual user turns (0 skipped).
1794 episodes across 156 cases and 2048 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| docs-v2-jev/shipped | 498 | 53/54 | 96.8 % | 90.6 % | 4.57 | 165/165 | 12.7 % | $0.0073 | $0.0070 | 1.2 | $0.0075 | 98.8 % | 85.1 % | 0.0 % | 3.0 | 2.9 s | 4.7 s | 9.7 s | 19.8 s | 12.0 s | 22.6 s | 0.0 % | 0.0 % | - |
| off/shipped | 798 | 53/54 | 89.5 % | 86.5 % | 4.54 | 165/165 | 15.8 % | $0.0093 | $0.0081 | 1.3 | $0.0104 | 99.9 % | 85.0 % | 0.0 % | 3.9 | 2.1 s | 5.0 s | 7.7 s | 25.8 s | 9.2 s | 27.9 s | 0.0 % | 0.1 % | D8 RH07 RH10 RH13 RH18 RH24 RH43 RH46 RH50 RH51 RH55 RH57 RH60 |
| routing-v2-jev/shipped | 498 | 54/54 | 83.7 % | 82.5 % | 4.52 | 165/165 | 12.1 % | $0.0115 | $0.0093 | 1.4 | $0.0138 | 97.5 % | 82.5 % | 0.0 % | 4.1 | 4.7 s | 6.7 s | 17.8 s | 42.9 s | 21.3 s | 45.6 s | 0.0 % | 0.0 % | D5 RH07 RH10 RH13 RH18 RH24 RH43 RH44 RH46 RH50 RH51 RH55 RH57 RH60 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn | Turns with toolset preload |
| --- | ---: | ---: | ---: | ---: | ---: |
| docs-v2-jev/shipped | $0.0002 | 2.6 % | 1.00 | 0.99 | 0.0 % |
| off/shipped | $0.0000 | 0.0 % | 0.87 | 0.00 | 0.0 % |
| routing-v2-jev/shipped | $0.0000 | 0.5 % | 0.23 | 0.00 | 16.1 % |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 495/495 | 4.42 |
| openai/gpt-5.6-sol | 495/495 | 4.67 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | docs-v2-jev/shipped | off/shipped | routing-v2-jev/shipped |
| --- | ---: | ---: | ---: |
| A1 | 3/3 | 3/3 | 3/3 |
| A2 | 3/3 | 3/3 | 3/3 |
| A3 | 3/3 | 3/3 | 3/3 |
| A4 | 3/3 | 3/3 | 2/3 |
| B1 | 3/3 | 3/3 | 3/3 |
| B2 | 2/3 | 3/3 | 3/3 |
| B3 | 3/3 | 3/3 | 3/3 |
| B4 | 3/3 | 3/3 | 3/3 |
| B5 | 3/3 | 3/3 | 3/3 |
| C25 | 2/3 | 3/3 | 2/3 |
| C26 | 3/3 | 3/3 | 3/3 |
| C27 | 3/3 | 3/3 | 3/3 |
| C28 | 3/3 | 3/3 | 3/3 |
| C29 | 3/3 | 3/3 | 3/3 |
| C30 | 3/3 | 3/3 | 3/3 |
| C31 | 3/3 | 3/3 | 3/3 |
| C32 | 3/3 | 3/3 | 3/3 |
| C33 | 3/3 | 3/3 | 3/3 |
| C34 | 3/3 | 3/3 | 3/3 |
| C35 | 3/3 | 3/3 | 3/3 |
| C36 | 3/3 | 3/3 | 2/3 |
| D1 | 3/3 | 3/3 | 3/3 |
| D10 | 3/3 | 3/3 | 3/3 |
| D2 | 3/3 | 3/3 | 3/3 |
| D3 | 3/3 | 3/3 | 3/3 |
| D4 | 3/3 | 3/3 | 3/3 |
| D5 | 2/3 | 1/3 | 0/3 |
| D6 | 2/3 | 3/3 | 3/3 |
| D7 | 3/3 | 1/3 | 1/3 |
| D8 | 3/3 | 0/3 | 1/3 |
| D9 | 3/3 | 3/3 | 3/3 |
| DH01 | 10/10 | 10/10 | - |
| DH02 | 10/10 | 10/10 | - |
| DH03 | 10/10 | 10/10 | - |
| DH04 | 10/10 | 10/10 | - |
| DH05 | 10/10 | 10/10 | - |
| DH06 | 10/10 | 10/10 | - |
| DH07 | 10/10 | 10/10 | - |
| DH08 | 10/10 | 10/10 | - |
| DH09 | 10/10 | 10/10 | - |
| DH10 | 10/10 | 10/10 | - |
| DH11 | 10/10 | 10/10 | - |
| DH12 | 10/10 | 10/10 | - |
| DH13 | 10/10 | 10/10 | - |
| DH14 | 2/10 | 2/10 | - |
| DH15 | 10/10 | 10/10 | - |
| DH16 | 10/10 | 10/10 | - |
| DH17 | 10/10 | 10/10 | - |
| DH18 | 10/10 | 10/10 | - |
| DH19 | 10/10 | 10/10 | - |
| DH20 | 10/10 | 10/10 | - |
| DH21 | 10/10 | 10/10 | - |
| DH22 | 10/10 | 10/10 | - |
| DH23 | 10/10 | 10/10 | - |
| DH24 | 10/10 | 10/10 | - |
| DH25 | 10/10 | 10/10 | - |
| DH26 | 10/10 | 10/10 | - |
| DH27 | 10/10 | 10/10 | - |
| DH28 | 10/10 | 10/10 | - |
| DH29 | 10/10 | 10/10 | - |
| DH30 | 10/10 | 10/10 | - |
| H10 | 3/3 | 3/3 | 3/3 |
| H11 | 2/3 | 3/3 | 3/3 |
| H12 | 2/3 | 1/3 | 1/3 |
| H9 | 3/3 | 3/3 | 3/3 |
| M5 | 3/3 | 3/3 | 3/3 |
| M6 | 3/3 | 3/3 | 3/3 |
| M7 | 3/3 | 3/3 | 3/3 |
| M8 | 2/3 | 3/3 | 3/3 |
| N13 | 3/3 | 3/3 | 3/3 |
| N14 | 3/3 | 3/3 | 3/3 |
| N15 | 3/3 | 3/3 | 3/3 |
| N16 | 3/3 | 3/3 | 3/3 |
| N17 | 3/3 | 3/3 | 3/3 |
| N18 | 3/3 | 3/3 | 3/3 |
| N19 | 2/3 | 3/3 | 3/3 |
| N20 | 3/3 | 3/3 | 3/3 |
| N21 | 3/3 | 3/3 | 3/3 |
| N22 | 3/3 | 3/3 | 3/3 |
| N23 | 3/3 | 3/3 | 3/3 |
| N24 | 3/3 | 3/3 | 3/3 |
| R43 | 3/3 | 3/3 | 3/3 |
| R47 | 3/3 | 3/3 | 3/3 |
| R48 | 3/3 | 3/3 | 3/3 |
| R49 | 3/3 | 3/3 | 3/3 |
| R50 | 3/3 | 3/3 | 3/3 |
| R51 | 3/3 | 3/3 | 3/3 |
| R52 | 3/3 | 3/3 | 3/3 |
| R53 | 3/3 | 3/3 | 3/3 |
| RH01 | - | 5/5 | 5/5 |
| RH02 | - | 5/5 | 5/5 |
| RH03 | - | 5/5 | 5/5 |
| RH04 | - | 5/5 | 5/5 |
| RH05 | - | 5/5 | 5/5 |
| RH06 | - | 5/5 | 5/5 |
| RH07 | - | 0/5 | 0/5 |
| RH08 | - | 5/5 | 5/5 |
| RH09 | - | 5/5 | 5/5 |
| RH10 | - | 0/5 | 0/5 |
| RH11 | - | 5/5 | 5/5 |
| RH12 | - | 5/5 | 5/5 |
| RH13 | - | 0/5 | 0/5 |
| RH14 | - | 5/5 | 5/5 |
| RH15 | - | 5/5 | 5/5 |
| RH16 | - | 5/5 | 5/5 |
| RH17 | - | 5/5 | 5/5 |
| RH18 | - | 0/5 | 0/5 |
| RH19 | - | 5/5 | 5/5 |
| RH20 | - | 5/5 | 5/5 |
| RH21 | - | 5/5 | 5/5 |
| RH22 | - | 5/5 | 5/5 |
| RH23 | - | 5/5 | 5/5 |
| RH24 | - | 0/5 | 0/5 |
| RH25 | - | 5/5 | 5/5 |
| RH26 | - | 5/5 | 5/5 |
| RH27 | - | 5/5 | 5/5 |
| RH28 | - | 5/5 | 5/5 |
| RH29 | - | 5/5 | 5/5 |
| RH30 | - | 5/5 | 5/5 |
| RH31 | - | 5/5 | 5/5 |
| RH32 | - | 5/5 | 5/5 |
| RH33 | - | 5/5 | 5/5 |
| RH34 | - | 5/5 | 5/5 |
| RH35 | - | 5/5 | 5/5 |
| RH36 | - | 5/5 | 5/5 |
| RH37 | - | 5/5 | 5/5 |
| RH38 | - | 5/5 | 5/5 |
| RH39 | - | 5/5 | 5/5 |
| RH40 | - | 5/5 | 5/5 |
| RH41 | - | 5/5 | 4/5 |
| RH42 | - | 5/5 | 5/5 |
| RH43 | - | 0/5 | 0/5 |
| RH44 | - | 1/5 | 0/5 |
| RH45 | - | 5/5 | 5/5 |
| RH46 | - | 0/5 | 0/5 |
| RH47 | - | 4/5 | 5/5 |
| RH48 | - | 5/5 | 5/5 |
| RH49 | - | 5/5 | 5/5 |
| RH50 | - | 0/5 | 0/5 |
| RH51 | - | 0/5 | 0/5 |
| RH52 | - | 4/5 | 2/5 |
| RH53 | - | 5/5 | 5/5 |
| RH54 | - | 5/5 | 5/5 |
| RH55 | - | 0/5 | 0/5 |
| RH56 | - | 5/5 | 5/5 |
| RH57 | - | 0/5 | 0/5 |
| RH58 | - | 5/5 | 5/5 |
| RH59 | - | 5/5 | 5/5 |
| RH60 | - | 0/5 | 0/5 |
| S1 | 3/3 | 3/3 | 3/3 |
| S2 | 3/3 | 3/3 | 3/3 |
| S3 | 3/3 | 3/3 | 3/3 |
| S4 | 3/3 | 3/3 | 3/3 |
| U44 | 3/3 | 3/3 | 3/3 |
| U45 | 3/3 | 3/3 | 3/3 |
| U46 | 3/3 | 3/3 | 3/3 |
| V37 | 3/3 | 3/3 | 3/3 |
| V38 | 3/3 | 2/3 | 3/3 |
| V39 | 3/3 | 3/3 | 3/3 |
| V40 | 3/3 | 3/3 | 3/3 |
| V41 | 3/3 | 3/3 | 3/3 |
| V42 | 3/3 | 3/3 | 3/3 |

## Checks that never passed anywhere

- turn-2:uses-social
- turn-3:uses-social

## Selection rule

Default: docs-v2-jev/shipped
Deep mode: none

- off/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage false, complete judges 165/165, current clean source true)
- routing-v2-jev/shipped: ineligible (zdr/no-training true, measured 97 %, exact repetition coverage false, complete judges 165/165, current clean source true)
- docs-v2-jev/shipped: below the speed floor (wall p50 12.0 s, TTFT p50 9.7 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.2 credits per turn
- deep mode omitted: it would be the default arm
