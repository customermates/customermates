# Agent benchmark report 84f35c36-00ce-4aca-b54e-701508ff1d33

Generated 2026-09-14T06:53:19.817Z. Total spend $41.6912. Arms are keyed runtime/arm.

## Arms

| Arm | Episodes | Pass | Pass^3 | Judge | $/episode | $/turn | Credits/turn | $/success | Measured | Cache read | Cache write | Rounds/turn | TTFT p50 | TTFT p95 | Wall p50 | Wall p95 | Length stops | Never solved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| v2/gpt5-mini-low | 8 | 100.0 % | 0.0 % | 4.39 | $0.0090 | $0.0080 | 1.3 | $0.0090 | 100.0 % | 84.0 % | 0.0 % | 4.8 | 31.5 s | 54.0 s | 32.4 s | 54.5 s | 0.0 % | - |
| v2/flash-lite-medium | 8 | 100.0 % | 0.0 % | 4.43 | $0.0177 | $0.0157 | 2.1 | $0.0177 | 100.0 % | 68.7 % | 0.0 % | 4.8 | 6.5 s | 17.1 s | 6.6 s | 19.3 s | 0.0 % | - |
| v2/flash-lite-high | 8 | 100.0 % | 0.0 % | 4.46 | $0.0214 | $0.0190 | 2.6 | $0.0214 | 100.0 % | 64.5 % | 0.0 % | 4.9 | 9.4 s | 20.8 s | 9.7 s | 23.1 s | 0.0 % | - |
| v2/glm53-flash-low | 8 | 87.5 % | 0.0 % | 4.32 | $0.0054 | $0.0048 | 1.0 | $0.0062 | 100.0 % | 87.7 % | 0.0 % | 4.3 | 4.0 s | 10.9 s | 6.1 s | 14.8 s | 0.0 % | M7 |
| v2/flash-lite31-low | 8 | 87.5 % | 0.0 % | 4.29 | $0.0105 | $0.0093 | 1.3 | $0.0120 | 100.0 % | 72.0 % | 0.0 % | 5.1 | 7.1 s | 29.6 s | 7.7 s | 29.9 s | 0.0 % | C36 |
| v2/flash-low | 8 | 87.5 % | 0.0 % | 4.49 | $0.0755 | $0.0671 | 7.1 | $0.0863 | 100.0 % | 71.6 % | 0.0 % | 5.0 | 9.2 s | 24.1 s | 9.8 s | 30.2 s | 0.0 % | C25 |
| v2/sol-low | 8 | 87.5 % | 0.0 % | 4.65 | $0.2122 | $0.1886 | 19.3 | $0.2425 | 100.0 % | 78.6 % | 21.3 % | 4.2 | 25.4 s | 75.2 s | 26.5 s | 75.9 s | 0.0 % | C25 |
| v2/gpt54-nano-low | 8 | 75.0 % | 0.0 % | 3.96 | $0.0051 | $0.0045 | 1.0 | $0.0068 | 100.0 % | 91.1 % | 0.0 % | 4.8 | 23.5 s | 58.4 s | 25.0 s | 58.8 s | 0.0 % | C25 M7 |
| v2/luna-low | 8 | 75.0 % | 0.0 % | 3.77 | $0.0079 | $0.0070 | 1.1 | $0.0105 | 100.0 % | 74.8 % | 25.2 % | 4.0 | 21.1 s | 33.8 s | 21.7 s | 34.7 s | 0.0 % | C36 M7 |
| v2/deepseek-flash-high | 8 | 75.0 % | 0.0 % | 4.21 | $0.0205 | $0.0182 | 2.2 | $0.0273 | 100.0 % | 0.0 % | 0.0 % | 3.7 | 4.8 s | 24.1 s | 28.0 s | 36.4 s | 0.0 % | C25 C36 |
| v2/gpt54-mini-low | 8 | 75.0 % | 0.0 % | 3.89 | $0.0233 | $0.0207 | 2.6 | $0.0310 | 100.0 % | 83.9 % | 0.0 % | 4.6 | 26.4 s | 39.8 s | 26.9 s | 40.4 s | 0.0 % | C25 C36 |
| v2/glm53-low | 8 | 75.0 % | 0.0 % | 3.97 | $0.0310 | $0.0275 | 3.1 | $0.0413 | 87.5 % | 98.7 % | 0.0 % | 31.0 | 10.3 s | 24.4 s | 22.6 s | 39.5 s | 0.0 % | C25 C33 |
| v2/flash36-low | 8 | 75.0 % | 0.0 % | 4.58 | $0.0342 | $0.0304 | 3.6 | $0.0456 | 100.0 % | 57.6 % | 0.0 % | 4.2 | 5.9 s | 14.4 s | 6.4 s | 19.1 s | 0.0 % | C25 C36 |
| v2/flash38-low | 8 | 75.0 % | 0.0 % | 4.61 | $0.0351 | $0.0312 | 3.7 | $0.0468 | 100.0 % | 66.5 % | 0.0 % | 5.4 | 11.3 s | 30.7 s | 12.1 s | 32.1 s | 0.0 % | C25 C36 |
| v2/haiku45 | 8 | 75.0 % | 0.0 % | 4.17 | $0.0421 | $0.0374 | 4.3 | $0.0561 | 100.0 % | 82.4 % | 17.6 % | 3.8 | 1.5 s | 1.9 s | 9.4 s | 17.1 s | 0.0 % | C36 M7 |
| v2/kimi-k27-code | 8 | 75.0 % | 0.0 % | 3.28 | $0.0455 | $0.0404 | 4.8 | $0.0606 | 100.0 % | 96.4 % | 0.0 % | 8.4 | 2.9 s | 22.3 s | 17.4 s | 114.0 s | 0.0 % | C33 C36 |
| v2/terra-low | 8 | 75.0 % | 0.0 % | 4.30 | $0.0906 | $0.0805 | 8.7 | $0.1207 | 100.0 % | 73.7 % | 26.3 % | 4.2 | 19.3 s | 56.3 s | 21.4 s | 56.8 s | 0.0 % | C25 M7 |
| v2/sonnet5-low | 8 | 75.0 % | 0.0 % | 3.89 | $0.0996 | $0.0885 | 9.2 | $0.1328 | 100.0 % | 81.2 % | 18.8 % | 3.3 | 8.2 s | 20.4 s | 9.9 s | 46.4 s | 0.0 % | C36 M7 |
| v2/qwen3-coder-next | 8 | 75.0 % | 0.0 % | 4.01 | $0.1300 | $0.1155 | 12.0 | $0.1733 | 100.0 % | 0.0 % | 0.0 % | 7.4 | 2.4 s | 21.2 s | 50.8 s | 283.2 s | 0.0 % | M7 S1 |
| v2/opus5-low | 8 | 75.0 % | 0.0 % | 4.39 | $0.2707 | $0.2406 | 24.8 | $0.3609 | 100.0 % | 83.5 % | 16.5 % | 4.0 | 3.3 s | 16.5 s | 14.4 s | 25.1 s | 0.0 % | C25 M7 |
| v2/luna-medium | 108 | 66.7 % | 55.6 % | 4.33 | $0.0077 | $0.0070 | 1.2 | $0.0116 | 94.4 % | 81.0 % | 18.9 % | 4.2 | 28.9 s | 73.5 s | 29.5 s | 77.8 s | 0.2 % | C26 C29 C31 C32 C35 H10 H11 M8 N15 N24 |
| v2/sonnet5-medium | 108 | 66.7 % | 61.1 % | 4.27 | $0.1052 | $0.0946 | 9.9 | $0.1577 | 95.4 % | 86.1 % | 13.9 % | 3.8 | 12.8 s | 48.4 s | 19.2 s | 53.3 s | 0.0 % | C26 C29 C30 C31 H10 H11 M8 N15 N24 |
| v2/flash-lite-low | 108 | 63.9 % | 55.6 % | 4.22 | $0.0165 | $0.0148 | 1.9 | $0.0258 | 93.5 % | 67.1 % | 0.0 % | 5.0 | 7.9 s | 27.4 s | 8.5 s | 27.9 s | 0.0 % | C26 C29 C30 C31 C32 H10 H11 M8 N15 N24 |
| v2/mistral-large-3 | 8 | 62.5 % | 0.0 % | 3.69 | $0.0507 | $0.0450 | 5.1 | $0.0811 | 100.0 % | 23.1 % | 0.0 % | 4.1 | 6.0 s | 39.9 s | 9.6 s | 43.9 s | 0.0 % | C25 C36 M7 |
| v2/deepseek-pro-high | 8 | 62.5 % | 0.0 % | 4.01 | $0.2289 | $0.2035 | 20.9 | $0.3663 | 100.0 % | 0.0 % | 0.0 % | 4.2 | 7.8 s | 22.5 s | 27.0 s | 49.4 s | 0.0 % | C25 M7 S1 |
| v2/flash-medium | 108 | 59.3 % | 44.4 % | 4.23 | $0.1083 | $0.0975 | 10.2 | $0.1828 | 89.8 % | 76.6 % | 0.0 % | 7.8 | 18.3 s | 50.6 s | 18.9 s | 52.9 s | 0.7 % | C29 C30 C31 C32 C35 H10 H11 M8 N15 N24 S3 |
| v2/glm53-flash-high | 108 | 58.3 % | 50.0 % | 4.30 | $0.0070 | $0.0063 | 1.1 | $0.0120 | 94.4 % | 86.4 % | 0.0 % | 4.7 | 5.0 s | 17.3 s | 9.3 s | 27.3 s | 0.0 % | C26 C29 C30 C31 C32 C35 H10 H11 M8 N15 N24 |
| v2/nano-low | 8 | 50.0 % | 0.0 % | 3.15 | $0.0029 | $0.0026 | 1.0 | $0.0059 | 100.0 % | 93.2 % | 0.0 % | 5.8 | 35.6 s | 106.9 s | 36.2 s | 107.3 s | 0.0 % | C25 C36 M7 S1 |
| v2/luna-none | 8 | 50.0 % | 0.0 % | 3.75 | $0.0097 | $0.0087 | 1.3 | $0.0195 | 100.0 % | 80.5 % | 19.5 % | 5.9 | 17.6 s | 43.1 s | 18.1 s | 45.0 s | 0.0 % | C25 C36 M7 S1 |
| v2/shipped | 108 | 50.0 % | 41.7 % | 4.08 | $0.0152 | $0.0137 | 1.8 | $0.0304 | 92.6 % | 66.4 % | 0.0 % | 5.1 | 5.7 s | 20.0 s | 6.2 s | 20.3 s | 2.3 % | C26 C28 C29 C30 C31 C32 H10 H11 M8 N14 N15 N21 N24 S3 |
| current/shipped | 108 | 43.5 % | 33.3 % | 3.96 | $0.0166 | $0.0149 | 1.9 | $0.0380 | 91.7 % | 87.5 % | 0.0 % | 6.3 | 6.0 s | 15.8 s | 6.4 s | 16.0 s | 7.5 % | C26 C29 C30 C31 C32 C34 C35 C36 H11 M7 M8 N13 N14 N15 N16 N21 N24 |

## Pairwise against the shipped arm (exact sign test on per-case pass rates, Holm-corrected)

| Arm | Cases | Wins | Losses | Ties | Mean diff | p | Holm p | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v2/deepseek-flash-high vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/deepseek-pro-high vs current/shipped | 8 | 1 | 2 | 5 | -4.2 pts | 1.000 | 1.000 | 0.250 |
| v2/flash-lite-high vs current/shipped | 8 | 3 | 0 | 5 | 33.3 pts | 0.250 | 0.250 | 0.250 |
| v2/flash-lite-low vs current/shipped | 36 | 13 | 3 | 20 | 20.4 pts | 0.021 | 0.085 | 0.000 |
| v2/flash-lite-medium vs current/shipped | 8 | 3 | 0 | 5 | 33.3 pts | 0.250 | 0.250 | 0.250 |
| v2/flash-lite31-low vs current/shipped | 8 | 2 | 0 | 6 | 20.8 pts | 0.500 | 0.500 | 0.500 |
| v2/flash-low vs current/shipped | 8 | 2 | 1 | 5 | 20.8 pts | 1.000 | 1.000 | 0.250 |
| v2/flash-medium vs current/shipped | 36 | 12 | 5 | 19 | 15.7 pts | 0.143 | 0.287 | 0.000 |
| v2/flash36-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/flash38-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/glm53-flash-high vs current/shipped | 36 | 11 | 2 | 23 | 14.8 pts | 0.022 | 0.085 | 0.000 |
| v2/glm53-flash-low vs current/shipped | 8 | 2 | 0 | 6 | 20.8 pts | 0.500 | 0.500 | 0.500 |
| v2/glm53-low vs current/shipped | 8 | 2 | 2 | 4 | 8.3 pts | 1.000 | 1.000 | 0.125 |
| v2/gpt5-mini-low vs current/shipped | 8 | 3 | 0 | 5 | 33.3 pts | 0.250 | 0.250 | 0.250 |
| v2/gpt54-mini-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/gpt54-nano-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/haiku45 vs current/shipped | 8 | 1 | 0 | 7 | 8.3 pts | 1.000 | 1.000 | 1.000 |
| v2/kimi-k27-code vs current/shipped | 8 | 2 | 1 | 5 | 8.3 pts | 1.000 | 1.000 | 0.250 |
| v2/luna-low vs current/shipped | 8 | 1 | 0 | 7 | 8.3 pts | 1.000 | 1.000 | 1.000 |
| v2/luna-medium vs current/shipped | 36 | 14 | 3 | 19 | 23.1 pts | 0.013 | 0.064 | 0.000 |
| v2/luna-none vs current/shipped | 8 | 0 | 2 | 6 | -16.7 pts | 0.500 | 0.500 | 0.500 |
| v2/mistral-large-3 vs current/shipped | 8 | 0 | 1 | 7 | -4.2 pts | 1.000 | 1.000 | 1.000 |
| v2/nano-low vs current/shipped | 8 | 0 | 2 | 6 | -16.7 pts | 0.500 | 0.500 | 0.500 |
| v2/opus5-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |
| v2/qwen3-coder-next vs current/shipped | 8 | 2 | 1 | 5 | 8.3 pts | 1.000 | 1.000 | 0.250 |
| v2/shipped vs current/shipped | 36 | 8 | 5 | 23 | 6.5 pts | 0.581 | 0.581 | 0.000 |
| v2/sol-low vs current/shipped | 8 | 2 | 1 | 5 | 20.8 pts | 1.000 | 1.000 | 0.250 |
| v2/sonnet5-low vs current/shipped | 8 | 1 | 0 | 7 | 8.3 pts | 1.000 | 1.000 | 1.000 |
| v2/sonnet5-medium vs current/shipped | 36 | 13 | 2 | 21 | 23.1 pts | 0.007 | 0.044 | 0.000 |
| v2/terra-low vs current/shipped | 8 | 1 | 1 | 6 | 8.3 pts | 1.000 | 1.000 | 0.500 |

The floor is the smallest p the discordant pairs can produce; a comparison whose floor is above 0.05 cannot reach significance however large its margin.

## Case matrix (passed/run)

| Case | v2/gpt5-mini-low | v2/flash-lite-medium | v2/flash-lite-high | v2/glm53-flash-low | v2/flash-lite31-low | v2/flash-low | v2/sol-low | v2/gpt54-nano-low | v2/luna-low | v2/deepseek-flash-high | v2/gpt54-mini-low | v2/glm53-low | v2/flash36-low | v2/flash38-low | v2/haiku45 | v2/kimi-k27-code | v2/terra-low | v2/sonnet5-low | v2/qwen3-coder-next | v2/opus5-low | v2/luna-medium | v2/sonnet5-medium | v2/flash-lite-low | v2/mistral-large-3 | v2/deepseek-pro-high | v2/flash-medium | v2/glm53-flash-high | v2/nano-low | v2/luna-none | v2/shipped | current/shipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C25 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 2/3 | 1/3 | 3/3 | 0/1 | 0/1 | 1/3 | 1/3 | 0/1 | 0/1 | 1/3 | 1/3 |
| C26 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 2/3 | 0/3 | - | - | 0/3 | 0/3 |
| C27 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 1/3 | 2/3 |
| C28 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 0/3 | 1/3 |
| C29 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| C30 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| C31 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| C32 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 3/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| C33 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 3/3 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 |
| C34 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 2/3 | 3/3 | 2/3 | - | - | 1/3 | 1/3 | - | - | 3/3 | 0/3 |
| C35 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 1/3 | 3/3 | - | - | 0/3 | 0/3 | - | - | 3/3 | 0/3 |
| C36 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/1 | 3/3 | 2/3 | 3/3 | 0/1 | 1/1 | 2/3 | 3/3 | 0/1 | 0/1 | 1/3 | 0/3 |
| H10 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 1/3 |
| H11 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| H12 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 1/3 | - | - | 2/3 | 2/3 | - | - | 2/3 | 2/3 |
| H9 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 3/3 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 |
| M5 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 3/3 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 |
| M6 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 1/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 3/3 | 2/3 |
| M7 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | 2/3 | 1/3 | 3/3 | 0/1 | 0/1 | 3/3 | 1/3 | 0/1 | 0/1 | 3/3 | 0/3 |
| M8 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| N13 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 2/3 | - | - | 2/3 | 2/3 | - | - | 1/3 | 0/3 |
| N14 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 2/3 | 3/3 | 1/3 | - | - | 3/3 | 3/3 | - | - | 0/3 | 0/3 |
| N15 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| N16 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 1/3 | 0/3 |
| N17 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 2/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 3/3 | 3/3 |
| N18 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 3/3 | 3/3 |
| N19 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 2/3 | 1/3 | - | - | 3/3 | 3/3 |
| N20 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 2/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 2/3 | 3/3 |
| N21 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 1/3 | - | - | 3/3 | 1/3 | - | - | 0/3 | 0/3 |
| N22 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 3/3 | 3/3 | 3/3 | 1/1 | 1/1 | 2/3 | 3/3 | 1/1 | 1/1 | 3/3 | 3/3 |
| N23 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 2/3 | 3/3 | - | - | 3/3 | 3/3 |
| N24 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 0/3 | 0/3 | 0/3 | - | - | 0/3 | 0/3 | - | - | 0/3 | 0/3 |
| S1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 3/3 | 3/3 | 3/3 | 1/1 | 0/1 | 3/3 | 3/3 | 0/1 | 0/1 | 3/3 | 3/3 |
| S2 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 3/3 | 2/3 |
| S3 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 2/3 | - | - | 0/3 | 3/3 | - | - | 0/3 | 3/3 |
| S4 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | 3/3 | 3/3 | 3/3 | - | - | 3/3 | 3/3 | - | - | 3/3 | 3/3 |

## Checks that never passed anywhere

- d4-no-out-of-enum-page-size-reported-as-success
- rejection-respected

## Selection rule

Default: v2/flash-lite-low
Deep mode: v2/sonnet5-medium

- v2/gpt5-mini-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash-lite-medium: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash-lite-high: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/glm53-flash-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash-lite31-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/sol-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/gpt54-nano-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/luna-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/deepseek-flash-high: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/gpt54-mini-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/glm53-low: ineligible (zdr/no-training true, measured 88 %, episodes 8 for 36 cases)
- v2/flash36-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash38-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/haiku45: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/kimi-k27-code: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/terra-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/sonnet5-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/qwen3-coder-next: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/opus5-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/mistral-large-3: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/deepseek-pro-high: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/flash-medium: ineligible (zdr/no-training true, measured 90 %, episodes 108 for 36 cases)
- v2/nano-low: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/luna-none: ineligible (zdr/no-training true, measured 100 %, episodes 8 for 36 cases)
- v2/luna-medium: below the quality floor (pass 66.7 % vs best 66.7 %, judge 4.33 vs 4.33, never solved C26 C29 C31 C32 C35 H10 H11 M8 N15 N24)
- v2/glm53-flash-high: below the quality floor (pass 58.3 % vs best 66.7 %, judge 4.30 vs 4.33, never solved C26 C29 C30 C31 C32 C35 H10 H11 M8 N15 N24)
- v2/shipped: below the quality floor (pass 50.0 % vs best 66.7 %, judge 4.08 vs 4.33, never solved C26 C28 C29 C30 C31 C32 H10 H11 M8 N14 N15 N21 N24 S3)
- current/shipped: below the quality floor (pass 43.5 % vs best 66.7 %, judge 3.96 vs 4.33, never solved C26 C29 C30 C31 C32 C34 C35 C36 H11 M7 M8 N13 N14 N15 N16 N21 N24)
- v2/sonnet5-medium: below the speed floor (wall p50 19.2 s, TTFT p50 12.8 s)
- v2/flash-lite-low: below the speed floor (wall p50 8.5 s, TTFT p50 7.9 s)
- no arm passes the speed floor (TTFT is measured after the tool rounds); latency ranks below cost, so default = cheapest cost per successful task among the 2 arms passing the quality floor: v2/flash-lite-low
- deep mode = best-quality arm at most 25 credits per turn: v2/sonnet5-medium
