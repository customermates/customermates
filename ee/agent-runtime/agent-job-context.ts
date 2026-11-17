import type { ModelMessage, ToolSet } from "ai";

import { asSchema } from "ai";

import { agentStepContext, serializedAgentContextBytes } from "@/ee/agent-chat/agent-budget-policy";

export const AGENT_JOB_TRIMMED_TOOL_RESULT =
  "[This earlier tool result was removed to keep the run within its context limit. Call the tool again if the data is still needed.]";

export type AgentJobToolDefinition = { name: string; description?: string; inputSchema?: unknown };

export async function agentJobToolDefinitions(tools: ToolSet): Promise<Map<string, AgentJobToolDefinition>> {
  const definitions = new Map<string, AgentJobToolDefinition>();
  for (const [name, definition] of Object.entries(tools)) {
    const { description, inputSchema } = definition as { description?: string; inputSchema?: unknown };
    definitions.set(name, {
      name,
      ...(description ? { description } : {}),
      ...(inputSchema ? { inputSchema: await asSchema(inputSchema as never).jsonSchema } : {}),
    });
  }
  return definitions;
}

function withoutToolResults(message: ModelMessage): ModelMessage {
  if (message.role !== "tool" || !Array.isArray(message.content)) return message;
  return {
    ...message,
    content: message.content.map((part) =>
      part.type === "tool-result"
        ? { ...part, output: { type: "text" as const, value: AGENT_JOB_TRIMMED_TOOL_RESULT } }
        : part,
    ),
  } as ModelMessage;
}

export function fitAgentJobContext(args: {
  system: string;
  messages: ModelMessage[];
  tools: readonly AgentJobToolDefinition[];
  maxContextBytes: number;
}): { messages: ModelMessage[]; contextBytes: number } | null {
  const measure = (messages: ModelMessage[]) =>
    serializedAgentContextBytes(agentStepContext({ system: args.system, messages, tools: args.tools }));

  let contextBytes = measure(args.messages);
  if (contextBytes === null) return null;
  if (contextBytes <= args.maxContextBytes) return { messages: args.messages, contextBytes };

  const messages = [...args.messages];
  for (let index = 0; index < messages.length && contextBytes > args.maxContextBytes; index += 1) {
    const trimmed = withoutToolResults(messages[index]);
    if (trimmed === messages[index]) continue;
    messages[index] = trimmed;
    contextBytes = measure(messages);
    if (contextBytes === null) return null;
  }
  return contextBytes <= args.maxContextBytes ? { messages, contextBytes } : null;
}
