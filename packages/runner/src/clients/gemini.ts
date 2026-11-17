import type { Outcome } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import { join } from "node:path";

import { MCP_SERVER_NAME, numberOf, recordOf, textOf } from "./adapter.js";

export const GEMINI_SETTINGS_FILE = "gemini-settings.json";

function createObserver(): Observer {
  const outcome: Outcome = { isError: false };
  const messages: string[] = [];
  return {
    observe(event) {
      if (event.type === "message" && event.role === "assistant") {
        const content = textOf(event.content);
        if (content) messages.push(content);
      }
      if (event.type === "result") {
        const stats = recordOf(event.stats);
        outcome.inputTokens = numberOf(stats.input_tokens) ?? numberOf(stats.input);
        outcome.outputTokens = numberOf(stats.output_tokens) ?? numberOf(stats.output);
        if (typeof event.status === "string" && event.status !== "success") {
          outcome.isError = true;
          outcome.errorText = textOf(recordOf(event.error).message) ?? event.status;
        }
      }
      if (event.type === "error") {
        outcome.isError = true;
        outcome.errorText = textOf(event.message) ?? textOf(recordOf(event.error).message) ?? outcome.errorText;
      }
    },
    outcome: () => ({ ...outcome, summary: messages.length ? messages.join("") : undefined }),
  };
}

export const geminiAdapter: ClientAdapter = {
  name: "gemini",
  prepare({ prompt, mcp, configDir }: PrepareInput) {
    const settings = {
      mcpServers: { [MCP_SERVER_NAME]: { httpUrl: mcp.url, headers: { "x-api-key": mcp.token }, trust: true } },
    };
    return {
      args: ["--output-format", "stream-json", "--allowed-mcp-server-names", MCP_SERVER_NAME, "-p", prompt],
      env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(configDir, GEMINI_SETTINGS_FILE) },
      files: [{ name: GEMINI_SETTINGS_FILE, content: JSON.stringify(settings) }],
    };
  },
  createObserver,
};
