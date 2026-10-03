import type { AgentToolIdentity } from "./tool-identity";

import { agentToolIdentityKey, internalToolIdentity, isInternalToolIdentity } from "./tool-identity";
import { recordToolRisk } from "./record-tool-risk";

export function isReadOnlyTool(tool: { annotations?: Record<string, boolean> }) {
  return tool.annotations?.readOnlyHint === true;
}

type AgentApprovalPolicy =
  | { approvalFree: true }
  | { inputRisk: (input: unknown) => "read" | "write" | "sensitive" | null }
  | { approvalFreeActions: readonly string[]; readOnlyActions?: readonly string[] };

const INTERNAL_APPROVAL_POLICY: Record<string, AgentApprovalPolicy> = {
  configure_record_model: { inputRisk: (input) => recordToolRisk("configure_record_model", input) },
  mutate_crm_record: { inputRisk: (input) => recordToolRisk("mutate_crm_record", input) },
  cancel_crm_operation: { approvalFree: true },
  resume_crm_operation: { approvalFree: true },
  connect_messaging_account: { approvalFree: true },
  discard_message_draft: { approvalFree: true },
  manage_social_relations: {
    approvalFreeActions: ["list", "invite", "accept", "cancel"],
    readOnlyActions: ["list"],
  },
  manage_roles: { approvalFreeActions: ["read"], readOnlyActions: ["read"] },
  manage_team: { approvalFreeActions: ["update_member"] },
  manage_webhooks: {
    approvalFreeActions: ["list", "get", "list_deliveries", "create", "update"],
    readOnlyActions: ["list", "get", "list_deliveries"],
  },
  manage_widgets: { approvalFreeActions: ["list", "get", "create", "update"], readOnlyActions: ["list", "get"] },
  manage_data_views: {
    approvalFreeActions: ["surfaces", "list", "config", "create", "update", "select", "reset"],
    readOnlyActions: ["surfaces", "list", "config"],
  },
  manage_record_detail_layout: {
    approvalFreeActions: ["read", "save", "reset"],
    readOnlyActions: ["read"],
  },
  manage_conversation_records: {
    approvalFreeActions: ["read", "link", "unlink"],
    readOnlyActions: ["read"],
  },
  manage_routines: {
    approvalFreeActions: ["list", "runs", "create", "update", "pause", "run_now"],
    readOnlyActions: ["list", "runs"],
  },
  move_email_thread: { approvalFree: true },
  linkedin_manage_sales_lists: {
    approvalFreeActions: ["list", "browse", "save"],
    readOnlyActions: ["list", "browse"],
  },
  save_message_draft: { approvalFree: true },
  send_chat_message: { approvalFree: true },
  send_email: { approvalFree: true },
  update_messaging_thread: { approvalFree: true },
  update_workspace_settings: { approvalFree: true },
};

const AGENT_APPROVAL_POLICY: Record<string, AgentApprovalPolicy> = Object.fromEntries(
  Object.entries(INTERNAL_APPROVAL_POLICY).map(([name, policy]) => [
    agentToolIdentityKey(internalToolIdentity(name)),
    policy,
  ]),
);

export const AGENT_APPROVAL_POLICY_TOOL_NAMES = Object.keys(INTERNAL_APPROVAL_POLICY);

export const AGENT_DESTRUCTIVE_APPROVAL_FREE_TOOL_NAMES = ["discard_message_draft"] as const;

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
  if ("inputRisk" in policy) return !["read", "write"].includes(policy.inputRisk(input) ?? "sensitive");

  const action =
    input && typeof input === "object" && !Array.isArray(input) ? (input as { action?: unknown }).action : undefined;
  return typeof action !== "string" || !policy.approvalFreeActions.includes(action);
}
