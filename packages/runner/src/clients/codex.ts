import type { Outcome } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import { JOB_TOKEN_ENV, MCP_SERVER_NAME, numberOf, recordOf, textOf } from "./adapter.js";

function createObserver(): Observer {
  const outcome: Outcome = { isError: false };
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  return {
    observe(event) {
      if (event.type === "item.completed") {
        const item = recordOf(event.item);
        if (item.type === "agent_message" && textOf(item.text)) outcome.summary = textOf(item.text);
      }
      if (event.type === "turn.completed") {
        const usage = recordOf(event.usage);
        const input = numberOf(usage.input_tokens);
        const output = numberOf(usage.output_tokens);
        if (input !== undefined) inputTokens = (inputTokens ?? 0) + input;
        if (output !== undefined) outputTokens = (outputTokens ?? 0) + output;
      }
      if (event.type === "turn.failed" || event.type === "error") {
        outcome.isError = true;
        outcome.errorText = textOf(recordOf(event.error).message) ?? textOf(event.message) ?? outcome.errorText;
      }
    },
    outcome: () => ({ ...outcome, inputTokens, outputTokens }),
  };
}

export const codexAdapter: ClientAdapter = {
  name: "codex",
  prepare({ prompt, mcp, options }: PrepareInput) {
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--ephemeral",
      "-s",
      "read-only",
      "-c",
      `mcp_servers.${MCP_SERVER_NAME}.url=${JSON.stringify(mcp.url)}`,
      "-c",
      `mcp_servers.${MCP_SERVER_NAME}.env_http_headers={ x-api-key = ${JSON.stringify(JOB_TOKEN_ENV)} }`,
    ];
    if (options.workdir) args.push("-C", options.workdir);
    args.push("-");
    return { args, env: { [JOB_TOKEN_ENV]: mcp.token }, stdin: prompt, files: [] };
  },
  createObserver,
};
