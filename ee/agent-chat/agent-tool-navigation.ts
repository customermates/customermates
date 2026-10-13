import { dataViewNavigationHref } from "@/core/data-view/data-view-links";
import { dataViewPath } from "@/core/data-view/data-view-paths";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { DataViewProposalSchema } from "@/core/data-view/data-view-proposal.schema";

function unwrapToolOutput(output: unknown) {
  return output && typeof output === "object" && !Array.isArray(output) && "value" in output
    ? (output as { value: unknown }).value
    : output;
}

export function agentToolSavedViewHref(toolName: string | undefined, output: unknown) {
  if (toolName !== "manage_data_views") return null;
  const result = unwrapToolOutput(output);
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as { ok?: unknown; navigation?: unknown };
  if (record.ok !== true || !record.navigation || typeof record.navigation !== "object") return null;
  const navigation = record.navigation as { kind?: unknown; href?: unknown };
  if (navigation.kind !== "saved-view") return null;
  return dataViewNavigationHref(navigation.href);
}

export function agentToolViewProposal(toolName: string | undefined, output: unknown) {
  if (toolName !== "manage_data_views") return null;
  const result = unwrapToolOutput(output);
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as { ok?: unknown; viewProposal?: unknown };
  if (record.ok !== true) return null;
  const proposal = record.viewProposal;
  return proposal && typeof proposal === "object" && !Array.isArray(proposal)
    ? (proposal as Record<string, unknown>)
    : null;
}

export function agentToolProposalHref(toolName: string | undefined, output: unknown): string | null {
  const proposal = DataViewProposalSchema.safeParse(agentToolViewProposal(toolName, output));
  if (!proposal.success) return null;
  const path = dataViewPath(proposal.data.surfaceKey);
  return path ? dataViewNavigationHref(`${path}?view=${proposal.data.viewKey ?? ALL_VIEW_KEY}`) : null;
}
