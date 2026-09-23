# Agent benchmark report 22474ad6-0d83-4ca3-a008-3c117ca94908

Generated 2026-09-23T16:18:11.658Z. Total spend $0.6791. Arms are keyed runtime/arm.
Cohort: schema 4, fixture chat-benchmark-fixture-v4, source d45fadeed6f8d6753bc6ef334231e45461573b08.

## Arms

| Arm | Comparable episodes | Strict contracts passed | Pass | Pass^3 | Judge | Judge coverage | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| pr182-unified-final/shipped | 41 (+7 skipped) | 10/17 | 90.2 % | n/a | n/a | 0/34 | $0.0161 | $0.0143 | 1.8 | $0.0178 | 97.6 % | 65.1 % | 0.0 % | 3.8 | 8.6 s | 21.2 s | 9.1 s | 22.3 s | 0.0 % | H10 H12 N13 N14 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | pr182-unified-final/shipped |
| --- | ---: |
| C25 | 1/1 |
| C26 | 1/1 |
| C27 | 1/1 |
| C28 | 1/1 |
| C29 | 1/1 |
| C30 | 1/1 |
| C31 | 1/1 |
| C32 | 1/1 |
| C33 | 1/1 |
| C34 | 1/1 |
| C35 | 1/1 |
| C36 | 1/1 |
| H10 | 0/1 |
| H11 | 1/1 |
| H12 | 0/1 |
| H9 | 1/1 |
| M5 | 1/1 |
| M6 | 1/1 |
| M7 | 1/1 |
| M8 | 0/0 |
| N13 | 0/1 |
| N14 | 0/1 |
| N15 | 1/1 |
| N16 | 1/1 |
| N17 | 1/1 |
| N18 | 1/1 |
| N19 | 1/1 |
| N20 | 1/1 |
| N21 | 1/1 |
| N22 | 1/1 |
| N23 | 1/1 |
| N24 | 0/0 |
| R43 | 0/1 |
| R47 | 1/1 |
| R48 | 1/1 |
| R49 | 1/1 |
| R50 | 1/1 |
| R51 | 0/0 |
| R52 | 1/1 |
| S1 | 1/1 |
| S2 | 1/1 |
| S3 | 1/1 |
| S4 | 1/1 |
| U44 | 0/0 |
| U45 | 0/0 |
| U46 | 0/0 |
| V37 | 1/1 |
| V38 | 1/1 |
| V39 | 1/1 |
| V40 | 1/1 |
| V41 | 1/1 |
| V42 | 0/0 |

## Checks that never passed anywhere

- none

## Skipped episodes

- pr182-unified-final/shipped M8 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: Approval 0e42f4b9-7767-433d-8bc0-40d7e530959b:call_97333 did not resume its workflow hook.
- pr182-unified-final/shipped N24 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: Approval f6c2df28-3858-4a55-a8b9-48d4fb02eb88:call_111566 did not resume its workflow hook.
- pr182-unified-final/shipped R51 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: Approval 40c6a584-18b6-4f63-b278-453a714f3e5f:call_102432 did not resume its workflow hook.
- pr182-unified-final/shipped U44 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: UI command call_127729 did not resume its workflow hook.
- pr182-unified-final/shipped U45 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: UI command call_149668 did not resume its workflow hook.
- pr182-unified-final/shipped U46 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: UI command call_94732 did not resume its workflow hook.
- pr182-unified-final/shipped V42 r1: the benchmark responder failed, so this episode observes the harness and not the assistant: Approval 0106cdbd-efd7-4fcc-88f8-b6ca4cc75a31:call_131520 did not resume its workflow hook.
