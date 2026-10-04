# Agent benchmark report 91a66a87-861c-41aa-8126-b17aff2445ac

Generated 2026-10-04T16:50:41.013Z. Total spend $14.3585. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 2ead1f0cc5d73ae69b015b3775e024882b8253f5.

## Suite coverage

213 episodes across 71 distinct cases and 231 actual user turns (0 skipped).
198 episodes across 66 cases and 216 turns feed comparative quality metrics; 17 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| screen/shipped | 66 | 16/17 | 95.5 % | n/a | 4.55 | 55/55 | 12.7 % | $0.0136 | $0.0125 | 1.3 | $0.0143 | 97.0 % | 67.2 % | 0.0 % | 3.2 | 2.6 s | 4.9 s | 7.7 s | 20.7 s | 8.7 s | 21.6 s | 0.0 % | 2.8 % | M7 N19 R48 |
| screen/ovh-qwen38-27b | 66 | 17/17 | 95.5 % | n/a | 4.73 | 55/55 | 1.8 % | $0.0523 | $0.0480 | 4.8 | $0.0548 | 7.6 % | 0.0 % | 0.0 % | 3.3 | 7.1 s | 44.2 s | 18.7 s | 69.4 s | 21.1 s | 71.5 s | 0.0 % | 0.0 % | C25 C26 M7 |
| screen/ovh-qwen35-397b | 66 | 17/17 | 83.3 % | n/a | 4.23 | 55/55 | 9.1 % | $0.0763 | $0.0699 | 7.0 | $0.0915 | 6.8 % | 0.0 % | 0.0 % | 3.4 | 3.1 s | 8.4 s | 4.3 s | 12.8 s | 12.4 s | 31.1 s | 0.0 % | 0.0 % | B5 C26 C32 C36 D5 D6 H12 M6 M7 N18 N19 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| screen/shipped | $0.0001 | 0.5 % | 0.31 | 0.18 |
| screen/ovh-qwen38-27b | $0.0000 | 0.1 % | 0.26 | 0.14 |
| screen/ovh-qwen35-397b | $0.0001 | 0.1 % | 0.22 | 0.18 |

## Retrieval latency

| Arm | Corpus | Calls | Total p50 | Total p95 | Full-text p95 | Embedding p95 | Re-rank p95 | Embedding used | Embedding timeout | Re-rank used | Wiki re-rank calls/turn |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| screen/shipped | docs | 13 | 1.8 s | 2.3 s | 0.1 s | 1.3 s | 1.5 s | 84.6 % | 15.4 % | 100.0 % | 0.00 |
| screen/ovh-qwen38-27b | docs | 10 | 1.6 s | 2.4 s | 0.1 s | 0.9 s | 2.1 s | 100.0 % | 0.0 % | 100.0 % | 0.00 |
| screen/ovh-qwen35-397b | docs | 13 | 1.8 s | 2.5 s | 0.0 s | 1.1 s | 2.1 s | 100.0 % | 0.0 % | 100.0 % | 0.00 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 165/165 | 4.45 |
| openai/gpt-5.6-sol | 165/165 | 4.55 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| screen/ovh-qwen35-397b vs screen/shipped | 66 | 1 | 9 | 56 | -12.1 pts | 0.021 | 0.043 | 0.002 |
| screen/ovh-qwen38-27b vs screen/shipped | 66 | 2 | 2 | 62 | 0.0 pts | 1.000 | 1.000 | 0.125 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | screen/shipped | screen/ovh-qwen38-27b | screen/ovh-qwen35-397b |
| --- | ---: | ---: | ---: |
| A1 | 1/1 | 1/1 | 1/1 |
| A2 | 1/1 | 1/1 | 1/1 |
| A3 | 1/1 | 1/1 | 1/1 |
| A4 | 1/1 | 1/1 | 1/1 |
| B1 | 1/1 | 1/1 | 1/1 |
| B2 | 1/1 | 1/1 | 1/1 |
| B3 | 1/1 | 1/1 | 1/1 |
| B4 | 1/1 | 1/1 | 1/1 |
| B5 | 1/1 | 1/1 | 0/1 |
| C25 | 1/1 | 0/1 | 1/1 |
| C26 | 1/1 | 0/1 | 0/1 |
| C27 | 1/1 | 1/1 | 1/1 |
| C28 | 1/1 | 1/1 | 1/1 |
| C29 | 1/1 | 1/1 | 1/1 |
| C30 | 1/1 | 1/1 | 1/1 |
| C31 | 1/1 | 1/1 | 1/1 |
| C32 | 1/1 | 1/1 | 0/1 |
| C33 | 1/1 | 1/1 | 1/1 |
| C34 | 1/1 | 1/1 | 1/1 |
| C35 | 1/1 | 1/1 | 1/1 |
| C36 | 1/1 | 1/1 | 0/1 |
| D1 | 1/1 | 1/1 | 1/1 |
| D10 | 1/1 | 1/1 | 1/1 |
| D2 | 1/1 | 1/1 | 1/1 |
| D3 | 1/1 | 1/1 | 1/1 |
| D4 | 1/1 | 1/1 | 1/1 |
| D5 | 1/1 | 1/1 | 0/1 |
| D6 | 1/1 | 1/1 | 0/1 |
| D7 | 1/1 | 1/1 | 1/1 |
| D8 | 1/1 | 1/1 | 1/1 |
| D9 | 1/1 | 1/1 | 1/1 |
| H10 | 1/1 | 1/1 | 1/1 |
| H11 | 1/1 | 1/1 | 1/1 |
| H12 | 1/1 | 1/1 | 0/1 |
| H9 | 1/1 | 1/1 | 1/1 |
| M5 | 1/1 | 1/1 | 1/1 |
| M6 | 1/1 | 1/1 | 0/1 |
| M7 | 0/1 | 0/1 | 0/1 |
| M8 | 1/1 | 1/1 | 1/1 |
| N13 | 1/1 | 1/1 | 1/1 |
| N14 | 1/1 | 1/1 | 1/1 |
| N15 | 1/1 | 1/1 | 1/1 |
| N16 | 1/1 | 1/1 | 1/1 |
| N17 | 1/1 | 1/1 | 1/1 |
| N18 | 1/1 | 1/1 | 0/1 |
| N19 | 0/1 | 1/1 | 0/1 |
| N20 | 1/1 | 1/1 | 1/1 |
| N21 | 1/1 | 1/1 | 1/1 |
| N22 | 1/1 | 1/1 | 1/1 |
| N23 | 1/1 | 1/1 | 1/1 |
| N24 | 1/1 | 1/1 | 1/1 |
| R43 | 1/1 | 1/1 | 1/1 |
| R47 | 1/1 | 1/1 | 1/1 |
| R48 | 0/1 | 1/1 | 1/1 |
| R50 | 1/1 | 1/1 | 1/1 |
| R51 | 1/1 | 1/1 | 1/1 |
| R52 | 1/1 | 1/1 | 1/1 |
| R53 | 1/1 | 1/1 | 1/1 |
| S1 | 1/1 | 1/1 | 1/1 |
| S2 | 1/1 | 1/1 | 1/1 |
| S3 | 1/1 | 1/1 | 1/1 |
| S4 | 1/1 | 1/1 | 1/1 |
| U44 | 1/1 | 1/1 | 1/1 |
| U45 | 1/1 | 1/1 | 1/1 |
| U46 | 1/1 | 1/1 | 1/1 |
| V37 | 1/1 | 1/1 | 1/1 |
| V38 | 1/1 | 1/1 | 1/1 |
| V39 | 1/1 | 1/1 | 1/1 |
| V40 | 1/1 | 1/1 | 1/1 |
| V41 | 1/1 | 1/1 | 1/1 |
| V42 | 1/1 | 1/1 | 1/1 |

## Checks that never passed anywhere

- all-113-names-in-order

## Selection rule

Default: screen/shipped
Deep mode: none

- screen/ovh-qwen38-27b: ineligible (zdr/no-training true, measured 8 %, exact repetition coverage true, complete judges 55/55, current clean source true)
- screen/ovh-qwen35-397b: ineligible (zdr/no-training true, measured 7 %, exact repetition coverage true, complete judges 55/55, current clean source true)
- screen/shipped: below the speed floor (wall p50 8.7 s, TTFT p50 7.7 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.3 credits per turn
- deep mode omitted: it would be the default arm
