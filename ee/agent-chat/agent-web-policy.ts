import { isUnattendedSurface, type AgentSurface } from "./agent-surface-policy";
import { AGENT_WEB_PAGE_TOOL_NAME } from "./tool-identity";

export const AGENT_WEB_PAGE_MAX_CALLS = { chat: 3, routine: 2 } as const;
const AGENT_WEB_SOURCE_LIMIT = 8;
export const AGENT_WEB_SOURCE_MAX_LENGTH = 1_000;

export function agentWebPageCallLimit(surface: AgentSurface): number {
  return isUnattendedSurface(surface) ? AGENT_WEB_PAGE_MAX_CALLS.routine : AGENT_WEB_PAGE_MAX_CALLS.chat;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function isAgentWebTool(name: string) {
  return name === AGENT_WEB_PAGE_TOOL_NAME;
}

export function agentBatchContainsWebCall(messages: readonly unknown[] = [], toolCallId: string) {
  for (const raw of [...messages].reverse()) {
    const message = record(raw);
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const parts = message.content.map(record);
    if (!parts.some((part) => part?.type === "tool-call" && part.toolCallId === toolCallId)) continue;
    return parts.some(
      (part) => part?.type === "tool-call" && typeof part.toolName === "string" && isAgentWebTool(part.toolName),
    );
  }
  return true;
}

function unwrapJsonOutput(value: unknown): Record<string, unknown> | null {
  const result = record(value);
  if (!result || result.type === "error-text" || result.type === "error-json") return null;
  return result.type === "json" ? record(result.value) : result;
}

export function isSuccessfulAgentWebResult(value: unknown): boolean {
  const result = unwrapJsonOutput(value);
  if (!result || result.error || result.isError === true) return false;
  return result.ok === true;
}

function canonicalHttpsSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > AGENT_WEB_SOURCE_MAX_LENGTH) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function collectAgentWebSources(messages: readonly unknown[]): string[] {
  const sources = new Set<string>();

  for (const rawMessage of messages) {
    const message = record(rawMessage);
    if (!message || !Array.isArray(message.content)) continue;

    for (const rawPart of message.content) {
      const part = record(rawPart);
      if (part?.type !== "tool-result" || typeof part.toolName !== "string" || !isAgentWebTool(part.toolName)) continue;
      if (!isSuccessfulAgentWebResult(part.output)) continue;
      const url = canonicalHttpsSource(unwrapJsonOutput(part.output)?.url);
      if (url) sources.add(url);
      if (sources.size >= AGENT_WEB_SOURCE_LIMIT) return [...sources];
    }
  }

  return [...sources];
}

export function agentWebSourcesFooter(sources: readonly string[], heading: string): string {
  const canonical = new Set(sources.map(canonicalHttpsSource).filter((url): url is string => Boolean(url)));
  if (canonical.size === 0) return "";

  const links = [...canonical].slice(0, AGENT_WEB_SOURCE_LIMIT).map((source) => `- <${source}>`);

  return `\n\n### ${heading}\n${links.join("\n")}`;
}
