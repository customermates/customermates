import type { Outcome } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import { join } from "node:path";

import { MCP_SERVER_NAME, numberOf, recordOf, textOf } from "./adapter.js";

export const CLAUDE_MCP_FILE = "mcp.json";

function createObserver(): Observer {
  let outcome: Outcome = { isError: false };
  return {
    observe(event) {
      if (event.type !== "result") return;
      const usage = recordOf(event.usage);
      const input =
        (numberOf(usage.input_tokens) ?? 0) +
        (numberOf(usage.cache_creation_input_tokens) ?? 0) +
        (numberOf(usage.cache_read_input_tokens) ?? 0);
      const failed = event.is_error === true || (typeof event.subtype === "string" && event.subtype !== "success");
      outcome = {
        summary: textOf(event.result),
        isError: failed,
        errorText: failed ? (textOf(event.result) ?? textOf(event.subtype)) : undefined,
        inputTokens: input > 0 || usage.input_tokens !== undefined ? input : undefined,
        outputTokens: numberOf(usage.output_tokens),
        costUsd: numberOf(event.total_cost_usd),
      };
    },
    outcome: () => outcome,
  };
}

export const claudeAdapter: ClientAdapter = {
  name: "claude",
  prepare({ prompt, mcp, options, configDir }: PrepareInput) {
    const mcpConfig = {
      mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcp.url, headers: { "x-api-key": mcp.token } } },
    };
    const allowed = [`mcp__${MCP_SERVER_NAME}`, ...options.allowedTools].join(",");
    return {
      args: [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--mcp-config",
        join(configDir, CLAUDE_MCP_FILE),
        "--permission-mode",
        options.permissionMode,
        "--allowedTools",
        allowed,
        "--no-session-persistence",
      ],
      env: {},
      stdin: prompt,
      files: [{ name: CLAUDE_MCP_FILE, content: JSON.stringify(mcpConfig) }],
    };
  },
  createObserver,
};
