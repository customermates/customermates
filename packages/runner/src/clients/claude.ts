import type { Outcome, TranscriptEvent } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import { join } from "node:path";

import {
  MCP_SERVER_NAME,
  listOf,
  messageEvent,
  numberOf,
  recordOf,
  textOf,
  toolCallEvent,
  toolResultEvent,
} from "./adapter.js";

export const CLAUDE_MCP_FILE = "mcp.json";

function resultText(content: unknown): unknown {
  if (typeof content === "string") return content;
  const texts = listOf(content).flatMap((block) => {
    const text = textOf(recordOf(block).text);
    return text ? [text] : [];
  });
  return texts.length > 0 ? texts.join("\n") : content;
}

function createObserver(): Observer {
  let outcome: Outcome = { isError: false };
  const names = new Map<string, string>();
  return {
    observe(line, at) {
      if (line.type === "assistant") {
        return listOf(recordOf(line.message).content).flatMap((entry): TranscriptEvent[] => {
          const block = recordOf(entry);
          const text = textOf(block.text);
          if (block.type === "text" && text) return [messageEvent(at, text)];
          if (block.type !== "tool_use") return [];
          names.set(String(block.id), String(block.name));
          return [toolCallEvent(at, block.id, block.name, block.input)];
        });
      }
      if (line.type === "user") {
        return listOf(recordOf(line.message).content).flatMap((entry): TranscriptEvent[] => {
          const block = recordOf(entry);
          if (block.type !== "tool_result") return [];
          const id = block.tool_use_id;
          return [toolResultEvent(at, id, names.get(String(id)), block.is_error !== true, resultText(block.content))];
        });
      }
      if (line.type !== "result") return [];
      const usage = recordOf(line.usage);
      const input =
        (numberOf(usage.input_tokens) ?? 0) +
        (numberOf(usage.cache_creation_input_tokens) ?? 0) +
        (numberOf(usage.cache_read_input_tokens) ?? 0);
      const failed = line.is_error === true || (typeof line.subtype === "string" && line.subtype !== "success");
      outcome = {
        summary: textOf(line.result),
        isError: failed,
        errorText: failed ? (textOf(line.result) ?? textOf(line.subtype)) : undefined,
        inputTokens: input > 0 || usage.input_tokens !== undefined ? input : undefined,
        outputTokens: numberOf(usage.output_tokens),
      };
      return [];
    },
    flush: () => [],
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
        "--strict-mcp-config",
        "--setting-sources",
        options.settingSources,
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
