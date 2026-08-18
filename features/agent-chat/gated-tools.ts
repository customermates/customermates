export function isReadOnlyTool(tool: { annotations?: Record<string, boolean> }) {
  return tool.annotations?.readOnlyHint === true;
}

type AgentApprovalPolicy = { approvalFree: true } | { approvalFreeActions: readonly string[] };

const AGENT_APPROVAL_POLICY: Record<string, AgentApprovalPolicy> = {
  connect_messaging_account: { approvalFree: true },
  create_contacts: { approvalFree: true },
  create_deals: { approvalFree: true },
  create_organizations: { approvalFree: true },
  create_services: { approvalFree: true },
  create_tasks: { approvalFree: true },
  manage_custom_columns: { approvalFreeActions: ["list", "upsert"] },
  manage_record_links: { approvalFree: true },
  manage_team: { approvalFree: true },
  manage_webhooks: { approvalFreeActions: ["list", "get", "list_deliveries", "create", "update", "resend_delivery"] },
  manage_widgets: { approvalFreeActions: ["list", "get", "create", "update"] },
  save_message_draft: { approvalFree: true },
  update_contacts: { approvalFree: true },
  update_deals: { approvalFree: true },
  update_messaging_thread: { approvalFree: true },
  update_organizations: { approvalFree: true },
  update_record_notes: { approvalFree: true },
  update_services: { approvalFree: true },
  update_tasks: { approvalFree: true },
  update_workspace_settings: { approvalFree: true },
};

export const AGENT_APPROVAL_POLICY_TOOL_NAMES = Object.keys(AGENT_APPROVAL_POLICY);

export function approvalFreeActionsForTool(name: string): readonly string[] | null {
  const policy = AGENT_APPROVAL_POLICY[name];
  return policy && "approvalFreeActions" in policy ? policy.approvalFreeActions : null;
}

export function requiresApproval(tool: { name: string; annotations?: Record<string, boolean> }, input: unknown) {
  if (isReadOnlyTool(tool)) return false;
  const policy = AGENT_APPROVAL_POLICY[tool.name];
  if (!policy) return true;
  if ("approvalFree" in policy) return false;
  const action =
    input && typeof input === "object" && !Array.isArray(input) ? (input as { action?: unknown }).action : undefined;
  return typeof action !== "string" || !policy.approvalFreeActions.includes(action);
}
