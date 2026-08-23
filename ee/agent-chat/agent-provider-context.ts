import type { ModelMessage } from "ai";

import { toModelMessages, type ReplayMessage } from "./agent-stream-utils";
import type { AgentAiToolDefinition } from "./agent-tools";
import { isAgentContextWithinBudget, serializedAgentContextBytes } from "./agent-budget-policy";

export const AGENT_REPLAY_COUNT = 8;
export const AGENT_REPLAY_MAX_CHARS = 1_200;

export type AgentProviderContext = {
  system: string;
  messages: ModelMessage[];
  tools: AgentAiToolDefinition[];
};

export function buildAgentProviderContext(
  systemPrompt: string,
  messages: ReplayMessage[],
  toolDefinitions: AgentAiToolDefinition[],
): AgentProviderContext {
  return {
    system: systemPrompt,
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
  systemPrompt: string;
  currentText: string;
  pageRoute: string | null;
  toolDefinitions: AgentAiToolDefinition[];
}): number | null {
  const priorMessages = Array.from({ length: AGENT_REPLAY_COUNT - 1 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: "x".repeat(AGENT_REPLAY_MAX_CHARS),
  }));
  const pageContext = args.pageRoute ? `<page_context route="${args.pageRoute}"/>\n` : "";
  const context = buildAgentProviderContext(
    args.systemPrompt,
    [...priorMessages, { role: "user", text: `${pageContext}${args.currentText}` }],
    args.toolDefinitions,
  );
  return serializedAgentContextBytes(context);
}
