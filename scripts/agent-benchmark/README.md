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
yarn build
WORKFLOW_LOCAL_BASE_URL=http://localhost:4107 LOCAL_AGENT_BENCHMARK=true AGENT_BENCHMARK_ARMS="$(yarn -s agent:benchmark overlay)" yarn next start -p 4107
```

`WORKFLOW_LOCAL_BASE_URL` is not optional here: the workflow queue otherwise probes for its own port, and when that probe fails mid-campaign every durable step retries with backoff and the run stalls behind a job whose next attempt is hours away.

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
