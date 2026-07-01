# Code-exec infrastructure

Portable CDK artifact for the `run_code` sandbox. **Move this `infra/` directory
into your infra/CDK repo** — it is authored here for convenience and is not wired
into the app's build (excluded from the app's `tsconfig`/`.eslintignore`; has its
own `package.json`/`cdk.json` — see [`../package.json`](../package.json)). The app
talks to the deployed executor over HTTPS; the executor reaches CRM data only
through the app's read-only broker.

## Compute substrate

**AWS Lambda MicroVMs** — Firecracker-based, snapshot-started VMs with a dedicated
public HTTPS endpoint per instance, purpose-built for AI code-execution sandboxes.
Confirmed real and live via
[the AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-microvms-guide.html)
and the published `@aws-sdk/client-lambda-microvms` / `@aws-sdk/client-lambda-core`
SDKs — not to be confused with `AWS::Lambda::CapacityProvider` (a different,
unrelated Lambda feature for scaling regular request/response functions onto
per-tenant EC2 compute, which an earlier draft of this stack mistakenly used).

This stack builds **one** `AWS::Lambda::MicrovmImage` from
[`../../sandbox`](../../sandbox). The app runs a **fresh MicroVM per code-exec
request** (`RunMicrovmCommand`) and terminates it right after
(`TerminateMicrovmCommand`) — see
[`features/code-exec/executor-client.ts`](../../features/code-exec/executor-client.ts).
No pooling or reuse across runs: a shared, resumed MicroVM would need its own
careful per-tenant state-reset story to stay safe; "fresh VM per run" gets tenant
isolation for free, at the cost of a per-run startup latency (snapshot-based, so
fast, but not free).

**CDK support is L1-only** — `aws-cdk-lib@2.260.0` has no typed construct yet for
`AWS::Lambda::MicrovmImage` / `AWS::Lambda::NetworkConnector` (~3-week-old resource
types as of 2026-07), so this stack uses the `CfnResource` escape hatch, with every
property shape taken directly from
`aws cloudformation describe-type --type RESOURCE --type-name AWS::Lambda::MicrovmImage`
(and `...NetworkConnector`) — not guessed from the CLI docs, which are looser about
what's actually required.

### Region

MicroVMs is **not yet live in every region** for every account — checked directly
against the data-plane API (`list-managed-microvm-images`), not just the CFN type
registry (which reports the resource type as public everywhere, independent of
actual rollout). As of 2026-07, for this account: `eu-central-1` (the rest of this
app's usual region) returns `AccessDeniedException`; `us-east-1` and `eu-west-1`
both work. [`../bin/code-exec.ts`](../bin/code-exec.ts) defaults to `eu-west-1` —
re-check with `aws lambda-microvms list-managed-microvm-images --region <region>`
before picking a different one.

### Why this stack owns its own VPC

The read-only broker is reached over the **public internet**
(`SANDBOX_BROKER_URL`, defaults to the app's own `BASE_URL` — see
[`env.ts`](../../env.ts)), not a VPC-local address. So the sandbox's egress
connectors have no reason to share a VPC with the rest of the app — this stack
provisions its own small VPC (`SandboxVpc`) purely to host the two CONNECT-allowlist
proxies + the connectors' ENIs. That also removes the "look up an existing app VPC
with the right subnet tiers" dependency that caused synth friction in an earlier
draft.

## Run modes — data XOR internet (the exfiltration wall)

A run is provisioned in exactly one mode, chosen by which egress connector the app
passes to `run-microvm` for that request (see `MicrovmExecutorClient.run` in
`executor-client.ts`). Both modes ultimately egress through *a* CONNECT-allowlist
Squid proxy — there's no VPC-local IP to write a security-group rule against a
public HTTPS hostname, so "reach only the broker" has to be enforced the same way as
"reach only pypi/npm": an allowlist, just a one-host allowlist for DATA.

| Mode | Egress connector | Proxy allowlist | Reaches | Token |
| --- | --- | --- | --- | --- |
| **DATA** (default) | `DataNetworkConnector` | the broker's hostname ONLY (`brokerHostname` prop) | CRM data via the broker | minted |
| **NET** | `NetNetworkConnector` | `egressAllowlist` prop (default: pypi/npm registries) | allowlisted internet | **none** |

```
DATA run ─▶ DataNetworkConnector's ENIs ─▶ Data proxy (Squid, allowlist=[broker]) ─(443)─▶ the broker, nothing else
NET run  ─▶ NetNetworkConnector's ENIs  ─▶ Net proxy  (Squid, allowlist=[pypi,npm,...]) ─(443)─▶ allowlisted hosts, NOT the broker
```

- Both proxies are the same image ([`./proxy`](./proxy)), CONNECT-only, allowlist
  built from the `ALLOWLIST` env var at container start (`./proxy/entrypoint.sh`) —
  just deployed twice with different allowlists. Access is logged (target host) to
  CloudWatch.
- The MicroVM image bakes in both proxies' private DNS names as
  `SANDBOX_DATA_PROXY_URL`/`SANDBOX_NET_PROXY_URL` env vars (non-secret — just
  hostnames). Which one (if either) gets forwarded into the sandboxed subprocess as
  `HTTPS_PROXY`/`HTTP_PROXY` is decided **per run**, by `sandbox/runner/server.mjs`,
  based on that run's `mode` — not baked in, since env vars are image-level/static
  but the mode varies per run. Defense in depth either way: a DATA-mode run's egress
  connector has no network path to the NET proxy (or vice versa), so even a
  wrongly-forwarded proxy URL would just fail to connect.
- NET-mode runs mint **no broker token** — so `crm` is unavailable in the sandbox and
  CRM data cannot leave via that path either.
- **Harden (Phase 2):** IMDSv2 + hop-limit 1 (N/A inside a MicroVM the same way as an
  EC2 instance, but check the equivalent), post-DNS-resolution IP re-check in the
  proxy, private package mirror, egress-volume anomaly alerting. A combined
  **DATA+NET** mode is deliberately NOT built — it re-opens the trifecta and needs
  separate, louder approval.

## Ingress — how the app reaches a running MicroVM

Not handled by this stack at all: each MicroVM gets a public, AWS-managed HTTPS
endpoint (`mvm-xxx.lambda-microvm.<region>.on.aws`), opened via the AWS-managed
`ALL_INGRESS` connector (referenced by ARN in `executor-client.ts`, not created
here). Authentication is a per-run JWE token
(`CreateMicrovmAuthTokenCommand` → `X-aws-proxy-auth` header) that AWS validates and
strips **before** the request reaches the container — the container has zero
visibility into it. There is no shared secret to configure or rotate (the old
`x-executor-key` scheme is gone).

## Deploy

This directory is a standalone CDK app (own `package.json`/`cdk.json`), not tied to
the Next.js app's build.

1. Install deps once: `npm install` (in `infra/`).
2. `cdk synth` / `cdk deploy` with your real values (context flags or edit
   [`../bin/code-exec.ts`](../bin/code-exec.ts) directly):
   ```sh
   npx cdk deploy CodeExecStack \
     -c brokerHostname=app.yourdomain.com \
     -c baseImageVersion=0
   ```
   The Dockerfile + `runner/` are zipped and uploaded to S3 automatically (a CDK
   `Asset`) — no separate `docker build`/`docker push` step, unlike the old
   ECR-image-URI flow.
3. Confirm `baseImageVersion` against your account before deploying —
   `aws lambda-microvms list-managed-microvm-image-versions --image-identifier arn:aws:lambda:<region>:aws:microvm-image:al2023-1`
   (returned `"0"` for this account/region as of 2026-07; a newer version may exist
   by the time you deploy).
4. Verify the **`NetworkConnectorOperatorRole`** trust principal/permissions
   (inferred from AWS's networking guide's IAM example — no AWS-managed policy
   exists yet for this brand-new resource type) against AWS's official guide before
   this first deploy. CloudFormation will reject an insufficient trust/permission
   set loudly, not silently.

## Wire the app (env vars)

Set on the Next.js app after deploy (values from the stack outputs):

| Var | Value |
| --- | --- |
| `SANDBOX_CODE_EXEC_ENABLED` | `true` |
| `SANDBOX_MICROVM_REGION` | the region you deployed to (e.g. `eu-west-1`) |
| `SANDBOX_MICROVM_IMAGE_ARN` | `MicrovmImageArnOutput` |
| `SANDBOX_MICROVM_DATA_CONNECTOR_ARN` | `DataNetworkConnectorArnOutput` |
| `SANDBOX_MICROVM_NET_CONNECTOR_ARN` | `NetNetworkConnectorArnOutput` |
| `SANDBOX_BROKER_URL` | the broker URL the sandbox can reach — must match the `brokerHostname` prop's host |
| `SANDBOX_TOKEN_SECRET` | a strong secret (HMAC for run tokens); distinct from `BETTER_AUTH_SECRET` in prod |

Plus **AWS credentials** for whatever principal the app runs as (env vars, an
attached IAM role, etc. — the standard AWS SDK v3 credential chain; no
Bennty-specific config needed). That principal needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "lambda:RunMicrovm",
      "lambda:GetMicrovm",
      "lambda:CreateMicrovmAuthToken",
      "lambda:TerminateMicrovm",
      "lambda:PassNetworkConnector"
    ],
    "Resource": "*"
  }]
}
```

## Prerequisites in your AWS account

- Lambda MicroVMs confirmed live in your target region (see **Region** above) —
  re-check, don't assume `eu-west-1`/`us-east-1` still holds by the time you deploy.
- CDK must be bootstrapped (`cdk bootstrap`) in the target account/region.
