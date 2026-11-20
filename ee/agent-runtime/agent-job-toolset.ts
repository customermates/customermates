import type { ToolSet } from "ai";
import type { AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import type { McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";
import type { AgentJobRecorder } from "./agent-job-recorder";
import type { CausationContext } from "@/core/decorators/causation-context";

import { runInCausation } from "@/core/decorators/causation-context";
import { getAgentAiTools } from "@/ee/agent-chat/agent-tools";
import { LOAD_TOOLSET_TOOL_NAME, isAgentOnDemandToolset } from "@/ee/agent-chat/agent-toolset-routing";
import { onDemandToolsetOfTool } from "@/ee/agent-chat/agent-toolsets";
import { agentJobToolPolicyRefusal } from "@/features/agent-jobs/agent-job-tool-policy";
import { mcpMessageFailure } from "@/features/mcp-tools/utils";

import { summarizeAgentJobToolOutput } from "./agent-job-tool-output";

const AGENT_JOB_RESULT_MAX_CHARS = 6000;
const UNATTENDED = "Not available in an agent run: nobody can answer or approve.";
const TOOL_LIMIT_RESULT = "The tool call limit of this run is reached. Stop, and report what is done and what remains.";

function unattendedFailure(): McpToolExecutionResult {
  const { text, failure } = mcpMessageFailure(UNATTENDED);
  return { ok: false, result: text, failure };
}

export const AGENT_JOB_TOOL_DEPS: AgentToolDeps = {
  runUiCommand: () => Promise.resolve({ ok: false, result: UNATTENDED }),
  requestApproval: () => Promise.resolve("reject"),
  resolveApprovalContext: (_toolName, input) => Promise.resolve({ ok: true, input }),
  createSupportTicket: () => Promise.resolve(unattendedFailure()),
  runExactlyOnce: (_toolCallId, _toolName, run) => run(),
  runInCallerContext: (run) => run(),
  resultMaxChars: AGENT_JOB_RESULT_MAX_CHARS,
};

type Execute = (input: unknown, options: { toolCallId: string }) => unknown;

export function agentJobActiveToolNames(tools: ToolSet, loadedToolsets: ReadonlySet<string>): string[] {
  return Object.keys(tools).filter((name) => {
    const toolset = onDemandToolsetOfTool(name);
    return toolset === null || loadedToolsets.has(toolset);
  });
}

export type AgentJobToolkit = {
  tools: ToolSet;
  activeToolNames: () => string[];
};

export type AgentJobToolkitFactory = (args: {
  locale: string;
  maxToolCalls: number;
  recorder: AgentJobRecorder;
  ruleChain: readonly string[];
  untrusted: boolean;
}) => AgentJobToolkit;

export function agentJobCausation(ruleChain: readonly string[], untrusted = false): CausationContext {
  return { routineDepth: 1, ruleChain: [...ruleChain], ...(untrusted ? { untrustedOrigin: true } : {}) };
}

export const createAgentJobToolkit: AgentJobToolkitFactory = (args) => {
  const tools = buildAgentJobTools(args);
  return { tools, activeToolNames: () => agentJobActiveToolNames(tools, args.recorder.loadedToolsets) };
};

export function buildAgentJobTools(args: {
  locale: string;
  maxToolCalls: number;
  recorder: AgentJobRecorder;
  ruleChain?: readonly string[];
  untrusted?: boolean;
  base?: ToolSet;
}): ToolSet {
  const { recorder, maxToolCalls } = args;
  const policy = { untrusted: args.untrusted ?? true, ruleChain: args.ruleChain ?? [] };
  const causation = agentJobCausation(policy.ruleChain, policy.untrusted);
  const base = args.base ?? getAgentAiTools(AGENT_JOB_TOOL_DEPS, { locale: args.locale, surface: "routine" });
  return Object.fromEntries(
    Object.entries(base).map(([name, definition]) => {
      const execute = (definition as { execute?: Execute }).execute;
      if (typeof execute !== "function") return [name, definition];
      return [
        name,
        {
          ...definition,
          execute: async (input: unknown, options: { toolCallId: string }) => {
            recorder.toolCall(options.toolCallId, name, input);
            if (recorder.toolCalls >= maxToolCalls) {
              recorder.toolResult(options.toolCallId, name, false, TOOL_LIMIT_RESULT);
              return { ok: false, result: TOOL_LIMIT_RESULT };
            }
            recorder.toolCalls += 1;
            const refused = agentJobToolPolicyRefusal(name, input, policy);
            if (refused) {
              recorder.toolResult(options.toolCallId, name, false, refused);
              return { ok: false, result: refused };
            }
            if (name === LOAD_TOOLSET_TOOL_NAME) {
              const toolset = (input as { toolset?: unknown } | null)?.toolset;
              if (typeof toolset === "string" && isAgentOnDemandToolset(toolset)) recorder.loadedToolsets.add(toolset);
            }
            try {
              const output = await runInCausation(causation, () => execute(input, options));
              const outcome = summarizeAgentJobToolOutput(output);
              recorder.toolResult(options.toolCallId, name, outcome.ok, outcome.summary);
              return output;
            } catch (error) {
              recorder.toolResult(options.toolCallId, name, false, error instanceof Error ? error.name : "ToolError");
              throw error;
            }
          },
        },
      ];
    }),
  ) as ToolSet;
}
