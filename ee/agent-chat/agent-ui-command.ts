export const AGENT_PANEL_TOOL_NAMES = ["navigate", "highlight_element", "start_tour"] as const;

export const AGENT_UI_TOOL_NAMES = ["list_ui_targets", ...AGENT_PANEL_TOOL_NAMES] as const;

export type AgentPanelToolName = (typeof AGENT_PANEL_TOOL_NAMES)[number];

export function isAgentPanelTool(toolName: string): toolName is AgentPanelToolName {
  return (AGENT_PANEL_TOOL_NAMES as readonly string[]).includes(toolName);
}

export function agentUiCommandHookToken(conversationId: string) {
  return `agent-ui-command:${conversationId}`;
}

export function toAgentUiCommandInput(toolName: string, input: unknown): Record<string, unknown> | null {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (toolName) {
    case "navigate":
      return record.typeId !== undefined || record.recordId !== undefined
        ? { typeId: record.typeId, recordId: record.recordId }
        : record.href !== undefined
          ? { href: record.href }
          : { targetId: record.targetId };
    case "highlight_element":
      return { targetId: record.targetId };
    case "start_tour":
      return { steps: record.steps };
    default:
      return null;
  }
}
