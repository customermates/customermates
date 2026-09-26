export type ObservedToolAction = { name: string; input?: unknown };

const ALWAYS_OUTBOUND_TOOLS = new Set([
  "request_support",
  "connect_messaging_account",
]);

function actionOf(tool: ObservedToolAction): unknown {
  const input = tool.input && typeof tool.input === "object" ? (tool.input as Record<string, unknown>) : {};
  return input.action;
}

export function isOutboundOrSupportAction(tool: ObservedToolAction): boolean {
  if (tool.name.startsWith("send_") || ALWAYS_OUTBOUND_TOOLS.has(tool.name)) return true;
  if (tool.name === "manage_social_relations")
    return ["invite", "accept", "cancel"].includes(String(actionOf(tool)));
  return tool.name === "linkedin_manage_sales_lists" && actionOf(tool) === "save";
}

export function isOutboundSupportOrDraftAction(tool: ObservedToolAction): boolean {
  return tool.name === "save_message_draft" || isOutboundOrSupportAction(tool);
}

export function isReadOnlyMixedToolAction(tool: ObservedToolAction): boolean {
  if (tool.name === "manage_social_relations") return actionOf(tool) === "list";
  return tool.name === "linkedin_manage_sales_lists" && ["list", "browse"].includes(String(actionOf(tool)));
}
