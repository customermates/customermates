import type { AgentActivityDescriptor } from "./agent-activity";

export type ApprovalTargetRequest = { toolName: string; input: unknown };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function requiresResolvedApprovalTarget(request: ApprovalTargetRequest): boolean {
  const input = object(request.input);
  if (request.toolName === "manage_data_views") return input.action === "delete";
  if (request.toolName === "manage_trash") return input.action === "delete_permanently" || input.action === "empty";
  if (request.toolName !== "mutate_crm_record") return false;
  return ["delete", "deleteMany"].includes(String(object(input.mutation).action));
}

function destructiveApprovalTargetKey(request: ApprovalTargetRequest): string | null {
  if (!requiresResolvedApprovalTarget(request)) return null;
  const input = object(request.input);
  if (request.toolName === "manage_trash") {
    const ids = Array.isArray(input.itemIds) ? input.itemIds.filter((id): id is string => typeof id === "string") : [];
    return `${request.toolName}:${String(input.action)}:${ids.sort().join(",")}`;
  }
  if (request.toolName === "manage_data_views")
    return `${request.toolName}:${String(input.surfaceKey)}:${String(input.viewKey)}`;
  const mutation = object(input.mutation);
  const refs = mutation.action === "deleteMany" ? mutation.targets : [mutation.ref];
  return `${request.toolName}:${String(mutation.action)}:${JSON.stringify(refs)}`;
}

function quotedTargetName(text: string | null): string | null {
  if (!text) return null;
  const matches = [...text.matchAll(/["“]([^"”]{1,200})["”]/gu)];
  return matches.length === 1 ? matches[0][1].trim() : null;
}

export function approvalTargetRefusal(
  request: ApprovalTargetRequest,
  activity: AgentActivityDescriptor | undefined,
  resolvedNames: readonly string[],
  seen: Set<string>,
  latestUserText: string | null,
): string | null {
  if (!requiresResolvedApprovalTarget(request)) return null;
  if (!activity?.context || resolvedNames.length === 0)
    return "The exact deletion target could not be found in the current records or Trash. Nothing was changed. Read the target again and use its exact name and ID.";
  const expectedName = quotedTargetName(latestUserText);
  if (expectedName && resolvedNames.length === 1 && resolvedNames[0] !== expectedName)
    return `The exact deletion target named "${expectedName}" was not found. Nothing was changed. Read the target again and use its current name and ID.`;
  const key = destructiveApprovalTargetKey(request);
  if (key && seen.has(key))
    return "This deletion target was already submitted for approval in this turn. Nothing was changed by this repeat call; check the previous result.";
  if (key) seen.add(key);
  return null;
}
