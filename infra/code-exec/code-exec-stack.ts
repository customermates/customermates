/**
 * CDK stack for the code-exec sandbox substrate: an `AWS::Lambda::MicrovmImage` +
 * two `AWS::Lambda::NetworkConnector`s (DATA/NET), plus the two CONNECT-allowlist
 * egress proxies that sit behind them.
 *
 * PORTABLE ARTIFACT — belongs in your infra/CDK repo, not the Next.js app. Authored
 * here for convenience; NOT compiled/deployed in the app repo (no aws-cdk-lib dep in
 * the app's package.json — see ../package.json for this stack's own deps).
 *
 * Compute substrate: **AWS Lambda MicroVMs** — Firecracker-based, snapshot-started
 * VMs, purpose-built for AI code-execution sandboxes (confirmed via
 * https://docs.aws.amazon.com/lambda/latest/dg/lambda-microvms-guide.html and the
 * live `@aws-sdk/client-lambda-microvms`/`@aws-sdk/client-lambda-core` SDKs). One
 * MicrovmImage is built here from `../../sandbox`; the app runs a FRESH MicroVM per
 * code-exec request (`RunMicrovmCommand`) and terminates it right after
 * (`TerminateMicrovmCommand`) — see `features/code-exec/executor-client.ts`. No
 * pooling/reuse across runs, deliberately: a shared, resumed MicroVM would need its
 * own careful state-reset story to stay tenant-safe, and "fresh VM per run" gets
 * that for free.
 *
 * `aws-cdk-lib@2.260.0` (latest published, confirmed via npm) has NO typed L1
 * constructs yet for `AWS::Lambda::MicrovmImage` / `AWS::Lambda::NetworkConnector`
 * (~3-week-old CFN resource types as of 2026-07) — this stack uses the `CfnResource`
 * escape hatch, with property shapes taken directly from
 * `aws cloudformation describe-type --type RESOURCE --type-name AWS::Lambda::MicrovmImage`
 * (and `...NetworkConnector`), not guessed.
 *
 * REGION: Lambda MicroVMs is not yet live in every region for this account — checked
 * directly against the data-plane API (`list-managed-microvm-images`), not just the
 * CFN type registry (which reports the resource type as public everywhere,
 * independent of actual regional rollout). `eu-central-1` (this account's usual
 * region) returned AccessDeniedException; `us-east-1` and `eu-west-1` both work.
 * This stack targets whatever region its `env` prop specifies — deploy it into
 * `eu-west-1` (see ../bin/code-exec.ts) unless you've re-checked availability.
 *
 * SELF-CONTAINED VPC: the read-only broker is reached over the PUBLIC internet
 * (`SANDBOX_BROKER_URL`, defaults to the app's own `BASE_URL` — see env.ts), not a
 * VPC-local address. So the sandbox's egress connectors have no reason to share a
 * VPC with the rest of the app; this stack provisions its own small VPC purely to
 * host the two CONNECT-allowlist proxies + the connectors' ENIs. That also removes
 * the "look up an existing app VPC with the right subnet tiers" dependency that
 * caused synth friction in an earlier draft of this stack.
 *
 * Two mutually-exclusive run modes, each its OWN egress connector + CONNECT-allowlist
 * proxy (a NetworkConnector has exactly one fixed SubnetIds/SecurityGroupIds set, so
 * the DATA-vs-NET wall requires two of everything, same as before):
 *  - DATA: proxy allowlist = the broker's hostname ONLY. CRM data via the broker, no
 *    other internet access — the broker being public HTTPS means "restrict egress to
 *    exactly this one host" has to be enforced by a CONNECT-allowlist proxy, not a
 *    security-group rule (there's no VPC-local IP to reference).
 *  - NET:  proxy allowlist = package registries etc. (`egressAllowlist`). Internet
 *          (allowlisted) via the proxy; the broker's hostname is NOT on this
 *          allowlist and no run token is minted, so the data wall holds by
 *          construction even though both modes ultimately egress through *a* proxy.
 * Ingress (the app calling INTO a running MicroVM) does not need any of this — it
 * goes over the MicroVM's public, AWS-managed HTTPS endpoint, authenticated by a
 * per-run JWE token (`ExecutorClient` mints one via `CreateMicrovmAuthTokenCommand`
 * and sends it as `X-aws-proxy-auth`; AWS validates and strips it before the request
 * reaches the container, so the container has zero visibility into auth — the old
 * `x-executor-key` shared-secret scheme in `sandbox/runner/server.mjs` is gone).
 */
import path from "node:path";

import { Stack, type StackProps, CfnResource, CfnOutput, Aws } from "aws-cdk-lib";
import { type Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Asset } from "aws-cdk-lib/aws-s3-assets";

const PROXY_PORT = 3128;
const CLOUDMAP_NAMESPACE = "code-exec.internal";
const IMAGE_NAME = "bennty-code-exec";

export interface CodeExecStackProps extends StackProps {
  /**
   * Hostname (no scheme) of the read-only broker the DATA-mode proxy allowlists —
   * e.g. `"app.bennty.com"`. This must match `SANDBOX_BROKER_URL`/`BASE_URL`'s host.
   */
  readonly brokerHostname: string;
  /**
   * NET-mode egress allowlist (CONNECT hosts). Keep tight. Defaults to package
   * registries; add named APIs explicitly. Wired into squid.conf (see ./proxy).
   */
  readonly egressAllowlist?: string[];
  /**
   * Version of the `al2023-1` managed MicroVM base image to build against. Confirmed
   * via `aws lambda-microvms list-managed-microvm-image-versions --image-identifier
   * arn:aws:lambda:<region>:aws:microvm-image:al2023-1` (returns `"0"` today, per
   * account/region — re-check before a real deploy in case a newer version shipped).
   */
  readonly baseImageVersion?: string;
  /** MicroVM baseline memory (vCPU scales 2 GB = 1 vCPU). One of the documented
   * tiers: 512 / 1024 / 2048 / 4096 / 8192. Default 2048 (2 GB / 1 vCPU). */
  readonly microvmMemoryMiB?: number;
}

const DEFAULT_ALLOWLIST = ["pypi.org", "files.pythonhosted.org", "registry.npmjs.org"];
const DEFAULT_BASE_IMAGE_VERSION = "0";
const DEFAULT_MEMORY_MIB = 2048;

/** ARN of the AWS-managed connector that opens the MicroVM's public HTTPS endpoint
 * to inbound traffic from anywhere. Referenced by the app (ExecutorClient) at
 * `run-microvm` time, not by this stack — exported for the README/docs. */
export const allIngressConnectorArn = (region: string): string =>
  `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`;

/** ARN of the AWS-managed connector granting unrestricted internet egress. Used ONLY
 * as the MicrovmImage's build-time default (the Dockerfile's apt-get/pip installs
 * need internet) — real runs always override with one of this stack's own
 * allowlisted connectors via `run-microvm --egress-network-connectors`. */
const internetEgressConnectorArn = (region: string): string =>
  `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`;

/** One mode's egress path: a CONNECT-allowlist Squid proxy + the security groups on
 * either side of it (the connector's own ENIs, and the proxy's Fargate task). */
interface ProxyResources {
  connectorSg: ec2.SecurityGroup;
  dnsName: string;
}

export class CodeExecStack extends Stack {
  constructor(scope: Construct, id: string, props: CodeExecStackProps) {
    super(scope, id, props);

    const allowlist = props.egressAllowlist ?? DEFAULT_ALLOWLIST;
    const baseImageVersion = props.baseImageVersion ?? DEFAULT_BASE_IMAGE_VERSION;
    const memoryMiB = props.microvmMemoryMiB ?? DEFAULT_MEMORY_MIB;

    // Self-contained VPC — see the file header for why this doesn't reuse the app's
    // VPC. Only needs to host the two proxies (NAT egress) + the connectors' own ENIs
    // (isolated is fine; they only need intra-VPC line-of-sight to their proxy).
    const vpc = new ec2.Vpc(this, "SandboxVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "proxy-egress", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "connector-isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    const isolatedSubnetIds = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds;

    // ---- IAM: the role Lambda assumes to build the MicroVM image (pulls the code
    // artifact from S3, writes build logs). Trust policy + permissions verbatim from
    // https://docs.aws.amazon.com/lambda/latest/dg/microvms-getting-started.md —
    // `sts:TagSession` is required alongside `sts:AssumeRole`.
    const buildRole = new iam.Role(this, "MicrovmBuildRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Assumed by Lambda to build the code-exec MicroVM image from its S3 code artifact",
    });
    buildRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({ actions: ["sts:TagSession"], principals: [new iam.ServicePrincipal("lambda.amazonaws.com")] }),
    );

    // The code artifact: a zip of ../../sandbox (Dockerfile at the root, runner/ as
    // a subdir) — CDK's Asset construct zips a directory's CONTENTS (no extra
    // wrapping folder), matching what `create-microvm-image` expects.
    const codeArtifact = new Asset(this, "SandboxCodeArtifact", {
      path: path.join(__dirname, "..", "..", "sandbox"),
    });

    // One explicit `iam.Policy` (not `role.addToPolicy()`/`asset.grantRead()`, which
    // attach inline policies CDK gives no easy handle to) so `microvmImage` below can
    // take an EXPLICIT dependency on it — the same class of race as
    // connectorOperatorPolicy: referencing `buildRole.roleArn` alone only makes CDK
    // wait for the ROLE, not its permissions actually being attached, and the first
    // real deploy attempt with this pattern died with `AWS::Lambda::MicrovmImage`
    // GeneralServiceException and zero build logs ever written — consistent with the
    // build starting before its role had S3/logs access.
    const buildRolePolicy = new iam.Policy(this, "MicrovmBuildRolePolicy", {
      roles: [buildRole],
      statements: [
        new iam.PolicyStatement({
          sid: "BuildLogs",
          actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
          resources: [`arn:${Aws.PARTITION}:logs:*:*:*`],
        }),
        new iam.PolicyStatement({
          sid: "ReadCodeArtifact",
          actions: ["s3:GetObject"],
          resources: [codeArtifact.bucket.arnForObjects(codeArtifact.s3ObjectKey)],
        }),
      ],
    });

    // ---- IAM: the role Lambda assumes to manage ENIs for a network connector.
    // Trust principal from https://docs.aws.amazon.com/lambda/latest/dg/microvms-networking.md
    // (the `ec2:ManagedResourceOperator` condition value is the strongest signal for
    // the correct trust principal). The docs' own "Prerequisites" permission set
    // (CreateNetworkInterface + CreateTags, resource-ARN-scoped) is NOT sufficient in
    // practice — a real deploy attempt failed with "Encountered unauthorized
    // operation while calling EC2 due to invalid ConnectorOperatorRole permissions".
    // Widened using AWS's OWN managed policy for the equivalent "Lambda manages ENIs
    // in your VPC" pattern (regular Lambda VPC networking), fetched directly via
    // `aws iam get-policy-version --policy-arn
    // arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole` rather
    // than guessed a second time — that policy scopes these EC2 actions to `*`, not
    // per-resource ARNs (ENI ARNs don't exist yet at CreateNetworkInterface time, so
    // resource-scoping doesn't actually work here either).
    const connectorOperatorRole = new iam.Role(this, "NetworkConnectorOperatorRole", {
      assumedBy: new iam.ServicePrincipal("network-connectors.lambda.amazonaws.com"),
      // IAM role descriptions only accept a Latin-1-range character class server-side
      // (confirmed via a real 400 from a deploy attempt) -- plain hyphens only in
      // description VALUES below, not em dashes, even though the rest of this file
      // uses them freely in comments/TSDoc.
      description: "Lambda network-connector operator role - manages ENIs in this stack's VPC",
    });
    // A standalone `iam.Policy` (not `role.addToPolicy()`, which attaches an inline
    // policy CDK gives no easy handle to) so the NetworkConnector resources below can
    // take an EXPLICIT dependency on it. Referencing `connectorOperatorRole.roleArn`
    // alone only makes CDK wait for the ROLE, not its policy — confirmed via a real
    // deploy race: the role existed but its permissions hadn't attached yet when
    // `run-microvm`... er, `create-network-connector` fired, failing with
    // "Encountered unauthorized operation while calling EC2 due to invalid
    // ConnectorOperatorRole permissions" even though the policy itself was correct.
    const connectorOperatorPolicy = new iam.Policy(this, "NetworkConnectorOperatorPolicy", {
      roles: [connectorOperatorRole],
      statements: [
        new iam.PolicyStatement({
          sid: "ManageConnectorEni",
          actions: [
            "ec2:CreateNetworkInterface",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DescribeSubnets",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeVpcs",
            "ec2:DeleteNetworkInterface",
            "ec2:AssignPrivateIpAddresses",
            "ec2:UnassignPrivateIpAddresses",
          ],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          sid: "TagENI",
          actions: ["ec2:CreateTags"],
          resources: [`arn:${Aws.PARTITION}:ec2:*:*:network-interface/*`],
          conditions: { StringEquals: { "ec2:ManagedResourceOperator": "network-connectors.lambda.amazonaws.com" } },
        }),
      ],
    });

    // `defaultCloudMapNamespace` CREATES its own PrivateDnsNamespace for this name —
    // it does not look for or reuse an existing one with a matching name. A real
    // deploy attempt confirmed this the hard way: an earlier draft ALSO created a
    // standalone `servicediscovery.PrivateDnsNamespace` for the same name, and the
    // two collided on the same VPC + Route53 domain ("has already been associated
    // with the hosted zone ... with the same domain name"). Let the cluster be the
    // one and only creator.
    const cluster = new ecs.Cluster(this, "EgressProxyCluster", {
      vpc,
      containerInsights: true,
      defaultCloudMapNamespace: { name: CLOUDMAP_NAMESPACE },
    });

    /**
     * One mode's egress path: a Squid CONNECT-allowlist proxy (image shared across
     * both modes, allowlist baked in per-instance via the ALLOWLIST env var — see
     * ./proxy/entrypoint.sh) in NAT subnets, plus the security group that will sit on
     * the NetworkConnector's own ENIs (allowed to reach ONLY this proxy).
     */
    const buildProxy = (idPrefix: string, proxyAllowlist: string[]): ProxyResources => {
      const proxySg = new ec2.SecurityGroup(this, `${idPrefix}ProxySg`, {
        vpc,
        description: `code-exec ${idPrefix} egress proxy (Squid) - outbound 443 to allowlisted hosts`,
        allowAllOutbound: false,
      });
      proxySg.connections.allowToAnyIpv4(ec2.Port.tcp(443), "allowlisted CONNECT targets (Squid enforces the host list)");
      proxySg.connections.allowToAnyIpv4(ec2.Port.tcp(53), "DNS");
      proxySg.connections.allowToAnyIpv4(ec2.Port.udp(53), "DNS");

      const connectorSg = new ec2.SecurityGroup(this, `${idPrefix}ConnectorSg`, {
        vpc,
        description: `code-exec ${idPrefix} network-connector ENIs - egress only to the ${idPrefix} proxy`,
        allowAllOutbound: false,
      });
      connectorSg.connections.allowTo(proxySg, ec2.Port.tcp(PROXY_PORT), "all egress for this mode goes through the proxy");
      proxySg.connections.allowFrom(connectorSg, ec2.Port.tcp(PROXY_PORT), "accept from this mode's connector ENIs only");

      const taskDef = new ecs.FargateTaskDefinition(this, `${idPrefix}ProxyTask`, { cpu: 256, memoryLimitMiB: 512 });
      taskDef.addContainer("squid", {
        // Build from ./proxy (a small image: FROM ubuntu/squid + COPY squid.conf). Resolved
        // relative to this file, NOT the CWD `cdk` runs from (that's `infra/`, not here).
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, "proxy")),
        portMappings: [{ containerPort: PROXY_PORT }],
        environment: { ALLOWLIST: proxyAllowlist.join(",") },
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${idPrefix}-egress-proxy` }),
      });
      const cloudMapServiceName = `${idPrefix}-proxy`;
      const service = new ecs.FargateService(this, `${idPrefix}ProxyService`, {
        cluster,
        taskDefinition: taskDef,
        desiredCount: 2,
        securityGroups: [proxySg],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        cloudMapOptions: { name: cloudMapServiceName },
        circuitBreaker: { rollback: true },
        minHealthyPercent: 100,
      });
      void service;

      return { connectorSg, dnsName: `${cloudMapServiceName}.${CLOUDMAP_NAMESPACE}` };
    };

    const dataProxy = buildProxy("Data", [props.brokerHostname]);
    const netProxy = buildProxy("Net", allowlist);

    // ---- The two AWS::Lambda::NetworkConnector resources (DATA/NET). No typed L1
    // yet in aws-cdk-lib@2.260.0 — property shapes from
    // `aws cloudformation describe-type --type RESOURCE --type-name AWS::Lambda::NetworkConnector`.
    const buildConnector = (idPrefix: string, proxy: ProxyResources): CfnResource => {
      const connector = new CfnResource(this, `${idPrefix}NetworkConnector`, {
        type: "AWS::Lambda::NetworkConnector",
        properties: {
          Name: `code-exec-${idPrefix.toLowerCase()}`,
          Configuration: {
            VpcEgressConfiguration: {
              SubnetIds: isolatedSubnetIds,
              SecurityGroupIds: [proxy.connectorSg.securityGroupId],
              NetworkProtocol: "IPv4",
              AssociatedComputeResourceTypes: ["MicroVm"],
            },
          },
          OperatorRole: connectorOperatorRole.roleArn,
        },
      });
      // See connectorOperatorPolicy's comment — without this, CDK only orders after
      // the ROLE, not its (separately-created) policy attachment.
      connector.node.addDependency(connectorOperatorPolicy);
      return connector;
    };

    const dataConnector = buildConnector("Data", dataProxy);
    const netConnector = buildConnector("Net", netProxy);

    // ---- The single AWS::Lambda::MicrovmImage. Property shapes from
    // `describe-type --type-name AWS::Lambda::MicrovmImage`; several fields the CLI
    // treats as optional (BaseImageVersion, Hooks, AdditionalOsCapabilities,
    // EnvironmentVariables) are REQUIRED for the raw CFN resource — this is a CFN
    // strictness difference from the CLI's server-side defaults, not a guess.
    const buildLogGroup = new logs.LogGroup(this, "MicrovmBuildLogGroup", {
      logGroupName: `/aws/lambda-microvms/${IMAGE_NAME}`,
      retention: logs.RetentionDays.TWO_WEEKS,
    });

    const microvmImage = new CfnResource(this, "MicrovmImage", {
      type: "AWS::Lambda::MicrovmImage",
      properties: {
        Name: IMAGE_NAME,
        BaseImageArn: `arn:aws:lambda:${Aws.REGION}:aws:microvm-image:al2023-1`,
        BaseImageVersion: baseImageVersion,
        BuildRoleArn: buildRole.roleArn,
        Description: "code-exec sandbox - runs run_code's Python/JS/bash, no secrets baked in",
        CodeArtifact: { Uri: codeArtifact.s3ObjectUrl },
        Logging: { CloudWatch: { LogGroup: buildLogGroup.logGroupName } },
        // Build-time default only (Dockerfile's apt-get/pip need internet); every
        // real run overrides this via `run-microvm --egress-network-connectors`
        // with one of this stack's own allowlisted connectors (see ExecutorClient).
        EgressNetworkConnectors: [internetEgressConnectorArn(Aws.REGION)],
        CpuConfigurations: [{ Architecture: "ARM_64" }],
        Resources: [{ MinimumMemoryInMiB: memoryMiB }],
        AdditionalOsCapabilities: [],
        // Our app starts listening immediately on CMD; no /ready or /validate hook,
        // and (since each run gets a fresh MicroVM, terminated right after) no use
        // for the run/resume/suspend/terminate lifecycle hooks either. Real deploy
        // attempt confirmed the API rejects `Hooks.Port` unless at least one hook is
        // enabled ("At least one MicroVM hook or MicroVM image hook must be enabled
        // when the hooks port is specified") — so omit Port too, not just leave every
        // hook DISABLED. `Hooks` is still present (required by the CFN schema) but
        // empty, which the API accepted.
        Hooks: {},
        EnvironmentVariables: [
          // Static, image-level, non-secret (just private DNS names). Whether the
          // sandboxed subprocess actually gets pointed at either one is decided PER
          // RUN by sandbox/runner/server.mjs based on the run's `mode` — not here.
          { Key: "SANDBOX_DATA_PROXY_URL", Value: `http://${dataProxy.dnsName}:${PROXY_PORT}` },
          { Key: "SANDBOX_NET_PROXY_URL", Value: `http://${netProxy.dnsName}:${PROXY_PORT}` },
        ],
      },
    });
    // See buildRolePolicy's comment — without this, the build can start before its
    // role actually has S3/logs permissions attached.
    microvmImage.node.addDependency(buildRolePolicy);

    new CfnOutput(this, "MicrovmImageArnOutput", { value: microvmImage.getAtt("ImageArn").toString() });
    new CfnOutput(this, "DataNetworkConnectorArnOutput", { value: dataConnector.getAtt("Arn").toString() });
    new CfnOutput(this, "NetNetworkConnectorArnOutput", { value: netConnector.getAtt("Arn").toString() });
    new CfnOutput(this, "AllIngressConnectorArnOutput", { value: allIngressConnectorArn(Aws.REGION) });
    new CfnOutput(this, "EgressAllowlist", { value: allowlist.join(",") });
    new CfnOutput(this, "BrokerHostname", { value: props.brokerHostname });
  }
}
