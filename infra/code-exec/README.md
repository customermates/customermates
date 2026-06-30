# Code-exec infrastructure (AWS Lambda MicroVM)

Portable CDK artifact for the `run_code` sandbox. **Move this into your infra/CDK
repo** — it is authored here for convenience and is not wired into the app's
build. The app talks to the deployed executor over HTTPS; the executor reaches
CRM data only through the app's read-only broker.

## Architecture

```
agent route ──(x-executor-key)──▶  Lambda MicroVM (sandbox image)
                                        │  runs user Python/JS, no secrets
                                        ▼
                                   read-only broker  POST /api/v1/sandbox/data
                                   (x-sandbox-token = per-run HMAC)
                                        │  runWithTenant + @TenantInteractor
                                        ▼
                                   CRM data (read-only, tenant-scoped)
```

- The MicroVM runs in **PRIVATE_ISOLATED subnets (no NAT)**; its security group
  allows egress **only to the broker** on 443. That is the real data-exfiltration
  wall — the in-VM runner only *uses* the broker URL.
- IAM role has **zero DB / zero app-data** access.
- Reserved concurrency caps blast radius on cost/availability.

## Run modes — data XOR internet (the exfiltration wall)

A run is provisioned in exactly one mode (the app picks the SG by the run token's
`mode`); the two are mutually exclusive so the read-tenant-data + reach-internet
trifecta can't assemble:

| Mode | SG | Reaches | Token |
| --- | --- | --- | --- |
| **DATA** (default) | `ExecutorDataSg` | broker only (CRM data) | minted |
| **NET** | `ExecutorNetSg` | egress proxy only (allowlisted internet) | **none** |

```
NET run ──▶ ExecutorNetSg (no NAT) ──▶ Squid CONNECT-allowlist proxy ──(443)──▶ allowlisted hosts
            broker unreachable + no token  =  no CRM data in a NET run
```

- The **Squid proxy** ([`./proxy`](./proxy)) is CONNECT-only against an allowlist
  built from `egressAllowlist` (default: pypi/npm registries; add named APIs
  explicitly). It runs in NAT subnets; the sandbox subnets have **no NAT**, so the
  proxy is the only way out. Access is logged (target host) to CloudWatch.
- NET-mode launches set `HTTPS_PROXY/HTTP_PROXY=http://egress-proxy.<ns>:3128` and
  mint **no broker token** — so `crm` is unavailable and CRM data cannot leave.
- **Harden (Phase 2):** IMDSv2 + hop-limit 1, `nftables` drop to `169.254.0.0/16`
  + RFC1918, post-DNS-resolution IP re-check in the proxy, private package mirror,
  egress-volume anomaly alerting. A combined **DATA+NET** mode is deliberately NOT
  built — it re-opens the trifecta and needs separate, louder approval.

## Deploy

1. Build & push the image from [`../../sandbox`](../../sandbox):
   ```sh
   docker build --platform linux/arm64 -t <ecr-repo>:<tag> ../../sandbox
   docker push <ecr-repo>:<tag>
   ```
2. Add the stack to your CDK app and deploy with the broker's VPC + SG:
   ```ts
   new CodeExecStack(app, "CodeExec", {
     imageUri: "<ecr-repo>:<tag>",
     vpcId: "<app-vpc-id>",
     brokerSecurityGroupId: "<app-internal-alb-sg-id>",
     reservedConcurrency: 5,
   });
   ```
3. Confirm the **MicroVM construct** against your `aws-cdk-lib` version — it is new
   (GA 2026-06). The stack has the security-critical pieces concrete; the MicroVM
   resource block is commented with the preferred L2 shape and the CfnResource
   fallback. Keep `PRIVATE_ISOLATED` + `allowAllOutbound:false`.

## Wire the app (env vars)

Set on the Next.js app after deploy:

| Var | Value |
| --- | --- |
| `SANDBOX_CODE_EXEC_ENABLED` | `true` |
| `SANDBOX_EXECUTOR_URL` | the MicroVM's HTTPS endpoint |
| `SANDBOX_EXECUTOR_API_KEY` | value of the `ExecutorApiKey` secret (output `ExecutorApiKeyArn`) |
| `SANDBOX_BROKER_URL` | the broker URL the MicroVM can reach (internal ALB / PrivateLink) |
| `SANDBOX_TOKEN_SECRET` | a strong secret (HMAC for run tokens); distinct from `BETTER_AUTH_SECRET` in prod |

The broker must be reachable from the MicroVM's subnets (internal ALB or
PrivateLink) since there is no NAT. If your broker is currently public-only, add
an internal path before enabling this.

## Prerequisites in your AWS account

Lambda MicroVMs are available in a subset of regions (at GA: US East/West,
Ireland, Tokyo) and are ARM64-only. Verify region + quota before deploying.
