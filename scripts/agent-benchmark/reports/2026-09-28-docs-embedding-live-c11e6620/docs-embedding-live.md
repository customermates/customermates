# Hybrid docs candidates, live A/B (Amendment 5)

Campaign `c11e6620`, one production build of `cc7780b0`, cap 25 USD, spent 10.83 USD (episodes and gold-fact judge).
A = `AGENT_DOCS_CANDIDATES=keyword`, B = `hybrid` with `google/text-multilingual-embedding-002` on Vertex and a
1,200 ms query deadline, both with the Jev re-rank. Cases DE01 to DE30 and DH01 to DH30, k = 10 per arm in ten ABAB
blocks of two repetitions, each on a freshly restarted server; 600 complete pairs, no episode lost. The full suite ran
once per arm afterwards. Analysis: `classifier-eval/heldout-live/docs-embedding-live.ts`; raw figures in
`docs-embedding-live.json`, judge verdicts in `docs-fact-verdicts.json`.

## Verdict: fail

B is not kept. Its pass rate is not better than A's (McNemar p = 0.52), and its first-output p95 exceeds the +1.0 s
sanity limit. The hybrid code is removed again; the fixtures, this report and the offline report stay.

## Gate

| Item | A keyword | B hybrid | Result |
| --- | ---: | ---: | --- |
| Pass (oracle and gold fact), 600 pairs | 555 (92.5 %, 90.1–94.3) | 559 (93.2 %, 90.9–94.9) | fail: +0.67 pts (−1.33 to +2.83), 13 B-only vs 9 A-only, p = 0.523 |
| pass^10 (cases of 60 passed in all 10) | 47 | 49 | pass |
| Full-suite strict or safety regression (72 cases, k = 1) | 70 of 72 oracle passes | 70 of 72 | pass: no check A passed and B failed, so no recheck was needed |
| Credits per turn | 1.138 | 1.153 | pass: +1.32 % (−1.80 to +4.75) |
| First-output p95 (sanity limit +1.0 s) | 4.81 s | 6.33 s | fail: +1.51 s (+0.03 to +3.31) |
| Ceiling (A ≥ 95 %) | 92.5 % | | not at ceiling |

## Breakdown

| Slice | A pass | B pass | Diff (pts, 95 % CI) | B-only / A-only | McNemar p | pass^10 A / B |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| DE (new blind set) | 93.3 % | 93.7 % | +0.33 (−3.33 to +4.33) | 8 / 7 | 1.00 | 24 / 23 of 30 |
| DH | 91.7 % | 92.7 % | +1.00 (−0.67 to +2.67) | 5 / 2 | 0.45 | 23 / 26 of 30 |
| en | 91.7 % | 97.5 % | +5.83 (0 to +13.33) | 8 / 1 | 0.039 | 8 / 9 of 12 |
| de | 98.3 % | 99.2 % | +0.83 | 2 / 1 | 1.00 | 10 / 11 |
| es | 90.8 % | 91.7 % | +0.83 | 1 / 0 | 1.00 | 10 / 11 |
| fr | 99.2 % | 98.3 % | −0.83 | 1 / 2 | 1.00 | 11 / 10 |
| it | 82.5 % | 79.2 % | −3.33 (−8.33 to +0.83) | 1 / 5 | 0.22 | 8 / 8 |

Per-language rows are descriptive and uncorrected. Gold-fact verdicts: A 565 yes, 22 partial, 13 no; B 568 yes,
25 partial, 7 no. The deterministic oracle passed 590 of 600 episodes in each arm; all 20 failures are DH14
(`no-mutating-tool-attempt`: the model tries the rename instead of answering), 10 in each arm.

## Latency, search and cost

| Measure | A keyword | B hybrid | B − A |
| --- | ---: | ---: | --- |
| First output p50 | 2.20 s | 2.42 s | +0.22 s (+0.13 to +0.30) |
| First output p95 | 4.81 s | 6.33 s | +1.51 s (+0.03 to +3.31) |
| `search_docs` wall time p50 | 410 ms | 1,250 ms | +840 ms |
| `search_docs` wall time p95 | 759 ms | 1,918 ms | +1,159 ms (+1,006 to +1,329) |
| `search_docs` calls per episode | 0.942 | 0.943 | |
| Embedding fallback (B calls without hybrid candidates) | | 66 of 566 (11.7 %) | 59 embedding calls unanswered within 1,200 ms or failed, 7 index not ready after a restart |
| Query embedding cost | | 0.0001 USD for 559 calls | |
| USD per turn | 0.00706 | 0.00723 | +2.37 % (−1.52 to +6.33) |
| Gold page / gold anchor reached by a docs tool | 94.0 % / 92.2 % | 93.8 % / 92.0 % | |

## Notes

- The offline gain (+21.7 points on the answer returned by `search_docs`) did not reach the agent's answers: keyword A
  already passes 93 % of the DE episodes live, because the agent reformulates its query and opens pages with
  `get_docs_page`, which recovers most sections the first keyword search misses.
- The first-output p95 gap is mostly provider drift, not the search: the first output frame is emitted before any
  tool result, and round-0 provider time p95 moved between 3.0 s and 9.3 s across A's own blocks. The quality item
  fails regardless.
- The embedding misses its 1,200 ms deadline on about one call in ten from this machine, and the first docs search
  after each server start falls back while the cached section index loads.
- The section index build (618 sections, about 0.01 USD) and a two-episode smoke campaign (0.03 USD) ran outside the
  capped campaign.
