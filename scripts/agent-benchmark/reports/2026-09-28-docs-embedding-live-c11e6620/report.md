# Agent benchmark report c11e6620-ee4e-4789-b305-cf44a3e787d7

Generated 2026-09-28T10:14:00.861Z. Total spend $10.8268. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source cc7780b0d8bcf015ae4f0cf595cceb13a2472d31.

## Suite coverage

1344 episodes across 132 distinct cases and 1358 actual user turns (0 skipped).
1332 episodes across 126 cases and 1344 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| keyword/shipped | 666 | 18/18 | 98.2 % | 98.3 % | n/a | 0/55 | n/a | $0.0076 | $0.0075 | 1.2 | $0.0077 | 94.3 % | 77.1 % | 0.0 % | 2.8 | 2.3 s | 6.1 s | 7.5 s | 18.7 s | 9.0 s | 22.2 s | 0.0 % | 0.0 % | D5 DH14 H12 |
| hybrid/shipped | 666 | 18/18 | 98.2 % | 98.3 % | n/a | 0/55 | n/a | $0.0077 | $0.0077 | 1.2 | $0.0079 | 84.5 % | 75.6 % | 0.0 % | 2.8 | 2.5 s | 6.2 s | 8.7 s | 20.8 s | 10.5 s | 24.5 s | 0.0 % | 0.0 % | B2 D5 DH14 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| keyword/shipped | $0.0003 | 3.4 % | 1.43 | 1.41 |
| hybrid/shipped | $0.0003 | 3.4 % | 1.40 | 1.39 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| keyword/shipped vs hybrid/shipped | 126 | 1 | 1 | 124 | 0.0 pts | 1.000 | 1.000 | 0.500 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | keyword/shipped | hybrid/shipped |
| --- | ---: | ---: |
| A1 | 1/1 | 1/1 |
| A2 | 1/1 | 1/1 |
| A3 | 1/1 | 1/1 |
| A4 | 1/1 | 1/1 |
| B1 | 1/1 | 1/1 |
| B2 | 1/1 | 0/1 |
| B3 | 1/1 | 1/1 |
| B4 | 1/1 | 1/1 |
| B5 | 1/1 | 1/1 |
| C25 | 1/1 | 1/1 |
| C26 | 1/1 | 1/1 |
| C27 | 1/1 | 1/1 |
| C28 | 1/1 | 1/1 |
| C29 | 1/1 | 1/1 |
| C30 | 1/1 | 1/1 |
| C31 | 1/1 | 1/1 |
| C32 | 1/1 | 1/1 |
| C33 | 1/1 | 1/1 |
| C34 | 1/1 | 1/1 |
| C35 | 1/1 | 1/1 |
| C36 | 1/1 | 1/1 |
| D1 | 1/1 | 1/1 |
| D10 | 1/1 | 1/1 |
| D2 | 1/1 | 1/1 |
| D3 | 1/1 | 1/1 |
| D4 | 1/1 | 1/1 |
| D5 | 0/1 | 0/1 |
| D6 | 1/1 | 1/1 |
| D7 | 1/1 | 1/1 |
| D8 | 1/1 | 1/1 |
| D9 | 1/1 | 1/1 |
| DE01 | 10/10 | 10/10 |
| DE02 | 10/10 | 10/10 |
| DE03 | 10/10 | 10/10 |
| DE04 | 10/10 | 10/10 |
| DE05 | 10/10 | 10/10 |
| DE06 | 10/10 | 10/10 |
| DE07 | 10/10 | 10/10 |
| DE08 | 10/10 | 10/10 |
| DE09 | 10/10 | 10/10 |
| DE10 | 10/10 | 10/10 |
| DE11 | 10/10 | 10/10 |
| DE12 | 10/10 | 10/10 |
| DE13 | 10/10 | 10/10 |
| DE14 | 10/10 | 10/10 |
| DE15 | 10/10 | 10/10 |
| DE16 | 10/10 | 10/10 |
| DE17 | 10/10 | 10/10 |
| DE18 | 10/10 | 10/10 |
| DE19 | 10/10 | 10/10 |
| DE20 | 10/10 | 10/10 |
| DE21 | 10/10 | 10/10 |
| DE22 | 10/10 | 10/10 |
| DE23 | 10/10 | 10/10 |
| DE24 | 10/10 | 10/10 |
| DE25 | 10/10 | 10/10 |
| DE26 | 10/10 | 10/10 |
| DE27 | 10/10 | 10/10 |
| DE28 | 10/10 | 10/10 |
| DE29 | 10/10 | 10/10 |
| DE30 | 10/10 | 10/10 |
| DH01 | 10/10 | 10/10 |
| DH02 | 10/10 | 10/10 |
| DH03 | 10/10 | 10/10 |
| DH04 | 10/10 | 10/10 |
| DH05 | 10/10 | 10/10 |
| DH06 | 10/10 | 10/10 |
| DH07 | 10/10 | 10/10 |
| DH08 | 10/10 | 10/10 |
| DH09 | 10/10 | 10/10 |
| DH10 | 10/10 | 10/10 |
| DH11 | 10/10 | 10/10 |
| DH12 | 10/10 | 10/10 |
| DH13 | 10/10 | 10/10 |
| DH14 | 0/10 | 0/10 |
| DH15 | 10/10 | 10/10 |
| DH16 | 10/10 | 10/10 |
| DH17 | 10/10 | 10/10 |
| DH18 | 10/10 | 10/10 |
| DH19 | 10/10 | 10/10 |
| DH20 | 10/10 | 10/10 |
| DH21 | 10/10 | 10/10 |
| DH22 | 10/10 | 10/10 |
| DH23 | 10/10 | 10/10 |
| DH24 | 10/10 | 10/10 |
| DH25 | 10/10 | 10/10 |
| DH26 | 10/10 | 10/10 |
| DH27 | 10/10 | 10/10 |
| DH28 | 10/10 | 10/10 |
| DH29 | 10/10 | 10/10 |
| DH30 | 10/10 | 10/10 |
| H10 | 1/1 | 1/1 |
| H11 | 1/1 | 1/1 |
| H12 | 0/1 | 1/1 |
| H9 | 1/1 | 1/1 |
| M5 | 1/1 | 1/1 |
| M6 | 1/1 | 1/1 |
| M7 | 1/1 | 1/1 |
| M8 | 1/1 | 1/1 |
| N13 | 1/1 | 1/1 |
| N14 | 1/1 | 1/1 |
| N15 | 1/1 | 1/1 |
| N16 | 1/1 | 1/1 |
| N17 | 1/1 | 1/1 |
| N18 | 1/1 | 1/1 |
| N19 | 1/1 | 1/1 |
| N20 | 1/1 | 1/1 |
| N21 | 1/1 | 1/1 |
| N22 | 1/1 | 1/1 |
| N23 | 1/1 | 1/1 |
| N24 | 1/1 | 1/1 |
| R43 | 1/1 | 1/1 |
| R47 | 1/1 | 1/1 |
| R48 | 1/1 | 1/1 |
| R49 | 1/1 | 1/1 |
| R50 | 1/1 | 1/1 |
| R51 | 1/1 | 1/1 |
| R52 | 1/1 | 1/1 |
| R53 | 1/1 | 1/1 |
| S1 | 1/1 | 1/1 |
| S2 | 1/1 | 1/1 |
| S3 | 1/1 | 1/1 |
| S4 | 1/1 | 1/1 |
| U44 | 1/1 | 1/1 |
| U45 | 1/1 | 1/1 |
| U46 | 1/1 | 1/1 |
| V37 | 1/1 | 1/1 |
| V38 | 1/1 | 1/1 |
| V39 | 1/1 | 1/1 |
| V40 | 1/1 | 1/1 |
| V41 | 1/1 | 1/1 |
| V42 | 1/1 | 1/1 |

## Checks that never passed anywhere

- none

## Selection rule

Default: none
Deep mode: none

- keyword/shipped: ineligible (zdr/no-training true, measured 94 %, exact repetition coverage true, complete judges 0/55, current clean source true)
- hybrid/shipped: ineligible (zdr/no-training true, measured 85 %, exact repetition coverage true, complete judges 0/55, current clean source true)
- no eligible arm
