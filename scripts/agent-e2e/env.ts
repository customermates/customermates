import { isAbsolute, resolve } from "node:path";

import { requireSingleLocalDatabase } from "../local-database-safety";

export const DEFAULT_CAP_USD = 0.3;
export const DEFAULT_PORT = 4000;
export const WORKFLOW_DATA_DIR = ".next/agent-e2e-workflow-data";

export type AgentE2eFlags = { capUsd: number; port: number; build: boolean; cases: string[] | null };

export type AgentE2eEnvironment = {
  appUrl: string;
  databaseUrl: string;
  workflowDataDir: string;
};

export function parseAgentE2eFlags(argv: readonly string[]): AgentE2eFlags {
  const flags: AgentE2eFlags = { capUsd: DEFAULT_CAP_USD, port: DEFAULT_PORT, build: true, cases: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--skip-build") flags.build = false;
    else if (token === "--cap") {
      const cap = Number(value);
      if (!value || !Number.isFinite(cap) || cap <= 0 || cap > 5)
        throw new Error("--cap must be a USD amount above 0 and at most 5.");
      flags.capUsd = cap;
      index += 1;
    } else if (token === "--port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("--port must be a free TCP port.");
      flags.port = port;
      index += 1;
    } else if (token === "--cases") {
      if (!value) throw new Error("--cases needs a comma-separated list of case ids.");
      flags.cases = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      index += 1;
    } else throw new Error(`Unknown flag ${token}. Use --cap <usd>, --port <port>, --cases <ids> or --skip-build.`);
  }
  return flags;
}

export function requireAgentE2eEnvironment(
  flags: AgentE2eFlags,
  environment: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): AgentE2eEnvironment {
  const databaseUrl = requireSingleLocalDatabase(environment);
  const gatewayApiKey = environment.AI_GATEWAY_API_KEY?.trim() ?? "";
  if (!gatewayApiKey || gatewayApiKey === "XXX")
    throw new Error("AI_GATEWAY_API_KEY is missing: run the command through the encrypted credential store (cm-env).");
  if (!environment.BETTER_AUTH_SECRET?.trim()) throw new Error("BETTER_AUTH_SECRET must be configured to sign in.");
  if (environment.NEXT_PUBLIC_SENTRY_DSN?.trim())
    throw new Error("NEXT_PUBLIC_SENTRY_DSN must be empty so a failing workflow step stays visible in the server log.");
  const workflowDataDir = resolve(cwd, WORKFLOW_DATA_DIR);
  if (!isAbsolute(workflowDataDir)) throw new Error("The workflow data directory must resolve to an absolute path.");
  return { appUrl: `http://localhost:${flags.port}`, databaseUrl, workflowDataDir };
}

export function workflowWorldEnvironment(appUrl: string, workflowDataDir: string) {
  return {
    WORKFLOW_TARGET_WORLD: "local",
    WORKFLOW_LOCAL_DATA_DIR: workflowDataDir,
    WORKFLOW_LOCAL_BASE_URL: appUrl,
  };
}

export function serverEnvironment(args: {
  appUrl: string;
  port: number;
  workflowDataDir: string;
  monthlySpendCapMicrocents: bigint;
  environment?: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  return {
    ...(args.environment ?? process.env),
    ...workflowWorldEnvironment(args.appUrl, args.workflowDataDir),
    NODE_ENV: "production",
    PORT: String(args.port),
    BASE_URL: args.appUrl,
    APP_MODE: "cloud",
    NEXT_PUBLIC_SENTRY_DSN: "",
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true",
    HOSTED_AI_PROVIDER_WORK_PAUSED: "false",
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: args.monthlySpendCapMicrocents.toString(),
  };
}
