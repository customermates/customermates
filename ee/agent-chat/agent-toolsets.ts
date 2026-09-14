import { MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";

import {
  AGENT_CORE_TOOLSETS,
  AGENT_ON_DEMAND_TOOLSETS,
  isAgentOnDemandToolset,
  type AgentOnDemandToolset,
} from "./agent-toolset-routing";

function toolNamesOfGroup(group: string): string[] {
  return (MCP_TOOL_GROUPS[group] ?? []).map((tool) => tool.name);
}

let toolsetByName: Map<string, AgentOnDemandToolset> | undefined;

function toolsetIndex() {
  toolsetByName ??= new Map(
    AGENT_ON_DEMAND_TOOLSETS.flatMap((toolset) => toolNamesOfGroup(toolset).map((name) => [name, toolset] as const)),
  );
  return toolsetByName;
}

export function onDemandToolsetOfTool(toolName: string): AgentOnDemandToolset | null {
  return toolsetIndex().get(toolName) ?? null;
}

export function toolNamesOfToolset(toolset: string): string[] {
  return isAgentOnDemandToolset(toolset) ? toolNamesOfGroup(toolset) : [];
}

export function coreToolNames(): Set<string> {
  return new Set(AGENT_CORE_TOOLSETS.flatMap((group) => toolNamesOfGroup(group)));
}
