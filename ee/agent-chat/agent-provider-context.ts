import type { ModelMessage } from "ai";

import { toModelMessages, type ReplayMessage } from "./agent-stream-utils";
import type { AgentAiToolDefinition } from "./agent-tools";
import { isAgentContextWithinBudget, serializedAgentContextBytes } from "./agent-budget-policy";
import { AGENT_TOOL_SEARCH_NAME } from "./agent-tool-search";

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

function storedOpenAiItemReference(part: unknown) {
  if (!part || typeof part !== "object" || Array.isArray(part)) return null;
  const candidate = part as {
    type?: unknown;
    toolName?: unknown;
    providerOptions?: { openai?: { itemId?: unknown } };
  };
  const isReasoning = candidate.type === "reasoning";
  const isHostedToolSearch =
    (candidate.type === "tool-call" || candidate.type === "tool-result") &&
    candidate.toolName === AGENT_TOOL_SEARCH_NAME;
  if (!isReasoning && !isHostedToolSearch) return null;
  const itemId = candidate.providerOptions?.openai?.itemId;
  return typeof itemId === "string" && itemId ? { type: "item_reference", id: itemId } : null;
}

function compactStoredOpenAiItemMessages(messages: ModelMessage[]) {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((part) => {
      const reference = storedOpenAiItemReference(part);
      if (!reference) return part;
      changed = true;
      return reference;
    });
    return changed ? { ...message, content } : message;
  });
}

export function isAgentStepContextWithinBudget(
  providerContext: AgentProviderContext,
  messages: ModelMessage[],
  maxContextBytes: number,
) {
  return isAgentContextWithinBudget(
    {
      ...providerContext,
      messages: compactStoredOpenAiItemMessages(messages),
    },
    maxContextBytes,
  );
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
