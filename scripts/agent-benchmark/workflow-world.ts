import { resolve } from "node:path";

export type WorkflowWorldEnvironment = Record<string, string | undefined>;

export function configureBenchmarkWorkflowWorld(
  environment: WorkflowWorldEnvironment = process.env,
  cwd = process.cwd(),
): string {
  const configured = environment.WORKFLOW_LOCAL_DATA_DIR?.trim();
  const dataDir = resolve(cwd, configured || ".next/workflow-data");

  environment.WORKFLOW_LOCAL_DATA_DIR = dataDir;
  environment.WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS = "false";
  environment.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS = "0";
  environment.WORKFLOW_LOCAL_BODY_TIMEOUT_MS = "0";

  return dataDir;
}
