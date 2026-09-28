# Agent benchmark report 73388be7-1c8d-46c0-ab05-a99ffc3906a4

Generated 2026-09-27T08:01:27.725Z. Total spend $6.2573. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source e3bccaaf9d407296f4efa2a48900bd15e5716fcf.

## Suite coverage

200 episodes across 62 distinct cases and 228 actual user turns (0 skipped).
182 episodes across 56 cases and 207 turns feed comparative quality metrics; 18 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| final/shipped | 168 | 54/54 | 96.4 % | 92.9 % | 4.60 | 135/135 | 15.6 % | $0.0122 | $0.0110 | 1.6 | $0.0127 | 98.2 % | 71.8 % | 0.0 % | 3.2 | 2.0 s | 3.8 s | 5.8 s | 12.1 s | 6.4 s | 13.2 s | 0.0 % | 0.0 % | - |
| final-extra/shipped | 14 | 0/0 | 92.9 % | 100.0 % | 4.41 | 14/14 | 42.9 % | $0.0212 | $0.0142 | 1.9 | $0.0229 | 100.0 % | 70.1 % | 0.0 % | 3.4 | 2.6 s | 3.7 s | 8.2 s | 12.9 s | 8.6 s | 13.7 s | 0.0 % | 0.0 % | - |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |
| anthropic/claude-opus-5 | 149/149 | 4.39 |
| openai/gpt-5.6-sol | 149/149 | 4.78 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | final/shipped | final-extra/shipped |
| --- | ---: | ---: |
| A1 | 3/3 | - |
| A2 | 3/3 | - |
| A3 | 3/3 | - |
| A4 | 2/3 | - |
| B1 | 3/3 | - |
| B2 | 3/3 | - |
| B3 | 3/3 | - |
| B4 | 3/3 | - |
| B5 | 3/3 | - |
| C25 | 3/3 | - |
| C26 | 3/3 | - |
| C27 | 3/3 | - |
| C28 | 3/3 | - |
| C29 | 3/3 | - |
| C30 | 3/3 | - |
| C31 | 3/3 | - |
| C32 | 3/3 | - |
| C33 | 3/3 | - |
| C34 | 3/3 | - |
| C35 | 3/3 | - |
| C36 | 1/3 | 6/7 |
| H10 | 3/3 | - |
| H11 | 3/3 | - |
| H12 | 2/3 | - |
| H9 | 3/3 | - |
| M5 | 3/3 | - |
| M6 | 3/3 | - |
| M7 | 3/3 | - |
| M8 | 3/3 | - |
| N13 | 3/3 | - |
| N14 | 1/3 | 7/7 |
| N15 | 3/3 | - |
| N16 | 3/3 | - |
| N17 | 3/3 | - |
| N18 | 3/3 | - |
| N19 | 3/3 | - |
| N20 | 3/3 | - |
| N21 | 3/3 | - |
| N22 | 3/3 | - |
| N23 | 3/3 | - |
| N24 | 3/3 | - |
| R43 | 3/3 | - |
| R47 | 3/3 | - |
| R48 | 3/3 | - |
| R49 | 3/3 | - |
| R50 | 3/3 | - |
| R51 | 3/3 | - |
| R52 | 3/3 | - |
| R53 | 3/3 | - |
| S1 | 3/3 | - |
| S2 | 3/3 | - |
| S3 | 3/3 | - |
| S4 | 3/3 | - |
| U44 | 3/3 | - |
| U45 | 3/3 | - |
| U46 | 3/3 | - |
| V37 | 3/3 | - |
| V38 | 3/3 | - |
| V39 | 3/3 | - |
| V40 | 3/3 | - |
| V41 | 3/3 | - |
| V42 | 3/3 | - |

## Checks that never passed anywhere

- none

## Selection rule

Default: final/shipped
Deep mode: none

- final-extra/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage false, complete judges 14/14, current clean source true)
- final/shipped: below the speed floor (wall p50 6.4 s, TTFT p50 5.8 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.6 credits per turn
- deep mode omitted: it would be the default arm
