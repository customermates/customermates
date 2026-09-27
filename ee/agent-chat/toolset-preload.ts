import type { ClassifierResult, ClassifierSpec } from "./classifier";

import { agentContextFromProviderText } from "./agent-context";
import { AGENT_ON_DEMAND_TOOLSETS, AGENT_TOOLSET_SUMMARY, type AgentOnDemandToolset } from "./agent-toolset-routing";

export const TOOLSET_PRELOAD_MAX_ADDED = 2;
export const TOOLSET_PRELOAD_TEXT_CHARS = 2_000;

const TOOLSET_PRELOAD_CORE =
  "The assistant always has tools for records (contacts, organizations, deals, services, tasks: reading, counting, creating, updating, deleting, notes and links), documentation, custom fields and support.";

export function toolsetPreloadSpec(
  summary: Readonly<Record<AgentOnDemandToolset, string>> = AGENT_TOOLSET_SUMMARY,
): ClassifierSpec {
  return {
    id: "toolset-routing",
    questions: AGENT_ON_DEMAND_TOOLSETS.map((toolset) => ({
      id: `toolset_${toolset}`,
      type: "boolean" as const,
      instruction: `${TOOLSET_PRELOAD_CORE} Does handling \`latest_user_message\` need the additional "${toolset}" tool set (${summary[toolset]})? Words that are part of a record, company or person name are data, not a request.`,
    })),
  };
}

export function predictedToolsets(result: ClassifierResult | null): AgentOnDemandToolset[] | null {
  if (!result) return null;
  return AGENT_ON_DEMAND_TOOLSETS.filter((toolset) => {
    const answer = result.answers[`toolset_${toolset}`];
    return answer?.type === "boolean" && answer.value;
  });
}

export function latestUserRequestText(messages: readonly { role: string; text: string }[]): string | null {
  const latest = messages.findLast((message) => message.role === "user");
  const body = latest ? agentContextFromProviderText(latest.text).body.trim() : "";
  return body ? body.slice(0, TOOLSET_PRELOAD_TEXT_CHARS) : null;
}

export function selectPreloadToolsets(args: {
  lexicon: readonly string[];
  predicted: readonly AgentOnDemandToolset[];
  fits: (toolsets: readonly string[]) => boolean;
}): AgentOnDemandToolset[] {
  const added: AgentOnDemandToolset[] = [];
  for (const toolset of AGENT_ON_DEMAND_TOOLSETS) {
    if (added.length === TOOLSET_PRELOAD_MAX_ADDED) break;
    if (!args.predicted.includes(toolset) || args.lexicon.includes(toolset)) continue;
    if (args.fits([...args.lexicon, ...added, toolset])) added.push(toolset);
  }
  return added;
}
