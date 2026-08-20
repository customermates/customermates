const PENDING_APPROVAL_PREFIX = "__agent_pending__:";
const PENDING_APPROVAL_PATTERN = /^__agent_pending__:(\d+):([a-z0-9_]{1,64})$/;

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
