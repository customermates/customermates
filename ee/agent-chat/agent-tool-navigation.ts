import { dataViewNavigationHref } from "@/core/data-view/data-view-links";
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
  const proposal = DataViewProposalSchema.safeParse(record.viewProposal);
  return proposal.success ? proposal.data : null;
}
