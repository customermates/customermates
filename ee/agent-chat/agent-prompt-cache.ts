import type { SystemModelMessage } from "ai";

import { AGENT_ON_DEMAND_TOOLSETS, isAgentOnDemandToolset } from "./agent-toolset-routing";
import { AGENT_WEB_SEARCH_TOOL_NAME } from "./agent-web-search";
import { AGENT_SYSTEM_PROMPT_SEPARATOR } from "./agent-wiki-context";
import { WIKI_WEBSITE_IMPORT_TOOL_NAME } from "./tool-identity";

export const AGENT_TOOLS_CACHE_CONTROL = { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } } as const;
export const AGENT_SYSTEM_CACHE_CONTROL = { anthropic: { cacheControl: { type: "ephemeral" } } } as const;

const CONDITIONAL_TOOL_NAMES: readonly string[] = [AGENT_WEB_SEARCH_TOOL_NAME, WIKI_WEBSITE_IMPORT_TOOL_NAME];

type CachedTool = { name: string; toolset: string | null };

function cacheRank(tool: CachedTool) {
  if (isAgentOnDemandToolset(tool.toolset)) return 2 + AGENT_ON_DEMAND_TOOLSETS.indexOf(tool.toolset);
  return CONDITIONAL_TOOL_NAMES.includes(tool.name) ? 1 : 0;
}

export function orderAgentToolsForCache<T extends CachedTool>(tools: readonly T[]): T[] {
  return tools.toSorted((left, right) => cacheRank(left) - cacheRank(right));
}

export function agentToolsCacheBreakpoint(tools: readonly CachedTool[]): string | null {
  return tools.findLast((tool) => cacheRank(tool) === 0)?.name ?? null;
}

export function agentSystemInstructions(system: string, stable: string): SystemModelMessage[] {
  const cachedPrefix = `${stable}${AGENT_SYSTEM_PROMPT_SEPARATOR}`;
  if (!stable || !system.startsWith(cachedPrefix)) return [{ role: "system", content: system }];
  return [
    { role: "system", content: stable, providerOptions: AGENT_SYSTEM_CACHE_CONTROL },
    { role: "system", content: system.slice(cachedPrefix.length) },
  ];
}
