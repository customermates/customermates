import type { Outcome, TranscriptEvent } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import { join } from "node:path";

import {
  MCP_SERVER_NAME,
  messageEvent,
  numberOf,
  recordOf,
  textOf,
  toolCallEvent,
  toolResultEvent,
} from "./adapter.js";

export const GEMINI_SETTINGS_FILE = "gemini-settings.json";

function createObserver(): Observer {
  const outcome: Outcome = { isError: false };
  const messages: string[] = [];
  const names = new Map<string, string>();
  let pending = "";

  const flush = (at: string): TranscriptEvent[] => {
    if (pending.trim() === "") return [];
    const text = pending;
    pending = "";
    return [messageEvent(at, text)];
  };

  return {
    observe(line, at) {
      if (line.type === "message" && line.role === "assistant") {
        const content = textOf(line.content);
        if (content) {
          messages.push(content);
          pending += content;
        }
        return line.delta === true ? [] : flush(at);
      }
      const events = flush(at);
      if (line.type === "tool_use") {
        names.set(String(line.tool_id), String(line.tool_name));
        events.push(toolCallEvent(at, line.tool_id, line.tool_name, line.parameters));
      }
      if (line.type === "tool_result") {
        const ok = line.status === undefined || line.status === "success";
        const output = ok ? line.output : (recordOf(line.error).message ?? line.output);
        events.push(toolResultEvent(at, line.tool_id, names.get(String(line.tool_id)), ok, output));
      }
      if (line.type === "result") {
        const stats = recordOf(line.stats);
        outcome.inputTokens = numberOf(stats.input_tokens) ?? numberOf(stats.input);
        outcome.outputTokens = numberOf(stats.output_tokens) ?? numberOf(stats.output);
        if (typeof line.status === "string" && line.status !== "success") {
          outcome.isError = true;
          outcome.errorText = textOf(recordOf(line.error).message) ?? line.status;
        }
      }
      if (line.type === "error") {
        outcome.isError = true;
        outcome.errorText = textOf(line.message) ?? textOf(recordOf(line.error).message) ?? outcome.errorText;
      }
      return events;
    },
    flush,
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
      args: ["--output-format", "stream-json", "--allowed-mcp-server-names", MCP_SERVER_NAME],
      env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(configDir, GEMINI_SETTINGS_FILE) },
      stdin: prompt,
      files: [{ name: GEMINI_SETTINGS_FILE, content: JSON.stringify(settings) }],
    };
  },
  createObserver,
};
