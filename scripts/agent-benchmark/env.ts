import "dotenv/config";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DEPLOYMENT_MARKERS = ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID", "VERCEL_PROJECT_ID"];

export type BenchmarkEnvironment = {
  appUrl: string;
  databaseUrl: string;
  gatewayApiKey: string;
};

function loopbackUrl(value: string | undefined, label: string, protocols: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!protocols.includes(url.protocol)) throw new Error(`${label} must use ${protocols.join(" or ")}.`);
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error(`${label} must point at a loopback host; the benchmark never touches a remote system.`);
  return url;
}

export function requireLocalBenchmarkEnvironment(
  environment: Record<string, string | undefined> = process.env,
): BenchmarkEnvironment {
  if (environment.RUN_AGENT_BENCHMARK !== "true") throw new Error("Set RUN_AGENT_BENCHMARK=true to run the agent benchmark.");
  for (const marker of DEPLOYMENT_MARKERS)
    if (environment[marker] !== undefined) throw new Error("The agent benchmark is forbidden in a deployment environment.");

  const app = loopbackUrl(environment.BASE_URL, "BASE_URL", ["http:"]);
  if (app.username || app.password) throw new Error("BASE_URL must not carry credentials.");
  const database = loopbackUrl(environment.DIRECT_URL ?? environment.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"]);
  for (const key of ["hostaddr", "service", "servicefile", "passfile", "options"])
    if (database.searchParams.has(key)) throw new Error("The benchmark database URL must not override its host.");

  const gatewayApiKey = environment.AI_GATEWAY_API_KEY?.trim() ?? "";
  if (!gatewayApiKey || gatewayApiKey === "XXX") throw new Error("AI_GATEWAY_API_KEY is required for paid benchmark work.");

  const workflowBaseUrl = environment.WORKFLOW_LOCAL_BASE_URL?.trim() ?? "";
  if (!workflowBaseUrl)
    throw new Error(
      `Set WORKFLOW_LOCAL_BASE_URL=${app.origin} for this process: loading the product graph starts a workflow worker here too, and without it durable steps stall in a long backoff.`,
    );
  if (loopbackUrl(workflowBaseUrl, "WORKFLOW_LOCAL_BASE_URL", ["http:"]).origin !== app.origin)
    throw new Error("WORKFLOW_LOCAL_BASE_URL must point at the same origin as BASE_URL.");

  return { appUrl: app.origin, databaseUrl: database.href, gatewayApiKey };
}

export function requireLocalBenchmarkDatabase(environment: Record<string, string | undefined> = process.env): string {
  const database = loopbackUrl(environment.DIRECT_URL ?? environment.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"]);
  return database.href;
}
