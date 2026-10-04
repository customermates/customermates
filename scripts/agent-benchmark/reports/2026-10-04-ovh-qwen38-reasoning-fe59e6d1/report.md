# Agent benchmark report fe59e6d1-9ebc-48d6-9655-4cff008358c5

Generated 2026-10-04T19:54:07.903Z. Total spend $12.4014. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 19b0a5bb24feb0ed5adc7eb60566315954675353.

## Suite coverage

213 episodes across 71 distinct cases and 231 actual user turns (0 skipped).
198 episodes across 66 cases and 216 turns feed comparative quality metrics; 17 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| reasoning/shipped | 66 | 16/17 | 97.0 % | n/a | 4.63 | 55/55 | 10.9 % | $0.0152 | $0.0139 | 1.4 | $0.0156 | 98.5 % | 65.8 % | 0.0 % | 3.5 | 2.8 s | 7.2 s | 8.5 s | 23.7 s | 9.1 s | 25.0 s | 0.0 % | 0.0 % | N19 V41 |
| reasoning/ovh-qwen38-27b-low | 66 | 15/17 | 92.4 % | n/a | 4.68 | 55/55 | 10.9 % | $0.0460 | $0.0422 | 4.2 | $0.0498 | 6.1 % | 0.0 % | 0.0 % | 3.0 | 4.5 s | 20.9 s | 10.7 s | 33.6 s | 15.4 s | 47.5 s | 0.0 % | 0.0 % | C25 C26 C32 N19 V38 |
| reasoning/ovh-qwen38-27b-none | 66 | 16/17 | 87.9 % | n/a | 4.36 | 55/55 | 7.3 % | $0.0506 | $0.0464 | 4.6 | $0.0575 | 6.8 % | 0.0 % | 0.0 % | 3.5 | 2.4 s | 7.3 s | 7.5 s | 30.3 s | 13.3 s | 42.5 s | 0.0 % | 0.0 % | A2 B5 C25 C26 C36 H12 N20 V37 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn |
| --- | ---: | ---: | ---: | ---: |
| reasoning/shipped | $0.0001 | 0.5 % | 0.32 | 0.19 |
| reasoning/ovh-qwen38-27b-low | $0.0001 | 0.2 % | 0.24 | 0.18 |
| reasoning/ovh-qwen38-27b-none | $0.0001 | 0.1 % | 0.26 | 0.17 |

## Retrieval latency

| Arm | Corpus | Calls | Total p50 | Total p95 | Full-text p95 | Embedding p95 | Re-rank p95 | Embedding used | Embedding timeout | Re-rank used | Wiki re-rank calls/turn |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| reasoning/shipped | docs | 14 | 2.1 s | 3.9 s | 0.1 s | 1.1 s | 1.8 s | 100.0 % | 0.0 % | 100.0 % | 0.00 |
| reasoning/ovh-qwen38-27b-low | docs | 13 | 2.3 s | 3.3 s | 0.1 s | 3.0 s | 2.2 s | 76.9 % | 23.1 % | 100.0 % | 0.00 |
| reasoning/ovh-qwen38-27b-none | docs | 12 | 2.6 s | 3.3 s | 0.1 s | 2.7 s | 2.3 s | 83.3 % | 16.7 % | 75.0 % | 0.00 |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 165/165 | 4.52 |
| openai/gpt-5.6-sol | 165/165 | 4.59 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| reasoning/ovh-qwen38-27b-low vs reasoning/shipped | 66 | 1 | 4 | 61 | -4.5 pts | 0.375 | 0.375 | 0.063 |
| reasoning/ovh-qwen38-27b-none vs reasoning/shipped | 66 | 2 | 8 | 56 | -9.1 pts | 0.109 | 0.219 | 0.002 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | reasoning/shipped | reasoning/ovh-qwen38-27b-low | reasoning/ovh-qwen38-27b-none |
| --- | ---: | ---: | ---: |
| A1 | 1/1 | 1/1 | 1/1 |
| A2 | 1/1 | 1/1 | 0/1 |
| A3 | 1/1 | 1/1 | 1/1 |
| A4 | 1/1 | 1/1 | 1/1 |
| B1 | 1/1 | 1/1 | 1/1 |
| B2 | 1/1 | 1/1 | 1/1 |
| B3 | 1/1 | 1/1 | 1/1 |
| B4 | 1/1 | 1/1 | 1/1 |
| B5 | 1/1 | 1/1 | 0/1 |
| C25 | 1/1 | 0/1 | 0/1 |
| C26 | 1/1 | 0/1 | 0/1 |
| C27 | 1/1 | 1/1 | 1/1 |
| C28 | 1/1 | 1/1 | 1/1 |
| C29 | 1/1 | 1/1 | 1/1 |
| C30 | 1/1 | 1/1 | 1/1 |
| C31 | 1/1 | 1/1 | 1/1 |
| C32 | 1/1 | 0/1 | 1/1 |
| C33 | 1/1 | 1/1 | 1/1 |
| C34 | 1/1 | 1/1 | 1/1 |
| C35 | 1/1 | 1/1 | 1/1 |
| C36 | 1/1 | 1/1 | 0/1 |
| D1 | 1/1 | 1/1 | 1/1 |
| D10 | 1/1 | 1/1 | 1/1 |
| D2 | 1/1 | 1/1 | 1/1 |
| D3 | 1/1 | 1/1 | 1/1 |
| D4 | 1/1 | 1/1 | 1/1 |
| D5 | 1/1 | 1/1 | 1/1 |
| D6 | 1/1 | 1/1 | 1/1 |
| D7 | 1/1 | 1/1 | 1/1 |
| D8 | 1/1 | 1/1 | 1/1 |
| D9 | 1/1 | 1/1 | 1/1 |
| H10 | 1/1 | 1/1 | 1/1 |
| H11 | 1/1 | 1/1 | 1/1 |
| H12 | 1/1 | 1/1 | 0/1 |
| H9 | 1/1 | 1/1 | 1/1 |
| M5 | 1/1 | 1/1 | 1/1 |
| M6 | 1/1 | 1/1 | 1/1 |
| M7 | 1/1 | 1/1 | 1/1 |
| M8 | 1/1 | 1/1 | 1/1 |
| N13 | 1/1 | 1/1 | 1/1 |
| N14 | 1/1 | 1/1 | 1/1 |
| N15 | 1/1 | 1/1 | 1/1 |
| N16 | 1/1 | 1/1 | 1/1 |
| N17 | 1/1 | 1/1 | 1/1 |
| N18 | 1/1 | 1/1 | 1/1 |
| N19 | 0/1 | 0/1 | 1/1 |
| N20 | 1/1 | 1/1 | 0/1 |
| N21 | 1/1 | 1/1 | 1/1 |
| N22 | 1/1 | 1/1 | 1/1 |
| N23 | 1/1 | 1/1 | 1/1 |
| N24 | 1/1 | 1/1 | 1/1 |
| R43 | 1/1 | 1/1 | 1/1 |
| R47 | 1/1 | 1/1 | 1/1 |
| R48 | 1/1 | 1/1 | 1/1 |
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
| V37 | 1/1 | 1/1 | 0/1 |
| V38 | 1/1 | 0/1 | 1/1 |
| V39 | 1/1 | 1/1 | 1/1 |
| V40 | 1/1 | 1/1 | 1/1 |
| V41 | 0/1 | 1/1 | 1/1 |
| V42 | 1/1 | 0/1 | 1/1 |

## Checks that never passed anywhere

- none

## Selection rule

Default: reasoning/shipped
Deep mode: none

- reasoning/ovh-qwen38-27b-low: ineligible (zdr/no-training false, measured 6 %, exact repetition coverage true, complete judges 55/55, current clean source true)
- reasoning/ovh-qwen38-27b-none: ineligible (zdr/no-training false, measured 7 %, exact repetition coverage true, complete judges 55/55, current clean source true)
- reasoning/shipped: below the speed floor (wall p50 9.1 s, TTFT p50 8.5 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.4 credits per turn
- deep mode omitted: it would be the default arm
