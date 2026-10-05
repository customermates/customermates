# Retrieval wait and relevance floor

This run follows the owner's decision after `reports/2026-09-29-retrieval-stage-selection-5655ec06/report.md`. The query-embedding wait went from 450 ms to 1,100 ms, and docs and the Wiki both use full-text search, embeddings and the Jev re-rank (FTS+E+J). A relevance floor now returns nothing for a query with no real answer.

Commits: `6be40065` (the wait), `ba32fd2c` (the floor) and `d9818889` (the floor is skipped while the semantic index is incomplete). The run used real query embeddings and the real Jev re-rank against a temporary local database.

## Shipped configuration (`d9818889`)

| Corpus | Answerable hit@1 | Page R@1 | Page R@5 | No-match empty | p50 | p95 | Vectors within 1,100 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Docs | 108 / 110 (98.2 %) | 99.1 % | 99.1 % | 9 / 10 | 1.19 s | 1.38 s | 98.3 % |
| Wiki (blind) | 137 / 150 (91.3 %) | 91.3 % | 92.0 % | 10 / 10 | 1.13 s | 1.27 s | 98.8 % |

- **The floor costs no answerable hits.** It hits the same answerable items as the unfloored arm on both corpora (0 / 0 discordant). Without it, no no-match query returns empty.
- **Held-out docs:** DE scored 60 / 60.
- **Wiki by category:** lexical 100 %, paraphrase 95.6 %, cross-language 80 %, typo 100 %, multi-hop 70 %.

## Floor

The floor only applies when the query vector arrived and the index is complete.

1. A query is kept on a pinned identifier, or when full-text search covers at least 90 % of the query's IDF weight.
2. Otherwise it is dropped when the best cosine similarity is below 0.60.
3. Otherwise Jev decides, and it can choose `none`. If Jev fails or times out, the results are kept.

The thresholds were tuned only on non-blind data (D, DH, the Wiki quality set and 20 new no-match queries) and then validated once on the blind Wiki benchmark: 136 / 150 answerable hits with and without the floor, and 10 / 10 no-match queries empty.

## Latency and spend

From a local machine, the query embedding took 847 ms at p50 and 960 ms at p95; 98.6 % of vectors arrived within 1,100 ms. Spend was at most US$0.27, measured by the shared-key Gateway delta.
