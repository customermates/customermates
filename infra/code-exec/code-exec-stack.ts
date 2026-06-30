/**
 * CDK stack for the code-exec sandbox (AWS Lambda MicroVM).
 *
 * PORTABLE ARTIFACT — this belongs in your infra/CDK repo, not the Next.js app.
 * It is authored here for convenience and has NOT been deployed/compiled in the
 * app repo (no aws-cdk-lib dependency here). Confirm construct names against your
 * aws-cdk-lib version — Lambda MicroVMs are new (GA 2026-06).
 *
 * The security-critical infrastructure is concrete below; the MicroVM resource
 * itself is the one piece to confirm against your CDK version (see the note).
 */
import { Stack, type StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { type Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface CodeExecStackProps extends StackProps {
  /** ECR image URI for the ../sandbox image the MicroVM launches from. */
  readonly imageUri: string;
  /** The VPC the app's broker lives in; the MicroVM joins it on private subnets. */
  readonly vpcId: string;
  /** Security group of the app's INTERNAL broker (ALB/service). Egress is limited to it. */
  readonly brokerSecurityGroupId: string;
  /** Concurrency cap so code-exec can't exhaust account Lambda concurrency. */
  readonly reservedConcurrency?: number;
}

export class CodeExecStack extends Stack {
  constructor(scope: Construct, id: string, props: CodeExecStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcId: props.vpcId });

    // SECURITY (hard requirement): no general internet egress. The MicroVM runs in
    // PRIVATE_ISOLATED subnets (no NAT) and its SG denies all outbound except the
    // broker — so sandboxed code cannot exfiltrate data or reach the metadata IP.
    const executorSg = new ec2.SecurityGroup(this, "ExecutorSg", {
      vpc,
      description: "code-exec MicroVM — egress restricted to the broker only",
      allowAllOutbound: false,
    });
    const brokerSg = ec2.SecurityGroup.fromSecurityGroupId(this, "BrokerSg", props.brokerSecurityGroupId);
    executorSg.connections.allowTo(brokerSg, ec2.Port.tcp(443), "read-only CRM data broker only");

    // The app authenticates to the executor with this shared key (x-executor-key).
    // Mirror its value to the app as SANDBOX_EXECUTOR_API_KEY.
    const executorApiKey = new secretsmanager.Secret(this, "ExecutorApiKey", {
      description: "Shared key the app sends as x-executor-key to the code-exec MicroVM",
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });

    // IAM: deliberately minimal. NO database, NO app-data, NO S3 (until file
    // artifacts land). Only the ability to read its own inbound key.
    const executorRole = new iam.Role(this, "ExecutorRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "code-exec MicroVM role — zero DB / zero app-data access",
    });
    executorApiKey.grantRead(executorRole);

    // --- The Lambda MicroVM ---
    // Confirm the construct against your aws-cdk-lib version. Preferred L2 shape:
    //
    //   import * as lambda from "aws-cdk-lib/aws-lambda";
    //   new lambda.MicroVm(this, "Executor", {
    //     code: lambda.MicroVmImage.fromEcr(props.imageUri),
    //     architecture: lambda.Architecture.ARM_64,           // MicroVMs are ARM64-only
    //     vpc,
    //     vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },  // no NAT
    //     securityGroups: [executorSg],
    //     role: executorRole,
    //     memorySize: 512,
    //     timeout: Duration.minutes(1),
    //     reservedConcurrentExecutions: props.reservedConcurrency ?? 5,
    //     suspendAfter: Duration.minutes(15),                 // idle suspend (low cost)
    //     // Inject the key from Secrets Manager (do NOT bake it into the template):
    //     environment: { EXECUTOR_API_KEY: lambda.SecretEnv.fromSecret(executorApiKey) },
    //   });
    //
    // If the L2 is not yet available, declare it via CfnResource with the SAME
    // vpc / PRIVATE_ISOLATED subnets / securityGroups:[executorSg] / role / image /
    // reservedConcurrency / ARM64. The PRIVATE_ISOLATED + allowAllOutbound:false
    // combination is the launch gate — do not relax it.

    void Duration; // referenced in the commented MicroVM block above

    new CfnOutput(this, "ExecutorApiKeyArn", { value: executorApiKey.secretArn });
    new CfnOutput(this, "ExecutorSecurityGroupId", { value: executorSg.securityGroupId });
  }
}
