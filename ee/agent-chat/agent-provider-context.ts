import type { ModelMessage } from "ai";

import { toModelMessages, type ReplayMessage } from "./agent-stream-utils";
import type { AgentAiToolDefinition } from "./agent-tools";
import { isAgentContextWithinBudget, serializedAgentContextBytes } from "./agent-budget-policy";
import { AGENT_REPLAY_COUNT, agentReplayWorstCaseMessageChars } from "./agent-replay-budget";
import { agentWikiSystemPrompt, type AgentSystemPromptParts } from "./agent-wiki-context";
import { agentPageContextPrefix } from "./agent-page-context";
import { agentContextProviderPrefix, type AgentContextAttachment } from "./agent-context";

export type AgentProviderContext = {
  system: string;
  messages: ModelMessage[];
  tools: AgentAiToolDefinition[];
};

export function buildAgentProviderContext(
  systemPrompt: string | AgentSystemPromptParts,
  messages: ReplayMessage[],
  toolDefinitions: AgentAiToolDefinition[],
  wikiCatalog?: string | null,
): AgentProviderContext {
  return {
    system: agentWikiSystemPrompt(systemPrompt, wikiCatalog),
    messages: toModelMessages(messages),
    tools: toolDefinitions,
  };
}

export function isAgentStepContextWithinBudget(
  providerContext: AgentProviderContext,
  messages: ModelMessage[],
  maxContextBytes: number,
) {
  return isAgentContextWithinBudget({ ...providerContext, messages }, maxContextBytes);
}

export function conservativeAgentInitialContextBytes(args: {
  systemPrompt: string | AgentSystemPromptParts;
  currentText: string;
  contexts?: readonly AgentContextAttachment[];
  pageRoute: string | null;
  toolDefinitions: AgentAiToolDefinition[];
  wikiCatalog?: string | null;
}): number | null {
  const worstCaseMessageChars = agentReplayWorstCaseMessageChars();
  const priorMessages = Array.from({ length: AGENT_REPLAY_COUNT - 1 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: "x".repeat(worstCaseMessageChars),
  }));
  const pageContext = agentPageContextPrefix(args.pageRoute);
  const selectedContexts = agentContextProviderPrefix(args.contexts ?? []);
  const context = buildAgentProviderContext(
    args.systemPrompt,
    [...priorMessages, { role: "user", text: `${pageContext}${selectedContexts}${args.currentText}` }],
    args.toolDefinitions,
    args.wikiCatalog,
  );
  return serializedAgentContextBytes(context);
}
