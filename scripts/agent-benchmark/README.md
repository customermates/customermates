# Agent benchmark

Local-only quality, cost and latency benchmark for the hosted Assistant. It drives the real application over
`/api/agent/messages` against synthetic fixture companies in the disposable local database, scores every episode with
deterministic oracles (database state plus answer checks), grades the final answers with two arm-blind judge models, and
reports pass rate, pass^3, cost per successful task, cache share, rounds and latency per arm with Holm-corrected pairwise
comparisons against the shipped configuration. The knowledge base owns the procedure and the reading guide; this file
only lists the commands.

This is the only live-model Assistant harness. Its case registry covers answer quality, saved views, UI commands,
dashboard widget creation, approvals, cancellation, stream recovery, model pinning and usage accounting. `yarn agent:benchmark check` is the
shipped-model merge gate; the lower-level campaign commands run resumable model experiments from the same registry,
driver, fixtures and oracles.

Requirements: the sandbox worktree with its loopback PostgreSQL, `AI_GATEWAY_API_KEY` inherited from the process environment,
`RUN_AGENT_BENCHMARK=true`, and the application started in production mode with the benchmark model overlay. Keep any `.env`
key value a placeholder and establish a spending ceiling before a paid campaign:

```sh
export BASE_URL=http://localhost:4107
export WORKFLOW_LOCAL_BASE_URL="$BASE_URL"
export WORKFLOW_LOCAL_DATA_DIR="$PWD/.next/workflow-data"
export NEXT_PUBLIC_SENTRY_DSN=
yarn build
LOCAL_AGENT_BENCHMARK=true \
AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" \
yarn next start -p 4107
```

`NEXT_PUBLIC_SENTRY_DSN` must be empty for the build and the server. With a DSN set, a production build sends every workflow failure to Sentry and prints nothing, so a turn that fails locally leaves no trace in the server log; the empty value also keeps the build from wrapping the Sentry source-map upload.

The `shipped` control resolves through `SHIPPED_AGENT_MODEL`, the single production runtime configuration used
by the Assistant. The overlay contains only the experimental arms, so it cannot replace or drift from that control.
The shipped control is Qwen3.8 27B on OVHcloud AI Endpoints (EU, OVH's default reasoning), so every run needs
`OVH_AI_ENDPOINTS_API_KEY` as well as `AI_GATEWAY_API_KEY`, which retrieval and the Gateway arms still use. The previous
shipped configuration stays comparable as `gemini-flash-lite-low` (Gemini 3.5 Flash-Lite, Vertex EU, thinking low) and
`gemini-flash38-import` (the former initial website-import model, Gemini 3.8 Flash with 16,384 output tokens).

`WORKFLOW_LOCAL_BASE_URL` and `WORKFLOW_LOCAL_DATA_DIR` must be exported for the server. The benchmark bootstrap preserves
an explicit data directory or defaults the CLI to the same absolute `.next/workflow-data` directory that Next uses. The
shared directory lets direct approval, UI-command and cancellation responders see the server's durable hooks. The CLI
also forces `WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=false`, so its secondary worker cannot recover or enqueue the server's
active runs. Benchmark mode also removes the local world's 30-second queue delivery deadline because complex, valid
Assistant turns can exceed it; the episode driver still enforces its own bounded wait. When using a custom directory,
start the server and CLI with that same value (and set
`WORKFLOW_TARGET_WORLD=local` so the Next plugin preserves it).

The base URL is required in both processes because the CLI's secondary worker posts durable steps over HTTP. Without it,
the worker probes for a port, and a probe that fails mid-campaign sends every step it picked up into a long backoff.

Run nothing else against the same database while a campaign runs. Any other application process on this machine — a development server left running in a second worktree — executes the durable workflow steps of your run with its own code, so the model is offered that tree's tool catalog and prompt. The symptom is a turn that calls a tool this build does not define; the driver now fails the episode with that explanation instead of scoring it. Either stop the other process or give the run its own database.

Every command exits the process when it finishes: loading the product graph starts a workflow worker that would otherwise keep the run alive indefinitely after the last episode.

In benchmark mode (`LOCAL_AGENT_BENCHMARK=true`) the server also stores each tool call's result text in its round record, bounded to 8,000 characters per call, plus the structured content when it serializes to at most 2,000 characters. Episodes save it as `toolOutputs`, one list per turn aligned with `observed[turn].tools`; oracles and judges do not read it. A server started without the flag records nothing extra.

`--variant <label>` groups a run's artifacts and report rows under a label of your choice; the application has one runtime, so the label records what you changed between runs rather than selecting a code path.

Hosted Mate offers Jev re-ranking for documentation and Knowledge Base results with multiple candidates or an ambiguous single candidate. Self-hosted instances, external MCP clients, a missing Gateway key, an error or a reply slower than 800 ms keep the fused ranking; the relevance floor still applies when its required evidence is available. Local hosted benchmark servers measure this shipped configuration. Each turn that calls the re-rank stores a classifier trace (docs re-rank calls, answers and auxiliary cost; never text). Episodes copy it into `metrics.turns[].classifierTrace` and summarise it as `classifier`. Accounting treats the classifier cost as part of the turn's settled charge and never as a round. The report's Classifier table shows, per arm, the classifier cost per turn, its share of spend, docs tool calls per turn and docs re-rank calls per turn. Cases D1 to D10 are live documentation questions in English and German. Each has a deterministic oracle for its gold fact and passes without a classifier.

The fair classifier retest left these live cases in the registry; their data lives in `heldout-data/` and `guard-live-cases.ts`:

- `DH01` to `DH30` are held-out docs questions, prompted in the user's language with read-only safety checks. Their driver declines every approval. `DH14` asks whether "Deals" can be renamed to "Oportunidades"; the declined approval keeps the workspace unchanged, while `no-mutating-tool-attempt` still fails an episode whose model tries the rename instead of answering.
- `DE01` to `DE30` are the embedding study's held-out docs questions, built, driven and scored like `DH`.
- `RH01` to `RH60` are held-out routing items, scored against the lexicon routing.
- `GC01` to `GC10` (`guard-live-cases.ts`) are same-name regression cases: each seeds same-named candidate records (and, for a clarification reply, the history it answers), approves every approval and records in `oracle.details` which records the turn wrote. The correct behaviour is to ask, or to write exactly the intended records.

## Blind Wiki retrieval benchmark

`wiki-retrieval-benchmark.ts` is a committed, offline dataset for Workspace Wiki retrieval; `loadWikiRetrievalBenchmark()` returns it and `wikiBenchmarkSections()` splits a page into its `##` sections. It needs no database and no model.

- **Corpus:** 40 Wiki pages of a fictional industrial-parts distributor, Hallberg Industrietechnik GmbH: 25 German and 15 English, one Operating Guide, nine procedures with `whenToUse` and thirty knowledge pages, each 150 to 900 words. It covers onboarding, discount rules, returns, warranty, shipping and customs, CRM data hygiene, lead qualification, deal stages, key accounts, escalation, leave and on-call rules, tool access, security, GDPR, invoice disputes, partners and product lines, with deliberate confusers: returns against warranty against invoice disputes, EU against non-EU shipping, three discount pages for different segments, and two onboarding pages.
- **Queries:** 160 short, informal staff questions in English, German, Spanish, French and Italian: 40 lexical, 45 paraphrase, 40 cross-language, 15 typo, 10 multi-hop or ambiguous and 10 no-match.
- **Labels:** each query names its gold targets as a page slug plus the exact text of a `##` heading. The first target is the primary answer; further targets are sections that answer equally well and count as correct. A no-match query has no targets, and the correct result is empty.
- **Blind authoring:** queries and labels were written without reading or running the retrieval implementation or any earlier retrieval result. Do not tune ranking against individual items; change a label only when the corpus text proves it wrong.

`__tests__/wiki-retrieval-benchmark.test.ts` validates the dataset: every gold slug and heading exists, the category and language counts hold, no query is duplicated, cross-language queries differ from the target page's language, lexical queries share a content word with their target, typo queries contain a token absent from the corpus, and paraphrase queries share no content word (four or more letters, case- and accent-folded, outside a small function-word list) with the gold section or its page title. A failing paraphrase check means the query must be rewritten; the function-word list is not a whitelist for content words.

## Retrieval stage selection

Pre-registered before any paid call. The question is which retrieval stages each corpus should run. Full-text search (FTS) always runs; E is the query embedding with reciprocal-rank fusion, J is the Jev re-rank of sections. The four combinations are FTS, FTS+E, FTS+J and FTS+E+J.

- **Corpora:** docs are the 110 labelled documentation questions in `retrieval-eval-cases.ts` (D, DH and DE). The Wiki is the blind benchmark in `wiki-retrieval-benchmark.ts` (160 queries), seeded into a fresh workspace in a temporary database and indexed with real embeddings.
- **Primary metric:** final-section hit@1, whether the first returned section is a gold section. For a no-match query a hit means no result above the pipeline's relevance floor, that is an empty result list.
- **Secondary metrics:** page R@1, R@5 and MRR; per-category (Wiki: lexical, paraphrase, cross-language, typo, multi-hop, no-match; docs: D, DH, DE) and per-language breakdowns; latency p50 and p95.
- **Embedding measured twice:** each query is embedded once and the vector reused. E-unbounded waits for the vector. E-450 uses the shipped 450 ms wait: a vector whose measured call latency exceeded 450 ms counts as unavailable, and that query runs as if the embedding timed out.
- **Decision rule:** per corpus, separately for E-450 (shipped latency) and for E-unbounded, choose the cheapest combination, in the cost order FTS < FTS+E < FTS+J < FTS+E+J, whose primary metric is not significantly worse than the best combination's, by an exact two-sided McNemar test on paired queries at p < 0.05. If the E-unbounded decision differs from the E-450 decision, both are reported; the shipped decision uses E-450 unless the owner changes the embedding wait.
- **Amendment (2026-09-29, after the result):** `reports/2026-09-29-retrieval-stage-selection-5655ec06/report.md` showed that the embedding helps only when its vector arrives: at 450 ms only 29 % of query vectors arrived from the measuring machine (p95 about 1,028 ms), and with the vector docs final-section hit rose from 75.5 % to 98.2 % and the Wiki's from 41.3 % to 85.0 %. The owner therefore raised the shared query-embedding wait (`RETRIEVAL_EMBEDDING_WAIT_MS`) from 450 ms to 1,100 ms for both corpora, and both corpora ship FTS+E+J. `retrieval-eval.ts` now names the shipped-wait mode `E-wait` and reads the wait from that constant, so a rerun measures the current wait; the E-450 figures above stay as recorded.

## Relevance floor

A query with no real answer should return no results. The floor applies only when the query vector arrived and the semantic index covers the whole corpus (every documentation chunk in scope embedded with the query's model, no stale Wiki page), so full-text-only search (self-hosted, no credits, the demo, a late or failed embedding) and search during indexing are unchanged:

- **Kept:** an identifier match, or a full-text match covering at least 90 % of the query's IDF weight (`coverage`, computed over every query unit, including units no page contains).
- **Dropped:** otherwise, when the closest section's cosine similarity is below 0.60. The re-rank is not called.
- **Re-rank decides:** otherwise the Jev spec offers a `none` option ("choose none only if no section answers it at all"); choosing it empties the result. When Jev fails or times out, the results stay.

Thresholds (`RETRIEVAL_RELEVANCE_FLOOR`) were tuned with `retrieval-floor-tuning.ts` on non-blind data only: the live docs cases D1 to D10 and DH, ten docs no-match questions (`DOCS_NO_MATCH_EVAL`), the Wiki quality corpus and queries in `retrieval-eval-cases.ts`, and ten more Wiki no-match questions (`WIKI_NO_MATCH_TUNING`). DE is excluded because its provenance forbids tuning on it. The blind Wiki benchmark and DE were run once afterwards, with the floor and without it, as validation (`retrieval-eval.ts --shipped`). A floor that costs more than 2 points of answerable final-section hit on either corpus is to be loosened on non-blind data, not on the validation sets.

## Findings

- Jev docs re-rank ships on by default: held-out docs pass rose from 84.3 % to 93.0 % (300 pairs, McNemar p = 6e-6). Evidence: `reports/2026-09-27-classifier-live-heldout-6b5570b2/heldout-live.md`.
- On 2026-10-04 an OVHcloud AI Endpoints classifier was measured against Jev for every classifier use. The docs and Knowledge Base re-rank stays on Jev: on 109 captured docs re-rank requests (about 7,800 input tokens each) Jev answered with p50 327 ms and chose a gold section first in 81 of 89 answerable cases, while `Qwen3.8-27B` (`reasoning_effort: "none"`) chose 80 and 78 at p50 about 1.2 s and p95 2.7 to 4.0 s, `Mistral-Small-3.2-24B-Instruct-2506` 77 and 76, and the live documentation contracts passed 29 of 30 with Jev against 25 to 27 of 30 with OVH at a 2,000 ms deadline, at about ten times the cost per call. The website import review moved to OVHcloud (`ee/agent-chat/classifier/ovh-runner.ts`, `Qwen3.8-27B` without reasoning, strict JSON schema, 30 s timeout, context fit against its 262k tokens): on 20 synthesized candidates with 40 sections, three repetitions, it judged 118 of 120 section verdicts correctly as supported or not (Jev 116), accepted none of 54 flawed sections (Jev none) and decided every candidate correctly; Mistral accepted 5 flawed sections and Qwen with low reasoning took about 8 s per review.
- Docs embedding candidates before the re-rank tied live (93.2 % against 92.5 %, p = 0.52) while `search_docs` p95 rose from 0.76 to 1.92 s. That code was removed. The unified retrieval pipeline below brings embeddings back for docs as part of one pipeline shared with the Workspace Wiki, and ships only if the live A/B below passes.
- The toolset routing classifier and the guard classifier failed their gates and were removed.
- The runtime same-name guard was removed: 300 live same-name episodes showed no wrong-record write that needed it as the primary defence, and its word lists falsely blocked 10 of 32 paraphrases.
- The full evidence (pre-registration, held-out sets, analysis scripts and all reports) is archived at tag `archive/pr-184-evidence`.

## Unified retrieval

`search_docs`, `get_docs_page`, `manage_wiki_pages` search and MCP `search` run one pipeline (`core/retrieval/`):
PostgreSQL full-text search with the built-in `simple` and language configurations, and in parallel one query embedding
with the Wiki's model (cached per workspace, shared across concurrent calls), then reciprocal-rank fusion with identifier
pinning, then the Jev re-rank of sections on hosted Mate. Without credits, self-hosted, without a Gateway key or in the
demo it is full-text only; a query embedding slower than 1,100 ms (its vector is still cached for the next call) or failing,
and a failing or slow re-rank, keep the fused or full-text order. It replaced the hand-tuned docs keyword ranker and the
Wiki's BM25, spelling-suggestion and hybrid ranking after the live A/B in
`reports/2026-09-28-retrieval-ab-63a7186a/report.md`; that code is gone, so there is no second pipeline to switch to.

- Documentation is stored as one global chunk set per documentation build (`DocsChunk`, keyed by the build hash of the
  section-chunked English and German docs and REST reference). The first search of a process writes a missing build
  (full-text needs it); embeddings are computed by the `index-docs-chunks` workflow, which the first search dispatches when
  chunks lack an embedding, reuses the vector of any chunk with the same content hash, and bills nothing to customers.
  `yarn docs:index` does the same synchronously; `yarn docs:index --full-text-only` only writes the chunks.

Every hosted turn records per-call retrieval timings in its classifier trace, and the report's Retrieval latency table
shows p50/p95 per arm and corpus, with the embedding and re-rank outcomes.

To compare a retrieval change live, build the baseline commit and the candidate commit, and run the same cases against a
server from each build as separate variants of one campaign, stopping one server before starting the other:

```sh
yarn docs:index                                          # platform cost: embeds the documentation once
yarn agent:benchmark campaign --label retrieval-regression --cap <usd>
LOCAL_AGENT_BENCHMARK=true AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" yarn next start -p 4107   # baseline build
yarn agent:benchmark run --campaign <id> --cases <D, DH and DE ids> --reps 3 --variant retrieval-baseline
LOCAL_AGENT_BENCHMARK=true AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" yarn next start -p 4107   # candidate build
yarn agent:benchmark run --campaign <id> --cases <same ids> --reps 3 --variant retrieval-candidate
yarn agent:benchmark judge --campaign <id>
yarn agent:benchmark report --campaign <id> --label retrieval-regression
```

Offline, `features/mcp-tools/__tests__/docs-retrieval-quality.database.test.ts` measures page recall, section hit and
re-rank candidate recall on D1 to D10, DH and DE (labels in `retrieval-eval-cases.ts`) and the docs audit golden
questions, and `features/wiki/__tests__/wiki-retrieval-quality.database.test.ts` measures the Wiki eval set in the same
file, each full-text only against a floor. Set `DOCS_RETRIEVAL_EVAL_REPORT` or `WIKI_RETRIEVAL_EVAL_REPORT` to a path to
write the metrics.

Those tests use a fake embedder and no re-rank. `retrieval-eval.ts` runs the retrieval stage selection above: every
stage combination (FTS, FTS+E, FTS+J, FTS+E+J) under E-wait (the shipped `RETRIEVAL_EMBEDDING_WAIT_MS`) and E-unbounded,
with the relevance floor, the real query embedding and the real Jev re-rank, for the 110 docs labels plus the 10 docs
no-match questions and for the blind Wiki benchmark, which it seeds into a throwaway workspace, embeds and deletes again.
Each query is embedded once and the vector reused; its measured call latency decides E-wait, and a Jev call is cached per
query and candidate set. It reports final-section hit@1, page R@1, R@5 and MRR, per-set, per-category and per-language
breakdowns, paired exact McNemar against the best combination with the pre-registered decision, and a modelled latency
per call (local pipeline time, plus the embedding wait beyond full-text, plus the measured Jev call). `--shipped` runs
only the shipped FTS+E+J under E-wait, with and without the relevance floor, and reports answerable final-section hit,
no-match empty rate and the paired floor cost. Run `yarn docs:index` first, then
`RUN_AGENT_BENCHMARK=true yarn tsx --import ./scripts/lib/register-server-only-shim.mjs scripts/agent-benchmark/retrieval-eval.ts --cap 0.5`
(`--only docs` or `--only wiki` to run one corpus). It writes JSON and Markdown under `.runs/retrieval-eval/`; compare
two commits by running it on each. `retrieval-floor-tuning.ts` (same command, `--cap 0.3`) records the floor's signals on
the non-blind tuning sets with the floor off and prints the threshold grid; `--analyse <signals.json>` reprints the grid
without paid calls.

For a live comparison, `retrieval-ab.ts --campaign <id> --control retrieval-baseline --candidate retrieval-candidate`
grades each DH and DE episode with the stage-4 gold-fact judge (reserved against the campaign cap, verdicts cached in the
campaign's `.runs` directory) and prints pass per variant with paired McNemar, credits per turn, `search_docs` p50/p95 and
first output p50/p95. Pass `--no-judge` to reuse cached verdicts only. It counts an episode whose only failed check is
`integrity:correctRoute` as passing when every turn used the agent model and the only other usage is the
query-embedding charge, which keeps artifacts recorded before that check excluded retrieval usage comparable.

Commands (`yarn agent:benchmark <command>`):

- `arms`, `cases`: list arms and cases. Counts always come from this live registry rather than a number copied into
  documentation.
- `verify-arms`: read the Gateway endpoint listing and record which arms report ZDR and no-training; excluded arms never run. OVHcloud AI Endpoints arms (`ovh-*`, served directly with `servingProvider: "ovh"`) never query the Gateway: they are eligible from the recorded attestation `OVH_AI_ENDPOINTS_ATTESTATION` in `ee/agent-chat/ovh-ai-endpoints-catalog.ts` while the model is still listed in OVH's public `/v1/models` catalog. Running an OVH arm also needs `OVH_AI_ENDPOINTS_API_KEY` in the environment of the application server and the CLI.
- `check --label pr-182-final --cap 20`: create (or, with `--campaign`, resume) a one-repetition merge run over every
  case with the shipped control resolved from `SHIPPED_AGENT_MODEL`. The model-pinning contract R49
  selects the benchmark-only overlay model `bench:flash-low` (Gemini 3.5 Flash on Vertex EU, a different model from the
  shipped control) on turn 1, omits the model on turn 2, and passes only when both turns and every round ran on that
  pinned model; this needs the server to run with the benchmark overlay. All other cases use the shipped control. The
  cap defaults to $20 and must cover the largest single-episode reservation, which R49's pinned Flash model sets at about
  $16 up front; a smaller cap, or a resumed campaign with one, stops the check before any episode runs and names the
  minimum instead of letting R49 be skipped. The check requires a clean Git tree and a production server that reports
  the same source commit. It exits nonzero for failed strict release regressions, shared safety/runtime-integrity failures,
  skipped, missing or errored episodes. Stochastic answer-quality misses remain visible in the same report without
  turning one model-variance sample into a code-regression failure.
- `campaign --label screening --cap 200`: open a campaign with a hard USD cap. Every episode reserves 32
  full-context provider rounds per prompt and gives its synthetic enterprise seat exactly the same aggregate credit
  ceiling, so multi-turn work cannot spend past the admitted amount.
- `run --campaign <id> --cases S1,M7 --reps 1 --variant baseline`: seed a fresh fixture per episode, drive the turns,
  observe, score and record the measured cost. Omitting `--arms` runs only the shipped control, and existing episodes
  are never re-run.
- Add `--arms shipped,flash-lite-medium` to a run when you explicitly want a comparison between the shipped control and
  another arm. Multi-arm runs default to comparative cases; shipped-only runs also include runtime contracts.
- `recover --campaign <id> --arm shipped --case S1 --repetition 1 --variant merge`: after verifying that an interrupted
  process is gone, mark exactly one stranded `prepared` or `running` ledger episode as failed so the normal `run` or
  `check --campaign` path can retry it. Recovery atomically refuses while the fixture actor has a nonterminal Agent turn
  or run lease, never reopens scored or skipped evidence, and preserves every conservative charge from the interrupted
  attempt. `run` and `check` leave stranded rows unchanged; they never invoke recovery implicitly.
- `judge --campaign <id>`: grade comparative answer-quality cases only. Every judge call reserves its conservative
  worst-case cost against the campaign cap before the paid request, then settles the reservation to measured cost. The
  command exits nonzero until every eligible artifact has a complete two-judge verdict.
- `report --campaign <id> --label matrix`: write
  `reports/<date>-<label>-<campaign-prefix>/report.md|json` with the selection rule applied. Including the campaign id
  keeps a second run with the same label from overwriting historical evidence.

The CLI runs under `tsx` with `scripts/lib/register-server-only-shim.mjs`, a resolve hook that maps `server-only` to the test shim so the product graph loads outside Next.js.

Raw artifacts live under `.runs/<campaign>/<variant>/<arm>/<case>-r<n>.json` (ignored by git); committed reports live under `reports/`.
Before every paid episode, the ledger atomically reserves the USD value of its hard episode credit ceiling; the fixture
subscription enforces that same ceiling across all turns. A completed episode replaces that reservation with measured
turn charges, while an interrupted or uncertain episode keeps the conservative reservation.

Artifacts record their schema and fixture version, source commit and dirty state, complete arm and effective model
configuration, plus every turn's locale, page route, structured context attachments, requested model key, server source
commit and stream interaction.
Historical reports remain evidence for the code, model and suite that produced them; they do not replace a fresh
`check` on the current tree. The production build compiles its Git source identity into the benchmark-only response
header. A dirty build is marked `dirty:<commit>`, and a build without verifiable Git metadata is marked `unknown`, so
neither can pass the clean-current-HEAD equality check. Rebuild before starting the server; changing a runtime variable
cannot make stale `.next` output claim the current checkout.
