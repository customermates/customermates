# Agent benchmark

Local-only quality, cost and latency benchmark for the hosted Assistant. It drives the real application over
`/api/agent/messages` against synthetic fixture companies in the disposable local database, scores every episode with
deterministic oracles (database state plus answer checks), grades the final answers with two arm-blind judge models, and
reports pass rate, pass^3, cost per successful task, cache share, rounds and latency per arm with Holm-corrected pairwise
comparisons against the shipped configuration. The knowledge base owns the procedure and the reading guide; this file
only lists the commands.

Requirements: the sandbox worktree with its loopback PostgreSQL, `.env` with `AI_GATEWAY_API_KEY`, `RUN_AGENT_BENCHMARK=true`,
and the application started in production mode with the benchmark model overlay:

```sh
export WORKFLOW_LOCAL_BASE_URL=http://localhost:4107
export NEXT_PUBLIC_SENTRY_DSN=
yarn build
LOCAL_AGENT_BENCHMARK=true AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" yarn next start -p 4107
```

`NEXT_PUBLIC_SENTRY_DSN` must be empty for the build and the server. With a DSN set, a production build sends every workflow failure to Sentry and prints nothing, so a turn that fails locally leaves no trace in the server log; the empty value also keeps the build from wrapping the Sentry source-map upload.

`WORKFLOW_LOCAL_BASE_URL` must be exported for the CLI as well as the server, because loading the product graph starts a second workflow worker inside the CLI process and that worker posts durable steps over HTTP. Without the variable it probes for a port, and a probe that fails mid-campaign sends every step it picked up into a backoff whose next attempt is hours away: a run stalled after 31 episodes this way.

Run nothing else against the same database while a campaign runs. Any other application process on this machine — a development server left running in a second worktree — executes the durable workflow steps of your run with its own code, so the model is offered that tree's tool catalog and prompt. The symptom is a turn that calls a tool this build does not define; the driver now fails the episode with that explanation instead of scoring it. Either stop the other process or give the run its own database.

Every command exits the process when it finishes: loading the product graph starts a workflow worker that would otherwise keep the run alive indefinitely after the last episode.

`--variant <label>` groups a run's artifacts and report rows under a label of your choice; the application has one runtime, so the label records what you changed between runs rather than selecting a code path.

Commands (`yarn agent:benchmark <command>`):

- `arms`, `cases`: list arms and cases.
- `verify-arms`: read the Gateway endpoint listing and record which arms report ZDR and no-training; excluded arms never run.
- `campaign --label screening --cap 200`: open a campaign with a hard USD cap enforced before every episode.
- `run --campaign <id> --arms shipped,flash-lite-low --cases S1,M7 --reps 1 --variant baseline`: seed a fresh fixture per episode,
  drive the turns, observe, score and record the measured cost. Existing episodes are never re-run.
- `judge --campaign <id>`: grade the final answers; charges count against the cap.
- `report --campaign <id> --label matrix`: write `reports/<date>-<label>/report.md|json` with the selection rule applied.

The CLI runs under `tsx` with `scripts/lib/register-server-only-shim.mjs`, a resolve hook that maps `server-only` to the test shim so the product graph loads outside Next.js.

Raw artifacts live under `.runs/<campaign>/<variant>/<arm>/<case>-r<n>.json` (ignored by git); committed reports live under `reports/`.
