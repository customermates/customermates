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

Requirements: the sandbox worktree with its loopback PostgreSQL, `.env` with `AI_GATEWAY_API_KEY`, `RUN_AGENT_BENCHMARK=true`,
and the application started in production mode with the benchmark model overlay:

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

The `shipped` control resolves through `MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY]`, the same production catalog entry used
by the Assistant. The overlay contains only the experimental arms, so it cannot replace or drift from that control.

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

Hosted Mate's docs re-rank uses the same mechanism. `AGENT_DOCS_RERANK` (`jev`, the default, or `off`) is a server environment variable, so restart the server with the setting under test and run with a matching label, for example `--variant docs-v2-jev` against `--variant off`. Each turn that calls the re-rank stores a classifier trace (docs re-rank calls, answers and auxiliary cost; never text). Episodes copy it into `metrics.turns[].classifierTrace` and summarise it as `classifier`. Accounting treats the classifier cost as part of the turn's settled charge and never as a round. The report's Classifier table shows, per arm, the classifier cost per turn, its share of spend, docs tool calls per turn and docs re-rank calls per turn. `AGENT_DOCS_CANDIDATES` (`keyword`, the default, or `hybrid`) and `AGENT_DOCS_EMBEDDING_MODEL` (`qwen3-8b` or `google-multilingual`) select the candidate sections the re-rank sees, the same way; a hybrid server needs the section embeddings, which `yarn docs:embeddings <model>` caches under `generated/docs-embeddings` before the server starts, and its turns add a `docsEmbedding` entry to the classifier trace. Cases D1 to D10 are live documentation questions in English and German. Each has a deterministic oracle for its gold fact and passes without a classifier.

The fair classifier retest (`classifier-eval/heldout/PREREGISTRATION.md`) kept docs re-rank v2 on Jev and removed the toolset routing classifier and the guard variants after they failed their gates; the reports under `reports/2026-09-27-*`, `reports/2026-09-28-gate-c-latency-3a3c9ac5` and `reports/2026-09-28-m8-recheck-6ef5ab7d` stay as their evidence. Its live cases stay in the registry:

- `DH01` to `DH30` are the held-out docs questions, prompted in the user's language with read-only safety checks. Their driver declines every approval. `DH14` asks whether "Deals" can be renamed to "Oportunidades"; renaming record types asks for approval, so the declined approval keeps the workspace unchanged and `business-state-unchanged` holds, while `no-mutating-tool-attempt` still fails an episode whose model tries the rename instead of answering.
- `RH01` to `RH60` are the held-out routing items, now scored against the lexicon routing alone.
- `DE01` to `DE30` are the embedding-candidate study's held-out docs questions (Amendment 4), built, driven and scored like `DH`.
- `GC01` to `GC10` (`guard-live-cases.ts`) are the pre-registered live Gate C guard items: each seeds its same-named candidate records (and, for a clarification reply, the conversation history it answers), approves every approval and records in `oracle.details` which records the turn wrote.

The analysis scripts that reproduce the kept results run under `tsx` with the server-only shim and need `APP_MODE` in the environment (run them with `APP_MODE=cloud`): `classifier-eval/heldout-run/docs.ts` (the offline held-out docs bank; it compares Jev and Gemini, so the Gemini classifier runner stays for it) and `heldout-run/report.ts`, `classifier-eval/heldout-live/analyse.ts` (stage 4), `heldout-live/gate-c-latency.ts` (Gate C and the ABAB latency recheck) and `heldout-live/m8-recheck.ts` (the M8 recheck). The offline v1 docs, routing and guard scorers were removed with the code they scored.

Commands (`yarn agent:benchmark <command>`):

- `arms`, `cases`: list arms and cases. Counts always come from this live registry rather than a number copied into
  documentation.
- `verify-arms`: read the Gateway endpoint listing and record which arms report ZDR and no-training; excluded arms never run.
- `check --label pr-182-final --cap 10`: create (or, with `--campaign`, resume) a one-repetition merge run over every
  case with the shipped control resolved from `MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY]`. The model-pinning contract R49
  intentionally requests the catalog's `fast` key before proving the conversation remains pinned to that selection; all
  other cases use the shipped control. The check requires a clean Git tree and a production server that reports
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
