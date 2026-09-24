export function isAgentWebTool(name: string) {
  return name === "web_search" || name === "read_public_page";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

export function isSuccessfulAgentWebResult(value: unknown): boolean {
  const result = record(value);
  if (!result || result.type === "error-text" || result.type === "error-json") return false;
  if (result.type === "json") return isSuccessfulAgentWebResult(result.value);
  if (result.ok === false || result.error || result.isError === true) return false;
  return result.ok === true || Array.isArray(result.results) || Array.isArray(result.sources);
}
