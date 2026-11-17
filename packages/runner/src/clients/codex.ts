import type { Outcome, TranscriptEvent } from "../types.js";
import type { ClientAdapter, Observer, PrepareInput } from "./adapter.js";

import {
  JOB_TOKEN_ENV,
  MCP_SERVER_NAME,
  messageEvent,
  numberOf,
  recordOf,
  textOf,
  toolCallEvent,
  toolResultEvent,
} from "./adapter.js";

const SHELL_TOOL = "shell";

export const CODEX_FEATURES_READ_FROM = "0.169.0";

export const CODEX_SHELL_FEATURES = [
  "shell_tool",
  "unified_exec",
  "unified_exec_tty",
  "shell_snapshot",
  "write_stdin_approval",
] as const;

export const CODEX_OUTSIDE_FEATURES = [
  "apps",
  "plugins",
  "plugin_sharing",
  "remote_plugin",
  "skill_search",
  "skill_mcp_dependency_install",
  "tool_suggest",
  "workspace_dependencies",
  "hooks",
  "view_image",
  "image_generation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "browser_annotation_api",
  "in_app_browser",
  "in_app_local_automation",
  "computer_use",
  "multi_agent",
  "multi_agent_v2",
  "goals",
  "sleep_tool",
  "code_mode_host",
  "code_mode_host_grpc",
  "memories",
  "daemon_auto_start",
] as const;

function withoutFeatures(names: readonly string[]): string[] {
  return names.flatMap((name) => ["-c", `features.${name}=false`]);
}

function toolOf(item: Record<string, unknown>): { name: unknown; input: unknown; ok: boolean; output: unknown } | null {
  if (item.type === "mcp_tool_call") {
    const failed = item.status === "failed" || (item.error !== undefined && item.error !== null);
    return { name: item.tool, input: item.arguments, ok: !failed, output: failed ? item.error : item.result };
  }
  if (item.type === "command_execution") {
    const exit = item.exit_code;
    const ok = item.status !== "failed" && (exit === undefined || exit === null || exit === 0);
    return { name: SHELL_TOOL, input: item.command, ok, output: item.aggregated_output };
  }
  return null;
}

function createObserver(): Observer {
  const outcome: Outcome = { isError: false };
  const called = new Set<string>();
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  return {
    observe(line, at) {
      const events: TranscriptEvent[] = [];
      if (line.type === "item.started" || line.type === "item.completed") {
        const item = recordOf(line.item);
        const id = String(item.id ?? "");
        const tool = toolOf(item);
        if (tool && !called.has(id)) {
          called.add(id);
          events.push(toolCallEvent(at, id, tool.name, tool.input));
        }
        if (tool && line.type === "item.completed")
          events.push(toolResultEvent(at, id, tool.name, tool.ok, tool.output));
        const text = textOf(item.text);
        if (line.type === "item.completed" && item.type === "agent_message" && text) {
          outcome.summary = text;
          events.push(messageEvent(at, text));
        }
      }
      if (line.type === "turn.completed") {
        const usage = recordOf(line.usage);
        const input = numberOf(usage.input_tokens);
        const output = numberOf(usage.output_tokens);
        if (input !== undefined) inputTokens = (inputTokens ?? 0) + input;
        if (output !== undefined) outputTokens = (outputTokens ?? 0) + output;
      }
      if (line.type === "turn.failed" || line.type === "error") {
        outcome.isError = true;
        outcome.errorText = textOf(recordOf(line.error).message) ?? textOf(line.message) ?? outcome.errorText;
      }
      return events;
    },
    flush: () => [],
    outcome: () => ({ ...outcome, inputTokens, outputTokens }),
  };
}

export const codexAdapter: ClientAdapter = {
  name: "codex",
  prepare({ prompt, mcp, options, workDir }: PrepareInput) {
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "-s",
      "read-only",
      "-c",
      'approval_policy="never"',
      "-c",
      'web_search="disabled"',
      ...(options.allowShell ? [] : withoutFeatures(CODEX_SHELL_FEATURES)),
      ...withoutFeatures(CODEX_OUTSIDE_FEATURES),
      "-c",
      `mcp_servers.${MCP_SERVER_NAME}.url=${JSON.stringify(mcp.url)}`,
      "-c",
      `mcp_servers.${MCP_SERVER_NAME}.env_http_headers={ x-api-key = ${JSON.stringify(JOB_TOKEN_ENV)} }`,
      "-C",
      workDir,
      "-",
    ];
    return { args, env: { [JOB_TOKEN_ENV]: mcp.token }, stdin: prompt, files: [] };
  },
  createObserver,
};
