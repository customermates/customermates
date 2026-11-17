import type { McpTool, McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";
import type { AgentJobRequest } from "./agent-job-request-context";

import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { AGENT_JOB_MAX_TOOL_CALLS } from "@/features/agent-jobs/agent-job.schema";
import { mcpMessageFailure } from "@/features/mcp-tools/utils";

export const AGENT_JOB_UNATTENDED_REFUSAL = "Not available in an agent run: nobody can answer or approve.";
export const AGENT_JOB_TOOL_LIMIT_REFUSAL =
  "The tool call limit of this run is reached. Stop, and report what is done and what remains.";

export type AgentJobToolCounter = (keyId: string, limit: number) => Promise<boolean>;

function refusal(message: string): McpToolExecutionResult {
  const { text, failure } = mcpMessageFailure(message);
  return { ok: false, result: text, failure };
}

export function agentJobToolNeedsApproval(tool: Pick<McpTool, "name" | "annotations">, input: unknown): boolean {
  return requiresApproval(internalToolIdentity(tool.name), tool, input);
}

export async function agentJobToolRefusal(
  request: Pick<AgentJobRequest, "keyId">,
  tool: Pick<McpTool, "name" | "annotations">,
  input: unknown,
  count: AgentJobToolCounter,
): Promise<McpToolExecutionResult | null> {
  if (!(await count(request.keyId, AGENT_JOB_MAX_TOOL_CALLS))) return refusal(AGENT_JOB_TOOL_LIMIT_REFUSAL);
  if (agentJobToolNeedsApproval(tool, input)) return refusal(AGENT_JOB_UNATTENDED_REFUSAL);
  return null;
}
