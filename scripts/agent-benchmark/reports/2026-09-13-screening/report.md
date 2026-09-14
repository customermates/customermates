# Agent benchmark report 84f35c36-00ce-4aca-b54e-701508ff1d33

Generated 2026-09-13T23:25:21.534Z. Total spend $14.0320. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| v2/luna-medium | 8 | 100.0 % | 0.0 % | 4.52 | $0.0083 | $0.0074 | 1.2 | $0.0083 | 100.0 % | 81.9 % | 18.1 % | 5.1 | 35.0 s | 53.2 s | 35.9 s | 53.7 s | 0.0 % | - |
| v2/glm53-flash-high | 8 | 100.0 % | 0.0 % | 4.72 | $0.0087 | $0.0078 | 1.2 | $0.0087 | 100.0 % | 83.0 % | 0.0 % | 5.8 | 5.3 s | 23.5 s | 7.1 s | 24.1 s | 0.0 % | - |
| v2/gpt5-mini-low | 8 | 100.0 % | 0.0 % | 4.39 | $0.0090 | $0.0080 | 1.3 | $0.0090 | 100.0 % | 84.0 % | 0.0 % | 4.8 | 31.5 s | 54.0 s | 32.4 s | 54.5 s | 0.0 % | - |
| v2/flash-lite-low | 8 | 100.0 % | 0.0 % | 4.47 | $0.0163 | $0.0145 | 2.0 | $0.0163 | 100.0 % | 60.6 % | 0.0 % | 4.8 | 6.8 s | 14.4 s | 7.0 s | 14.8 s | 0.0 % | - |
| v2/shipped | 8 | 100.0 % | 0.0 % | 4.41 | $0.0169 | $0.0150 | 2.0 | $0.0169 | 100.0 % | 55.4 % | 0.0 % | 4.9 | 4.5 s | 11.8 s | 4.8 s | 17.2 s | 2.3 % | - |
| v2/flash-lite-medium | 8 | 100.0 % | 0.0 % | 4.43 | $0.0177 | $0.0157 | 2.1 | $0.0177 | 100.0 % | 68.7 % | 0.0 % | 4.8 | 6.5 s | 17.1 s | 6.6 s | 19.3 s | 0.0 % | - |
| v2/flash-lite-high | 8 | 100.0 % | 0.0 % | 4.46 | $0.0214 | $0.0190 | 2.6 | $0.0214 | 100.0 % | 64.5 % | 0.0 % | 4.9 | 9.4 s | 20.8 s | 9.7 s | 23.1 s | 0.0 % | - |
| v2/flash-medium | 8 | 100.0 % | 0.0 % | 4.55 | $0.0951 | $0.0845 | 8.8 | $0.0951 | 100.0 % | 72.7 % | 0.0 % | 5.2 | 11.9 s | 50.6 s | 12.4 s | 52.9 s | 0.0 % | - |
| v2/sonnet5-medium | 8 | 100.0 % | 0.0 % | 4.64 | $0.1127 | $0.1002 | 10.3 | $0.1127 | 100.0 % | 83.2 % | 16.8 % | 3.9 | 9.6 s | 48.4 s | 17.2 s | 53.3 s | 0.0 % | - |
| v2/glm53-flash-low | 8 | 87.5 % | 0.0 % | 4.45 | $0.0054 | $0.0048 | 1.0 | $0.0062 | 100.0 % | 87.7 % | 0.0 % | 4.3 | 4.0 s | 10.9 s | 6.1 s | 14.8 s | 0.0 % | M7 |
| v2/flash-lite31-low | 8 | 87.5 % | 0.0 % | 4.23 | $0.0105 | $0.0093 | 1.3 | $0.0120 | 100.0 % | 72.0 % | 0.0 % | 5.1 | 7.1 s | 29.6 s | 7.7 s | 29.9 s | 0.0 % | C36 |
| v2/flash-low | 8 | 87.5 % | 0.0 % | 4.49 | $0.0755 | $0.0671 | 7.1 | $0.0863 | 100.0 % | 71.6 % | 0.0 % | 5.0 | 9.2 s | 24.1 s | 9.8 s | 30.2 s | 0.0 % | C25 |
| v2/sol-low | 8 | 87.5 % | 0.0 % | 4.65 | $0.2122 | $0.1886 | 19.3 | $0.2425 | 100.0 % | 78.6 % | 21.3 % | 4.2 | 25.4 s | 75.2 s | 26.5 s | 75.9 s | 0.0 % | C25 |
| v2/gpt54-nano-low | 8 | 75.0 % | 0.0 % | 4.10 | $0.0051 | $0.0045 | 1.0 | $0.0068 | 100.0 % | 91.1 % | 0.0 % | 4.8 | 23.5 s | 58.4 s | 25.0 s | 58.8 s | 0.0 % | C25 M7 |
| v2/luna-low | 8 | 75.0 % | 0.0 % | 3.76 | $0.0079 | $0.0070 | 1.1 | $0.0105 | 100.0 % | 74.8 % | 25.2 % | 4.0 | 21.1 s | 33.8 s | 21.7 s | 34.7 s | 0.0 % | C36 M7 |
| v2/deepseek-flash-high | 8 | 75.0 % | 0.0 % | 4.21 | $0.0205 | $0.0182 | 2.2 | $0.0273 | 100.0 % | 0.0 % | 0.0 % | 3.7 | 4.8 s | 24.1 s | 28.0 s | 36.4 s | 0.0 % | C25 C36 |
| v2/gpt54-mini-low | 8 | 75.0 % | 0.0 % | 3.86 | $0.0233 | $0.0207 | 2.6 | $0.0310 | 100.0 % | 83.9 % | 0.0 % | 4.6 | 26.4 s | 39.8 s | 26.9 s | 40.4 s | 0.0 % | C25 C36 |
| v2/glm53-low | 8 | 75.0 % | 0.0 % | 3.96 | $0.0310 | $0.0275 | 3.1 | $0.0413 | 87.5 % | 98.7 % | 0.0 % | 31.0 | 10.3 s | 24.4 s | 22.6 s | 39.5 s | 0.0 % | C25 C33 |
| v2/flash36-low | 8 | 75.0 % | 0.0 % | 4.58 | $0.0342 | $0.0304 | 3.6 | $0.0456 | 100.0 % | 57.6 % | 0.0 % | 4.2 | 5.9 s | 14.4 s | 6.4 s | 19.1 s | 0.0 % | C25 C36 |
| v2/flash38-low | 8 | 75.0 % | 0.0 % | 4.60 | $0.0351 | $0.0312 | 3.7 | $0.0468 | 100.0 % | 66.5 % | 0.0 % | 5.4 | 11.3 s | 30.7 s | 12.1 s | 32.1 s | 0.0 % | C25 C36 |
| v2/haiku45 | 8 | 75.0 % | 0.0 % | 4.10 | $0.0421 | $0.0374 | 4.3 | $0.0561 | 100.0 % | 82.4 % | 17.6 % | 3.8 | 1.5 s | 1.9 s | 9.4 s | 17.1 s | 0.0 % | C36 M7 |
| v2/kimi-k27-code | 8 | 75.0 % | 0.0 % | 3.21 | $0.0455 | $0.0404 | 4.8 | $0.0606 | 100.0 % | 96.4 % | 0.0 % | 8.4 | 2.9 s | 22.3 s | 17.4 s | 114.0 s | 0.0 % | C33 C36 |
| v2/terra-low | 8 | 75.0 % | 0.0 % | 4.30 | $0.0906 | $0.0805 | 8.7 | $0.1207 | 100.0 % | 73.7 % | 26.3 % | 4.2 | 19.3 s | 56.3 s | 21.4 s | 56.8 s | 0.0 % | C25 M7 |
| v2/sonnet5-low | 8 | 75.0 % | 0.0 % | 3.90 | $0.0996 | $0.0885 | 9.2 | $0.1328 | 100.0 % | 81.2 % | 18.8 % | 3.3 | 8.2 s | 20.4 s | 9.9 s | 46.4 s | 0.0 % | C36 M7 |
| v2/qwen3-coder-next | 8 | 75.0 % | 0.0 % | 4.09 | $0.1300 | $0.1155 | 12.0 | $0.1733 | 100.0 % | 0.0 % | 0.0 % | 7.4 | 2.4 s | 21.2 s | 50.8 s | 283.2 s | 0.0 % | M7 S1 |
| v2/opus5-low | 8 | 75.0 % | 0.0 % | 4.53 | $0.2707 | $0.2406 | 24.8 | $0.3609 | 100.0 % | 83.5 % | 16.5 % | 4.0 | 3.3 s | 16.5 s | 14.4 s | 25.1 s | 0.0 % | C25 M7 |
| current/shipped | 8 | 62.5 % | 0.0 % | 3.81 | $0.0166 | $0.0148 | 2.0 | $0.0266 | 87.5 % | 79.0 % | 0.0 % | 4.9 | 5.4 s | 11.5 s | 5.6 s | 12.0 s | 0.0 % | C25 C36 M7 |
| v2/mistral-large-3 | 8 | 62.5 % | 0.0 % | 3.48 | $0.0507 | $0.0450 | 5.1 | $0.0811 | 100.0 % | 23.1 % | 0.0 % | 4.1 | 6.0 s | 39.9 s | 9.6 s | 43.9 s | 0.0 % | C25 C36 M7 |
| v2/deepseek-pro-high | 8 | 62.5 % | 0.0 % | 4.40 | $0.2289 | $0.2035 | 20.9 | $0.3663 | 100.0 % | 0.0 % | 0.0 % | 4.2 | 7.8 s | 22.5 s | 27.0 s | 49.4 s | 0.0 % | C25 M7 S1 |
| v2/nano-low | 8 | 50.0 % | 0.0 % | 2.96 | $0.0029 | $0.0026 | 1.0 | $0.0059 | 100.0 % | 93.2 % | 0.0 % | 5.8 | 35.6 s | 106.9 s | 36.2 s | 107.3 s | 0.0 % | C25 C36 M7 S1 |
| v2/luna-none | 8 | 50.0 % | 0.0 % | 3.79 | $0.0097 | $0.0087 | 1.3 | $0.0195 | 100.0 % | 80.5 % | 19.5 % | 5.9 | 17.6 s | 43.1 s | 18.1 s | 45.0 s | 0.0 % | C25 C36 M7 S1 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v2/deepseek-flash-high vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/deepseek-pro-high vs current/shipped | 8 | 1 | 1 | 6 | 0.0 pts | 1.000 | 1.000 | 0.500 |
| v2/flash-lite-high vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/flash-lite-low vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/flash-lite-medium vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/flash-lite31-low vs current/shipped | 8 | 2 | 0 | 6 | 25.0 pts | 0.500 | 1.000 | 0.500 |
| v2/flash-low vs current/shipped | 8 | 2 | 0 | 6 | 25.0 pts | 0.500 | 1.000 | 0.500 |
| v2/flash-medium vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/flash36-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/flash38-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/glm53-flash-high vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/glm53-flash-low vs current/shipped | 8 | 2 | 0 | 6 | 25.0 pts | 0.500 | 1.000 | 0.500 |
| v2/glm53-low vs current/shipped | 8 | 2 | 1 | 5 | 12.5 pts | 1.000 | 1.000 | 0.250 |
| v2/gpt5-mini-low vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/gpt54-mini-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/gpt54-nano-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/haiku45 vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/kimi-k27-code vs current/shipped | 8 | 2 | 1 | 5 | 12.5 pts | 1.000 | 1.000 | 0.250 |
| v2/luna-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/luna-medium vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/luna-none vs current/shipped | 8 | 0 | 1 | 7 | -12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/mistral-large-3 vs current/shipped | 8 | 0 | 0 | 8 | 0.0 pts | 1.000 | 1.000 | 1.000 |
| v2/nano-low vs current/shipped | 8 | 0 | 1 | 7 | -12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/opus5-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/qwen3-coder-next vs current/shipped | 8 | 2 | 1 | 5 | 12.5 pts | 1.000 | 1.000 | 0.250 |
| v2/shipped vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/sol-low vs current/shipped | 8 | 2 | 0 | 6 | 25.0 pts | 0.500 | 1.000 | 0.500 |
| v2/sonnet5-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |
| v2/sonnet5-medium vs current/shipped | 8 | 3 | 0 | 5 | 37.5 pts | 0.250 | 1.000 | 0.250 |
| v2/terra-low vs current/shipped | 8 | 1 | 0 | 7 | 12.5 pts | 1.000 | 1.000 | 1.000 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | v2/luna-medium | v2/glm53-flash-high | v2/gpt5-mini-low | v2/flash-lite-low | v2/shipped | v2/flash-lite-medium | v2/flash-lite-high | v2/flash-medium | v2/sonnet5-medium | v2/glm53-flash-low | v2/flash-lite31-low | v2/flash-low | v2/sol-low | v2/gpt54-nano-low | v2/luna-low | v2/deepseek-flash-high | v2/gpt54-mini-low | v2/glm53-low | v2/flash36-low | v2/flash38-low | v2/haiku45 | v2/kimi-k27-code | v2/terra-low | v2/sonnet5-low | v2/qwen3-coder-next | v2/opus5-low | current/shipped | v2/mistral-large-3 | v2/deepseek-pro-high | v2/nano-low | v2/luna-none |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C25 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| C33 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| C36 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 |
| H9 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| M5 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| M7 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| N22 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| S1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 |

## Checks that never passed anywhere

- none

## Selection rule

Default: v2/glm53-flash-high
Deep mode: none

- v2/glm53-low: ineligible (zdr/no-training true, measured 88 %, episodes 8)
- current/shipped: ineligible (zdr/no-training true, measured 88 %, episodes 8)
- v2/gpt5-mini-low: below the quality floor (pass 100.0 % vs best 100.0 %, judge 4.39 vs 4.72, never solved -)
- v2/shipped: below the quality floor (pass 100.0 % vs best 100.0 %, judge 4.41 vs 4.72, never solved -)
- v2/glm53-flash-low: below the quality floor (pass 87.5 % vs best 100.0 %, judge 4.45 vs 4.72, never solved M7)
- v2/flash-lite31-low: below the quality floor (pass 87.5 % vs best 100.0 %, judge 4.23 vs 4.72, never solved C36)
- v2/flash-low: below the quality floor (pass 87.5 % vs best 100.0 %, judge 4.49 vs 4.72, never solved C25)
- v2/sol-low: below the quality floor (pass 87.5 % vs best 100.0 %, judge 4.65 vs 4.72, never solved C25)
- v2/gpt54-nano-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.10 vs 4.72, never solved C25 M7)
- v2/luna-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 3.76 vs 4.72, never solved C36 M7)
- v2/deepseek-flash-high: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.21 vs 4.72, never solved C25 C36)
- v2/gpt54-mini-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 3.86 vs 4.72, never solved C25 C36)
- v2/flash36-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.58 vs 4.72, never solved C25 C36)
- v2/flash38-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.60 vs 4.72, never solved C25 C36)
- v2/haiku45: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.10 vs 4.72, never solved C36 M7)
- v2/kimi-k27-code: below the quality floor (pass 75.0 % vs best 100.0 %, judge 3.21 vs 4.72, never solved C33 C36)
- v2/terra-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.30 vs 4.72, never solved C25 M7)
- v2/sonnet5-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 3.90 vs 4.72, never solved C36 M7)
- v2/qwen3-coder-next: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.09 vs 4.72, never solved M7 S1)
- v2/opus5-low: below the quality floor (pass 75.0 % vs best 100.0 %, judge 4.53 vs 4.72, never solved C25 M7)
- v2/mistral-large-3: below the quality floor (pass 62.5 % vs best 100.0 %, judge 3.48 vs 4.72, never solved C25 C36 M7)
- v2/deepseek-pro-high: below the quality floor (pass 62.5 % vs best 100.0 %, judge 4.40 vs 4.72, never solved C25 M7 S1)
- v2/nano-low: below the quality floor (pass 50.0 % vs best 100.0 %, judge 2.96 vs 4.72, never solved C25 C36 M7 S1)
- v2/luna-none: below the quality floor (pass 50.0 % vs best 100.0 %, judge 3.79 vs 4.72, never solved C25 C36 M7 S1)
- v2/luna-medium: below the speed floor (wall p50 35.9 s, TTFT p50 35.0 s)
- v2/glm53-flash-high: below the speed floor (wall p50 7.1 s, TTFT p50 5.3 s)
- v2/flash-lite-low: below the speed floor (wall p50 7.0 s, TTFT p50 6.8 s)
- v2/flash-lite-medium: below the speed floor (wall p50 6.6 s, TTFT p50 6.5 s)
- v2/flash-lite-high: below the speed floor (wall p50 9.7 s, TTFT p50 9.4 s)
- v2/flash-medium: below the speed floor (wall p50 12.4 s, TTFT p50 11.9 s)
- v2/sonnet5-medium: below the speed floor (wall p50 17.2 s, TTFT p50 9.6 s)
- no other arm passes the quality floor; the best arm ships because it costs 1.2 credits per turn
- deep mode omitted: it would be the default arm
