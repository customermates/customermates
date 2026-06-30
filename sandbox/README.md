# Sandbox executor (AWS Lambda MicroVM image)

Runs the agent's `run_code` programs in an isolated MicroVM. **Not** part of the
Next.js app deploy — built and pushed separately, then referenced by the CDK
stack in [`../infra/code-exec`](../infra/code-exec).

## What it is

- `Dockerfile` — ARM64 image (Lambda MicroVMs are ARM64-only) with Python
  (pandas/numpy, pinned) + Node 22.
- `runner/server.mjs` — HTTP host. `POST /run` (auth: `x-executor-key`) executes
  one program and returns a `RunCodeReport`.
- `runner/harness.py` / `runner/harness.mjs` — per-language harness. Exposes the
  read-only `crm` client, runs the user program, prints a `__SANDBOX_RESULT__`
  sentinel with `{status, result, error}`.

## Contract

Request body (`POST /run`) = `ExecutorRunInput` from the app
(`features/code-exec/sandbox.types.ts`):

```jsonc
{ "language": "python" | "javascript", "code": "...", "timeoutMs": 20000,
  "memoryMb": 256, "maxOutputBytes": 64000,
  "brokerUrl": "https://app/api/v1/sandbox/data", "runToken": "<hmac>" }
```

Response = `RunCodeReport` (`{status, stdout, result, error, files, durationMs, truncated, exitCode}`).

The user program gets a `crm` client (read-only):
`crm.list(entity, {filters,searchTerm,page,pageSize})`, `crm.count(entity,{filters})`,
`crm.search(searchTerm,{entities,limitPerEntity})`, `crm.get(entity,id)`,
`crm.configuration(entity)` — `entity` ∈ contact|organization|deal|service|task.
In **Python** `crm` is synchronous; in **JavaScript** it is `async` (await it).
Assign `result = ...` to return a value; `print`/`console.log` is captured as stdout.

## Guarantees enforced here (in-VM)

- Subprocess env contains ONLY `SANDBOX_BROKER_URL` + `SANDBOX_RUN_TOKEN` — never
  `EXECUTOR_API_KEY` or any host secret.
- `ulimit -v` address-space cap, wall-clock timeout (SIGKILL), output-size cap.
- No runtime package installs (no network except the broker).

## Guarantees enforced by the CDK stack (NOT here)

- **Deny-by-default network egress** — private subnet, no NAT; only the broker is
  reachable. This is the real network wall; the runner only *uses* the broker URL.
- Per-run MicroVM (no cross-tenant reuse), zero-DB IAM role, reserved concurrency.

## Build & push

```sh
docker build --platform linux/arm64 -t <ecr-repo>:<tag> .
docker push <ecr-repo>:<tag>
```

Then point the CDK stack's image at `<ecr-repo>:<tag>` and deploy.

## Env on the executor

- `PORT` (default 8080)
- `EXECUTOR_API_KEY` — shared secret the app sends as `x-executor-key`. Set this
  on the MicroVM (e.g. from Secrets Manager via the CDK stack) and as
  `SANDBOX_EXECUTOR_API_KEY` on the app.

## Not yet implemented (Phase 2)

- File/chart artifacts (`files[]`) — the report type supports it; the runner
  currently returns `files: []`. Wire matplotlib output → upload → URLs next.
