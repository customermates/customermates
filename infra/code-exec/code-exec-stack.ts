/**
 * CDK stack for the code-exec sandbox (AWS Lambda MicroVM) + the NET-mode egress
 * proxy.
 *
 * PORTABLE ARTIFACT — belongs in your infra/CDK repo, not the Next.js app. Authored
 * here for convenience; NOT compiled/deployed in the app repo (no aws-cdk-lib dep).
 * Confirm construct names against your aws-cdk-lib version — Lambda MicroVMs are new
 * (GA 2026-06). The security-critical pieces (SGs, no-NAT placement, allowlist proxy,
 * zero-DB IAM) are concrete; the MicroVM resource is the one piece to confirm.
 *
 * Two mutually-exclusive run modes (the app picks SG/subnet by the run token's mode):
 *  - DATA: PRIVATE_ISOLATED (no NAT); SG egress only to the broker. CRM data, no internet.
 *  - NET:  PRIVATE_ISOLATED (no NAT); SG egress only to the Squid CONNECT-allowlist
 *          proxy. Internet (allowlisted) via the proxy, NO broker (no token minted).
 */
import { Stack, type StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { type Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

const PROXY_PORT = 3128;

export interface CodeExecStackProps extends StackProps {
  /** ECR image URI for the ../sandbox image the MicroVM launches from. */
  readonly imageUri: string;
  /** The VPC the app's broker lives in; the MicroVM joins it on private subnets. */
  readonly vpcId: string;
  /** Security group of the app's INTERNAL broker (ALB/service). DATA egress is limited to it. */
  readonly brokerSecurityGroupId: string;
  /** Concurrency cap so code-exec can't exhaust account Lambda concurrency. */
  readonly reservedConcurrency?: number;
  /**
   * NET-mode egress allowlist (CONNECT hosts). Keep tight. Defaults to package
   * registries; add named APIs explicitly. Wired into squid.conf (see ./squid.conf).
   */
  readonly egressAllowlist?: string[];
}

const DEFAULT_ALLOWLIST = ["pypi.org", "files.pythonhosted.org", "registry.npmjs.org"];

export class CodeExecStack extends Stack {
  constructor(scope: Construct, id: string, props: CodeExecStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcId: props.vpcId });
    const allowlist = props.egressAllowlist ?? DEFAULT_ALLOWLIST;

    // The app authenticates to the executor with this shared key (x-executor-key).
    // Mirror its value to the app as SANDBOX_EXECUTOR_API_KEY.
    const executorApiKey = new secretsmanager.Secret(this, "ExecutorApiKey", {
      description: "Shared key the app sends as x-executor-key to the code-exec MicroVM",
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });

    // IAM: deliberately minimal. NO database, NO app-data, NO S3. Only reads its key.
    const executorRole = new iam.Role(this, "ExecutorRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "code-exec MicroVM role — zero DB / zero app-data access",
    });
    executorApiKey.grantRead(executorRole);

    // ---- DATA mode SG: no NAT; egress only to the broker (CRM data, no internet). ----
    const executorDataSg = new ec2.SecurityGroup(this, "ExecutorDataSg", {
      vpc,
      description: "code-exec MicroVM (DATA) — egress to the broker only",
      allowAllOutbound: false,
    });
    const brokerSg = ec2.SecurityGroup.fromSecurityGroupId(this, "BrokerSg", props.brokerSecurityGroupId);
    executorDataSg.connections.allowTo(brokerSg, ec2.Port.tcp(443), "read-only CRM data broker only");

    // ---- NET mode: Squid CONNECT-allowlist proxy + a sandbox SG that can ONLY reach it. ----
    const proxySg = new ec2.SecurityGroup(this, "EgressProxySg", {
      vpc,
      description: "code-exec egress proxy (Squid) — outbound 443 to allowlisted hosts",
      allowAllOutbound: false,
    });
    proxySg.connections.allowToAnyIpv4(ec2.Port.tcp(443), "allowlisted CONNECT targets (Squid enforces the host list)");
    proxySg.connections.allowToAnyIpv4(ec2.Port.tcp(53), "DNS");
    proxySg.connections.allowToAnyIpv4(ec2.Port.udp(53), "DNS");

    const executorNetSg = new ec2.SecurityGroup(this, "ExecutorNetSg", {
      vpc,
      description: "code-exec MicroVM (NET) — egress only to the egress proxy",
      allowAllOutbound: false,
    });
    executorNetSg.connections.allowTo(proxySg, ec2.Port.tcp(PROXY_PORT), "all internet egress goes through the proxy");

    // The proxy runs in NAT/public-egress subnets (it needs the internet); the sandbox
    // subnets have NO NAT, so the proxy is the only path out. Squid is CONNECT-only with
    // an allowlist (./squid.conf) — host-canonicalized, DNS resolved at the proxy, and
    // resolved IPs re-checked against RFC1918 / link-local / 169.254 (metadata) denylist.
    const cluster = new ecs.Cluster(this, "EgressProxyCluster", { vpc, containerInsights: true });
    const proxyTask = new ecs.FargateTaskDefinition(this, "EgressProxyTask", { cpu: 256, memoryLimitMiB: 512 });
    proxyTask.addContainer("squid", {
      // Build from ./squid.conf (a small image: FROM ubuntu/squid + COPY squid.conf).
      image: ecs.ContainerImage.fromAsset("./proxy"),
      portMappings: [{ containerPort: PROXY_PORT }],
      environment: { ALLOWLIST: allowlist.join(",") },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "egress-proxy" }), // ship access.log w/ run id
    });
    const proxyService = new ecs.FargateService(this, "EgressProxyService", {
      cluster,
      taskDefinition: proxyTask,
      desiredCount: 2,
      securityGroups: [proxySg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, // proxy needs NAT
      cloudMapOptions: { name: "egress-proxy" }, // -> egress-proxy.<ns>:3128 for HTTPS_PROXY
    });
    void proxyService;

    // ---- The Lambda MicroVM (confirm construct vs your aws-cdk-lib version) ----
    //   import * as lambda from "aws-cdk-lib/aws-lambda";
    //   new lambda.MicroVm(this, "Executor", {
    //     code: lambda.MicroVmImage.fromEcr(props.imageUri),
    //     architecture: lambda.Architecture.ARM_64,                 // ARM64-only
    //     vpc,
    //     vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },  // no NAT (both modes)
    //     // The app/launcher picks the SG per run mode from the token:
    //     //   DATA -> [executorDataSg]   NET -> [executorNetSg] (+ HTTPS_PROXY env)
    //     securityGroups: [executorDataSg],
    //     role: executorRole,
    //     memorySize: 512,
    //     timeout: Duration.minutes(1),
    //     reservedConcurrentExecutions: props.reservedConcurrency ?? 5,
    //     suspendAfter: Duration.minutes(15),
    //     // IMDSv2 + hop-limit 1; also drop 169.254.0.0/16 + RFC1918 via nftables in the image.
    //     environment: { EXECUTOR_API_KEY: lambda.SecretEnv.fromSecret(executorApiKey) },
    //   });
    //
    // NET runs additionally set HTTPS_PROXY/HTTP_PROXY=http://egress-proxy.<ns>:3128 and
    // mint NO broker token. PRIVATE_ISOLATED + allowAllOutbound:false on both SGs is the
    // launch gate — do not relax it.
    void Duration;

    new CfnOutput(this, "ExecutorApiKeyArn", { value: executorApiKey.secretArn });
    new CfnOutput(this, "ExecutorDataSgId", { value: executorDataSg.securityGroupId });
    new CfnOutput(this, "ExecutorNetSgId", { value: executorNetSg.securityGroupId });
    new CfnOutput(this, "EgressAllowlist", { value: allowlist.join(",") });
  }
}
