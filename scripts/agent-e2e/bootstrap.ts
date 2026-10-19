import "dotenv/config";

import { resolve } from "node:path";

import { parseAgentE2eFlags, WORKFLOW_DATA_DIR, workflowWorldEnvironment } from "./env";

const flags = parseAgentE2eFlags(process.argv.slice(2));
const launchEnvironment = { ...process.env };

Object.assign(process.env, {
  ...workflowWorldEnvironment(`http://localhost:${flags.port}`, resolve(process.cwd(), WORKFLOW_DATA_DIR)),
  WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false",
});

const { runAgentE2e } = await import("./cli");
process.exit(await runAgentE2e(flags, launchEnvironment));
