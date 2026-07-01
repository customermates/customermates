# Sandbox executor image

Runs the agent's `run_code` programs in an isolated execution environment. **Not**
part of the Next.js app deploy — packaged as a zip (this whole directory) and
uploaded to S3 by the CDK stack in [`../infra/code-exec`](../infra/code-exec), which
builds it into an `AWS::Lambda::MicrovmImage`. No separate `docker build`/`docker
push` step; `cdk deploy` handles packaging.

## What it is

- `Dockerfile` — ARM64 container image (the only architecture MicroVMs support) with
  Python (pandas/numpy, pinned) + Node 22. Lambda runs this `Dockerfile` inside a
  MicroVM, then snapshots the fully-initialized environment.
- `runner/server.mjs` — plain HTTP server, `POST /run` executes one program and
  returns a `RunCodeReport`. **No app-level auth check** — AWS validates a per-run
  JWE token and strips it before the request reaches this process (see the infra
  README's "Ingress" section); there is no shared secret here to check or rotate.
- `runner/harness.py` / `runner/harness.mjs` — per-language harness. Exposes the
  `crm` client, runs the user program, prints a `__SANDBOX_RESULT__` sentinel with
  `{status, result, error}`.

## Contract

Request body (`POST /run`) = `ExecutorRunInput` from the app
(`features/code-exec/sandbox.types.ts`):

```jsonc
{
  "language": "python" | "javascript" | "bash", "code": "...", "mode": "DATA" | "NET",
  "timeoutMs": 20000, "memoryMb": 256, "maxOutputBytes": 64000,
  "brokerUrl": "https://app/api/v1/sandbox/data", "runToken": "<hmac>",
  "inputFiles": [{ "name": "data.csv", "dataBase64": "..." }]
}
```

Response = `RunCodeReport` (`{status, stdout, result, error, files, durationMs, truncated, exitCode}`).
`files[]` are artifacts the program wrote to its workspace (charts, exports) —
collected, base64-encoded, and returned; the app stores them out-of-band and only
ever surfaces a URL to the model/UI, never the bytes. `inputFiles[]` are written into
the workspace *before* the program runs and excluded from that collection.

In **DATA** mode the user program gets a `crm` client:
`crm.list(entity, {filters,searchTerm,page,pageSize})`, `crm.count(entity,{filters})`,
`crm.search(searchTerm,{entities,limitPerEntity})`, `crm.get(entity,id)`,
`crm.configuration(entity)` (read-only; `entity` ∈ contact|organization|deal|service|task),
and `crm.run_tool(name, args)` — invokes any backend tool server-side with the user's
permissions (read-only unless the run was started with `allowWrite:true`; real
mutations when it was). In **NET** mode `crm` is unavailable (no run token is minted)
but the sandbox can reach the allowlisted internet via the egress proxy.
In **Python** `crm` is synchronous; in **JavaScript** it is `async` (await it).
Assign `result = ...` to return a value; `print`/`console.log` is captured as stdout.

## Guarantees enforced here (in-VM)

- Subprocess env contains ONLY `SANDBOX_BROKER_URL`, `SANDBOX_RUN_TOKEN`, and (when
  this run's mode has one) a mode-scoped `HTTPS_PROXY`/`HTTP_PROXY` — never any host
  secret. There is no host secret to leak in the first place: ingress auth is AWS's
  JWE token, validated and stripped before this process ever sees the request.
- `ulimit -v` address-space cap, wall-clock timeout (SIGKILL), output-size cap.
- No runtime package installs — pandas/numpy are pinned at image-build time.

## Guarantees enforced by the CDK stack (NOT here)

- **Deny-by-default network egress**, per mode — DATA-mode MicroVMs can reach only a
  proxy allowlisting the broker's hostname; NET-mode MicroVMs only a proxy
  allowlisting package registries. See the infra README's "Run modes" section for
  why both modes go through *a* proxy (the broker is a public hostname, not a
  VPC-local address a security group could reference directly).
- Fresh MicroVM per run, terminated right after — no state, and no tenant's run
  shares a VM with another's.

## Local/dev use

`server.mjs` runs standalone with plain `node server.mjs` (`PORT` env var, default
8080) — no AWS involved. Point `SANDBOX_EXECUTOR_URL` (and optionally
`SANDBOX_EXECUTOR_URL_NET`) at it for local testing; the app's
`LocalExecutorHttpClient` talks to it directly over plain HTTP with no auth. This is
for loopback/local testing only — it is not internet-safe to expose as-is (there's
no ingress auth at all outside the MicroVM substrate's native JWE tokens).

## Env on the executor

- `PORT` (default 8080).
- `SANDBOX_DATA_PROXY_URL` / `SANDBOX_NET_PROXY_URL` — baked in at MicroVM-image
  build time (see the CDK stack); non-secret, just the two proxies' private DNS
  addresses. `server.mjs` forwards whichever one matches the run's `mode` into the
  subprocess as `HTTPS_PROXY`/`HTTP_PROXY`; unset locally (no proxy) unless you set
  them yourself.
- `SANDBOX_BROKER_URL` / `SANDBOX_RUN_TOKEN` — passed per-run in the request body,
  not baked into the image's env.
