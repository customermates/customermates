# Agent benchmark report 6ef5ab7d-c98d-4364-9487-ed6581d60423

Generated 2026-09-28T05:32:30.063Z. Total spend $0.3219. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source c0ea4608ef64637c1cbadc7770f0539f7e122978.

## Suite coverage

60 episodes across 1 distinct case and 60 actual user turns (0 skipped).
60 episodes across 1 case and 60 turns feed comparative quality metrics; 1 case is a strict release contract.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| docs-v2-jev/shipped | 30 | 30/30 | 100.0 % | 100.0 % | n/a | 0/30 | n/a | $0.0053 | $0.0053 | 1.0 | $0.0053 | 100.0 % | 84.1 % | 0.0 % | 3.0 | 1.4 s | 2.0 s | 4.0 s | 4.8 s | 4.5 s | 5.4 s | 0.0 % | 0.0 % | - |
| off/shipped | 30 | 30/30 | 100.0 % | 100.0 % | n/a | 0/30 | n/a | $0.0055 | $0.0055 | 1.0 | $0.0055 | 100.0 % | 82.1 % | 0.0 % | 3.0 | 1.3 s | 2.5 s | 4.0 s | 6.0 s | 4.5 s | 6.4 s | 0.0 % | 0.0 % | - |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn | Turns with toolset preload |
| --- | ---: | ---: | ---: | ---: | ---: |
| docs-v2-jev/shipped | $0.0000 | 0.0 % | 0.00 | 0.00 | 0.0 % |
| off/shipped | $0.0000 | 0.0 % | 0.00 | 0.00 | 0.0 % |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| off/shipped vs docs-v2-jev/shipped | 1 | 0 | 0 | 1 | 0.0 pts | 1.000 | 1.000 | 1.000 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | docs-v2-jev/shipped | off/shipped |
| --- | ---: | ---: |
| M8 | 30/30 | 30/30 |

## Checks that never passed anywhere

- none

## Selection rule

Default: none
Deep mode: none

- docs-v2-jev/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage true, complete judges 0/30, current clean source true)
- off/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage true, complete judges 0/30, current clean source true)
- no eligible arm
