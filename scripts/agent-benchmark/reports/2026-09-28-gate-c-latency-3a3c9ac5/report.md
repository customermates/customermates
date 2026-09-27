# Agent benchmark report 3a3c9ac5-aa6d-42ac-a248-c210b600bd4c

Generated 2026-09-27T23:42:02.516Z. Total spend $3.1206. Arms are keyed runtime/arm.
Cohort: schema 5, fixture chat-benchmark-fixture-v7, source 39d96b640fe1fe4be889482a876befbcadcb1de7.

## Suite coverage

540 episodes across 40 distinct cases and 540 actual user turns (0 skipped).
540 episodes across 40 cases and 540 turns feed comparative quality metrics; 0 cases are strict release contracts.

## Merge check

Not evaluated for this campaign.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | Judge split | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | First output p50 | First output p95 | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Incomplete turns | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| guard-wordlists/shipped | 300 | 0/0 | 100.0 % | 100.0 % | n/a | 0/0 | n/a | $0.0054 | $0.0054 | 1.0 | $0.0054 | 100.0 % | 90.2 % | 0.0 % | 3.0 | 1.7 s | 2.5 s | 5.2 s | 7.9 s | 5.6 s | 8.3 s | 0.0 % | 0.0 % | - |
| docs-v2-jev/shipped | 120 | 0/0 | 97.5 % | 96.7 % | n/a | 0/0 | n/a | $0.0055 | $0.0055 | 1.0 | $0.0056 | 90.0 % | 88.6 % | 0.0 % | 2.8 | 1.8 s | 2.9 s | 5.9 s | 10.3 s | 6.8 s | 11.0 s | 0.0 % | 0.0 % | - |
| off/shipped | 120 | 0/0 | 96.7 % | 96.7 % | n/a | 0/0 | n/a | $0.0062 | $0.0062 | 1.1 | $0.0065 | 100.0 % | 87.8 % | 0.0 % | 3.5 | 1.7 s | 3.0 s | 5.6 s | 10.7 s | 6.4 s | 11.5 s | 0.0 % | 0.0 % | DH14 |

## Classifier

| Arm | Classifier $/turn | Classifier cost share | Docs tool calls/turn | Docs re-rank calls/turn | Turns with toolset preload |
| --- | ---: | ---: | ---: | ---: | ---: |
| guard-wordlists/shipped | $0.0000 | 0.0 % | 0.01 | 0.00 | 0.0 % |
| docs-v2-jev/shipped | $0.0003 | 5.3 % | 1.57 | 1.57 | 0.0 % |
| off/shipped | $0.0000 | 0.0 % | 2.19 | 0.00 | 0.0 % |

## Judges

| Judge | Judged | Mean |
| --- | ---: | ---: |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| off/shipped vs docs-v2-jev/shipped | 30 | 0 | 1 | 29 | -0.8 pts | 1.000 | 1.000 | 1.000 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | guard-wordlists/shipped | docs-v2-jev/shipped | off/shipped |
| --- | ---: | ---: | ---: |
| DH01 | - | 4/4 | 4/4 |
| DH02 | - | 4/4 | 4/4 |
| DH03 | - | 4/4 | 4/4 |
| DH04 | - | 4/4 | 4/4 |
| DH05 | - | 4/4 | 4/4 |
| DH06 | - | 4/4 | 4/4 |
| DH07 | - | 4/4 | 4/4 |
| DH08 | - | 4/4 | 4/4 |
| DH09 | - | 4/4 | 4/4 |
| DH10 | - | 4/4 | 4/4 |
| DH11 | - | 4/4 | 4/4 |
| DH12 | - | 4/4 | 4/4 |
| DH13 | - | 4/4 | 4/4 |
| DH14 | - | 1/4 | 0/4 |
| DH15 | - | 4/4 | 4/4 |
| DH16 | - | 4/4 | 4/4 |
| DH17 | - | 4/4 | 4/4 |
| DH18 | - | 4/4 | 4/4 |
| DH19 | - | 4/4 | 4/4 |
| DH20 | - | 4/4 | 4/4 |
| DH21 | - | 4/4 | 4/4 |
| DH22 | - | 4/4 | 4/4 |
| DH23 | - | 4/4 | 4/4 |
| DH24 | - | 4/4 | 4/4 |
| DH25 | - | 4/4 | 4/4 |
| DH26 | - | 4/4 | 4/4 |
| DH27 | - | 4/4 | 4/4 |
| DH28 | - | 4/4 | 4/4 |
| DH29 | - | 4/4 | 4/4 |
| DH30 | - | 4/4 | 4/4 |
| GC01 | 30/30 | - | - |
| GC02 | 30/30 | - | - |
| GC03 | 30/30 | - | - |
| GC04 | 30/30 | - | - |
| GC05 | 30/30 | - | - |
| GC06 | 30/30 | - | - |
| GC07 | 30/30 | - | - |
| GC08 | 30/30 | - | - |
| GC09 | 30/30 | - | - |
| GC10 | 30/30 | - | - |

## Checks that never passed anywhere

- none

## Selection rule

Default: none
Deep mode: none

- guard-wordlists/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage true, complete judges 0/0, current clean source true)
- docs-v2-jev/shipped: ineligible (zdr/no-training true, measured 90 %, exact repetition coverage false, complete judges 0/0, current clean source true)
- off/shipped: ineligible (zdr/no-training true, measured 100 %, exact repetition coverage false, complete judges 0/0, current clean source true)
- no eligible arm
