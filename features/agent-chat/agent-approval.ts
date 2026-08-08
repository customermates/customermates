const PENDING_APPROVAL_PREFIX = "__agent_pending__:";
const PENDING_APPROVAL_PATTERN = /^__agent_pending__:(\d+):([a-z0-9_]{1,64})$/;

export const REMEMBERABLE_AGENT_TOOL_NAMES = [
  "create_contacts",
  "update_contacts",
  "create_organizations",
  "update_organizations",
  "create_deals",
  "update_deals",
  "create_services",
  "update_services",
  "create_tasks",
  "update_tasks",
] as const;

const REMEMBERABLE_AGENT_TOOLS = new Set<string>(REMEMBERABLE_AGENT_TOOL_NAMES);

export function isRememberableAgentTool(toolName: string) {
  return REMEMBERABLE_AGENT_TOOLS.has(toolName);
}

export function sanitizePreAuthorizedAgentTools(toolNames: readonly string[]) {
  return Array.from(new Set(toolNames.filter(isRememberableAgentTool)));
}

export function pendingAgentApprovalToolName(toolName: string, expiresAt: Date) {
  if (!/^[a-z0-9_]{1,64}$/.test(toolName)) throw new Error("Invalid agent approval tool name.");
  return `${PENDING_APPROVAL_PREFIX}${expiresAt.getTime()}:${toolName}`;
}

export function parsePendingAgentApprovalToolName(value: string) {
  const match = PENDING_APPROVAL_PATTERN.exec(value);
  if (!match) return null;

  const expiresAtMs = Number(match[1]);
  if (!Number.isSafeInteger(expiresAtMs)) return null;
  return { expiresAt: new Date(expiresAtMs), toolName: match[2] };
}

export function isPendingAgentApprovalToolName(value: string) {
  return value.startsWith(PENDING_APPROVAL_PREFIX);
}
