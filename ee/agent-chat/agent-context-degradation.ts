import type { ReplayMessage } from "./agent-stream-utils";

import { agentContextFromProviderText } from "./agent-context";
import { isAgentOnDemandToolset } from "./agent-toolset-routing";

export const AGENT_CONTEXT_OMITTED_NOTE =
  "<context_budget_note>The page and selected context attached to this request were left out to fit the context budget. Read what you need with tools; never guess it.</context_budget_note>\n";

export type AgentContextDegradation = {
  toolsets: string[];
  omittedHistory: number;
  contextOmitted: boolean;
};

export function agentHistoryOmittedNote(count: number): string {
  return `<context_budget_note>${count} earlier conversation message${count === 1 ? " was" : "s were"} left out to fit the context budget. Ask the user if you need what they said earlier.</context_budget_note>\n`;
}

function currentRequestIndex(messages: readonly ReplayMessage[]): number {
  return messages.findLastIndex((message) => message.role === "user");
}

function sameToolsets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((toolset) => right.includes(toolset));
}

function attachedContextOf(text: string): { prefix: string; body: string } {
  const { body } = agentContextFromProviderText(text);
  return { prefix: text.slice(0, text.length - body.length), body };
}

export function agentContextDegradationLadder(args: {
  messages: readonly ReplayMessage[];
  toolsets: readonly string[];
  requestToolsets?: readonly string[];
}): AgentContextDegradation[] {
  const loaded = [...new Set(args.toolsets.filter(isAgentOnDemandToolset))];
  const ladder: AgentContextDegradation[] = [];
  let toolsets: string[] = loaded;
  const push = (next: AgentContextDegradation) => {
    ladder.push(next);
    toolsets = next.toolsets;
  };

  const requested = args.requestToolsets ? loaded.filter((toolset) => args.requestToolsets?.includes(toolset)) : null;
  if (requested && !sameToolsets(requested, toolsets))
    push({ toolsets: requested, omittedHistory: 0, contextOmitted: false });
  if (toolsets.length > 0) push({ toolsets: [], omittedHistory: 0, contextOmitted: false });

  const current = currentRequestIndex(args.messages);
  const historyCount = args.messages.length - (current === -1 ? 0 : 1);
  for (let omittedHistory = 1; omittedHistory <= historyCount; omittedHistory += 1)
    push({ toolsets: [], omittedHistory, contextOmitted: false });

  if (current !== -1 && attachedContextOf(args.messages[current].text).prefix)
    push({ toolsets: [], omittedHistory: historyCount, contextOmitted: true });
  return ladder;
}

export function degradedAgentReplayMessages(
  messages: readonly ReplayMessage[],
  degradation: AgentContextDegradation,
): ReplayMessage[] {
  const current = currentRequestIndex(messages);
  const historyIndexes = messages.flatMap((_, index) => (index === current ? [] : [index]));
  const omitted = new Set(historyIndexes.slice(0, degradation.omittedHistory));

  return messages.flatMap((message, index) => {
    if (omitted.has(index)) return [];
    if (index !== current) return [message];
    const { prefix, body } = attachedContextOf(message.text);
    const attached = degradation.contextOmitted && prefix ? AGENT_CONTEXT_OMITTED_NOTE : prefix;
    const historyNote = omitted.size > 0 ? agentHistoryOmittedNote(omitted.size) : "";
    return [{ ...message, text: `${historyNote}${attached}${body}` }];
  });
}
