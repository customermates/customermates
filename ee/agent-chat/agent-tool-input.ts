export type AgentToolInputResult = { ok: true; input: unknown } | { ok: false; result: string };

export function createAgentToolInputResolver(
  normalize: (toolName: string, input: unknown) => Promise<AgentToolInputResult>,
) {
  const entries = new Map<
    string,
    { toolName: string; source: string | undefined; conflicted: boolean; result: Promise<AgentToolInputResult> }
  >();

  return async (toolName: string, toolCallId: string, input: unknown): Promise<AgentToolInputResult> => {
    const source = JSON.stringify(input);
    let entry = entries.get(toolCallId);
    if (entry && (entry.toolName !== toolName || entry.source !== source)) entry.conflicted = true;
    if (!entry) {
      entry = { toolName, source, conflicted: false, result: normalize(toolName, input) };
      entries.set(toolCallId, entry);
    }

    const result = await entry.result;
    return entry.conflicted
      ? { ok: false, result: "The tool call identity was reused with different input, so this action was not run." }
      : result;
  };
}
