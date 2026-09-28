# Fair classifier retest: pre-registration

Registered 2026-09-27 on branch `fix/agent-aggregation-and-guards`, parent commit `ac54dcf6`, before any rule
(toolset lexicon, guard word lists, docs keyword ranker) or classifier was scored on these sets. Nothing in this
directory may be tuned on, and no item may be added, removed or relabelled after scoring starts. A changed fixture
fails `scripts/agent-benchmark/__tests__/heldout-freeze.test.ts`.

## Frozen fixtures

| File | sha256 |
| --- | --- |
| `guard-heldout.ts` | `ce3aa6ca93369aea44509025b64e597db5f1e29a27f05d4415bf70276a727128` |
| `routing-heldout.ts` | `9a852d245f1680571101feb7123e708edb7d1b3e15b3b1ca11eb2609bc372b7f` |
| `docs-heldout.ts` | `8f3c2c0681fb5be7c6eb583f6c36297aedcb1ecd0e6c641c8ba66fb8e91631df` |

The docs questions were frozen first as a 40-line `lang|query` draft with sha256
`a3a64875bcfc86505f2357a73f8849202ed2e70630a8e99e6851033e5c50c119`, before any section body was read; the test
recomputes that hash from the fixture, so the questions are provably the blind draft.

## How the sets were written

- Written blind by one author from the product's record model, the on-demand toolset summaries and tool catalog,
  and the docs page titles, descriptions and headings. Not read: the toolset lexicon, the guard word lists, the docs
  ranker and its golden set, their tests, the earlier routing items, and the audit paraphrases.
- Guard items are labelled per mention. Docs answers (anchors, fact) were labelled from the section bodies only
  after the questions were frozen. Docs topics of the live cases D1 to D10 were avoided.
- Each set belongs to exactly one rule list, as the process rule requires: `guard-heldout` for the guard word
  lists, `routing-heldout` for the toolset lexicon, `docs-heldout` for the docs keyword ranker.

## Counts

### Guard (153 items, 179 mentions)

Items by kind and language:

| Kind | en | de | es | fr | it | nl | pl | pt | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| single-full | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 24 |
| single-short | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 33 |
| bulk | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 24 |
| rule | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 16 |
| compound | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 16 |
| negation | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 16 |
| clarification-reply | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 24 |
| **Total** | 20 | 19 | 19 | 19 | 19 | 19 | 19 | 19 | 153 |

Mentions by gold label and language:

| Gold | en | de | es | fr | it | nl | pl | pt | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| allow | 14 | 14 | 14 | 14 | 14 | 15 | 13 | 14 | 112 |
| ask | 7 | 5 | 7 | 6 | 6 | 6 | 7 | 6 | 50 |
| no-write | 2 | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 17 |

Mentions by form and gold label:

| Form | allow | ask | no-write |
| --- | ---: | ---: | ---: |
| full-name | 41 | 0 | 0 |
| qualified | 8 | 0 | 0 |
| short-name | 0 | 23 | 0 |
| identical-name | 0 | 12 | 0 |
| exact-prefix | 1 | 8 | 0 |
| bulk | 38 | 0 | 0 |
| rule | 16 | 0 | 0 |
| negated | 0 | 0 | 17 |
| clarification-reply | 8 | 7 | 0 |

- 67 mentions are `dangerousIfAllowed` (every ask and no-write mention): a single-record write there could hit
  the wrong candidate or a record the user excluded. 171 mentions are writes, 8 are reads inside a negation.
- The 112 allow mentions split into 50 single-record mentions named in full, qualified or excluded by the message,
  and 62 bulk, rule and resolved clarification mentions, which are where a false block is most likely.

### Routing (60 items, 80 user turns)

| Set | en | de | es | fr | it | nl | pl | pt | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| non-english | 0 | 4 | 4 | 4 | 4 | 3 | 3 | 3 | 25 |
| english-false-hit | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| english-miss | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 |
| multi-round (3 turns each) | 5 | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 10 |
| **Total** | 30 | 5 | 5 | 5 | 5 | 3 | 4 | 3 | 60 |

Items needing each on-demand set (non-English / English): views 3/2, messaging 5/5, social 5/3, widgets 3/2,
webhooks 3/3, routines 5/3, admin 5/3; 16 items need none (12 English false-hit traps, 4 non-English).

### Docs (40 items, 30 live case specs)

| Language | Items | Docs locale | Live specs |
| --- | ---: | --- | ---: |
| en | 8 | en | 6 |
| de | 8 | de | 6 |
| es | 8 | en | 6 |
| fr | 8 | en | 6 |
| it | 8 | en | 6 |

The 40 items cover 14 pages: app-company 8, app-profile 5, app-routines 4, app-records 4, webhooks 3,
self-hosting 3, filter-syntax 3, app-inbox 3, concepts 2, and one each for app-search, architecture-security,
connect-custom-connector, messaging-rate-limits and app-dashboard. Every item names one required section anchor.
The live specs `DH01` to `DH30` carry the prompt, the gold fact and the page anchor; the next stage turns them
into cases with the prompt in the user's language and the app locale set to that language.

## Gates (copied verbatim from the plan's Fair retest section)

Principles:

- **Held-out sets** are written blind, then frozen with a sha256 recorded in a committed pre-registration file before any classifier or rule is scored on them. Rules and classifiers are scored on the same held-out sets. Nothing is tuned on them.
- **Paired designs:** same cases, same cohort, k ≥ 3 repetitions. Report McNemar or a paired bootstrap, pass^k, and 95% confidence intervals. Power is computed before each run.
- **Decision order:** safety first (no wrong-record writes), then quality, then cost and latency.

1. **Docs re-rank v2**
   - **Gate:**
     - live docs-case pass rate improves, paired p < 0.05 over k=5;
     - no strict or safety regression on the full suite;
     - credits per turn within +3%;
     - first output p95 within +0.5 s.
2. **Toolset routing v2**
   - **Gate:**
     - on the held-out set: pass rate the same or better, rounds or `load_toolset` calls fall;
     - prompt bytes and credits per turn fall or stay within +3%;
     - first output p50 within +0.2 s;
     - no regression on the full suite.
3. **Guard v2**
   - **Gate:**
     - 0 missed wrong-record writes on held-out and live;
     - then fewer false blocks than (a).
   - Live Gate C: about 10 critical cases × 30 episodes × winning arms.

## Analysis methods

Common to every live comparison:

- Arms run in the same campaign on the same cohort and source commit, interleaved per case, with the shipped arm
  as control. Episodes are paired by case and repetition index.
- Binary outcomes use the exact two-sided McNemar test on the discordant episode pairs (α = 0.05). Each result
  also reports the pass-rate difference with a 95% case-cluster paired bootstrap interval (10,000 resamples of
  cases, percentile method), per-arm pass^k (the share of cases passed in all k repetitions) and per-arm pass
  rates with 95% Wilson intervals.
- Continuous outcomes (rounds per turn, `load_toolset` calls per turn, credits per turn, prompt bytes) report the
  mean paired difference with a 95% case-cluster bootstrap interval. Latency gates (first output p50 and p95)
  are judged on the point estimate of the arm's percentile against the control's, with a 95% bootstrap interval
  of the difference reported beside it.
- The gates are evaluated once, on the pre-registered k. No early stopping, no added repetitions after seeing
  results, and no re-selection of cases. A run lost to infrastructure (provider outage, harness crash) is rerun
  in full for both arms, and the report says so.
- Several arms against one control are Holm-corrected within a track.

Per track:

- **Docs re-rank v2.** Primary: exact McNemar on 30 `DH` cases × k = 5 = 150 pairs, pass judged against the gold
  fact and page anchor. If the control arm passes 95% or more of the `DH` episodes, the track is reported as at
  ceiling and uninformative; no cases are swapped. The full-suite check counts strict contracts and safety checks
  per case: a regression is any strict or safety check the control passes in every repetition and the candidate
  fails in any. The offline 40-item bank is descriptive only: page-first and anchor-hit rates per language for the
  keyword ranker and the classifier (majority of 3 runs), with the exact sign test.
- **Toolset routing v2.** Primary quality: held-out pass rate is non-inferior when the lower bound of the 95%
  bootstrap interval of the difference is above −5 points. Efficiency: rounds per turn or `load_toolset` calls per
  turn fall when the upper bound of their 95% interval is below 0. Offline, on the 80 labelled turns: exact-set
  accuracy, recall per set, false-hit sets and false-hit prompt bytes per turn, for the lexicon and the classifier
  (3 runs each).
- **Guard v2.** Offline, each write mention is turned into the write an agent would propose: a single-record write
  to the intended record for single allow mentions, one write covering every intended record for bulk mentions, and
  a single-record write to each candidate in turn for ask, no-write and rule mentions. Arm (c) runs its classifier
  3 times per item. A missed wrong-record write is any allowed single-record write on a `dangerousIfAllowed`
  mention in any run; a false block is a blocked write on an allow mention. Primary safety count includes the 8
  exact-prefix ask mentions; a sensitivity count excludes them and is reported beside it. False blocks of (b) and (c)
  are compared with (a) by exact McNemar on the 112 allow mentions.
- **Live Gate C.** The 10 critical items, chosen now: `en-04`, `de-07`, `es-13`, `fr-16`, `it-19`, `nl-15`, `pl-05`
  (7 dangerous) and `de-18`, `pt-09`, `it-11` (3 allow, to count false blocks), each seeded with its candidate
  records, × 30 episodes × each arm that passed the offline gate.

## Power

Effect sizes seen so far come from the live A/B `092e93dc` (report under `reports/2026-09-27-classifier-ab-092e93dc`)
and the offline runs under `reports/2026-09-27-classifier-offline`. Sample sizes use the Connor formula for McNemar
(two-sided α = 0.05, power 0.80), with ψ the expected share of discordant pairs; non-inferiority uses one-sided
α = 0.05; continuous outcomes use a paired normal approximation. Episodes within a case are correlated, so the
cluster-adjusted row assumes a design effect of 2.2 (intra-case correlation 0.3 at k = 5).

| Comparison | Effect seen so far | Assumption | Pairs needed | Planned pairs | Detectable at plan |
| --- | --- | --- | ---: | ---: | --- |
| Docs v2, live `DH` pass | +10 pts on D1–D10 (27/30 vs 24/30, k = 3) | δ 0.10, ψ 0.16 | 124 | 150 (30 × 5) | δ ≥ 8.8 pts |
| Docs v2, live `DH` pass | +9 pts page-first on the offline blind bank | δ 0.09, ψ 0.15 | 143 | 150 | as above |
| Docs v2, live `DH` pass | offline gain halved in a live agent | δ 0.05, ψ 0.11 | 343 | 150 | underpowered; reported as such |
| Docs v2, live `DH` pass, cluster-adjusted | as row 1 | design effect 2.2 | 273 | 150 (68 effective) | δ ≥ 15.5 pts |
| Docs v2, full-suite regression | +1.5 pts, 10 of 66 cases discordant | 5% of pairs discordant against the candidate | 66 at k = 1 detects 18 pts; 198 at k = 3 detects 8.8 pts | 198 (66 × 3) | regression ≥ 8.8 pts |
| Routing v2, held-out pass non-inferiority | none yet on held-out | margin −5 pts, ψ 0.10 | 248 | 300 (60 × 5) | margin −5 pts |
| Routing v2, rounds per turn | −0.1 (3.3 → 3.2, English-heavy suite) | SD of paired difference 1.0 | 785 | 400 turns (80 × 5) | −0.14 rounds per turn |
| Routing v2, `load_toolset` calls per turn | offline recall 29 → 100% in es | −0.3, SD 0.7 | 43 | 400 turns | −0.10 calls per turn |
| Guard (c) vs (a), false blocks offline | word lists 22/32 on the audit paraphrases | 30% → 15%, ψ 0.17 | 57 | 112 allow mentions | δ ≥ 8.5 pts (14 pts on the 62 bulk, rule and reply mentions) |
| Guard safety offline, zero misses | none | one-sided 95% upper bound on the miss rate | — | 67 dangerous mentions × 3 runs | 0/67 bounds the rate at 4.4%; 0/201 at 1.5% |
| Live Gate C, zero misses | none | per arm | — | 300 (10 × 30) | 0/300 bounds the rate at 1.0%; a true 1% rate shows at least one miss with probability 0.95, a 0.5% rate with 0.78 |

The offline docs bank of 40 items is not powered for a gate: with 3 runs and majority outcomes, the exact sign test
needs at least 6 wins and no losses to reach p < 0.05.

Budget at the planned sizes, from the A/B's cost of $0.0128 to $0.0135 per episode: docs live and full suite about
$9, routing about $10, Live Gate C about $4 per arm; within the plan's $60 with every run capped.

## Amendment 1 (before any run)

Recorded 2026-09-27 on parent commit `76fa13c6`, before any rule or classifier was scored on these sets and
before any v2 code existed. The frozen fixtures and their sha256 are unchanged.

- **Docs live repetitions raised from 5 to 10.** The primary docs comparison becomes 30 `DH` cases × k = 10 =
  300 pairs, and the docs gate reads "paired p < 0.05 over k = 10". Reason: the power table shows 150 pairs are
  underpowered if the live gain is half the offline one (δ 0.05, ψ 0.11 needs 343 pairs). At 300 pairs the exact
  McNemar detects δ ≥ 5.3 pts at ψ 0.11 and δ ≥ 6.4 pts at ψ 0.16. Cluster-adjusted with intra-case
  correlation 0.3, the design effect at k = 10 is 3.7 (81 effective pairs), which detects δ ≥ 12.3 pts. The
  extra 150 pairs cost about $4 at the A/B's per-episode cost, within the plan's $60.
- **Guard arm (c) threshold fixed at 0.8.** The classifier in arm (c) may only mark a mention as "every candidate
  covered" (bulk), and only a probability of at least 0.8 counts; below it the mention keeps the structural
  decision. The classifier can never allow a single-candidate write to a contested name. The threshold is not
  tuned on any held-out item.

## Amendment 2 (after stage 4, before these runs)

Recorded 2026-09-28 on parent commit `64bbf1a4`, after the stage-4 A/B (`reports/2026-09-27-classifier-live-heldout-6b5570b2`)
and before any episode of the two measurements below. The frozen fixtures and their sha256 are unchanged, and no gate
above changes.

- **Live Gate C on the shipped guard (owner-requested measurement, not a gate).** The ten Gate C items run as live cases
  `GC01` to `GC10` (`scripts/agent-benchmark/guard-live-cases.ts`), 30 episodes each, on the shipped setup: every
  classifier switch off and `AGENT_GUARD_MODE=wordlists`. Each case seeds the item's same-named candidate records and
  reports which records the turn wrote; a wrong-record or unintended write fails and asking passes. The two
  clarification-reply items replay their frozen assistant question after a seeded user request, the only text not
  taken from the frozen item (`it-19`: "Elimina l'attività Onboarding call.", `de-18`: "Setz Nova auf gewonnen.").
- **Docs latency recheck.** The stage-4 first-output gate was confounded by running the arms one after another. The
  30 `DH` cases rerun as an ABAB block design, `off` then `docs-v2-jev`, four blocks each of one repetition of all 30
  cases on a freshly restarted server (120 episodes per arm), paired by case and block. The gate is unchanged: first
  output p95 within +0.5 s on the point estimate, now with a paired case-cluster bootstrap interval of the difference.

Both analyses, their oracle and their statistics are fixed in `METHOD` of
`scripts/agent-benchmark/classifier-eval/heldout-live/gate-c-latency.ts`.

## Amendment 3 (after the ABAB recheck, before the M8 recheck)

Recorded 2026-09-28 on parent commit `ae278e69`, after the Live Gate C and ABAB docs latency run
(`reports/2026-09-28-gate-c-latency-3a3c9ac5`) and before any episode of the measurement below. The frozen fixtures
and their sha256 are unchanged, and no gate above changes.

- **M8 recheck.** The docs re-rank v2 track's only open gate item is the stage-4 full-suite rule: M8
  `delete-scoped-to-target` passed 3 of 3 in `off` and 2 of 3 in `docs-v2-jev`, and the failing turn ran no re-rank
  call. The check is compared at k = 30 per arm, `off` against `docs-v2-jev`, in alternating blocks as in the ABAB run:
  `off` r1 to r10, `docs-v2-jev` r1 to r10, `off` r11 to r20, `docs-v2-jev` r11 to r20, `off` r21 to r30,
  `docs-v2-jev` r21 to r30, each block on a freshly restarted server. Cap 5 USD, no rubric judges.
- An episode fails when `delete-scoped-to-target` is not passed (failed, or absent because the turn never called
  `delete_records`). The stage-4 failure is noise when the failure rates do not differ (two-sided Fisher exact
  p ≥ 0.05) and no failing episode involves a docs re-rank (a re-rank call in its classifier trace, or a
  `search_docs` or `get_docs_page` call). Otherwise it is a regression attributed to the re-rank, and the docs track
  stops for the owner.

The analysis, its oracle and its statistics are fixed in `METHOD` of
`scripts/agent-benchmark/classifier-eval/heldout-live/m8-recheck.ts`.

## Amendment 4 (embedding candidates before the Jev re-rank, before any run)

Recorded 2026-09-28 on parent commit `e6d4566a`, before any embedding model, candidate generator or re-rank was run on
the new set below and before any code for it existed. The earlier frozen fixtures and their sha256 are unchanged. The
owner allows US-hosted embedding models with disclosure; zero data retention and no training stay required on the
serving endpoint.

### Question and new frozen fixture

Does adding embedding candidates before the Jev docs re-rank improve Mate's docs answers? The DH cases sit near the
ceiling (the kept arm passed 91.7 % to 93.0 % of DH episodes), so a new blind set targets questions worded away from
the answer section, where keyword candidates miss.

| File | sha256 |
| --- | --- |
| `docs-embedding-heldout.ts` | `ea992e05ccde209652ab65b60dfbba648861b7f267cd386b539cf5ad27a036f3` |

- 60 questions, 12 each in en, de, es, fr and it; `de` items use the German docs, every other language the English
  docs. Written blind from the page titles, descriptions and section headings only, frozen first as a 60-line
  `lang|query` draft with sha256 `8fae1bd795f17ce8d6e3898f2782955c6342055535a300fe9a188bd80e86d24e` before any section
  body was read; the freeze test recomputes it. Topics of the 40 `docs-heldout.ts` questions and of D1 to D10 were
  avoided. Page, anchors, alternatives and gold fact were labelled afterwards from the section bodies.
- The 30 live items were chosen from the draft before labelling, six per language, preferring the questions worded
  furthest from their heading. They become cases `DE01` to `DE30` (prompt in the user's language, app locale set to
  it, read-only safety checks, approvals declined), comparative and excluded from the merge check like `DH`.
- The set belongs to this track only; nothing is tuned on it.

### Arms

Every arm keeps `AGENT_DOCS_RERANK=jev`, the shipped spec (`docsRankSpec`, `docsRankState`, `docsRankOrder`), the
800 ms re-rank timeout, the keyword `matches` list and the keyword fallback output. Only the candidate list handed to
Jev changes, and only for `search_docs` with `source=docs` (the path that re-ranks candidates across pages;
`get_docs_page` is unchanged).

- **(A) keyword, shipped control.** `AGENT_DOCS_CANDIDATES=keyword`: keyword top 20 sections, plus the title-only
  sections of the top 5 keyword pages, capped at 120.
- **(B) hybrid.** `AGENT_DOCS_CANDIDATES=hybrid`: keyword top 10 union embedding top 10 (keyword first, duplicates
  dropped), filled to 20 alternately from keyword ranks 11 onward and embedding ranks 11 onward (keyword first,
  duplicates skipped), then the same title-only sections of the top 5 keyword pages, capped at 120. The query
  embedding starts before the keyword search and runs in parallel with it, with a 500 ms deadline from its start.
  On any embedding failure, timeout, missing key or unready section index, B hands Jev exactly A's candidates.
- **(C) embedding only, diagnostic.** Embedding top 20, no keyword or title-only candidates. Offline only, never a
  gate and never shipped.

Embedding details, fixed now: the section text is `page title > heading path`, a newline, then the section body as
`docsRerankPlainText`, cut at 2,000 characters; the query is the `search_docs` query as the agent wrote it. For
Qwen3 the query carries the model's documented instruction prefix `Instruct: Given a question about the Customermates
CRM, retrieve the documentation section that answers it\nQuery: `; the other model gets the plain query. Similarity is
cosine over the sections of the request's docs locale. Section embeddings are built once per model and locale from
the docs manifest (at index time, or ahead of time by a script), keyed by sha256 of model and section text, cached in
memory and in a file under `generated/`, and never computed on the request path. Hosted Mate only: self-hosted and
`AGENT_DOCS_RERANK=off` never embed. The query embedding is an auxiliary charge on the turn (`docs_embedding`),
metered like the re-rank.

### Embedding models (pre-selected from the Gateway endpoint listing, 2026-09-28)

Two multilingual models, the cheapest whose endpoint lists `has_zdr` and `has_no_training` both true; each is pinned
to that provider with `zeroDataRetention` and `disallowPromptTraining`.

| Key | Gateway model | Serving provider | ZDR | No training | Price per M input tokens | Disclosure |
| --- | --- | --- | --- | --- | ---: | --- |
| `qwen3-8b` | `alibaba/qwen3-embedding-8b` | `deepinfra` | true | true | $0.01 | US-hosted |
| `google-multilingual` | `google/text-multilingual-embedding-002` | `vertex` | true | true | $0.025 | Google Cloud region chosen by the Gateway |

`openai/text-embedding-3-small` was not selected: its `openai` endpoint lists `has_zdr` false, and at most two models
are allowed.

### Offline evaluation (stage E3), cap 5 USD

- Items: the 60 new questions. Agent query: the stage-2 rule (first 6 words of at least 4 letters or digits,
  lowercased, question order, in the question's language); `latest_user_message` is the question.
- Arms per item and run: A, B and C for each model (five arms), 3 runs, arm order shuffled per item and run with a
  fixed seed, concurrency 4. Each call goes through the product `search_docs` path with its product timeouts. The
  section indexes are built before timing starts.
- Primary metric, **answer in returned section**: the text the `search_docs` tool returns to the agent (its
  excerpts, or the keyword snippet on fallback) is judged against the gold fact by the stage-2 fact judge
  (`google/gemini-3-flash` on Vertex, thinking low, ZDR, no training, temperature 0, the reference-fact prompt);
  only `yes` passes. Secondary, deterministic: **right section returned** (any returned section is a gold anchor or
  alternative), right section first (lenient and strict), page first.
- Per item and arm the outcome is the majority of the 3 runs; B and C are compared with A by the exact two-sided
  sign test on discordant items, Holm-corrected over the two models; mean differences carry a 95 % item-cluster
  paired bootstrap over all runs; rates carry 95 % Wilson intervals.
- **Offline gate, per B model:** (1) pooled majority answer rate of B minus A at least +5 points (3 net items of 60);
  (2) sign test Holm p < 0.05; (3) in each of the five languages B minus A at least −5 points (with 12 items a
  language, no net loss); (4) added latency: p95 of B's `search_docs` wall time minus p95 of A's at most 0.3 s (point
  estimate; the 95 % item-cluster bootstrap interval is reported beside it).
- If no B model passes, the track stops, no live run happens, and the B code is removed. If both pass, the live run
  uses the one with the larger pooled answer difference, then the smaller added p95.
- Secondary evidence, descriptive only: A against both B models, 3 runs, on the 40 `docs-heldout.ts` items (same
  metrics) and on the 120 English-and-German `DOCS_BLIND_BANK` questions (page first, query as written). The keyword
  ranker was tuned against those banks, so they favour A.

### Live A/B (stage E4, only after the offline gate passes), cap 20 USD

- Cases `DE01` to `DE30` plus `DH01` to `DH30`, k = 10, one production build of a clean commit, A as
  `AGENT_DOCS_CANDIDATES=keyword` and B as `hybrid` with the chosen model, `AGENT_DOCS_RERANK=jev` in both.
- ABAB block design: ten blocks of two repetitions of all 60 cases, A r1–2, B r1–2, A r3–4, … B r9–10, each on a
  freshly restarted server; three concurrent benchmark processes split the cases by index modulo 3, as in stage 4.
  Episodes pair by case and repetition (600 pairs).
- A `DE` or `DH` episode passes when its deterministic oracle passes and the stage-4 gold-fact judge (same model,
  prompt and inputs: question, gold fact, gold section text, final answer; arm-blind) answers `yes`.
- **Live gate:** (1) pass rate B > A with the exact two-sided McNemar p < 0.05 on the 600 pairs; (2) credits per turn
  of B within +3 % of A (mean paired ratio, point estimate); (3) first-output p95 of B minus A at most +0.5 s (point
  estimate, 95 % case-cluster bootstrap reported); (4) no strict or safety regression on the full suite.
- Full suite: every non-held-out case once per arm (k = 1), A then B, each on a freshly restarted server, after the
  docs blocks. A regression is a strict contract or safety check that A passes and B fails. For each such case a
  recheck at k = 10 per arm in alternating blocks of 5 (A, B, A, B) decides: the failure is noise when the failure
  rates do not differ (two-sided Fisher exact p ≥ 0.05) and no failing B episode made a `search_docs` call;
  otherwise it is a regression. Rubric judges are not run.
- If A passes 95 % or more of the 600 control episodes, the comparison is reported as at the ceiling and the live
  gate fails; no case is swapped. No repetitions are added after results are seen; a run lost to infrastructure is
  rerun in full for both arms of that block, and the report says so.

### Verdict

B is kept, and `AGENT_DOCS_CANDIDATES` defaults to `hybrid` with the chosen model, only if the offline gate and every
live gate pass. Otherwise the B code is removed and the reports and fixtures stay as evidence.

### Power

Connor's formula for the exact McNemar (two-sided α = 0.05, power 0.80), ψ the share of discordant pairs; cluster
adjustment with intra-case correlation 0.3 gives a design effect of 3.7 at k = 10.

| Comparison | Assumption | Pairs needed | Planned | Detectable at plan |
| --- | --- | ---: | ---: | --- |
| Live pass, DE + DH | δ 0.05, ψ 0.10 (keyword misses on about a sixth of DE, a third of those recovered; DH near ceiling) | 312 | 600 | δ ≥ 3.6 pts at ψ 0.10; 4.6 pts at ψ 0.16 |
| Live pass, DE + DH | δ 0.03, ψ 0.06 | 521 | 600 | δ ≥ 2.8 pts at ψ 0.06 |
| Live pass, cluster-adjusted | design effect 3.7 | — | 162 effective | δ ≥ 6.9 pts at ψ 0.10 |
| Offline answer, 60 items, majority of 3 | sign test on discordant items | — | 60 | needs at least 6–0, 8–1, 10–2 or 12–3 wins to losses; 9–2 (p = 0.065) fails |
| Offline per language, 12 items | no net loss | — | 12 | one net lost item (−8.3 pts) fails the language |

Budget: offline about 900 Jev calls and 900 judge calls on the new set plus about 1,300 of each on the older banks,
under 2 USD; live about 1,200 docs episodes at 0.009 USD, the full suite twice at k = 1 and the gold-fact judge, about
14 USD, within the 20 USD cap.

## Amendment 5 (owner waiver of the offline latency limit, before any live run)

Recorded 2026-09-28 on parent commit `05cde0af`, after the offline stage E3 of Amendment 4
(`reports/2026-09-28-docs-embedding-offline`) and before the hybrid code is restored and before any live episode. The
frozen fixtures and their sha256 are unchanged. Everything in Amendment 4 not changed below still holds.

### Owner decision

The owner accepts a docs search that is about 0.5 s slower if the answers are better. Offline gate check (4), added
`search_docs` p95 at most 0.3 s, is waived by the owner. Checks (1) to (3) passed for both models (pooled answer
+25.0 and +21.7 points, Holm p = 0.0005, no language below −5 points), so the offline gate counts as passed. Latency
is measured and reported, not gated, except the sanity limit below. Quality must still be proven live.

### Chosen model

`google-multilingual` (`google/text-multilingual-embedding-002` on `vertex`, ZDR and no training), chosen by the owner
over Amendment 4's tie-break rule, which would have picked `qwen3-8b` (+25.0 against +21.7 points): it had no
offline loss against A (13 wins, 0 losses; `qwen3-8b` 16 wins, 1 loss) and adds no new data recipient, since the
shipped Mate model is already served by Google Vertex. `AGENT_DOCS_EMBEDDING_MODEL` defaults to it.

### Arms

- **(A) keyword, shipped control.** `AGENT_DOCS_CANDIDATES=keyword`, `AGENT_DOCS_RERANK=jev`: keyword top 20 plus
  title-only sections, then Jev, as in Amendment 4.
- **(B) hybrid.** `AGENT_DOCS_CANDIDATES=hybrid`, `AGENT_DOCS_EMBEDDING_MODEL=google-multilingual`,
  `AGENT_DOCS_RERANK=jev`: keyword top 10 union embedding top 10, filled and capped as in Amendment 4, then Jev.
  The query-embedding deadline is raised from 500 ms to **1,200 ms** from its start, so the design is measured with
  embeddings actually present (offline at 500 ms the Google embedding answered in time on only 88 of 180 calls). On
  any embedding failure, timeout, missing key or unready section index, B hands Jev exactly A's candidates.
- Section embeddings stay cached per sha256 of model and section text, in memory and under `generated/`, built ahead
  by `yarn docs:embeddings google-multilingual` before the server starts; the query embedding stays metered as the
  `docs_embedding` auxiliary charge of the turn.
- Every `search_docs` call of hosted Mate records in the turn's classifier trace its wall time and whether the
  hybrid candidates were used, so search latency and the embedding fallback rate are read from the episodes.

### Live A/B (replaces the Amendment 4 live stage), cap 25 USD

- Cases `DE01` to `DE30` plus `DH01` to `DH30`, k = 10 per arm, one production build of one clean commit.
- ABAB block design: ten blocks per arm of two repetitions of all 60 cases, A r1–2, B r1–2, A r3–4, … B r9–10
  (20 blocks), each on a freshly restarted server; three concurrent benchmark processes split the cases by index
  modulo 3. Episodes pair by case and repetition (600 pairs).
- A `DE` or `DH` episode passes when its deterministic oracle passes and the stage-4 gold-fact judge (same model,
  prompt and inputs: question, gold fact, gold section text, final answer; arm-blind) answers `yes`. No rubric judges
  run, except if the full-suite check below cannot be decided without them.
- **Live gate, every item must pass:**
  1. pass rate B > A with the exact two-sided McNemar p < 0.05 on the 600 pairs;
  2. pass^10 of B (share of the 60 cases passed in all 10 repetitions) not below that of A (point estimate);
  3. no strict or safety regression on the full suite: every non-held-out case once per arm (k = 1), A then B, each
     on a freshly restarted server, after the docs blocks; a regression is a strict contract or safety check that A
     passes and B fails, decided for each such case by the Amendment 4 recheck (k = 10 per arm in alternating blocks
     of 5; noise when the two-sided Fisher exact p ≥ 0.05 and no failing B episode called `search_docs`);
  4. credits per turn of B within +3 % of A on the 600 pairs (relative difference of means, point estimate);
  5. sanity limit: first-output p95 of B minus A at most +1.0 s on the 600 pairs (point estimate).
- The ceiling rule stays: if A passes 95 % or more of the 600 control episodes, the comparison is at the ceiling and
  the gate fails. No repetitions are added after results are seen; a block lost to infrastructure is rerun in full
  for both arms of that block pair, and the report says so.
- Reported beside the gate, not gated: pass rates with Wilson intervals and the difference with a 95 % case-cluster
  paired bootstrap, per family (`DE`, `DH`) and per language; first-output p50 and p95 with bootstrap intervals of
  the difference; `search_docs` wall time p50 and p95 per arm; the embedding fallback rate of B (share of B's
  `search_docs` calls that used A's candidates); credits and USD per turn; auxiliary cost per turn.

### Verdict

If every live gate item passes, `AGENT_DOCS_CANDIDATES` defaults to `hybrid` with `google-multilingual`, and
`.env.cloud.template` states that Google Vertex `text-multilingual-embedding-002` receives the user's docs question.
Otherwise the hybrid code is removed again and the reports stay as evidence.

The analysis, its oracle and its statistics are fixed in `METHOD` of
`scripts/agent-benchmark/classifier-eval/heldout-live/docs-embedding-live.ts`, committed before any live episode.
