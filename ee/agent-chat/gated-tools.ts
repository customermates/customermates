import type { AgentToolIdentity } from "./tool-identity";

import { agentToolIdentityKey, internalToolIdentity, isInternalToolIdentity } from "./tool-identity";

export function isReadOnlyTool(tool: { annotations?: Record<string, boolean> }) {
  return tool.annotations?.readOnlyHint === true;
}

type AgentApprovalPolicy =
  | { approvalFree: true }
  | { approvalFreeActions: readonly string[]; readOnlyActions?: readonly string[] };

const INTERNAL_APPROVAL_POLICY: Record<string, AgentApprovalPolicy> = {
  connect_messaging_account: { approvalFree: true },
  create_contacts: { approvalFree: true },
  create_deals: { approvalFree: true },
  create_organizations: { approvalFree: true },
  create_services: { approvalFree: true },
  create_tasks: { approvalFree: true },
  manage_custom_columns: { approvalFreeActions: ["list", "upsert"], readOnlyActions: ["list"] },
  manage_record_links: { approvalFree: true },
  manage_social_relations: { approvalFreeActions: ["list"], readOnlyActions: ["list"] },
  manage_team: { approvalFreeActions: ["update_member"] },
  manage_webhooks: {
    approvalFreeActions: ["list", "get", "list_deliveries", "create", "update"],
    readOnlyActions: ["list", "get", "list_deliveries"],
  },
  manage_widgets: { approvalFreeActions: ["list", "get", "create", "update"], readOnlyActions: ["list", "get"] },
  linkedin_manage_sales_lists: {
    approvalFreeActions: ["list", "browse"],
    readOnlyActions: ["list", "browse"],
  },
  save_message_draft: { approvalFree: true },
  send_chat_message: { approvalFree: true },
  send_email: { approvalFree: true },
  update_contacts: { approvalFree: true },
  update_deals: { approvalFree: true },
  update_messaging_thread: { approvalFree: true },
  update_organizations: { approvalFree: true },
  update_record_notes: { approvalFree: true },
  update_services: { approvalFree: true },
  update_tasks: { approvalFree: true },
  update_workspace_settings: { approvalFree: true },
};

const AGENT_APPROVAL_POLICY: Record<string, AgentApprovalPolicy> = Object.fromEntries(
  Object.entries(INTERNAL_APPROVAL_POLICY).map(([name, policy]) => [
    agentToolIdentityKey(internalToolIdentity(name)),
    policy,
  ]),
);

export const AGENT_APPROVAL_POLICY_TOOL_NAMES = Object.keys(INTERNAL_APPROVAL_POLICY);

function policyFor(identity: AgentToolIdentity): AgentApprovalPolicy | undefined {
  if (!isInternalToolIdentity(identity)) return undefined;
  return AGENT_APPROVAL_POLICY[agentToolIdentityKey(identity)];
}

export function approvalFreeActionsForTool(identity: AgentToolIdentity): readonly string[] | null {
  const policy = policyFor(identity);
  return policy && "approvalFreeActions" in policy ? policy.approvalFreeActions : null;
}

export function readOnlyActionsForTool(identity: AgentToolIdentity): readonly string[] | null {
  const policy = policyFor(identity);
  return policy && "readOnlyActions" in policy ? (policy.readOnlyActions ?? null) : null;
}

export function requiresApproval(
  identity: AgentToolIdentity,
  tool: { annotations?: Record<string, boolean> },
  input: unknown,
) {
  if (!isInternalToolIdentity(identity)) return true;
  if (isReadOnlyTool(tool)) return false;

  const policy = policyFor(identity);
  if (!policy) return true;
  if ("approvalFree" in policy) return false;

  const action =
    input && typeof input === "object" && !Array.isArray(input) ? (input as { action?: unknown }).action : undefined;
  return typeof action !== "string" || !policy.approvalFreeActions.includes(action);
}
