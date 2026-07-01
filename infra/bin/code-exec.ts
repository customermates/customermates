#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { CodeExecStack } from "../code-exec/code-exec-stack";

const app = new cdk.App();

// Lambda MicroVMs isn't live in every region for every account yet — checked
// directly against the data-plane API, not just the CFN type registry. Confirmed
// working in `eu-west-1` and `us-east-1`; NOT in `eu-central-1` (this account's
// usual region, as of 2026-07). Re-check with
// `aws lambda-microvms list-managed-microvm-images --region <region>` before
// picking a different one.
//
// Deliberately NOT read from CDK_DEFAULT_REGION: the `cdk` CLI resolves and
// re-injects that env var itself from the ambient AWS profile's default region
// *before* spawning this app — any value you export in your own shell is silently
// overwritten. Override via `-c region=...` instead (a real CDK context flag, which
// the CLI does not touch).
const REGION = (app.node.tryGetContext("region") as string | undefined) ?? "eu-west-1";

// Placeholders — pass real values via `-c brokerHostname=... -c
// baseImageVersion=...` or edit directly before `cdk deploy`. See
// ../code-exec/README.md for what each one means and how to obtain it.
new CodeExecStack(app, "CodeExecStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: REGION,
  },
  brokerHostname: app.node.tryGetContext("brokerHostname") ?? "<APP_HOSTNAME>",
  baseImageVersion: app.node.tryGetContext("baseImageVersion"),
});
