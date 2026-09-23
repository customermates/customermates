# Agent benchmark

Local-only quality, cost and latency benchmark for the hosted Assistant. It drives the real application over
`/api/agent/messages` against synthetic fixture companies in the disposable local database, scores every episode with
deterministic oracles (database state plus answer checks), grades the final answers with two arm-blind judge models, and
reports pass rate, pass^3, cost per successful task, cache share, rounds and latency per arm with Holm-corrected pairwise
comparisons against the shipped configuration. The knowledge base owns the procedure and the reading guide; this file
only lists the commands.

This is the only live-model Assistant harness. Its case registry covers answer quality, saved views, UI commands,
approvals, cancellation, stream recovery, model pinning and usage accounting. `yarn agent:benchmark check` is the
shipped-model merge gate; the lower-level campaign commands run resumable model experiments from the same registry,
driver, fixtures and oracles.

Requirements: the sandbox worktree with its loopback PostgreSQL, `.env` with `AI_GATEWAY_API_KEY`, `RUN_AGENT_BENCHMARK=true`,
and the application started in production mode with the benchmark model overlay:

```sh
export WORKFLOW_LOCAL_BASE_URL=http://localhost:4107
export WORKFLOW_LOCAL_DATA_DIR="$PWD/.next/workflow-data"
yarn build
LOCAL_AGENT_BENCHMARK=true \
AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" \
yarn next start -p 4107
```

The `shipped` control resolves through `MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY]`, the same production catalog entry used
by the Assistant. The overlay contains only the experimental arms, so it cannot replace or drift from that control.

`WORKFLOW_LOCAL_BASE_URL` and `WORKFLOW_LOCAL_DATA_DIR` must be exported for the server. The benchmark bootstrap preserves
an explicit data directory or defaults the CLI to the same absolute `.next/workflow-data` directory that Next uses. The
shared directory lets direct approval, UI-command and cancellation responders see the server's durable hooks. The CLI
also forces `WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=false`, so its secondary worker cannot recover or enqueue the server's
active runs. When using a custom directory, start the server and CLI with that same value (and set
`WORKFLOW_TARGET_WORLD=local` so the Next plugin preserves it).

The base URL is required in both processes because the CLI's secondary worker posts durable steps over HTTP. Without it,
the worker probes for a port, and a probe that fails mid-campaign sends every step it picked up into a long backoff.

Run nothing else against the same database while a campaign runs. Any other application process on this machine — a development server left running in a second worktree — executes the durable workflow steps of your run with its own code, so the model is offered that tree's tool catalog and prompt. The symptom is a turn that calls a tool this build does not define; the driver now fails the episode with that explanation instead of scoring it. Either stop the other process or give the run its own database.

Every command exits the process when it finishes: loading the product graph starts a workflow worker that would otherwise keep the run alive indefinitely after the last episode.

`--variant <label>` groups a run's artifacts and report rows under a label of your choice; the application has one runtime, so the label records what you changed between runs rather than selecting a code path.

Commands (`yarn agent:benchmark <command>`):

- `arms`, `cases`: list arms and cases. Counts always come from this live registry rather than a number copied into
  documentation.
- `verify-arms`: read the Gateway endpoint listing and record which arms report ZDR and no-training; excluded arms never run.
- `check --label pr-182-final --cap 10`: create (or, with `--campaign`, resume) a one-repetition merge run over every
  case using `MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY]`. It requires a clean Git tree and a production server that reports
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
configuration, plus every turn's locale, page route, requested model key, server source commit and stream interaction.
Historical reports remain evidence for the code, model and suite that produced them; they do not replace a fresh
`check` on the current tree. The production build compiles its Git source identity into the benchmark-only response
header. A dirty build is marked `dirty:<commit>`, and a build without verifiable Git metadata is marked `unknown`, so
neither can pass the clean-current-HEAD equality check. Rebuild before starting the server; changing a runtime variable
cannot make stale `.next` output claim the current checkout.
