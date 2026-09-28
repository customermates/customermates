export type RetrievalPipeline = "unified" | "legacy";

const DEPLOYMENT_VARIABLES = ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID"];

export function selectRetrievalPipeline(
  environment: Record<string, string | undefined> = process.env,
): RetrievalPipeline {
  if (environment.LOCAL_AGENT_BENCHMARK !== "true") return "unified";
  if (DEPLOYMENT_VARIABLES.some((name) => environment[name] !== undefined)) return "unified";
  return environment.AGENT_BENCHMARK_RETRIEVAL === "legacy" ? "legacy" : "unified";
}
